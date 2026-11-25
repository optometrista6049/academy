/* ======================================================
   MONTESERIN ACADEMY - ASSET MANAGER (OPCIÓN 1)
   Gestor unificado con fuente única en public/assets/:
   - Hash SHA-256 automático por build (virtual:repo-assets)
   - Indicadores reales: 🟢 En repositorio vs 🟡 Solo local / Modificado
   - Ranuras aisladas: Logo, Carnet, PDFs por Misión y Modelos 3D (.GLB)
   ====================================================== */

import { registryCatalog } from '../ui/registry/registryCatalog.js';
import { equipItem, loadGLBEquipment } from '../player/playerEquipment.js';
import { showDevModalDialog, escapeHtml } from './devModalDialog.js';
import { showDevToast } from './devPanel.js';
import { missions } from '../systems/missions/missionData.js';
import {
    resolveVersionedAssetUrl,
    getRepoAssetHashInfo,
    getRepoAssetHashesMap,
    getRepoBaselineDocsManifest,
    getRepoBaselineModelsList,
    fetchLiveRepoAssetsStatus
} from '../systems/repoAssetResolver.js';
import {
    initPdfDocumentStore,
    setServerManifestCache,
    saveLocalPdfOverride,
    updateLocalPdfMetadata,
    setLocalCatalogBinding,
    clearLocalBindingForFilename,
    removeLocalPdfOverride,
    getLocalPdfRecord,
    getAllLocalPdfRecords,
    getPdfCatalogSlots,
    getActivePdfCatalogLinkMap,
    isLocalOverrideNewerThanServer,
    buildExportableDocsPackage,
    base64ToPdfBlob
} from '../systems/pdfDocumentStore.js';
import {
    uploadLocalModelToServer,
    registerUploadedModel,
    getUploadedModelsCatalog,
    deleteUploadedModel,
    getGlbFromLocalCache,
    normalizeCustomModelUrl
} from '../systems/worldObjectsManager.js';

const LOGO_ASSET_PATH = 'assets/ui/monteserin_academy_logo_clean.png';
const CARNET_ASSET_PATH = 'assets/ui/ASPIRANTE.jpg';

const DEFAULT_KNOWN_PDF_META = {
    'guia-higienes-postural-2.pdf': {
        missionId: 'mission002',
        missionLabel: 'Misión 2: El Registro de Entrada',
        title: 'Guía de Higiene Visual y Postural'
    },
    'control_tiempo.pdf': {
        missionId: 'mission002',
        missionLabel: 'Misión 2: El Registro de Entrada',
        title: 'Sistema de Control de Tiempo'
    }
};

let existingServerPdfs = [];
let existingModelsList = [];
let liveRepoStatusCache = null;

function normalizeMissionId(rawId) {
    const val = String(rawId || '').trim();
    if (!val || val === 'unassigned') return 'unassigned';
    const numMatch = val.match(/^(?:misi[oó]n\s*|mission\s*|m)(\d{1,3})$/i);
    if (numMatch) {
        return `mission${String(Number(numMatch[1])).padStart(3, '0')}`;
    }
    return val.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getMissionNumber(missionId) {
    const match = String(missionId || '').match(/^mission(\d+)$/i);
    return match ? Number(match[1]) : null;
}

function getMissionPrefix(missionId) {
    const num = getMissionNumber(missionId);
    if (!num) return '';
    return `m${String(num).padStart(2, '0')}_`;
}

function stripMissionPrefix(filename) {
    return String(filename || '').replace(/^m\d{2,3}_/i, '');
}

function formatDefaultMissionLabel(missionId, fallbackLabel = '') {
    if (!missionId || missionId === 'unassigned') return 'Sin misión asignada / General';
    if (missions && missions[missionId]?.title) {
        const num = getMissionNumber(missionId);
        const rawTitle = missions[missionId].title;
        if (num && !/^misi[oó]n\s+\d+/i.test(rawTitle)) {
            return `Misión ${num}: ${rawTitle}`;
        }
        return rawTitle;
    }
    const num = getMissionNumber(missionId);
    if (num) return `Misión ${num} (Próxima)`;
    return fallbackLabel || missionId;
}

function buildMissionChoices(docs = []) {
    const map = new Map();

    Object.values(missions || {}).forEach((m) => {
        if (!m || !m.id) return;
        map.set(m.id, {
            id: m.id,
            label: formatDefaultMissionLabel(m.id, m.title),
            isOfficial: true
        });
    });

    ['mission003', 'mission004', 'mission005'].forEach((upcomingId) => {
        if (!map.has(upcomingId)) {
            map.set(upcomingId, {
                id: upcomingId,
                label: formatDefaultMissionLabel(upcomingId),
                isOfficial: false
            });
        }
    });

    (docs || []).forEach((doc) => {
        const mId = normalizeMissionId(doc.missionId);
        if (!mId || mId === 'unassigned') return;
        if (!map.has(mId)) {
            map.set(mId, {
                id: mId,
                label: doc.missionLabel || formatDefaultMissionLabel(mId),
                isOfficial: Boolean(missions && missions[mId])
            });
        }
    });

    const sorted = Array.from(map.values()).sort((a, b) => {
        const na = getMissionNumber(a.id);
        const nb = getMissionNumber(b.id);
        if (na !== null && nb !== null) return na - nb;
        if (na !== null) return -1;
        if (nb !== null) return 1;
        return a.label.localeCompare(b.label);
    });

    sorted.push({
        id: 'unassigned',
        label: 'Sin misión asignada / General',
        isOfficial: false
    });

    return sorted;
}

function buildRegistryPdfLinkMap() {
    return getActivePdfCatalogLinkMap();
}

function getEffectiveDocMeta(doc) {
    const fname = doc?.filename || '';
    const lower = fname.toLowerCase();
    const known = DEFAULT_KNOWN_PDF_META[lower];
    let missionId = normalizeMissionId(doc?.missionId);
    if (missionId === 'unassigned') {
        if (known) {
            missionId = known.missionId;
        } else {
            const pref = lower.match(/^m(\d{2,3})_/);
            if (pref) {
                missionId = `mission${String(Number(pref[1])).padStart(3, '0')}`;
            }
        }
    }
    const missionLabel = formatDefaultMissionLabel(missionId, doc?.missionLabel || known?.missionLabel || '');
    const title = String(doc?.title || known?.title || '').trim();
    return { missionId, missionLabel, title };
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function normalizePdfFilenameInput(raw) {
    let val = String(raw || '').trim();
    if (!val) return '';
    val = val.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
    if (!val) return '';
    if (!val.toLowerCase().endsWith('.pdf')) {
        val = val.replace(/\.[^.]+$/, '') + '.pdf';
    }
    return val;
}

function triggerBlobDownload(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
}

async function copyTextSafe(text, toastMsg = '📋 Copiado al portapapeles') {
    try {
        await navigator.clipboard.writeText(text);
        showDevToast(toastMsg);
    } catch {
        showDevToast(`📋 ${text}`);
    }
}

function buildBaselinePdfFallbackList() {
    const manifest = getRepoBaselineDocsManifest();
    const hashes = getRepoAssetHashesMap();
    return Object.entries(hashes)
        .filter(([assetPath]) => assetPath.toLowerCase().startsWith('assets/docs/') && assetPath.toLowerCase().endsWith('.pdf'))
        .map(([assetPath, info]) => {
            const fname = assetPath.split('/').pop() || assetPath;
            const mEntry = manifest[fname] || {};
            const fallback = DEFAULT_KNOWN_PDF_META[fname.toLowerCase()] || {};
            return {
                filename: fname,
                url: `./assets/docs/${encodeURIComponent(fname)}`,
                assetPath: `assets/docs/${fname}`,
                size: Number(info?.size || 0),
                hash: info?.hash || '',
                updatedAt: Number(mEntry.updatedAt || 0),
                manifestUpdatedAt: Number(mEntry.updatedAt || 0),
                missionId: mEntry.missionId || fallback.missionId || 'unassigned',
                missionLabel: mEntry.missionLabel || fallback.missionLabel || 'Sin misión asignada',
                title: mEntry.title || fallback.title || '',
                catalogId: mEntry.catalogId || '',
                inPublic: true,
                inRepoBaseline: true,
                matchesRepoHash: true
            };
        })
        .sort((a, b) => a.filename.localeCompare(b.filename));
}

function isDocSyncedWithRepo(doc, linked, baselineManifest) {
    if (!doc || doc.localOnly || doc.hasLocalOverride) return false;
    if (!doc.inRepoBaseline || !doc.matchesRepoHash) return false;

    const baseCatalogId = baselineManifest?.[doc.filename]?.catalogId || '';
    const activeCatalogId = linked?.catalogId || '';

    if (activeCatalogId) {
        return Boolean(linked?.inRepoBaseline);
    }
    if (baseCatalogId) {
        return false;
    }
    return true;
}

function describeDocPendingReason(doc, linked, baselineManifest) {
    if (doc.localOnly) return 'Solo en navegador (IndexedDB): falta subir al proyecto / fijar en repo';
    if (doc.hasLocalOverride) return 'Copia en navegador (IndexedDB) más reciente que el archivo del repo';
    if (!doc.inRepoBaseline) return 'Archivo nuevo en public/assets/docs/: falta consolidar en commit/build';
    if (!doc.matchesRepoHash) return 'Contenido modificado en disco respecto al último build';
    const baseCatalogId = baselineManifest?.[doc.filename]?.catalogId || '';
    if ((linked && !linked.inRepoBaseline) || (!linked && baseCatalogId)) {
        return 'Enlace de misión modificado localmente respecto a docs_manifest.json del repo';
    }
    return 'Pendiente de sincronizar';
}

export function renderAssetManagerTab(container) {
    const initialLogoUrl = resolveVersionedAssetUrl(LOGO_ASSET_PATH) || LOGO_ASSET_PATH;
    const initialCarnetUrl = resolveVersionedAssetUrl(CARNET_ASSET_PATH) || CARNET_ASSET_PATH;

    container.innerHTML = `
        <div id="devRepoGlobalBanner" class="devRepoGlobalBanner ok">
            <div class="devRepoGlobalText">
                ⏳ Comprobando sincronización con <code>public/assets/</code>...
            </div>
            <div class="devRepoGlobalActions">
                <button type="button" id="devCopyGlobalSyncPromptBtn" class="devPdfMiniBtn" style="display:none;">
                    📋 Copiar instrucción para AI Studio
                </button>
            </div>
        </div>

        <div class="devSlotGrid">
            <!-- RANURA 1: LOGOTIPO OFICIAL -->
            <div class="devSlotCard">
                <div class="devSlotHeader">
                    <div class="devSlotHeaderTop">
                        <span class="devSlotBadge">RANURA 1</span>
                        <span id="devLogoRepoBadge" class="devRepoSyncBadge repoOk">🟢 En repositorio</span>
                    </div>
                    <h4 class="devSlotTitle">Logotipo Oficial (Cinemática)</h4>
                </div>
                <p class="devSlotDesc">Logotipo que se proyecta en la esquina superior derecha durante los diálogos.</p>
                <div class="devSlotPreviewFrame checkerBg">
                    <img id="devLogoPreviewImg" src="${escapeHtml(initialLogoUrl)}" alt="Logo Oficial" />
                </div>
                <div class="devSlotMeta">
                    <span>Fuente única: <code>public/assets/ui/monteserin_academy_logo_clean.png</code></span>
                    <span>Formatos: <strong>PNG (con transparencia), SVG</strong></span>
                </div>
                <label class="devFileBtn">
                    📁 Seleccionar nuevo logotipo
                    <input type="file" id="devLogoInput" accept="image/png, image/svg+xml" style="display:none;" />
                </label>
                <button type="button" id="devLogoDownloadBtn" class="devSecondaryBtn" style="display:none;">
                    📦 Descargar PNG para GitHub
                </button>
                <div id="devLogoStatus" class="devStatusMsg"></div>
            </div>

            <!-- RANURA 2: CARNET DE ASPIRANTE -->
            <div class="devSlotCard">
                <div class="devSlotHeader">
                    <div class="devSlotHeaderTop">
                        <span class="devSlotBadge">RANURA 2</span>
                        <span id="devCarnetRepoBadge" class="devRepoSyncBadge repoOk">🟢 En repositorio</span>
                    </div>
                    <h4 class="devSlotTitle">Carnet de Aspirante (Misión 1)</h4>
                </div>
                <p class="devSlotDesc">Acreditación oficial entregada por Monty, visualizable a pantalla completa y descargable.</p>
                <div class="devSlotPreviewFrame">
                    <img id="devCarnetPreviewImg" src="${escapeHtml(initialCarnetUrl)}" alt="Carnet Oficial" />
                </div>
                <div class="devSlotMeta">
                    <span>Fuente única: <code>public/assets/ui/ASPIRANTE.jpg</code></span>
                    <span>Formatos: <strong>JPG / JPEG</strong></span>
                </div>
                <label class="devFileBtn">
                    📁 Seleccionar nuevo carnet oficial
                    <input type="file" id="devCarnetInput" accept="image/jpeg, image/jpg" style="display:none;" />
                </label>
                <button type="button" id="devCarnetDownloadBtn" class="devSecondaryBtn" style="display:none;">
                    📦 Descargar JPG para GitHub
                </button>
                <div id="devCarnetStatus" class="devStatusMsg"></div>
            </div>

            <!-- RANURA 4: MODELOS 3D .GLB / .GLTF -->
            <div class="devSlotCard">
                <div class="devSlotHeader">
                    <div class="devSlotHeaderTop">
                        <span class="devSlotBadge">RANURA 4</span>
                        <span id="devGlbRepoBadge" class="devRepoSyncBadge repoOk">🟢 En repositorio</span>
                    </div>
                    <h4 class="devSlotTitle">Modelos 3D (.GLB / .GLTF)</h4>
                </div>
                <p class="devSlotDesc">Sube un modelo a <code>public/assets/models/custom/</code> y acóplalo al Player para probarlo.</p>
                <div class="devSlotInputs">
                    <select id="devGlbSocketSelect" class="devSelect">
                        <option value="rightHand">Mano Derecha (rightHand)</option>
                        <option value="leftHand">Mano Izquierda (leftHand)</option>
                        <option value="back">Espalda (back)</option>
                    </select>
                </div>
                <label class="devFileBtn">
                    📁 Subir y acoplar .glb / .gltf
                    <input type="file" id="devGlbFileInput" accept=".glb, .gltf" style="display:none;" />
                </label>
                <div id="devGlbModelsList" class="devPdfModelList styledScrollbar"></div>
                <div id="devGlbStatus" class="devStatusMsg"></div>
            </div>

            <!-- RANURA 3 (AMPLIADA): REPOSITORIO DE DOCUMENTOS PDF POR MISIONES -->
            <div class="devSlotCard devSlotCardWide">
                <div class="devSlotHeader" style="flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span class="devSlotBadge">RANURA 3 · OPCIÓN 1</span>
                        <h4 class="devSlotTitle">Gestor de Documentos PDF por Misión (Repo + GitHub)</h4>
                    </div>
                    <span style="font-size:0.7rem;color:#94a3b8;">
                        Fuente única: <code>public/assets/docs/</code> + <code>docs_manifest.json</code> (auto-hash SHA-256)
                    </span>
                </div>
                <p class="devSlotDesc">
                    Organiza los archivos <strong>.PDF</strong> por misión y enlázalos al juego. En cada build Vite genera el hash anti-caché automáticamente para GitHub Pages.
                </p>

                <div id="devPdfEnvBanner" class="devPdfEnvBanner" style="display:none;"></div>

                <div class="devPdfWorkbench">
                    <!-- COLUMNA IZQUIERDA: FORMULARIO DE SUBIDA Y ORGANIZACIÓN -->
                    <div class="devPdfUploadCol">
                        <div class="devPdfColTitle">
                            <span>📤 Subir, Reemplazar u Organizar PDF</span>
                        </div>

                        <div class="devSlotInputs">
                            <label for="devPdfMissionSelect" style="font-size:0.7rem;color:#cbd5e1;font-weight:600;">
                                1. Misión asociada:
                            </label>
                            <select id="devPdfMissionSelect" class="devSelect"></select>
                            <div id="devPdfCustomMissionWrap" style="display:none;">
                                <input
                                    type="text"
                                    id="devPdfCustomMissionInput"
                                    class="devInputText"
                                    placeholder="Ej: mission006 o Misión 6: Taller"
                                    autocomplete="off"
                                />
                            </div>
                        </div>

                        <div style="font-size:0.7rem;color:#cbd5e1;font-weight:600;">2. Documento en esta misión (reemplazar existente o crear nuevo):</div>
                        <div class="devPdfPresetRow" id="devPdfPresetRow"></div>

                        <div class="devSlotInputs">
                            <label for="devPdfTitleInput" style="font-size:0.7rem;color:#a0b0a8;">
                                Título / descripción corta (para organizar en F9 y snippet):
                            </label>
                            <input
                                type="text"
                                id="devPdfTitleInput"
                                class="devInputText"
                                placeholder="Ej: Guía de Higiene Visual y Postural"
                                autocomplete="off"
                            />
                        </div>

                        <div class="devSlotInputs">
                            <label for="devPdfTargetNameInput" style="font-size:0.7rem;color:#a0b0a8;">
                                Nombre de archivo destino (.pdf):
                            </label>
                            <input
                                type="text"
                                id="devPdfTargetNameInput"
                                class="devInputText"
                                value="guia-higienes-postural-2.pdf"
                                placeholder="ej: m03_manual_seguridad.pdf"
                                autocomplete="off"
                            />
                            <div id="devPdfTargetPathHint" class="devSlotMeta">
                                <span>Ruta final: <code>public/assets/docs/guia-higienes-postural-2.pdf</code></span>
                            </div>
                        </div>

                        <div id="devPdfDropZone" class="devPdfDropZone">
                            <input type="file" id="devPdfFileInput" accept="application/pdf, .pdf" style="display:none;" />
                            <div style="font-size:1.5rem;line-height:1;">📄</div>
                            <div style="font-size:0.78rem;font-weight:700;color:#ffd54f;">Haz clic o arrastra tu archivo .PDF aquí</div>
                            <div style="font-size:0.68rem;color:#8ba094;">Máximo 25 MB · Se conserva el binario original exacto</div>
                        </div>

                        <div id="devPdfFileMetaBox" class="devPdfFileMetaBox">
                            <div><strong>Archivo seleccionado:</strong> <span id="devPdfSelectedName"></span></div>
                            <div><strong>Tamaño:</strong> <span id="devPdfSelectedSize"></span></div>
                        </div>

                        <div class="devPdfActionRow">
                            <button id="devUploadPdfBtn" class="devActionBtn" disabled style="opacity:0.5;cursor:not-allowed;flex:1;">
                                💾 Guardar PDF en el Proyecto
                            </button>
                            <button type="button" id="devSavePdfMetaBtn" class="devSecondaryBtn" style="display:none;">
                                🏷️ Actualizar solo Misión / Título (sin resubir PDF)
                            </button>
                        </div>

                        <div id="devPdfVerifyBox" class="devPdfVerifyBox">
                            <span>✅ Guardado en <code>public/assets/docs/</code></span>
                            <a id="devPdfVerifyLink" href="#" target="_blank" rel="noopener noreferrer" class="devPdfMiniBtn">
                                👁️ Verificar PDF
                            </a>
                        </div>

                        <div id="devPdfStatus" class="devStatusMsg"></div>
                    </div>

                    <!-- COLUMNA DERECHA: BIBLIOTECA AGRUPADA POR MISIÓN -->
                    <div class="devPdfLibraryCol">
                        <div class="devPdfColTitle" style="gap:6px;flex-wrap:wrap;">
                            <span>📚 PDFs por Misión (<span id="devPdfCount">0</span>)</span>
                            <div style="display:flex;align-items:center;gap:5px;">
                                <select id="devPdfLibraryFilter" class="devPdfFilterSelect" title="Filtrar biblioteca por misión">
                                    <option value="all">Todas las misiones</option>
                                    <option value="__pending__">⏳ Pendientes de enlazar</option>
                                </select>
                                <button type="button" id="devExportPdfPackBtn" class="devPdfMiniBtn" title="Exportar docs_manifest.json y copias modificadas para GitHub">
                                    📦 Exportar
                                </button>
                                <button type="button" id="devRefreshPdfListBtn" class="devPdfMiniBtn" title="Actualizar estado desde disco y navegador">
                                    ↻
                                </button>
                            </div>
                        </div>

                        <div id="devPdfListContainer" class="devPdfListContainer styledScrollbar">
                            <div class="devPdfEmptyMsg">Cargando documentos del proyecto...</div>
                        </div>

                        <div id="devPdfExportBox" class="devPdfExportBox" style="display:none;"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    setupUnifiedAssetManager();
}

function setupUnifiedAssetManager() {
    const globalBanner = document.getElementById('devRepoGlobalBanner');
    const copyGlobalPromptBtn = document.getElementById('devCopyGlobalSyncPromptBtn');

    // Ranura 1 (Logo)
    const logoInput = document.getElementById('devLogoInput');
    const logoPreview = document.getElementById('devLogoPreviewImg');
    const logoStatus = document.getElementById('devLogoStatus');
    const logoRepoBadge = document.getElementById('devLogoRepoBadge');
    const logoDownloadBtn = document.getElementById('devLogoDownloadBtn');
    let pendingLocalLogoDataUrl = null;
    let logoModifiedInSession = false;

    // Ranura 2 (Carnet)
    const carnetInput = document.getElementById('devCarnetInput');
    const carnetPreview = document.getElementById('devCarnetPreviewImg');
    const carnetStatus = document.getElementById('devCarnetStatus');
    const carnetRepoBadge = document.getElementById('devCarnetRepoBadge');
    const carnetDownloadBtn = document.getElementById('devCarnetDownloadBtn');
    let pendingLocalCarnetDataUrl = null;
    let carnetModifiedInSession = false;

    // Ranura 4 (GLB)
    const glbInput = document.getElementById('devGlbFileInput');
    const glbSocket = document.getElementById('devGlbSocketSelect');
    const glbStatus = document.getElementById('devGlbStatus');
    const glbRepoBadge = document.getElementById('devGlbRepoBadge');
    const glbModelsListEl = document.getElementById('devGlbModelsList');

    // Ranura 3 (PDFs)
    const missionSelect = document.getElementById('devPdfMissionSelect');
    const customMissionWrap = document.getElementById('devPdfCustomMissionWrap');
    const customMissionInput = document.getElementById('devPdfCustomMissionInput');
    const titleInput = document.getElementById('devPdfTitleInput');
    const presetRow = document.getElementById('devPdfPresetRow');
    const targetNameInput = document.getElementById('devPdfTargetNameInput');
    const targetPathHint = document.getElementById('devPdfTargetPathHint');
    const dropZone = document.getElementById('devPdfDropZone');
    const fileInput = document.getElementById('devPdfFileInput');
    const metaBox = document.getElementById('devPdfFileMetaBox');
    const selectedNameEl = document.getElementById('devPdfSelectedName');
    const selectedSizeEl = document.getElementById('devPdfSelectedSize');
    const uploadBtn = document.getElementById('devUploadPdfBtn');
    const saveMetaBtn = document.getElementById('devSavePdfMetaBtn');
    const verifyBox = document.getElementById('devPdfVerifyBox');
    const verifyLink = document.getElementById('devPdfVerifyLink');
    const statusEl = document.getElementById('devPdfStatus');
    const libraryFilter = document.getElementById('devPdfLibraryFilter');
    const listContainer = document.getElementById('devPdfListContainer');
    const countEl = document.getElementById('devPdfCount');
    const refreshBtn = document.getElementById('devRefreshPdfListBtn');
    const exportPackBtn = document.getElementById('devExportPdfPackBtn');
    const exportBox = document.getElementById('devPdfExportBox');
    const envBanner = document.getElementById('devPdfEnvBanner');

    let pendingBase64 = null;
    let pendingOriginalName = '';
    let selectedMissionId = 'mission002';
    let uploadMode = 'existing';
    let activeTargetFilename = 'guia-higienes-postural-2.pdf';
    let isManualFilename = false;
    let isDevServerAvailable = true;
    let globalSyncPromptText = '';

    // ======================================================
    // ESTADO GLOBAL Y RANURAS 1 & 2 (LOGO / CARNET)
    // ======================================================
    async function refreshImageSlotsStatus() {
        liveRepoStatusCache = await fetchLiveRepoAssetsStatus();
        const baselineHashes = liveRepoStatusCache?.baseline?.hashes || getRepoAssetHashesMap();
        const liveHashes = liveRepoStatusCache?.live?.hashes || null;

        // Logo
        const baseLogoHash = baselineHashes[LOGO_ASSET_PATH]?.hash || getRepoAssetHashInfo(LOGO_ASSET_PATH)?.hash || '';
        const liveLogoHash = liveHashes ? (liveHashes[LOGO_ASSET_PATH]?.hash || '') : baseLogoHash;
        const logoChangedOnDisk = Boolean(liveHashes && liveLogoHash && baseLogoHash && liveLogoHash !== baseLogoHash);
        const logoPending = Boolean(pendingLocalLogoDataUrl || logoChangedOnDisk || logoModifiedInSession);

        if (logoRepoBadge) {
            logoRepoBadge.className = `devRepoSyncBadge ${logoPending ? 'pending' : 'repoOk'}`;
            logoRepoBadge.textContent = logoPending ? '🟡 Modificado en runtime' : '🟢 En repositorio';
        }
        if (logoDownloadBtn) {
            logoDownloadBtn.style.display = logoPending ? 'block' : 'none';
        }
        if (logoChangedOnDisk && logoPreview && !pendingLocalLogoDataUrl) {
            logoPreview.src = resolveVersionedAssetUrl(LOGO_ASSET_PATH, liveLogoHash);
        }

        // Carnet
        const baseCarnetHash = baselineHashes[CARNET_ASSET_PATH]?.hash || getRepoAssetHashInfo(CARNET_ASSET_PATH)?.hash || '';
        const liveCarnetHash = liveHashes ? (liveHashes[CARNET_ASSET_PATH]?.hash || '') : baseCarnetHash;
        const carnetChangedOnDisk = Boolean(liveHashes && liveCarnetHash && baseCarnetHash && liveCarnetHash !== baseCarnetHash);
        const carnetPending = Boolean(pendingLocalCarnetDataUrl || carnetChangedOnDisk || carnetModifiedInSession);

        if (carnetRepoBadge) {
            carnetRepoBadge.className = `devRepoSyncBadge ${carnetPending ? 'pending' : 'repoOk'}`;
            carnetRepoBadge.textContent = carnetPending ? '🟡 Modificado en runtime' : '🟢 En repositorio';
        }
        if (carnetDownloadBtn) {
            carnetDownloadBtn.style.display = carnetPending ? 'block' : 'none';
        }
        if (carnetChangedOnDisk && carnetPreview && !pendingLocalCarnetDataUrl) {
            carnetPreview.src = resolveVersionedAssetUrl(CARNET_ASSET_PATH, liveCarnetHash);
        }

        return { logoPending, carnetPending };
    }

    function updateGlobalRepoBanner(imageState = { logoPending: false, carnetPending: false }) {
        if (!globalBanner) return;
        const baselineManifest = getRepoBaselineDocsManifest();
        const linkMap = buildRegistryPdfLinkMap();

        const pendingItems = [];
        if (imageState.logoPending) pendingItems.push('Logotipo oficial (public/assets/ui/monteserin_academy_logo_clean.png)');
        if (imageState.carnetPending) pendingItems.push('Carnet de Aspirante (public/assets/ui/ASPIRANTE.jpg)');

        existingServerPdfs.forEach((doc) => {
            const linked = linkMap.get(doc.filename.toLowerCase());
            if (!isDocSyncedWithRepo(doc, linked, baselineManifest)) {
                pendingItems.push(`PDF ${doc.filename}${linked ? ` -> ${linked.catalogId}` : ''}`);
            }
        });

        existingModelsList.forEach((m) => {
            if (!m.inRepoBaseline || !m.matchesRepoHash || m.localOnly) {
                pendingItems.push(`Modelo 3D ${m.filename}`);
            }
        });

        const textEl = globalBanner.querySelector('.devRepoGlobalText');
        if (pendingItems.length === 0) {
            globalBanner.className = 'devRepoGlobalBanner ok';
            if (textEl) {
                textEl.innerHTML = `🟢 <strong>Todo sincronizado con el repositorio</strong> (<code>public/assets/</code>) · Listo para commit a GitHub.`;
            }
            if (copyGlobalPromptBtn) copyGlobalPromptBtn.style.display = 'none';
            globalSyncPromptText = '';
        } else {
            globalBanner.className = 'devRepoGlobalBanner pending';
            if (textEl) {
                textEl.innerHTML = `🟡 <strong>${pendingItems.length} recurso(s) modificado(s) o solo local(es):</strong> ${escapeHtml(pendingItems.slice(0, 3).join(' · '))}${pendingItems.length > 3 ? ` (+${pendingItems.length - 3} más)` : ''}. Consolídalos antes del commit a GitHub.`;
            }
            globalSyncPromptText = `Fija en el repositorio (public/assets/) los cambios pendientes detectados en F9 antes del commit a GitHub: ${pendingItems.join('; ')}.`;
            if (copyGlobalPromptBtn) copyGlobalPromptBtn.style.display = 'inline-flex';
        }
    }

    if (copyGlobalPromptBtn) {
        copyGlobalPromptBtn.onclick = () => {
            if (globalSyncPromptText) {
                copyTextSafe(globalSyncPromptText, '📋 Instrucción copiada para pegar en AI Studio');
            }
        };
    }

    if (logoDownloadBtn) {
        logoDownloadBtn.onclick = async () => {
            try {
                const src = pendingLocalLogoDataUrl || resolveVersionedAssetUrl(LOGO_ASSET_PATH, Date.now());
                const res = await fetch(src, { cache: 'no-store' });
                const blob = await res.blob();
                triggerBlobDownload('monteserin_academy_logo_clean.png', blob);
                showDevToast('📦 Descargado monteserin_academy_logo_clean.png');
            } catch {
                showDevToast('❌ No se pudo descargar el PNG del logotipo');
            }
        };
    }

    if (carnetDownloadBtn) {
        carnetDownloadBtn.onclick = async () => {
            try {
                const src = pendingLocalCarnetDataUrl || resolveVersionedAssetUrl(CARNET_ASSET_PATH, Date.now());
                const res = await fetch(src, { cache: 'no-store' });
                const blob = await res.blob();
                triggerBlobDownload('ASPIRANTE.jpg', blob);
                showDevToast('📦 Descargado ASPIRANTE.jpg');
            } catch {
                showDevToast('❌ No se pudo descargar el JPG del carnet');
            }
        };
    }

    if (logoInput) {
        logoInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (evt) => {
                const rawDataUrl = evt.target?.result;
                if (!rawDataUrl) return;

                let cleanPngDataUrl = rawDataUrl;
                try {
                    cleanPngDataUrl = await new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.naturalWidth || img.width || 512;
                            canvas.height = img.naturalHeight || img.height || 512;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                resolve(canvas.toDataURL('image/png'));
                            } else {
                                resolve(rawDataUrl);
                            }
                        };
                        img.onerror = () => resolve(rawDataUrl);
                        img.src = rawDataUrl;
                    });
                } catch (_) {}

                logoPreview.src = cleanPngDataUrl;
                const stageLogo = document.querySelector('.dialogue-stage-logo');
                if (stageLogo) stageLogo.src = cleanPngDataUrl;

                logoStatus.textContent = `⏳ Guardando logotipo "${file.name}" en public/assets/ui/...`;
                logoStatus.className = 'devStatusMsg';

                try {
                    const res = await fetch('/api/upload-logo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            cleanBase64Data: cleanPngDataUrl,
                            rawBase64Data: cleanPngDataUrl
                        })
                    });
                    const ctype = (res.headers.get('content-type') || '').toLowerCase();
                    if (!res.ok || !ctype.includes('application/json')) {
                        throw new Error('Sin servidor de desarrollo local');
                    }
                    const data = await res.json();
                    pendingLocalLogoDataUrl = null;
                    logoModifiedInSession = true;
                    const bustedUrl = resolveVersionedAssetUrl(LOGO_ASSET_PATH, data.hash || Date.now());
                    logoPreview.src = bustedUrl;
                    if (stageLogo) stageLogo.src = bustedUrl;
                    logoStatus.textContent = `✅ Guardado en public/assets/ui/: ${file.name}`;
                    logoStatus.className = 'devStatusMsg success';
                    showDevToast(`🎨 Logotipo guardado en public/assets/ui/: ${file.name}`);
                } catch (_) {
                    pendingLocalLogoDataUrl = cleanPngDataUrl;
                    logoModifiedInSession = true;
                    logoStatus.textContent = `🟡 Aplicado solo en memoria temporal (vista estática): ${file.name}`;
                    logoStatus.className = 'devStatusMsg warning';
                }

                const imgState = await refreshImageSlotsStatus();
                updateGlobalRepoBanner(imgState);
            };
            reader.readAsDataURL(file);
        };
    }

    if (carnetInput) {
        carnetInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const isJpg = file.type.includes('jpeg') || /\.jpe?g$/i.test(file.name);
            if (!isJpg) {
                carnetStatus.textContent = '⚠️ Selecciona una imagen en formato .JPG o .JPEG.';
                carnetStatus.className = 'devStatusMsg error';
                return;
            }

            const reader = new FileReader();
            reader.onload = async (evt) => {
                const dataUrl = evt.target?.result;
                if (!dataUrl) return;
                carnetPreview.src = dataUrl;

                if (registryCatalog.aspirantCard) {
                    registryCatalog.aspirantCard.thumbnail = dataUrl;
                    registryCatalog.aspirantCard.documentImage = dataUrl;
                }

                carnetStatus.textContent = `⏳ Guardando carnet "${file.name}" en public/assets/ui/...`;
                carnetStatus.className = 'devStatusMsg';

                try {
                    const res = await fetch('/api/upload-carnet', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ carnetBase64Data: dataUrl })
                    });
                    const ctype = (res.headers.get('content-type') || '').toLowerCase();
                    if (!res.ok || !ctype.includes('application/json')) {
                        throw new Error('Sin servidor de desarrollo local');
                    }
                    const data = await res.json();
                    pendingLocalCarnetDataUrl = null;
                    carnetModifiedInSession = true;
                    const bustedUrl = resolveVersionedAssetUrl(CARNET_ASSET_PATH, data.hash || Date.now());
                    carnetPreview.src = bustedUrl;
                    if (registryCatalog.aspirantCard) {
                        registryCatalog.aspirantCard.thumbnail = bustedUrl;
                        registryCatalog.aspirantCard.documentImage = bustedUrl;
                    }
                    carnetStatus.textContent = `✅ Carnet JPG guardado en public/assets/ui/: ${file.name}`;
                    carnetStatus.className = 'devStatusMsg success';
                    showDevToast(`🪪 Carnet JPG guardado en disco: ${file.name}`);
                } catch (_) {
                    pendingLocalCarnetDataUrl = dataUrl;
                    carnetModifiedInSession = true;
                    carnetStatus.textContent = `🟡 Aplicado en memoria temporal (vista estática): ${file.name}`;
                    carnetStatus.className = 'devStatusMsg warning';
                }

                const imgState = await refreshImageSlotsStatus();
                updateGlobalRepoBanner(imgState);
            };
            reader.readAsDataURL(file);
        };
    }

    // ======================================================
    // RANURA 4: MODELOS 3D (.GLB / .GLTF)
    // ======================================================
    async function refreshGlbModelsLibrary() {
        const baselineModels = getRepoBaselineModelsList();
        const baselineMap = new Map(baselineModels.map((m) => [m.filename.toLowerCase(), m]));
        const merged = new Map();

        let liveModels = null;
        try {
            const res = await fetch(`/api/upload-custom-model?v=${Date.now()}`, { cache: 'no-store' });
            const ctype = (res.headers.get('content-type') || '').toLowerCase();
            if (res.ok && ctype.includes('application/json')) {
                const data = await res.json();
                liveModels = Array.isArray(data.models) ? data.models : [];
            }
        } catch (_) {
            liveModels = null;
        }

        const sourceList = liveModels !== null ? liveModels : baselineModels;
        sourceList.forEach((m) => {
            if (!m || !m.filename) return;
            const lower = m.filename.toLowerCase();
            const base = baselineMap.get(lower);
            merged.set(lower, {
                id: `server_${m.filename}`,
                filename: m.filename,
                url: normalizeCustomModelUrl(m.url || `./assets/models/custom/${m.filename}`),
                assetPath: m.assetPath || `assets/models/custom/${m.filename}`,
                size: Number(m.size || base?.size || 0),
                hash: m.hash || base?.hash || '',
                inRepoBaseline: Boolean(base),
                matchesRepoHash: Boolean(base && m.hash && base.hash === m.hash),
                localOnly: false
            });
        });

        // Combinar catálogo local (IndexedDB / localStorage) si falta en servidor
        const localCatalog = getUploadedModelsCatalog();
        for (const item of localCatalog) {
            if (!item || !item.filename) continue;
            const lower = item.filename.toLowerCase();
            if (merged.has(lower)) continue;
            const cached = await getGlbFromLocalCache(item.url || item.filename) || await getGlbFromLocalCache(item.filename);
            if (!cached) continue;
            merged.set(lower, {
                id: item.id || `local_${item.filename}`,
                filename: item.filename,
                url: normalizeCustomModelUrl(item.url || `./assets/models/custom/${item.filename}`),
                assetPath: `assets/models/custom/${item.filename}`,
                size: 0,
                hash: '',
                inRepoBaseline: false,
                matchesRepoHash: false,
                localOnly: true
            });
        }

        existingModelsList = Array.from(merged.values()).sort((a, b) => a.filename.localeCompare(b.filename));
        renderGlbModelsList();
    }

    function renderGlbModelsList() {
        const allSynced = existingModelsList.every((m) => m.inRepoBaseline && m.matchesRepoHash && !m.localOnly);
        if (glbRepoBadge) {
            glbRepoBadge.className = `devRepoSyncBadge ${allSynced ? 'repoOk' : 'pending'}`;
            glbRepoBadge.textContent = allSynced ? '🟢 En repositorio' : '🟡 Cambios locales';
        }

        if (!glbModelsListEl) return;
        if (existingModelsList.length === 0) {
            glbModelsListEl.innerHTML = `<div class="devPdfEmptyMsg" style="padding:10px;">Sin modelos en <code>public/assets/models/custom/</code>.</div>`;
            return;
        }

        glbModelsListEl.innerHTML = existingModelsList.map((m) => {
            const inRepo = m.inRepoBaseline && m.matchesRepoHash && !m.localOnly;
            const badgeText = inRepo
                ? '🟢 En repositorio'
                : (m.localOnly ? '🟡 Solo local' : '🟡 Modificado');
            const badgeClass = inRepo ? 'repoOk' : 'localOnly';
            return `
                <div class="devPdfModelRow">
                    <div class="devPdfModelInfo">
                        <div class="devPdfModelName" title="${escapeHtml(m.assetPath)}">🧊 ${escapeHtml(m.filename)}</div>
                        <div class="devPdfModelMeta">
                            ${m.size ? `<span>${formatBytes(m.size)}</span>` : ''}
                            <span class="devPdfSyncBadge ${badgeClass}">${badgeText}</span>
                        </div>
                    </div>
                    <div class="devPdfItemActions">
                        <button type="button" class="devPdfMiniBtn devGlbEquipBtn" data-filename="${escapeHtml(m.filename)}" title="Acoplar al Player en el socket elegido">
                            🎒
                        </button>
                        <button type="button" class="devPdfMiniBtn devGlbDownloadBtn" data-filename="${escapeHtml(m.filename)}" title="Descargar archivo .GLB para GitHub">
                            ⬇️
                        </button>
                        <button type="button" class="devPdfMiniBtn danger devGlbDeleteBtn" data-filename="${escapeHtml(m.filename)}" data-id="${escapeHtml(m.id)}" title="Eliminar modelo 3D">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        glbModelsListEl.querySelectorAll('.devGlbEquipBtn').forEach((btn) => {
            btn.onclick = async () => {
                const fname = btn.getAttribute('data-filename');
                const entry = existingModelsList.find((x) => x.filename === fname);
                if (!entry) return;
                const targetSocket = glbSocket ? glbSocket.value : 'rightHand';
                const cached = entry.localOnly
                    ? (await getGlbFromLocalCache(entry.url) || await getGlbFromLocalCache(entry.filename))
                    : null;
                const loadSrc = cached || resolveVersionedAssetUrl(entry.assetPath, entry.hash || Date.now());
                loadGLBEquipment(
                    loadSrc,
                    (model) => {
                        equipItem(targetSocket, model, { scale: 1.0 });
                        if (glbStatus) {
                            glbStatus.textContent = `✅ "${fname}" acoplado a ${targetSocket}.`;
                            glbStatus.className = 'devStatusMsg success';
                        }
                    },
                    (err) => {
                        if (glbStatus) {
                            glbStatus.textContent = `❌ Error cargando "${fname}": ${err?.message || 'Error'}`;
                            glbStatus.className = 'devStatusMsg error';
                        }
                    }
                );
            };
        });

        glbModelsListEl.querySelectorAll('.devGlbDownloadBtn').forEach((btn) => {
            btn.onclick = async () => {
                const fname = btn.getAttribute('data-filename');
                const entry = existingModelsList.find((x) => x.filename === fname);
                if (!entry) return;
                try {
                    const cached = await getGlbFromLocalCache(entry.url) || await getGlbFromLocalCache(entry.filename);
                    if (cached) {
                        const res = await fetch(cached);
                        const blob = await res.blob();
                        triggerBlobDownload(entry.filename, blob);
                    } else {
                        const url = resolveVersionedAssetUrl(entry.assetPath, entry.hash || Date.now());
                        const res = await fetch(url, { cache: 'no-store' });
                        const blob = await res.blob();
                        triggerBlobDownload(entry.filename, blob);
                    }
                    showDevToast(`⬇️ Descargado ${entry.filename}`);
                } catch {
                    showDevToast(`❌ No se pudo descargar ${entry.filename}`);
                }
            };
        });

        glbModelsListEl.querySelectorAll('.devGlbDeleteBtn').forEach((btn) => {
            btn.onclick = () => {
                const fname = btn.getAttribute('data-filename');
                const id = btn.getAttribute('data-id');
                if (!fname) return;
                showDevModalDialog({
                    title: 'Eliminar Modelo 3D',
                    message: `¿Seguro que quieres eliminar <strong>${escapeHtml(fname)}</strong> de <code>public/assets/models/custom/</code> y de tu caché local?`,
                    confirmText: 'Eliminar Modelo',
                    cancelText: 'Cancelar',
                    isDanger: true,
                    onConfirm: async () => {
                        deleteUploadedModel(id);
                        await refreshGlbModelsLibrary();
                        const imgState = await refreshImageSlotsStatus();
                        updateGlobalRepoBanner(imgState);
                        showDevToast(`🗑️ Eliminado modelo: ${fname}`);
                    }
                });
            };
        });
    }

    if (glbInput) {
        glbInput.onchange = async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const blobUrl = URL.createObjectURL(file);
            const targetSocket = glbSocket ? glbSocket.value : 'rightHand';

            loadGLBEquipment(
                blobUrl,
                async (model) => {
                    URL.revokeObjectURL(blobUrl);
                    equipItem(targetSocket, model, { scale: 1.0 });
                    if (glbStatus) {
                        glbStatus.textContent = `⏳ "${file.name}" acoplado a ${targetSocket}. Guardando en public/assets/models/custom/...`;
                        glbStatus.className = 'devStatusMsg';
                    }
                    try {
                        const saved = await uploadLocalModelToServer(file);
                        registerUploadedModel({
                            id: `model_${saved.filename || file.name}`,
                            filename: saved.filename || file.name,
                            name: file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
                            url: saved.url || `./assets/models/custom/${saved.filename || file.name}`,
                            uploadedAt: Date.now()
                        });
                        if (glbStatus) {
                            glbStatus.textContent = saved.fromLocalCache
                                ? `🟡 "${file.name}" acoplado y guardado en IndexedDB (solo local).`
                                : `✅ "${file.name}" acoplado y guardado en public/assets/models/custom/.`;
                            glbStatus.className = `devStatusMsg ${saved.fromLocalCache ? 'warning' : 'success'}`;
                        }
                    } catch (err) {
                        if (glbStatus) {
                            glbStatus.textContent = `⚠️ Acoplado en escena, pero fallo al persistir: ${err?.message || err}`;
                            glbStatus.className = 'devStatusMsg warning';
                        }
                    }
                    await refreshGlbModelsLibrary();
                    const imgState = await refreshImageSlotsStatus();
                    updateGlobalRepoBanner(imgState);
                },
                (err) => {
                    URL.revokeObjectURL(blobUrl);
                    if (glbStatus) {
                        glbStatus.textContent = `❌ Error al cargar modelo 3D: ${err?.message || 'Formato no soportado'}`;
                        glbStatus.className = 'devStatusMsg error';
                    }
                }
            );
        };
    }

    // ======================================================
    // RANURA 3: DOCUMENTOS PDF POR MISIÓN
    // ======================================================
    function getSelectedMissionMeta() {
        const rawSelect = missionSelect ? missionSelect.value : selectedMissionId;
        if (rawSelect === '__custom__') {
            const rawCustom = customMissionInput ? customMissionInput.value.trim() : '';
            if (!rawCustom) {
                return { missionId: 'unassigned', missionLabel: 'Sin misión asignada / General' };
            }
            const normId = normalizeMissionId(rawCustom);
            const label = rawCustom.includes(':') || /^misi[oó]n/i.test(rawCustom)
                ? rawCustom
                : formatDefaultMissionLabel(normId, rawCustom);
            return { missionId: normId, missionLabel: label };
        }
        const mId = normalizeMissionId(rawSelect || 'unassigned');
        const selectedOpt = missionSelect?.selectedOptions?.[0];
        const label = selectedOpt ? selectedOpt.textContent.trim() : formatDefaultMissionLabel(mId);
        return { missionId: mId, missionLabel: label };
    }

    function buildSuggestedFilename(rawFileName, missionId) {
        const normalized = normalizePdfFilenameInput(rawFileName);
        if (!normalized) return '';
        const prefix = getMissionPrefix(missionId);
        if (!prefix) return normalized;
        if (/^m\d{2,3}_/i.test(normalized)) {
            return prefix + stripMissionPrefix(normalized);
        }
        return prefix + normalized;
    }

    function populateMissionSelect(preserveValue = true) {
        if (!missionSelect) return;
        const prev = preserveValue ? missionSelect.value : selectedMissionId;
        const choices = buildMissionChoices(existingServerPdfs);
        missionSelect.innerHTML = [
            ...choices.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`),
            `<option value="__custom__">➕ Escribir otra misión personalizada...</option>`
        ].join('');

        if (prev && Array.from(missionSelect.options).some((o) => o.value === prev)) {
            missionSelect.value = prev;
        } else if (Array.from(missionSelect.options).some((o) => o.value === selectedMissionId)) {
            missionSelect.value = selectedMissionId;
        }
        if (customMissionWrap) {
            customMissionWrap.style.display = missionSelect.value === '__custom__' ? 'block' : 'none';
        }
    }

    function populateLibraryFilter() {
        if (!libraryFilter) return;
        const prev = libraryFilter.value || 'all';
        const seenMissions = new Map();
        existingServerPdfs.forEach((doc) => {
            const meta = getEffectiveDocMeta(doc);
            if (!seenMissions.has(meta.missionId)) {
                seenMissions.set(meta.missionId, meta.missionLabel);
            }
        });

        const sortedEntries = Array.from(seenMissions.entries()).sort((a, b) => {
            if (a[0] === 'unassigned') return 1;
            if (b[0] === 'unassigned') return -1;
            const na = getMissionNumber(a[0]);
            const nb = getMissionNumber(b[0]);
            if (na !== null && nb !== null) return na - nb;
            if (na !== null) return -1;
            if (nb !== null) return 1;
            return a[1].localeCompare(b[1]);
        });

        libraryFilter.innerHTML = [
            `<option value="all">Todas las misiones (${existingServerPdfs.length})</option>`,
            `<option value="__pending__">⏳ Pendientes de enlazar</option>`,
            ...sortedEntries.map(([mId, mLabel]) => `<option value="${escapeHtml(mId)}">${escapeHtml(mLabel)}</option>`)
        ].join('');

        if (Array.from(libraryFilter.options).some((o) => o.value === prev)) {
            libraryFilter.value = prev;
        }
    }

    function renderQuickMissionDocsRow() {
        if (!presetRow) return;
        const { missionId } = getSelectedMissionMeta();
        const missionDocs = existingServerPdfs.filter((doc) => getEffectiveDocMeta(doc).missionId === missionId);

        const chipsHtml = [
            ...missionDocs.map((doc) => {
                const meta = getEffectiveDocMeta(doc);
                const isActive = uploadMode === 'existing' && activeTargetFilename.toLowerCase() === doc.filename.toLowerCase();
                const shortTitle = meta.title ? `${doc.filename} · ${meta.title}` : doc.filename;
                return `
                    <button type="button"
                        class="devPdfPresetChip ${isActive ? 'active' : ''}"
                        data-mode="existing"
                        data-filename="${escapeHtml(doc.filename)}"
                        data-title="${escapeHtml(meta.title)}"
                        title="${escapeHtml(shortTitle)}">
                        📄 ${escapeHtml(doc.filename)}
                    </button>
                `;
            }),
            `
                <button type="button"
                    class="devPdfPresetChip ${uploadMode === 'new' ? 'active' : ''}"
                    data-mode="new"
                    data-filename="">
                    ✨ + Nuevo PDF
                </button>
            `
        ].join('');

        presetRow.innerHTML = chipsHtml;

        presetRow.querySelectorAll('.devPdfPresetChip').forEach((chip) => {
            chip.onclick = () => {
                const mode = chip.getAttribute('data-mode') || 'new';
                const fname = chip.getAttribute('data-filename') || '';
                const ftitle = chip.getAttribute('data-title') || '';
                uploadMode = mode;
                isManualFilename = false;

                if (mode === 'existing' && fname) {
                    activeTargetFilename = fname;
                    if (targetNameInput) targetNameInput.value = fname;
                    if (titleInput) titleInput.value = ftitle;
                } else {
                    activeTargetFilename = '';
                    if (titleInput) titleInput.value = '';
                    if (targetNameInput) {
                        if (pendingOriginalName) {
                            targetNameInput.value = buildSuggestedFilename(pendingOriginalName, getSelectedMissionMeta().missionId);
                        } else {
                            targetNameInput.value = getMissionPrefix(getSelectedMissionMeta().missionId);
                            targetNameInput.focus();
                        }
                    }
                }
                renderQuickMissionDocsRow();
                updatePathHintAndUploadState();
            };
        });
    }

    function updatePathHintAndUploadState() {
        const normalized = normalizePdfFilenameInput(targetNameInput?.value || '');
        const existingMatch = normalized
            ? existingServerPdfs.find((d) => d.filename.toLowerCase() === normalized.toLowerCase())
            : null;

        if (targetPathHint) {
            if (!normalized) {
                const pref = getMissionPrefix(getSelectedMissionMeta().missionId);
                targetPathHint.innerHTML = `<span style="color:#fca5a5;">Escribe un nombre válido (ej: <code>${escapeHtml(pref || 'm03_')}documento.pdf</code>)</span>`;
            } else if (existingMatch) {
                const mLabel = getEffectiveDocMeta(existingMatch).missionLabel;
                targetPathHint.innerHTML = `<span>Ruta: <code>public/assets/docs/${escapeHtml(normalized)}</code> · <strong style="color:#fbbf24;">Existe en ${escapeHtml(mLabel)} (se reemplazará)</strong></span>`;
            } else {
                targetPathHint.innerHTML = `<span>Ruta nueva: <code>public/assets/docs/${escapeHtml(normalized)}</code></span>`;
            }
        }

        const canSubmit = Boolean(pendingBase64 && normalized);
        if (uploadBtn) {
            uploadBtn.disabled = !canSubmit;
            uploadBtn.style.opacity = canSubmit ? '1' : '0.5';
            uploadBtn.style.cursor = canSubmit ? 'pointer' : 'not-allowed';
            uploadBtn.textContent = existingMatch ? '🔄 Reemplazar PDF en el Proyecto' : '💾 Guardar Nuevo PDF en el Proyecto';
        }

        if (saveMetaBtn) {
            saveMetaBtn.style.display = existingMatch ? 'block' : 'none';
        }
    }

    function setStatus(text, type = '') {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = `devStatusMsg ${type}`.trim();
    }

    function handleSelectedFile(file) {
        if (!file) return;
        const isPdfMime = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (!isPdfMime) {
            setStatus('⚠️ Selecciona un archivo con extensión .pdf válido.', 'error');
            return;
        }
        if (file.size > 25 * 1024 * 1024) {
            setStatus('⚠️ El PDF supera el límite máximo permitido de 25 MB.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            pendingBase64 = evt.target?.result || null;
            pendingOriginalName = file.name;

            const { missionId } = getSelectedMissionMeta();
            const currentVal = (targetNameInput?.value || '').trim();
            const isJustPrefix = /^m\d{2,3}_?$/i.test(currentVal);

            if (uploadMode === 'new' && !isManualFilename && (!currentVal || isJustPrefix || currentVal === activeTargetFilename)) {
                if (targetNameInput) {
                    targetNameInput.value = buildSuggestedFilename(file.name, missionId);
                }
            }

            if (titleInput && !titleInput.value.trim() && uploadMode === 'new') {
                const cleanTitle = file.name
                    .replace(/\.pdf$/i, '')
                    .replace(/^m\d{2,3}[_-]+/i, '')
                    .replace(/[_-]+/g, ' ')
                    .trim();
                if (cleanTitle) {
                    titleInput.value = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
                }
            }

            if (selectedNameEl) selectedNameEl.textContent = file.name;
            if (selectedSizeEl) selectedSizeEl.textContent = formatBytes(file.size);
            if (metaBox) metaBox.style.display = 'flex';
            if (verifyBox) verifyBox.style.display = 'none';
            setStatus('Archivo leído y listo para guardar en el proyecto.', 'success');
            updatePathHintAndUploadState();
        };
        reader.onerror = () => {
            setStatus('❌ No se pudo leer el archivo PDF seleccionado.', 'error');
        };
        reader.readAsDataURL(file);
    }

    function updateEnvBanner() {
        if (!envBanner) return;
        const baselineManifest = getRepoBaselineDocsManifest();
        const linkMap = buildRegistryPdfLinkMap();
        const pendingDocs = existingServerPdfs.filter((doc) => {
            const linked = linkMap.get(doc.filename.toLowerCase());
            return !isDocSyncedWithRepo(doc, linked, baselineManifest);
        });

        if (!isDevServerAvailable) {
            envBanner.style.display = 'flex';
            envBanner.className = 'devPdfEnvBanner warning';
            envBanner.innerHTML = `<span>⚠️ <strong>Vista estática / GitHub Pages:</strong> leyendo snapshot del repositorio (<code>public/assets/docs/</code>). Los PDFs que pruebes aquí se guardan solo en tu navegador (<code>IndexedDB</code>). Usa <strong>📦 Exportar</strong> para descargarlos.</span>`;
            return;
        }
        if (pendingDocs.length > 0) {
            envBanner.style.display = 'flex';
            envBanner.className = 'devPdfEnvBanner info';
            envBanner.innerHTML = `<span>🟡 Hay <strong>${pendingDocs.length}</strong> documento(s) con cambios locales o en disco distintos al último commit/build. Usa <strong>📦 Exportar</strong> o pídele a AI Studio consolidarlos antes de subir a GitHub.</span>`;
            return;
        }
        envBanner.style.display = 'none';
        envBanner.innerHTML = '';
    }

    function triggerTextFileDownload(filename, textContent, mimeType = 'text/plain;charset=utf-8') {
        const blob = new Blob([textContent], { type: mimeType });
        triggerBlobDownload(filename, blob);
    }

    async function performUpload(overwrite = false) {
        const targetFilename = normalizePdfFilenameInput(targetNameInput?.value || '');
        if (!pendingBase64 || !targetFilename) return;

        const { missionId, missionLabel } = getSelectedMissionMeta();
        const docTitle = (titleInput?.value || '').trim();
        const existingMatch = existingServerPdfs.find((d) => d.filename.toLowerCase() === targetFilename.toLowerCase());

        if (existingMatch && !overwrite) {
            showDevModalDialog({
                title: 'Reemplazar Documento PDF',
                message: `Ya existe <strong>${escapeHtml(targetFilename)}</strong> en el proyecto.<br><br>¿Deseas sobrescribirlo con <strong>${escapeHtml(pendingOriginalName)}</strong> y asociarlo a <strong>${escapeHtml(missionLabel)}</strong>?`,
                confirmText: 'Sí, reemplazar',
                cancelText: 'Cancelar',
                onConfirm: () => performUpload(true),
                onCancel: () => {
                    setStatus('Subida cancelada. Cambia el nombre de destino si quieres conservar ambos.', 'warning');
                    updatePathHintAndUploadState();
                }
            });
            return;
        }

        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = '⏳ Guardando PDF...';
        }
        setStatus('Guardando PDF en public/assets/docs/ y en caché local de prueba...', '');

        let savedToServer = false;
        let finalFilename = targetFilename;
        let finalSize = 0;
        let finalUpdatedAt = Date.now();
        let finalUrl = `./assets/docs/${encodeURIComponent(targetFilename)}`;
        let finalCatalogId = existingMatch?.catalogId || '';

        try {
            const res = await fetch('/api/upload-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: targetFilename,
                    base64Data: pendingBase64,
                    overwrite,
                    missionId,
                    missionLabel,
                    title: docTitle
                })
            });

            const ctype = (res.headers.get('content-type') || '').toLowerCase();
            const data = ctype.includes('application/json') ? await res.json().catch(() => ({})) : {};

            if (res.status === 409 && !overwrite) {
                showDevModalDialog({
                    title: 'Reemplazar Documento PDF',
                    message: `Ya existe <strong>${escapeHtml(targetFilename)}</strong> en el proyecto.<br><br>¿Deseas sobrescribirlo con <strong>${escapeHtml(pendingOriginalName)}</strong> y asociarlo a <strong>${escapeHtml(missionLabel)}</strong>?`,
                    confirmText: 'Sí, reemplazar',
                    cancelText: 'Cancelar',
                    onConfirm: () => performUpload(true),
                    onCancel: () => {
                        setStatus('Subida cancelada. Cambia el nombre de destino si quieres conservar ambos.', 'warning');
                        updatePathHintAndUploadState();
                    }
                });
                return;
            }

            if (res.ok && data.success) {
                savedToServer = true;
                isDevServerAvailable = true;
                finalFilename = data.filename || targetFilename;
                finalSize = Number(data.size) || 0;
                finalUpdatedAt = Number(data.updatedAt) || Date.now();
                finalUrl = data.url || finalUrl;
                finalCatalogId = data.catalogId || finalCatalogId;
            } else if (!ctype.includes('application/json')) {
                isDevServerAvailable = false;
            } else {
                throw new Error(data.error || `Error HTTP ${res.status}`);
            }
        } catch (err) {
            if (err && /Error HTTP|cabecera PDF|límite|permitido/i.test(String(err.message || ''))) {
                setStatus(`❌ Error al guardar PDF: ${err.message || err}`, 'error');
                updatePathHintAndUploadState();
                return;
            }
            isDevServerAvailable = false;
        }

        // Si se guardó en disco (servidor dev), eliminamos overrides viejos si procede o guardamos timestamp sincronizado;
        // en vista estática (sin servidor dev), guardamos siempre en IndexedDB como prueba local.
        let localRec = null;
        if (!savedToServer) {
            localRec = await saveLocalPdfOverride({
                filename: finalFilename,
                base64Data: pendingBase64,
                size: finalSize,
                updatedAt: finalUpdatedAt,
                missionId,
                missionLabel,
                title: docTitle || existingMatch?.title || '',
                catalogId: finalCatalogId
            });
        } else {
            await removeLocalPdfOverride(finalFilename);
        }

        finalSize = finalSize || localRec?.size || 0;

        if (verifyLink) {
            if (savedToServer) {
                verifyLink.href = `${finalUrl}?v=${Date.now()}`;
                verifyLink.onclick = null;
            } else if (localRec?.base64Data) {
                const blobUrl = URL.createObjectURL(base64ToPdfBlob(localRec.base64Data));
                verifyLink.href = blobUrl;
                verifyLink.onclick = () => {
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                };
            }
        }
        if (verifyBox) {
            verifyBox.style.display = 'flex';
        }

        if (savedToServer) {
            setStatus(`✅ "${finalFilename}" guardado en public/assets/docs/ (${missionLabel} · ${formatBytes(finalSize)}).`, 'success');
            showDevToast(`📄 PDF guardado (${missionLabel}): ${finalFilename}`);
        } else {
            setStatus(`🟡 "${finalFilename}" guardado solo en tu navegador (IndexedDB · ${formatBytes(finalSize)}). Usa 📦 Exportar para fijarlo en GitHub.`, 'warning');
            showDevToast(`🟡 PDF guardado en prueba local: ${finalFilename}`);
        }

        pendingBase64 = null;
        pendingOriginalName = '';
        uploadMode = 'existing';
        activeTargetFilename = finalFilename;
        isManualFilename = false;
        if (fileInput) fileInput.value = '';
        if (metaBox) metaBox.style.display = 'none';

        await refreshAllManagerViews();
        updatePathHintAndUploadState();
    }

    async function saveMetadataOnly() {
        const targetFilename = normalizePdfFilenameInput(targetNameInput?.value || '');
        if (!targetFilename) return;
        const { missionId, missionLabel } = getSelectedMissionMeta();
        const docTitle = (titleInput?.value || '').trim();

        if (saveMetaBtn) {
            saveMetaBtn.disabled = true;
            saveMetaBtn.textContent = '⏳ Guardando etiqueta...';
        }

        let serverSaved = false;
        try {
            const res = await fetch('/api/upload-pdf', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: targetFilename,
                    missionId,
                    missionLabel,
                    title: docTitle
                })
            });
            const ctype = (res.headers.get('content-type') || '').toLowerCase();
            const data = ctype.includes('application/json') ? await res.json().catch(() => ({})) : {};
            if (res.ok && data.success) {
                serverSaved = true;
                if (data.manifest) setServerManifestCache(data.manifest);
            }
        } catch (_) {}

        await updateLocalPdfMetadata(targetFilename, { missionId, missionLabel, title: docTitle });

        if (serverSaved) {
            setStatus(`✅ Misión y título actualizados en docs_manifest.json para "${targetFilename}" (${missionLabel}).`, 'success');
        } else {
            setStatus(`🟡 Misión y título actualizados en copia local para "${targetFilename}".`, 'warning');
        }
        showDevToast(`🏷️ Organizado en ${missionLabel}: ${targetFilename}`);
        await refreshAllManagerViews();

        if (saveMetaBtn) {
            saveMetaBtn.disabled = false;
            saveMetaBtn.textContent = '🏷️ Actualizar solo Misión / Título (sin resubir PDF)';
        }
    }

    async function assignPdfToCatalog(filename, catalogId) {
        const doc = existingServerPdfs.find((d) => d.filename === filename);
        const meta = doc ? getEffectiveDocMeta(doc) : { missionId: 'unassigned', missionLabel: '', title: '' };
        const now = Date.now();

        let persistedOnServer = false;
        if (isDevServerAvailable && !doc?.localOnly) {
            try {
                const res = await fetch('/api/upload-pdf', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename,
                        missionId: meta.missionId,
                        missionLabel: meta.missionLabel,
                        title: meta.title,
                        catalogId
                    })
                });
                const ctype = (res.headers.get('content-type') || '').toLowerCase();
                if (res.ok && ctype.includes('application/json')) {
                    const data = await res.json();
                    if (data.manifest) setServerManifestCache(data.manifest);
                    persistedOnServer = true;
                }
            } catch (_) {}
        }

        if (catalogId) {
            await setLocalCatalogBinding(catalogId, filename, persistedOnServer ? now : now);
        } else {
            await clearLocalBindingForFilename(filename);
        }

        const slotTitle = catalogId ? (registryCatalog?.[catalogId]?.title || catalogId) : 'Sin enlace fijo';
        showDevToast(catalogId ? `🔗 ${filename} → ${slotTitle}` : `🔗 Enlace quitado de ${filename}`);
        await refreshAllManagerViews();
    }

    function buildRegistrySnippet(doc) {
        const meta = getEffectiveDocMeta(doc);
        const baseId = doc.filename
            .replace(/\.pdf$/i, '')
            .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
            .replace(/^[^a-zA-Z]+/, '') || 'missionDoc';
        const catalogKey = `${baseId}Doc`;
        const cleanTitle = meta.title || doc.filename.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
        return `    // ${meta.missionLabel} (${meta.missionId})
    ${catalogKey}: {
        id: "${catalogKey}",
        type: "document",
        title: "${cleanTitle}",
        description: "Documento obtenido durante ${meta.missionLabel}.",
        thumbnail: "assets/registry/inventory/docHygiene.svg",
        documentImage: "${doc.assetPath}",
        downloadFilename: "${doc.filename}",
        canOpen: true,
        canArchive: true
    },`;
    }

    function loadDocIntoForm(doc) {
        const meta = getEffectiveDocMeta(doc);
        selectedMissionId = meta.missionId;
        uploadMode = 'existing';
        activeTargetFilename = doc.filename;
        isManualFilename = false;

        if (missionSelect) {
            if (Array.from(missionSelect.options).some((o) => o.value === meta.missionId)) {
                missionSelect.value = meta.missionId;
                if (customMissionWrap) customMissionWrap.style.display = 'none';
            } else {
                missionSelect.value = '__custom__';
                if (customMissionWrap) customMissionWrap.style.display = 'block';
                if (customMissionInput) customMissionInput.value = meta.missionLabel || meta.missionId;
            }
        }
        if (targetNameInput) targetNameInput.value = doc.filename;
        if (titleInput) titleInput.value = meta.title || '';

        renderQuickMissionDocsRow();
        updatePathHintAndUploadState();
        setStatus(`Editando "${doc.filename}". Arrastra un PDF nuevo para reemplazarlo o cambia su misión/título.`, '');
    }

    function renderPdfLibraryList(docs) {
        if (!listContainer) return;
        if (countEl) countEl.textContent = String(docs.length);

        if (!docs || docs.length === 0) {
            listContainer.innerHTML = `
                <div class="devPdfEmptyMsg">
                    Aún no hay archivos PDF guardados en <code>public/assets/docs/</code>.<br>
                    Selecciona una misión y sube un documento en la columna izquierda.
                </div>
            `;
            return;
        }

        const linkMap = buildRegistryPdfLinkMap();
        const baselineManifest = getRepoBaselineDocsManifest();
        const activeFilter = libraryFilter ? libraryFilter.value : 'all';

        const filteredDocs = docs.filter((doc) => {
            const meta = getEffectiveDocMeta(doc);
            const linked = linkMap.get(doc.filename.toLowerCase());
            if (activeFilter === '__pending__') return !linked;
            if (activeFilter && activeFilter !== 'all') return meta.missionId === activeFilter;
            return true;
        });

        if (filteredDocs.length === 0) {
            listContainer.innerHTML = `
                <div class="devPdfEmptyMsg">
                    No hay documentos PDF que coincidan con este filtro.
                </div>
            `;
            return;
        }

        const groups = new Map();
        filteredDocs.forEach((doc) => {
            const meta = getEffectiveDocMeta(doc);
            if (!groups.has(meta.missionId)) {
                groups.set(meta.missionId, {
                    missionId: meta.missionId,
                    missionLabel: meta.missionLabel,
                    items: []
                });
            }
            groups.get(meta.missionId).items.push({ doc, meta });
        });

        const sortedGroups = Array.from(groups.values()).sort((a, b) => {
            if (a.missionId === 'unassigned') return 1;
            if (b.missionId === 'unassigned') return -1;
            const na = getMissionNumber(a.missionId);
            const nb = getMissionNumber(b.missionId);
            if (na !== null && nb !== null) return na - nb;
            if (na !== null) return -1;
            if (nb !== null) return 1;
            return a.missionLabel.localeCompare(b.missionLabel);
        });

        const catalogSlots = getPdfCatalogSlots();

        listContainer.innerHTML = sortedGroups.map((group) => `
            <div class="devPdfMissionGroup">
                <div class="devPdfMissionGroupHeader">
                    <span>📂 ${escapeHtml(group.missionLabel)}</span>
                    <span class="devPdfMissionGroupCount">${group.items.length} PDF${group.items.length === 1 ? '' : 's'}</span>
                </div>
                ${group.items.map(({ doc, meta }) => {
                    const linked = linkMap.get(doc.filename.toLowerCase());
                    const displayTitle = linked?.title || meta.title;
                    const selectedCatId = linked ? linked.catalogId : '';
                    const synced = isDocSyncedWithRepo(doc, linked, baselineManifest);
                    const pendingReason = synced ? '' : describeDocPendingReason(doc, linked, baselineManifest);

                    const shortPendingLabel = doc.localOnly || doc.hasLocalOverride
                        ? 'Solo prueba local'
                        : (!doc.inRepoBaseline || !doc.matchesRepoHash
                            ? 'Modificado en disco'
                            : 'Enlace sin consolidar');

                    const syncBadgeHtml = synced
                        ? `<span class="devPdfSyncBadge repoOk" title="Archivo y enlace consolidados en public/assets/docs/ (listo para GitHub)">🟢 En repositorio</span>`
                        : `<span class="devPdfSyncBadge localOnly" title="${escapeHtml(pendingReason)}">🟡 ${escapeHtml(shortPendingLabel)}</span>`;

                    const assignOptionsHtml = [
                        `<option value="">— Sin enlace en Registro —</option>`,
                        ...catalogSlots.map((slot) => {
                            const isSel = selectedCatId === slot.catalogId;
                            const suffix = isSel && linked && !linked.isExplicit ? ' (Por defecto)' : '';
                            return `<option value="${escapeHtml(slot.catalogId)}" ${isSel ? 'selected' : ''}>${escapeHtml(slot.title)}${suffix}</option>`;
                        })
                    ].join('');

                    const openUrl = resolveVersionedAssetUrl(doc.assetPath, doc.hash || doc.updatedAt || Date.now());

                    return `
                        <div class="devPdfItemRow">
                            <div class="devPdfItemInfo">
                                <div class="devPdfItemName" title="${escapeHtml(doc.assetPath)}">📄 ${escapeHtml(doc.filename)}</div>
                                ${displayTitle ? `<div class="devPdfItemTitle" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</div>` : ''}
                                <div class="devPdfItemMeta">
                                    <span>${formatBytes(doc.size)}</span>
                                    ${syncBadgeHtml}
                                    <span class="devPdfLinkBadge ${linked ? '' : 'pending'}" title="${linked ? `Conectado en el juego como "${linked.title}" (${linked.catalogId})` : 'Subido al proyecto pero aún no enlazado a ningún documento del Registro'}">
                                        ${linked ? `✓ Enlazado (${escapeHtml(linked.catalogId)})` : '⏳ Pendiente enlazar'}
                                    </span>
                                </div>
                                <div class="devPdfAssignRow">
                                    <span class="devPdfAssignLabel">🔗 Usar como:</span>
                                    <select class="devPdfAssignSelect" data-filename="${escapeHtml(doc.filename)}" title="Asignar este PDF a un documento del Registro del juego">
                                        ${assignOptionsHtml}
                                    </select>
                                </div>
                            </div>
                            <div class="devPdfItemActions">
                                <a href="${escapeHtml(openUrl)}" target="_blank" rel="noopener noreferrer" class="devPdfMiniBtn devOpenPdfBtn" data-filename="${escapeHtml(doc.filename)}" data-url="${escapeHtml(openUrl)}" title="Abrir PDF en nueva pestaña">
                                    👁️
                                </a>
                                <button type="button" class="devPdfMiniBtn devSelectForEditBtn" data-filename="${escapeHtml(doc.filename)}" title="Reemplazar PDF o cambiar su misión/título">
                                    🔄
                                </button>
                                ${doc.hasLocalOverride ? `
                                    <button type="button" class="devPdfMiniBtn devClearLocalBtn" data-filename="${escapeHtml(doc.filename)}" title="Descartar copia local del navegador y volver a la versión del repositorio">
                                        🧹
                                    </button>
                                ` : ''}
                                <button type="button" class="devPdfMiniBtn devCopySnippetBtn" data-filename="${escapeHtml(doc.filename)}" title="Copiar bloque listo para registryCatalog.js">
                                    🧩
                                </button>
                                <button type="button" class="devPdfMiniBtn devCopyPdfPathBtn" data-path="${escapeHtml(doc.assetPath)}" title="Copiar ruta del proyecto">
                                    📋
                                </button>
                                <button type="button" class="devPdfMiniBtn danger devDeletePdfBtn" data-filename="${escapeHtml(doc.filename)}" title="Eliminar PDF de public/assets/docs/ y navegador">
                                    🗑️
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `).join('');

        listContainer.querySelectorAll('.devPdfAssignSelect').forEach((sel) => {
            sel.onchange = () => {
                const fname = sel.getAttribute('data-filename');
                if (fname) assignPdfToCatalog(fname, sel.value || '');
            };
        });

        listContainer.querySelectorAll('.devOpenPdfBtn').forEach((link) => {
            link.onclick = (e) => {
                const fname = link.getAttribute('data-filename');
                const localRec = getLocalPdfRecord(fname);
                const docEntry = existingServerPdfs.find((d) => d.filename === fname);

                if (docEntry?.hasLocalOverride && localRec?.base64Data) {
                    e.preventDefault();
                    const blobUrl = URL.createObjectURL(base64ToPdfBlob(localRec.base64Data));
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                }
            };
        });

        listContainer.querySelectorAll('.devSelectForEditBtn').forEach((btn) => {
            btn.onclick = () => {
                const fname = btn.getAttribute('data-filename');
                const doc = existingServerPdfs.find((d) => d.filename === fname);
                if (doc) loadDocIntoForm(doc);
            };
        });

        listContainer.querySelectorAll('.devClearLocalBtn').forEach((btn) => {
            btn.onclick = async () => {
                const fname = btn.getAttribute('data-filename');
                if (!fname) return;
                await removeLocalPdfOverride(fname);
                showDevToast(`🧹 Copia local eliminada para ${fname}`);
                await refreshAllManagerViews();
            };
        });

        listContainer.querySelectorAll('.devCopySnippetBtn').forEach((btn) => {
            btn.onclick = () => {
                const fname = btn.getAttribute('data-filename');
                const doc = existingServerPdfs.find((d) => d.filename === fname);
                if (doc) {
                    copyTextSafe(buildRegistrySnippet(doc), `🧩 Snippet copiado para ${fname}`);
                }
            };
        });

        listContainer.querySelectorAll('.devCopyPdfPathBtn').forEach((btn) => {
            btn.onclick = () => {
                const p = btn.getAttribute('data-path');
                copyTextSafe(p, `📋 Ruta copiada: ${p}`);
            };
        });

        listContainer.querySelectorAll('.devDeletePdfBtn').forEach((btn) => {
            btn.onclick = () => {
                const fname = btn.getAttribute('data-filename');
                if (!fname) return;
                const docEntry = existingServerPdfs.find((d) => d.filename === fname);
                showDevModalDialog({
                    title: 'Eliminar Documento PDF',
                    message: docEntry?.localOnly
                        ? `¿Seguro que quieres eliminar <strong>${escapeHtml(fname)}</strong> del almacenamiento local del navegador?`
                        : `¿Seguro que quieres eliminar <strong>${escapeHtml(fname)}</strong> de <code>public/assets/docs/</code> y del navegador?`,
                    confirmText: 'Eliminar PDF',
                    cancelText: 'Cancelar',
                    isDanger: true,
                    onConfirm: async () => {
                        try {
                            await removeLocalPdfOverride(fname);
                            await clearLocalBindingForFilename(fname);
                            if (isDevServerAvailable && !docEntry?.localOnly) {
                                const res = await fetch(`/api/upload-pdf?filename=${encodeURIComponent(fname)}`, {
                                    method: 'DELETE'
                                });
                                const ctype = (res.headers.get('content-type') || '').toLowerCase();
                                const data = ctype.includes('application/json') ? await res.json().catch(() => ({})) : {};
                                if (!res.ok || !data.success) {
                                    throw new Error(data.error || 'No se pudo eliminar en disco');
                                }
                                if (data.manifest) setServerManifestCache(data.manifest);
                            }
                            showDevToast(`🗑️ Eliminado: ${fname}`);
                            await refreshAllManagerViews();
                        } catch (err) {
                            showDevToast(`❌ Error eliminando PDF: ${err.message || err}`);
                        }
                    }
                });
            };
        });
    }

    async function fetchPdfLibrary() {
        await initPdfDocumentStore();
        let baseDocs = [];

        try {
            const res = await fetch(`/api/upload-pdf?v=${Date.now()}`, { cache: 'no-store' });
            const ctype = (res.headers.get('content-type') || '').toLowerCase();
            if (!res.ok || !ctype.includes('application/json')) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            isDevServerAvailable = true;
            if (data.manifest) setServerManifestCache(data.manifest);
            baseDocs = Array.isArray(data.docs) ? data.docs : [];
        } catch (_) {
            isDevServerAvailable = false;
            baseDocs = buildBaselinePdfFallbackList();
        }

        const mergedMap = new Map();
        baseDocs.forEach((doc) => {
            mergedMap.set(doc.filename.toLowerCase(), { ...doc, hasLocalOverride: false, localOnly: false });
        });

        const localRecords = getAllLocalPdfRecords();
        localRecords.forEach((rec) => {
            const lower = rec.filename.toLowerCase();
            const existing = mergedMap.get(lower);
            if (existing) {
                const overrideNewer = isLocalOverrideNewerThanServer(rec.filename, existing) || !isDevServerAvailable;
                if (overrideNewer) {
                    existing.hasLocalOverride = true;
                    existing.size = rec.size || existing.size;
                    existing.updatedAt = rec.updatedAt || existing.updatedAt;
                    existing.missionId = rec.missionId || existing.missionId;
                    existing.missionLabel = rec.missionLabel || existing.missionLabel;
                    existing.title = rec.title || existing.title;
                    existing.localBase64 = rec.base64Data;
                }
            } else {
                mergedMap.set(lower, {
                    filename: rec.filename,
                    url: `./assets/docs/${encodeURIComponent(rec.filename)}`,
                    assetPath: `assets/docs/${rec.filename}`,
                    size: rec.size || 0,
                    updatedAt: rec.updatedAt || Date.now(),
                    inPublic: false,
                    inRepoBaseline: false,
                    matchesRepoHash: false,
                    missionId: rec.missionId || 'unassigned',
                    missionLabel: rec.missionLabel || 'Sin misión asignada',
                    title: rec.title || '',
                    catalogId: rec.catalogId || '',
                    hasLocalOverride: true,
                    localOnly: true,
                    localBase64: rec.base64Data
                });
            }
        });

        existingServerPdfs = Array.from(mergedMap.values()).sort((a, b) => a.filename.localeCompare(b.filename));

        populateMissionSelect(true);
        populateLibraryFilter();
        renderQuickMissionDocsRow();
        renderPdfLibraryList(existingServerPdfs);
        updateEnvBanner();
        updatePathHintAndUploadState();
    }

    async function refreshAllManagerViews() {
        await Promise.all([
            fetchPdfLibrary(),
            refreshGlbModelsLibrary()
        ]);
        const imgState = await refreshImageSlotsStatus();
        updateGlobalRepoBanner(imgState);
    }

    if (missionSelect) {
        missionSelect.onchange = () => {
            const val = missionSelect.value;
            selectedMissionId = val;
            if (customMissionWrap) {
                customMissionWrap.style.display = val === '__custom__' ? 'block' : 'none';
                if (val === '__custom__' && customMissionInput) customMissionInput.focus();
            }

            const { missionId } = getSelectedMissionMeta();
            const missionDocs = existingServerPdfs.filter((d) => getEffectiveDocMeta(d).missionId === missionId);

            if (missionDocs.length > 0 && !pendingBase64) {
                const firstDoc = missionDocs[0];
                const meta = getEffectiveDocMeta(firstDoc);
                uploadMode = 'existing';
                activeTargetFilename = firstDoc.filename;
                isManualFilename = false;
                if (targetNameInput) targetNameInput.value = firstDoc.filename;
                if (titleInput) titleInput.value = meta.title || '';
            } else {
                uploadMode = 'new';
                activeTargetFilename = '';
                if (!isManualFilename && targetNameInput) {
                    targetNameInput.value = pendingOriginalName
                        ? buildSuggestedFilename(pendingOriginalName, missionId)
                        : getMissionPrefix(missionId);
                }
            }

            renderQuickMissionDocsRow();
            updatePathHintAndUploadState();
        };
    }

    if (customMissionInput) {
        customMissionInput.oninput = () => {
            if (uploadMode === 'new' && !isManualFilename && targetNameInput) {
                const { missionId } = getSelectedMissionMeta();
                targetNameInput.value = pendingOriginalName
                    ? buildSuggestedFilename(pendingOriginalName, missionId)
                    : getMissionPrefix(missionId);
            }
            updatePathHintAndUploadState();
        };
    }

    if (targetNameInput) {
        targetNameInput.oninput = () => {
            isManualFilename = Boolean(targetNameInput.value.trim());
            updatePathHintAndUploadState();
        };
    }

    if (libraryFilter) {
        libraryFilter.onchange = () => {
            renderPdfLibraryList(existingServerPdfs);
        };
    }

    if (dropZone && fileInput) {
        dropZone.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handleSelectedFile(file);
        };

        dropZone.ondragover = (e) => {
            e.preventDefault();
            dropZone.classList.add('dragOver');
        };
        dropZone.ondragleave = () => {
            dropZone.classList.remove('dragOver');
        };
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragOver');
            const file = e.dataTransfer?.files && e.dataTransfer.files[0];
            if (file) handleSelectedFile(file);
        };
    }

    if (uploadBtn) {
        uploadBtn.onclick = () => performUpload(false);
    }

    if (saveMetaBtn) {
        saveMetaBtn.onclick = () => saveMetadataOnly();
    }

    if (refreshBtn) {
        refreshBtn.onclick = () => refreshAllManagerViews();
    }

    if (exportPackBtn && exportBox) {
        exportPackBtn.onclick = async () => {
            if (exportBox.style.display !== 'none') {
                exportBox.style.display = 'none';
                return;
            }
            const pkg = await buildExportableDocsPackage(existingServerPdfs);
            const localBtnsHtml = pkg.localOnlyFiles.map((f) => `
                <button type="button" class="devPdfMiniBtn devExportPdfFileBtn" data-filename="${escapeHtml(f.filename)}" title="${escapeHtml(f.reason || '')}">
                    ⬇️ ${escapeHtml(f.filename)} (${formatBytes(f.size)})
                </button>
            `).join('');

            exportBox.innerHTML = `
                <div class="devPdfExportHeader">
                    <span>📦 Exportar para GitHub (<code>public/assets/docs/</code> · ${pkg.localOnlyFiles.length} archivo(s) con cambios)</span>
                    <button type="button" id="devCloseExportBoxBtn" class="devPdfMiniBtn">✕</button>
                </div>
                <div class="devPdfExportActions">
                    <button type="button" id="devDownloadManifestBtn" class="devPdfMiniBtn">📄 Descargar docs_manifest.json</button>
                    <button type="button" id="devCopyAiPromptBtn" class="devPdfMiniBtn">📋 Copiar instrucción para AI Studio</button>
                    ${localBtnsHtml}
                </div>
            `;
            exportBox.style.display = 'flex';

            const closeBtn = document.getElementById('devCloseExportBoxBtn');
            if (closeBtn) closeBtn.onclick = () => { exportBox.style.display = 'none'; };

            const dlManifestBtn = document.getElementById('devDownloadManifestBtn');
            if (dlManifestBtn) {
                dlManifestBtn.onclick = () => {
                    triggerTextFileDownload('docs_manifest.json', pkg.manifestJson, 'application/json;charset=utf-8');
                    showDevToast('📄 Descargado docs_manifest.json');
                };
            }

            const copyAiPromptBtn = document.getElementById('devCopyAiPromptBtn');
            if (copyAiPromptBtn) {
                copyAiPromptBtn.onclick = () => {
                    copyTextSafe(pkg.aiStudioPrompt, '📋 Instrucción copiada para AI Studio');
                };
            }

            exportBox.querySelectorAll('.devExportPdfFileBtn').forEach((btn) => {
                btn.onclick = async () => {
                    const fname = btn.getAttribute('data-filename');
                    const fileObj = pkg.localOnlyFiles.find((x) => x.filename === fname);
                    if (!fileObj) return;
                    if (fileObj.base64Data) {
                        triggerBlobDownload(fileObj.filename, base64ToPdfBlob(fileObj.base64Data));
                        showDevToast(`⬇️ Descargado ${fileObj.filename}`);
                        return;
                    }
                    try {
                        const res = await fetch(`${fileObj.url}?v=${Date.now()}`, { cache: 'no-store' });
                        const blob = await res.blob();
                        triggerBlobDownload(fileObj.filename, blob);
                        showDevToast(`⬇️ Descargado ${fileObj.filename}`);
                    } catch {
                        showDevToast(`❌ No se pudo descargar ${fileObj.filename}`);
                    }
                };
            });
        };
    }

    populateMissionSelect(false);
    renderQuickMissionDocsRow();
    updatePathHintAndUploadState();
    refreshAllManagerViews();
}
