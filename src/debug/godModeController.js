/* ======================================================
   MONTESERIN ACADEMY - GOD MODE CONTROLLER (WORLD EDITOR)
   Controlador de Modo Dios en tiempo real sobre el entorno 3D vivo.
   - Vuelo libre desacoplado del Player con flechas / WASD y ratón
   - Raycasting continuo con cálculo exacto de altura Y (getHeightAt)
   - Peana guía / cursor holográfico y fantasma de colocación
   - Soporte para catálogo Three.js, objetos del sistema y carga de .GLB locales
   - Selección, rotación, redimensionado y eliminación en tiempo real
   - Persistencia automática e integración en la escena viva del juego
   ====================================================== */

import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { camera } from '../core/camera.js';
import { runtimeState } from '../state/runtimeState.js';
import { getHeightAt } from '../terrain/terrainHeight.js';
import { getCustomItems, getCustomItemById } from '../systems/customItemStorage.js';
import {
    placeObjectInWorld,
    snapObjectToTerrain,
    computeGroundOffset,
    getActiveWorldMeshes,
    removePlacedObjectFromWorld,
    updatePlacedObjectTransform,
    toggleObjectSolidState,
    uploadLocalModelToServer,
    registerUploadedModel,
    getUploadedModelsCatalog,
    deleteUploadedModel,
    checkGlbAvailability,
    syncServerModelsCatalog,
    instantiateWorldObject,
    normalizeCustomModelUrl,
    undoLastPlacedObject,
    saveSceneVersion,
    revertToLastSavedState,
    getSavedWorldObjects,
    getMissingWorldObjects,
    clearMissingWorldObjects,
    duplicateWorldObject,
    duplicateWorldObjectAdjacent,
    computeSnapPositionForObject,
    resolveScaleXYZ,
    getObjectScaleXYZFromData,
    getObjectLocalBounds,
    updateWorldObjectLogic,
    commitStagedWorldObjects,
    deepDisposeObject
} from '../systems/worldObjectsManager.js';
import { dismissPandaReminder } from '../ui/pandaReminder.js';
import { showDevToast, closeDevPanel, openDevPanel } from './devPanel.js';
import { showDevModalDialog } from './devModalDialog.js';
import { getPandaNPC } from '../entities/npc/pandaNPC.js';
import { getAltoNPC } from '../entities/npc/altoNPC.js';
import { getTelerinNPC } from '../entities/npc/telerinNPC.js';
import { getTeleronNPC } from '../entities/npc/teleronNPC.js';
import {
    getMuebleObject,
    getMuebleLogicalScale,
    applyMuebleLogicalScale,
    syncMuebleDrawerTransform
} from '../entities/objects/muebleObject.js';
import {
    getWorldLayout,
    getEntityTransform,
    updateEntityTransform,
    saveLayoutVersion,
    restoreLayoutVersion,
    getLayoutVersions,
    hideProceduralInstance,
    commitStagedWorldLayout,
    reloadWorldLayoutFromStorage
} from '../systems/worldLayoutSystem.js';
import { bakeCurrentWorldToCode } from '../systems/bakeSystem.js';
import { collidables, addCollidable, removeCollidable } from '../entities/collisions.js';
import { rebuildSpatialGrid } from '../systems/chunkSystem.js';
import { lockInput, unlockInput } from '../systems/inputLockSystem.js';
import { DEV_CONFIG } from '../config/devConfig.js';
import { snapCameraOrbitTo } from '../player/playerCamera.js';

let isGodModeActive = false;
let godAnimationId = null;
let lastFrameTime = performance.now();

// Estado de la cámara de vuelo
const flyCam = {
    x: 0,
    y: 10,
    z: 15,
    yaw: 0,       // Rotación horizontal (radianes)
    pitch: -0.25, // Rotación vertical (radianes)
    speedFactor: 1.0,
    baseSpeed: 18.0 // metros por segundo
};

// Input teclado para vuelo
const flyKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    speedBoost: false
};

// Herramientas y modo de edición
let currentTool = 'place'; // 'place' | 'select' | 'fly'
let activeCatalogTab = 'library'; // 'library' | 'system' | 'customGlb'
let selectedCatalogItem = null;
let currentRotationY = 0;
let currentScale = 1.0;
let currentScaleXYZ = { x: 1.0, y: 1.0, z: 1.0 };
let isScaleUnlocked = false;
let isEdgeSnapEnabled = true;
let lastSnapResult = null;

// Objeto del mundo actualmente seleccionado para editar/mover
let selectedWorldObject = null;

// Control de cambios no guardados en memoria (Opción A: Guardado explícito)
let hasUnsavedChanges = false;
let pendingChangesCount = 0;
// Respaldo en memoria de instancias procedurales ocultadas/desacopladas antes de hornear
let stagedInstancedBackups = [];

// Elementos 3D auxiliares del modo dios
let placementCursor = null;
let ghostMesh = null;
let ghostHitboxHelper = null;
let selectionBoxHelper = null;
let hudContainer = null;
let showObjectsListDrawer = false;

// Raycaster para el terreno y objetos
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2(0, 0);
let currentGroundHit = new THREE.Vector3(0, 0, 0);
let hasValidGroundHit = false;

// Estado del ratón para rotar cámara
let isMouseDown = false;
let mouseStartX = 0;
let mouseStartY = 0;

// Arrastre directo 3D y modo agarrar (Grab)
let isDraggingSelectedObject = false;
let isGrabModeActive = false;
let dragInitialPos = null;
let mouseDownStart = { x: 0, y: 0 };
let hasMovedSignificantly = false;

// Panel flotante permanente de guía de controles y atajos
let controlsGuidePanel = null;
let isGuideCollapsed = false;

// Ventanas flotantes independientes (Opción 2: Localizador, En Escena, Lógica, Catálogo 3D)
let locatorWindowPanel = null;
let objectsWindowPanel = null;
let logicWindowPanel = null;
let catalogWindowPanel = null;
let activeLogicCloseFn = null;

// Estado del panel Localizador y Catálogo 3D
let isLocatorOpen = false;
let isCatalogOpen = true;
let isCatalogPinned = true;
let catalogSearchQuery = '';

// Gestión de posiciones persistentes y Z-index de ventanas flotantes
const GOD_WINDOW_POS_STORAGE_KEY = 'monteserin_godmode_window_positions_v1';
let godWindowZCounter = 999991;

/**
 * Retorna la lista unificada de entidades del mundo para el Localizador de Modelos.
 */
// Animación de cámara suave (Fly-To Lerp)
let activeFlyAnimation = null;
let locatorBeaconMesh = null;

/**
 * Busca de forma profunda la malla de una entidad en la escena si el getter directo no la devuelve
 */
function findEntityMeshInScene(key) {
    if (!scene) return null;
    let found = null;
    const searchTerms = [
        key.toLowerCase(),
        key.toLowerCase() + 'npc',
        'npc_' + key.toLowerCase()
    ];
    scene.traverse(obj => {
        if (found) return;
        const name = (obj.name || '').toLowerCase();
        const npcName = (obj.userData?.npcName || '').toLowerCase();
        if (searchTerms.some(term => name.includes(term) || npcName.includes(term))) {
            // Preferir el ancestro de primer nivel hijo directo de scene o con userData.isNPC
            let curr = obj;
            while (curr.parent && curr.parent !== scene && !curr.userData?.isNPC) {
                curr = curr.parent;
            }
            found = curr;
        }
    });
    return found;
}

/**
 * Muestra un marcador o halo visual temporal de 3.5 segundos sobre la entidad localizada
 */
function spawnLocatorBeacon(pos) {
    if (!scene || !pos) return;
    if (locatorBeaconMesh) {
        scene.remove(locatorBeaconMesh);
        if (locatorBeaconMesh.geometry) locatorBeaconMesh.geometry.dispose();
        if (locatorBeaconMesh.material) locatorBeaconMesh.material.dispose();
        locatorBeaconMesh = null;
    }

    const ringGeom = new THREE.RingGeometry(0.7, 1.2, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
    });
    locatorBeaconMesh = new THREE.Mesh(ringGeom, ringMat);
    const groundY = (pos.y !== undefined ? pos.y : getHeightAt(pos.x, pos.z)) + 0.15;
    locatorBeaconMesh.position.set(pos.x, groundY, pos.z);
    scene.add(locatorBeaconMesh);

    const startTime = performance.now();
    function animateBeacon() {
        if (!locatorBeaconMesh) return;
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed > 3.5) {
            if (locatorBeaconMesh) {
                scene.remove(locatorBeaconMesh);
                if (locatorBeaconMesh.geometry) locatorBeaconMesh.geometry.dispose();
                if (locatorBeaconMesh.material) locatorBeaconMesh.material.dispose();
                locatorBeaconMesh = null;
            }
            return;
        }
        const pulse = 1.0 + Math.sin(elapsed * 8) * 0.25;
        locatorBeaconMesh.scale.set(pulse, 1, pulse);
        ringMat.opacity = Math.max(0, 0.85 * (1 - elapsed / 3.5));
        requestAnimationFrame(animateBeacon);
    }
    requestAnimationFrame(animateBeacon);
}

/**
 * Retorna la lista unificada de entidades del mundo para el Localizador de Modelos.
 */
function getAllLocatableEntities() {
    const list = [];
    const layout = getWorldLayout() || {};

    // 1. Robot Player
    if (runtimeState.player) {
        list.push({
            id: 'player_main',
            type: 'player',
            category: 'player',
            name: 'Robot Player',
            icon: '🤖',
            mesh: runtimeState.player,
            pos: runtimeState.player.position,
            savedPos: layout.playerSpawn || { x: 0, z: 0, rotationY: 0 }
        });
    }

    // 2. NPCs
    const npcDefs = [
        { key: 'Alto', name: 'Alto', icon: '🚶', getter: getAltoNPC },
        { key: 'Panda', name: 'Panda', icon: '🐼', getter: getPandaNPC },
        { key: 'Telerín', name: 'Telerín', icon: '👦', getter: getTelerinNPC },
        { key: 'Telerón', name: 'Telerón', icon: '🧑', getter: getTeleronNPC }
    ];

    npcDefs.forEach(def => {
        let mesh = null;
        try { mesh = def.getter(); } catch (_) {}
        if (!mesh) {
            mesh = findEntityMeshInScene(def.key);
        }
        const saved = (layout.npcs && layout.npcs[def.key]) ? layout.npcs[def.key] : null;
        let pos = null;
        if (mesh && mesh.position) {
            pos = mesh.position;
        } else if (saved) {
            pos = { x: saved.x, y: getHeightAt(saved.x, saved.z), z: saved.z };
        } else {
            pos = { x: 0, y: getHeightAt(0, 0), z: 0 };
        }

        list.push({
            id: `npc_${def.key.toLowerCase()}`,
            key: def.key,
            type: 'npc',
            category: 'npc',
            name: def.name,
            icon: def.icon,
            mesh: mesh,
            pos: pos,
            savedPos: saved || { x: 0, z: 0, rotationY: 0, scale: 1.8 }
        });
    });

    // 3. Mueble
    let muebleMesh = null;
    try { muebleMesh = getMuebleObject(); } catch (_) {}
    if (!muebleMesh) muebleMesh = findEntityMeshInScene('mueble');
    const savedMueble = (layout.furniture && layout.furniture.mueble) ? layout.furniture.mueble : null;
    let mueblePos = null;
    if (muebleMesh && muebleMesh.position) {
        mueblePos = muebleMesh.position;
    } else if (savedMueble) {
        mueblePos = { x: savedMueble.x, y: getHeightAt(savedMueble.x, savedMueble.z) + 0.45, z: savedMueble.z };
    } else {
        mueblePos = { x: 14.77, y: getHeightAt(14.77, 23.26) + 0.45, z: 23.26 };
    }
    list.push({
        id: 'furniture_mueble',
        key: 'mueble',
        type: 'furniture',
        category: 'furniture',
        name: 'Mueble con Cajón',
        icon: '🪑',
        mesh: muebleMesh,
        pos: mueblePos,
        savedPos: savedMueble || { x: 14.77, z: 23.26, rotationY: Math.PI, scale: 1 }
    });

    // 4. Objetos custom colocados
    const customPlaced = getActiveWorldMeshes();
    customPlaced.forEach(c => {
        list.push({
            id: c.id,
            type: 'custom',
            category: 'custom',
            name: c.data?.name || 'Objeto Colocado',
            icon: c.data?.icon || '📦',
            mesh: c.mesh,
            pos: c.mesh ? c.mesh.position : (c.data?.position || { x: 0, y: 0, z: 0 }),
            savedPos: c.data?.position ? { x: c.data.position.x, z: c.data.position.z, rotationY: c.data.rotationY || 0, scale: c.data.scale || 1.0 } : null,
            entry: c
        });
    });

    return list;
}

/**
 * Vuela la cámara del Modo Dios suavemente (interpolación animada) hacia la entidad objetivo,
 * orienta su ángulo de visión hacia ella, genera un haz/halo luminoso de referencia y la selecciona.
 */
function focusCameraOnTarget(target) {
    if (!target) return;
    const pos = target.pos || (target.mesh ? target.mesh.position : null);
    // Si la entidad tiene malla y es un NPC o mueble, asegurar que esté en la superficie del terreno y visible
    if (target.mesh) {
        if (target.type === 'npc' || target.type === 'furniture' || target.type === 'custom') {
            const explicitOffset = Number.isFinite(target.mesh.userData?.relativeGroundOffset)
                ? target.mesh.userData.relativeGroundOffset
                : null;
            snapObjectToTerrain(target.mesh, pos.x, pos.z, explicitOffset);
            if (!target.mesh.userData?.hiddenByLayout) {
                target.mesh.visible = true;
                target.mesh.traverse(child => {
                    if (child.isMesh) {
                        child.visible = true;
                        child.frustumCulled = false;
                    }
                });
            }
            target.mesh.updateMatrixWorld(true);
        }
    }

    // 1. Destino de la cámara: 4 metros en diagonal elevada mirando a la entidad
    const actualY = target.mesh ? target.mesh.position.y : (pos.y !== undefined ? pos.y : getHeightAt(pos.x, pos.z));
    const camTargetY = actualY + 1.1;
    const targetCamX = pos.x + 3.0;
    const targetCamZ = pos.z + 3.2;
    const groundAtCam = getHeightAt(targetCamX, targetCamZ);
    const targetCamY = Math.max(camTargetY + 1.2, groundAtCam + 1.4);

    // Calcular ángulos yaw y pitch exactos mirando al objeto desde la posición final
    const dx = pos.x - targetCamX;
    const dy = camTargetY - targetCamY;
    const dz = pos.z - targetCamZ;
    const distHoriz = Math.hypot(dx, dz) || 0.001;

    const targetYaw = Math.atan2(-dx, -dz);
    const targetPitch = Math.atan2(dy, distHoriz);

    // Cancelar animación anterior si existe
    if (activeFlyAnimation) {
        cancelAnimationFrame(activeFlyAnimation);
        activeFlyAnimation = null;
    }

    const startX = flyCam.x;
    const startY = flyCam.y;
    const startZ = flyCam.z;
    const startYaw = flyCam.yaw;
    const startPitch = flyCam.pitch;

    // Normalizar diferencia de yaw para evitar giros de 360 grados innecesarios
    let diffYaw = (targetYaw - startYaw) % (Math.PI * 2);
    if (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
    if (diffYaw < -Math.PI) diffYaw += Math.PI * 2;

    const duration = 600; // 600ms vuelo suave cinemático
    const startTime = performance.now();

    function stepFly(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1.0, elapsed / duration);
        // EaseInOutCubic
        const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        flyCam.x = startX + (targetCamX - startX) * ease;
        flyCam.y = startY + (targetCamY - startY) * ease;
        flyCam.z = startZ + (targetCamZ - startZ) * ease;
        flyCam.yaw = startYaw + diffYaw * ease;
        flyCam.pitch = startPitch + (targetPitch - startPitch) * ease;

        applyFlyCameraTransform();

        if (progress < 1.0) {
            activeFlyAnimation = requestAnimationFrame(stepFly);
        } else {
            activeFlyAnimation = null;
            applyFlyCameraTransform();
            // Seleccionar y spawnear halo luminoso
            selectEntityFromLocator(target);
            spawnLocatorBeacon(pos);
            showDevToast(`🎯 Cámara enfocada en: ${target.icon || '📍'} ${target.name} (X: ${pos.x.toFixed(1)}, Z: ${pos.z.toFixed(1)})`, 4000);
        }
    }

    activeFlyAnimation = requestAnimationFrame(stepFly);
    // Disparar halo luminoso de inmediato
    spawnLocatorBeacon(pos);
}

/**
 * Trae una entidad y la coloca en el suelo frente a la cámara actual.
 */
function teleportEntityToFrontOfCamera(target) {
    if (!target) return;
    // Calcular punto a 3.5m frente a la cámara según su yaw
    const forwardX = flyCam.x - Math.sin(flyCam.yaw) * 4.0;
    const forwardZ = flyCam.z - Math.cos(flyCam.yaw) * 4.0;
    const groundY = getHeightAt(forwardX, forwardZ);

    const newPos = { x: forwardX, y: groundY, z: forwardZ };

    // Si la entidad no estaba seleccionada, seleccionarla primero
    selectEntityFromLocator(target);
    applyLiveMoveToSelectedObject(newPos);
    commitSelectedObjectMove(newPos);

    showDevToast(`📍 "${target.name}" traído frente a la cámara en (${forwardX.toFixed(1)}, ${forwardZ.toFixed(1)})`);
}

/**
 * Restaura la posición de una entidad a su última posición guardada oficial.
 */
function resetEntityToSavedPosition(target) {
    if (!target || !target.savedPos) {
        showDevToast('⚠️ No hay posición guardada para esta entidad');
        return;
    }
    const saved = target.savedPos;
    const groundY = getHeightAt(saved.x, saved.z);
    const newPos = { x: saved.x, y: groundY, z: saved.z };

    if (target.mesh && (target.type === 'npc' || target.type === 'furniture')) {
        const shouldHide = Boolean(saved.hidden);
        target.mesh.userData.hiddenByLayout = shouldHide;
        target.mesh.visible = !shouldHide;
        if (shouldHide) {
            removeCollidable(target.mesh);
        } else {
            addCollidable(target.mesh);
        }
        if (target.type === 'furniture') {
            syncMuebleDrawerTransform();
        }
    }

    selectEntityFromLocator(target);
    applyLiveMoveToSelectedObject(newPos);
    commitSelectedObjectMove(newPos);

    if (typeof saved.rotationY === 'number') {
        applyRotationToSelected(saved.rotationY);
    }
    if (saved.scaleXYZ || typeof saved.scale === 'number') {
        if (target.type === 'furniture') {
            applyMuebleLogicalScale(saved.scaleXYZ || saved.scale || 1.0);
            const logical = getMuebleLogicalScale();
            currentScaleXYZ = { ...logical };
            currentScale = Number(((logical.x + logical.y + logical.z) / 3).toFixed(4));
            syncScaleInputsDOM();
        } else if (typeof saved.scale === 'number') {
            applyScaleToSelected(saved.scale);
        }
    }

    if (target.type === 'furniture' && target.mesh) {
        if (typeof saved.relativeGroundOffset === 'number' && Number.isFinite(saved.relativeGroundOffset)) {
            target.mesh.userData.relativeGroundOffset = saved.relativeGroundOffset;
            target.mesh.position.y = getHeightAt(saved.x, saved.z) + saved.relativeGroundOffset;
            target.mesh.updateMatrixWorld(true);
            updateEntityTransform('furniture', 'mueble', { relativeGroundOffset: saved.relativeGroundOffset }, false);
        }
        syncMuebleDrawerTransform({ syncState: true });
        rebuildSpatialGrid(collidables);
        if (selectionBoxHelper && typeof selectionBoxHelper.update === 'function') {
            selectionBoxHelper.update();
        }
    }

    showDevToast(`🔄 "${target.name}" restablecido a su posición guardada (${saved.x.toFixed(1)}, ${saved.z.toFixed(1)})`);
}

/**
 * Selecciona una entidad en Modo Dios a partir de su descriptor del localizador.
 */
function selectEntityFromLocator(target) {
    if (!target) return;
    if (target.entry) {
        selectWorldObject(target.entry);
        return;
    }
    if (target.type === 'player') {
        const baseScale = runtimeState.player.userData?.baseScale || 1.4;
        const pScaleXYZ = {
            x: Number((runtimeState.player.scale.x / baseScale).toFixed(3)),
            y: Number((runtimeState.player.scale.y / baseScale).toFixed(3)),
            z: Number((runtimeState.player.scale.z / baseScale).toFixed(3))
        };
        const pScaleAvg = Number(((pScaleXYZ.x + pScaleXYZ.y + pScaleXYZ.z) / 3).toFixed(4));
        selectWorldObject({
            type: 'player',
            mesh: runtimeState.player,
            data: {
                name: 'Robot Player (Jugador)',
                icon: '🤖',
                position: runtimeState.player.position,
                rotationY: runtimeState.player.rotation.y,
                scale: pScaleAvg,
                scaleXYZ: pScaleXYZ
            }
        });
    } else if (target.type === 'npc') {
        const npcMesh = target.mesh;
        const rawFactor = npcMesh?.userData?.rawHeightFactor || 1;
        const nScaleXYZ = npcMesh ? {
            x: Number((npcMesh.scale.x / rawFactor).toFixed(3)),
            y: Number((npcMesh.scale.y / rawFactor).toFixed(3)),
            z: Number((npcMesh.scale.z / rawFactor).toFixed(3))
        } : (target.savedPos?.scaleXYZ || { x: target.savedPos?.scale || 1.8, y: target.savedPos?.scale || 1.8, z: target.savedPos?.scale || 1.8 });
        const nScaleAvg = Number(((nScaleXYZ.x + nScaleXYZ.y + nScaleXYZ.z) / 3).toFixed(4));
        selectWorldObject({
            type: 'npc',
            mesh: npcMesh,
            data: {
                name: `NPC ${target.name}`,
                icon: target.icon,
                position: target.pos,
                rotationY: npcMesh ? npcMesh.rotation.y : (target.savedPos?.rotationY || 0),
                scale: nScaleAvg,
                scaleXYZ: nScaleXYZ
            }
        });
    } else if (target.type === 'furniture') {
        const logicalScale = getMuebleLogicalScale();
        selectWorldObject({
            type: 'furniture',
            mesh: target.mesh,
            data: {
                name: 'Mueble con Cajón Secreto',
                icon: '🪑',
                position: target.pos,
                rotationY: target.mesh ? target.mesh.rotation.y : (target.savedPos?.rotationY || Math.PI),
                scale: Number(((logicalScale.x + logicalScale.y + logicalScale.z) / 3).toFixed(4)),
                scaleXYZ: logicalScale
            }
        });
    }
}

/**
 * Activa el Modo Dios en el juego.
 */
export function enterGodMode(preselectedItem = null) {
    if (!DEV_CONFIG.enabled) return;
    if (isGodModeActive) {
        if (preselectedItem && preselectedItem.url) {
            currentTool = 'place';
            setSelectedItem(preselectedItem).then(() => renderHUDContent());
        }
        return;
    }
    isGodModeActive = true;
    runtimeState.isGodMode = true;

    // 1. Cerrar el panel modal principal de desarrollo y silenciar Panda
    closeDevPanel();
    dismissPandaReminder();

    // 2. Inicializar posición de cámara libre partiendo de la posición del Player
    const player = runtimeState.player;
    if (player) {
        flyCam.x = player.position.x;
        flyCam.y = player.position.y + 7.5;
        flyCam.z = player.position.z + 12.0;
        flyCam.yaw = 0;
        flyCam.pitch = -0.35;
    } else {
        flyCam.x = camera.position.x;
        flyCam.y = camera.position.y + 5.0;
        flyCam.z = camera.position.z;
    }

    // 3. Crear elementos visuales 3D auxiliares (cursor de suelo)
    createPlacementCursor();

    // 4. Iniciar con PUNTERO LIBRE (o ítem preseleccionado) y Catálogo 3D abierto por defecto
    selectedCatalogItem = null;
    destroyGhostMesh();
    currentTool = 'place';
    isCatalogOpen = true;

    // 5. Crear la barra flotante (HUD) y ventanas activas
    createGodModeHUD();
    if (preselectedItem && preselectedItem.url) {
        setSelectedItem(preselectedItem).then(() => renderHUDContent());
    }

    // 6. Conectar eventos de teclado y ratón
    bindGodModeEvents();

    // 7. Iniciar bucle de actualización de Modo Dios
    lastFrameTime = performance.now();
    runGodModeLoop();

    // 8. Descubrir modelos .GLB del servidor/Git y comprobar disponibilidad real de Modelos PC
    syncServerModelsCatalog().then(() => refreshUploadedModelsStatus());

    const missingObjs = getMissingWorldObjects();
    if (missingObjs.length > 0) {
        showDevToast(`⚠️ Se omitieron ${missingObjs.length} objetos .GLB sin archivo (en lugar de mostrar cubos). Puedes limpiarlos desde "En Escena" o "Localizador".`, 5500);
    } else {
        showDevToast('🌍 Modo Dios Activado: Vuela con Flechas/WASD y haz clic para colocar elementos');
    }
}

const modelAvailabilityMap = new Map();
let isCheckingModelsStatus = false;

async function refreshUploadedModelsStatus() {
    if (isCheckingModelsStatus) return;
    isCheckingModelsStatus = true;
    try {
        const models = getUploadedModelsCatalog();
        for (const m of models) {
            if (!m || !m.url) continue;
            const res = await checkGlbAvailability(m.url, m.filename);
            modelAvailabilityMap.set(m.id, res.status);
            if (res.url) modelAvailabilityMap.set(res.url, res.status);
        }
        if (isGodModeActive && activeCatalogTab === 'customGlb' && catalogWindowPanel) {
            updateCatalogGridContent();
        }
    } finally {
        isCheckingModelsStatus = false;
    }
}

/**
 * Desactiva el Modo Dios y regresa al Player.
 */
export function exitGodMode(force = false) {
    if (!isGodModeActive) return;

    if (!force && hasUnsavedChanges) {
        showDevModalDialog({
            title: '⚠️ Tienes Cambios Sin Guardar',
            message: `Tienes ${pendingChangesCount} cambios en el escenario que aún no has guardado. Si sales ahora sin guardar, los cambios se mantendrán en esta sesión pero no se fijarán para GitHub ni entre reinicios completos. ¿Deseas salir o guardar primero?`,
            confirmText: '💾 Guardar y Salir',
            cancelText: '🚶 Salir sin Guardar',
            isDanger: false,
            onConfirm: async () => {
                commitStagedWorldLayout();
                commitStagedWorldObjects();
                stagedInstancedBackups = [];
                const bakeRes = await bakeCurrentWorldToCode();
                if (!bakeRes?.success) {
                    saveSceneVersion('Guardado local (sin hornear)');
                    saveLayoutVersion('Guardado local (sin hornear)');
                }
                hasUnsavedChanges = false;
                pendingChangesCount = 0;
                if (bakeRes?.success) {
                    showDevToast('✅ ¡Escenario guardado y horneado en código (.js + .json) para Git!', 4500);
                } else {
                    showDevToast(`⚠️ Guardado en navegador, pero NO horneado en código (.js): ${bakeRes?.error || bakeRes?.message || 'Sin servidor dev'}`, 5500);
                }
                exitGodMode(true);
            },
            onCancel: () => {
                exitGodMode(true);
            }
        });
        return;
    }

    isGodModeActive = false;
    runtimeState.isGodMode = false;

    if (godAnimationId) {
        cancelAnimationFrame(godAnimationId);
        godAnimationId = null;
    }
    if (activeFlyAnimation) {
        cancelAnimationFrame(activeFlyAnimation);
        activeFlyAnimation = null;
    }
    isMouseDown = false;
    hasMovedSignificantly = false;

    // Limpiar auxiliares 3D
    destroyPlacementCursor();
    destroyGhostMesh();
    clearSelectionHelper();

    // Desconectar eventos
    unbindGodModeEvents();

    // Remover HUD flotante y todas las ventanas flotantes independientes
    if (hudContainer && hudContainer.parentNode) {
        hudContainer.parentNode.removeChild(hudContainer);
        hudContainer = null;
    }
    if (controlsGuidePanel && controlsGuidePanel.parentNode) {
        controlsGuidePanel.parentNode.removeChild(controlsGuidePanel);
        controlsGuidePanel = null;
    }
    destroyLocatorWindow();
    destroyObjectsWindow();
    destroyCatalogWindow();
    if (typeof activeLogicCloseFn === 'function') {
        activeLogicCloseFn();
    } else if (logicWindowPanel && logicWindowPanel.parentNode) {
        unlockInput('objectLogicModal');
        logicWindowPanel.parentNode.removeChild(logicWindowPanel);
        logicWindowPanel = null;
    }

    // Restaurar cámara del player y sincronizar órbita para evitar salto brusco al ángulo previo
    const player = runtimeState.player;
    if (player) {
        camera.position.set(
            player.position.x,
            player.position.y + 3.0,
            player.position.z + 8.0
        );
        camera.lookAt(player.position);
        snapCameraOrbitTo(camera.position, player.position);
    }

    showDevToast('🚶 Regresado al modo Player');
}

/**
 * Crea la peana / cursor de colocación en el suelo.
 */
function createPlacementCursor() {
    if (placementCursor) destroyPlacementCursor();

    placementCursor = new THREE.Group();
    placementCursor.name = 'godMode_placementCursor';

    // Anillo exterior dorado brillante
    const ringGeo = new THREE.RingGeometry(0.70, 0.78, 36);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xd4af37,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    placementCursor.add(ring);

    // Disco interior esmeralda semitransparente
    const discGeo = new THREE.CircleGeometry(0.68, 32);
    const discMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.25
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    placementCursor.add(disc);

    // Cruz / flecha de orientación en el centro
    const pointerGeo = new THREE.ConeGeometry(0.12, 0.35, 12);
    const pointerMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const pointer = new THREE.Mesh(pointerGeo, pointerMat);
    pointer.rotation.x = Math.PI / 2;
    pointer.position.set(0, 0.05, -0.45);
    placementCursor.add(pointer);

    scene.add(placementCursor);
}

function destroyPlacementCursor() {
    if (placementCursor) {
        scene.remove(placementCursor);
        deepDisposeObject(placementCursor);
        placementCursor = null;
    }
}

/**
 * Establece el ítem activo para colocar y genera su fantasma semitransparente.
 */
async function setSelectedItem(itemDesc) {
    let resolvedDesc = itemDesc;
    if (resolvedDesc && resolvedDesc.source === 'custom' && resolvedDesc.sourceId) {
        const latest = getCustomItemById(resolvedDesc.sourceId);
        if (latest) {
            resolvedDesc = {
                ...resolvedDesc,
                name: latest.name || resolvedDesc.name,
                icon: latest.icon || resolvedDesc.icon,
                code: latest.code
            };
        }
    }

    selectedCatalogItem = resolvedDesc;
    destroyGhostMesh();

    if (!resolvedDesc) return;

    // Generar clon semitransparente para previsualizar antes de plantar
    let baseMesh = null;
    if (resolvedDesc.source === 'custom' && resolvedDesc.code) {
        const { buildThreeMeshFromCode } = await import('../systems/customItemStorage.js');
        const built = buildThreeMeshFromCode(resolvedDesc.code);
        if (built.success && built.object) baseMesh = built.object;
    } else if (resolvedDesc.source === 'system') {
        const { createProceduralItem } = await import('../player/playerEquipment.js');
        baseMesh = createProceduralItem(resolvedDesc.sourceId);
    } else if (resolvedDesc.source === 'tree') {
        const { createIndividualTree } = await import('../environment/trees.js');
        baseMesh = createIndividualTree(resolvedDesc.archetypeIndex ?? 0);
    } else if (resolvedDesc.source === 'rock') {
        const { createIndividualRock } = await import('../environment/rocks.js');
        baseMesh = createIndividualRock(resolvedDesc.geoType ?? 0);
    } else if (resolvedDesc.source === 'glb' && resolvedDesc.url) {
        baseMesh = await instantiateWorldObject({
            ...resolvedDesc,
            url: normalizeCustomModelUrl(resolvedDesc.url),
            failOnMissingGlb: true
        });
        if (!baseMesh) {
            modelAvailabilityMap.set(resolvedDesc.sourceId || resolvedDesc.url, 'missing');
            selectedCatalogItem = null;
            updateHUDActiveItemBadge();
            if (activeCatalogTab === 'customGlb' && catalogWindowPanel) {
                updateCatalogGridContent();
            }
            showDevToast(`⚠️ Falta el archivo .GLB de "${resolvedDesc.name}". Pulsa "📁 Cargar .GLB del PC" para volver a subirlo.`, 4500);
            return;
        }
    }

    if (baseMesh) {
        ghostMesh = baseMesh.clone();
        ghostMesh.name = 'godMode_ghostPreview';

        // Material semitransparente holográfico
        ghostMesh.traverse((node) => {
            if (node.isMesh) {
                node.material = node.material.clone();
                node.material.transparent = true;
                node.material.opacity = 0.65;
                node.castShadow = false;
                node.receiveShadow = false;
            }
        });

        scene.add(ghostMesh);

        ghostHitboxHelper = createOrientedBoxHelper(ghostMesh, 0x2dd4bf);
        scene.add(ghostHitboxHelper);

        updateGhostTransform();
    }

    updateHUDActiveItemBadge();
}

function disposeHelperObject(helper) {
    if (!helper) return;
    scene.remove(helper);
    if (helper.geometry && typeof helper.geometry.dispose === 'function') {
        helper.geometry.dispose();
    }
    if (helper.material) {
        if (Array.isArray(helper.material)) {
            helper.material.forEach(m => m && typeof m.dispose === 'function' && m.dispose());
        } else if (typeof helper.material.dispose === 'function') {
            helper.material.dispose();
        }
    }
}

function createOrientedBoxHelper(mesh, color = 0xf59e0b) {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    boxGeo.dispose();

    const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
        depthTest: true
    });
    const wire = new THREE.LineSegments(edgesGeo, mat);
    wire.raycast = () => {};
    wire.userData.lastBoxDims = { w: 1, h: 1, d: 1, scaleX: NaN, scaleY: NaN, scaleZ: NaN };

    wire.update = () => {
        if (!mesh) return;
        const sx = mesh.scale.x;
        const sy = mesh.scale.y;
        const sz = mesh.scale.z;
        const last = wire.userData.lastBoxDims;

        if (
            Math.abs(sx - last.scaleX) > 0.0005 ||
            Math.abs(sy - last.scaleY) > 0.0005 ||
            Math.abs(sz - last.scaleZ) > 0.0005 ||
            !wire.userData.cachedLocalBounds
        ) {
            const bounds = getObjectLocalBounds(mesh);
            wire.userData.cachedLocalBounds = bounds;
            last.scaleX = sx;
            last.scaleY = sy;
            last.scaleZ = sz;

            if (
                Math.abs(bounds.width - last.w) > 0.001 ||
                Math.abs(bounds.height - last.h) > 0.001 ||
                Math.abs(bounds.depth - last.d) > 0.001
            ) {
                const newBox = new THREE.BoxGeometry(bounds.width, bounds.height, bounds.depth);
                const newEdges = new THREE.EdgesGeometry(newBox);
                newBox.dispose();
                if (wire.geometry) wire.geometry.dispose();
                wire.geometry = newEdges;
                last.w = bounds.width;
                last.h = bounds.height;
                last.d = bounds.depth;
            }
        }

        const b = wire.userData.cachedLocalBounds;
        const ry = mesh.rotation.y || 0;
        const cosR = Math.cos(ry);
        const sinR = Math.sin(ry);
        const wx = mesh.position.x + b.centerOffset.x * cosR + b.centerOffset.z * sinR;
        const wz = mesh.position.z - b.centerOffset.x * sinR + b.centerOffset.z * cosR;
        const wy = mesh.position.y + (b.centerOffset.y || 0);

        wire.position.set(wx, wy, wz);
        wire.rotation.set(0, ry, 0);
    };

    wire.update();
    return wire;
}

function destroyGhostMesh() {
    if (ghostHitboxHelper) {
        disposeHelperObject(ghostHitboxHelper);
        ghostHitboxHelper = null;
    }
    if (ghostMesh) {
        scene.remove(ghostMesh);
        deepDisposeObject(ghostMesh);
        ghostMesh = null;
    }
}

function updateGhostTransform() {
    if (!ghostMesh || !hasValidGroundHit) return;

    ghostMesh.scale.set(currentScaleXYZ.x, currentScaleXYZ.y, currentScaleXYZ.z);
    ghostMesh.rotation.y = currentRotationY;

    let targetX = currentGroundHit.x;
    let targetZ = currentGroundHit.z;

    if (isEdgeSnapEnabled && currentTool === 'place') {
        const snap = computeSnapPositionForObject(ghostMesh, targetX, targetZ, currentRotationY);
        lastSnapResult = snap;
        if (snap && snap.snapped) {
            targetX = snap.x;
            targetZ = snap.z;
            ghostMesh.rotation.y = snap.rotationY;
        }
    } else {
        lastSnapResult = null;
    }

    // Snap exacto al terreno con cálculo métrico
    snapObjectToTerrain(ghostMesh, targetX, targetZ);

    if (ghostHitboxHelper && typeof ghostHitboxHelper.update === 'function') {
        ghostHitboxHelper.update();
    }
}

/**
 * Bucle de animación y control del Modo Dios.
 */
function runGodModeLoop() {
    if (!isGodModeActive) return;
    godAnimationId = requestAnimationFrame(runGodModeLoop);

    const now = performance.now();
    const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;

    // 1. Actualizar posición de la cámara libre según teclas (solo si no hay una animación cinemática en curso)
    if (!activeFlyAnimation) {
        updateFlyCameraPosition(delta);
        // 2. Actualizar orientación de la cámara
        applyFlyCameraTransform();
    }

    // 3. Actualizar raycast con el suelo si el ratón se mueve
    updateRaycastWithTerrain();

    // 4. Actualizar fantasma y cursor (respetando imán de bordes si está imantado)
    if (ghostMesh) {
        const showGhost = (currentTool === 'place' && hasValidGroundHit);
        ghostMesh.visible = showGhost;
        if (hasValidGroundHit) {
            updateGhostTransform();
        }
        if (ghostHitboxHelper) {
            ghostHitboxHelper.visible = showGhost;
        }
    }

    const isMovingObject = (isDraggingSelectedObject && hasMovedSignificantly) || isGrabModeActive;
    if (placementCursor) {
        placementCursor.visible = hasValidGroundHit && (currentTool === 'place' || isMovingObject);
        if (hasValidGroundHit) {
            const useSnapCursor = isEdgeSnapEnabled && lastSnapResult && lastSnapResult.snapped;
            const curX = useSnapCursor ? lastSnapResult.x : currentGroundHit.x;
            const curZ = useSnapCursor ? lastSnapResult.z : currentGroundHit.z;
            const curY = useSnapCursor ? getHeightAt(curX, curZ) : currentGroundHit.y;
            placementCursor.position.set(curX, curY + 0.02, curZ);
            placementCursor.rotation.y = useSnapCursor ? lastSnapResult.rotationY : currentRotationY;
        }
    }

    // 5. Si hay un objeto seleccionado, actualizar su cuadro delimitador
    if (selectionBoxHelper && selectedWorldObject) {
        if (typeof selectionBoxHelper.update === 'function') {
            selectionBoxHelper.update();
        }
    }
}

/**
 * Mueve la cámara libre en 3D en base al teclado y velocidad.
 */
function updateFlyCameraPosition(delta) {
    const speed = flyCam.baseSpeed * flyCam.speedFactor * (flyKeys.speedBoost ? 2.5 : 1.0) * delta;

    // Vector de avance relativo a la orientación horizontal (yaw)
    const sinY = Math.sin(flyCam.yaw);
    const cosY = Math.cos(flyCam.yaw);

    // Adelante / Atrás
    if (flyKeys.forward) {
        flyCam.x -= sinY * speed;
        flyCam.z -= cosY * speed;
    }
    if (flyKeys.backward) {
        flyCam.x += sinY * speed;
        flyCam.z += cosY * speed;
    }

    // Izquierda / Derecha (Strafing)
    if (flyKeys.left) {
        flyCam.x -= cosY * speed;
        flyCam.z += sinY * speed;
    }
    if (flyKeys.right) {
        flyCam.x += cosY * speed;
        flyCam.z -= sinY * speed;
    }

    // Subir / Bajar
    if (flyKeys.up) {
        flyCam.y += speed;
    }
    if (flyKeys.down) {
        flyCam.y -= speed;
    }

    // Mantener la cámara siempre por encima del suelo con un margen mínimo
    const groundY = getHeightAt(flyCam.x, flyCam.z);
    if (flyCam.y < groundY + 1.2) {
        flyCam.y = groundY + 1.2;
    }
}

/**
 * Aplica posición y rotación esférica a la cámara Three.js.
 */
function applyFlyCameraTransform() {
    camera.position.set(flyCam.x, flyCam.y, flyCam.z);

    // Calcular vector objetivo según yaw y pitch
    const dirX = -Math.sin(flyCam.yaw) * Math.cos(flyCam.pitch);
    const dirY = Math.sin(flyCam.pitch);
    const dirZ = -Math.cos(flyCam.yaw) * Math.cos(flyCam.pitch);

    const target = new THREE.Vector3(
        flyCam.x + dirX,
        flyCam.y + dirY,
        flyCam.z + dirZ
    );

    camera.lookAt(target);
}

/**
 * Proyecta rayo desde la cámara a través del puntero del ratón
 * para detectar el punto exacto en el terreno.
 */
function updateRaycastWithTerrain() {
    raycaster.setFromCamera(mouseNDC, camera);

    // Si el rayo apunta hacia el cielo o por encima del horizonte, no hay impacto en el terreno
    if (raycaster.ray.direction.y >= -0.005) {
        hasValidGroundHit = false;
        return;
    }

    // Punto de partida: plano a la cota estimada bajo la cámara
    const estGroundY = getHeightAt(flyCam.x, flyCam.z);
    let t = (camera.position.y - estGroundY) / (-raycaster.ray.direction.y);
    if (t < 0.2) t = 1.0;

    // Refinamiento iterativo convergente contra la curvatura real del terreno
    for (let i = 0; i < 4; i++) {
        const testX = camera.position.x + raycaster.ray.direction.x * t;
        const testZ = camera.position.z + raycaster.ray.direction.z * t;
        const terrainY = getHeightAt(testX, testZ);
        const rayY = camera.position.y + raycaster.ray.direction.y * t;
        const diff = rayY - terrainY;
        t += diff / (-raycaster.ray.direction.y);
        if (t < 0.1 || t > 800) break;
    }

    const finalX = camera.position.x + raycaster.ray.direction.x * t;
    const finalZ = camera.position.z + raycaster.ray.direction.z * t;
    const finalY = getHeightAt(finalX, finalZ);

    currentGroundHit.set(finalX, finalY, finalZ);
    hasValidGroundHit = (t > 0.1 && t < 750);
}

function loadSavedWindowPositions() {
    try {
        const raw = localStorage.getItem(GOD_WINDOW_POS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveWindowPosition(windowId, left, top) {
    if (!windowId) return;
    try {
        const map = loadSavedWindowPositions();
        map[windowId] = { left: Math.round(left), top: Math.round(top) };
        localStorage.setItem(GOD_WINDOW_POS_STORAGE_KEY, JSON.stringify(map));
    } catch (_) {}
}

function clearSavedWindowPosition(windowId) {
    if (!windowId) return;
    try {
        const map = loadSavedWindowPositions();
        delete map[windowId];
        localStorage.setItem(GOD_WINDOW_POS_STORAGE_KEY, JSON.stringify(map));
    } catch (_) {}
}

function bringWindowToFront(panelEl) {
    if (!panelEl) return;
    godWindowZCounter = Math.min(9999980, godWindowZCounter + 1);
    panelEl.style.zIndex = String(godWindowZCounter);
}

function clampWindowToViewport(panelEl, windowId = null, persistIfAdjusted = false) {
    if (!panelEl || !panelEl.isConnected) return;
    const rect = panelEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    const maxLeft = Math.max(margin, vw - rect.width - margin);
    const maxTop = Math.max(margin, vh - rect.height - margin);

    const curLeft = parseFloat(panelEl.style.left);
    const curTop = parseFloat(panelEl.style.top);
    const baseLeft = Number.isFinite(curLeft) ? curLeft : rect.left;
    const baseTop = Number.isFinite(curTop) ? curTop : rect.top;

    const clampedLeft = Math.max(margin, Math.min(maxLeft, baseLeft));
    const clampedTop = Math.max(margin, Math.min(maxTop, baseTop));

    panelEl.style.left = `${Math.round(clampedLeft)}px`;
    panelEl.style.top = `${Math.round(clampedTop)}px`;
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
    panelEl.style.transform = 'none';

    if (persistIfAdjusted && windowId && (Math.abs(clampedLeft - baseLeft) > 1 || Math.abs(clampedTop - baseTop) > 1)) {
        saveWindowPosition(windowId, clampedLeft, clampedTop);
    }
}

function applyWindowPosition(panelEl, windowId, getDefaultPosFn) {
    if (!panelEl) return;
    const saved = loadSavedWindowPositions()[windowId];
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
    panelEl.style.transform = 'none';

    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        panelEl.style.left = `${saved.left}px`;
        panelEl.style.top = `${saved.top}px`;
    } else {
        const rect = panelEl.getBoundingClientRect();
        const def = typeof getDefaultPosFn === 'function'
            ? getDefaultPosFn(rect)
            : { left: 16, top: 16 };
        panelEl.style.left = `${Math.round(def.left)}px`;
        panelEl.style.top = `${Math.round(def.top)}px`;
    }
    clampWindowToViewport(panelEl, windowId, false);
}

function resetWindowPosition(panelEl, windowId, getDefaultPosFn, label = 'Ventana') {
    if (!panelEl) return;
    clearSavedWindowPosition(windowId);
    const rect = panelEl.getBoundingClientRect();
    const def = typeof getDefaultPosFn === 'function'
        ? getDefaultPosFn(rect)
        : { left: 16, top: 16 };
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
    panelEl.style.transform = 'none';
    panelEl.style.left = `${Math.round(def.left)}px`;
    panelEl.style.top = `${Math.round(def.top)}px`;
    clampWindowToViewport(panelEl, windowId, false);
    bringWindowToFront(panelEl);
    showDevToast(`⟲ ${label} devuelta a su posición original`, 1800);
}

function setupDraggableWindow(panelEl, handleEl, windowId, getDefaultPosFn, label = 'Ventana') {
    if (!panelEl || !handleEl) return;

    if (!panelEl.dataset.zOrderBound) {
        panelEl.dataset.zOrderBound = '1';
        panelEl.addEventListener('mousedown', () => {
            bringWindowToFront(panelEl);
        });
    }

    handleEl.classList.add('godDragHandle');
    if (!handleEl.getAttribute('title')) {
        handleEl.setAttribute('title', 'Arrastra para mover libremente · Doble clic para restablecer posición');
    }

    handleEl.onmousedown = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, input, select, textarea, a, label, [data-no-drag]')) return;

        e.preventDefault();
        e.stopPropagation();
        bringWindowToFront(panelEl);

        const rect = panelEl.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const origLeft = rect.left;
        const origTop = rect.top;

        panelEl.style.right = 'auto';
        panelEl.style.bottom = 'auto';
        panelEl.style.transform = 'none';
        panelEl.style.left = `${Math.round(origLeft)}px`;
        panelEl.style.top = `${Math.round(origTop)}px`;
        panelEl.style.transition = 'none';
        document.body.style.userSelect = 'none';

        const onDragMove = (ev) => {
            ev.stopPropagation();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const curRect = panelEl.getBoundingClientRect();
            const margin = 8;
            const maxLeft = Math.max(margin, vw - curRect.width - margin);
            const maxTop = Math.max(margin, vh - curRect.height - margin);

            const nextLeft = Math.max(margin, Math.min(maxLeft, origLeft + (ev.clientX - startX)));
            const nextTop = Math.max(margin, Math.min(maxTop, origTop + (ev.clientY - startY)));

            panelEl.style.left = `${Math.round(nextLeft)}px`;
            panelEl.style.top = `${Math.round(nextTop)}px`;
        };

        const onDragEnd = (ev) => {
            ev.stopPropagation();
            window.removeEventListener('mousemove', onDragMove, true);
            window.removeEventListener('mouseup', onDragEnd, true);
            document.body.style.userSelect = '';

            const finalRect = panelEl.getBoundingClientRect();
            saveWindowPosition(windowId, finalRect.left, finalRect.top);
        };

        window.addEventListener('mousemove', onDragMove, true);
        window.addEventListener('mouseup', onDragEnd, true);
    };

    handleEl.ondblclick = (e) => {
        if (e.target.closest('button, input, select, textarea, a, label, [data-no-drag]')) return;
        e.stopPropagation();
        resetWindowPosition(panelEl, windowId, getDefaultPosFn, label);
    };
}

function getDefaultHudWindowPos(rect) {
    const w = rect?.width || Math.min(1040, window.innerWidth * 0.94);
    const h = rect?.height || 230;
    return {
        left: Math.max(8, Math.round((window.innerWidth - w) / 2)),
        top: Math.max(8, window.innerHeight - h - 16)
    };
}

function getDefaultGuideWindowPos() {
    return { left: 16, top: 16 };
}

function getDefaultLocatorWindowPos(rect) {
    const w = rect?.width || 470;
    return {
        left: Math.max(8, window.innerWidth - w - 16),
        top: 16
    };
}

function getDefaultObjectsWindowPos(rect) {
    const w = rect?.width || 440;
    return {
        left: Math.max(8, window.innerWidth - w - 16),
        top: 84
    };
}

function getDefaultLogicWindowPos(rect) {
    const w = rect?.width || 480;
    const h = rect?.height || 430;
    return {
        left: Math.max(8, Math.round((window.innerWidth - w) / 2)),
        top: Math.max(8, Math.round((window.innerHeight - h) / 2))
    };
}

function getDefaultCatalogWindowPos() {
    return {
        left: 16,
        top: Math.max(120, Math.min(205, Math.round(window.innerHeight * 0.24)))
    };
}

function onGodModeWindowResize() {
    if (!isGodModeActive) return;
    if (hudContainer) clampWindowToViewport(hudContainer, 'hud', false);
    if (controlsGuidePanel) clampWindowToViewport(controlsGuidePanel, 'guide', false);
    if (locatorWindowPanel) clampWindowToViewport(locatorWindowPanel, 'locator', false);
    if (objectsWindowPanel) clampWindowToViewport(objectsWindowPanel, 'objects', false);
    if (logicWindowPanel) clampWindowToViewport(logicWindowPanel, 'logic', false);
    if (catalogWindowPanel) clampWindowToViewport(catalogWindowPanel, 'catalog', false);
}

/**
 * Crea la barra de herramientas flotante (HUD) del Modo Dios.
 */
function createGodModeHUD() {
    hudContainer = document.createElement('div');
    hudContainer.id = 'devGodModeBar';
    hudContainer.className = 'devGodModeBar';

    document.body.appendChild(hudContainer);
    renderHUDContent();
    applyWindowPosition(hudContainer, 'hud', getDefaultHudWindowPos);
    bringWindowToFront(hudContainer);

    createGodModeControlsGuide();

    if (isCatalogOpen) {
        createOrUpdateCatalogWindow();
    }
    if (isLocatorOpen) {
        createOrUpdateLocatorWindow();
    }
    if (showObjectsListDrawer) {
        createOrUpdateObjectsWindow();
    }
}

function renderHUDContent() {
    if (!hudContainer) return;

    const customItems = getCustomItems();
    const uploadedModels = getUploadedModelsCatalog();
    const activeMeshes = getActiveWorldMeshes();
    const isCollapsed = hudContainer.classList.contains('collapsed');

    const locatableEntities = getAllLocatableEntities();

    hudContainer.innerHTML = `
        <div class="godBarHeader" id="godHudDragHandle" title="Arrastra desde aquí para mover el HUD · Doble clic para centrar abajo">
            <div class="godBarTitle">
                <span class="godWinGrip" aria-hidden="true">⋮⋮</span>
                <span class="godDotLive"></span>
                <span>🌍 MODO DIOS &bull; EDITOR DE MUNDO</span>
                ${hasUnsavedChanges ? `
                    <span class="godPillBadge" style="background:rgba(234, 179, 8, 0.22);border:1.5px solid #eab308;color:#fef08a;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:800;animation:pulse 2s infinite;" title="Tienes cambios en vivo pendientes de guardar">
                        🟡 Cambios sin guardar (${pendingChangesCount})
                    </span>
                ` : `
                    <span class="godPillBadge" style="background:rgba(16, 185, 129, 0.15);border:1px solid rgba(16, 185, 129, 0.4);color:#34d399;padding:2px 7px;border-radius:6px;font-size:0.7rem;font-weight:700;">
                        🟢 Sincronizado
                    </span>
                `}
            </div>
            <div class="godBarActions" style="flex-wrap:wrap;">
                <button id="godGuideBtn" class="godPillBtn" style="background:rgba(212,175,55,0.18);border-color:rgba(212,175,55,0.5);color:#ffd54f;font-weight:700;" title="Ver controles y atajos de teclado (Tecla F1)">
                    ⌨️ Guía (F1)
                </button>
                <button id="godSpeedBtn" class="godPillBtn" title="Velocidad de Vuelo (1x, 2x, 4x)">
                    🚀 ${flyCam.speedFactor}x
                </button>
                <button id="godCatalogBtn" class="godPillBtn ${isCatalogOpen ? 'active' : ''}" style="background:${isCatalogOpen ? '#b45309' : 'rgba(212,175,55,0.18)'};border:1.5px solid #d4af37;color:#fef3c7;font-weight:800;" title="Abrir/Cerrar ventana independiente de Catálogo de Modelos 3D">
                    🎨 Catálogo (${customItems.length + 10 + uploadedModels.length})
                </button>
                <button id="godLocatorBtn" class="godPillBtn ${isLocatorOpen ? 'active' : ''}" style="background:${isLocatorOpen ? '#0284c7' : 'rgba(14,165,233,0.18)'};border:1.5px solid #38bdf8;color:#e0f2fe;font-weight:800;" title="Abrir ventana flotante Localizador de Modelos">
                    🧭 Localizador (${locatableEntities.length})
                </button>
                <button id="godUndoBtn" class="godPillBtn" title="Deshacer último objeto colocado (Ctrl+Z)" ${activeMeshes.length === 0 ? 'style="opacity:0.5;cursor:not-allowed;"' : ''}>
                    ↶ Deshacer
                </button>
                <button id="godTeleportPlayerBtn" class="godActionBtn" style="background:#0284c7;" title="Traer al Player a la posición actual de la cámara">
                    📍 Traer Player
                </button>
                <!-- BOTÓN PRINCIPAL: GUARDAR Y HORNEAR ESCENARIO (OPCIÓN A) -->
                <button id="godUnifiedSaveBtn" class="godActionBtn" style="background:${hasUnsavedChanges ? '#059669' : '#1e293b'};border:1.5px solid ${hasUnsavedChanges ? '#34d399' : '#475569'};color:#ffffff;font-weight:800;box-shadow:${hasUnsavedChanges ? '0 0 14px rgba(16,185,129,0.6)' : 'none'};" title="Guardar todos los cambios en LocalStorage y fijarlos en el código fuente para Git">
                    💾 Guardar y Hornear
                </button>
                <!-- BOTÓN: DESCARTAR CAMBIOS Y VOLVER AL ÚLTIMO GUARDADO -->
                <button id="godRevertBtn" class="godActionBtn" style="background:#b45309;border:1px solid #f59e0b;color:#fff;font-weight:700;" title="Descartar cambios no guardados y restaurar al estado confirmado">
                    ↩️ Descartar
                </button>
                <button id="godOpenDevPanelBtn" class="godActionBtn" style="background:#334155;" title="Abrir Developer Suite (F9)">
                    ⚙️ DevSuite
                </button>
                <button id="godHudResetPosBtn" class="godWinIconBtn" title="Restablecer posición original del HUD (abajo centrado)">⟲</button>
                <button id="godCollapseBtn" class="godCollapseBtn" title="Ocultar/Mostrar cuerpo del HUD (Tecla H)">${isCollapsed ? '▴ Mostrar' : '▾ Ocultar'}</button>
                <button id="godExitBtn" class="godActionBtn godExitBtn" title="Salir de Modo Dios y volver al Player">
                    🚶 Salir
                </button>
            </div>
        </div>

        <!-- BARRA DE HERRAMIENTAS Y PARÁMETROS -->
        <div class="godControlsRow">
            <div class="godToolGroup">
                <button class="godToolBtn ${currentTool === 'place' ? 'active' : ''}" data-tool="place" title="Colocar objeto en el terreno">
                    🔨 Colocar
                </button>
                <button class="godToolBtn ${currentTool === 'select' ? 'active' : ''}" data-tool="select" title="Selector Universal: haz clic en cualquier Player, NPC, Árbol, Roca, Mueble u Objeto">
                    🎯 Selector Universal
                </button>
                <button id="godEdgeSnapToggleBtn" class="godToolBtn ${isEdgeSnapEnabled ? 'active' : ''}" style="${isEdgeSnapEnabled ? 'background:#0f766e;border-color:#2dd4bf;color:#fff;' : ''}" title="Imán de Bordes: pega objetos borde-con-borde y alinea ángulos a 90° automáticamente al mover o colocar (Tecla M)">
                    🧲 Imán: ${isEdgeSnapEnabled ? 'ON' : 'OFF'}
                </button>
            </div>

            <!-- ESTADO DEL OBJETO ACTIVO / DESELECCIONAR -->
            <div class="godItemStatusWrap" style="display:flex;align-items:center;gap:5px;">
                ${selectedCatalogItem ? `
                    <button id="godClearItemBtn" class="godPillBtn" style="background:#1e293b;border-color:#ffd54f;color:#ffd54f;font-weight:700;" title="Deseleccionar y dejar el cursor libre de objetos">
                        ✕ Soltar: <strong>${escapeHtml(selectedCatalogItem.name)}</strong>
                    </button>
                ` : `
                    <span class="godPillBadge" style="background:rgba(16, 185, 129, 0.15);border:1px solid rgba(16, 185, 129, 0.4);color:#34d399;padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:700;">
                        🟢 Puntero Libre (Sin Objeto)
                    </span>
                `}
                ${!isCatalogOpen ? `
                    <button id="godQuickOpenCatalogBtn" class="godPillBtn" style="background:rgba(212,175,55,0.2);border-color:#d4af37;color:#ffd54f;font-weight:700;padding:4px 8px;" title="Abrir ventana de Catálogo 3D para elegir otro modelo">
                        🎨 Elegir Modelo
                    </button>
                ` : ''}
            </div>

            <!-- CONTROLES Y ACCIONES DEL ELEMENTO SELECCIONADO (SELECTOR UNIVERSAL) -->
            ${selectedWorldObject ? `
                <div class="godSelectedWrap" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span class="godPillBadge" style="background:rgba(212, 175, 55, 0.18);border:1px solid rgba(212, 175, 55, 0.5);color:#ffd54f;padding:4px 8px;border-radius:6px;font-size:0.75rem;font-weight:700;">
                        ${selectedWorldObject.data?.icon || '📦'} ${escapeHtml(selectedWorldObject.data?.name || 'Objeto')}
                    </span>
                    <button id="godMoveSelectedToCursorBtn" class="godActionBtn" style="background:#0284c7;border-color:#38bdf8;font-weight:700;" title="Mover este elemento a la posición actual del cursor de terreno">
                        📍 Mover al Cursor
                    </button>
                    <button id="godGrabSelectedBtn" class="godActionBtn" style="${isGrabModeActive ? 'background:#059669;border-color:#10b981;' : 'background:#0369a1;border-color:#38bdf8;'}font-weight:700;" title="Activar modo Agarrar para mover el objeto siguiendo el ratón (Tecla G)">
                        ${isGrabModeActive ? '✋ Fijar (G)' : '✋ Agarrar (G)'}
                    </button>
                    ${(selectedWorldObject.type === 'custom' || selectedWorldObject.category === 'instanced') ? `
                        <button id="godDuplicateSelectedBtn" class="godActionBtn" style="background:#7c3aed;border-color:#a78bfa;font-weight:700;" title="Duplicar este elemento desplazado (Atajo: Ctrl + D)">
                            📑 Duplicar (Ctrl+D)
                        </button>
                        <div style="display:inline-flex;align-items:center;gap:2px;background:rgba(15,118,110,0.3);border:1px solid #2dd4bf;border-radius:6px;padding:1px 4px;" title="Clonar pegado exactamente borde-con-borde siguiendo la rotación y tamaño real del objeto (Atajo Auto: Ctrl+Shift+D)">
                            <button id="godAdjacentAutoBtn" class="godActionBtn" style="background:#0f766e;border-color:#2dd4bf;font-weight:800;padding:2px 6px;" title="Clonar pegado al lado en línea continua (Ctrl+Shift+D)">
                                🧲 Pegar al lado
                            </button>
                            <button class="godMiniBtn godAdjacentDirBtn" data-dir="left" title="Pegar al borde izquierdo del objeto">⬅</button>
                            <button class="godMiniBtn godAdjacentDirBtn" data-dir="back" title="Pegar al borde trasero del objeto">⬆</button>
                            <button class="godMiniBtn godAdjacentDirBtn" data-dir="front" title="Pegar al borde delantero del objeto">⬇</button>
                            <button class="godMiniBtn godAdjacentDirBtn" data-dir="right" title="Pegar al borde derecho del objeto">➡</button>
                        </div>
                    ` : ''}
                    <div style="display:inline-flex;align-items:center;gap:2px;background:rgba(30,41,59,0.75);border:1px solid #475569;border-radius:6px;padding:1px 4px;" title="Micro-ajuste de 5 cm (Atajo: Alt+Flechas, o Shift+Alt+Flechas para 25 cm)">
                        <span style="font-size:0.65rem;color:#94a3b8;padding:0 2px;">Ajuste:</span>
                        <button class="godMiniBtn godNudgeBtn" data-nudge="left" title="Mover 5 cm izquierda (Alt+⬅)">◀</button>
                        <button class="godMiniBtn godNudgeBtn" data-nudge="up" title="Mover 5 cm adelante (Alt+⬆)">▲</button>
                        <button class="godMiniBtn godNudgeBtn" data-nudge="down" title="Mover 5 cm atrás (Alt+⬇)">▼</button>
                        <button class="godMiniBtn godNudgeBtn" data-nudge="right" title="Mover 5 cm derecha (Alt+➡)">▶</button>
                    </div>
                    ${selectedWorldObject.type === 'custom' ? `
                        <button id="godToggleSolidBtn" class="godActionBtn" style="${selectedWorldObject.data?.isSolid !== false ? 'background:#059669;border-color:#10b981;' : 'background:#475569;border-color:#64748b;'}font-weight:700;" title="Alternar entre física sólida con colisión o elemento decorativo traspasable">
                            ${selectedWorldObject.data?.isSolid !== false ? '🧱 Sólido' : '👻 Traspasable'}
                        </button>
                        <button id="godLogicSelectedBtn" class="godActionBtn" style="background:#0f766e;border-color:#14b8a6;font-weight:700;" title="Configurar comportamiento lógico, interacción o disparador de eventos">
                            ⚙️ Lógica
                        </button>
                    ` : ''}
                    ${selectedWorldObject.type === 'player' ? `
                        <span class="godPillBadge" style="background:rgba(56, 189, 248, 0.2);border:1px solid #38bdf8;color:#38bdf8;padding:4px 8px;border-radius:6px;font-size:0.75rem;font-weight:800;" title="El Robot Player no puede eliminarse">
                            🛡️ Protegido
                        </span>
                    ` : `
                        <button id="godDeleteSelectedBtn" class="godActionBtn" style="background:#b91c1c;border-color:#ef4444;font-weight:800;" title="Eliminar este elemento del mapa">
                            ${selectedWorldObject.type === 'tree' ? '🪓 Talar' : selectedWorldObject.type === 'rock' ? '🔨 Romper' : `🗑️ Eliminar`}
                        </button>
                    `}
                    <button id="godDeselectBtn" class="godMiniBtn" style="color:#94a3b8;font-weight:700;padding:2px 6px;" title="Deseleccionar elemento">
                        ✕
                    </button>
                </div>
            ` : ''}

            <!-- BOTÓN VER / GESTIONAR OBJETOS EN ESCENARIO -->
            <button id="godToggleObjectsListBtn" class="godPillBtn ${showObjectsListDrawer ? 'active' : ''}" style="background:rgba(212, 175, 55, 0.15);border-color:rgba(212, 175, 55, 0.4);color:#ffd54f;" title="Ver y eliminar objetos colocados en el mapa">
                🗺️ En Escena (${activeMeshes.length})
            </button>

            <!-- CONTROLES DE TRANSFORMACIÓN RÁPIDA (PRECISIÓN Y CAMPOS EDITABLES) -->
            <div class="godTransformGroup">
                <!-- ROTACIÓN PRECISA (Botones ±15° y campo numérico de grados editable) -->
                <div class="godMiniInputGroup" title="Rotación en grados (0° a 360°). Escribe un ángulo o usa los botones ±15° (o atajos R / T. Con Shift: ±5°)">
                    <label>Rot:</label>
                    <button id="godRotPrevBtn" class="godMiniBtn" title="Girar -15° (Tecla T. Con Shift: -5°)">-15°</button>
                    <input type="number" id="godRotInput" class="godNumericInput" min="0" max="360" step="5"
                           value="${Math.round(((THREE.MathUtils.radToDeg(currentRotationY) % 360) + 360) % 360)}"
                           style="width:48px;background:rgba(0,0,0,0.6);border:1px solid #38bdf8;color:#ffd54f;font-weight:700;font-size:0.75rem;padding:2px 4px;border-radius:4px;text-align:center;" />
                    <span style="color:#94a3b8;font-size:0.72rem;margin-left:-2px;">°</span>
                    <button id="godRotNextBtn" class="godMiniBtn" title="Girar +15° (Tecla R. Con Shift: +5°)">+15°</button>
                </div>

                <!-- ESCALA LIBRE + DESBLOQUEO INDEPENDIENTE POR EJES X / Y / Z -->
                <div class="godMiniInputGroup" title="Escala uniforme (🔗) o desbloqueada por eje individual X (ancho), Y (alto), Z (fondo) (🔓)">
                    <label>Escala:</label>
                    <button id="godScaleLockBtn" class="godMiniBtn" style="padding:2px 5px;${isScaleUnlocked ? 'background:#b45309;border-color:#f59e0b;color:#fff;' : 'background:#0369a1;border-color:#38bdf8;color:#fff;'}" title="${isScaleUnlocked ? 'Ejes desbloqueados (🔓): edita X, Y o Z por separado. Clic para bloquear proporción 🔗' : 'Proporción bloqueada (🔗): escala las 3 dimensiones juntas. Clic para desbloquear X / Y / Z 🔓'}">
                        ${isScaleUnlocked ? '🔓' : '🔗'}
                    </button>
                    <button id="godScaleDownBtn" class="godMiniBtn" title="Reducir escala proporcionalmente (Tecla -)">-</button>
                    <input type="number" id="godScaleInput" class="godNumericInput" min="0.05" max="200" step="0.2"
                           value="${parseFloat(currentScale.toFixed(2))}"
                           style="width:46px;background:rgba(0,0,0,0.6);border:1px solid #38bdf8;color:#38bdf8;font-weight:700;font-size:0.75rem;padding:2px 4px;border-radius:4px;text-align:center;" />
                    <span style="color:#94a3b8;font-size:0.72rem;margin-left:-2px;">x</span>
                    <button id="godScaleUpBtn" class="godMiniBtn" title="Aumentar escala proporcionalmente (Tecla +)">+</button>
                    ${isScaleUnlocked ? `
                        <span style="color:#f87171;font-size:0.7rem;font-weight:800;margin-left:3px;">X</span>
                        <input type="number" id="godScaleXInput" class="godNumericInput" min="0.05" max="200" step="0.1"
                               value="${parseFloat(currentScaleXYZ.x.toFixed(2))}"
                               title="Escala eje X (Anchura)"
                               style="width:44px;background:rgba(0,0,0,0.65);border:1px solid #f87171;color:#fecaca;font-weight:700;font-size:0.72rem;padding:2px 3px;border-radius:4px;text-align:center;" />
                        <span style="color:#4ade80;font-size:0.7rem;font-weight:800;margin-left:2px;">Y</span>
                        <input type="number" id="godScaleYInput" class="godNumericInput" min="0.05" max="200" step="0.1"
                               value="${parseFloat(currentScaleXYZ.y.toFixed(2))}"
                               title="Escala eje Y (Altura)"
                               style="width:44px;background:rgba(0,0,0,0.65);border:1px solid #4ade80;color:#bbf7d0;font-weight:700;font-size:0.72rem;padding:2px 3px;border-radius:4px;text-align:center;" />
                        <span style="color:#60a5fa;font-size:0.7rem;font-weight:800;margin-left:2px;">Z</span>
                        <input type="number" id="godScaleZInput" class="godNumericInput" min="0.05" max="200" step="0.1"
                               value="${parseFloat(currentScaleXYZ.z.toFixed(2))}"
                               title="Escala eje Z (Profundidad)"
                               style="width:44px;background:rgba(0,0,0,0.65);border:1px solid #60a5fa;color:#bfdbfe;font-weight:700;font-size:0.72rem;padding:2px 3px;border-radius:4px;text-align:center;" />
                    ` : ''}
                </div>

                <!-- ELEVACIÓN Y RESPECTO AL TERRENO -->
                <div class="godMiniInputGroup" title="Ajustar altura respecto al terreno (enterrar o elevar)">
                    <label>Elev. Y:</label>
                    <button id="godElevDownBtn" class="godMiniBtn" title="Enterrar / Bajar altura (-15 cm)">▼</button>
                    <span id="godElevVal" style="font-size:0.68rem;min-width:32px;text-align:center;">
                        ${selectedWorldObject?.mesh?.userData?.relativeGroundOffset !== undefined ? `${(selectedWorldObject.mesh.userData.relativeGroundOffset >= 0 ? '+' : '')}${selectedWorldObject.mesh.userData.relativeGroundOffset.toFixed(2)}m` : '0.00m'}
                    </span>
                    <button id="godElevUpBtn" class="godMiniBtn" title="Elevar / Subir altura (+15 cm)">▲</button>
                </div>
            </div>

            <!-- SUBIR .GLB LOCAL DESDE EL PC -->
            <div class="godUploadWrap">
                <input type="file" id="godGlbFileInput" accept=".glb,.gltf" style="display:none;" />
                <button id="godUploadGlbBtn" class="godUploadBtn" title="Subir un archivo .glb o .gltf desde tu ordenador para colocarlo">
                    📁 Cargar .GLB del PC
                </button>
            </div>
        </div>

        <!-- PIE CON ATAJOS Y CONSEJOS -->
        <div class="godBarFooter">
            <span>🧲 <b>Ctrl+Shift+D:</b> Pegar al lado &bull; <b>M:</b> Imán &bull; <b>Alt+Flechas:</b> 5cm &bull; <b>🔗/🔓:</b> Escalar 1 eje &bull; <b>Arrastra cabeceras ⋮⋮</b> para mover ventanas</span>
        </div>
    `;

    setupHUDEvents();
    clampWindowToViewport(hudContainer, 'hud', false);

    if (isCatalogOpen) {
        createOrUpdateCatalogWindow();
    } else {
        destroyCatalogWindow();
    }
    if (isLocatorOpen) {
        createOrUpdateLocatorWindow();
    }
    if (showObjectsListDrawer) {
        createOrUpdateObjectsWindow();
    }
}

const SYSTEM_CATALOG_ITEMS = [
    { id: 'flashlight', name: 'Linterna', icon: '🔦', tag: 'Equipo' },
    { id: 'key', name: 'Llave Dorada', icon: '🔑', tag: 'Objeto' },
    { id: 'notebook', name: 'Cuaderno', icon: '📓', tag: 'Objeto' },
    { id: 'wrench', name: 'Llave Inglesa', icon: '🔧', tag: 'Herramienta' },
    { id: 'card', name: 'Carnet Oficial', icon: '🪪', tag: 'Objeto' },
    { id: 'tree_1', name: 'Roble Ancestral', icon: '🌲', tag: 'Árbol' },
    { id: 'tree_2', name: 'Pino Silvestre', icon: '🌲', tag: 'Árbol' },
    { id: 'tree_3', name: 'Abedul Esbelto', icon: '🌳', tag: 'Árbol' },
    { id: 'rock_dodec', name: 'Roca Dodecaédrica', icon: '🪨', tag: 'Roca' },
    { id: 'rock_icosa', name: 'Roca Icosaédrica', icon: '🪨', tag: 'Roca' }
];

function formatShortItemDate(ts) {
    if (!ts) return 'Preset';
    try {
        const d = new Date(ts);
        return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
        return 'Personalizado';
    }
}

function renderCatalogItemsHTML(customItems, uploadedModels, searchQuery = '') {
    const q = (searchQuery || '').trim().toLowerCase();

    if (activeCatalogTab === 'library') {
        const filtered = q
            ? customItems.filter(it => (it.name || '').toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q))
            : customItems;

        if (filtered.length === 0) {
            return `<div class="godEmptyMsg" style="grid-column:1 / -1;">${q ? 'Ningún modelo Three.js coincide con tu búsqueda.' : 'No hay objetos en la biblioteca aún. Puedes crearlos en la pestaña "Generador 3D".'}</div>`;
        }

        const nameCounts = new Map();
        customItems.forEach(it => {
            const key = (it.name || '').trim().toLowerCase();
            nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
        });

        return filtered.map(item => {
            const nameKey = (item.name || '').trim().toLowerCase();
            const isDup = (nameCounts.get(nameKey) || 0) > 1;
            const metaText = item.updatedAt
                ? `${isDup ? '🕒 ' : ''}${formatShortItemDate(item.updatedAt)}`
                : (item.category || 'Preset');
            return `
                <button class="godCatalogGridCard godItemCard ${selectedCatalogItem?.sourceId === item.id ? 'active' : ''}" data-source="custom" data-id="${item.id}" title="${escapeHtml(item.name)} · ID: ${escapeHtml(item.id)} (${formatShortItemDate(item.updatedAt)})">
                    <span class="godItemIcon">${item.icon || '📦'}</span>
                    <span class="godCatalogCardBody">
                        <span class="godCatalogCardTitle godItemLabel">${escapeHtml(item.name)}</span>
                        <span class="godCatalogCardMeta" style="${isDup ? 'color:#fbbf24;font-weight:700;' : ''}">${escapeHtml(metaText)}</span>
                    </span>
                </button>
            `;
        }).join('');
    }

    if (activeCatalogTab === 'system') {
        const filtered = q
            ? SYSTEM_CATALOG_ITEMS.filter(it => it.name.toLowerCase().includes(q) || it.tag.toLowerCase().includes(q))
            : SYSTEM_CATALOG_ITEMS;

        if (filtered.length === 0) {
            return `<div class="godEmptyMsg" style="grid-column:1 / -1;">Ningún elemento del sistema coincide con tu búsqueda.</div>`;
        }

        return filtered.map(item => `
            <button class="godCatalogGridCard godItemCard ${selectedCatalogItem?.sourceId === item.id ? 'active' : ''}" data-source="system" data-id="${item.id}" title="${escapeHtml(item.name)} (${item.tag})">
                <span class="godItemIcon">${item.icon}</span>
                <span class="godCatalogCardBody">
                    <span class="godCatalogCardTitle godItemLabel">${escapeHtml(item.name)}</span>
                    <span class="godCatalogCardMeta">${escapeHtml(item.tag)}</span>
                </span>
            </button>
        `).join('');
    }

    if (activeCatalogTab === 'customGlb') {
        const filtered = q
            ? uploadedModels.filter(it => ((it.name || it.filename || '')).toLowerCase().includes(q))
            : uploadedModels;

        if (filtered.length === 0) {
            return `<div class="godEmptyMsg" style="grid-column:1 / -1;">${q ? 'Ningún modelo .GLB coincide con tu búsqueda.' : 'Aún no has subido modelos .GLB de tu PC. Usa el botón "Cargar .GLB del PC".'}</div>`;
        }
        return filtered.map(item => {
            const normUrl = normalizeCustomModelUrl(item.url);
            const status = modelAvailabilityMap.get(item.id) || modelAvailabilityMap.get(normUrl) || 'checking';
            let statusBadge = '<span style="color:#94a3b8;">⏳ Comprobando</span>';
            if (status === 'server') {
                statusBadge = '<span style="color:#34d399;font-weight:700;" title="Disponible en servidor y listo para GitHub">🟢 Listo</span>';
            } else if (status === 'cache') {
                statusBadge = '<span style="color:#fbbf24;font-weight:700;" title="Disponible en caché local del navegador">🟡 Caché</span>';
            } else if (status === 'missing') {
                statusBadge = '<span style="color:#f87171;font-weight:800;" title="Falta el archivo físico .GLB. Haz clic para resubir desde tu PC">🔴 Resubir</span>';
            }
            return `
                <div class="godItemCardWrap" style="position:relative;display:flex;">
                    <button class="godCatalogGridCard godItemCard ${selectedCatalogItem?.sourceId === item.id ? 'active' : ''}" data-source="glb" data-id="${item.id}" data-url="${normUrl}" data-status="${status}" style="${status === 'missing' ? 'border-color:rgba(248,113,113,0.55);' : ''}" title="${escapeHtml(item.name || item.filename)}">
                        <span class="godItemIcon">🎨</span>
                        <span class="godCatalogCardBody">
                            <span class="godCatalogCardTitle godItemLabel">${escapeHtml(item.name || item.filename)}</span>
                            <span class="godCatalogCardMeta">${statusBadge}</span>
                        </span>
                    </button>
                    <button class="godDeleteUploadedCardBtn" data-id="${item.id}" title="Quitar tarjeta del catálogo" style="position:absolute;top:-5px;right:-5px;width:17px;height:17px;border-radius:50%;border:1px solid rgba(255,255,255,0.25);background:#7f1d1d;color:#fecaca;font-size:10px;line-height:14px;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;">×</button>
                </div>
            `;
        }).join('');
    }

    return '';
}

function destroyCatalogWindow() {
    if (catalogWindowPanel && catalogWindowPanel.parentNode) {
        catalogWindowPanel.parentNode.removeChild(catalogWindowPanel);
    }
    catalogWindowPanel = null;
}

function createOrUpdateCatalogWindow() {
    if (!isGodModeActive || !isCatalogOpen) {
        destroyCatalogWindow();
        return;
    }
    if (!catalogWindowPanel) {
        catalogWindowPanel = document.createElement('div');
        catalogWindowPanel.id = 'godCatalogFloatingPanel';
        catalogWindowPanel.className = 'godCatalogWindow';
        document.body.appendChild(catalogWindowPanel);
        renderCatalogWindowContent();
        applyWindowPosition(catalogWindowPanel, 'catalog', getDefaultCatalogWindowPos);
        bringWindowToFront(catalogWindowPanel);
    } else {
        updateCatalogWindowHeaderAndTabs();
        updateCatalogGridContent();
        clampWindowToViewport(catalogWindowPanel, 'catalog', false);
    }
}

function updateCatalogWindowHeaderAndTabs() {
    if (!catalogWindowPanel) return;
    const customItems = getCustomItems();
    const uploadedModels = getUploadedModelsCatalog();
    const totalCount = customItems.length + SYSTEM_CATALOG_ITEMS.length + uploadedModels.length;

    const countEl = catalogWindowPanel.querySelector('#godCatalogTitleCount');
    if (countEl) countEl.textContent = `(${totalCount})`;

    const tabLib = catalogWindowPanel.querySelector('.godCatTabBtn[data-cattab="library"]');
    if (tabLib) {
        tabLib.textContent = `✨ Biblioteca Three.js (${customItems.length})`;
        tabLib.classList.toggle('active', activeCatalogTab === 'library');
    }
    const tabSys = catalogWindowPanel.querySelector('.godCatTabBtn[data-cattab="system"]');
    if (tabSys) {
        tabSys.textContent = `📦 Sistema (${SYSTEM_CATALOG_ITEMS.length})`;
        tabSys.classList.toggle('active', activeCatalogTab === 'system');
    }
    const tabGlb = catalogWindowPanel.querySelector('.godCatTabBtn[data-cattab="customGlb"]');
    if (tabGlb) {
        tabGlb.textContent = `📁 Modelos PC (${uploadedModels.length})`;
        tabGlb.classList.toggle('active', activeCatalogTab === 'customGlb');
    }
}

function updateCatalogGridContent() {
    if (!catalogWindowPanel) return;
    const gridEl = catalogWindowPanel.querySelector('#godCatalogGrid');
    if (!gridEl) return;
    const customItems = getCustomItems();
    const uploadedModels = getUploadedModelsCatalog();
    gridEl.innerHTML = renderCatalogItemsHTML(customItems, uploadedModels, catalogSearchQuery);
    bindCatalogCardEvents();
}

function renderCatalogWindowContent() {
    if (!catalogWindowPanel) return;

    const customItems = getCustomItems();
    const uploadedModels = getUploadedModelsCatalog();
    const totalCount = customItems.length + SYSTEM_CATALOG_ITEMS.length + uploadedModels.length;

    catalogWindowPanel.innerHTML = `
        <div id="godCatalogDragHandle" style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(212,175,55,0.3);padding-bottom:6px;gap:8px;" title="Arrastra para mover libremente · Doble clic para restablecer posición">
            <span style="color:#ffd54f;font-weight:800;font-size:0.8rem;display:flex;align-items:center;gap:6px;">
                <span class="godWinGrip" aria-hidden="true">⋮⋮</span>
                🎨 CATÁLOGO DE MODELOS 3D <span id="godCatalogTitleCount">(${totalCount})</span>
            </span>
            <div style="display:flex;align-items:center;gap:4px;">
                <button id="godCatalogPinBtn" class="godWinIconBtn godCatalogPinBtn ${isCatalogPinned ? 'pinned' : ''}" title="${isCatalogPinned ? 'Ventana FIJA: permanece abierta al seleccionar modelos (clic para cambiar a Auto-ocultar)' : 'Modo AUTO-OCULTAR: se cerrará al elegir un modelo (clic para Fijar)'}">
                    ${isCatalogPinned ? '📌 Fija' : '🔓 Auto-ocultar'}
                </button>
                <button id="godCatalogResetPosBtn" class="godWinIconBtn" title="Restablecer posición original">⟲</button>
                <button id="godCatalogCloseWinBtn" class="godWinIconBtn" style="color:#fecaca;border-color:rgba(248,113,113,0.45);" title="Cerrar ventana de Catálogo">✕</button>
            </div>
        </div>

        <div class="godCatalogSearchRow">
            <div class="godCatalogSearchWrap">
                <input type="text" id="godCatalogSearchInput" class="godCatalogSearchInput" value="${escapeHtml(catalogSearchQuery)}" placeholder="🔍 Buscar modelo por nombre..." autocomplete="off" />
                ${catalogSearchQuery ? `<button id="godCatalogSearchClearBtn" class="godCatalogSearchClearBtn" title="Limpiar búsqueda">✕</button>` : ''}
            </div>
            <button id="godCatalogUploadGlbBtn" class="godUploadBtn" style="padding:5px 9px;font-size:0.72rem;white-space:nowrap;" title="Subir un modelo .glb / .gltf desde tu PC">
                📁 + .GLB
            </button>
        </div>

        <div class="godCatalogTabs">
            <button class="godCatTabBtn ${activeCatalogTab === 'library' ? 'active' : ''}" data-cattab="library">
                ✨ Biblioteca Three.js (${customItems.length})
            </button>
            <button class="godCatTabBtn ${activeCatalogTab === 'system' ? 'active' : ''}" data-cattab="system">
                📦 Sistema (${SYSTEM_CATALOG_ITEMS.length})
            </button>
            <button class="godCatTabBtn ${activeCatalogTab === 'customGlb' ? 'active' : ''}" data-cattab="customGlb">
                📁 Modelos PC (${uploadedModels.length})
            </button>
        </div>

        <div id="godCatalogGrid" class="godCatalogGrid styledScrollbar">
            ${renderCatalogItemsHTML(customItems, uploadedModels, catalogSearchQuery)}
        </div>
    `;

    const dragHandle = catalogWindowPanel.querySelector('#godCatalogDragHandle');
    setupDraggableWindow(catalogWindowPanel, dragHandle, 'catalog', getDefaultCatalogWindowPos, 'Catálogo 3D');

    const pinBtn = catalogWindowPanel.querySelector('#godCatalogPinBtn');
    if (pinBtn) {
        pinBtn.onclick = (e) => {
            e.stopPropagation();
            isCatalogPinned = !isCatalogPinned;
            pinBtn.classList.toggle('pinned', isCatalogPinned);
            pinBtn.textContent = isCatalogPinned ? '📌 Fija' : '🔓 Auto-ocultar';
            pinBtn.title = isCatalogPinned
                ? 'Ventana FIJA: permanece abierta al seleccionar modelos (clic para cambiar a Auto-ocultar)'
                : 'Modo AUTO-OCULTAR: se cerrará al elegir un modelo (clic para Fijar)';
            showDevToast(isCatalogPinned
                ? '📌 Catálogo fijado: permanecerá abierto al seleccionar modelos'
                : '🔓 Auto-ocultar activo: la ventana se cerrará al elegir un modelo');
        };
    }

    const resetBtn = catalogWindowPanel.querySelector('#godCatalogResetPosBtn');
    if (resetBtn) {
        resetBtn.onclick = (e) => {
            e.stopPropagation();
            resetWindowPosition(catalogWindowPanel, 'catalog', getDefaultCatalogWindowPos, 'Catálogo 3D');
        };
    }

    const closeBtn = catalogWindowPanel.querySelector('#godCatalogCloseWinBtn');
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            isCatalogOpen = false;
            destroyCatalogWindow();
            renderHUDContent();
        };
    }

    const searchInput = catalogWindowPanel.querySelector('#godCatalogSearchInput');
    if (searchInput) {
        searchInput.oninput = () => {
            catalogSearchQuery = searchInput.value || '';
            const clearBtn = catalogWindowPanel.querySelector('#godCatalogSearchClearBtn');
            if (catalogSearchQuery && !clearBtn) {
                const btn = document.createElement('button');
                btn.id = 'godCatalogSearchClearBtn';
                btn.className = 'godCatalogSearchClearBtn';
                btn.title = 'Limpiar búsqueda';
                btn.textContent = '✕';
                btn.onclick = (ev) => {
                    ev.stopPropagation();
                    catalogSearchQuery = '';
                    searchInput.value = '';
                    btn.remove();
                    updateCatalogGridContent();
                    searchInput.focus();
                };
                searchInput.parentNode?.appendChild(btn);
            } else if (!catalogSearchQuery && clearBtn) {
                clearBtn.remove();
            }
            updateCatalogGridContent();
        };
        ['keydown', 'keyup', 'keypress'].forEach(evt => {
            searchInput.addEventListener(evt, (ev) => ev.stopPropagation());
        });
    }

    const clearSearchBtn = catalogWindowPanel.querySelector('#godCatalogSearchClearBtn');
    if (clearSearchBtn) {
        clearSearchBtn.onclick = (e) => {
            e.stopPropagation();
            catalogSearchQuery = '';
            renderCatalogWindowContent();
            catalogWindowPanel?.querySelector('#godCatalogSearchInput')?.focus();
        };
    }

    const catUploadBtn = catalogWindowPanel.querySelector('#godCatalogUploadGlbBtn');
    if (catUploadBtn) {
        catUploadBtn.onclick = (e) => {
            e.stopPropagation();
            const fileInput = hudContainer?.querySelector('#godGlbFileInput');
            if (fileInput) fileInput.click();
        };
    }

    catalogWindowPanel.querySelectorAll('.godCatTabBtn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            activeCatalogTab = btn.getAttribute('data-cattab');
            updateCatalogWindowHeaderAndTabs();
            updateCatalogGridContent();
            if (activeCatalogTab === 'customGlb') {
                refreshUploadedModelsStatus();
            }
        };
    });

    bindCatalogCardEvents();
}

/**
 * Crea y actualiza la tarjeta flotante arrastrable con los atajos y controles en pantalla.
 */
function createGodModeControlsGuide() {
    if (controlsGuidePanel) {
        if (controlsGuidePanel.parentNode) controlsGuidePanel.parentNode.removeChild(controlsGuidePanel);
        controlsGuidePanel = null;
    }

    controlsGuidePanel = document.createElement('div');
    controlsGuidePanel.id = 'godControlsGuidePanel';
    controlsGuidePanel.style.cssText = `
        position: fixed;
        top: 16px;
        left: 16px;
        width: 320px;
        max-width: 90vw;
        background: rgba(10, 16, 12, 0.92);
        backdrop-filter: blur(8px);
        border: 1.5px solid rgba(212, 175, 55, 0.45);
        border-radius: 12px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.75);
        padding: 10px 14px;
        z-index: 999990;
        color: #fff8e7;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        user-select: none;
    `;

    document.body.appendChild(controlsGuidePanel);
    renderControlsGuideContent();
    applyWindowPosition(controlsGuidePanel, 'guide', getDefaultGuideWindowPos);
}

function renderControlsGuideContent() {
    if (!controlsGuidePanel) return;

    if (isGuideCollapsed) {
        controlsGuidePanel.style.padding = '6px 12px';
        controlsGuidePanel.style.width = 'auto';
        controlsGuidePanel.innerHTML = `
            <div id="godGuideDragHandle" style="display:flex;align-items:center;gap:8px;" title="Arrastra para mover · Doble clic para restablecer posición">
                <span class="godWinGrip" aria-hidden="true">⋮⋮</span>
                <span style="font-size:0.75rem;font-weight:700;color:#ffd54f;">⌨️ Controles (F1)</span>
                <button id="godGuideResetPosBtn" class="godWinIconBtn" title="Restablecer posición original">⟲</button>
                <button id="godGuideToggleMinBtn" style="background:rgba(212,175,55,0.18);border:1px solid rgba(212,175,55,0.45);color:#ffd54f;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:0.68rem;font-weight:700;">
                    ▾ Mostrar
                </button>
            </div>
        `;
    } else {
        controlsGuidePanel.style.padding = '10px 14px';
        controlsGuidePanel.style.width = '320px';
        const isObjSelected = Boolean(selectedWorldObject);
        const objName = selectedWorldObject ? (selectedWorldObject.data?.name || 'Objeto') : null;

        controlsGuidePanel.innerHTML = `
            <div id="godGuideDragHandle" style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(212,175,55,0.3);padding-bottom:6px;margin-bottom:8px;" title="Arrastra para mover · Doble clic para restablecer posición">
                <span style="font-size:0.8rem;font-weight:800;color:#ffd54f;display:flex;align-items:center;gap:6px;">
                    <span class="godWinGrip" aria-hidden="true">⋮⋮</span>
                    ⌨️ Controles Modo Dios
                </span>
                <div style="display:flex;align-items:center;gap:4px;">
                    <button id="godGuideResetPosBtn" class="godWinIconBtn" title="Restablecer posición original (arriba izquierda)">⟲</button>
                    <button id="godGuideToggleMinBtn" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#ffd54f;border-radius:4px;padding:1px 6px;cursor:pointer;font-size:0.68rem;font-weight:700;" title="Minimizar panel (F1)">
                        ▴ Ocultar
                    </button>
                </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:7px;font-size:0.72rem;line-height:1.35;">
                <!-- 1. VUELO Y CÁMARA -->
                <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:5px 8px;">
                    <div style="color:#60a5fa;font-weight:700;font-size:0.68rem;margin-bottom:4px;">🕹️ VUELO Y CÁMARA</div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 8px;align-items:center;">
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">WASD / Flechas</span><span style="color:#cbd5e1;">Volar por el mapa</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">Q / E / Espacio</span><span style="color:#cbd5e1;">Descender / Ascender</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">Shift</span><span style="color:#cbd5e1;">Turbo (Acelerar)</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">Clic Der + Arrastrar</span><span style="color:#cbd5e1;">Girar cámara 360°</span>
                    </div>
                </div>

                <!-- 2. MANIPULACIÓN 3D DIRECTA (DESTACADO SI HAY OBJETO SELECCIONADO) -->
                <div style="background:${isObjSelected ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)'};border:${isObjSelected ? '1px solid rgba(212,175,55,0.55)' : '1px solid transparent'};border-radius:6px;padding:5px 8px;transition:all 0.2s;">
                    <div style="color:#ffd54f;font-weight:700;font-size:0.68rem;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;">
                        <span>🖱️ MANIPULACIÓN DIRECTA</span>
                        ${isObjSelected ? `<span style="color:#34d399;font-size:0.64rem;font-weight:800;overflow:hidden;text-overflow:ellipsis;max-width:130px;white-space:nowrap;">● ${escapeHtml(objName)}</span>` : ''}
                    </div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 8px;align-items:center;">
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">Clic Izquierdo</span><span style="color:#cbd5e1;">Seleccionar / Colocar</span>
                        <span style="background:rgba(2,132,199,0.3);border:1px solid #38bdf8;border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;color:#38bdf8;font-weight:700;">Arrastrar Clic</span><span style="color:#38bdf8;font-weight:700;">Mover en suelo (con Imán)</span>
                        <span style="background:rgba(2,132,199,0.3);border:1px solid #38bdf8;border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;color:#38bdf8;font-weight:700;">Tecla G / M</span><span style="color:#e0f2fe;">Agarrar (G) / Imán bordes (M)</span>
                        <span style="background:rgba(15,118,110,0.4);border:1px solid #2dd4bf;border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;color:#5eead4;font-weight:700;">Ctrl + Shift + D</span><span style="color:#5eead4;font-weight:700;">Clonar pegado borde-a-borde</span>
                        <span style="background:rgba(124,58,237,0.3);border:1px solid #a78bfa;border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;color:#c4b5fd;font-weight:700;">Ctrl + D</span><span style="color:#c4b5fd;font-weight:700;">Duplicar desplazado</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">Alt + Flechas</span><span style="color:#cbd5e1;">Micro-ajuste 5cm (Shift: 25cm)</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">R / T</span><span style="color:#cbd5e1;">Rotar ±15° (Shift: ±5°)</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">+ / - / 🔗🔓</span><span style="color:#cbd5e1;">Escala uniforme o por eje X/Y/Z</span>
                        <span style="background:rgba(185,28,28,0.25);border:1px solid #ef4444;border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;color:#fca5a5;">Supr / Backspace</span><span style="color:#fca5a5;">Eliminar elemento</span>
                    </div>
                </div>

                <!-- 3. FÍSICA Y ENTORNO -->
                <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:5px 8px;">
                    <div style="color:#c084fc;font-weight:700;font-size:0.68rem;margin-bottom:4px;">🧱 FÍSICA Y ENTORNO</div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 8px;align-items:center;">
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">🧱 / 👻</span><span style="color:#cbd5e1;">Alternar colisión física</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">Ctrl + Z</span><span style="color:#cbd5e1;">Deshacer colocación</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">H</span><span style="color:#cbd5e1;">Ocultar/mostrar barra</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">F1</span><span style="color:#cbd5e1;">Minimizar esta guía</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">Esc</span><span style="color:#cbd5e1;">Cancelar acción / Salir</span>
                    </div>
                </div>
            </div>
        `;
    }

    const dragHandle = controlsGuidePanel.querySelector('#godGuideDragHandle');
    setupDraggableWindow(controlsGuidePanel, dragHandle, 'guide', getDefaultGuideWindowPos, 'Guía de Controles');

    const resetBtn = controlsGuidePanel.querySelector('#godGuideResetPosBtn');
    if (resetBtn) {
        resetBtn.onclick = (e) => {
            e.stopPropagation();
            resetWindowPosition(controlsGuidePanel, 'guide', getDefaultGuideWindowPos, 'Guía de Controles');
        };
    }

    const minBtn = controlsGuidePanel.querySelector('#godGuideToggleMinBtn');
    if (minBtn) {
        minBtn.onclick = () => {
            isGuideCollapsed = !isGuideCollapsed;
            renderControlsGuideContent();
            clampWindowToViewport(controlsGuidePanel, 'guide', false);
        };
    }
}

/**
 * VENTANA FLOTANTE INDEPENDIENTE: LOCALIZADOR UNIVERSAL DE MODELOS Y PERSONAJES
 */
function destroyLocatorWindow() {
    if (locatorWindowPanel && locatorWindowPanel.parentNode) {
        locatorWindowPanel.parentNode.removeChild(locatorWindowPanel);
    }
    locatorWindowPanel = null;
}

function createOrUpdateLocatorWindow() {
    if (!isGodModeActive || !isLocatorOpen) {
        destroyLocatorWindow();
        return;
    }
    if (!locatorWindowPanel) {
        locatorWindowPanel = document.createElement('div');
        locatorWindowPanel.id = 'godLocatorFloatingPanel';
        locatorWindowPanel.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            width: 470px;
            max-width: 92vw;
            max-height: 70vh;
            background: rgba(10, 16, 24, 0.95);
            backdrop-filter: blur(10px);
            border: 1.5px solid #38bdf8;
            border-radius: 12px;
            box-shadow: 0 16px 42px rgba(0, 0, 0, 0.85);
            padding: 10px 12px;
            z-index: 999993;
            color: #fff8e7;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            gap: 8px;
            user-select: none;
        `;
        document.body.appendChild(locatorWindowPanel);
        renderLocatorWindowContent();
        applyWindowPosition(locatorWindowPanel, 'locator', getDefaultLocatorWindowPos);
        bringWindowToFront(locatorWindowPanel);
    } else {
        renderLocatorWindowContent();
        clampWindowToViewport(locatorWindowPanel, 'locator', false);
    }
}

function renderLocatorWindowContent() {
    if (!locatorWindowPanel) return;

    const locatableEntities = getAllLocatableEntities();
    const missingObjects = getMissingWorldObjects();

    locatorWindowPanel.innerHTML = `
        <div id="godLocatorDragHandle" style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(56,189,248,0.3);padding-bottom:6px;gap:8px;" title="Arrastra para mover libremente · Doble clic para restablecer posición">
            <span style="color:#38bdf8;font-weight:800;font-size:0.8rem;display:flex;align-items:center;gap:6px;">
                <span class="godWinGrip" aria-hidden="true">⋮⋮</span>
                🧭 LOCALIZADOR UNIVERSAL (${locatableEntities.length})
            </span>
            <div style="display:flex;align-items:center;gap:4px;">
                <button id="godLocatorResetPosBtn" class="godWinIconBtn" title="Restablecer posición original">⟲</button>
                <button id="godLocatorCloseWinBtn" class="godWinIconBtn" style="color:#fecaca;border-color:rgba(248,113,113,0.45);" title="Cerrar ventana de Localizador">✕</button>
            </div>
        </div>
        <div style="color:#94a3b8;font-size:0.7rem;padding:0 2px;">
            Haz clic en 🎯 para enfocar cámara o en 📍 para traerlo frente a ti
        </div>
        <div class="godLocatorBody styledScrollbar" style="overflow-y:auto;max-height:calc(70vh - 82px);display:flex;flex-direction:column;gap:6px;padding-right:2px;">
            ${locatableEntities.map(ent => {
                const posX = ent.pos?.x !== undefined ? ent.pos.x : (ent.savedPos?.x || 0);
                const posZ = ent.pos?.z !== undefined ? ent.pos.z : (ent.savedPos?.z || 0);
                const isSelected = selectedWorldObject && (
                    (selectedWorldObject.type === ent.type && (selectedWorldObject.data?.name?.includes(ent.name) || selectedWorldObject.id === ent.id)) ||
                    selectedWorldObject.mesh === ent.mesh
                );

                return `
                    <div style="display:flex;align-items:center;justify-content:space-between;background:${isSelected ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)'};border:${isSelected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)'};padding:5px 8px;border-radius:6px;font-size:0.75rem;gap:6px;">
                        <div style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;min-width:0;" class="godLocatorSelectRow" data-ent-id="${ent.id}">
                            <span style="font-size:1.05rem;">${ent.icon}</span>
                            <div style="display:flex;flex-direction:column;min-width:0;">
                                <strong style="color:${isSelected ? '#38bdf8' : '#fff'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(ent.name)}</strong>
                                <span style="color:#94a3b8;font-size:0.68rem;font-family:monospace;">
                                    Pos: (X: ${posX.toFixed(1)}, Z: ${posZ.toFixed(1)})
                                    ${ent.savedPos ? `&bull; Guardado: (${ent.savedPos.x.toFixed(1)}, ${ent.savedPos.z.toFixed(1)})` : ''}
                                </span>
                            </div>
                        </div>
                        <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
                            <button class="godLocatorFocusBtn" data-ent-id="${ent.id}" style="background:#0284c7;border:1px solid #38bdf8;color:#fff;border-radius:4px;padding:3px 7px;cursor:pointer;font-size:0.7rem;font-weight:700;" title="Volar la cámara hacia este modelo">
                                🎯 Enfocar
                            </button>
                            <button class="godLocatorTeleportBtn" data-ent-id="${ent.id}" style="background:#059669;border:1px solid #34d399;color:#fff;border-radius:4px;padding:3px 7px;cursor:pointer;font-size:0.7rem;font-weight:700;" title="Traer este modelo y situarlo en el suelo frente a la cámara">
                                📍 Traer
                            </button>
                            ${ent.savedPos ? `
                                <button class="godLocatorResetBtn" data-ent-id="${ent.id}" style="background:#b45309;border:1px solid #f59e0b;color:#fff;border-radius:4px;padding:3px 7px;cursor:pointer;font-size:0.7rem;font-weight:700;" title="Restablecer este modelo a su posición guardada original">
                                    🔄
                                </button>
                            ` : ''}
                            ${ent.type === 'custom' ? `
                                <button class="godLocatorDeleteBtn" data-ent-id="${ent.id}" style="background:#b91c1c;border:1px solid #ef4444;color:#fff;border-radius:4px;padding:3px 7px;cursor:pointer;font-size:0.7rem;font-weight:700;" title="Eliminar este objeto del escenario">
                                    🗑️
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
            ${missingObjects.length > 0 ? `
                <div style="margin-top:4px;display:flex;align-items:center;justify-content:space-between;background:rgba(185,28,28,0.18);border:1px solid rgba(248,113,113,0.5);border-radius:6px;padding:5px 8px;font-size:0.72rem;color:#fecaca;gap:6px;">
                    <span>⚠️ ${missingObjects.length} modelo(s) .GLB sin archivo binario</span>
                    <button class="godPurgeMissingWorldBtn" style="background:#991b1b;border:1px solid #f87171;color:#fff;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:0.7rem;font-weight:700;white-space:nowrap;">🧹 Limpiar</button>
                </div>
            ` : ''}
        </div>
    `;

    const dragHandle = locatorWindowPanel.querySelector('#godLocatorDragHandle');
    setupDraggableWindow(locatorWindowPanel, dragHandle, 'locator', getDefaultLocatorWindowPos, 'Localizador');

    const resetBtn = locatorWindowPanel.querySelector('#godLocatorResetPosBtn');
    if (resetBtn) {
        resetBtn.onclick = (e) => {
            e.stopPropagation();
            resetWindowPosition(locatorWindowPanel, 'locator', getDefaultLocatorWindowPos, 'Localizador');
        };
    }

    const closeBtn = locatorWindowPanel.querySelector('#godLocatorCloseWinBtn');
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            isLocatorOpen = false;
            destroyLocatorWindow();
            renderHUDContent();
        };
    }

    const bodyEl = locatorWindowPanel.querySelector('.godLocatorBody');
    if (bodyEl) {
        bodyEl.onclick = (e) => {
            const currentEntities = getAllLocatableEntities();
            const entitiesMap = new Map();
            currentEntities.forEach(ent => entitiesMap.set(ent.id, ent));

            const focusBtn = e.target.closest('.godLocatorFocusBtn');
            if (focusBtn) {
                e.stopPropagation();
                const entId = focusBtn.getAttribute('data-ent-id');
                const target = entitiesMap.get(entId);
                if (target) focusCameraOnTarget(target);
                else showDevToast(`⚠️ No se encontró la entidad "${entId}" en el mapa.`);
                return;
            }

            const teleBtn = e.target.closest('.godLocatorTeleportBtn');
            if (teleBtn) {
                e.stopPropagation();
                const entId = teleBtn.getAttribute('data-ent-id');
                const target = entitiesMap.get(entId);
                if (target) teleportEntityToFrontOfCamera(target);
                else showDevToast(`⚠️ No se encontró la entidad "${entId}".`);
                return;
            }

            const resetEntBtn = e.target.closest('.godLocatorResetBtn');
            if (resetEntBtn) {
                e.stopPropagation();
                const entId = resetEntBtn.getAttribute('data-ent-id');
                const target = entitiesMap.get(entId);
                if (target) resetEntityToSavedPosition(target);
                else showDevToast(`⚠️ No se encontró la entidad "${entId}".`);
                return;
            }

            const delBtn = e.target.closest('.godLocatorDeleteBtn');
            if (delBtn) {
                e.stopPropagation();
                const entId = delBtn.getAttribute('data-ent-id');
                if (entId) {
                    removePlacedObjectFromWorld(entId, false);
                    if (selectedWorldObject?.id === entId) clearSelectionHelper();
                    hasUnsavedChanges = true;
                    pendingChangesCount++;
                    showDevToast('🗑️ Objeto eliminado (se fijará al pulsar Guardar y Hornear)');
                    renderHUDContent();
                }
                return;
            }

            if (e.target.closest('.godPurgeMissingWorldBtn')) {
                e.stopPropagation();
                clearMissingWorldObjects();
                showDevToast('🧹 Referencias .GLB faltantes eliminadas de la persistencia');
                renderHUDContent();
                return;
            }

            const row = e.target.closest('.godLocatorSelectRow');
            if (row) {
                const entId = row.getAttribute('data-ent-id');
                const target = entitiesMap.get(entId);
                if (target) {
                    selectEntityFromLocator(target);
                    showDevToast(`📌 Seleccionado: ${target.icon || '📍'} ${target.name}`);
                }
            }
        };
    }
}

/**
 * VENTANA FLOTANTE INDEPENDIENTE: OBJETOS EN ESCENA
 */
function destroyObjectsWindow() {
    if (objectsWindowPanel && objectsWindowPanel.parentNode) {
        objectsWindowPanel.parentNode.removeChild(objectsWindowPanel);
    }
    objectsWindowPanel = null;
}

function createOrUpdateObjectsWindow() {
    if (!isGodModeActive || !showObjectsListDrawer) {
        destroyObjectsWindow();
        return;
    }
    if (!objectsWindowPanel) {
        objectsWindowPanel = document.createElement('div');
        objectsWindowPanel.id = 'godObjectsFloatingPanel';
        objectsWindowPanel.style.cssText = `
            position: fixed;
            top: 84px;
            right: 16px;
            width: 440px;
            max-width: 92vw;
            max-height: 65vh;
            background: rgba(12, 18, 14, 0.95);
            backdrop-filter: blur(10px);
            border: 1.5px solid rgba(212, 175, 55, 0.55);
            border-radius: 12px;
            box-shadow: 0 16px 42px rgba(0, 0, 0, 0.85);
            padding: 10px 12px;
            z-index: 999994;
            color: #fff8e7;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            gap: 8px;
            user-select: none;
        `;
        document.body.appendChild(objectsWindowPanel);
        renderObjectsWindowContent();
        applyWindowPosition(objectsWindowPanel, 'objects', getDefaultObjectsWindowPos);
        bringWindowToFront(objectsWindowPanel);
    } else {
        renderObjectsWindowContent();
        clampWindowToViewport(objectsWindowPanel, 'objects', false);
    }
}

function renderObjectsWindowContent() {
    if (!objectsWindowPanel) return;

    const activeMeshes = getActiveWorldMeshes();
    const missingObjects = getMissingWorldObjects();

    objectsWindowPanel.innerHTML = `
        <div id="godObjectsDragHandle" style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(212,175,55,0.3);padding-bottom:6px;gap:8px;" title="Arrastra para mover libremente · Doble clic para restablecer posición">
            <span style="color:#ffd54f;font-weight:800;font-size:0.8rem;display:flex;align-items:center;gap:6px;">
                <span class="godWinGrip" aria-hidden="true">⋮⋮</span>
                🗺️ OBJETOS EN ESCENA (${activeMeshes.length})
            </span>
            <div style="display:flex;align-items:center;gap:4px;">
                <button id="godObjectsResetPosBtn" class="godWinIconBtn" title="Restablecer posición original">⟲</button>
                <button id="godObjectsCloseWinBtn" class="godWinIconBtn" style="color:#fecaca;border-color:rgba(248,113,113,0.45);" title="Cerrar ventana En Escena">✕</button>
            </div>
        </div>
        <div style="color:#94a3b8;font-size:0.7rem;padding:0 2px;">
            Haz clic para seleccionar un objeto o en 📑 para duplicar
        </div>
        <div class="godObjectsBody styledScrollbar" style="overflow-y:auto;max-height:calc(65vh - 80px);display:flex;flex-direction:column;gap:5px;padding-right:2px;">
            ${missingObjects.length > 0 ? `
                <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(185,28,28,0.2);border:1px solid rgba(248,113,113,0.45);border-radius:5px;padding:4px 8px;font-size:0.7rem;color:#fecaca;gap:6px;">
                    <span>⚠️ Omitidos ${missingObjects.length} modelo(s) sin .GLB (${missingObjects.map(m => escapeHtml(m.name)).join(', ')})</span>
                    <button class="godPurgeMissingWorldBtn" style="background:#991b1b;border:1px solid #f87171;color:#fff;border-radius:4px;padding:2px 7px;cursor:pointer;font-size:0.68rem;font-weight:700;white-space:nowrap;">🧹 Limpiar</button>
                </div>
            ` : ''}
            ${activeMeshes.length === 0 ? '<div style="font-size:0.74rem;color:#94a3b8;padding:6px 4px;">No hay ningún objeto colocado en el mapa aún.</div>' : ''}
            ${activeMeshes.map(m => {
                const isSel = selectedWorldObject?.id === m.id;
                return `
                    <div style="display:flex;align-items:center;justify-content:space-between;background:${isSel ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.06)'};border:${isSel ? '1px solid rgba(212,175,55,0.65)' : '1px solid transparent'};padding:5px 8px;border-radius:5px;font-size:0.74rem;gap:6px;">
                        <span class="godDrawerSelectObj" data-id="${m.id}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;flex:1;" title="Haz clic para seleccionar este objeto">
                            ${m.data?.icon || '📦'} <strong style="color:${isSel ? '#ffd54f' : '#fff'};">${escapeHtml(m.data?.name || 'Objeto')}</strong>
                            <span style="color:#94a3b8;font-size:0.68rem;margin-left:6px;">(X: ${m.data?.position?.x?.toFixed(1) || 0}, Z: ${m.data?.position?.z?.toFixed(1) || 0})</span>
                            ${m.data?.logicType && m.data.logicType !== 'default' ? `<span style="background:#0f766e;color:#5eead4;padding:1px 5px;border-radius:3px;font-size:0.64rem;margin-left:5px;font-weight:700;">${escapeHtml(m.data.logicType)}</span>` : ''}
                        </span>
                        <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
                            <button class="godDrawerDuplicateBtn" data-id="${m.id}" style="background:#7c3aed;border:none;color:#fff;border-radius:3px;padding:3px 7px;cursor:pointer;font-size:0.7rem;font-weight:700;" title="Duplicar este objeto en el escenario">
                                📑 Duplicar
                            </button>
                            <button class="godDrawerDeleteBtn" data-id="${m.id}" style="background:#b91c1c;border:none;color:#fff;border-radius:3px;padding:3px 8px;cursor:pointer;font-size:0.7rem;font-weight:700;" title="Eliminar este objeto del mapa">
                                🗑️
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    const dragHandle = objectsWindowPanel.querySelector('#godObjectsDragHandle');
    setupDraggableWindow(objectsWindowPanel, dragHandle, 'objects', getDefaultObjectsWindowPos, 'En Escena');

    const resetBtn = objectsWindowPanel.querySelector('#godObjectsResetPosBtn');
    if (resetBtn) {
        resetBtn.onclick = (e) => {
            e.stopPropagation();
            resetWindowPosition(objectsWindowPanel, 'objects', getDefaultObjectsWindowPos, 'En Escena');
        };
    }

    const closeBtn = objectsWindowPanel.querySelector('#godObjectsCloseWinBtn');
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            showObjectsListDrawer = false;
            destroyObjectsWindow();
            renderHUDContent();
        };
    }

    objectsWindowPanel.querySelectorAll('.godDrawerDuplicateBtn').forEach(b => {
        b.onclick = async (e) => {
            e.stopPropagation();
            const objId = b.getAttribute('data-id');
            const cloned = await duplicateWorldObject(objId, null, false);
            if (cloned && cloned.mesh) {
                hasUnsavedChanges = true;
                pendingChangesCount++;
                selectWorldObject(cloned);
                showDevToast(`📑 ¡"${cloned.data?.name || 'Objeto'}" duplicado! Se ha seleccionado la copia para que puedas moverla`);
                renderHUDContent();
            }
        };
    });

    objectsWindowPanel.querySelectorAll('.godDrawerSelectObj').forEach(el => {
        el.onclick = (e) => {
            e.stopPropagation();
            const objId = el.getAttribute('data-id');
            const meshes = getActiveWorldMeshes();
            const target = meshes.find(m => m.id === objId);
            if (target) {
                selectWorldObject(target);
            }
        };
    });

    objectsWindowPanel.querySelectorAll('.godDrawerDeleteBtn').forEach(b => {
        b.onclick = (e) => {
            e.stopPropagation();
            const objId = b.getAttribute('data-id');
            removePlacedObjectFromWorld(objId, false);
            if (selectedWorldObject?.id === objId) clearSelectionHelper();
            hasUnsavedChanges = true;
            pendingChangesCount++;
            showDevToast('🗑️ Objeto eliminado (se fijará al pulsar Guardar y Hornear)');
            renderHUDContent();
        };
    });

    objectsWindowPanel.querySelectorAll('.godPurgeMissingWorldBtn').forEach(b => {
        b.onclick = (e) => {
            e.stopPropagation();
            clearMissingWorldObjects();
            showDevToast('🧹 Referencias .GLB faltantes limpiadas de la persistencia');
            renderHUDContent();
        };
    });
}

function setupHUDEvents() {
    if (!hudContainer) return;

    // Salir de Modo Dios
    const exitBtn = hudContainer.querySelector('#godExitBtn');
    if (exitBtn) exitBtn.onclick = exitGodMode;

    // Configurar arrastre libre y botón de reseteo para el HUD principal
    const hudDragHandle = hudContainer.querySelector('#godHudDragHandle');
    setupDraggableWindow(hudContainer, hudDragHandle, 'hud', getDefaultHudWindowPos, 'HUD Modo Dios');

    const hudResetPosBtn = hudContainer.querySelector('#godHudResetPosBtn');
    if (hudResetPosBtn) {
        hudResetPosBtn.onclick = (e) => {
            e.stopPropagation();
            resetWindowPosition(hudContainer, 'hud', getDefaultHudWindowPos, 'HUD Modo Dios');
        };
    }

    // Colapsar / Expandir HUD en el sitio
    const collapseBtn = hudContainer.querySelector('#godCollapseBtn');
    if (collapseBtn) {
        collapseBtn.onclick = () => {
            hudContainer.classList.toggle('collapsed');
            const isCollapsed = hudContainer.classList.contains('collapsed');
            collapseBtn.innerHTML = isCollapsed ? '▴ Mostrar' : '▾ Ocultar';
            clampWindowToViewport(hudContainer, 'hud', false);
        };
    }

    // Deshacer (Ctrl+Z)
    const undoBtn = hudContainer.querySelector('#godUndoBtn');
    if (undoBtn) {
        undoBtn.onclick = () => {
            const undone = undoLastPlacedObject(false);
            if (undone) {
                if (selectedWorldObject?.id === undone.id) clearSelectionHelper(false);
                hasUnsavedChanges = true;
                pendingChangesCount++;
                showDevToast(`↶ Deshecho: "${undone.data?.name || 'Objeto'}"`);
                renderHUDContent();
            } else {
                showDevToast('No hay objetos para deshacer');
            }
        };
    }

    // Teletransportar Player aquí
    const telePlayerBtn = hudContainer.querySelector('#godTeleportPlayerBtn');
    if (telePlayerBtn) {
        telePlayerBtn.onclick = () => {
            if (!runtimeState.player) {
                showDevToast('⚠️ Player aún no inicializado');
                return;
            }
            const groundY = getHeightAt(flyCam.x, flyCam.z);
            runtimeState.player.position.set(flyCam.x, groundY, flyCam.z);
            showDevToast(`📍 Player situado en (${flyCam.x.toFixed(1)}, ${groundY.toFixed(1)}, ${flyCam.z.toFixed(1)})`);
        };
    }

    // Abrir Developer Suite
    const openDevBtn = hudContainer.querySelector('#godOpenDevPanelBtn');
    if (openDevBtn) {
        openDevBtn.onclick = () => {
            openDevPanel();
        };
    }

    // Alternar Ventana Flotante Catálogo de Modelos 3D
    const catalogBtn = hudContainer.querySelector('#godCatalogBtn');
    if (catalogBtn) {
        catalogBtn.onclick = () => {
            isCatalogOpen = !isCatalogOpen;
            if (isCatalogOpen) {
                createOrUpdateCatalogWindow();
            } else {
                destroyCatalogWindow();
            }
            renderHUDContent();
        };
    }

    const quickOpenCatalogBtn = hudContainer.querySelector('#godQuickOpenCatalogBtn');
    if (quickOpenCatalogBtn) {
        quickOpenCatalogBtn.onclick = () => {
            isCatalogOpen = true;
            createOrUpdateCatalogWindow();
            renderHUDContent();
        };
    }

    // Alternar Ventana Flotante Localizador de Modelos
    const locatorBtn = hudContainer.querySelector('#godLocatorBtn');
    if (locatorBtn) {
        locatorBtn.onclick = () => {
            isLocatorOpen = !isLocatorOpen;
            if (isLocatorOpen) {
                createOrUpdateLocatorWindow();
            } else {
                destroyLocatorWindow();
            }
            renderHUDContent();
        };
    }

    // Botón Unificado: Guardar y Hornear Escenario (Opción A)
    const unifiedSaveBtn = hudContainer.querySelector('#godUnifiedSaveBtn');
    if (unifiedSaveBtn) {
        unifiedSaveBtn.onclick = async () => {
            unifiedSaveBtn.disabled = true;
            unifiedSaveBtn.textContent = '⏳ Guardando y Horneando...';
            showDevToast('💾 Guardando cambios en LocalStorage y horneando en código fuente para Git...', 3000);

            try {
                // 1. Persistir cambios staged en memoria a LocalStorage y servidor
                commitStagedWorldLayout();
                commitStagedWorldObjects();
                stagedInstancedBackups = [];

                // 2. Hornear directamente en el código fuente (.js + .json) para GitHub
                const bakeRes = await bakeCurrentWorldToCode();

                hasUnsavedChanges = false;
                pendingChangesCount = 0;

                if (bakeRes.success) {
                    showDevToast('✅ ¡Escenario guardado en LocalStorage y horneado con éxito en código (.js + .json) para Git!', 5000);
                } else {
                    saveSceneVersion('Guardado local (sin hornear)');
                    saveLayoutVersion('Guardado local (sin hornear)');
                    showDevToast(`⚠️ Guardado en este navegador, pero NO horneado en código (.js): ${bakeRes.error || bakeRes.message}`, 5500);
                }
            } catch (err) {
                console.error('[GodMode] Error guardando escenario:', err);
                showDevToast(`⚠️ Error al guardar: ${err.message}`, 4000);
            } finally {
                unifiedSaveBtn.disabled = false;
                renderHUDContent();
            }
        };
    }

    // Descartar Cambios y Restaurar al Último Guardado
    const revertBtn = hudContainer.querySelector('#godRevertBtn');
    if (revertBtn) {
        revertBtn.onclick = () => {
            showDevModalDialog({
                title: '↩️ Descartar Cambios del Escenario',
                message: '¿Estás seguro de descartar todos los cambios no guardados y restaurar los modelos (incluyendo Alto, Panda, Telerín y objetos) a la última posición guardada?',
                confirmText: '↩️ Sí, Descartar Cambios',
                cancelText: 'Cancelar',
                isDanger: true,
                onConfirm: async () => {
                    // 1. Restaurar objetos del mundo colocados
                    await revertToLastSavedState();

                    // 2. Recargar layout de entidades de fábrica / confirmado
                    const confirmedLayout = reloadWorldLayoutFromStorage();
                    restoreStagedInstancedBackups();

                    // 3. Re-sincronizar mallas en vivo con las coordenadas confirmadas
                    if (runtimeState.player && confirmedLayout.playerSpawn) {
                        const ps = confirmedLayout.playerSpawn;
                        const baseScale = runtimeState.player.userData?.baseScale || 1.4;
                        if (ps.scaleXYZ && typeof ps.scaleXYZ === 'object') {
                            runtimeState.player.scale.set(
                                baseScale * (Number(ps.scaleXYZ.x) || 1),
                                baseScale * (Number(ps.scaleXYZ.y) || 1),
                                baseScale * (Number(ps.scaleXYZ.z) || 1)
                            );
                        } else {
                            const psScalar = typeof ps.scale === 'number' && ps.scale > 0 ? ps.scale : 1.0;
                            runtimeState.player.scale.setScalar(baseScale * psScalar);
                        }
                        const pOff = typeof ps.relativeGroundOffset === 'number'
                            ? ps.relativeGroundOffset
                            : computeGroundOffset(runtimeState.player);
                        runtimeState.playerHeightOffset = pOff;
                        runtimeState.player.userData.relativeGroundOffset = pOff;
                        const groundY = getHeightAt(ps.x, ps.z);
                        runtimeState.player.position.set(ps.x, groundY + pOff, ps.z);
                        if (typeof ps.rotationY === 'number') {
                            runtimeState.player.rotation.y = ps.rotationY;
                        }
                    }

                    const npcsMap = confirmedLayout.npcs || {};
                    const restoreNpcEntity = (mesh, cfg) => {
                        if (!mesh || !cfg) return;
                        const rawFactor = mesh.userData?.rawHeightFactor || 1;
                        if (cfg.scaleXYZ && typeof cfg.scaleXYZ === 'object') {
                            const fallbackS = typeof cfg.scale === 'number' && cfg.scale > 0 ? cfg.scale : 1.8;
                            mesh.scale.set(
                                (Number(cfg.scaleXYZ.x) || fallbackS) * rawFactor,
                                (Number(cfg.scaleXYZ.y) || fallbackS) * rawFactor,
                                (Number(cfg.scaleXYZ.z) || fallbackS) * rawFactor
                            );
                        } else if (typeof cfg.scale === 'number' && cfg.scale > 0) {
                            mesh.scale.setScalar(cfg.scale * rawFactor);
                        }
                        if (typeof cfg.rotationY === 'number') mesh.rotation.y = cfg.rotationY;
                        const npcOff = typeof cfg.relativeGroundOffset === 'number'
                            ? cfg.relativeGroundOffset
                            : computeGroundOffset(mesh);
                        mesh.userData.relativeGroundOffset = npcOff;
                        const groundY = getHeightAt(cfg.x, cfg.z);
                        mesh.position.set(cfg.x, groundY + npcOff, cfg.z);
                        mesh.userData.hiddenByLayout = Boolean(cfg.hidden);
                        mesh.visible = !mesh.userData.hiddenByLayout;
                        if (mesh.userData.hiddenByLayout) {
                            removeCollidable(mesh);
                        } else {
                            addCollidable(mesh);
                        }
                    };

                    restoreNpcEntity(getAltoNPC(), npcsMap.Alto);
                    restoreNpcEntity(getPandaNPC(), npcsMap.Panda);
                    restoreNpcEntity(getTelerinNPC(), npcsMap['Telerín'] || npcsMap['Telerin']);
                    restoreNpcEntity(getTeleronNPC(), npcsMap['Telerón'] || npcsMap['Teleron']);

                    const muebleMesh = getMuebleObject();
                    if (muebleMesh && confirmedLayout.furniture?.mueble) {
                        const m = confirmedLayout.furniture.mueble;
                        if (typeof m.rotationY === 'number') muebleMesh.rotation.y = m.rotationY;
                        applyMuebleLogicalScale(m.scaleXYZ || m.scale || 1.0);
                        const groundOffset = typeof m.relativeGroundOffset === 'number'
                            ? m.relativeGroundOffset
                            : computeGroundOffset(muebleMesh);
                        muebleMesh.userData.relativeGroundOffset = groundOffset;
                        const groundY = getHeightAt(m.x, m.z);
                        muebleMesh.position.set(m.x, groundY + groundOffset, m.z);
                        muebleMesh.userData.hiddenByLayout = Boolean(m.hidden);
                        muebleMesh.visible = !muebleMesh.userData.hiddenByLayout;
                        if (muebleMesh.userData.hiddenByLayout) {
                            removeCollidable(muebleMesh);
                        } else {
                            addCollidable(muebleMesh);
                        }
                        syncMuebleDrawerTransform({ syncState: true });
                    }

                    rebuildSpatialGrid(collidables);

                    hasUnsavedChanges = false;
                    pendingChangesCount = 0;
                    clearSelectionHelper();
                    showDevToast('↩️ Cambios no guardados descartados. Escenario restaurado a la versión confirmada.');
                    renderHUDContent();
                }
            });
        };
    }

    // Deseleccionar / Puntero libre
    const clearItemBtn = hudContainer.querySelector('#godClearItemBtn');
    if (clearItemBtn) {
        clearItemBtn.onclick = () => {
            selectedCatalogItem = null;
            destroyGhostMesh();
            renderHUDContent();
            showDevToast('🟢 Puntero libre (sin objeto seleccionado)');
        };
    }

    // Deseleccionar elemento
    const deselectBtn = hudContainer.querySelector('#godDeselectBtn');
    if (deselectBtn) {
        deselectBtn.onclick = () => {
            clearSelectionHelper();
        };
    }

    // Mover elemento seleccionado al punto del cursor en el suelo
    const moveSelectedBtn = hudContainer.querySelector('#godMoveSelectedToCursorBtn');
    if (moveSelectedBtn) {
        moveSelectedBtn.onclick = () => {
            executeMoveSelectedToCursor();
        };
    }

    // Agarrar / Fijar objeto con ratón (Modo Tecla G)
    const grabSelectedBtn = hudContainer.querySelector('#godGrabSelectedBtn');
    if (grabSelectedBtn && selectedWorldObject) {
        grabSelectedBtn.onclick = () => {
            isGrabModeActive = !isGrabModeActive;
            if (isGrabModeActive) {
                dragInitialPos = getSelectedObjectPosition();
                showDevToast(`✋ Modo Agarrar activo: Mueve el ratón para desplazar "${selectedWorldObject.data?.name || 'Objeto'}". Clic Izq para fijar, Esc para cancelar.`);
            } else {
                if (hasValidGroundHit) {
                    commitSelectedObjectMove(currentGroundHit);
                    showDevToast(`📍 "${selectedWorldObject.data?.name || 'Objeto'}" fijado en el terreno`);
                }
            }
            renderHUDContent();
            renderControlsGuideContent();
        };
    }

    // Guía de Controles (F1)
    const guideBtn = hudContainer.querySelector('#godGuideBtn');
    if (guideBtn) {
        guideBtn.onclick = () => {
            isGuideCollapsed = !isGuideCollapsed;
            renderControlsGuideContent();
        };
    }

    // Alternar Colisión Sólido / Traspasable (Opción B)
    const toggleSolidBtn = hudContainer.querySelector('#godToggleSolidBtn');
    if (toggleSolidBtn && selectedWorldObject && selectedWorldObject.type === 'custom') {
        toggleSolidBtn.onclick = () => {
            const res = toggleObjectSolidState(selectedWorldObject.id, false);
            if (res) {
                if (selectedWorldObject.data) {
                    selectedWorldObject.data.isSolid = res.isSolid;
                }
                hasUnsavedChanges = true;
                pendingChangesCount++;
                showDevToast(res.isSolid ? '🧱 Objeto configurado como SÓLIDO (con colisión física)' : '👻 Objeto configurado como TRASPASABLE (sin colisión)');
                renderHUDContent();
            }
        };
    }

    // Duplicar elemento seleccionado (Ctrl+D)
    const duplicateBtn = hudContainer.querySelector('#godDuplicateSelectedBtn');
    if (duplicateBtn) {
        duplicateBtn.onclick = () => {
            executeDuplicateSelectedObject();
        };
    }

    // Duplicar pegado al lado (Acople contiguo borde-a-borde)
    const adjacentAutoBtn = hudContainer.querySelector('#godAdjacentAutoBtn');
    if (adjacentAutoBtn) {
        adjacentAutoBtn.onclick = () => {
            executeAdjacentDuplicateSelectedObject('auto');
        };
    }
    hudContainer.querySelectorAll('.godAdjacentDirBtn').forEach(btn => {
        btn.onclick = () => {
            const dir = btn.getAttribute('data-dir') || 'auto';
            executeAdjacentDuplicateSelectedObject(dir);
        };
    });

    // Micro-ajuste posicional desde botones HUD (5 cm)
    hudContainer.querySelectorAll('.godNudgeBtn').forEach(btn => {
        btn.onclick = (e) => {
            const dir = btn.getAttribute('data-nudge');
            const step = e.shiftKey ? 0.25 : 0.05;
            nudgeSelectedObject(dir, step);
        };
    });

    // Configurar Comportamiento Lógico / Eventos
    const logicBtn = hudContainer.querySelector('#godLogicSelectedBtn');
    if (logicBtn && selectedWorldObject && selectedWorldObject.type === 'custom') {
        logicBtn.onclick = () => {
            openObjectLogicModal(selectedWorldObject);
        };
    }

    // Eliminar / Ocultar objeto seleccionado (Universal)
    const deleteSelectedBtn = hudContainer.querySelector('#godDeleteSelectedBtn');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.onclick = () => {
            executeDeleteSelectedObject();
        };
    }

    // Toggle ventana flotante de objetos en escena
    const toggleObjectsListBtn = hudContainer.querySelector('#godToggleObjectsListBtn');
    if (toggleObjectsListBtn) {
        toggleObjectsListBtn.onclick = () => {
            showObjectsListDrawer = !showObjectsListDrawer;
            if (showObjectsListDrawer) {
                createOrUpdateObjectsWindow();
            } else {
                destroyObjectsWindow();
            }
            renderHUDContent();
        };
    }

    // Velocidad de vuelo
    const speedBtn = hudContainer.querySelector('#godSpeedBtn');
    if (speedBtn) {
        speedBtn.onclick = () => {
            if (flyCam.speedFactor === 1.0) flyCam.speedFactor = 2.0;
            else if (flyCam.speedFactor === 2.0) flyCam.speedFactor = 4.0;
            else flyCam.speedFactor = 1.0;
            speedBtn.innerHTML = `🚀 ${flyCam.speedFactor}x`;
            showDevToast(`Velocidad de vuelo: ${flyCam.speedFactor}x`);
        };
    }

    // Selector de herramienta (Colocar / Selector Universal)
    hudContainer.querySelectorAll('.godToolBtn[data-tool]').forEach(btn => {
        btn.onclick = () => {
            hudContainer.querySelectorAll('.godToolBtn[data-tool]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTool = btn.getAttribute('data-tool');
            if (currentTool !== 'select') clearSelectionHelper();
        };
    });

    // Botón Toggle Imán de Bordes (M)
    const edgeSnapBtn = hudContainer.querySelector('#godEdgeSnapToggleBtn');
    if (edgeSnapBtn) {
        edgeSnapBtn.onclick = () => {
            isEdgeSnapEnabled = !isEdgeSnapEnabled;
            lastSnapResult = null;
            showDevToast(isEdgeSnapEnabled
                ? '🧲 Imán de bordes ACTIVADO: pega caras y alinea a 90° automáticamente'
                : '🧲 Imán de bordes DESACTIVADO: colocación 100% libre');
            renderHUDContent();
        };
    }

    // Rotación Precisa (Botones ±15° y campo numérico)
    const rotPrev = hudContainer.querySelector('#godRotPrevBtn');
    const rotNext = hudContainer.querySelector('#godRotNextBtn');
    const rotInput = hudContainer.querySelector('#godRotInput');
    if (rotPrev && rotNext) {
        rotPrev.onclick = () => {
            // Giros precisos de 15° (o 5° si se mantiene shift)
            applyRotationToSelected(currentRotationY - THREE.MathUtils.degToRad(15));
        };
        rotNext.onclick = () => {
            applyRotationToSelected(currentRotationY + THREE.MathUtils.degToRad(15));
        };
    }
    if (rotInput) {
        const commitRotInput = () => {
            const deg = parseFloat(rotInput.value);
            if (!isNaN(deg)) {
                applyRotationToSelected(THREE.MathUtils.degToRad(deg));
            }
        };
        rotInput.onchange = commitRotInput;
        rotInput.onkeydown = (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                commitRotInput();
                rotInput.blur();
            }
        };
    }

    // Escala Libre + Bloqueo / Desbloqueo independiente por eje X, Y, Z
    const scaleLockBtn = hudContainer.querySelector('#godScaleLockBtn');
    if (scaleLockBtn) {
        scaleLockBtn.onclick = () => {
            isScaleUnlocked = !isScaleUnlocked;
            showDevToast(isScaleUnlocked
                ? '🔓 Escala por ejes DESBLOQUEADA: ahora puedes estirar X (ancho), Y (alto) o Z (fondo) por separado'
                : '🔗 Proporción de ejes BLOQUEADA: se mantendrá la proporción actual al escalar');
            renderHUDContent();
        };
    }

    const scaleDown = hudContainer.querySelector('#godScaleDownBtn');
    const scaleUp = hudContainer.querySelector('#godScaleUpBtn');
    const scaleInput = hudContainer.querySelector('#godScaleInput');
    if (scaleDown && scaleUp) {
        scaleDown.onclick = () => {
            const step = currentScale > 5.0 ? 1.0 : (currentScale > 1.0 ? 0.2 : 0.1);
            applyScaleToSelected(Math.max(0.05, currentScale - step));
        };
        scaleUp.onclick = () => {
            const step = currentScale >= 5.0 ? 1.0 : (currentScale >= 1.0 ? 0.2 : 0.1);
            applyScaleToSelected(Math.max(0.05, currentScale + step));
        };
    }
    if (scaleInput) {
        const commitScaleInput = () => {
            const sc = parseFloat(scaleInput.value);
            if (!isNaN(sc) && sc > 0) {
                applyScaleToSelected(sc);
            }
        };
        scaleInput.onchange = commitScaleInput;
        scaleInput.onkeydown = (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                commitScaleInput();
                scaleInput.blur();
            }
        };
    }

    // Inputs independientes X, Y, Z cuando está desbloqueado
    ['x', 'y', 'z'].forEach(axis => {
        const axInput = hudContainer.querySelector(`#godScale${axis.toUpperCase()}Input`);
        if (!axInput) return;
        const commitAxis = () => {
            const val = parseFloat(axInput.value);
            if (!isNaN(val) && val > 0) {
                applyAxisScaleToSelected(axis, val);
            }
        };
        axInput.onchange = commitAxis;
        axInput.onkeydown = (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                commitAxis();
                axInput.blur();
            }
        };
    });

    // Elevación Y (Enterrar / Elevar respecto al suelo)
    const elevDown = hudContainer.querySelector('#godElevDownBtn');
    const elevUp = hudContainer.querySelector('#godElevUpBtn');
    if (elevDown && elevUp) {
        elevDown.onclick = () => {
            applyElevationOffsetToSelected(-0.15);
        };
        elevUp.onclick = () => {
            applyElevationOffsetToSelected(+0.15);
        };
    }

    // Subida de .GLB desde el ordenador
    const glbFileInput = hudContainer.querySelector('#godGlbFileInput');
    const uploadGlbBtn = hudContainer.querySelector('#godUploadGlbBtn');
    if (uploadGlbBtn && glbFileInput) {
        uploadGlbBtn.onclick = () => glbFileInput.click();
        glbFileInput.onchange = async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            showDevToast(`⏳ Procesando y subiendo "${file.name}"...`);

            try {
                // 1. Guardar permanentemente en el servidor
                const serverRes = await uploadLocalModelToServer(file);
                const modelUrl = normalizeCustomModelUrl(serverRes.url);

                // 2. Registrar en catálogo local
                const newModelInfo = {
                    id: `uploaded_${Date.now()}`,
                    filename: file.name,
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    url: modelUrl,
                    uploadedAt: Date.now()
                };
                registerUploadedModel(newModelInfo);
                modelAvailabilityMap.set(newModelInfo.id, 'server');
                modelAvailabilityMap.set(modelUrl, 'server');

                // 3. Cambiar a pestaña de subidos y seleccionar
                activeCatalogTab = 'customGlb';
                isCatalogOpen = true;
                currentTool = 'place';
                await setSelectedItem({
                    source: 'glb',
                    sourceId: newModelInfo.id,
                    name: newModelInfo.name,
                    icon: '🎨',
                    url: modelUrl
                });
                renderHUDContent();

                showDevToast(`✅ ¡Modelo "${file.name}" cargado y listo para colocar en el mapa!`);
            } catch (err) {
                console.warn('[GodMode] Subida al servidor falló, usando URL Blob local directa:', err);
                // Fallback a Blob local si el servidor da error
                const blobUrl = URL.createObjectURL(file);
                const localModelInfo = {
                    id: `blob_${Date.now()}`,
                    filename: file.name,
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    url: blobUrl,
                    uploadedAt: Date.now()
                };
                registerUploadedModel(localModelInfo);
                modelAvailabilityMap.set(localModelInfo.id, 'cache');
                modelAvailabilityMap.set(blobUrl, 'cache');

                activeCatalogTab = 'customGlb';
                isCatalogOpen = true;
                currentTool = 'place';
                await setSelectedItem({
                    source: 'glb',
                    sourceId: localModelInfo.id,
                    name: localModelInfo.name,
                    icon: '🎨',
                    url: blobUrl
                });
                renderHUDContent();

                showDevToast(`✅ Modelo "${file.name}" cargado localmente con éxito`);
            } finally {
                e.target.value = '';
            }
        };
    }
}

function bindCatalogCardEvents() {
    if (!catalogWindowPanel) return;

    catalogWindowPanel.querySelectorAll('.godDeleteUploadedCardBtn').forEach(delBtn => {
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            const id = delBtn.getAttribute('data-id');
            if (!id) return;
            deleteUploadedModel(id);
            if (selectedCatalogItem?.sourceId === id) {
                await setSelectedItem(null);
            }
            showDevToast('🗑️ Modelo eliminado de la lista de Modelos PC');
            renderHUDContent();
        };
    });

    catalogWindowPanel.querySelectorAll('.godItemCard').forEach(btn => {
        btn.onclick = async () => {
            catalogWindowPanel.querySelectorAll('.godItemCard').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const source = btn.getAttribute('data-source');
            const id = btn.getAttribute('data-id');
            const url = btn.getAttribute('data-url');
            const name = btn.querySelector('.godItemLabel')?.textContent || 'Objeto';
            const icon = btn.querySelector('.godItemIcon')?.textContent || '📦';

            currentTool = 'place';
            clearSelectionHelper();

            if (source === 'custom') {
                const found = getCustomItemById(id);
                await setSelectedItem({
                    source: 'custom',
                    sourceId: id,
                    name: found ? found.name : name,
                    icon: found ? found.icon : icon,
                    code: found ? found.code : null
                });
            } else if (source === 'system') {
                if (id === 'tree_1') {
                    await setSelectedItem({ source: 'tree', sourceId: id, archetypeIndex: 0, name, icon });
                } else if (id === 'tree_2') {
                    await setSelectedItem({ source: 'tree', sourceId: id, archetypeIndex: 1, name, icon });
                } else if (id === 'tree_3') {
                    await setSelectedItem({ source: 'tree', sourceId: id, archetypeIndex: 2, name, icon });
                } else if (id === 'rock_dodec') {
                    await setSelectedItem({ source: 'rock', sourceId: id, geoType: 0, name, icon });
                } else if (id === 'rock_icosa') {
                    await setSelectedItem({ source: 'rock', sourceId: id, geoType: 1, name, icon });
                } else {
                    await setSelectedItem({ source: 'system', sourceId: id, name, icon });
                }
            } else if (source === 'glb') {
                const check = await checkGlbAvailability(url, name);
                modelAvailabilityMap.set(id, check.status);
                if (check.url) modelAvailabilityMap.set(check.url, check.status);

                if (check.status === 'missing') {
                    btn.classList.remove('active');
                    await setSelectedItem(null);
                    showDevToast(`⚠️ No se encuentra el archivo "${name}.glb" en el servidor ni en caché. Selecciónalo de tu PC para restaurarlo.`, 5000);
                    const fileInput = hudContainer?.querySelector('#godGlbFileInput');
                    if (fileInput) fileInput.click();
                    return;
                }
                await setSelectedItem({ source: 'glb', sourceId: id, name, icon, url: check.url || url });
            }

            if (!isCatalogPinned && selectedCatalogItem) {
                isCatalogOpen = false;
                destroyCatalogWindow();
                showDevToast(`🎨 "${selectedCatalogItem.name}" listo para colocar (pulsa 🎨 Catálogo para cambiar)`);
            }
            renderHUDContent();
        };
    });
}

function updateHUDActiveItemBadge() {
    if (!catalogWindowPanel) return;
    catalogWindowPanel.querySelectorAll('.godItemCard').forEach(btn => {
        const id = btn.getAttribute('data-id');
        btn.classList.toggle('active', Boolean(selectedCatalogItem && id === selectedCatalogItem.sourceId));
    });
}

async function onCustomItemsUpdatedInGodMode() {
    if (!isGodModeActive) return;

    if (selectedCatalogItem && selectedCatalogItem.source === 'custom' && selectedCatalogItem.sourceId) {
        const latest = getCustomItemById(selectedCatalogItem.sourceId);
        if (latest) {
            const changed = latest.code !== selectedCatalogItem.code || latest.name !== selectedCatalogItem.name || latest.icon !== selectedCatalogItem.icon;
            if (changed) {
                await setSelectedItem({
                    ...selectedCatalogItem,
                    name: latest.name,
                    icon: latest.icon,
                    code: latest.code
                });
            }
        }
    }

    renderHUDContent();
}

/**
 * Conecta los listeners del teclado y del ratón para el vuelo libre y colocación.
 */
function bindGodModeEvents() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onGodModeWindowResize);
    window.addEventListener('customItemsUpdated', onCustomItemsUpdatedInGodMode);
}

function unbindGodModeEvents() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('resize', onGodModeWindowResize);
    window.removeEventListener('customItemsUpdated', onCustomItemsUpdatedInGodMode);
}

function onKeyDown(e) {
    if (!isGodModeActive) return;

    // Ignorar si el usuario está escribiendo en cualquier campo de texto o elemento editable
    const targetTag = e.target?.tagName ? e.target.tagName.toUpperCase() : '';
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || Boolean(e.target?.isContentEditable)) return;

    // Atajo Ctrl+Shift+D: Clonar pegado borde-con-borde (Acople contiguo)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyD' || e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        e.stopPropagation();
        executeAdjacentDuplicateSelectedObject('auto');
        return;
    }

    // Atajo universal Ctrl+D / Cmd+D: Duplicar elemento seleccionado
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyD' || e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        e.stopPropagation();
        executeDuplicateSelectedObject();
        return;
    }

    // Micro-ajuste fino con Alt + Flechas (5 cm, o 25 cm con Shift)
    if (e.altKey && selectedWorldObject && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 0.25 : 0.05;
        const dirMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
        nudgeSelectedObject(dirMap[e.code], step);
        return;
    }

    switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
            flyKeys.forward = true;
            break;
        case 'ArrowDown':
        case 'KeyS':
            flyKeys.backward = true;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            flyKeys.left = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            flyKeys.right = true;
            break;
        case 'Space':
        case 'KeyE':
            flyKeys.up = true;
            e.preventDefault();
            break;
        case 'KeyQ':
            flyKeys.down = true;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            flyKeys.speedBoost = true;
            break;
        case 'KeyM':
            isEdgeSnapEnabled = !isEdgeSnapEnabled;
            lastSnapResult = null;
            showDevToast(isEdgeSnapEnabled
                ? '🧲 Imán de bordes ACTIVADO'
                : '🧲 Imán de bordes DESACTIVADO');
            renderHUDContent();
            break;
        case 'KeyR': {
            // Rotar a la derecha: 15° normal, 5° con Shift
            e.preventDefault();
            e.stopPropagation();
            const stepDeg = e.shiftKey ? 5 : 15;
            applyRotationToSelected(currentRotationY + THREE.MathUtils.degToRad(stepDeg));
            const curDeg = Math.round(((THREE.MathUtils.radToDeg(currentRotationY) % 360) + 360) % 360);
            showDevToast(`🔄 Rotación (+${stepDeg}°): ${curDeg}°`);
            break;
        }
        case 'KeyT': {
            // Rotar a la izquierda: 15° normal, 5° con Shift
            e.preventDefault();
            e.stopPropagation();
            const stepDeg = e.shiftKey ? 5 : 15;
            applyRotationToSelected(currentRotationY - THREE.MathUtils.degToRad(stepDeg));
            const curDeg = Math.round(((THREE.MathUtils.radToDeg(currentRotationY) % 360) + 360) % 360);
            showDevToast(`🔄 Rotación (-${stepDeg}°): ${curDeg}°`);
            break;
        }
        case 'KeyZ':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                const undone = undoLastPlacedObject(false);
                if (undone) {
                    if (selectedWorldObject?.id === undone.id) clearSelectionHelper(false);
                    hasUnsavedChanges = true;
                    pendingChangesCount++;
                    showDevToast(`↶ Deshecho: "${undone.data?.name || 'Objeto'}"`);
                    renderHUDContent();
                }
            }
            break;
        case 'Equal':
        case 'NumpadAdd': {
            // Escalar + (sin límite de 5.0x, con pasos acordes al tamaño)
            const step = currentScale >= 5.0 ? 1.0 : (currentScale >= 1.0 ? 0.2 : 0.1);
            applyScaleToSelected(currentScale + step);
            showDevToast(`🔍 Escala: ${currentScale.toFixed(2)}x`);
            break;
        }
        case 'Minus':
        case 'NumpadSubtract': {
            // Escalar - (mínimo seguro 0.05)
            const step = currentScale > 5.0 ? 1.0 : (currentScale > 1.0 ? 0.2 : 0.1);
            applyScaleToSelected(Math.max(0.05, currentScale - step));
            showDevToast(`🔍 Escala: ${currentScale.toFixed(2)}x`);
            break;
        }
        case 'Delete':
        case 'Backspace':
            executeDeleteSelectedObject();
            break;
        case 'KeyH':
            if (hudContainer) {
                hudContainer.classList.toggle('collapsed');
                const isCollapsed = hudContainer.classList.contains('collapsed');
                const btn = hudContainer.querySelector('#godCollapseBtn');
                if (btn) btn.innerHTML = isCollapsed ? '▴ Mostrar' : '▾ Ocultar';
                clampWindowToViewport(hudContainer, 'hud', false);
            }
            break;
        case 'KeyG':
            if (selectedWorldObject) {
                e.preventDefault();
                isGrabModeActive = !isGrabModeActive;
                if (isGrabModeActive) {
                    dragInitialPos = getSelectedObjectPosition();
                    showDevToast(`✋ Modo Agarrar activo: Mueve el ratón para desplazar "${selectedWorldObject.data?.name || 'Objeto'}". Clic Izq para fijar, Esc para cancelar.`);
                } else {
                    if (hasValidGroundHit) {
                        const commitTarget = (isEdgeSnapEnabled && lastSnapResult?.snapped && selectedWorldObject.type === 'custom')
                            ? { x: lastSnapResult.x, y: getHeightAt(lastSnapResult.x, lastSnapResult.z), z: lastSnapResult.z, rotationY: lastSnapResult.rotationY }
                            : currentGroundHit;
                        commitSelectedObjectMove(commitTarget);
                        showDevToast(`📍 "${selectedWorldObject.data?.name || 'Objeto'}" fijado en el terreno`);
                    }
                }
                renderHUDContent();
                renderControlsGuideContent();
            } else {
                showDevToast('⚠️ Primero selecciona un elemento para poder moverlo con la tecla G');
            }
            break;
        case 'F1':
            e.preventDefault();
            isGuideCollapsed = !isGuideCollapsed;
            renderControlsGuideContent();
            if (controlsGuidePanel) clampWindowToViewport(controlsGuidePanel, 'guide', false);
            break;
        case 'Escape':
            if (logicWindowPanel && typeof activeLogicCloseFn === 'function') {
                e.preventDefault();
                activeLogicCloseFn();
                return;
            }
            if (isGrabModeActive || isDraggingSelectedObject) {
                e.preventDefault();
                if (dragInitialPos) {
                    revertSelectedObjectPosition(dragInitialPos);
                    showDevToast('↩️ Movimiento cancelado');
                }
                isGrabModeActive = false;
                isDraggingSelectedObject = false;
                lastSnapResult = null;
                return;
            }
            exitGodMode();
            break;
    }
}

function onKeyUp(e) {
    if (!isGodModeActive) return;

    // Ignorar si el usuario está escribiendo en cualquier campo de texto
    const targetTag = e.target?.tagName ? e.target.tagName.toUpperCase() : '';
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || Boolean(e.target?.isContentEditable)) return;

    switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
            flyKeys.forward = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            flyKeys.backward = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            flyKeys.left = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            flyKeys.right = false;
            break;
        case 'Space':
        case 'KeyE':
            flyKeys.up = false;
            break;
        case 'KeyQ':
            flyKeys.down = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            flyKeys.speedBoost = false;
            break;
    }
}

function onMouseMove(e) {
    if (!isGodModeActive) return;

    // Actualizar coordenadas normalizadas del ratón (-1 a +1)
    mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

    // 1. Rotación de cámara libre con Clic Derecho
    if (isMouseDown) {
        const deltaX = e.clientX - mouseStartX;
        const deltaY = e.clientY - mouseStartY;

        mouseStartX = e.clientX;
        mouseStartY = e.clientY;

        const sensitivity = 0.0035;
        flyCam.yaw += deltaX * sensitivity;
        flyCam.pitch -= deltaY * sensitivity;

        // Limitar ángulo de inclinación vertical (-85° a +85°)
        const maxPitch = Math.PI / 2 - 0.05;
        flyCam.pitch = Math.max(-maxPitch, Math.min(maxPitch, flyCam.pitch));
    }

    // 2. Arrastre Directo 3D (Drag & Drop) o Modo Agarrar (Tecla G)
    if ((isDraggingSelectedObject || isGrabModeActive) && selectedWorldObject) {
        if (isDraggingSelectedObject && !hasMovedSignificantly) {
            const dist = Math.hypot(e.clientX - mouseDownStart.x, e.clientY - mouseDownStart.y);
            if (dist > 4) {
                hasMovedSignificantly = true;
            }
        }

        if (hasMovedSignificantly || isGrabModeActive) {
            updateRaycastWithTerrain();
            if (hasValidGroundHit) {
                applyLiveMoveToSelectedObject(currentGroundHit);
            }
        }
    }
}

function onMouseDown(e) {
    if (!isGodModeActive) return;

    // Si el clic fue dentro de cualquiera de las ventanas flotantes del Modo Dios, no interactuar con el mundo 3D
    if (hudContainer && hudContainer.contains(e.target)) return;
    if (catalogWindowPanel && catalogWindowPanel.contains(e.target)) return;
    if (controlsGuidePanel && controlsGuidePanel.contains(e.target)) return;
    if (locatorWindowPanel && locatorWindowPanel.contains(e.target)) return;
    if (objectsWindowPanel && objectsWindowPanel.contains(e.target)) return;
    if (logicWindowPanel && logicWindowPanel.contains(e.target)) return;

    // Clic derecho siempre activa la rotación de cámara
    if (e.button === 2) {
        isMouseDown = true;
        mouseStartX = e.clientX;
        mouseStartY = e.clientY;
        return;
    }

    // Clic izquierdo: acción de colocación o selección / arrastre
    if (e.button === 0) {
        // 1. Si está activo el modo "Agarrar" (tecla G): clic izquierdo fija el objeto en el suelo
        if (isGrabModeActive) {
            if (hasValidGroundHit && selectedWorldObject) {
                const commitTarget = (isEdgeSnapEnabled && lastSnapResult?.snapped && selectedWorldObject.type === 'custom')
                    ? { x: lastSnapResult.x, y: getHeightAt(lastSnapResult.x, lastSnapResult.z), z: lastSnapResult.z, rotationY: lastSnapResult.rotationY }
                    : currentGroundHit;
                commitSelectedObjectMove(commitTarget);
                const snapTag = (isEdgeSnapEnabled && lastSnapResult?.snapped) ? ' 🧲 acoplado' : '';
                showDevToast(`📍 "${selectedWorldObject.data?.name || 'Objeto'}" fijado${snapTag} en (${commitTarget.x.toFixed(1)}, ${commitTarget.z.toFixed(1)})`);
            }
            isGrabModeActive = false;
            lastSnapResult = null;
            renderHUDContent();
            renderControlsGuideContent();
            return;
        }

        // 2. Si la herramienta es 'place' y hay un ítem seleccionado del catálogo, se planta un nuevo objeto
        if (currentTool === 'place' && selectedCatalogItem) {
            handlePlaceObjectClick();
            return;
        }

        // 3. Selección y Arrastre directo en el mundo 3D
        raycaster.setFromCamera(mouseNDC, camera);
        const candidates = getSelectableCandidates();

        if (candidates.length > 0) {
            const intersects = raycaster.intersectObjects(candidates, true);
            const validHits = intersects.filter(h => {
                if (!h.object) return false;
                if (placementCursor && (h.object === placementCursor || placementCursor.getObjectById(h.object.id))) return false;
                if (ghostMesh && (h.object === ghostMesh || ghostMesh.getObjectById(h.object.id))) return false;
                if (ghostHitboxHelper && (h.object === ghostHitboxHelper || ghostHitboxHelper.getObjectById(h.object.id))) return false;
                if (selectionBoxHelper && (h.object === selectionBoxHelper || selectionBoxHelper.getObjectById(h.object.id))) return false;
                return true;
            });

            if (validHits.length > 0) {
                const hit = validHits[0];
                resolveAndSelectObjectFromHit(hit);

                // Iniciar estado de arrastre inmediato (Drag & Drop en 3D)
                isDraggingSelectedObject = true;
                hasMovedSignificantly = false;
                mouseDownStart = { x: e.clientX, y: e.clientY };
                dragInitialPos = getSelectedObjectPosition();
                return;
            }
        }

        // Si no se hizo clic sobre ningún objeto:
        if (currentTool === 'select' && selectedWorldObject) {
            clearSelectionHelper();
        } else if (currentTool === 'place' && !selectedCatalogItem) {
            showDevToast('💡 Haz clic sobre cualquier elemento (o arrástralo con el ratón) para moverlo');
        }
    }
}

function onMouseUp(e) {
    if (e.button === 2) {
        isMouseDown = false;
    }

    if (e.button === 0) {
        if (isDraggingSelectedObject) {
            if (hasMovedSignificantly && hasValidGroundHit && selectedWorldObject) {
                const commitTarget = (isEdgeSnapEnabled && lastSnapResult?.snapped && selectedWorldObject.type === 'custom')
                    ? { x: lastSnapResult.x, y: getHeightAt(lastSnapResult.x, lastSnapResult.z), z: lastSnapResult.z, rotationY: lastSnapResult.rotationY }
                    : currentGroundHit;
                const wasSnapped = Boolean(isEdgeSnapEnabled && lastSnapResult?.snapped);
                commitSelectedObjectMove(commitTarget);
                showDevToast(`📍 "${selectedWorldObject.data?.name || 'Objeto'}" movido${wasSnapped ? ' (🧲 acoplado)' : ''} a (${commitTarget.x.toFixed(1)}, ${commitTarget.z.toFixed(1)})`);
            }
            isDraggingSelectedObject = false;
            hasMovedSignificantly = false;
            lastSnapResult = null;
        }
    }
}

function onContextMenu(e) {
    if (isGodModeActive) {
        e.preventDefault(); // Evitar menú contextual de navegador
    }
}

/**
 * Planta el objeto seleccionado en la coordenada actual del terreno.
 */
async function handlePlaceObjectClick() {
    if (!hasValidGroundHit || !selectedCatalogItem) return;

    updateGhostTransform();
    const useSnap = isEdgeSnapEnabled && lastSnapResult && lastSnapResult.snapped;
    const pos = {
        x: useSnap ? lastSnapResult.x : currentGroundHit.x,
        z: useSnap ? lastSnapResult.z : currentGroundHit.z
    };
    const placeRotY = useSnap ? lastSnapResult.rotationY : currentRotationY;
    let latestCatalogItem = selectedCatalogItem;
    if (latestCatalogItem.source === 'custom' && latestCatalogItem.sourceId) {
        const freshItem = getCustomItemById(latestCatalogItem.sourceId);
        if (freshItem) {
            latestCatalogItem = {
                ...latestCatalogItem,
                name: freshItem.name || latestCatalogItem.name,
                icon: freshItem.icon || latestCatalogItem.icon,
                code: freshItem.code || latestCatalogItem.code
            };
        }
    }

    const itemDesc = {
        ...latestCatalogItem,
        scaleXYZ: { ...currentScaleXYZ }
    };

    const placed = await placeObjectInWorld(itemDesc, pos, placeRotY, { ...currentScaleXYZ }, itemDesc.isSolid !== false, false);
    if (placed && placed.missingGlb) {
        modelAvailabilityMap.set(itemDesc.sourceId || itemDesc.url, 'missing');
        setSelectedItem(null);
        renderHUDContent();
        showDevToast(`❌ Falta el archivo .GLB de "${placed.name || itemDesc.name}". Selecciónalo de tu ordenador para volver a cargarlo.`, 5000);
        const fileInput = hudContainer?.querySelector('#godGlbFileInput');
        if (fileInput) fileInput.click();
        return;
    }

    if (placed) {
        hasUnsavedChanges = true;
        pendingChangesCount++;
        showDevToast(`✅ Plantado "${placed.record.name}"${useSnap ? ' (🧲 acoplado)' : ''} en (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`);

        // Efecto sonoro visual o destello suave en el cursor
        if (placementCursor) {
            placementCursor.scale.set(1.4, 1.4, 1.4);
            setTimeout(() => {
                if (placementCursor) placementCursor.scale.set(1, 1, 1);
            }, 120);
        }
        renderHUDContent();
    }
}

/**
 * Obtiene la lista unificada de todos los candidatos seleccionables en el mundo:
 * - Objetos 3D de la biblioteca y subidos (Custom)
 * - Robot Player
 * - NPCs vivos (Panda, Alto, Telerín, Telerón)
 * - Mueble y mobiliario interactivo
 * - Mallas instanciadas de Árboles y Rocas
 */
function getSelectableCandidates() {
    const candidates = [];

    // 1. Objetos colocados personalizados (Biblioteca / subidos)
    const customObjects = getActiveWorldMeshes();
    for (const w of customObjects) {
        if (w.mesh) candidates.push(w.mesh);
    }

    // 2. Jugador (Robot Player)
    if (runtimeState.player) {
        candidates.push(runtimeState.player);
    }

    // 3. NPCs conocidos
    try {
        const panda = getPandaNPC();
        if (panda && panda.visible !== false) candidates.push(panda);
    } catch (_) {}
    try {
        const alto = getAltoNPC();
        if (alto && alto.visible !== false) candidates.push(alto);
    } catch (_) {}
    try {
        const telerin = getTelerinNPC();
        if (telerin && telerin.visible !== false) candidates.push(telerin);
    } catch (_) {}
    try {
        const teleron = getTeleronNPC();
        if (teleron && teleron.visible !== false) candidates.push(teleron);
    } catch (_) {}

    // 4. Mueble (incluyendo su cajón interactivo desacoplado)
    try {
        const mueble = getMuebleObject();
        if (mueble && mueble.visible !== false) {
            candidates.push(mueble);
            if (mueble.userData?.drawerGroup && mueble.userData.drawerGroup.visible !== false) {
                candidates.push(mueble.userData.drawerGroup);
            }
        }
    } catch (_) {}

    // 5. Todos los InstancedMeshes de la escena (Árboles y Rocas)
    scene.traverse((child) => {
        if (child.isInstancedMesh) {
            if (!candidates.includes(child)) {
                candidates.push(child);
            }
        }
    });

    return candidates;
}

/**
 * Selecciona de forma universal cualquier entidad viva del mundo (Player, NPC, Árbol, Roca, Mueble u Objeto).
 */
function handleSelectObjectClick() {
    raycaster.setFromCamera(mouseNDC, camera);

    const candidates = getSelectableCandidates();
    if (candidates.length === 0) {
        clearSelectionHelper();
        return;
    }

    const intersects = raycaster.intersectObjects(candidates, true);
    if (intersects.length === 0) {
        clearSelectionHelper();
        return;
    }

    // Filtrar impactos contra elementos auxiliares de depuración
    const validHits = intersects.filter(h => {
        if (!h.object) return false;
        if (placementCursor && (h.object === placementCursor || placementCursor.getObjectById(h.object.id))) return false;
        if (ghostMesh && (h.object === ghostMesh || ghostMesh.getObjectById(h.object.id))) return false;
        if (ghostHitboxHelper && (h.object === ghostHitboxHelper || ghostHitboxHelper.getObjectById(h.object.id))) return false;
        if (selectionBoxHelper && (h.object === selectionBoxHelper || selectionBoxHelper.getObjectById(h.object.id))) return false;
        return true;
    });

    if (validHits.length === 0) {
        clearSelectionHelper();
        return;
    }

    resolveAndSelectObjectFromHit(validHits[0]);
}

/**
 * Resuelve y selecciona un objeto a partir del hit de intersección del raycaster.
 */
function resolveAndSelectObjectFromHit(hit) {
    if (!hit || !hit.object) return;
    const hitObj = hit.object;

    // 1. ¿Es una malla instanciada (Árbol, Roca o cualquier elemento procedural)?
    if (hitObj.isInstancedMesh && typeof hit.instanceId === 'number' && hit.instanceId >= 0) {
        const isTree = Boolean(hitObj.userData?.isTree || hitObj.userData?.type === 'tree');
        const isRock = Boolean(hitObj.userData?.isRock || hitObj.userData?.type === 'rock');
        const type = isTree ? 'tree' : (isRock ? 'rock' : (hitObj.userData?.type || 'instanced'));
        const proceduralCategory = hitObj.userData?.proceduralCategory || (isTree ? 'trees' : (isRock ? 'rocks' : 'procedural'));
        const sourceType = hitObj.userData?.source || (isTree ? 'tree' : (isRock ? 'rock' : 'procedural'));

        const matrix = new THREE.Matrix4();
        hitObj.getMatrixAt(hit.instanceId, matrix);

        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        matrix.decompose(pos, quat, scale);

        const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
        const name = isTree
            ? (hitObj.userData?.name || `Árbol #${hit.instanceId + 1}`)
            : (isRock ? (hitObj.userData?.name || `Roca #${hit.instanceId + 1}`) : (hitObj.userData?.name || `Procedural #${hit.instanceId + 1}`));
        const icon = hitObj.userData?.icon || (isTree ? '🌲' : (isRock ? '🪨' : '🌿'));

        selectWorldObject({
            type,
            category: 'instanced',
            proceduralCategory,
            source: sourceType,
            instancedMesh: hitObj,
            pairMesh: hitObj.userData?.pairMesh,
            instanceId: hit.instanceId,
            matrix: matrix.clone(),
            initialPos: pos.clone(),
            data: {
                name,
                icon,
                position: { x: pos.x, y: pos.y, z: pos.z },
                rotationY: euler.y,
                rotationXYZ: { x: euler.x, y: euler.y, z: euler.z },
                scale: Number(((scale.x + scale.y + scale.z) / 3).toFixed(4)),
                scaleXYZ: { x: scale.x, y: scale.y, z: scale.z }
            }
        });
        return;
    }

    // 2. ¿Es el Robot Player?
    if (runtimeState.player) {
        let curr = hitObj;
        let isPlayerHit = false;
        while (curr) {
            if (curr === runtimeState.player || curr.userData?.isPlayer) {
                isPlayerHit = true;
                break;
            }
            curr = curr.parent;
        }
        if (isPlayerHit) {
            const baseScale = runtimeState.player.userData?.baseScale || 1.4;
            const pScaleXYZ = {
                x: Number((runtimeState.player.scale.x / baseScale).toFixed(3)),
                y: Number((runtimeState.player.scale.y / baseScale).toFixed(3)),
                z: Number((runtimeState.player.scale.z / baseScale).toFixed(3))
            };
            selectWorldObject({
                type: 'player',
                mesh: runtimeState.player,
                data: {
                    name: 'Robot Player (Jugador)',
                    icon: '🤖',
                    position: runtimeState.player.position,
                    rotationY: runtimeState.player.rotation.y,
                    scale: Number(((pScaleXYZ.x + pScaleXYZ.y + pScaleXYZ.z) / 3).toFixed(4)),
                    scaleXYZ: pScaleXYZ
                }
            });
            return;
        }
    }

    // 3. ¿Es un NPC?
    const npcs = [
        { name: 'Panda', get: getPandaNPC, icon: '🐼' },
        { name: 'Alto', get: getAltoNPC, icon: '🚶' },
        { name: 'Telerín', get: getTelerinNPC, icon: '👦' },
        { name: 'Telerón', get: getTeleronNPC, icon: '🧑' }
    ];
    for (const npcItem of npcs) {
        const npcMesh = npcItem.get ? npcItem.get() : null;
        if (npcMesh) {
            let curr = hitObj;
            let isNpcHit = false;
            while (curr) {
                if (curr === npcMesh || curr.userData?.npcName === npcItem.name) {
                    isNpcHit = true;
                    break;
                }
                curr = curr.parent;
            }
            if (isNpcHit) {
                const rawFactor = npcMesh.userData?.rawHeightFactor || 1;
                const nScaleXYZ = {
                    x: Number((npcMesh.scale.x / rawFactor).toFixed(3)),
                    y: Number((npcMesh.scale.y / rawFactor).toFixed(3)),
                    z: Number((npcMesh.scale.z / rawFactor).toFixed(3))
                };
                selectWorldObject({
                    type: 'npc',
                    mesh: npcMesh,
                    data: {
                        name: `NPC ${npcItem.name}`,
                        icon: npcItem.icon,
                        position: npcMesh.position,
                        rotationY: npcMesh.rotation.y,
                        scale: Number(((nScaleXYZ.x + nScaleXYZ.y + nScaleXYZ.z) / 3).toFixed(4)),
                        scaleXYZ: nScaleXYZ
                    }
                });
                return;
            }
        }
    }

    // 4. ¿Es el Mueble / Mobiliario (o su cajón interactivo)?
    const mueble = getMuebleObject();
    if (mueble) {
        let curr = hitObj;
        let isMuebleHit = false;
        while (curr) {
            if (
                curr === mueble ||
                curr.userData?.isFurniture ||
                curr.userData?.type === 'mueble' ||
                curr.userData?.isMuebleDrawerPart ||
                curr.userData?.parentMueble === mueble
            ) {
                isMuebleHit = true;
                break;
            }
            curr = curr.parent;
        }
        if (isMuebleHit) {
            const logicalScale = getMuebleLogicalScale();
            selectWorldObject({
                type: 'furniture',
                mesh: mueble,
                data: {
                    name: mueble.userData?.displayName || 'Mueble con Cajón Secreto',
                    icon: '🪑',
                    position: mueble.position,
                    rotationY: mueble.rotation.y,
                    scale: Number(((logicalScale.x + logicalScale.y + logicalScale.z) / 3).toFixed(4)),
                    scaleXYZ: logicalScale
                }
            });
            return;
        }
    }

    // 5. ¿Es un objeto de la biblioteca o subido (custom)?
    const worldMeshes = getActiveWorldMeshes();
    for (const w of worldMeshes) {
        let curr = hitObj;
        while (curr) {
            if (curr === w.mesh) {
                selectWorldObject({
                    ...w,
                    type: 'custom'
                });
                return;
            }
            curr = curr.parent;
        }
    }

    // 6. Si es cualquier otro objeto con jerarquía en la escena
    let curr = hitObj;
    while (curr && curr.parent && curr.parent !== scene) {
        curr = curr.parent;
    }
    if (curr && curr !== scene) {
        const name = curr.name || curr.userData?.name || 'Objeto de Escenario';
        selectWorldObject({
            type: 'generic',
            mesh: curr,
            data: {
                name,
                icon: '📦',
                position: curr.position,
                rotationY: curr.rotation.y,
                scale: curr.scale.x
            }
        });
        return;
    }

    clearSelectionHelper();
}

/**
 * Obtiene la posición tridimensional actual del elemento seleccionado.
 */
function getSelectedObjectPosition() {
    if (!selectedWorldObject) return null;
    if (selectedWorldObject.type === 'custom' || selectedWorldObject.type === 'player' || selectedWorldObject.type === 'npc' || selectedWorldObject.type === 'furniture' || selectedWorldObject.type === 'generic') {
        const m = selectedWorldObject.mesh || runtimeState.player;
        if (m) return { x: m.position.x, y: m.position.y, z: m.position.z, rotationY: m.rotation.y };
    } else if (selectedWorldObject.category === 'instanced') {
        const mat = new THREE.Matrix4();
        selectedWorldObject.instancedMesh.getMatrixAt(selectedWorldObject.instanceId, mat);
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const sc = new THREE.Vector3();
        mat.decompose(pos, quat, sc);
        return { x: pos.x, y: pos.y, z: pos.z };
    }
    return null;
}

/**
 * Aplica el movimiento continuo en tiempo real (60fps) sin sobrecargar almacenamiento.
 */
function applyLiveMoveToSelectedObject(targetPos, allowSnap = true) {
    if (!selectedWorldObject || !targetPos) return;

    if (selectedWorldObject.type === 'custom') {
        if (selectedWorldObject.mesh) {
            let finalX = targetPos.x;
            let finalZ = targetPos.z;
            if (allowSnap && isEdgeSnapEnabled) {
                const baseRot = typeof selectedWorldObject.data?.rotationY === 'number'
                    ? selectedWorldObject.data.rotationY
                    : currentRotationY;
                const snap = computeSnapPositionForObject(
                    selectedWorldObject.mesh,
                    targetPos.x,
                    targetPos.z,
                    baseRot,
                    { excludeId: selectedWorldObject.id }
                );
                lastSnapResult = snap;
                if (snap && snap.snapped) {
                    finalX = snap.x;
                    finalZ = snap.z;
                    selectedWorldObject.mesh.rotation.y = snap.rotationY;
                } else {
                    selectedWorldObject.mesh.rotation.y = baseRot;
                }
            } else {
                lastSnapResult = null;
                if (typeof targetPos.rotationY === 'number') {
                    selectedWorldObject.mesh.rotation.y = targetPos.rotationY;
                }
            }
            snapObjectToTerrain(selectedWorldObject.mesh, finalX, finalZ);
        }
    } else if (selectedWorldObject.type === 'player') {
        if (runtimeState.player) {
            const offset = runtimeState.playerHeightOffset || 0;
            runtimeState.player.position.set(targetPos.x, targetPos.y + offset, targetPos.z);
        }
    } else if (selectedWorldObject.type === 'npc') {
        if (selectedWorldObject.mesh) {
            snapObjectToTerrain(selectedWorldObject.mesh, targetPos.x, targetPos.z);
            selectedWorldObject.mesh.traverse(child => {
                if (child.isMesh) child.frustumCulled = false;
            });
            selectedWorldObject.mesh.visible = true;
        }
    } else if (selectedWorldObject.type === 'furniture') {
        if (selectedWorldObject.mesh) {
            snapObjectToTerrain(selectedWorldObject.mesh, targetPos.x, targetPos.z);
            syncMuebleDrawerTransform();
        }
    } else if (selectedWorldObject.type === 'generic') {
        if (selectedWorldObject.mesh) {
            snapObjectToTerrain(selectedWorldObject.mesh, targetPos.x, targetPos.z);
        }
    } else if (selectedWorldObject.category === 'instanced') {
        moveInstancedObject(
            selectedWorldObject.instancedMesh,
            selectedWorldObject.pairMesh,
            selectedWorldObject.instanceId,
            targetPos
        );
    }

    if (selectionBoxHelper && typeof selectionBoxHelper.update === 'function') {
        selectionBoxHelper.update();
    }
}

function hideAndBackupProceduralInstance(instMesh, pairMesh, instanceId, origPos, proceduralCategory, restoreMatOverride = null) {
    if (!instMesh || typeof instanceId !== 'number' || instanceId < 0) return;

    const instances = instMesh.userData?.instances || [];
    const instData = instances[instanceId] || {};
    const archIdx = instMesh.userData?.archetypeIndex ?? (instData.archIdx ?? 0);
    const geoType = instMesh.userData?.geoType ?? (instData.geoType ?? 0);

    let backupMat = restoreMatOverride ? restoreMatOverride.clone() : new THREE.Matrix4();
    if (!restoreMatOverride) {
        instMesh.getMatrixAt(instanceId, backupMat);
    }

    const alreadyBackedUp = stagedInstancedBackups.some(
        b => b.instMesh === instMesh && b.instanceId === instanceId
    );
    if (!alreadyBackedUp) {
        stagedInstancedBackups.push({
            instMesh,
            pairMesh,
            instanceId,
            matrix: backupMat.clone(),
            instData,
            colRef: instData.colRef || null
        });
    }

    deleteInstancedObject(instMesh, pairMesh, instanceId);
    instData.isHidden = true;

    if (instData.colRef) {
        const colIdx = collidables.indexOf(instData.colRef);
        if (colIdx >= 0) {
            collidables.splice(colIdx, 1);
            rebuildSpatialGrid(collidables);
        }
    }

    hideProceduralInstance(proceduralCategory || 'procedural', {
        archIdx,
        geoType,
        instanceIdx: instanceId,
        x: origPos.x,
        z: origPos.z
    }, false);
}

function restoreStagedInstancedBackups() {
    if (!Array.isArray(stagedInstancedBackups) || stagedInstancedBackups.length === 0) return;
    let restoredAnyCollision = false;

    for (const b of stagedInstancedBackups) {
        if (!b.instMesh) continue;
        b.instMesh.setMatrixAt(b.instanceId, b.matrix);
        b.instMesh.instanceMatrix.needsUpdate = true;
        if (b.pairMesh) {
            b.pairMesh.setMatrixAt(b.instanceId, b.matrix);
            b.pairMesh.instanceMatrix.needsUpdate = true;
        }
        if (b.instData) {
            b.instData.isHidden = false;
        }
        if (b.colRef && !collidables.includes(b.colRef)) {
            addCollidable(b.colRef);
            restoredAnyCollision = true;
        }
    }

    if (restoredAnyCollision) {
        rebuildSpatialGrid(collidables);
    }
    stagedInstancedBackups = [];
}

/**
 * Promociona un elemento instanciado (Árbol, Roca o cualquier procedural futuro) a un objeto 3D individual
 * independiente gestionado por worldObjectsManager.
 * Primero crea el objeto individual y, solo si tiene éxito, oculta la instancia procedural en memoria staged.
 */
async function detachInstancedObjectToCustom(instObj, targetPos = null) {
    if (!instObj || instObj.category !== 'instanced') return instObj;
    if (instObj._isDetaching) return instObj._detachPromise || instObj;

    const runDetach = async () => {
        const isTree = instObj.type === 'tree';
        const isRock = instObj.type === 'rock';
        const instMesh = instObj.instancedMesh;
        const pairMesh = instObj.pairMesh;
        const instanceId = instObj.instanceId;

        if (!instMesh) return null;

        const instances = instMesh.userData?.instances || [];
        const instData = instances[instanceId] || {};
        const archIdx = instMesh.userData?.archetypeIndex ?? (instData.archIdx ?? 0);
        const geoType = instMesh.userData?.geoType ?? (instData.geoType ?? 0);
        const proceduralCategory = instObj.proceduralCategory || instMesh.userData?.proceduralCategory || (isTree ? 'trees' : (isRock ? 'rocks' : 'procedural'));
        const sourceType = instObj.source || instMesh.userData?.source || (isTree ? 'tree' : (isRock ? 'rock' : 'procedural'));

        const origPos = instObj.initialPos || { x: instData.x || 0, y: instData.y || 0, z: instData.z || 0 };

        // 1. Leer matriz y colores ANTES de ocultar la instancia original
        const currentMat = new THREE.Matrix4();
        instMesh.getMatrixAt(instanceId, currentMat);

        const sourceMat = (instObj.matrix && instObj.matrix.elements && instObj.matrix.elements[0] !== 0)
            ? instObj.matrix
            : currentMat;

        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scaleVec = new THREE.Vector3();
        sourceMat.decompose(pos, quat, scaleVec);

        const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
        const destX = (targetPos && typeof targetPos.x === 'number') ? targetPos.x : pos.x;
        const destZ = (targetPos && typeof targetPos.z === 'number') ? targetPos.z : pos.z;
        const destY = (targetPos && typeof targetPos.y === 'number') ? targetPos.y : getHeightAt(destX, destZ);

        const finalRotY = (targetPos && typeof targetPos.rotationY === 'number')
            ? targetPos.rotationY
            : (Math.abs(currentRotationY - (instObj.data?.rotationY || 0)) > 0.0001 ? currentRotationY : euler.y);

        const initScaleXYZ = instObj.data?.scaleXYZ;
        const scaleWasEdited = initScaleXYZ && (
            Math.abs(currentScaleXYZ.x - initScaleXYZ.x) > 0.001 ||
            Math.abs(currentScaleXYZ.y - initScaleXYZ.y) > 0.001 ||
            Math.abs(currentScaleXYZ.z - initScaleXYZ.z) > 0.001
        );
        const finalScaleXYZ = scaleWasEdited
            ? { ...currentScaleXYZ }
            : {
                x: scaleVec.x > 0.02 ? scaleVec.x : (instData.scaleX || instData.scale || 1.0),
                y: scaleVec.y > 0.02 ? scaleVec.y : (instData.scaleY || instData.scale || 1.0),
                z: scaleVec.z > 0.02 ? scaleVec.z : (instData.scaleZ || instData.scale || 1.0)
            };

        const finalRotXYZ = (Math.abs(euler.x) > 0.001 || Math.abs(euler.z) > 0.001)
            ? { x: euler.x, y: finalRotY, z: euler.z }
            : undefined;

        // 2. Extraer colores reales de la instancia
        let trunkHex = 0x5a3e28;
        let leafHex = 0x2e6f40;
        let rockHex = 0x666666;
        if (instData.trunkColor) {
            trunkHex = instData.trunkColor.getHex ? instData.trunkColor.getHex() : instData.trunkColor;
        } else if (isTree && instMesh.getColorAt) {
            const cTrunk = new THREE.Color();
            instMesh.getColorAt(instanceId, cTrunk);
            if (cTrunk.r !== 1 || cTrunk.g !== 1 || cTrunk.b !== 1) trunkHex = cTrunk.getHex();
        }
        if (instData.leafColor) {
            leafHex = instData.leafColor.getHex ? instData.leafColor.getHex() : instData.leafColor;
        } else if (isTree && pairMesh && pairMesh.getColorAt) {
            const cLeaf = new THREE.Color();
            pairMesh.getColorAt(instanceId, cLeaf);
            if (cLeaf.r !== 1 || cLeaf.g !== 1 || cLeaf.b !== 1) leafHex = cLeaf.getHex();
        }
        if (instData.rockColor) {
            rockHex = instData.rockColor.getHex ? instData.rockColor.getHex() : instData.rockColor;
        } else if (isRock && instMesh.getColorAt) {
            const cRock = new THREE.Color();
            instMesh.getColorAt(instanceId, cRock);
            if (cRock.r !== 1 || cRock.g !== 1 || cRock.b !== 1) rockHex = cRock.getHex();
        }

        let itemDesc;
        if (typeof instMesh.userData?.buildIndividualDesc === 'function') {
            itemDesc = instMesh.userData.buildIndividualDesc(instData, instMesh.userData, instMesh, instanceId);
        } else {
            itemDesc = {
                name: isTree
                    ? `Árbol (Arquetipo ${archIdx + 1})`
                    : (isRock ? `Roca (${geoType === 1 || geoType === 'icosaedro' ? 'Icosaédrica' : 'Dodecaédrica'})` : (instObj.data?.name || 'Elemento Procedural')),
                icon: instObj.data?.icon || (isTree ? '🌲' : (isRock ? '🪨' : '🌿')),
                source: sourceType,
                archetypeIndex: archIdx,
                geoType: geoType,
                trunkColor: trunkHex,
                leafColor: leafHex,
                rockColor: rockHex,
                proceduralParams: instData.proceduralParams ? { ...instData.proceduralParams } : undefined,
                rotationXYZ: finalRotXYZ,
                scaleXYZ: finalScaleXYZ,
                defaultGroundOffset: typeof instMesh.userData?.defaultGroundOffset === 'number'
                    ? instMesh.userData.defaultGroundOffset
                    : (isRock ? 0 : (isTree ? -0.35 : undefined)),
                isSolid: true
            };
        }

        // 3. Crear primero el objeto individual en memoria staged (shouldPersist = false)
        const placedEntry = await placeObjectInWorld(
            itemDesc,
            { x: destX, y: destY, z: destZ },
            finalRotY,
            finalScaleXYZ,
            true,
            false
        );

        if (!placedEntry || !placedEntry.mesh) {
            showDevToast(`⚠️ No se pudo independizar "${itemDesc.name}". Se mantiene el original.`);
            return null;
        }

        // 4. Solo tras crearse correctamente, fijar su altura natural y ocultar la instancia procedural en memoria staged
        const origGroundY = getHeightAt(origPos.x, origPos.z);
        const explicitOffset = typeof instMesh.userData?.defaultGroundOffset === 'number'
            ? instMesh.userData.defaultGroundOffset
            : (isRock ? 0 : (isTree ? -0.35 : (pos.y - origGroundY)));

        placedEntry.mesh.userData.relativeGroundOffset = explicitOffset;
        snapObjectToTerrain(placedEntry.mesh, destX, destZ, explicitOffset);
        if (placedEntry.record) {
            placedEntry.record.relativeGroundOffset = explicitOffset;
            placedEntry.record.position = {
                x: placedEntry.mesh.position.x,
                y: placedEntry.mesh.position.y,
                z: placedEntry.mesh.position.z
            };
        }

        hideAndBackupProceduralInstance(instMesh, pairMesh, instanceId, origPos, proceduralCategory, sourceMat);

        const newSelected = {
            ...placedEntry,
            type: 'custom'
        };
        selectWorldObject(newSelected);
        showDevToast(`✨ ${itemDesc.name} independizado (sin hornear aún)`);
        return newSelected;
    };

    instObj._isDetaching = true;
    instObj._detachPromise = runDetach().finally(() => {
        instObj._isDetaching = false;
        instObj._detachPromise = null;
    });
    return instObj._detachPromise;
}

/**
 * Consolida la posición final del objeto: actualiza chunks, colisiones y memoria staged.
 * No persiste en disco ni LocalStorage hasta que el usuario pulse 'Guardar y Hornear Escenario'.
 */
function commitSelectedObjectMove(targetPos, skipDirty = false) {
    if (!selectedWorldObject || !targetPos) return;

    if (selectedWorldObject.type === 'custom') {
        const patch = { x: targetPos.x, z: targetPos.z };
        if (typeof targetPos.rotationY === 'number') {
            patch.rotationY = targetPos.rotationY;
            currentRotationY = targetPos.rotationY;
        }
        updatePlacedObjectTransform(selectedWorldObject.id, patch, false);
        if (selectedWorldObject.data?.position) {
            selectedWorldObject.data.position.x = targetPos.x;
            selectedWorldObject.data.position.z = targetPos.z;
        }
        if (typeof targetPos.rotationY === 'number' && selectedWorldObject.data) {
            selectedWorldObject.data.rotationY = targetPos.rotationY;
        }
    } else if (selectedWorldObject.type === 'player') {
        if (runtimeState.player) {
            const offset = runtimeState.playerHeightOffset || 0;
            runtimeState.player.position.set(targetPos.x, targetPos.y + offset, targetPos.z);
            updateEntityTransform('playerSpawn', null, { x: targetPos.x, z: targetPos.z }, false);
        }
    } else if (selectedWorldObject.type === 'npc') {
        if (selectedWorldObject.mesh) {
            snapObjectToTerrain(selectedWorldObject.mesh, targetPos.x, targetPos.z);
            selectedWorldObject.mesh.traverse(child => {
                if (child.isMesh) child.frustumCulled = false;
            });
            selectedWorldObject.mesh.visible = true;
            const npcName = (selectedWorldObject.data?.name || selectedWorldObject.mesh.userData?.npcName || '').replace(/^NPC\s+/i, '').trim();
            if (npcName) {
                updateEntityTransform('npcs', npcName, { x: targetPos.x, z: targetPos.z }, false);
            }
            rebuildSpatialGrid(collidables);
        }
    } else if (selectedWorldObject.type === 'furniture') {
        if (selectedWorldObject.mesh) {
            snapObjectToTerrain(selectedWorldObject.mesh, targetPos.x, targetPos.z);
            syncMuebleDrawerTransform();
            updateEntityTransform('furniture', 'mueble', { x: targetPos.x, z: targetPos.z }, false);
            rebuildSpatialGrid(collidables);
        }
    } else if (selectedWorldObject.type === 'generic') {
        if (selectedWorldObject.mesh) {
            snapObjectToTerrain(selectedWorldObject.mesh, targetPos.x, targetPos.z);
            rebuildSpatialGrid(collidables);
        }
    } else if (selectedWorldObject.category === 'instanced') {
        const instToDetach = selectedWorldObject;
        detachInstancedObjectToCustom(instToDetach, targetPos).then(newCustom => {
            if (newCustom && newCustom.mesh && targetPos) {
                snapObjectToTerrain(newCustom.mesh, targetPos.x, targetPos.z);
                updatePlacedObjectTransform(newCustom.id, { x: targetPos.x, z: targetPos.z }, false);
                if (selectionBoxHelper && typeof selectionBoxHelper.update === 'function') {
                    selectionBoxHelper.update();
                }
            }
        }).catch(err => {
            console.error('[GodMode] Error desacoplando instancia procedural al mover:', err);
            showDevToast(`❌ Error al mover elemento procedural: ${err?.message || err}`);
        });
    }

    lastSnapResult = null;
    if (!skipDirty) {
        hasUnsavedChanges = true;
        pendingChangesCount++;
    }

    if (selectionBoxHelper && typeof selectionBoxHelper.update === 'function') {
        selectionBoxHelper.update();
    }
    renderHUDContent();
    renderControlsGuideContent();
}

/**
 * Restaura la posición original previa al movimiento si se pulsa Escape.
 */
function revertSelectedObjectPosition(origPos) {
    if (!selectedWorldObject || !origPos) return;
    applyLiveMoveToSelectedObject({ ...origPos, _rawY: true }, false);
    if (selectedWorldObject.category !== 'instanced') {
        commitSelectedObjectMove(origPos, true);
    }
}

function selectWorldObject(objEntry) {
    selectedWorldObject = objEntry;
    lastSnapResult = null;

    // Crear caja visual de selección
    if (selectionBoxHelper) {
        disposeHelperObject(selectionBoxHelper);
        selectionBoxHelper = null;
    }

    if (objEntry.category === 'instanced') {
        const instMatrix = new THREE.Matrix4();
        objEntry.instancedMesh.getMatrixAt(objEntry.instanceId, instMatrix);
        if (!objEntry.instancedMesh.geometry.boundingBox) {
            objEntry.instancedMesh.geometry.computeBoundingBox();
        }
        const box = objEntry.instancedMesh.geometry.boundingBox.clone();
        box.applyMatrix4(instMatrix);
        selectionBoxHelper = new THREE.Box3Helper(box, objEntry.type === 'tree' ? 0x22c55e : 0xa1a1aa);
        scene.add(selectionBoxHelper);
    } else if (objEntry.mesh) {
        const color = objEntry.type === 'player' ? 0x38bdf8 :
                      objEntry.type === 'npc' ? 0x10b981 :
                      objEntry.type === 'furniture' ? 0xa855f7 : 0xf59e0b;
        try {
            if (objEntry.type === 'custom' || objEntry.type === 'furniture') {
                selectionBoxHelper = createOrientedBoxHelper(objEntry.mesh, color);
            } else {
                selectionBoxHelper = new THREE.BoxHelper(objEntry.mesh, color);
            }
            scene.add(selectionBoxHelper);
        } catch (_) {}
    } else if (objEntry.data?.position) {
        const p = objEntry.data.position;
        const groundY = getHeightAt(p.x, p.z);
        const box = new THREE.Box3(
            new THREE.Vector3(p.x - 0.5, groundY, p.z - 0.5),
            new THREE.Vector3(p.x + 0.5, groundY + 1.8, p.z + 0.5)
        );
        selectionBoxHelper = new THREE.Box3Helper(box, 0x10b981);
        scene.add(selectionBoxHelper);
    }

    currentRotationY = objEntry.data?.rotationY || 0;
    currentScaleXYZ = getObjectScaleXYZFromData(objEntry.data);
    currentScale = Number(((currentScaleXYZ.x + currentScaleXYZ.y + currentScaleXYZ.z) / 3).toFixed(4));
    const hasNonUniformAxes = (
        Math.abs(currentScaleXYZ.x - currentScaleXYZ.y) > 0.005 ||
        Math.abs(currentScaleXYZ.y - currentScaleXYZ.z) > 0.005 ||
        Math.abs(currentScaleXYZ.x - currentScaleXYZ.z) > 0.005
    );
    if (hasNonUniformAxes) {
        isScaleUnlocked = true;
    }

    const rotVal = document.getElementById('godRotVal');
    if (rotVal) rotVal.textContent = `${Math.round(THREE.MathUtils.radToDeg(currentRotationY))}°`;
    const sVal = document.getElementById('godScaleVal');
    if (sVal) sVal.textContent = `${currentScale.toFixed(1)}x`;

    const icon = objEntry.data?.icon || '📦';
    const name = objEntry.data?.name || 'Objeto';
    showDevToast(`🎯 Seleccionado: ${icon} "${name}"`);
    renderHUDContent();
    renderControlsGuideContent();
}

function clearSelectionHelper(rerender = true) {
    const hadSelection = !!selectedWorldObject || !!selectionBoxHelper;
    selectedWorldObject = null;
    isDraggingSelectedObject = false;
    isGrabModeActive = false;
    lastSnapResult = null;
    if (selectionBoxHelper) {
        disposeHelperObject(selectionBoxHelper);
        selectionBoxHelper = null;
    }
    if (rerender && hadSelection && hudContainer) {
        renderHUDContent();
    }
    renderControlsGuideContent();
}

function applyRotationToSelected(newRotY) {
    currentRotationY = newRotY;
    const degNorm = Math.round(((THREE.MathUtils.radToDeg(currentRotationY) % 360) + 360) % 360);
    const rotVal = document.getElementById('godRotVal');
    if (rotVal) rotVal.textContent = `${degNorm}°`;
    const rotInput = document.getElementById('godRotInput');
    if (rotInput && document.activeElement !== rotInput) {
        rotInput.value = degNorm.toString();
    }

    if (!selectedWorldObject) {
        updateGhostTransform();
        return;
    }

    if (selectedWorldObject.type === 'custom') {
        updatePlacedObjectTransform(selectedWorldObject.id, { rotationY: currentRotationY }, false);
    } else if (selectedWorldObject.type === 'player') {
        if (runtimeState.player) {
            runtimeState.player.rotation.y = currentRotationY;
            updateEntityTransform('playerSpawn', null, { rotationY: currentRotationY }, false);
        }
    } else if (selectedWorldObject.type === 'npc') {
        if (selectedWorldObject.mesh) {
            selectedWorldObject.mesh.rotation.y = currentRotationY;
            const npcName = (selectedWorldObject.data?.name || selectedWorldObject.mesh.userData?.npcName || '').replace(/^NPC\s+/i, '').trim();
            if (npcName) {
                updateEntityTransform('npcs', npcName, { rotationY: currentRotationY, explicitRotation: true }, false);
            }
        }
    } else if (selectedWorldObject.type === 'furniture') {
        if (selectedWorldObject.mesh) {
            selectedWorldObject.mesh.rotation.y = currentRotationY;
            syncMuebleDrawerTransform();
            rebuildSpatialGrid(collidables);
            updateEntityTransform('furniture', 'mueble', { rotationY: currentRotationY }, false);
        }
    } else if (selectedWorldObject.type === 'generic') {
        if (selectedWorldObject.mesh) {
            selectedWorldObject.mesh.rotation.y = currentRotationY;
        }
    } else if (selectedWorldObject.category === 'instanced') {
        const instToDetach = selectedWorldObject;
        detachInstancedObjectToCustom(instToDetach).then(newCustom => {
            if (newCustom && newCustom.id) {
                updatePlacedObjectTransform(newCustom.id, { rotationY: currentRotationY }, false);
            }
        }).catch(err => {
            console.error('[GodMode] Error rotando elemento procedural:', err);
        });
    }

    hasUnsavedChanges = true;
    pendingChangesCount++;

    if (selectionBoxHelper && typeof selectionBoxHelper.update === 'function') {
        selectionBoxHelper.update();
    }
    updateGhostTransform();
}

function syncScaleInputsDOM() {
    const sVal = document.getElementById('godScaleVal');
    if (sVal) sVal.textContent = `${currentScale.toFixed(2)}x`;
    const scaleInput = document.getElementById('godScaleInput');
    if (scaleInput && document.activeElement !== scaleInput) {
        scaleInput.value = parseFloat(currentScale.toFixed(2)).toString();
    }
    ['x', 'y', 'z'].forEach(axis => {
        const axInput = document.getElementById(`godScale${axis.toUpperCase()}Input`);
        if (axInput && document.activeElement !== axInput) {
            axInput.value = parseFloat(currentScaleXYZ[axis].toFixed(2)).toString();
        }
    });
}

function applyScaleXYZInternal() {
    if (!selectedWorldObject) {
        updateGhostTransform();
        return;
    }

    if (selectedWorldObject.type === 'custom') {
        updatePlacedObjectTransform(selectedWorldObject.id, { scaleXYZ: currentScaleXYZ }, false);
    } else if (selectedWorldObject.type === 'player') {
        if (runtimeState.player) {
            const baseScale = runtimeState.player.userData?.baseScale || 1.4;
            runtimeState.player.scale.set(
                currentScaleXYZ.x * baseScale,
                currentScaleXYZ.y * baseScale,
                currentScaleXYZ.z * baseScale
            );
            const newOffset = computeGroundOffset(runtimeState.player);
            runtimeState.playerHeightOffset = newOffset;
            runtimeState.player.userData.relativeGroundOffset = newOffset;
            updateEntityTransform('playerSpawn', null, {
                scale: currentScale,
                scaleXYZ: { ...currentScaleXYZ }
            }, false);
        }
    } else if (selectedWorldObject.type === 'npc') {
        if (selectedWorldObject.mesh) {
            const rawFactor = selectedWorldObject.mesh.userData?.rawHeightFactor || 1;
            selectedWorldObject.mesh.scale.set(
                currentScaleXYZ.x * rawFactor,
                currentScaleXYZ.y * rawFactor,
                currentScaleXYZ.z * rawFactor
            );
            const gOff = computeGroundOffset(selectedWorldObject.mesh);
            selectedWorldObject.mesh.userData.relativeGroundOffset = gOff;
            snapObjectToTerrain(selectedWorldObject.mesh, selectedWorldObject.mesh.position.x, selectedWorldObject.mesh.position.z, gOff);
            const npcName = (selectedWorldObject.data?.name || selectedWorldObject.mesh.userData?.npcName || '').replace(/^NPC\s+/i, '').trim();
            if (npcName) {
                updateEntityTransform('npcs', npcName, {
                    scale: currentScale,
                    scaleXYZ: { ...currentScaleXYZ }
                }, false);
            }
        }
    } else if (selectedWorldObject.type === 'furniture') {
        if (selectedWorldObject.mesh) {
            applyMuebleLogicalScale(currentScaleXYZ);
            updateEntityTransform('furniture', 'mueble', {
                scale: currentScale,
                scaleXYZ: { ...currentScaleXYZ }
            }, false);
            rebuildSpatialGrid(collidables);
        }
    } else if (selectedWorldObject.type === 'generic') {
        if (selectedWorldObject.mesh) {
            selectedWorldObject.mesh.scale.set(currentScaleXYZ.x, currentScaleXYZ.y, currentScaleXYZ.z);
            snapObjectToTerrain(selectedWorldObject.mesh, selectedWorldObject.mesh.position.x, selectedWorldObject.mesh.position.z);
        }
    } else if (selectedWorldObject.category === 'instanced') {
        const instToDetach = selectedWorldObject;
        detachInstancedObjectToCustom(instToDetach).then(newCustom => {
            if (newCustom && newCustom.id) {
                updatePlacedObjectTransform(newCustom.id, { scaleXYZ: currentScaleXYZ }, false);
            }
        }).catch(err => {
            console.error('[GodMode] Error escalando elemento procedural:', err);
        });
    }

    hasUnsavedChanges = true;
    pendingChangesCount++;

    if (selectionBoxHelper && typeof selectionBoxHelper.update === 'function') {
        selectionBoxHelper.update();
    }
    updateGhostTransform();
}

function applyScaleToSelected(newScale) {
    const safeScale = Math.max(0.05, Number(newScale) || 0.05);
    const prevAvg = (currentScaleXYZ.x + currentScaleXYZ.y + currentScaleXYZ.z) / 3;
    const isUniform = (
        Math.abs(currentScaleXYZ.x - currentScaleXYZ.y) < 0.005 &&
        Math.abs(currentScaleXYZ.y - currentScaleXYZ.z) < 0.005
    );

    if (isUniform || prevAvg <= 0.001) {
        currentScaleXYZ = { x: safeScale, y: safeScale, z: safeScale };
    } else {
        const ratio = safeScale / prevAvg;
        currentScaleXYZ = {
            x: Math.max(0.05, Number((currentScaleXYZ.x * ratio).toFixed(3))),
            y: Math.max(0.05, Number((currentScaleXYZ.y * ratio).toFixed(3))),
            z: Math.max(0.05, Number((currentScaleXYZ.z * ratio).toFixed(3)))
        };
    }

    currentScale = Number(((currentScaleXYZ.x + currentScaleXYZ.y + currentScaleXYZ.z) / 3).toFixed(4));
    syncScaleInputsDOM();
    applyScaleXYZInternal();
}

function applyAxisScaleToSelected(axis, newVal) {
    if (!['x', 'y', 'z'].includes(axis)) return;
    const safeVal = Math.max(0.05, Number(newVal) || 0.05);
    currentScaleXYZ = {
        ...currentScaleXYZ,
        [axis]: Number(safeVal.toFixed(3))
    };
    currentScale = Number(((currentScaleXYZ.x + currentScaleXYZ.y + currentScaleXYZ.z) / 3).toFixed(4));
    syncScaleInputsDOM();
    applyScaleXYZInternal();
}

/**
 * Ajusta la elevación o enterramiento relativo respecto a la superficie del terreno.
 * Permite enterrar más una roca o elevar un elemento del suelo de forma personalizada.
 */
function applyElevationOffsetToSelected(deltaY) {
    if (!selectedWorldObject) return;

    const mesh = selectedWorldObject.mesh;
    if (!mesh) return;

    const groundY = getHeightAt(mesh.position.x, mesh.position.z);
    let currentRel = mesh.userData?.relativeGroundOffset;
    if (typeof currentRel !== 'number') {
        currentRel = mesh.position.y - groundY;
    }

    const newRel = currentRel + deltaY;
    mesh.userData.relativeGroundOffset = newRel;
    mesh.position.y = groundY + newRel;
    mesh.updateMatrixWorld(true);

    if (selectedWorldObject.type === 'custom') {
        updatePlacedObjectTransform(selectedWorldObject.id, {
            position: { x: mesh.position.x, z: mesh.position.z, elevationOffset: newRel }
        }, false);
    } else if (selectedWorldObject.type === 'furniture') {
        syncMuebleDrawerTransform();
        updateEntityTransform('furniture', 'mueble', { relativeGroundOffset: newRel }, false);
        rebuildSpatialGrid(collidables);
    } else if (selectedWorldObject.type === 'npc') {
        const npcName = (selectedWorldObject.data?.name || mesh.userData?.npcName || '').replace(/^NPC\s+/i, '').trim();
        if (npcName) {
            updateEntityTransform('npcs', npcName, { relativeGroundOffset: newRel }, false);
        }
    } else if (selectedWorldObject.type === 'player') {
        runtimeState.playerHeightOffset = newRel;
        updateEntityTransform('playerSpawn', null, { relativeGroundOffset: newRel }, false);
    }

    hasUnsavedChanges = true;
    pendingChangesCount++;

    const elevSpan = document.getElementById('godElevVal');
    if (elevSpan) {
        elevSpan.textContent = `${newRel >= 0 ? '+' : ''}${newRel.toFixed(2)}m`;
    }

    if (selectionBoxHelper && typeof selectionBoxHelper.update === 'function') {
        selectionBoxHelper.update();
    }

    showDevToast(`📏 Elevación ajustada: ${newRel >= 0 ? '+' : ''}${newRel.toFixed(2)}m respecto al suelo`);
}

async function executeMoveSelectedToCursor() {
    if (!selectedWorldObject || !hasValidGroundHit) {
        showDevToast('⚠️ Apunta con el ratón al terreno para mover el elemento');
        return;
    }

    const targetPos = { x: currentGroundHit.x, y: currentGroundHit.y, z: currentGroundHit.z };
    if (selectedWorldObject.category === 'instanced') {
        const instToDetach = selectedWorldObject;
        const newCustom = await detachInstancedObjectToCustom(instToDetach, targetPos);
        if (newCustom && newCustom.mesh) {
            snapObjectToTerrain(newCustom.mesh, targetPos.x, targetPos.z);
            updatePlacedObjectTransform(newCustom.id, { x: targetPos.x, z: targetPos.z }, false);
            hasUnsavedChanges = true;
            pendingChangesCount++;
            renderHUDContent();
        }
    } else {
        applyLiveMoveToSelectedObject(targetPos);
        commitSelectedObjectMove(targetPos);
    }
    showDevToast(`📍 "${selectedWorldObject?.data?.name || 'Objeto'}" trasladado a (${targetPos.x.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
}

/**
 * Duplica el objeto seleccionado manteniendo todas sus propiedades geométricas,
 * de colisión y lógicas, y selecciona automáticamente la nueva copia.
 */
async function executeDuplicateSelectedObject() {
    if (!selectedWorldObject) {
        showDevToast('⚠️ Selecciona primero un objeto con el ratón para duplicarlo (o pulsa Ctrl+D)');
        return;
    }

    if (selectedWorldObject.type === 'player') {
        showDevToast('🛡️ El Robot Player es el protagonista único y no puede duplicarse');
        return;
    }

    if (selectedWorldObject.type === 'npc') {
        showDevToast('⚠️ Los NPCs principales tienen identidades y misiones individuales únicas');
        return;
    }

    let targetId = selectedWorldObject.id;
    if (selectedWorldObject.category === 'instanced') {
        const detached = await detachInstancedObjectToCustom(selectedWorldObject);
        if (detached && detached.id) {
            targetId = detached.id;
        } else {
            showDevToast('⚠️ No se pudo independizar el elemento instanciado para duplicarlo');
            return;
        }
    }

    if (!targetId) {
        showDevToast('⚠️ Elemento no válido para duplicación');
        return;
    }

    const cloned = await duplicateWorldObject(targetId, null, false);
    if (cloned && cloned.mesh) {
        hasUnsavedChanges = true;
        pendingChangesCount++;
        selectWorldObject(cloned);
        showDevToast(`📑 ¡"${cloned.data?.name || 'Objeto'}" duplicado! Se ha seleccionado la copia para moverla`);
        renderHUDContent();
    } else {
        showDevToast('❌ Error al duplicar el objeto');
    }
}

/**
 * Clona el objeto seleccionado colocándolo exactamente pegado borde-con-borde
 * según su rotación actual y su tamaño real en los 3 ejes (vallas, muros, módulos).
 */
async function executeAdjacentDuplicateSelectedObject(direction = 'auto') {
    if (!selectedWorldObject) {
        showDevToast('⚠️ Selecciona primero un objeto para clonarlo pegado al lado (Ctrl+Shift+D)');
        return;
    }

    if (selectedWorldObject.type === 'player') {
        showDevToast('🛡️ El Robot Player no puede duplicarse');
        return;
    }

    if (selectedWorldObject.type === 'npc') {
        showDevToast('⚠️ Los NPCs principales no pueden duplicarse');
        return;
    }

    let targetId = selectedWorldObject.id;
    if (selectedWorldObject.category === 'instanced') {
        const detached = await detachInstancedObjectToCustom(selectedWorldObject);
        if (detached && detached.id) {
            targetId = detached.id;
        } else {
            showDevToast('⚠️ No se pudo independizar el elemento para clonarlo al lado');
            return;
        }
    }

    if (!targetId) {
        showDevToast('⚠️ Selecciona un objeto del mundo válido');
        return;
    }

    const cloned = await duplicateWorldObjectAdjacent(targetId, direction, false);
    if (cloned && cloned.mesh) {
        hasUnsavedChanges = true;
        pendingChangesCount++;
        selectWorldObject(cloned);
        const dirLabels = { right: 'derecha', left: 'izquierda', front: 'delante', back: 'detrás' };
        const dirWord = dirLabels[cloned.directionUsed] || 'el lado';
        showDevToast(`🧲 "${cloned.data?.name || 'Objeto'}" acoplado hacia ${dirWord}. Pulsa Ctrl+Shift+D para seguir encadenando.`);
        renderHUDContent();
    } else {
        showDevToast('❌ Error al acoplar copia contigua');
    }
}

/**
 * Mueve el objeto seleccionado unos centímetros en la dirección horizontal de la cámara
 * sin activar el imán (para ajustes finos manuales sobre terreno irregular).
 */
function nudgeSelectedObject(direction, stepMeters = 0.05) {
    if (!selectedWorldObject) return;
    const pos = getSelectedObjectPosition();
    if (!pos) return;

    const sinY = Math.sin(flyCam.yaw);
    const cosY = Math.cos(flyCam.yaw);
    let dx = 0;
    let dz = 0;

    if (direction === 'up') {
        dx = -sinY * stepMeters;
        dz = -cosY * stepMeters;
    } else if (direction === 'down') {
        dx = sinY * stepMeters;
        dz = cosY * stepMeters;
    } else if (direction === 'right') {
        dx = cosY * stepMeters;
        dz = -sinY * stepMeters;
    } else if (direction === 'left') {
        dx = -cosY * stepMeters;
        dz = sinY * stepMeters;
    }

    const newX = pos.x + dx;
    const newZ = pos.z + dz;
    const newY = getHeightAt(newX, newZ);
    const targetPos = { x: newX, y: newY, z: newZ };

    applyLiveMoveToSelectedObject(targetPos, false);
    commitSelectedObjectMove(targetPos);
    showDevToast(`🎯 Ajuste fino (${Math.round(stepMeters * 100)} cm)`);
}

/**
 * Abre la ventana flotante movible (sin oscurecer ni bloquear la vista 3D)
 * para configurar el comportamiento lógico, nombre, interacción y eventos del objeto seleccionado.
 */
function openObjectLogicModal(targetEntry) {
    if (!targetEntry || !targetEntry.id) return;
    if (typeof activeLogicCloseFn === 'function') {
        activeLogicCloseFn();
    } else {
        const existing = document.getElementById('godObjectLogicFloatingPanel');
        if (existing) existing.remove();
    }

    const data = targetEntry.data || {};
    const currentName = data.name || 'Elemento 3D';
    const currentSolid = data.isSolid !== false;
    const currentLogicType = data.logicType || 'default';
    const logicConfig = data.logicConfig || {};

    const panel = document.createElement('div');
    panel.id = 'godObjectLogicFloatingPanel';
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        width: 480px;
        max-width: 92vw;
        max-height: 84vh;
        background: linear-gradient(145deg, #131f18 0%, #0a110d 100%);
        backdrop-filter: blur(10px);
        border: 1.5px solid rgba(212, 175, 55, 0.65);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85), 0 0 24px rgba(212, 175, 55, 0.22);
        border-radius: 14px;
        color: #fff8e7;
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-sizing: border-box;
        z-index: 999995;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    logicWindowPanel = panel;

    lockInput('objectLogicModal');

    // Aislar eventos internos de la ventana sin bloquear el visor 3D alrededor
    ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(evt => {
        panel.addEventListener(evt, (e) => e.stopPropagation());
    });
    ['keydown', 'keyup', 'keypress'].forEach(evt => {
        panel.addEventListener(evt, (e) => {
            if (e.key === 'Escape') {
                if (typeof activeLogicCloseFn === 'function') {
                    activeLogicCloseFn();
                }
                return;
            }
            e.stopPropagation();
        });
    });

    panel.innerHTML = `
        <!-- CABECERA ARRASTRABLE -->
        <div id="godLogicDragHandle" style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(212,175,55,0.28);padding-bottom:8px;gap:8px;" title="Arrastra para mover libremente · Doble clic para centrar">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                <span class="godWinGrip" aria-hidden="true">⋮⋮</span>
                <span style="font-size:1.2rem;">⚙️</span>
                <div style="min-width:0;">
                    <div style="font-size:0.98rem;font-weight:800;color:#ffd54f;">Configuración Lógica</div>
                    <div style="font-size:0.7rem;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">ID: ${escapeHtml(targetEntry.id)}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                <button id="godLogicResetPosBtn" class="godWinIconBtn" title="Restablecer posición centrada">⟲</button>
                <button id="godLogicCloseBtn" class="godWinIconBtn" style="color:#fecaca;border-color:rgba(248,113,113,0.45);" title="Cerrar ventana">✕</button>
            </div>
        </div>

        <!-- FORMULARIO DESPLAZABLE -->
        <div class="styledScrollbar" style="display:flex;flex-direction:column;gap:12px;font-size:0.82rem;overflow-y:auto;padding-right:4px;">
            <!-- NOMBRE DEL OBJETO -->
            <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="color:#ffd54f;font-weight:700;">🏷️ Nombre / Etiqueta del Objeto:</label>
                <input type="text" id="godLogicNameInput" value="${escapeHtml(currentName)}" style="
                    background: rgba(0, 0, 0, 0.55);
                    border: 1px solid rgba(212, 175, 55, 0.4);
                    border-radius: 6px;
                    color: #fff;
                    padding: 7px 10px;
                    font-size: 0.85rem;
                    outline: none;
                " placeholder="Ej: Laboratorio Este, Almacén Central..." />
            </div>

            <!-- TIPO DE COMPORTAMIENTO LÓGICO -->
            <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="color:#ffd54f;font-weight:700;">🧠 Comportamiento / Interacción:</label>
                <select id="godLogicTypeSelect" style="
                    background: #0f1712;
                    border: 1px solid rgba(212, 175, 55, 0.4);
                    border-radius: 6px;
                    color: #fff;
                    padding: 7px 10px;
                    font-size: 0.85rem;
                    outline: none;
                ">
                    <option value="default" ${currentLogicType === 'default' ? 'selected' : ''}>🌿 Decorativo / Sin Interacción Especial</option>
                    <option value="dialogue" ${currentLogicType === 'dialogue' ? 'selected' : ''}>💬 Diálogo / Mensaje al acercarse [E]</option>
                    <option value="locked_door" ${currentLogicType === 'locked_door' ? 'selected' : ''}>🔒 Puerta / Acceso Bloqueado (Requiere Llave)</option>
                    <option value="mission_trigger" ${currentLogicType === 'mission_trigger' ? 'selected' : ''}>🎯 Disparador de Misión / Checkpoint</option>
                    <option value="custom_event" ${currentLogicType === 'custom_event' ? 'selected' : ''}>⚡ Evento Personalizado de Juego</option>
                </select>
            </div>

            <!-- CAMPOS DINÁMICOS SEGÚN EL TIPO -->
            <div id="godLogicDynamicFields" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;">
            </div>

            <!-- COLISIÓN FÍSICA -->
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:2px;">
                <input type="checkbox" id="godLogicSolidCheck" ${currentSolid ? 'checked' : ''} style="cursor:pointer;accent-color:#ffd54f;width:16px;height:16px;" />
                <span><strong>🧱 Física Sólida:</strong> El jugador y la cámara colisionan con este objeto</span>
            </label>
        </div>

        <!-- BOTONES DE ACCIÓN -->
        <div style="display:flex;justify-content:flex-end;gap:10px;border-top:1px solid rgba(212,175,55,0.2);padding-top:10px;">
            <button id="godLogicCancelBtn" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#cbd5e1;border-radius:6px;padding:7px 16px;cursor:pointer;font-size:0.8rem;font-weight:700;">
                Cancelar
            </button>
            <button id="godLogicSaveBtn" style="background:#059669;border:1px solid #10b981;color:#fff;border-radius:6px;padding:7px 18px;cursor:pointer;font-size:0.82rem;font-weight:800;box-shadow:0 4px 12px rgba(5,150,105,0.4);">
                💾 Guardar Lógica
            </button>
        </div>
    `;

    document.body.appendChild(panel);
    applyWindowPosition(panel, 'logic', getDefaultLogicWindowPos);
    bringWindowToFront(panel);

    const dragHandle = panel.querySelector('#godLogicDragHandle');
    setupDraggableWindow(panel, dragHandle, 'logic', getDefaultLogicWindowPos, 'Configuración Lógica');

    const resetBtn = panel.querySelector('#godLogicResetPosBtn');
    if (resetBtn) {
        resetBtn.onclick = (e) => {
            e.stopPropagation();
            resetWindowPosition(panel, 'logic', getDefaultLogicWindowPos, 'Configuración Lógica');
        };
    }

    const typeSelect = panel.querySelector('#godLogicTypeSelect');
    const dynamicFields = panel.querySelector('#godLogicDynamicFields');

    function renderDynamicFields(type) {
        if (type === 'default') {
            dynamicFields.innerHTML = `
                <div style="color:#94a3b8;font-size:0.75rem;">
                    Este objeto actuará como un elemento puramente escénico en el mundo, sin interacción activa por tecla ni eventos especiales.
                </div>
            `;
        } else if (type === 'dialogue') {
            dynamicFields.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="color:#6ee7b7;font-weight:700;font-size:0.75rem;">💬 Texto del Mensaje / Diálogo:</label>
                    <textarea id="godLogicText" rows="2" style="background:#000;border:1px solid #10b981;border-radius:4px;color:#fff;padding:6px;font-size:0.8rem;resize:vertical;" placeholder="Escribe el mensaje que mostrará...">${escapeHtml(logicConfig.dialogueText || '')}</textarea>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="color:#6ee7b7;font-weight:700;font-size:0.75rem;">🔘 Acción / Etiqueta del botón:</label>
                    <input type="text" id="godLogicPrompt" value="${escapeHtml(logicConfig.promptText || 'Hablar / Examinar')}" style="background:#000;border:1px solid #10b981;border-radius:4px;color:#fff;padding:5px 8px;font-size:0.8rem;" />
                </div>
            `;
        } else if (type === 'locked_door') {
            dynamicFields.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="color:#f59e0b;font-weight:700;font-size:0.75rem;">🔑 Llave / Ítem requerido en inventario:</label>
                    <input type="text" id="godLogicKeyItem" value="${escapeHtml(logicConfig.requiredItem || 'key')}" style="background:#000;border:1px solid #f59e0b;border-radius:4px;color:#fff;padding:5px 8px;font-size:0.8rem;" placeholder="key, card, notebook..." />
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="color:#f59e0b;font-weight:700;font-size:0.75rem;">🔒 Mensaje si está cerrado:</label>
                    <input type="text" id="godLogicLockedMsg" value="${escapeHtml(logicConfig.lockedMessage || 'La puerta está cerrada. Necesitas una llave.')}" style="background:#000;border:1px solid #f59e0b;border-radius:4px;color:#fff;padding:5px 8px;font-size:0.8rem;" />
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="color:#f59e0b;font-weight:700;font-size:0.75rem;">🔓 Mensaje al desbloquear:</label>
                    <input type="text" id="godLogicUnlockMsg" value="${escapeHtml(logicConfig.unlockedMessage || '¡Acceso concedido!')}" style="background:#000;border:1px solid #f59e0b;border-radius:4px;color:#fff;padding:5px 8px;font-size:0.8rem;" />
                </div>
            `;
        } else if (type === 'mission_trigger') {
            dynamicFields.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="color:#38bdf8;font-weight:700;font-size:0.75rem;">🎯 ID de Misión asociada:</label>
                    <input type="text" id="godLogicMissionId" value="${escapeHtml(logicConfig.missionId || 'mision_1')}" style="background:#000;border:1px solid #38bdf8;border-radius:4px;color:#fff;padding:5px 8px;font-size:0.8rem;" placeholder="mision_1, mision_2, checkpoint..." />
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="color:#38bdf8;font-weight:700;font-size:0.75rem;">📢 Mensaje de objetivo:</label>
                    <input type="text" id="godLogicMissionMsg" value="${escapeHtml(logicConfig.missionMessage || '¡Objetivo de misión completado!')}" style="background:#000;border:1px solid #38bdf8;border-radius:4px;color:#fff;padding:5px 8px;font-size:0.8rem;" />
                </div>
            `;
        } else if (type === 'custom_event') {
            dynamicFields.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="color:#c084fc;font-weight:700;font-size:0.75rem;">⚡ Nombre del Evento del Juego:</label>
                    <input type="text" id="godLogicEventName" value="${escapeHtml(logicConfig.eventName || 'evento_academia')}" style="background:#000;border:1px solid #c084fc;border-radius:4px;color:#fff;padding:5px 8px;font-size:0.8rem;" placeholder="alarma_on, luces_off, cinemática..." />
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="color:#c084fc;font-weight:700;font-size:0.75rem;">📝 Parámetro opcional:</label>
                    <input type="text" id="godLogicEventParam" value="${escapeHtml(logicConfig.eventParam || '')}" style="background:#000;border:1px solid #c084fc;border-radius:4px;color:#fff;padding:5px 8px;font-size:0.8rem;" />
                </div>
            `;
        }
    }

    renderDynamicFields(currentLogicType);
    typeSelect.onchange = () => {
        renderDynamicFields(typeSelect.value);
        clampWindowToViewport(panel, 'logic', false);
    };

    const close = () => {
        unlockInput('objectLogicModal');
        if (panel.parentNode) panel.parentNode.removeChild(panel);
        if (logicWindowPanel === panel) logicWindowPanel = null;
        activeLogicCloseFn = null;
    };
    activeLogicCloseFn = close;

    panel.querySelector('#godLogicCloseBtn').onclick = close;
    panel.querySelector('#godLogicCancelBtn').onclick = close;

    panel.querySelector('#godLogicSaveBtn').onclick = () => {
        const newName = panel.querySelector('#godLogicNameInput').value.trim() || currentName;
        const newType = typeSelect.value;
        const newSolid = panel.querySelector('#godLogicSolidCheck').checked;
        const newConfig = {};

        if (newType === 'dialogue') {
            newConfig.dialogueText = panel.querySelector('#godLogicText')?.value || '';
            newConfig.promptText = panel.querySelector('#godLogicPrompt')?.value || 'Examinar';
        } else if (newType === 'locked_door') {
            newConfig.requiredItem = panel.querySelector('#godLogicKeyItem')?.value || 'key';
            newConfig.lockedMessage = panel.querySelector('#godLogicLockedMsg')?.value || '';
            newConfig.unlockedMessage = panel.querySelector('#godLogicUnlockMsg')?.value || '';
        } else if (newType === 'mission_trigger') {
            newConfig.missionId = panel.querySelector('#godLogicMissionId')?.value || '';
            newConfig.missionMessage = panel.querySelector('#godLogicMissionMsg')?.value || '';
        } else if (newType === 'custom_event') {
            newConfig.eventName = panel.querySelector('#godLogicEventName')?.value || '';
            newConfig.eventParam = panel.querySelector('#godLogicEventParam')?.value || '';
        }

        updateWorldObjectLogic(targetEntry.id, {
            name: newName,
            logicType: newType,
            logicConfig: newConfig,
            isSolid: newSolid
        }, false);

        if (targetEntry.data) {
            targetEntry.data.name = newName;
            targetEntry.data.logicType = newType;
            targetEntry.data.logicConfig = newConfig;
            targetEntry.data.isSolid = newSolid;
        }

        hasUnsavedChanges = true;
        pendingChangesCount++;
        showDevToast(`✅ Lógica configurada para "${newName}" (${newType})`);
        close();
        renderHUDContent();
    };
}

function executeDeleteSelectedObject() {
    if (!selectedWorldObject) return;

    if (selectedWorldObject.type === 'player') {
        showDevToast('🛡️ El Robot Player es el protagonista del juego y no puede eliminarse');
        return;
    }

    if (selectedWorldObject.type === 'custom') {
        removePlacedObjectFromWorld(selectedWorldObject.id, false);
        hasUnsavedChanges = true;
        pendingChangesCount++;
        clearSelectionHelper();
        showDevToast('🗑️ Objeto eliminado (sin hornear aún)');
        renderHUDContent();
    } else if (selectedWorldObject.category === 'instanced') {
        const instMesh = selectedWorldObject.instancedMesh;
        const pairMesh = selectedWorldObject.pairMesh;
        const instanceId = selectedWorldObject.instanceId;
        const instances = instMesh?.userData?.instances || [];
        const instData = instances[instanceId] || {};
        const origPos = selectedWorldObject.initialPos || { x: instData.x || 0, z: instData.z || 0 };
        const proceduralCategory = selectedWorldObject.proceduralCategory || instMesh?.userData?.proceduralCategory || (selectedWorldObject.type === 'tree' ? 'trees' : (selectedWorldObject.type === 'rock' ? 'rocks' : 'procedural'));

        hideAndBackupProceduralInstance(instMesh, pairMesh, instanceId, origPos, proceduralCategory);

        hasUnsavedChanges = true;
        pendingChangesCount++;
        clearSelectionHelper();
        const delMsg = selectedWorldObject.type === 'tree'
            ? '🪓 Árbol talado (se fijará al pulsar Guardar y Hornear)'
            : (selectedWorldObject.type === 'rock'
                ? '🔨 Roca retirada (se fijará al pulsar Guardar y Hornear)'
                : '🗑️ Elemento procedural retirado (se fijará al pulsar Guardar y Hornear)');
        showDevToast(delMsg);
        renderHUDContent();
    } else if (selectedWorldObject.type === 'npc') {
        const targetNpc = selectedWorldObject;
        showDevModalDialog({
            title: '👤 Ocultar NPC del Escenario',
            message: `¿Deseas ocultar a "${targetNpc.data?.name || 'NPC'}" del escenario? Se fijará al pulsar Guardar y Hornear.`,
            confirmText: '🗑️ Ocultar NPC',
            cancelText: 'Cancelar',
            isDanger: true,
            onConfirm: () => {
                if (targetNpc?.mesh) {
                    targetNpc.mesh.userData.hiddenByLayout = true;
                    targetNpc.mesh.visible = false;
                    removeCollidable(targetNpc.mesh);
                    const npcName = (targetNpc.data?.name || targetNpc.mesh.userData?.npcName || '').replace(/^NPC\s+/i, '').trim();
                    if (npcName) {
                        updateEntityTransform('npcs', npcName, { hidden: true }, false);
                    }
                    hasUnsavedChanges = true;
                    pendingChangesCount++;
                }
                clearSelectionHelper();
                showDevToast('🗑️ NPC ocultado (se fijará al pulsar Guardar y Hornear)');
                renderHUDContent();
            }
        });
    } else if (selectedWorldObject.type === 'furniture') {
        const targetFurniture = selectedWorldObject;
        showDevModalDialog({
            title: '🪑 Ocultar Mueble del Escenario',
            message: `¿Deseas ocultar "${targetFurniture.data?.name || 'Mueble'}" del escenario? Se fijará al pulsar Guardar y Hornear.`,
            confirmText: '🗑️ Ocultar',
            cancelText: 'Cancelar',
            isDanger: true,
            onConfirm: () => {
                if (targetFurniture?.mesh) {
                    targetFurniture.mesh.userData.hiddenByLayout = true;
                    targetFurniture.mesh.visible = false;
                    removeCollidable(targetFurniture.mesh);
                    syncMuebleDrawerTransform();
                    updateEntityTransform('furniture', 'mueble', { hidden: true }, false);
                    hasUnsavedChanges = true;
                    pendingChangesCount++;
                }
                clearSelectionHelper();
                showDevToast('🗑️ Mueble ocultado (se fijará al pulsar Guardar y Hornear)');
                renderHUDContent();
            }
        });
    } else if (selectedWorldObject.type === 'generic') {
        const targetGeneric = selectedWorldObject;
        showDevModalDialog({
            title: '📦 Ocultar Elemento Temporalmente',
            message: `¿Deseas ocultar "${targetGeneric.data?.name || 'Elemento'}" durante esta sesión? (Nota: los elementos estáticos base del entorno no son editables permanentemente).`,
            confirmText: '🗑️ Ocultar',
            cancelText: 'Cancelar',
            isDanger: true,
            onConfirm: () => {
                if (targetGeneric?.mesh) {
                    targetGeneric.mesh.userData.hiddenByLayout = true;
                    targetGeneric.mesh.visible = false;
                    removeCollidable(targetGeneric.mesh);
                }
                clearSelectionHelper();
                showDevToast('🗑️ Elemento ocultado temporalmente en esta sesión');
                renderHUDContent();
            }
        });
    }
}

function updateInstancedObjectTransform(instancedMesh, pairMesh, instanceId, newRotY, newScale) {
    if (!instancedMesh) return;
    const mat = new THREE.Matrix4();
    instancedMesh.getMatrixAt(instanceId, mat);

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    mat.decompose(pos, quat, sc);

    if (typeof newRotY === 'number') {
        quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), newRotY);
    }
    if (typeof newScale === 'number' && newScale > 0) {
        sc.set(newScale, newScale, newScale);
    }

    mat.compose(pos, quat, sc);
    instancedMesh.setMatrixAt(instanceId, mat);
    instancedMesh.instanceMatrix.needsUpdate = true;

    if (pairMesh) {
        pairMesh.setMatrixAt(instanceId, mat);
        pairMesh.instanceMatrix.needsUpdate = true;
    }

    if (selectionBoxHelper && instancedMesh.geometry) {
        if (!instancedMesh.geometry.boundingBox) instancedMesh.geometry.computeBoundingBox();
        const box = instancedMesh.geometry.boundingBox.clone().applyMatrix4(mat);
        if (selectionBoxHelper.box) {
            selectionBoxHelper.box.copy(box);
        }
    }
}

function moveInstancedObject(instancedMesh, pairMesh, instanceId, newPos) {
    if (!instancedMesh) return;
    const mat = new THREE.Matrix4();
    instancedMesh.getMatrixAt(instanceId, mat);

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    mat.decompose(pos, quat, sc);

    const offset = typeof instancedMesh.userData?.defaultGroundOffset === 'number'
        ? instancedMesh.userData.defaultGroundOffset
        : (instancedMesh.userData?.isTree ? -0.35 : 0);
    const destY = newPos._rawY ? newPos.y : (getHeightAt(newPos.x, newPos.z) + offset);

    mat.compose(new THREE.Vector3(newPos.x, destY, newPos.z), quat, sc);
    instancedMesh.frustumCulled = false;
    instancedMesh.setMatrixAt(instanceId, mat);
    instancedMesh.instanceMatrix.needsUpdate = true;

    if (pairMesh) {
        pairMesh.frustumCulled = false;
        pairMesh.setMatrixAt(instanceId, mat);
        pairMesh.instanceMatrix.needsUpdate = true;
    }

    if (selectionBoxHelper && instancedMesh.geometry) {
        if (!instancedMesh.geometry.boundingBox) instancedMesh.geometry.computeBoundingBox();
        const box = instancedMesh.geometry.boundingBox.clone().applyMatrix4(mat);
        if (selectionBoxHelper.box) {
            selectionBoxHelper.box.copy(box);
        }
    }
}

function deleteInstancedObject(instancedMesh, pairMesh, instanceId) {
    if (!instancedMesh) return;
    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
    zeroMat.setPosition(0, -999, 0);
    instancedMesh.setMatrixAt(instanceId, zeroMat);
    instancedMesh.instanceMatrix.needsUpdate = true;

    if (pairMesh) {
        pairMesh.setMatrixAt(instanceId, zeroMat);
        pairMesh.instanceMatrix.needsUpdate = true;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
