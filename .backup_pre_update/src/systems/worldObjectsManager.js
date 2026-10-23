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

const STORAGE_KEY = 'monteserin_world_placed_objects_v1';
const UPLOADED_MODELS_KEY = 'monteserin_custom_uploaded_models_v1';
const VERSIONS_KEY = 'monteserin_world_versions_v1';

// Mapa de instancias activas en la escena 3D viva: id -> { data, mesh }
const activeWorldObjects = new Map();

/**
 * Obtiene la lista de objetos guardados en el escenario.
 */
export function getSavedWorldObjects() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.warn('[WorldObjectsManager] Error leyendo objetos del mundo:', err);
        return [];
    }
}

/**
 * Guarda la lista completa en LocalStorage.
 */
export function saveWorldObjects(objectsList) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(objectsList));
    } catch (err) {
        console.error('[WorldObjectsManager] Error guardando objetos del mundo:', err);
    }
}

/**
 * Obtiene la lista de modelos locales subidos por el usuario.
 */
export function getUploadedModelsCatalog() {
    try {
        const raw = localStorage.getItem(UPLOADED_MODELS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

/**
 * Registra un modelo subido desde el PC en el catálogo persistente.
 */
export function registerUploadedModel(modelInfo) {
    const list = getUploadedModelsCatalog();
    const existingIdx = list.findIndex(m => m.id === modelInfo.id || m.filename === modelInfo.filename);
    if (existingIdx >= 0) {
        list[existingIdx] = { ...list[existingIdx], ...modelInfo };
    } else {
        list.unshift(modelInfo);
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
 * asegurando que su base toque la superficie según getHeightAt(x, z).
 */
export function snapObjectToTerrain(mesh, x, z) {
    if (!mesh) return;
    mesh.position.set(x, mesh.position.y, z);
    const groundOffset = computeGroundOffset(mesh);
    const groundY = getHeightAt(x, z);
    mesh.position.set(x, groundY + groundOffset, z);
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
    if (itemDesc.source === 'custom' || itemDesc.code) {
        const code = itemDesc.code || (itemDesc.sourceId ? getCustomItemById(itemDesc.sourceId)?.code : null);
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
        const url = itemDesc.url;
        if (url) {
            return new Promise((resolve) => {
                const loader = new GLTFLoader();
                loader.setWithCredentials(true);
                loader.load(
                    url,
                    (gltf) => {
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
                    },
                    undefined,
                    (err) => {
                        console.warn('[WorldObjectsManager] Error cargando modelo GLB:', err);
                        resolve(createFallbackObject(itemDesc.name || 'Objeto GLB'));
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
 * Añade un objeto al mundo tanto en la escena 3D como en la persistencia.
 */
export async function placeObjectInWorld(itemDesc, position, rotationY = 0, scale = 1.0) {
    const id = itemDesc.id || `world_obj_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const mesh = await instantiateWorldObject(itemDesc);
    if (!mesh) return null;

    // Aplicar escala primero
    const s = typeof scale === 'number' && scale > 0 ? scale : 1.0;
    mesh.scale.set(s, s, s);

    // Aplicar rotación en eje Y
    mesh.rotation.y = typeof rotationY === 'number' ? rotationY : 0;

    // Calcular y colocar exactamente sobre el terreno con el offset correspondiente
    snapObjectToTerrain(mesh, position.x, position.z);

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
        position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
        rotationY: mesh.rotation.y,
        scale: s,
        placedAt: Date.now()
    };

    activeWorldObjects.set(id, { data: record, mesh });

    // Guardar en LocalStorage
    const all = getSavedWorldObjects();
    all.push(record);
    saveWorldObjects(all);

    return { record, mesh };
}

/**
 * Actualiza la posición, rotación o escala de un objeto ya colocado.
 */
export function updatePlacedObjectTransform(id, { x, z, rotationY, scale }) {
    const entry = activeWorldObjects.get(id);
    if (!entry) return null;

    const { data, mesh } = entry;

    if (typeof scale === 'number' && scale > 0) {
        mesh.scale.set(scale, scale, scale);
        data.scale = scale;
    }

    if (typeof rotationY === 'number') {
        mesh.rotation.y = rotationY;
        data.rotationY = rotationY;
    }

    const newX = x !== undefined ? x : mesh.position.x;
    const newZ = z !== undefined ? z : mesh.position.z;

    snapObjectToTerrain(mesh, newX, newZ);
    data.position = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };

    // Sincronizar persistencia
    const all = getSavedWorldObjects();
    const idx = all.findIndex(o => o.id === id);
    if (idx >= 0) {
        all[idx] = { ...data };
        saveWorldObjects(all);
    }

    return entry;
}

/**
 * Elimina un objeto colocado del mundo y de la persistencia.
 */
export function removePlacedObjectFromWorld(id) {
    const entry = activeWorldObjects.get(id);
    if (entry && entry.mesh) {
        scene.remove(entry.mesh);
        // Limpieza de geometrías y materiales
        entry.mesh.traverse((node) => {
            if (node.isMesh) {
                node.geometry?.dispose();
                if (Array.isArray(node.material)) {
                    node.material.forEach(m => m.dispose());
                } else {
                    node.material?.dispose();
                }
            }
        });
    }
    activeWorldObjects.delete(id);

    const all = getSavedWorldObjects().filter(o => o.id !== id);
    saveWorldObjects(all);
    return all;
}

/**
 * Elimina todos los objetos colocados del mundo.
 */
export function clearAllPlacedWorldObjects() {
    activeWorldObjects.forEach((entry) => {
        if (entry.mesh) {
            scene.remove(entry.mesh);
        }
    });
    activeWorldObjects.clear();
    saveWorldObjects([]);
}

/**
 * Carga e instancia todos los objetos guardados al inicio del juego.
 */
export async function loadAndSpawnWorldObjects() {
    const saved = getSavedWorldObjects();
    if (!saved || saved.length === 0) return;

    for (const item of saved) {
        if (activeWorldObjects.has(item.id)) continue;

        try {
            const mesh = await instantiateWorldObject(item);
            if (mesh) {
                const s = typeof item.scale === 'number' ? item.scale : 1.0;
                mesh.scale.set(s, s, s);
                mesh.rotation.y = typeof item.rotationY === 'number' ? item.rotationY : 0;

                // Si tiene coordenadas fijadas, colocarlas directamente con snap al terreno
                snapObjectToTerrain(mesh, item.position.x, item.position.z);

                scene.add(mesh);
                activeWorldObjects.set(item.id, { data: item, mesh });
            }
        } catch (err) {
            console.warn('[WorldObjectsManager] Error cargando objeto guardado:', item.name, err);
        }
    }
}

/**
 * Retorna las instancias activas para raycasting o selección.
 */
export function getActiveWorldMeshes() {
    const list = [];
    activeWorldObjects.forEach((entry, id) => {
        list.push({ id, data: entry.data, mesh: entry.mesh });
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
                    resolve(json);
                } else {
                    const err = await response.json().catch(() => ({}));
                    reject(new Error(err.error || 'Fallo al guardar modelo en servidor'));
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
    clearAllPlacedWorldObjects();
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
    try {
        localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
    } catch (err) {
        console.warn('[WorldObjectsManager] Error guardando snapshot de versión:', err);
    }
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
    return versions;
}


