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

const STORAGE_KEY = 'monteserin_world_placed_objects_v1';
const UPLOADED_MODELS_KEY = 'monteserin_custom_uploaded_models_v1';
const VERSIONS_KEY = 'monteserin_world_versions_v1';

// Mapa de instancias activas en la escena 3D viva: id -> { data, mesh }
const activeWorldObjects = new Map();

/**
 * Calcula con precisión física el radio cilíndrico de colisión para el Spatial Hash Grid
 * a partir de la geometría 3D real y la escala del objeto.
 */
export function calculateObjectCollisionRadius(mesh, scale = 1.0) {
    if (!mesh) return 0.8 * scale;
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return 0.8 * scale;
    const size = new THREE.Vector3();
    box.getSize(size);
    const horizontalSpan = Math.hypot(size.x, size.z);
    return Math.max(0.4, Math.min(horizontalSpan * 0.42, 12.0));
}

/**
 * Optimiza las submallas del objeto para garantizar que el Frustum Culling
 * nativo de Three.js descarte instantáneamente geometrías fuera de visión.
 */
export function optimizeMeshForRendering(mesh) {
    if (!mesh) return;
    mesh.traverse((node) => {
        if (node.isMesh && node.geometry) {
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere();
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
 * Guarda la lista completa en LocalStorage y la sincroniza con el servidor.
 */
export function saveWorldObjects(objectsList) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(objectsList));
    } catch (err) {
        console.error('[WorldObjectsManager] Error guardando objetos del mundo:', err);
    }
    sendWorldServerSync({ action: 'save-objects', objects: objectsList });
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
export async function placeObjectInWorld(itemDesc, position, rotationY = 0, scale = 1.0, isSolid = true) {
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

    // Configurar estado sólido/traspasable
    const solid = itemDesc.isSolid !== undefined ? Boolean(itemDesc.isSolid) : Boolean(isSolid);
    const radius = calculateObjectCollisionRadius(mesh, s);
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
        isSolid: solid,
        logicType: itemDesc.logicType || 'default',
        logicConfig: itemDesc.logicConfig ? { ...itemDesc.logicConfig } : {},
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
 * Actualiza la posición, rotación, escala o solidez de un objeto ya colocado.
 */
export function updatePlacedObjectTransform(id, { x, z, position, rotationY, scale, isSolid }) {
    const entry = activeWorldObjects.get(id);
    if (!entry) return null;

    const { data, mesh } = entry;
    let transformChanged = false;

    if (typeof scale === 'number' && scale > 0) {
        mesh.scale.set(scale, scale, scale);
        data.scale = scale;
        mesh.userData.radius = calculateObjectCollisionRadius(mesh, scale);
        transformChanged = true;
    }

    if (typeof rotationY === 'number') {
        mesh.rotation.y = rotationY;
        data.rotationY = rotationY;
        transformChanged = true;
    }

    const posX = x !== undefined ? x : (position?.x !== undefined ? position.x : undefined);
    const posZ = z !== undefined ? z : (position?.z !== undefined ? position.z : undefined);

    if (posX !== undefined || posZ !== undefined) {
        const newX = posX !== undefined ? posX : mesh.position.x;
        const newZ = posZ !== undefined ? posZ : mesh.position.z;

        // Migrar de chunk visual al moverse
        unregisterVisualFromChunk(mesh);
        snapObjectToTerrain(mesh, newX, newZ);
        registerVisualInChunk(mesh, mesh.position.x, mesh.position.z);

        data.position = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
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
export async function duplicateWorldObject(id, customOffset = null) {
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

    const currentScale = typeof originalData.scale === 'number' ? originalData.scale : 1.0;
    const currentRotY = typeof originalData.rotationY === 'number' ? originalData.rotationY : 0;
    const radius = entry?.mesh?.userData?.radius || (1.5 * currentScale);

    // Calcular desplazamiento inteligente para que la copia no quede tapando exactamente al original
    const offsetDistance = Math.max(2.2, radius * 2.2);
    const offsetX = customOffset && typeof customOffset.x === 'number' ? customOffset.x : offsetDistance;
    const offsetZ = customOffset && typeof customOffset.z === 'number' ? customOffset.z : offsetDistance;

    const origPos = originalData.position || { x: 0, y: 0, z: 0 };
    const newPos = {
        x: origPos.x + offsetX,
        y: origPos.y,
        z: origPos.z + offsetZ
    };

    const duplicateDesc = {
        name: originalData.name ? `${originalData.name} (Copia)` : 'Elemento Duplicado',
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
        isSolid: originalData.isSolid !== false,
        logicType: originalData.logicType || 'default',
        logicConfig: originalData.logicConfig ? JSON.parse(JSON.stringify(originalData.logicConfig)) : {}
    };

    const placed = await placeObjectInWorld(
        duplicateDesc,
        newPos,
        currentRotY,
        currentScale,
        duplicateDesc.isSolid
    );

    if (placed) {
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
export function removePlacedObjectFromWorld(id) {
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

    const all = getSavedWorldObjects().filter(o => o.id !== id);
    saveWorldObjects(all);
    return all;
}

/**
 * Elimina todos los objetos colocados del mundo con liberación profunda de memoria.
 */
export function clearAllPlacedWorldObjects() {
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

                // Snap exacto al terreno
                snapObjectToTerrain(mesh, item.position.x, item.position.z);

                // Configurar colisión física
                const solid = item.isSolid !== false;
                const radius = calculateObjectCollisionRadius(mesh, s);
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
    if (typeof window === 'undefined') return;
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

/**
 * Sincroniza al iniciar la aplicación los objetos del mundo y versiones del servidor y del navegador.
 * Si el servidor tiene datos en disco y el navegador está vacío (nueva sesión o tras borrar caché),
 * descarga e instancia los objetos del mundo automáticamente.
 */
export async function initWorldServerSync() {
    if (typeof window === 'undefined' || isWorldServerSyncInitialized) return;
    isWorldServerSyncInitialized = true;

    try {
        const res = await fetch('/api/world-objects');
        if (res.ok) {
            const data = await res.json();
            const serverObjects = data?.objects;
            const serverVersions = data?.versions;
            const localObjects = getSavedWorldObjects();
            const localVersions = getSceneVersions();

            // 1. Sincronización de Objetos del Mundo Colocados
            if (Array.isArray(serverObjects) && serverObjects.length > 0) {
                if (localObjects.length === 0) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(serverObjects));
                    // Si el mundo ya inició y no tenía objetos, cargarlos ahora
                    if (activeWorldObjects.size === 0) {
                        await loadAndSpawnWorldObjects();
                    }
                } else {
                    // Combinar respetando ambos lados
                    const map = new Map();
                    serverObjects.forEach(o => map.set(o.id, o));
                    localObjects.forEach(o => map.set(o.id, o));
                    const mergedObjects = Array.from(map.values());
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedObjects));
                    sendWorldServerSync({ action: 'save-objects', objects: mergedObjects });
                }
            } else if (localObjects.length > 0) {
                // Subir lo que el usuario ya tenga en su navegador al archivo del servidor
                sendWorldServerSync({ action: 'save-objects', objects: localObjects });
            }

            // 2. Sincronización de Versiones / Snapshots
            if (Array.isArray(serverVersions) && serverVersions.length > 0) {
                if (localVersions.length === 0) {
                    localStorage.setItem(VERSIONS_KEY, JSON.stringify(serverVersions));
                } else {
                    const verMap = new Map();
                    serverVersions.forEach(v => verMap.set(v.id, v));
                    localVersions.forEach(v => verMap.set(v.id, v));
                    const mergedVersions = Array.from(verMap.values());
                    localStorage.setItem(VERSIONS_KEY, JSON.stringify(mergedVersions));
                    sendWorldServerSync({ action: 'save-versions', versions: mergedVersions });
                }
            } else if (localVersions.length > 0) {
                sendWorldServerSync({ action: 'save-versions', versions: localVersions });
            }
        }
    } catch (e) {
        console.warn('[WorldObjectsManager] Error en sincronización inicial con servidor:', e);
    }
}

// Iniciar sincronización en segundo plano al cargar el módulo
if (typeof window !== 'undefined') {
    initWorldServerSync();
}



