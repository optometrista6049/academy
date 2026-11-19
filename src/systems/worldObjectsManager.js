/* ======================================================
   MONTESERIN ACADEMY - WORLD OBJECTS MANAGER
   Gestor central de elementos 3D colocados en el escenario.
   Soporta persistencia en LocalStorage, cálculo automático de
   cota Y según el terreno (getHeightAt), y soporte unificado de:
   - Objetos del Sistema (procedurales del juego)
   - Modelos de la Biblioteca Personalizada (Three.js / Prompts)
   - Modelos .GLB / .GLTF subidos localmente desde el PC
   ====================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { scene } from '../core/scene.js';
import { getHeightAt } from '../terrain/terrainHeight.js';
import { getCustomItems, getCustomItemById, buildThreeMeshFromCode } from './customItemStorage.js';
import { createProceduralItem } from '../player/playerEquipment.js';
import { addCollidable, collidables, cameraObstacles } from '../entities/collisions.js';
import { registerCollidableInGrid, rebuildSpatialGrid, registerVisualInChunk, unregisterVisualFromChunk } from './chunkSystem.js';
import { createIndividualTree } from '../environment/trees.js';
import { createIndividualRock } from '../environment/rocks.js';
import { DEFAULT_PLACED_WORLD_OBJECTS, DEFAULT_PLACED_WORLD_OBJECTS_UPDATED_AT } from './worldObjectsDefaults.js';
import { DEV_CONFIG, isLocalEditorRuntime } from '../config/devConfig.js';
import { getBundledCustomModelDataUri } from './customAssetsBundle.js';

const STORAGE_KEY = 'monteserin_world_placed_objects_v1';
const STORAGE_UPDATED_KEY = 'monteserin_world_placed_objects_updated_v1';
const UPLOADED_MODELS_KEY = 'monteserin_custom_uploaded_models_v1';
const VERSIONS_KEY = 'monteserin_world_versions_v1';
const MAX_SCENE_VERSIONS = 15;
let staticOfficialWorldObjects = null;
let staticOfficialWorldUpdatedAt = 0;

// Mapa de instancias activas en la escena 3D viva: id -> { data, mesh }
const activeWorldObjects = new Map();
// Registro de objetos .GLB guardados cuyo binario no existe ni en servidor ni en IndexedDB
const missingWorldObjects = new Map();
// Registro extensible de fábricas individuales para futuros elementos procedurales instanciados
const proceduralIndividualFactories = new Map();

export function registerProceduralIndividualFactory(sourceType, factoryFn) {
    if (typeof sourceType === 'string' && sourceType.trim() && typeof factoryFn === 'function') {
        proceduralIndividualFactories.set(sourceType.trim(), factoryFn);
    }
}

// --- IndexedDB Cache para modelos .GLB personalizados ---
const GLB_DB_NAME = 'MonteserinCustomModelsDB';
const GLB_STORE_NAME = 'glb_models';

function openGlbDatabase() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB no disponible'));
        const request = indexedDB.open(GLB_DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(GLB_STORE_NAME)) {
                db.createObjectStore(GLB_STORE_NAME, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function storeGlbInLocalCache(key, arrayBufferOrBase64, filename) {
    try {
        const db = await openGlbDatabase();
        return new Promise((resolve) => {
            const tx = db.transaction(GLB_STORE_NAME, 'readwrite');
            const store = tx.objectStore(GLB_STORE_NAME);
            store.put({
                key,
                filename: filename || key,
                data: arrayBufferOrBase64,
                timestamp: Date.now()
            });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } catch (_) {
        return false;
    }
}

export async function getGlbFromLocalCache(key) {
    try {
        const db = await openGlbDatabase();
        return new Promise((resolve) => {
            const tx = db.transaction(GLB_STORE_NAME, 'readonly');
            const store = tx.objectStore(GLB_STORE_NAME);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result?.data || null);
            req.onerror = () => resolve(null);
        });
    } catch (_) {
        return null;
    }
}

/**
 * Normaliza la ruta de un modelo personalizado para usar ruta relativa compatible con raíz y subcarpetas (GitHub Pages: ./assets/models/custom/...).
 */
export function normalizeCustomModelUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const trimmed = url.trim();
    if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('./assets/')) return trimmed;
    if (trimmed.startsWith('/assets/')) return '.' + trimmed;
    if (trimmed.startsWith('assets/')) return './' + trimmed;
    return trimmed;
}

const serverReuploadInFlight = new Set();

/**
 * Re-sube automáticamente al servidor un .GLB almacenado en IndexedDB si el disco del servidor perdió el archivo.
 */
export async function reuploadCachedGlbToServer(urlOrFilename, cachedBase64Data) {
    const normalized = normalizeCustomModelUrl(urlOrFilename || '');
    const filename = (normalized.split('/').pop() || urlOrFilename || '').split('?')[0];
    if (!filename || !cachedBase64Data || typeof cachedBase64Data !== 'string') return false;
    if (serverReuploadInFlight.has(filename)) return false;

    serverReuploadInFlight.add(filename);
    try {
        const res = await fetch('/api/upload-custom-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename,
                base64Data: cachedBase64Data
            })
        });
        if (res.ok) {
            console.log(`[WorldObjectsManager] Auto-restaurado en servidor desde IndexedDB: ${filename}`);
            return true;
        }
    } catch (err) {
        console.warn('[WorldObjectsManager] No se pudo auto-restaurar GLB en servidor:', filename, err);
    } finally {
        serverReuploadInFlight.delete(filename);
    }
    return false;
}

/**
 * Comprueba la disponibilidad real de un modelo .GLB en el servidor y en la caché IndexedDB.
 * Si está en IndexedDB pero falta en servidor, intenta auto-restaurarlo en segundo plano.
 */
export async function checkGlbAvailability(rawUrl, filenameHint = '') {
    const url = normalizeCustomModelUrl(rawUrl || '');
    const filename = (filenameHint || (url ? url.split('/').pop() : '') || '').split('?')[0];

    let onServer = false;
    if (url && !url.startsWith('blob:') && !url.startsWith('data:')) {
        try {
            const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
            const ctype = (res.headers.get('content-type') || '').toLowerCase();
            onServer = res.ok && !ctype.includes('text/html');
        } catch (_) {
            onServer = false;
        }
    }

    const bundledData =
        (url ? getBundledCustomModelDataUri(url) : null) ||
        (filename ? getBundledCustomModelDataUri(filename) : null);
    const inBundle = Boolean(bundledData);

    const cachedData =
        (url ? await getGlbFromLocalCache(url) : null) ||
        (filename ? await getGlbFromLocalCache(filename) : null);
    const inCache = Boolean(cachedData);

    // Auto-sanar servidor local si el binario vive en IndexedDB pero faltaba en disco
    if (!onServer && inCache && filename && !url.startsWith('blob:') && isLocalEditorRuntime()) {
        const restored = await reuploadCachedGlbToServer(filename, cachedData);
        if (restored) {
            onServer = true;
        }
    }

    const status = onServer ? 'server' : (inBundle ? 'bundle' : (inCache ? 'cache' : 'missing'));
    return { status, onServer, inBundle, inCache, url, filename };
}

/**
 * Descubre los archivos .GLB presentes físicamente en public/assets/models/custom/ (por ejemplo tras clonar de GitHub)
 * y los añade al catálogo local del usuario si no estaban registrados.
 */
export async function syncServerModelsCatalog() {
    if (typeof window === 'undefined' || !isLocalEditorRuntime()) return [];
    try {
        const res = await fetch('/api/upload-custom-model', { method: 'GET', cache: 'no-store' });
        if (!res.ok) return getUploadedModelsCatalog();
        const data = await res.json();
        const serverModels = Array.isArray(data?.models) ? data.models : [];

        serverModels.forEach((m) => {
            if (!m || !m.filename || !m.url) return;
            registerUploadedModel({
                id: `server_${m.filename}`,
                filename: m.filename,
                name: m.filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
                url: normalizeCustomModelUrl(m.url),
                uploadedAt: Date.now()
            });
        });
    } catch (_) {}
    return getUploadedModelsCatalog();
}

/**
 * Revisa el catálogo local y auto-restaura en el servidor cualquier .GLB que exista en IndexedDB pero falte en disco.
 */
export async function syncCachedModelsToServer() {
    if (typeof window === 'undefined' || !isLocalEditorRuntime()) return;
    const catalog = getUploadedModelsCatalog();
    for (const item of catalog) {
        if (!item?.url || item.url.startsWith('blob:')) continue;
        await checkGlbAvailability(item.url, item.filename);
    }
}

const UP_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Normaliza una entrada de escala (número uniforme o vector {x, y, z}) a { x, y, z }.
 */
export function resolveScaleXYZ(scaleInput) {
    if (scaleInput && typeof scaleInput === 'object') {
        const sx = Number(scaleInput.x);
        const sy = Number(scaleInput.y);
        const sz = Number(scaleInput.z);
        return {
            x: Math.max(0.01, Number.isFinite(sx) && sx > 0 ? sx : 1.0),
            y: Math.max(0.01, Number.isFinite(sy) && sy > 0 ? sy : 1.0),
            z: Math.max(0.01, Number.isFinite(sz) && sz > 0 ? sz : 1.0)
        };
    }
    const s = Number(scaleInput);
    const val = Math.max(0.01, Number.isFinite(s) && s > 0 ? s : 1.0);
    return { x: val, y: val, z: val };
}

export function getObjectScaleXYZFromData(data) {
    if (data?.scaleXYZ && typeof data.scaleXYZ === 'object') {
        return resolveScaleXYZ(data.scaleXYZ);
    }
    return resolveScaleXYZ(data?.scale);
}

/**
 * Mide las dimensiones reales sin rotación (espacio local orientado) del objeto
 * incluyendo su escala actual y el posible desplazamiento del pivote respecto al centro.
 */
export function getObjectLocalBounds(mesh) {
    if (!mesh) {
        return {
            width: 1, height: 1, depth: 1,
            halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
            centerOffset: { x: 0, z: 0 }
        };
    }
    const prevRotX = mesh.rotation.x;
    const prevRotY = mesh.rotation.y;
    const prevRotZ = mesh.rotation.z;
    mesh.rotation.set(0, 0, 0);
    mesh.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(mesh);

    mesh.rotation.set(prevRotX, prevRotY, prevRotZ);
    mesh.updateMatrixWorld(true);

    if (box.isEmpty()) {
        return {
            width: 1, height: 1, depth: 1,
            halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
            centerOffset: { x: 0, y: 0.5, z: 0 }
        };
    }

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    return {
        width: Math.max(0.1, size.x),
        height: Math.max(0.1, size.y),
        depth: Math.max(0.1, size.z),
        halfExtents: {
            x: Math.max(0.1, size.x * 0.5),
            y: Math.max(0.1, size.y * 0.5),
            z: Math.max(0.1, size.z * 0.5)
        },
        centerOffset: {
            x: center.x - mesh.position.x,
            y: center.y - mesh.position.y,
            z: center.z - mesh.position.z
        }
    };
}

/**
 * Calcula y asigna tanto el radio espacial como la caja OBB 2D exacta para colisiones no uniformes.
 */
export function updateObjectCollisionMetadata(mesh) {
    if (!mesh) return 0.8;
    const bounds = getObjectLocalBounds(mesh);
    const radius = Math.max(0.4, Math.min(Math.hypot(bounds.halfExtents.x, bounds.halfExtents.z) * 0.9, 25.0));
    mesh.userData.radius = radius;
    mesh.userData.obbCollision = {
        halfX: bounds.halfExtents.x,
        halfZ: bounds.halfExtents.z,
        offsetX: bounds.centerOffset.x,
        offsetZ: bounds.centerOffset.z
    };
    return radius;
}

/**
 * Calcula con precisión física el radio cilíndrico de colisión para el Spatial Hash Grid
 * a partir de la geometría 3D real y la escala del objeto.
 */
export function calculateObjectCollisionRadius(mesh, scale = 1.0) {
    if (!mesh) return 0.8 * (typeof scale === 'number' ? scale : 1.0);
    return updateObjectCollisionMetadata(mesh);
}

/**
 * Optimiza las submallas del objeto para garantizar que el Frustum Culling
 * nativo de Three.js descarte instantáneamente geometrías fuera de visión.
 */
export function optimizeMeshForRendering(mesh) {
    if (!mesh) return;
    mesh.traverse((node) => {
        if (node.isMesh && node.geometry) {
            node.geometry.computeBoundingBox();
            node.geometry.computeBoundingSphere();
            node.frustumCulled = true;
        }
    });
}

/**
 * Libera de forma recursiva y profunda toda la memoria de VRAM y RAM:
 * geometrías (BufferGeometry), materiales y todas sus texturas asociadas.
 */
export function deepDisposeObject(root) {
    if (!root) return;
    root.traverse((node) => {
        if (node.isMesh) {
            if (node.geometry) {
                node.geometry.dispose();
            }
            if (node.material) {
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach((mat) => {
                    if (mat.map) mat.map.dispose();
                    if (mat.normalMap) mat.normalMap.dispose();
                    if (mat.roughnessMap) mat.roughnessMap.dispose();
                    if (mat.metalnessMap) mat.metalnessMap.dispose();
                    if (mat.bumpMap) mat.bumpMap.dispose();
                    if (mat.displacementMap) mat.displacementMap.dispose();
                    if (mat.emissiveMap) mat.emissiveMap.dispose();
                    mat.dispose();
                });
            }
        }
    });
}

/**
 * Elimina cualquier sufijo de copia acumulado al final del nombre
 * (ej: "(Copia)", "(Copia) (Copia)", "copia-1", "copia-2") para obtener el nombre raíz limpio.
 */
export function stripCopySuffix(name) {
    const raw = String(name || 'Elemento 3D').trim();
    const cleaned = raw
        .replace(/(?:\s*(?:\(copia(?:\s*\d+)?\)|copia-\d+))+$/gi, '')
        .trim();
    return cleaned || 'Elemento 3D';
}

/**
 * Genera el siguiente nombre limpio tipo "<NombreOriginal> copia-1", "copia-2", "copia-3"
 * revisando los objetos existentes para evitar repeticiones o cadenas "(Copia) (Copia)...".
 */
export function getNextCopyName(originalName, existingObjects = null) {
    const baseName = stripCopySuffix(originalName);
    const usedNumbers = new Set();

    const scanItem = (item) => {
        const n = (item?.name || item?.data?.name || '').trim();
        if (!n) return;
        if (stripCopySuffix(n).toLowerCase() !== baseName.toLowerCase()) return;
        const m = n.match(/\bcopia-(\d+)$/i);
        if (m) {
            const num = parseInt(m[1], 10);
            if (Number.isFinite(num) && num > 0) usedNumbers.add(num);
        }
    };

    if (Array.isArray(existingObjects)) {
        existingObjects.forEach(scanItem);
    } else {
        activeWorldObjects.forEach(entry => scanItem(entry.data));
        getSavedWorldObjects().forEach(scanItem);
    }

    let nextNum = 1;
    while (usedNumbers.has(nextNum)) {
        nextNum++;
    }
    return `${baseName} copia-${nextNum}`;
}

/**
 * Normaliza objetos heredados que tengan "(Copia)" o múltiples "(Copia) (Copia)"
 * convirtiéndolos en "<NombreOriginal> copia-1", "copia-2", etc. sin colisiones.
 */
export function normalizeLegacyCopyNames(objectsList) {
    if (!Array.isArray(objectsList)) return { list: [], changed: false };
    let changed = false;
    const usedByBase = new Map();

    // 1. Registrar números copia-N ya existentes para no pisarlos
    for (const obj of objectsList) {
        if (!obj || typeof obj !== 'object' || !obj.name) continue;
        const base = stripCopySuffix(obj.name).toLowerCase();
        const m = String(obj.name).trim().match(/\bcopia-(\d+)$/i);
        if (m) {
            const num = parseInt(m[1], 10);
            if (Number.isFinite(num) && num > 0) {
                if (!usedByBase.has(base)) usedByBase.set(base, new Set());
                usedByBase.get(base).add(num);
            }
        }
    }

    // 2. Convertir nombres con "(Copia)" o cadenas repetidas a "copia-1", "copia-2"...
    const list = objectsList.map((obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const nextObj = obj.url ? { ...obj, url: normalizeCustomModelUrl(obj.url) } : { ...obj };
        if (obj.url && nextObj.url !== obj.url) {
            changed = true;
        }
        if (typeof nextObj.name === 'string' && /\(copia(?:\s*\d+)?\)/i.test(nextObj.name)) {
            const base = stripCopySuffix(nextObj.name);
            const key = base.toLowerCase();
            if (!usedByBase.has(key)) usedByBase.set(key, new Set());
            const used = usedByBase.get(key);
            let n = 1;
            while (used.has(n)) n++;
            used.add(n);
            const cleanCopyName = `${base} copia-${n}`;
            if (nextObj.name !== cleanCopyName) {
                nextObj.name = cleanCopyName;
                changed = true;
            }
        }
        return nextObj;
    });

    return { list, changed };
}

/**
 * Obtiene la lista de objetos guardados en el escenario.
 */
export function getSavedWorldObjects() {
    if (!isLocalEditorRuntime()) {
        const official = staticOfficialWorldObjects || (Array.isArray(DEFAULT_PLACED_WORLD_OBJECTS) ? JSON.parse(JSON.stringify(DEFAULT_PLACED_WORLD_OBJECTS)) : []);
        return normalizeLegacyCopyNames(official).list;
    }

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const localUpdatedAt = Number(localStorage.getItem(STORAGE_UPDATED_KEY) || 0);
            const bakedUpdatedAt = Number(DEFAULT_PLACED_WORLD_OBJECTS_UPDATED_AT || 0);
            if (bakedUpdatedAt > localUpdatedAt && Array.isArray(DEFAULT_PLACED_WORLD_OBJECTS) && DEFAULT_PLACED_WORLD_OBJECTS.length > 0) {
                const bakedList = normalizeLegacyCopyNames(JSON.parse(JSON.stringify(DEFAULT_PLACED_WORLD_OBJECTS))).list;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(bakedList));
                localStorage.setItem(STORAGE_UPDATED_KEY, String(bakedUpdatedAt));
                return bakedList;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const { list, changed } = normalizeLegacyCopyNames(parsed);
                if (changed) {
                    try {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
                        localStorage.setItem(STORAGE_UPDATED_KEY, String(Date.now()));
                        sendWorldServerSync({ action: 'save-objects', objects: list });
                    } catch (_) {}
                }
                return list;
            }
        }
    } catch (err) {
        console.warn('[WorldObjectsManager] Error leyendo objetos del mundo:', err);
    }
    const defaults = Array.isArray(DEFAULT_PLACED_WORLD_OBJECTS) ? JSON.parse(JSON.stringify(DEFAULT_PLACED_WORLD_OBJECTS)) : [];
    return normalizeLegacyCopyNames(defaults).list;
}

/**
 * Guarda la lista completa en LocalStorage y la sincroniza con el servidor.
 */
export function saveWorldObjects(objectsList, explicitUpdatedAt = null) {
    const normalized = Array.isArray(objectsList)
        ? objectsList.map(obj => (obj && typeof obj === 'object' && obj.url ? { ...obj, url: normalizeCustomModelUrl(obj.url) } : obj))
        : [];
    const ts = Number(explicitUpdatedAt) || Date.now();
    if (!isLocalEditorRuntime()) {
        staticOfficialWorldObjects = normalized;
        staticOfficialWorldUpdatedAt = ts;
        return;
    }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        localStorage.setItem(STORAGE_UPDATED_KEY, String(ts));
    } catch (err) {
        console.error('[WorldObjectsManager] Error guardando objetos del mundo:', err);
    }
    sendWorldServerSync({ action: 'save-objects', objects: normalized, updatedAt: ts });
}

/**
 * Obtiene la lista de modelos locales subidos por el usuario.
 */
export function getUploadedModelsCatalog() {
    try {
        const raw = localStorage.getItem(UPLOADED_MODELS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(item => (
            item && typeof item === 'object' && item.url
                ? { ...item, url: normalizeCustomModelUrl(item.url) }
                : item
        ));
    } catch (_) {
        return [];
    }
}

/**
 * Registra un modelo subido desde el PC en el catálogo persistente.
 */
export function registerUploadedModel(modelInfo) {
    const normalizedInfo = {
        ...modelInfo,
        url: normalizeCustomModelUrl(modelInfo.url)
    };
    const list = getUploadedModelsCatalog();
    const safeFile = normalizedInfo.filename ? normalizedInfo.filename.replace(/[^a-zA-Z0-9._-]/g, '_') : '';
    const existingIdx = list.findIndex(m =>
        m.id === normalizedInfo.id ||
        (normalizedInfo.filename && m.filename === normalizedInfo.filename) ||
        (safeFile && m.url && m.url.endsWith('/' + safeFile))
    );
    if (existingIdx >= 0) {
        list[existingIdx] = { ...list[existingIdx], ...normalizedInfo };
    } else {
        list.unshift(normalizedInfo);
    }
    try {
        localStorage.setItem(UPLOADED_MODELS_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('[WorldObjectsManager] Error guardando catálogo de subidos:', e);
    }
    return list;
}

/**
 * Calcula con exactitud matemática el offset en Y para que el punto más
 * bajo del modelo repose exactamente sobre el suelo.
 *
 * @param {THREE.Object3D} mesh Modelo 3D a evaluar
 * @returns {number} Offset que sumado a getHeightAt(x, z) sitúa la base en el suelo
 */
export function computeGroundOffset(mesh) {
    if (!mesh) return 0;
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return 0;
    // La distancia desde la posición central/pivote Y actual hasta la base box.min.y
    return mesh.position.y - box.min.y;
}

/**
 * Posiciona un objeto con precisión en las coordenadas (x, z) del terreno,
 * asegurando que conserve su altura relativa natural respecto al suelo (groundOffset / enterramiento).
 *
 * @param {THREE.Object3D} mesh Modelo 3D a posicionar
 * @param {number} x Coordenada X destino
 * @param {number} z Coordenada Z destino
 * @param {number|null} customOffset Offset relativo opcional respecto al suelo. Si es null, usa el offset natural o preexistente.
 */
export function snapObjectToTerrain(mesh, x, z, customOffset = null) {
    if (!mesh) return;

    // 1. Determinar el offset relativo respecto a la superficie del suelo
    let finalOffset = 0;

    if (typeof customOffset === 'number') {
        finalOffset = customOffset;
        mesh.userData.relativeGroundOffset = finalOffset;
    } else if (typeof mesh.userData?.relativeGroundOffset === 'number') {
        // Preservar el enterramiento o elevación relativa que ya tenía asignada este objeto
        finalOffset = mesh.userData.relativeGroundOffset;
    } else {
        // Si es una roca (pivote en el centro), preservar su posición natural a medio enterrar (offset = 0)
        const isRock = mesh.userData?.isRock || mesh.name?.includes('rock');
        const isTree = mesh.userData?.isTree || mesh.name?.includes('tree');

        if (isRock) {
            finalOffset = 0; // Centro en cota de tierra: 50% enterrada naturalmente
        } else if (isTree) {
            finalOffset = -0.35; // Raíces ancladas en el subsuelo
        } else {
            finalOffset = computeGroundOffset(mesh); // Apoyo en su base
        }
        mesh.userData.relativeGroundOffset = finalOffset;
    }

    const groundY = getHeightAt(x, z);
    mesh.position.set(x, groundY + finalOffset, z);
    mesh.updateMatrixWorld(true);
}

/**
 * Construye una instancia 3D a partir de una descripción de objeto (sistema, custom o glb).
 *
 * @param {object} itemDesc Descripción del ítem ({ source, sourceId, url, code, ... })
 * @returns {Promise<THREE.Object3D|null>} Objeto 3D instanciado
 */
export async function instantiateWorldObject(itemDesc) {
    if (!itemDesc) return null;

    // 1. Objeto de la Biblioteca Personalizada (Three.js procedural)
    // Prioriza siempre el catálogo vivo por sourceId para que mejoras al modelo se reflejen automáticamente
    if (itemDesc.source === 'custom' || itemDesc.code) {
        const liveItem = itemDesc.sourceId ? getCustomItemById(itemDesc.sourceId) : null;
        const code = liveItem?.code || itemDesc.code;
        if (code) {
            const built = buildThreeMeshFromCode(code);
            if (built && built.success && built.object) {
                const root = built.object;
                root.name = `worldObj_${itemDesc.id || 'custom'}`;
                return root;
            }
        }
    }

    // 2. Modelo 3D .GLB / .GLTF (externo del PC o de assets)
    if (itemDesc.source === 'glb' || itemDesc.url) {
        let url = normalizeCustomModelUrl(itemDesc.url);
        if (url) {

            return new Promise((resolve) => {
                const loader = new GLTFLoader();
                loader.setWithCredentials(true);

                const setupModel = (gltf) => {
                    const model = gltf.scene || gltf.scenes[0];
                    model.name = `worldObj_${itemDesc.id || 'glb'}`;

                    // Sombras
                    model.traverse((node) => {
                        if (node.isMesh) {
                            node.castShadow = true;
                            node.receiveShadow = true;
                        }
                    });

                    // Normalización inicial si es necesario
                    const box = new THREE.Box3().setFromObject(model);
                    const size = new THREE.Vector3();
                    box.getSize(size);
                    const maxDim = Math.max(size.x, size.y, size.z);
                    if (maxDim > 0 && (maxDim > 10.0 || maxDim < 0.05)) {
                        model.scale.multiplyScalar(1.5 / maxDim);
                    }

                    resolve(model);
                };

                const handleMissing = () => {
                    if (itemDesc.failOnMissingGlb) {
                        resolve(null);
                        return;
                    }
                    const fallback = createFallbackObject(itemDesc.name || 'Objeto GLB');
                    fallback.userData.isMissingGlbFallback = true;
                    fallback.userData.missingGlbUrl = url;
                    fallback.userData.missingGlbName = itemDesc.name || 'Objeto GLB';
                    resolve(fallback);
                };

                const tryIndexedDbRescue = async () => {
                    try {
                        const filename = (url.split('/').pop() || '').split('?')[0];
                        const cachedData = (await getGlbFromLocalCache(url)) ||
                                           (filename ? await getGlbFromLocalCache(filename) : null);
                        if (cachedData) {
                            console.log('[WorldObjectsManager] ¡Rescatando y renderizando modelo GLB desde IndexedDB local!', itemDesc.name || filename);
                            if (filename && !url.startsWith('blob:') && isLocalEditorRuntime()) {
                                reuploadCachedGlbToServer(filename, cachedData);
                            }
                            loader.load(
                                cachedData,
                                setupModel,
                                undefined,
                                () => handleMissing()
                            );
                            return;
                        }
                    } catch (cacheErr) {
                        console.warn('[WorldObjectsManager] Error en rescate IndexedDB:', cacheErr);
                    }
                    handleMissing();
                };

                loader.load(
                    url,
                    setupModel,
                    undefined,
                    async (err) => {
                        console.warn('[WorldObjectsManager] URL GLB no disponible, intentando bundle embebido / caché:', url, err?.message || err);

                        const bundledDataUri = getBundledCustomModelDataUri(url) || getBundledCustomModelDataUri(itemDesc.name || '');
                        if (bundledDataUri) {
                            loader.load(
                                bundledDataUri,
                                setupModel,
                                undefined,
                                async () => {
                                    await tryIndexedDbRescue();
                                }
                            );
                            return;
                        }

                        await tryIndexedDbRescue();
                    }
                );
            });
        }
    }

    // 3. Objeto del Sistema (Linterna, Llave, Cuaderno, etc.)
    if (itemDesc.source === 'system' || itemDesc.sourceId) {
        const sysId = itemDesc.sourceId || 'flashlight';
        const model = createProceduralItem(sysId);
        if (model) {
            model.name = `worldObj_${itemDesc.id || sysId}`;
            return model;
        }
    }

    // 4. Árbol individual persistente
    if (itemDesc.source === 'tree') {
        const archIdx = typeof itemDesc.archetypeIndex === 'number' ? itemDesc.archetypeIndex : 0;
        const tree = createIndividualTree(archIdx, itemDesc.trunkColor, itemDesc.leafColor);
        tree.name = `worldObj_${itemDesc.id || 'tree'}`;
        return tree;
    }

    // 5. Roca individual persistente
    if (itemDesc.source === 'rock') {
        const geoType = typeof itemDesc.geoType !== 'undefined' ? itemDesc.geoType : 0;
        const rock = createIndividualRock(geoType, itemDesc.rockColor);
        rock.name = `worldObj_${itemDesc.id || 'rock'}`;
        return rock;
    }

    // 6. Cualquier elemento procedural futuro registrado dinámicamente o con fábrica propia
    if (itemDesc.source && proceduralIndividualFactories.has(itemDesc.source)) {
        const factory = proceduralIndividualFactories.get(itemDesc.source);
        const created = await factory(itemDesc);
        if (created) {
            created.name = created.name || `worldObj_${itemDesc.id || itemDesc.source}`;
            return created;
        }
    }

    // Fallback geométrico visible
    return createFallbackObject(itemDesc.name || 'Objeto');
}

/**
 * Crea una geometría sólida decorativa en caso de que falte el asset.
 */
function createFallbackObject(name = 'Objeto') {
    const group = new THREE.Group();
    group.name = `fallback_${name}`;

    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.25;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
}

/**
 * Añade un objeto al mundo en la escena 3D viva.
 * Si shouldPersist es false, solo permanece en memoria activa (staged) hasta que se guarde/hornee.
 */
export async function placeObjectInWorld(itemDesc, position, rotationY = 0, scale = 1.0, isSolid = true, shouldPersist = true) {
    const id = itemDesc.id || `world_obj_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const normalizedDesc = itemDesc.url ? { ...itemDesc, url: normalizeCustomModelUrl(itemDesc.url) } : itemDesc;
    const isGlbPlacement = normalizedDesc.source === 'glb' && !normalizedDesc.allowMissingFallback;
    const mesh = await instantiateWorldObject(isGlbPlacement ? { ...normalizedDesc, failOnMissingGlb: true } : normalizedDesc);
    if (!mesh) {
        return isGlbPlacement ? { missingGlb: true, url: normalizedDesc.url, name: normalizedDesc.name } : null;
    }

    // Aplicar escala (soporta número uniforme o vector {x, y, z})
    const sXYZ = resolveScaleXYZ(itemDesc.scaleXYZ || scale);
    const avgScale = Number(((sXYZ.x + sXYZ.y + sXYZ.z) / 3).toFixed(4));
    mesh.scale.set(sXYZ.x, sXYZ.y, sXYZ.z);

    // Aplicar rotación (soporta rotación 3D completa para rocas/procedurales o solo Y)
    const rotYVal = typeof rotationY === 'number' ? rotationY : 0;
    let savedRotXYZ = null;
    if (itemDesc.rotationXYZ && typeof itemDesc.rotationXYZ === 'object') {
        const rx = Number(itemDesc.rotationXYZ.x) || 0;
        const ry = Number.isFinite(Number(itemDesc.rotationXYZ.y)) ? Number(itemDesc.rotationXYZ.y) : rotYVal;
        const rz = Number(itemDesc.rotationXYZ.z) || 0;
        mesh.rotation.set(rx, ry, rz);
        if (Math.abs(rx) > 0.0001 || Math.abs(rz) > 0.0001) {
            savedRotXYZ = { x: rx, y: ry, z: rz };
        }
    } else {
        mesh.rotation.y = rotYVal;
    }

    // Calcular y colocar exactamente sobre el terreno con el offset correspondiente
    const explicitOffset = typeof itemDesc.defaultGroundOffset === 'number' ? itemDesc.defaultGroundOffset : null;
    snapObjectToTerrain(mesh, position.x, position.z, explicitOffset);
    mesh.userData.manualElevationDelta = 0;

    // Configurar estado sólido/traspasable y caja OBB exacta
    const solid = itemDesc.isSolid !== undefined ? Boolean(itemDesc.isSolid) : Boolean(isSolid);
    const radius = updateObjectCollisionMetadata(mesh);
    mesh.userData.radius = radius;
    mesh.userData.isSolid = solid;
    mesh.userData.isWorldObject = true;
    mesh.userData.worldId = id;
    mesh.userData.logicType = itemDesc.logicType || 'default';
    mesh.userData.logicConfig = itemDesc.logicConfig ? { ...itemDesc.logicConfig } : {};

    // Si es sólido, registrar en el Spatial Hash Grid de colisiones físicas y obstáculos de cámara
    if (solid) {
        addCollidable(mesh);
        if (!cameraObstacles.includes(mesh)) {
            cameraObstacles.push(mesh);
        }
    }

    // Registrar en el sistema de Chunks espaciales (LOD / Culling a más de 180m)
    registerVisualInChunk(mesh, mesh.position.x, mesh.position.z);

    // Optimizar para Frustum Culling
    optimizeMeshForRendering(mesh);

    // Añadir a la escena viva del juego
    scene.add(mesh);

    const record = {
        id,
        name: itemDesc.name || 'Elemento 3D',
        icon: itemDesc.icon || '📦',
        source: itemDesc.source || 'custom',
        sourceId: itemDesc.sourceId || null,
        url: itemDesc.url || null,
        code: itemDesc.code || null,
        archetypeIndex: itemDesc.archetypeIndex,
        trunkColor: itemDesc.trunkColor,
        leafColor: itemDesc.leafColor,
        geoType: itemDesc.geoType,
        rockColor: itemDesc.rockColor,
        proceduralParams: itemDesc.proceduralParams ? { ...itemDesc.proceduralParams } : undefined,
        isSolid: solid,
        logicType: itemDesc.logicType || 'default',
        logicConfig: itemDesc.logicConfig ? { ...itemDesc.logicConfig } : {},
        position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
        relativeGroundOffset: mesh.userData.relativeGroundOffset,
        rotationY: mesh.rotation.y,
        rotationXYZ: savedRotXYZ || undefined,
        scale: avgScale,
        scaleXYZ: sXYZ,
        placedAt: Date.now()
    };

    activeWorldObjects.set(id, { data: record, mesh });

    if (shouldPersist) {
        const all = getSavedWorldObjects();
        all.push(record);
        saveWorldObjects(all);
    }

    return { record, mesh };
}

/**
 * Actualiza la posición, rotación, escala (uniforme o por eje X/Y/Z) o solidez de un objeto ya colocado.
 * Si shouldPersist es false, solo actualiza la malla viva y datos en memoria (modo edición/staged).
 * Si shouldPersist es true, sincroniza con LocalStorage y el servidor.
 */
export function updatePlacedObjectTransform(id, { x, z, position, rotationY, scale, scaleXYZ, isSolid }, shouldPersist = true) {
    const entry = activeWorldObjects.get(id);
    if (!entry) return null;

    const { data, mesh } = entry;
    let transformChanged = false;

    if ((scaleXYZ && typeof scaleXYZ === 'object') || (typeof scale === 'number' && scale > 0)) {
        const prevBaseOffset = computeGroundOffset(mesh);
        const manualDelta = typeof mesh.userData.manualElevationDelta === 'number'
            ? mesh.userData.manualElevationDelta
            : (typeof mesh.userData.relativeGroundOffset === 'number'
                ? (mesh.userData.relativeGroundOffset - prevBaseOffset)
                : 0);

        const sXYZ = resolveScaleXYZ(scaleXYZ || scale);
        mesh.scale.set(sXYZ.x, sXYZ.y, sXYZ.z);
        data.scaleXYZ = sXYZ;
        data.scale = Number(((sXYZ.x + sXYZ.y + sXYZ.z) / 3).toFixed(4));

        // Recalcular apoyo al terreno cuando cambia la altura/escala Y (para que no flote ni se hunda)
        const isRock = mesh.userData?.isRock || mesh.name?.includes('rock');
        const isTree = mesh.userData?.isTree || mesh.name?.includes('tree');
        if (!isRock && !isTree) {
            const newBaseOffset = computeGroundOffset(mesh);
            snapObjectToTerrain(mesh, mesh.position.x, mesh.position.z, newBaseOffset + manualDelta);
            data.position = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
            data.relativeGroundOffset = mesh.userData.relativeGroundOffset;
        }

        updateObjectCollisionMetadata(mesh);
        optimizeMeshForRendering(mesh);
        transformChanged = true;
    }

    if (typeof rotationY === 'number') {
        mesh.rotation.y = rotationY;
        data.rotationY = rotationY;
        transformChanged = true;
    }

    const posX = x !== undefined ? x : (position?.x !== undefined ? position.x : undefined);
    const posZ = z !== undefined ? z : (position?.z !== undefined ? position.z : undefined);
    const elevY = position?.elevationOffset !== undefined ? position.elevationOffset : undefined;

    if (posX !== undefined || posZ !== undefined || elevY !== undefined) {
        const newX = posX !== undefined ? posX : mesh.position.x;
        const newZ = posZ !== undefined ? posZ : mesh.position.z;

        if (typeof elevY === 'number') {
            const baseOff = (mesh.userData?.isRock || mesh.userData?.isTree) ? (mesh.userData?.isRock ? 0 : -0.35) : computeGroundOffset(mesh);
            mesh.userData.manualElevationDelta = elevY - baseOff;
        }

        // Migrar de chunk visual al moverse
        unregisterVisualFromChunk(mesh);
        snapObjectToTerrain(mesh, newX, newZ, elevY);
        registerVisualInChunk(mesh, mesh.position.x, mesh.position.z);

        data.position = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
        data.relativeGroundOffset = mesh.userData.relativeGroundOffset;
        transformChanged = true;
    }

    // Cambiar estado Sólido / Traspasable si se solicita
    if (isSolid !== undefined) {
        const newSolid = Boolean(isSolid);
        data.isSolid = newSolid;
        mesh.userData.isSolid = newSolid;

        if (newSolid) {
            if (!collidables.includes(mesh)) {
                collidables.push(mesh);
            }
            if (!cameraObstacles.includes(mesh)) {
                cameraObstacles.push(mesh);
            }
        } else {
            const cIdx = collidables.indexOf(mesh);
            if (cIdx >= 0) collidables.splice(cIdx, 1);
            const camIdx = cameraObstacles.indexOf(mesh);
            if (camIdx >= 0) cameraObstacles.splice(camIdx, 1);
        }
        transformChanged = true;
    }

    // Si cambió posición, escala o solidez, reconstruir el Spatial Hash Grid
    if (transformChanged) {
        rebuildSpatialGrid(collidables);
    }

    // Sincronizar persistencia únicamente si se solicita explícitamente
    if (shouldPersist) {
        const all = getSavedWorldObjects();
        const idx = all.findIndex(o => o.id === id);
        if (idx >= 0) {
            all[idx] = { ...data };
            saveWorldObjects(all);
        }
    }

    return entry;
}

/**
 * Persiste explícitamente todos los objetos activos en memoria a LocalStorage y al servidor.
 */
export function commitStagedWorldObjects() {
    const all = [];
    activeWorldObjects.forEach((entry) => {
        all.push({ ...entry.data });
    });
    saveWorldObjects(all);
    return all;
}

/**
 * Conmuta entre estado Sólido (con colisión) y Traspasable (sin colisión)
 */
export function toggleObjectSolidState(id) {
    const entry = activeWorldObjects.get(id);
    if (!entry) return null;
    const currentSolid = entry.data.isSolid !== false;
    const newSolid = !currentSolid;
    updatePlacedObjectTransform(id, { isSolid: newSolid });
    return { id, isSolid: newSolid, name: entry.data.name };
}

/**
 * Duplica un objeto del mundo existente manteniendo su modelo, rotación,
 * escala, estado de colisión y configuración lógica, asignándole un nuevo
 * ID único y colocándolo desplazado en el terreno.
 *
 * @param {string} id ID del objeto original a duplicar
 * @param {{x?: number, z?: number}} [customOffset] Desplazamiento opcional
 * @returns {Promise<{ record: object, mesh: THREE.Object3D, id: string, type: string, data: object }|null>}
 */
export async function duplicateWorldObject(id, customOffset = null, shouldPersist = true) {
    const entry = activeWorldObjects.get(id);
    let originalData = entry ? entry.data : null;

    if (!originalData) {
        const saved = getSavedWorldObjects();
        originalData = saved.find(o => o.id === id);
    }
    if (!originalData) {
        console.warn('[WorldObjectsManager] No se encontró el objeto original a duplicar:', id);
        return null;
    }

    const sXYZ = getObjectScaleXYZFromData(originalData);
    const currentRotY = typeof originalData.rotationY === 'number' ? originalData.rotationY : 0;
    const radius = entry?.mesh?.userData?.radius || (1.5 * sXYZ.x);

    // Calcular desplazamiento inteligente para que la copia no quede tapando exactamente al original
    const offsetDistance = Math.max(2.2, radius * 2.2);
    const offsetX = customOffset && typeof customOffset.x === 'number' ? customOffset.x : offsetDistance;
    const offsetZ = customOffset && typeof customOffset.z === 'number' ? customOffset.z : offsetDistance;

    const origPos = entry?.mesh?.position ? entry.mesh.position : (originalData.position || { x: 0, y: 0, z: 0 });
    const newPos = {
        x: origPos.x + offsetX,
        y: origPos.y,
        z: origPos.z + offsetZ
    };

    const nextCopyName = getNextCopyName(originalData.name);
    const duplicateDesc = {
        name: nextCopyName,
        icon: originalData.icon || '📦',
        source: originalData.source || 'custom',
        sourceId: originalData.sourceId || null,
        url: originalData.url || null,
        code: originalData.code || null,
        archetypeIndex: originalData.archetypeIndex,
        trunkColor: originalData.trunkColor,
        leafColor: originalData.leafColor,
        geoType: originalData.geoType,
        rockColor: originalData.rockColor,
        proceduralParams: originalData.proceduralParams ? { ...originalData.proceduralParams } : undefined,
        rotationXYZ: originalData.rotationXYZ ? { ...originalData.rotationXYZ } : undefined,
        scaleXYZ: sXYZ,
        isSolid: originalData.isSolid !== false,
        logicType: originalData.logicType || 'default',
        logicConfig: originalData.logicConfig ? JSON.parse(JSON.stringify(originalData.logicConfig)) : {}
    };

    const placed = await placeObjectInWorld(
        duplicateDesc,
        newPos,
        currentRotY,
        sXYZ,
        duplicateDesc.isSolid,
        shouldPersist
    );

    if (placed && placed.record) {
        return {
            id: placed.record.id,
            record: placed.record,
            data: placed.record,
            mesh: placed.mesh,
            type: 'custom'
        };
    }
    return null;
}

/**
 * Clona un objeto colocándolo contiguo borde-con-borde según su orientación y dimensiones reales.
 * Ideal para encadenar vallas, muros, aceras o módulos en línea exacta.
 *
 * @param {string} id ID del objeto original
 * @param {'auto'|'right'|'left'|'front'|'back'} direction Dirección local respecto al objeto
 */
export async function duplicateWorldObjectAdjacent(id, direction = 'auto', shouldPersist = true) {
    const entry = activeWorldObjects.get(id);
    if (!entry || !entry.mesh) {
        return duplicateWorldObject(id, null, shouldPersist);
    }

    const originalData = entry.data;
    const mesh = entry.mesh;
    const bounds = getObjectLocalBounds(mesh);
    const rotY = mesh.rotation.y || 0;
    const sXYZ = getObjectScaleXYZFromData(originalData);

    let chosenDir = direction;
    if (chosenDir === 'auto') {
        chosenDir = bounds.width >= bounds.depth ? 'right' : 'front';
    }

    let localDx = 0;
    let localDz = 0;
    if (chosenDir === 'right') localDx = bounds.width;
    else if (chosenDir === 'left') localDx = -bounds.width;
    else if (chosenDir === 'front') localDz = bounds.depth;
    else if (chosenDir === 'back') localDz = -bounds.depth;

    const worldDelta = new THREE.Vector3(localDx, 0, localDz).applyAxisAngle(UP_AXIS, rotY);
    const newPos = {
        x: mesh.position.x + worldDelta.x,
        y: mesh.position.y,
        z: mesh.position.z + worldDelta.z
    };

    const nextCopyName = getNextCopyName(originalData.name);
    const duplicateDesc = {
        name: nextCopyName,
        icon: originalData.icon || '📦',
        source: originalData.source || 'custom',
        sourceId: originalData.sourceId || null,
        url: originalData.url || null,
        code: originalData.code || null,
        archetypeIndex: originalData.archetypeIndex,
        trunkColor: originalData.trunkColor,
        leafColor: originalData.leafColor,
        geoType: originalData.geoType,
        rockColor: originalData.rockColor,
        proceduralParams: originalData.proceduralParams ? { ...originalData.proceduralParams } : undefined,
        rotationXYZ: originalData.rotationXYZ ? { ...originalData.rotationXYZ } : undefined,
        scaleXYZ: sXYZ,
        isSolid: originalData.isSolid !== false,
        logicType: originalData.logicType || 'default',
        logicConfig: originalData.logicConfig ? JSON.parse(JSON.stringify(originalData.logicConfig)) : {}
    };

    const placed = await placeObjectInWorld(
        duplicateDesc,
        newPos,
        rotY,
        sXYZ,
        duplicateDesc.isSolid,
        shouldPersist
    );

    if (placed && placed.record) {
        return {
            id: placed.record.id,
            record: placed.record,
            data: placed.record,
            mesh: placed.mesh,
            type: 'custom',
            directionUsed: chosenDir
        };
    }
    return null;
}

/**
 * Calcula un punto y rotación imantados borde-a-borde respecto al objeto colocado más cercano.
 * Permite alinear automáticamente vallas o estructuras en línea recta o en ángulo de 90°.
 */
export function computeSnapPositionForObject(movingMesh, targetX, targetZ, currentRotY = 0, options = {}) {
    const threshold = typeof options.threshold === 'number' ? options.threshold : 0.85;
    const snapRotation = options.snapRotation !== false;
    const excludeId = options.excludeId || null;

    if (!movingMesh || activeWorldObjects.size === 0) {
        return { snapped: false, x: targetX, z: targetZ, rotationY: currentRotY };
    }

    const mBounds = getObjectLocalBounds(movingMesh);
    const mMaxR = Math.hypot(mBounds.halfExtents.x, mBounds.halfExtents.z);

    let bestCandidate = null;
    let bestScore = Infinity;

    activeWorldObjects.forEach((entry, id) => {
        if (excludeId && id === excludeId) return;
        const nMesh = entry.mesh;
        if (!nMesh || nMesh === movingMesh) return;

        const nBounds = getObjectLocalBounds(nMesh);
        const nMaxR = Math.hypot(nBounds.halfExtents.x, nBounds.halfExtents.z);
        const approxDist = Math.hypot(targetX - nMesh.position.x, targetZ - nMesh.position.z);
        if (approxDist > mMaxR + nMaxR + threshold + 2.5) return;

        const nRotY = nMesh.rotation.y || 0;
        let snappedRotY = currentRotY;
        if (snapRotation) {
            const quarterTurn = Math.PI * 0.5;
            const relStep = Math.round((currentRotY - nRotY) / quarterTurn);
            const candidateRot = nRotY + relStep * quarterTurn;
            // Si el ángulo actual está razonablemente cerca (<35°) de múltiplo de 90° respecto al vecino, alinear
            const angDiff = Math.atan2(Math.sin(currentRotY - candidateRot), Math.cos(currentRotY - candidateRot));
            if (Math.abs(angDiff) <= 0.62) {
                snappedRotY = candidateRot;
            }
        }

        const relAngle = snappedRotY - nRotY;
        const cosRel = Math.abs(Math.cos(relAngle));
        const sinRel = Math.abs(Math.sin(relAngle));
        const mProjHalfX = mBounds.halfExtents.x * cosRel + mBounds.halfExtents.z * sinRel;
        const mProjHalfZ = mBounds.halfExtents.x * sinRel + mBounds.halfExtents.z * cosRel;

        const nCenterWorldOffset = new THREE.Vector3(nBounds.centerOffset.x, 0, nBounds.centerOffset.z).applyAxisAngle(UP_AXIS, nRotY);
        const nCenterX = nMesh.position.x + nCenterWorldOffset.x;
        const nCenterZ = nMesh.position.z + nCenterWorldOffset.z;

        const mCenterWorldOffset = new THREE.Vector3(mBounds.centerOffset.x, 0, mBounds.centerOffset.z).applyAxisAngle(UP_AXIS, snappedRotY);
        const dx = (targetX + mCenterWorldOffset.x) - nCenterX;
        const dz = (targetZ + mCenterWorldOffset.z) - nCenterZ;

        const cosN = Math.cos(nRotY);
        const sinN = Math.sin(nRotY);
        const lx = dx * cosN - dz * sinN;
        const lz = dx * sinN + dz * cosN;

        const idealRightX = nBounds.halfExtents.x + mProjHalfX;
        const idealLeftX = -(nBounds.halfExtents.x + mProjHalfX);
        const idealFrontZ = nBounds.halfExtents.z + mProjHalfZ;
        const idealBackZ = -(nBounds.halfExtents.z + mProjHalfZ);

        const faces = [
            { axis: 'x', target: idealRightX, perp: lz, perpLimit: nBounds.halfExtents.z + mProjHalfZ + threshold, alignMax: Math.abs(nBounds.halfExtents.z - mProjHalfZ) },
            { axis: 'x', target: idealLeftX, perp: lz, perpLimit: nBounds.halfExtents.z + mProjHalfZ + threshold, alignMax: Math.abs(nBounds.halfExtents.z - mProjHalfZ) },
            { axis: 'z', target: idealFrontZ, perp: lx, perpLimit: nBounds.halfExtents.x + mProjHalfX + threshold, alignMax: Math.abs(nBounds.halfExtents.x - mProjHalfX) },
            { axis: 'z', target: idealBackZ, perp: lx, perpLimit: nBounds.halfExtents.x + mProjHalfX + threshold, alignMax: Math.abs(nBounds.halfExtents.x - mProjHalfX) }
        ];

        for (const f of faces) {
            const valAlong = f.axis === 'x' ? lx : lz;
            const distToFace = Math.abs(valAlong - f.target);
            if (distToFace <= threshold && Math.abs(f.perp) <= f.perpLimit) {
                let snappedLx = f.axis === 'x' ? f.target : lx;
                let snappedLz = f.axis === 'z' ? f.target : lz;

                // Auto-centrado en línea recta si está cerca del eje del vecino
                if (f.axis === 'x') {
                    if (Math.abs(snappedLz) <= 0.45) snappedLz = 0;
                    else if (Math.abs(Math.abs(snappedLz) - f.alignMax) <= 0.35) {
                        snappedLz = Math.sign(snappedLz) * f.alignMax;
                    }
                } else {
                    if (Math.abs(snappedLx) <= 0.45) snappedLx = 0;
                    else if (Math.abs(Math.abs(snappedLx) - f.alignMax) <= 0.35) {
                        snappedLx = Math.sign(snappedLx) * f.alignMax;
                    }
                }

                const snappedWorldOffset = new THREE.Vector3(snappedLx, 0, snappedLz).applyAxisAngle(UP_AXIS, nRotY);
                const finalX = nCenterX + snappedWorldOffset.x - mCenterWorldOffset.x;
                const finalZ = nCenterZ + snappedWorldOffset.z - mCenterWorldOffset.z;
                const moveDist = Math.hypot(finalX - targetX, finalZ - targetZ);

                if (distToFace < bestScore) {
                    bestScore = distToFace;
                    bestCandidate = {
                        snapped: true,
                        x: finalX,
                        z: finalZ,
                        rotationY: snappedRotY,
                        moveDist,
                        targetName: entry.data?.name || 'Objeto'
                    };
                }
            }
        }
    });

    if (bestCandidate) {
        return bestCandidate;
    }

    return { snapped: false, x: targetX, z: targetZ, rotationY: currentRotY };
}

/**
 * Actualiza la información lógica, nombre o comportamiento de un objeto colocado.
 *
 * @param {string} id ID del objeto
 * @param {{ name?: string, icon?: string, logicType?: string, logicConfig?: object, isSolid?: boolean }} logicData
 * @returns {object|null}
 */
export function updateWorldObjectLogic(id, { name, icon, logicType, logicConfig, isSolid }) {
    const entry = activeWorldObjects.get(id);
    if (!entry) return null;

    const { data, mesh } = entry;

    if (name && typeof name === 'string') {
        data.name = name.trim();
        if (mesh) mesh.name = `worldObj_${data.name}_${id}`;
    }
    if (icon && typeof icon === 'string') {
        data.icon = icon;
    }
    if (logicType !== undefined) {
        data.logicType = logicType;
        if (mesh) mesh.userData.logicType = logicType;
    }
    if (logicConfig !== undefined) {
        data.logicConfig = { ...(data.logicConfig || {}), ...logicConfig };
        if (mesh) mesh.userData.logicConfig = data.logicConfig;
    }
    if (isSolid !== undefined) {
        updatePlacedObjectTransform(id, { isSolid });
    }

    // Guardar en persistencia
    const all = getSavedWorldObjects();
    const idx = all.findIndex(o => o.id === id);
    if (idx >= 0) {
        all[idx] = { ...data };
        saveWorldObjects(all);
    }

    return entry;
}

/**
 * Elimina un objeto colocado del mundo y de la persistencia con liberación de VRAM.
 */
export function removePlacedObjectFromWorld(id, shouldPersist = true) {
    const entry = activeWorldObjects.get(id);
    if (entry && entry.mesh) {
        // 1. Quitar de colisiones y obstáculos de cámara
        const cIdx = collidables.indexOf(entry.mesh);
        if (cIdx >= 0) collidables.splice(cIdx, 1);
        const camIdx = cameraObstacles.indexOf(entry.mesh);
        if (camIdx >= 0) cameraObstacles.splice(camIdx, 1);
        rebuildSpatialGrid(collidables);

        // 2. Quitar de chunks visuales
        unregisterVisualFromChunk(entry.mesh);

        // 3. Remover de la escena
        scene.remove(entry.mesh);

        // 4. Liberación profunda de geometrías, materiales y texturas (VRAM / RAM)
        deepDisposeObject(entry.mesh);
    }
    activeWorldObjects.delete(id);

    if (shouldPersist) {
        const all = getSavedWorldObjects().filter(o => o.id !== id);
        saveWorldObjects(all);
        return all;
    }
    return getSavedWorldObjects();
}

/**
 * Elimina todos los objetos colocados del mundo con liberación profunda de memoria.
 */
export function clearAllPlacedWorldObjects(shouldPersist = true) {
    activeWorldObjects.forEach((entry) => {
        if (entry.mesh) {
            const cIdx = collidables.indexOf(entry.mesh);
            if (cIdx >= 0) collidables.splice(cIdx, 1);
            const camIdx = cameraObstacles.indexOf(entry.mesh);
            if (camIdx >= 0) cameraObstacles.splice(camIdx, 1);
            unregisterVisualFromChunk(entry.mesh);
            scene.remove(entry.mesh);
            deepDisposeObject(entry.mesh);
        }
    });
    rebuildSpatialGrid(collidables);
    activeWorldObjects.clear();
    if (shouldPersist) {
        saveWorldObjects([]);
    }
}

/**
 * Carga e instancia todos los objetos guardados al inicio del juego.
 */
let isSpawningWorldObjects = false;

export async function loadAndSpawnWorldObjects() {
    if (isSpawningWorldObjects) return;
    isSpawningWorldObjects = true;
    try {
        await waitForInitialWorldSync(2500);

        const saved = getSavedWorldObjects();
        if (!saved || saved.length === 0) return;

        for (const item of saved) {
            if (!item || !item.id || activeWorldObjects.has(item.id)) continue;

            try {
                const isGlbItem = item.source === 'glb' || Boolean(item.url);
                const mesh = await instantiateWorldObject(
                    isGlbItem ? { ...item, failOnMissingGlb: true } : item
                );

                if (activeWorldObjects.has(item.id)) {
                    if (mesh) deepDisposeObject(mesh);
                    continue;
                }

                if (!mesh) {
                    if (isGlbItem) {
                        missingWorldObjects.set(item.id, item);
                        console.warn(`[WorldObjectsManager] Modelo .GLB faltante omitido (sin cubo fallback): ${item.name || item.url}`);
                    }
                    continue;
                }

                missingWorldObjects.delete(item.id);
                const sXYZ = getObjectScaleXYZFromData(item);
                mesh.scale.set(sXYZ.x, sXYZ.y, sXYZ.z);
                if (item.rotationXYZ && typeof item.rotationXYZ === 'object') {
                    mesh.rotation.set(
                        Number(item.rotationXYZ.x) || 0,
                        Number.isFinite(Number(item.rotationXYZ.y)) ? Number(item.rotationXYZ.y) : (typeof item.rotationY === 'number' ? item.rotationY : 0),
                        Number(item.rotationXYZ.z) || 0
                    );
                } else {
                    mesh.rotation.y = typeof item.rotationY === 'number' ? item.rotationY : 0;
                }

                // Snap exacto al terreno preservando el enterramiento original (relativeGroundOffset)
                const savedOffset = typeof item.relativeGroundOffset === 'number' ? item.relativeGroundOffset : null;
                snapObjectToTerrain(mesh, item.position.x, item.position.z, savedOffset);

                // Configurar colisión física (radio y OBB exacto)
                const solid = item.isSolid !== false;
                const radius = updateObjectCollisionMetadata(mesh);
                mesh.userData.radius = radius;
                mesh.userData.isSolid = solid;
                mesh.userData.isWorldObject = true;
                mesh.userData.worldId = item.id;
                mesh.userData.logicType = item.logicType || 'default';
                mesh.userData.logicConfig = item.logicConfig ? { ...item.logicConfig } : {};

                if (solid) {
                    addCollidable(mesh);
                    if (!cameraObstacles.includes(mesh)) {
                        cameraObstacles.push(mesh);
                    }
                }

                // Chunks espaciales de 180m y Frustum Culling
                registerVisualInChunk(mesh, item.position.x, item.position.z);
                optimizeMeshForRendering(mesh);

                scene.add(mesh);
                activeWorldObjects.set(item.id, { data: item, mesh });
            } catch (err) {
                console.warn('[WorldObjectsManager] Error cargando objeto guardado:', item.name, err);
            }
        }
    } finally {
        isSpawningWorldObjects = false;
    }
}

/**
 * Retorna la lista de objetos .GLB guardados que no pudieron cargarse por falta de binario.
 */
export function getMissingWorldObjects() {
    return Array.from(missingWorldObjects.values());
}

/**
 * Elimina un objeto .GLB roto/faltante de la persistencia sin tocar objetos válidos.
 */
export function removeMissingWorldObject(id) {
    missingWorldObjects.delete(id);
    const filtered = getSavedWorldObjects().filter(o => o.id !== id);
    saveWorldObjects(filtered);
    return filtered;
}

/**
 * Purga todos los registros de objetos .GLB cuyo archivo binario ya no existe.
 */
export function clearMissingWorldObjects() {
    const missingIds = new Set(missingWorldObjects.keys());
    missingWorldObjects.clear();
    if (missingIds.size === 0) return getSavedWorldObjects();
    const filtered = getSavedWorldObjects().filter(o => !missingIds.has(o.id));
    saveWorldObjects(filtered);
    return filtered;
}

/**
 * Retorna las instancias activas para raycasting o selección.
 */
export function getActiveWorldMeshes() {
    const list = [];
    activeWorldObjects.forEach((entry, id) => {
        list.push({ id, data: entry.data, mesh: entry.mesh, type: 'custom' });
    });
    return list;
}

/**
 * Sube un archivo .GLB local al servidor para permanencia en el proyecto.
 */
export async function uploadLocalModelToServer(file) {
    if (!file) throw new Error('No se seleccionó ningún archivo');

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const base64Data = e.target.result;
                const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const modelUrl = `./assets/models/custom/${safeName}`;

                // Guardar de inmediato en la base de datos IndexedDB local
                try {
                    await storeGlbInLocalCache(modelUrl, base64Data, file.name);
                    await storeGlbInLocalCache(safeName, base64Data, file.name);
                } catch (cacheErr) {
                    console.warn('[WorldObjectsManager] Advertencia guardando en caché IndexedDB:', cacheErr);
                }

                const response = await fetch('/api/upload-custom-model', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: file.name,
                        base64Data
                    })
                });

                if (response.ok) {
                    const json = await response.json();
                    if (json.url) {
                        json.url = normalizeCustomModelUrl(json.url);
                    }
                    resolve(json);
                } else {
                    const err = await response.json().catch(() => ({}));
                    console.warn('[WorldObjectsManager] Servidor no pudo persistir a disco, utilizando caché local IndexedDB:', err);
                    resolve({
                        success: true,
                        url: modelUrl,
                        filename: safeName,
                        fromLocalCache: true
                    });
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Error al leer el archivo del PC'));
        reader.readAsDataURL(file);
    });
}

/**
 * Elimina un modelo subido del catálogo local de modelos del PC.
 */
export function deleteUploadedModel(id) {
    const list = getUploadedModelsCatalog().filter(m => m.id !== id);
    try {
        localStorage.setItem(UPLOADED_MODELS_KEY, JSON.stringify(list));
    } catch (_) {}
    return list;
}

/**
 * Exporta el escenario completo como cadena JSON formateada.
 */
export function exportWorldObjectsJSON() {
    const list = getSavedWorldObjects();
    return JSON.stringify(list, null, 2);
}

/**
 * Importa y regenera el escenario a partir de un JSON válido.
 */
export async function importWorldObjectsJSON(jsonString) {
    try {
        const parsed = JSON.parse(jsonString);
        if (!Array.isArray(parsed)) throw new Error('El JSON no contiene un array de objetos');
        
        clearAllPlacedWorldObjects();
        saveWorldObjects(parsed);
        await loadAndSpawnWorldObjects();
        return { success: true, count: parsed.length };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Deshace el último objeto colocado en el escenario.
 */
export function undoLastPlacedObject() {
    const list = getActiveWorldMeshes();
    if (list.length === 0) return null;
    
    // Buscar el que tenga mayor timestamp placedAt
    list.sort((a, b) => (b.data?.placedAt || 0) - (a.data?.placedAt || 0));
    const last = list[0];
    removePlacedObjectFromWorld(last.id);
    return last;
}

/**
 * Revierte el escenario al estado guardado en LocalStorage.
 */
export async function revertToLastSavedState() {
    clearAllPlacedWorldObjects(false);
    await loadAndSpawnWorldObjects();
}

/**
 * Obtiene el historial de versiones guardadas del escenario.
 */
export function getSceneVersions() {
    try {
        const raw = localStorage.getItem(VERSIONS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

/**
 * Guarda una nueva versión snapshot del escenario actual.
 */
export function saveSceneVersion(customName = '') {
    const all = getSavedWorldObjects();
    const versions = getSceneVersions();
    const now = new Date();
    
    const versionRecord = {
        id: `ver_${Date.now()}`,
        name: customName.trim() || `Versión ${versions.length + 1} (${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        timestamp: Date.now(),
        dateStr: now.toLocaleDateString() + ' ' + now.toLocaleTimeString(),
        count: all.length,
        objects: JSON.parse(JSON.stringify(all))
    };
    
    versions.unshift(versionRecord);
    if (versions.length > MAX_SCENE_VERSIONS) {
        versions.length = MAX_SCENE_VERSIONS;
    }
    try {
        localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
    } catch (err) {
        console.warn('[WorldObjectsManager] Error guardando snapshot de versión:', err);
    }
    sendWorldServerSync({ action: 'save-versions', versions });
    return versionRecord;
}

/**
 * Restaura una versión snapshot específica en el escenario vivo.
 */
export async function restoreSceneVersion(versionId) {
    const versions = getSceneVersions();
    const found = versions.find(v => v.id === versionId);
    if (!found) throw new Error('Versión no encontrada');
    
    clearAllPlacedWorldObjects();
    saveWorldObjects(found.objects || []);
    await loadAndSpawnWorldObjects();
    return found;
}

/**
 * Elimina una versión del historial de snapshots.
 */
export function deleteSceneVersion(versionId) {
    const versions = getSceneVersions().filter(v => v.id !== versionId);
    try {
        localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
    } catch (_) {}
    sendWorldServerSync({ action: 'save-versions', versions });
    return versions;
}

/**
 * Envía datos de objetos del mundo y versiones al servidor en segundo plano.
 * Garantiza persistencia física en disco sin consumir tokens de IA.
 */
function sendWorldServerSync(payload) {
    if (typeof window === 'undefined' || !isLocalEditorRuntime()) return;
    try {
        fetch('/api/world-objects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => {
            console.warn('[WorldObjectsManager] Sincronización en segundo plano con servidor:', err);
        });
    } catch (_) {}
}

let isWorldServerSyncInitialized = false;
let worldSyncPromise = null;

function waitForInitialWorldSync(timeoutMs = 2500) {
    if (!worldSyncPromise) return Promise.resolve();
    return Promise.race([
        worldSyncPromise,
        new Promise((resolve) => setTimeout(resolve, timeoutMs))
    ]);
}

function purgeStaleActiveObjects(validObjectsList) {
    const validIds = new Set((validObjectsList || []).map(o => o.id));
    let removedAny = false;
    activeWorldObjects.forEach((entry, id) => {
        if (!validIds.has(id)) {
            if (entry.mesh) {
                const cIdx = collidables.indexOf(entry.mesh);
                if (cIdx >= 0) collidables.splice(cIdx, 1);
                const camIdx = cameraObstacles.indexOf(entry.mesh);
                if (camIdx >= 0) cameraObstacles.splice(camIdx, 1);
                unregisterVisualFromChunk(entry.mesh);
                scene.remove(entry.mesh);
                deepDisposeObject(entry.mesh);
            }
            activeWorldObjects.delete(id);
            removedAny = true;
        }
    });
    if (removedAny) {
        rebuildSpatialGrid(collidables);
    }
}

/**
 * Sincroniza al iniciar la aplicación los objetos del mundo y versiones del servidor y del navegador.
 * Si el servidor tiene datos más recientes en disco, prevalece sin resucitar objetos antiguos borrados.
 */
export function initWorldServerSync() {
    if (typeof window === 'undefined') return Promise.resolve();
    if (isWorldServerSyncInitialized && worldSyncPromise) return worldSyncPromise;
    isWorldServerSyncInitialized = true;

    worldSyncPromise = (async () => {
        try {
            const localEditor = isLocalEditorRuntime();
            if (localEditor) {
                syncServerModelsCatalog().catch(() => {});
                syncCachedModelsToServer().catch(() => {});
            }

            let data = null;
            let isDevApi = false;

            if (localEditor) {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), 2200) : null;
                const res = await fetch('/api/world-objects', {
                    cache: 'no-store',
                    signal: controller ? controller.signal : undefined
                }).catch(() => null);
                if (timer) clearTimeout(timer);

                const contentType = (res?.headers?.get('content-type') || '').toLowerCase();
                if (res && res.ok && contentType.includes('application/json')) {
                    data = await res.json();
                    isDevApi = true;
                }
            }

            // Fallback estático oficial para GitHub Pages / versión final / pruebas móviles
            if (!data) {
                const staticRes = await fetch('./assets/data/world_placed_objects.json', { cache: 'no-store' }).catch(() => null);
                const staticType = (staticRes?.headers?.get('content-type') || '').toLowerCase();
                if (staticRes && staticRes.ok && staticType.includes('application/json')) {
                    const parsed = await staticRes.json().catch(() => null);
                    if (parsed && (Array.isArray(parsed.objects) || Array.isArray(parsed))) {
                        data = {
                            objects: Array.isArray(parsed.objects) ? parsed.objects : parsed,
                            versions: [],
                            updatedAt: Number(parsed.updatedAt || 0)
                        };
                    }
                }
            }

            if (!data) return;

            const rawServerObjects = Array.isArray(data.objects) ? data.objects : [];
            const { list: serverObjects, changed: serverNormalized } = normalizeLegacyCopyNames(rawServerObjects);
            const serverVersions = Array.isArray(data.versions) ? data.versions : [];
            const serverUpdatedAt = Number(data.updatedAt || 0);
            const defaultTime = Number(DEFAULT_PLACED_WORLD_OBJECTS_UPDATED_AT || 0);

            // Modo jugador final o despliegue estático (GitHub Pages): nunca lee ni pisa con cachés locales de editor
            if (!localEditor) {
                if (serverObjects.length > 0 && serverUpdatedAt > defaultTime) {
                    staticOfficialWorldObjects = serverObjects;
                    staticOfficialWorldUpdatedAt = serverUpdatedAt;
                    purgeStaleActiveObjects(serverObjects);
                }
                return;
            }

            if (isDevApi && serverNormalized && serverObjects.length > 0) {
                sendWorldServerSync({ action: 'save-objects', objects: serverObjects });
            }

            const localRaw = localStorage.getItem(STORAGE_KEY);
            const localObjects = getSavedWorldObjects();
            const localUpdatedAt = Number(localStorage.getItem(STORAGE_UPDATED_KEY) || 0);
            const localVersions = getSceneVersions();

            const effectiveLocalTime = localRaw === null ? defaultTime : Math.max(localUpdatedAt, defaultTime);
            const serverHasDataOrNewerClear =
                serverObjects.length > 0 ||
                (serverUpdatedAt > effectiveLocalTime && localRaw !== null);

            if (serverHasDataOrNewerClear) {
                if ((localRaw === null && serverUpdatedAt >= defaultTime) || serverUpdatedAt >= effectiveLocalTime) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(serverObjects));
                    localStorage.setItem(STORAGE_UPDATED_KEY, String(serverUpdatedAt || Date.now()));
                    purgeStaleActiveObjects(serverObjects);
                } else if (isDevApi) {
                    sendWorldServerSync({ action: 'save-objects', objects: localObjects });
                }
            } else if (isDevApi && localObjects.length > 0) {
                sendWorldServerSync({ action: 'save-objects', objects: localObjects });
            }

            if (isDevApi) {
                if (serverVersions.length > 0) {
                    if (localVersions.length === 0) {
                        localStorage.setItem(VERSIONS_KEY, JSON.stringify(serverVersions.slice(0, MAX_SCENE_VERSIONS)));
                    } else {
                        const verMap = new Map();
                        serverVersions.forEach(v => verMap.set(v.id, v));
                        localVersions.forEach(v => verMap.set(v.id, v));
                        const mergedVersions = Array.from(verMap.values())
                            .sort((a, b) => (Number(b?.timestamp) || 0) - (Number(a?.timestamp) || 0))
                            .slice(0, MAX_SCENE_VERSIONS);
                        localStorage.setItem(VERSIONS_KEY, JSON.stringify(mergedVersions));
                        sendWorldServerSync({ action: 'save-versions', versions: mergedVersions });
                    }
                } else if (localVersions.length > 0) {
                    const capped = localVersions.slice(0, MAX_SCENE_VERSIONS);
                    localStorage.setItem(VERSIONS_KEY, JSON.stringify(capped));
                    sendWorldServerSync({ action: 'save-versions', versions: capped });
                }
            }
        } catch (e) {
            console.warn('[WorldObjectsManager] Sincronización inicial con servidor omitida o en modo estático:', e?.message || e);
        }
    })();

    return worldSyncPromise;
}

// Iniciar sincronización en segundo plano al cargar el módulo
if (typeof window !== 'undefined') {
    initWorldServerSync();
}



