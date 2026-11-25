/* ======================================================
   MONTESERIN ACADEMY - PDF DOCUMENT STORE
   Gestión unificada de documentos PDF:
   - Persistencia local en IndexedDB (sobrevive a recargas y resyncs)
   - Lectura de docs_manifest.json (asignación dinámica + ?v=updatedAt)
   - Respaldo automático con customAssetsBundle.js para GitHub Pages
   ====================================================== */

import { registryCatalog } from '../ui/registry/registryCatalog.js';
import {
    CUSTOM_ASSETS_BUNDLE_MAX_FILE_BYTES,
    CUSTOM_ASSETS_BUNDLE_UPDATED_AT,
    BUNDLED_CUSTOM_MODELS_META,
    BUNDLED_CUSTOM_DOCS_META,
    BUNDLED_CUSTOM_MODELS,
    BUNDLED_CUSTOM_DOCS,
    getBundledCustomDocDataUri
} from './customAssetsBundle.js';

const DB_NAME = 'monteserin_pdf_store_v1';
const DB_VERSION = 1;
const STORE_PDFS = 'pdfs';
const STORE_META = 'meta';
const BINDINGS_META_KEY = 'catalogBindings';

let dbPromise = null;
let initPromise = null;

// Estado en memoria sincronizado con IndexedDB y docs_manifest.json
let serverManifest = {};
let localPdfs = new Map();       // lowerFilename -> record
let localBindings = {};          // catalogId -> { filename, updatedAt }

function extractFilename(urlOrName) {
    if (!urlOrName || typeof urlOrName !== 'string') return '';
    const clean = urlOrName.split('#')[0].split('?')[0].trim();
    if (!clean || clean.startsWith('data:') || clean.startsWith('blob:')) return '';
    const parts = clean.split('/');
    const last = parts[parts.length - 1] || '';
    try {
        return decodeURIComponent(last);
    } catch {
        return last;
    }
}

export function isPdfSource(urlOrName) {
    if (!urlOrName || typeof urlOrName !== 'string') return false;
    return /\.pdf(\?.*|#.*)?$/i.test(urlOrName) || urlOrName.startsWith('data:application/pdf');
}

export function base64ToUint8Array(base64OrDataUri) {
    const clean = String(base64OrDataUri || '').replace(/^data:.*?;base64,/i, '').trim();
    const binary = atob(clean);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export function base64ToPdfBlob(base64OrDataUri) {
    const bytes = base64ToUint8Array(base64OrDataUri);
    return new Blob([bytes], { type: 'application/pdf' });
}

function openDatabase() {
    if (typeof indexedDB === 'undefined') {
        return Promise.resolve(null);
    }
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve) => {
        try {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_PDFS)) {
                    db.createObjectStore(STORE_PDFS, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(STORE_META)) {
                    db.createObjectStore(STORE_META, { keyPath: 'key' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });

    return dbPromise;
}

async function loadIndexedDbState() {
    const db = await openDatabase();
    if (!db) return;

    await new Promise((resolve) => {
        try {
            const tx = db.transaction([STORE_PDFS, STORE_META], 'readonly');
            const pdfStore = tx.objectStore(STORE_PDFS);
            const metaStore = tx.objectStore(STORE_META);

            const pdfReq = pdfStore.getAll();
            const bindReq = metaStore.get(BINDINGS_META_KEY);

            pdfReq.onsuccess = () => {
                localPdfs.clear();
                const rows = Array.isArray(pdfReq.result) ? pdfReq.result : [];
                rows.forEach((row) => {
                    if (row && row.filename && row.base64Data) {
                        localPdfs.set(String(row.filename).toLowerCase(), row);
                    }
                });
            };

            bindReq.onsuccess = () => {
                const res = bindReq.result;
                localBindings = (res && res.bindings && typeof res.bindings === 'object') ? { ...res.bindings } : {};
            };

            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        } catch {
            resolve();
        }
    });
}

export async function refreshManifestFromServer() {
    try {
        const res = await fetch(`./assets/docs/docs_manifest.json?v=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return serverManifest;
        const ctype = (res.headers.get('content-type') || '').toLowerCase();
        if (!ctype.includes('application/json') && !ctype.includes('text/plain')) return serverManifest;
        const parsed = await res.json();
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            serverManifest = parsed;
        }
    } catch {
        // En offline o sin manifiesto, mantenemos el estado actual
    }
    return serverManifest;
}

export function setServerManifestCache(manifestObj) {
    if (manifestObj && typeof manifestObj === 'object' && !Array.isArray(manifestObj)) {
        serverManifest = { ...manifestObj };
    }
}

export function getServerManifestCache() {
    return { ...serverManifest };
}

export async function initPdfDocumentStore() {
    if (!initPromise) {
        initPromise = Promise.all([
            loadIndexedDbState(),
            refreshManifestFromServer()
        ]).catch(() => {});
    }
    await initPromise;
}

export async function saveLocalPdfOverride({
    filename,
    base64Data,
    size,
    updatedAt = Date.now(),
    missionId = 'unassigned',
    missionLabel = '',
    title = '',
    catalogId = ''
}) {
    await initPdfDocumentStore();
    if (!filename || !base64Data) return null;

    const cleanName = extractFilename(filename) || filename;
    const key = cleanName.toLowerCase();
    const normalizedDataUri = String(base64Data).startsWith('data:')
        ? String(base64Data)
        : `data:application/pdf;base64,${String(base64Data).replace(/^data:.*?;base64,/i, '')}`;

    const record = {
        key,
        filename: cleanName,
        base64Data: normalizedDataUri,
        size: Number(size) || base64ToUint8Array(normalizedDataUri).length,
        updatedAt: Number(updatedAt) || Date.now(),
        missionId: String(missionId || 'unassigned'),
        missionLabel: String(missionLabel || ''),
        title: String(title || ''),
        catalogId: String(catalogId || '')
    };

    localPdfs.set(key, record);

    const db = await openDatabase();
    if (db) {
        await new Promise((resolve) => {
            try {
                const tx = db.transaction([STORE_PDFS], 'readwrite');
                tx.objectStore(STORE_PDFS).put(record);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch {
                resolve();
            }
        });
    }

    if (catalogId) {
        await setLocalCatalogBinding(catalogId, cleanName, record.updatedAt);
    }

    return record;
}

export async function updateLocalPdfMetadata(filename, { missionId, missionLabel, title, catalogId } = {}) {
    await initPdfDocumentStore();
    const cleanName = extractFilename(filename) || filename;
    const key = cleanName.toLowerCase();
    const existing = localPdfs.get(key);

    if (existing) {
        if (missionId !== undefined) existing.missionId = String(missionId || 'unassigned');
        if (missionLabel !== undefined) existing.missionLabel = String(missionLabel || '');
        if (title !== undefined) existing.title = String(title || '');
        if (catalogId !== undefined) existing.catalogId = String(catalogId || '');
        existing.updatedAt = Math.max(Number(existing.updatedAt) || 0, Date.now());

        const db = await openDatabase();
        if (db) {
            await new Promise((resolve) => {
                try {
                    const tx = db.transaction([STORE_PDFS], 'readwrite');
                    tx.objectStore(STORE_PDFS).put(existing);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                } catch {
                    resolve();
                }
            });
        }
    }

    if (catalogId !== undefined) {
        if (catalogId) {
            await setLocalCatalogBinding(catalogId, cleanName, Date.now());
        } else {
            await clearLocalBindingForFilename(cleanName);
        }
    }
}

export async function setLocalCatalogBinding(catalogId, filename, updatedAt = Date.now()) {
    await initPdfDocumentStore();
    if (!catalogId) return;
    const cleanName = extractFilename(filename) || filename;
    const ts = Number(updatedAt) || Date.now();

    // Limpiar si este archivo estaba enlazado a otro catalogId localmente
    Object.keys(localBindings).forEach((cid) => {
        if (cid !== catalogId && localBindings[cid]?.filename?.toLowerCase() === cleanName.toLowerCase()) {
            localBindings[cid] = { filename: '', updatedAt: ts };
        }
    });

    localBindings[catalogId] = { filename: cleanName, updatedAt: ts };

    const db = await openDatabase();
    if (db) {
        await new Promise((resolve) => {
            try {
                const tx = db.transaction([STORE_META], 'readwrite');
                tx.objectStore(STORE_META).put({ key: BINDINGS_META_KEY, bindings: localBindings });
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch {
                resolve();
            }
        });
    }
}

export async function clearLocalBindingForFilename(filename) {
    await initPdfDocumentStore();
    const cleanLower = (extractFilename(filename) || filename || '').toLowerCase();
    if (!cleanLower) return;
    let changed = false;
    const now = Date.now();
    Object.keys(localBindings).forEach((cid) => {
        if (localBindings[cid]?.filename?.toLowerCase() === cleanLower) {
            localBindings[cid] = { filename: '', updatedAt: now };
            changed = true;
        }
    });
    if (!changed) return;

    const db = await openDatabase();
    if (db) {
        await new Promise((resolve) => {
            try {
                const tx = db.transaction([STORE_META], 'readwrite');
                tx.objectStore(STORE_META).put({ key: BINDINGS_META_KEY, bindings: localBindings });
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch {
                resolve();
            }
        });
    }
}

export async function removeLocalPdfOverride(filename) {
    await initPdfDocumentStore();
    const cleanLower = (extractFilename(filename) || filename || '').toLowerCase();
    if (!cleanLower) return;
    localPdfs.delete(cleanLower);

    const db = await openDatabase();
    if (db) {
        await new Promise((resolve) => {
            try {
                const tx = db.transaction([STORE_PDFS], 'readwrite');
                tx.objectStore(STORE_PDFS).delete(cleanLower);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch {
                resolve();
            }
        });
    }
}

export function getLocalPdfRecord(filename) {
    const cleanLower = (extractFilename(filename) || filename || '').toLowerCase();
    return cleanLower ? (localPdfs.get(cleanLower) || null) : null;
}

export function getAllLocalPdfRecords() {
    return Array.from(localPdfs.values());
}

export function getPdfCatalogSlots() {
    const slots = [];
    Object.entries(registryCatalog || {}).forEach(([catalogId, entry]) => {
        if (!entry || entry.type !== 'document' || catalogId === 'aspirantCard') return;
        const looksLikePdf = isPdfSource(entry.documentImage) || /\.pdf$/i.test(String(entry.downloadFilename || ''));
        if (!looksLikePdf) return;
        slots.push({
            catalogId,
            title: entry.title || catalogId,
            defaultFilename: extractFilename(entry.documentImage || ''),
            downloadFilename: entry.downloadFilename || ''
        });
    });
    return slots;
}

/**
 * Resuelve qué nombre de archivo PDF le corresponde actualmente a un slot del catálogo,
 * comparando enlaces en IndexedDB, docs_manifest.json y el valor por defecto de registryCatalog.js.
 */
export function resolveFilenameForCatalogId(catalogId) {
    if (!catalogId) return '';

    const localBind = localBindings[catalogId];
    let manifestMatch = null;

    for (const [fname, meta] of Object.entries(serverManifest || {})) {
        if (meta && meta.catalogId === catalogId) {
            const ts = Number(meta.updatedAt) || 0;
            if (!manifestMatch || ts > manifestMatch.updatedAt) {
                manifestMatch = { filename: fname, updatedAt: ts };
            }
        }
    }

    const localTs = Number(localBind?.updatedAt) || 0;
    const manifestTs = Number(manifestMatch?.updatedAt) || 0;

    if (localBind && localTs > manifestTs) {
        if (localBind.filename) return localBind.filename;
    }
    if (manifestMatch && manifestMatch.filename) {
        return manifestMatch.filename;
    }

    const entry = registryCatalog?.[catalogId];
    return extractFilename(entry?.documentImage || '');
}

/**
 * Devuelve un mapa filenameLower -> { catalogId, title, isExplicit } para F9.
 */
export function getActivePdfCatalogLinkMap() {
    const map = new Map();
    const slots = getPdfCatalogSlots();

    slots.forEach((slot) => {
        const activeFname = resolveFilenameForCatalogId(slot.catalogId);
        if (!activeFname) return;
        const isExplicit = Boolean(
            (localBindings[slot.catalogId]?.filename) ||
            Object.values(serverManifest || {}).some((m) => m?.catalogId === slot.catalogId)
        );
        map.set(activeFname.toLowerCase(), {
            catalogId: slot.catalogId,
            title: slot.title,
            downloadFilename: slot.downloadFilename || activeFname,
            isExplicit
        });
    });

    return map;
}

/**
 * Indica si existe una copia local en IndexedDB más reciente que la del servidor.
 */
export function isLocalOverrideNewerThanServer(filename, serverDocMeta = null) {
    const localRec = getLocalPdfRecord(filename);
    if (!localRec) return false;
    if (!serverDocMeta) return true;
    const manifestEntry = serverManifest[localRec.filename] || serverManifest[filename] || null;
    const serverTs = Math.max(
        Number(manifestEntry?.updatedAt) || 0,
        Number(serverDocMeta?.manifestUpdatedAt) || 0,
        Number(CUSTOM_ASSETS_BUNDLE_UPDATED_AT) || 0
    );
    return Number(localRec.updatedAt) > serverTs + 1500;
}

/**
 * Resuelve la fuente final de un documento para abrirlo o descargarlo.
 */
export async function resolveDocumentAsset({ catalogId = '', defaultSrc = '', downloadFilename = '' } = {}) {
    await initPdfDocumentStore();

    const srcStr = String(defaultSrc || '');
    const slotDefaultSrc = catalogId && registryCatalog?.[catalogId]?.documentImage
        ? registryCatalog[catalogId].documentImage
        : srcStr;
    const effectiveDefault = srcStr || slotDefaultSrc;

    if (!isPdfSource(effectiveDefault) && !(catalogId && getPdfCatalogSlots().some((s) => s.catalogId === catalogId))) {
        return {
            isPdf: false,
            url: effectiveDefault,
            filename: extractFilename(effectiveDefault),
            downloadFilename: downloadFilename || extractFilename(effectiveDefault) || 'documento',
            sourceType: 'static'
        };
    }

    const boundFilename = catalogId ? resolveFilenameForCatalogId(catalogId) : '';
    const targetFilename = boundFilename || extractFilename(effectiveDefault);

    const localRec = getLocalPdfRecord(targetFilename);
    const manifestEntry = serverManifest[targetFilename] || null;
    const serverTs = Math.max(Number(manifestEntry?.updatedAt) || 0, Number(CUSTOM_ASSETS_BUNDLE_UPDATED_AT) || 0);
    const localTs = Number(localRec?.updatedAt) || 0;
    const useLocalBytes = Boolean(localRec && localRec.base64Data && localTs >= serverTs);

    const versionTs = Math.max(localTs, serverTs, 1);
    const cleanUrl = targetFilename ? `./assets/docs/${encodeURIComponent(targetFilename)}?v=${versionTs}` : effectiveDefault;
    const bundleDataUri = getBundledCustomDocDataUri(targetFilename);

    let finalDownloadName = downloadFilename || '';
    if (!finalDownloadName) {
        finalDownloadName = targetFilename || 'documento.pdf';
    }

    return {
        isPdf: true,
        filename: targetFilename,
        url: cleanUrl,
        localBase64: useLocalBytes ? localRec.base64Data : null,
        bundleDataUri: bundleDataUri || null,
        downloadFilename: finalDownloadName,
        updatedAt: versionTs,
        sourceType: useLocalBytes ? 'indexeddb' : 'server'
    };
}

/**
 * Descarga el documento resuelto (usando copia local IndexedDB, servidor sin caché o bundle fallback).
 */
export async function triggerResolvedDocumentDownload({ catalogId = '', defaultSrc = '', downloadFilename = '' } = {}) {
    const resolved = await resolveDocumentAsset({ catalogId, defaultSrc, downloadFilename });
    const finalName = resolved.downloadFilename || resolved.filename || 'documento.pdf';

    if (!resolved.isPdf) {
        const link = document.createElement('a');
        link.href = resolved.url;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
    }

    let blob = null;

    if (resolved.localBase64) {
        blob = base64ToPdfBlob(resolved.localBase64);
    } else {
        try {
            const res = await fetch(resolved.url, { cache: 'no-cache' });
            const ctype = (res.headers.get('content-type') || '').toLowerCase();
            if (res.ok && !ctype.includes('text/html')) {
                const buf = await res.arrayBuffer();
                if (buf && buf.byteLength > 0) {
                    blob = new Blob([buf], { type: 'application/pdf' });
                }
            }
        } catch {
            // Intentamos fallback bundle
        }

        if (!blob && resolved.bundleDataUri) {
            blob = base64ToPdfBlob(resolved.bundleDataUri);
        }
    }

    if (!blob) {
        const link = document.createElement('a');
        link.href = resolved.url;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = finalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
}

/**
 * Construye los archivos exportables (docs_manifest.json + customAssetsBundle.js)
 * combinando el estado del servidor e IndexedDB para llevarlos a GitHub/Proyecto.
 */
export async function buildExportableDocsPackage(serverDocsList = []) {
    await initPdfDocumentStore();
    const now = Date.now();
    const mergedManifest = { ...(serverManifest || {}) };
    const mergedDocsData = { ...(BUNDLED_CUSTOM_DOCS || {}) };
    const mergedDocsMeta = { ...(BUNDLED_CUSTOM_DOCS_META || {}) };
    const localOnlyFiles = [];

    // 1. Incluir metadatos de archivos del servidor conocidos
    (serverDocsList || []).forEach((doc) => {
        if (!doc || !doc.filename) return;
        const prev = mergedManifest[doc.filename] || {};
        mergedManifest[doc.filename] = {
            missionId: doc.missionId || prev.missionId || 'unassigned',
            missionLabel: doc.missionLabel || prev.missionLabel || 'Sin misión asignada',
            title: doc.title ?? prev.title ?? '',
            ...(doc.catalogId || prev.catalogId ? { catalogId: doc.catalogId || prev.catalogId } : {}),
            updatedAt: Number(doc.manifestUpdatedAt || prev.updatedAt || now)
        };
    });

    // 2. Superponer registros locales de IndexedDB (archivos nuevos o reemplazados)
    localPdfs.forEach((rec) => {
        const prev = mergedManifest[rec.filename] || {};
        const prevTs = Number(prev.updatedAt) || 0;
        const recTs = Number(rec.updatedAt) || now;
        if (recTs >= prevTs) {
            mergedManifest[rec.filename] = {
                missionId: rec.missionId || prev.missionId || 'unassigned',
                missionLabel: rec.missionLabel || prev.missionLabel || 'Sin misión asignada',
                title: rec.title || prev.title || '',
                ...(rec.catalogId || prev.catalogId ? { catalogId: rec.catalogId || prev.catalogId } : {}),
                updatedAt: recTs
            };

            const size = Number(rec.size) || base64ToUint8Array(rec.base64Data).length;
            const skippedOversize = size > CUSTOM_ASSETS_BUNDLE_MAX_FILE_BYTES;
            mergedDocsMeta[rec.filename] = {
                filename: rec.filename,
                size,
                skippedOversize
            };
            if (!skippedOversize) {
                mergedDocsData[rec.filename] = rec.base64Data;
            }
            localOnlyFiles.push({
                filename: rec.filename,
                size,
                base64Data: rec.base64Data,
                updatedAt: recTs
            });
        }
    });

    // 3. Aplicar enlaces de catálogo más recientes de IndexedDB
    Object.entries(localBindings || {}).forEach(([cid, bind]) => {
        if (!bind) return;
        const bindTs = Number(bind.updatedAt) || 0;
        // Limpiar si el manifest tenía otro archivo con ese catalogId más viejo
        Object.keys(mergedManifest).forEach((fname) => {
            if (mergedManifest[fname]?.catalogId === cid && fname.toLowerCase() !== String(bind.filename || '').toLowerCase()) {
                if ((Number(mergedManifest[fname].updatedAt) || 0) <= bindTs) {
                    delete mergedManifest[fname].catalogId;
                }
            }
        });
        if (bind.filename && mergedManifest[bind.filename]) {
            if ((Number(mergedManifest[bind.filename].updatedAt) || 0) <= bindTs) {
                mergedManifest[bind.filename].catalogId = cid;
                mergedManifest[bind.filename].updatedAt = bindTs;
            }
        }
    });

    const manifestJson = JSON.stringify(mergedManifest, null, 2) + '\n';

    const bundleJs = `/* ======================================================
   MONTESERIN ACADEMY - CUSTOM ASSETS FALLBACK BUNDLE (AUTO-GENERATED)
   Contiene copias Data-URI Base64 en texto plano (.js) de modelos .GLB/.GLTF
   y documentos .PDF personalizados para garantizar disponibilidad total en
   GitHub Pages aunque el sincronizador omita binarios creados en tiempo de ejecución.
   Regenerado automáticamente por vite.config.ts al subir, borrar u hornear.
   ====================================================== */

export const CUSTOM_ASSETS_BUNDLE_MAX_FILE_BYTES = ${CUSTOM_ASSETS_BUNDLE_MAX_FILE_BYTES};
export const CUSTOM_ASSETS_BUNDLE_UPDATED_AT = ${now};

export const BUNDLED_CUSTOM_MODELS_META = ${JSON.stringify(BUNDLED_CUSTOM_MODELS_META || {}, null, 4)};
export const BUNDLED_CUSTOM_DOCS_META = ${JSON.stringify(mergedDocsMeta, null, 4)};

export const BUNDLED_CUSTOM_MODELS = ${JSON.stringify(BUNDLED_CUSTOM_MODELS || {}, null, 4)};
export const BUNDLED_CUSTOM_DOCS = ${JSON.stringify(mergedDocsData, null, 4)};

function extractAssetFilename(urlOrFilename) {
    if (!urlOrFilename || typeof urlOrFilename !== "string") return "";
    const noHash = urlOrFilename.split("#")[0].split("?")[0].trim();
    if (!noHash || noHash.startsWith("data:") || noHash.startsWith("blob:")) return "";
    const parts = noHash.split("/");
    const last = parts[parts.length - 1] || "";
    try {
        return decodeURIComponent(last);
    } catch (_) {
        return last;
    }
}

function findInBundleMap(map, urlOrFilename) {
    const fname = extractAssetFilename(urlOrFilename);
    if (!fname || !map) return null;
    if (map[fname]) return map[fname];
    const lower = fname.toLowerCase();
    for (const key of Object.keys(map)) {
        if (key.toLowerCase() === lower) return map[key];
    }
    return null;
}

export function getBundledCustomModelDataUri(urlOrFilename) {
    return findInBundleMap(BUNDLED_CUSTOM_MODELS, urlOrFilename);
}

export function getBundledCustomDocDataUri(urlOrFilename) {
    return findInBundleMap(BUNDLED_CUSTOM_DOCS, urlOrFilename);
}

export function getBundledCustomDocsList() {
    return Object.keys(BUNDLED_CUSTOM_DOCS_META).map((fname) => {
        const meta = BUNDLED_CUSTOM_DOCS_META[fname] || {};
        return {
            filename: fname,
            url: "./assets/docs/" + encodeURIComponent(fname),
            assetPath: "assets/docs/" + fname,
            size: Number(meta.size || 0),
            updatedAt: CUSTOM_ASSETS_BUNDLE_UPDATED_AT,
            inAssets: true,
            inPublic: true,
            inBundle: Boolean(BUNDLED_CUSTOM_DOCS[fname]),
            skippedOversize: Boolean(meta.skippedOversize)
        };
    }).sort((a, b) => a.filename.localeCompare(b.filename));
}
`;

    return {
        manifestJson,
        bundleJs,
        localOnlyFiles,
        updatedAt: now
    };
}
