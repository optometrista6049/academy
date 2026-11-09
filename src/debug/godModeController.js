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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
    undoLastPlacedObject,
    saveSceneVersion,
    revertToLastSavedState,
    getSavedWorldObjects,
    duplicateWorldObject,
    updateWorldObjectLogic,
    commitStagedWorldObjects
} from '../systems/worldObjectsManager.js';
import { dismissPandaReminder } from '../ui/pandaReminder.js';
import { showDevToast, closeDevPanel, openDevPanel } from './devPanel.js';
import { showDevModalDialog } from './devModalDialog.js';
import { getPandaNPC } from '../entities/npc/pandaNPC.js';
import { getAltoNPC } from '../entities/npc/altoNPC.js';
import { getTelerinNPC } from '../entities/npc/telerinNPC.js';
import { getTeleronNPC } from '../entities/npc/teleronNPC.js';
import { getMuebleObject } from '../entities/objects/muebleObject.js';
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
import { collidables } from '../entities/collisions.js';
import { lockInput, unlockInput } from '../systems/inputLockSystem.js';

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

// Objeto del mundo actualmente seleccionado para editar/mover
let selectedWorldObject = null;

// Control de cambios no guardados en memoria (Opción A: Guardado explícito)
let hasUnsavedChanges = false;
let pendingChangesCount = 0;

// Elementos 3D auxiliares del modo dios
let placementCursor = null;
let ghostMesh = null;
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

// Estado del panel Localizador de Modelos / Entidades
let isLocatorOpen = false;

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
            snapObjectToTerrain(target.mesh, pos.x, pos.z);
            target.mesh.visible = true;
            target.mesh.traverse(child => {
                if (child.isMesh) {
                    child.visible = true;
                    child.frustumCulled = false;
                }
            });
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

    selectEntityFromLocator(target);
    applyLiveMoveToSelectedObject(newPos);
    commitSelectedObjectMove(newPos);

    if (typeof saved.rotationY === 'number') {
        applyRotationToSelected(saved.rotationY);
    }
    if (typeof saved.scale === 'number') {
        applyScaleToSelected(saved.scale);
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
        selectWorldObject({
            type: 'player',
            mesh: runtimeState.player,
            data: {
                name: 'Robot Player (Jugador)',
                icon: '🤖',
                position: runtimeState.player.position,
                rotationY: runtimeState.player.rotation.y,
                scale: runtimeState.player.scale.x / 1.4
            }
        });
    } else if (target.type === 'npc') {
        selectWorldObject({
            type: 'npc',
            mesh: target.mesh,
            data: {
                name: `NPC ${target.name}`,
                icon: target.icon,
                position: target.pos,
                rotationY: target.mesh ? target.mesh.rotation.y : (target.savedPos?.rotationY || 0),
                scale: target.mesh ? target.mesh.scale.x : (target.savedPos?.scale || 1.8)
            }
        });
    } else if (target.type === 'furniture') {
        selectWorldObject({
            type: 'furniture',
            mesh: target.mesh,
            data: {
                name: 'Mueble con Cajón Secreto',
                icon: '🪑',
                position: target.pos,
                rotationY: target.mesh ? target.mesh.rotation.y : (target.savedPos?.rotationY || Math.PI),
                scale: target.mesh ? target.mesh.scale.x : 1.0
            }
        });
    }
}

/**
 * Activa el Modo Dios en el juego.
 */
export function enterGodMode() {
    if (isGodModeActive) return;
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

    // 4. Iniciar con PUNTERO LIBRE (sin ningún ítem preseleccionado)
    selectedCatalogItem = null;
    destroyGhostMesh();
    currentTool = 'place';

    // 5. Crear la barra flotante (HUD)
    createGodModeHUD();

    // 6. Conectar eventos de teclado y ratón
    bindGodModeEvents();

    // 7. Iniciar bucle de actualización de Modo Dios
    lastFrameTime = performance.now();
    runGodModeLoop();

    showDevToast('🌍 Modo Dios Activado: Vuela con Flechas/WASD y haz clic para colocar elementos');
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
                saveSceneVersion('Guardado desde Modo Dios');
                saveLayoutVersion('Guardado desde Modo Dios');
                try { await bakeCurrentWorldToCode(); } catch (_) {}
                hasUnsavedChanges = false;
                pendingChangesCount = 0;
                showDevToast('✅ ¡Cambios guardados con éxito!');
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

    // Limpiar auxiliares 3D
    destroyPlacementCursor();
    destroyGhostMesh();
    clearSelectionHelper();

    // Desconectar eventos
    unbindGodModeEvents();

    // Remover HUD flotante y guía de controles
    if (hudContainer && hudContainer.parentNode) {
        hudContainer.parentNode.removeChild(hudContainer);
        hudContainer = null;
    }
    if (controlsGuidePanel && controlsGuidePanel.parentNode) {
        controlsGuidePanel.parentNode.removeChild(controlsGuidePanel);
        controlsGuidePanel = null;
    }

    // Restaurar cámara del player
    const player = runtimeState.player;
    if (player) {
        camera.position.set(
            player.position.x,
            player.position.y + 3.0,
            player.position.z + 8.0
        );
        camera.lookAt(player.position);
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
        placementCursor = null;
    }
}

/**
 * Establece el ítem activo para colocar y genera su fantasma semitransparente.
 */
async function setSelectedItem(itemDesc) {
    selectedCatalogItem = itemDesc;
    destroyGhostMesh();

    if (!itemDesc) return;

    // Generar clon semitransparente para previsualizar antes de plantar
    let baseMesh = null;
    if (itemDesc.source === 'custom' && itemDesc.code) {
        const { buildThreeMeshFromCode } = await import('../systems/customItemStorage.js');
        const built = buildThreeMeshFromCode(itemDesc.code);
        if (built.success && built.object) baseMesh = built.object;
    } else if (itemDesc.source === 'system') {
        const { createProceduralItem } = await import('../player/playerEquipment.js');
        baseMesh = createProceduralItem(itemDesc.sourceId);
    } else if (itemDesc.source === 'tree') {
        const { createIndividualTree } = await import('../environment/trees.js');
        baseMesh = createIndividualTree(itemDesc.archetypeIndex ?? 0);
    } else if (itemDesc.source === 'rock') {
        const { createIndividualRock } = await import('../environment/rocks.js');
        baseMesh = createIndividualRock(itemDesc.geoType ?? 0);
    } else if (itemDesc.source === 'glb' && itemDesc.url) {
        baseMesh = await new Promise((resolve) => {
            const loader = new GLTFLoader();
            loader.setWithCredentials(true);
            loader.load(itemDesc.url, (g) => resolve(g.scene || g.scenes[0]), undefined, () => resolve(null));
        });
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
        updateGhostTransform();
    }

    updateHUDActiveItemBadge();
}

function destroyGhostMesh() {
    if (ghostMesh) {
        scene.remove(ghostMesh);
        ghostMesh = null;
    }
}

function updateGhostTransform() {
    if (!ghostMesh || !hasValidGroundHit) return;

    ghostMesh.scale.set(currentScale, currentScale, currentScale);
    ghostMesh.rotation.y = currentRotationY;

    // Snap exacto al terreno con cálculo métrico
    snapObjectToTerrain(ghostMesh, currentGroundHit.x, currentGroundHit.z);
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

    // 4. Actualizar cursor y fantasma
    const isMovingObject = (isDraggingSelectedObject && hasMovedSignificantly) || isGrabModeActive;
    if (placementCursor) {
        placementCursor.visible = hasValidGroundHit && (currentTool === 'place' || isMovingObject);
        if (hasValidGroundHit) {
            placementCursor.position.set(currentGroundHit.x, currentGroundHit.y + 0.02, currentGroundHit.z);
            placementCursor.rotation.y = currentRotationY;
        }
    }

    if (ghostMesh) {
        ghostMesh.visible = (currentTool === 'place' && hasValidGroundHit);
        if (hasValidGroundHit) {
            updateGhostTransform();
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

/**
 * Crea la barra de herramientas flotante (HUD) del Modo Dios.
 */
function createGodModeHUD() {
    hudContainer = document.createElement('div');
    hudContainer.id = 'devGodModeBar';
    hudContainer.className = 'devGodModeBar';

    renderHUDContent();
    document.body.appendChild(hudContainer);

    createGodModeControlsGuide();
}

function renderHUDContent() {
    if (!hudContainer) return;

    const customItems = getCustomItems();
    const uploadedModels = getUploadedModelsCatalog();
    const activeMeshes = getActiveWorldMeshes();

    const locatableEntities = getAllLocatableEntities();

    hudContainer.innerHTML = `
        <button id="godCollapseBtn" class="godCollapseBtn" title="Ocultar/Mostrar HUD (Tecla H)">▾ Ocultar HUD</button>
        <div class="godBarHeader">
            <div class="godBarTitle">
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
            <div class="godBarActions">
                <button id="godGuideBtn" class="godPillBtn" style="background:rgba(212,175,55,0.18);border-color:rgba(212,175,55,0.5);color:#ffd54f;font-weight:700;" title="Ver controles y atajos de teclado (Tecla F1)">
                    ⌨️ Guía (F1)
                </button>
                <button id="godSpeedBtn" class="godPillBtn" title="Velocidad de Vuelo (1x, 2x, 4x)">
                    🚀 ${flyCam.speedFactor}x
                </button>
                <button id="godLocatorBtn" class="godPillBtn ${isLocatorOpen ? 'active' : ''}" style="background:${isLocatorOpen ? '#0284c7' : 'rgba(14,165,233,0.18)'};border:1.5px solid #38bdf8;color:#e0f2fe;font-weight:800;" title="Abrir Localizador de Modelos (Encontrar a Alto, Panda, Telerín, Telerón, Player, Mueble...)">
                    🧭 Localizador de Modelos (${locatableEntities.length})
                </button>
                <button id="godUndoBtn" class="godPillBtn" title="Deshacer último objeto colocado (Ctrl+Z)" ${activeMeshes.length === 0 ? 'style="opacity:0.5;cursor:not-allowed;"' : ''}>
                    ↶ Deshacer
                </button>
                <button id="godTeleportPlayerBtn" class="godActionBtn" style="background:#0284c7;" title="Traer al Player a la posición actual de la cámara">
                    📍 Traer Player
                </button>
                <!-- BOTÓN PRINCIPAL: GUARDAR Y HORNEAR ESCENARIO (OPCIÓN A) -->
                <button id="godUnifiedSaveBtn" class="godActionBtn" style="background:${hasUnsavedChanges ? '#059669' : '#1e293b'};border:1.5px solid ${hasUnsavedChanges ? '#34d399' : '#475569'};color:#ffffff;font-weight:800;box-shadow:${hasUnsavedChanges ? '0 0 14px rgba(16,185,129,0.6)' : 'none'};" title="Guardar todos los cambios en LocalStorage y fijarlos en el código fuente para Git">
                    💾 Guardar y Hornear Escenario
                </button>
                <!-- BOTÓN: DESCARTAR CAMBIOS Y VOLVER AL ÚLTIMO GUARDADO -->
                <button id="godRevertBtn" class="godActionBtn" style="background:#b45309;border:1px solid #f59e0b;color:#fff;font-weight:700;" title="Descartar cambios no guardados y restaurar al estado confirmado">
                    ↩️ Descartar Cambios
                </button>
                <button id="godOpenDevPanelBtn" class="godActionBtn" style="background:#334155;" title="Abrir Developer Suite (F9)">
                    ⚙️ DevSuite
                </button>
                <button id="godExitBtn" class="godActionBtn godExitBtn" title="Salir de Modo Dios y volver al Player">
                    🚶 Salir al Player
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
            </div>

            <!-- ESTADO DEL OBJETO ACTIVO / DESELECCIONAR -->
            <div class="godItemStatusWrap">
                ${selectedCatalogItem ? `
                    <button id="godClearItemBtn" class="godPillBtn" style="background:#1e293b;border-color:#ffd54f;color:#ffd54f;font-weight:700;" title="Deseleccionar y dejar el cursor libre de objetos">
                        ✕ Soltar: <strong>${escapeHtml(selectedCatalogItem.name)}</strong>
                    </button>
                ` : `
                    <span class="godPillBadge" style="background:rgba(16, 185, 129, 0.15);border:1px solid rgba(16, 185, 129, 0.4);color:#34d399;padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:700;">
                        🟢 Puntero Libre (Sin Objeto)
                    </span>
                `}
            </div>

            <!-- CONTROLES Y ACCIONES DEL ELEMENTO SELECCIONADO (SELECTOR UNIVERSAL) -->
            ${selectedWorldObject ? `
                <div class="godSelectedWrap" style="display:flex;align-items:center;gap:6px;">
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
                        <button id="godDuplicateSelectedBtn" class="godActionBtn" style="background:#7c3aed;border-color:#a78bfa;font-weight:700;" title="Duplicar este elemento con su escala y rotación exacta (Atajo: Ctrl + D)">
                            📑 Duplicar (Ctrl+D)
                        </button>
                    ` : ''}
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

                <!-- ESCALA LIBRE (Botones y campo numérico editable sin límites) -->
                <div class="godMiniInputGroup" title="Escala métrica sin límite. Escribe directamente cualquier número (ej: 8, 15, 25) o usa botones +/-">
                    <label>Escala:</label>
                    <button id="godScaleDownBtn" class="godMiniBtn" title="Reducir escala (Tecla -)">-</button>
                    <input type="number" id="godScaleInput" class="godNumericInput" min="0.05" max="200" step="0.5"
                           value="${parseFloat(currentScale.toFixed(2))}"
                           style="width:48px;background:rgba(0,0,0,0.6);border:1px solid #38bdf8;color:#38bdf8;font-weight:700;font-size:0.75rem;padding:2px 4px;border-radius:4px;text-align:center;" />
                    <span style="color:#94a3b8;font-size:0.72rem;margin-left:-2px;">x</span>
                    <button id="godScaleUpBtn" class="godMiniBtn" title="Aumentar escala (Tecla +)">+</button>
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

        <!-- PANEL DESPLEGABLE: LOCALIZADOR DE MODELOS / ENTIDADES (ALTO, PANDA, ETC.) -->
        ${isLocatorOpen ? `
            <div class="godLocatorPanel styledScrollbar" style="max-height:220px;overflow-y:auto;background:rgba(10,16,24,0.95);border:1.5px solid #38bdf8;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;box-shadow:0 8px 24px rgba(0,0,0,0.85);margin-bottom:6px;">
                <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(56,189,248,0.3);padding-bottom:5px;">
                    <span style="color:#38bdf8;font-weight:800;font-size:0.78rem;display:flex;align-items:center;gap:6px;">
                        🧭 LOCALIZADOR UNIVERSAL DE MODELOS Y PERSONAJES (${locatableEntities.length})
                    </span>
                    <span style="color:#94a3b8;font-size:0.7rem;">Haz clic en 🎯 para enfocar cámara o en 📍 para traerlo frente a ti</span>
                </div>
                ${locatableEntities.map(ent => {
                    const posX = ent.pos?.x !== undefined ? ent.pos.x : (ent.savedPos?.x || 0);
                    const posZ = ent.pos?.z !== undefined ? ent.pos.z : (ent.savedPos?.z || 0);
                    const isSelected = selectedWorldObject && (
                        (selectedWorldObject.type === ent.type && (selectedWorldObject.data?.name?.includes(ent.name) || selectedWorldObject.id === ent.id)) ||
                        selectedWorldObject.mesh === ent.mesh
                    );

                    return `
                        <div style="display:flex;align-items:center;justify-content:space-between;background:${isSelected ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)'};border:${isSelected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)'};padding:5px 8px;border-radius:6px;font-size:0.75rem;">
                            <div style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;" class="godLocatorSelectRow" data-ent-id="${ent.id}">
                                <span style="font-size:1.05rem;">${ent.icon}</span>
                                <div style="display:flex;flex-direction:column;">
                                    <strong style="color:${isSelected ? '#38bdf8' : '#fff'};">${escapeHtml(ent.name)}</strong>
                                    <span style="color:#94a3b8;font-size:0.68rem;font-family:monospace;">
                                        Pos: (X: ${posX.toFixed(1)}, Z: ${posZ.toFixed(1)})
                                        ${ent.savedPos ? `&bull; Guardado: (${ent.savedPos.x.toFixed(1)}, ${ent.savedPos.z.toFixed(1)})` : ''}
                                    </span>
                                </div>
                            </div>
                            <div style="display:flex;gap:4px;align-items:center;">
                                <button class="godLocatorFocusBtn" data-ent-id="${ent.id}" style="background:#0284c7;border:1px solid #38bdf8;color:#fff;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:0.72rem;font-weight:700;" title="Volar la cámara hacia este modelo">
                                    🎯 Enfocar
                                </button>
                                <button class="godLocatorTeleportBtn" data-ent-id="${ent.id}" style="background:#059669;border:1px solid #34d399;color:#fff;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:0.72rem;font-weight:700;" title="Traer este modelo y situarlo en el suelo frente a la cámara">
                                    📍 Traer al Frente
                                </button>
                                ${ent.savedPos ? `
                                    <button class="godLocatorResetBtn" data-ent-id="${ent.id}" style="background:#b45309;border:1px solid #f59e0b;color:#fff;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:0.72rem;font-weight:700;" title="Restablecer este modelo a su posición guardada original">
                                        🔄 Reset Guardado
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        ` : ''}

        <!-- LISTA DESPLEGABLE DE OBJETOS EN ESCENARIO -->
        ${showObjectsListDrawer ? `
            <div class="godObjectsDrawer styledScrollbar" style="max-height:120px;overflow-y:auto;background:rgba(0,0,0,0.65);border:1px solid rgba(212,175,55,0.35);border-radius:8px;padding:6px;display:flex;flex-direction:column;gap:4px;">
                <div style="font-size:0.72rem;color:#ffd54f;font-weight:700;display:flex;justify-content:space-between;margin-bottom:2px;">
                    <span>Objetos Plantados en el Escenario (${activeMeshes.length}):</span>
                    <span style="color:#94a3b8;font-size:0.68rem;">Haz clic para seleccionar o en 📑 para duplicar</span>
                </div>
                ${activeMeshes.length === 0 ? '<div style="font-size:0.7rem;color:#94a3b8;padding:4px;">No hay ningún objeto colocado en el mapa aún.</div>' : ''}
                ${activeMeshes.map(m => `
                    <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.06);padding:4px 8px;border-radius:4px;font-size:0.73rem;">
                        <span class="godDrawerSelectObj" data-id="${m.id}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;flex:1;" title="Haz clic para seleccionar este objeto">
                            ${m.data?.icon || '📦'} <strong>${escapeHtml(m.data?.name || 'Objeto')}</strong>
                            <span style="color:#94a3b8;font-size:0.68rem;margin-left:6px;">(X: ${m.data?.position?.x?.toFixed(1) || 0}, Z: ${m.data?.position?.z?.toFixed(1) || 0})</span>
                            ${m.data?.logicType && m.data.logicType !== 'default' ? `<span style="background:#0f766e;color:#5eead4;padding:1px 5px;border-radius:3px;font-size:0.64rem;margin-left:5px;font-weight:700;">${escapeHtml(m.data.logicType)}</span>` : ''}
                        </span>
                        <div style="display:flex;gap:4px;align-items:center;">
                            <button class="godDrawerDuplicateBtn" data-id="${m.id}" style="background:#7c3aed;border:none;color:#fff;border-radius:3px;padding:2px 7px;cursor:pointer;font-size:0.7rem;font-weight:700;" title="Duplicar este objeto en el escenario">
                                📑 Duplicar
                            </button>
                            <button class="godDrawerDeleteBtn" data-id="${m.id}" style="background:#b91c1c;border:none;color:#fff;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:0.7rem;font-weight:700;" title="Eliminar este objeto del mapa">
                                🗑️
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : ''}

        <!-- PESTAÑAS DE CATÁLOGO DE ELEMENTOS -->
        <div class="godCatalogTabs">
            <button class="godCatTabBtn ${activeCatalogTab === 'library' ? 'active' : ''}" data-cattab="library">
                ✨ Biblioteca Three.js (${customItems.length})
            </button>
            <button class="godCatTabBtn ${activeCatalogTab === 'system' ? 'active' : ''}" data-cattab="system">
                📦 Sistema (Juego)
            </button>
            <button class="godCatTabBtn ${activeCatalogTab === 'customGlb' ? 'active' : ''}" data-cattab="customGlb">
                📁 Modelos PC (${uploadedModels.length})
            </button>
        </div>

        <!-- LISTA HORIZONTAL DESPLAZABLE DE ÍTEMS -->
        <div class="godItemsScroll styledScrollbar" id="godItemsScroll">
            ${renderCatalogItemsHTML(customItems, uploadedModels)}
        </div>

        <!-- PIE CON ATAJOS Y CONSEJOS -->
        <div class="godBarFooter">
            <span>🖱️ <b>Arrastrar Clic Izq / G:</b> Mover por el Suelo en Vivo &bull; <b>Clic Der:</b> Girar Cámara &bull; <b>WASD:</b> Volar &bull; <b>R/T:</b> Rotar &bull; <b>F1:</b> Guía de Controles</span>
        </div>
    `;

    setupHUDEvents();
}

function renderCatalogItemsHTML(customItems, uploadedModels) {
    if (activeCatalogTab === 'library') {
        if (customItems.length === 0) {
            return `<div class="godEmptyMsg">No hay objetos en la biblioteca aún. Puedes crearlos en la pestaña "Generador 3D".</div>`;
        }
        return customItems.map(item => `
            <button class="godItemCard ${selectedCatalogItem?.sourceId === item.id ? 'active' : ''}" data-source="custom" data-id="${item.id}">
                <span class="godItemIcon">${item.icon || '📦'}</span>
                <span class="godItemLabel">${escapeHtml(item.name)}</span>
            </button>
        `).join('');
    }

    if (activeCatalogTab === 'system') {
        const systemItems = [
            { id: 'flashlight', name: 'Linterna', icon: '🔦' },
            { id: 'key', name: 'Llave Dorada', icon: '🔑' },
            { id: 'notebook', name: 'Cuaderno', icon: '📓' },
            { id: 'wrench', name: 'Llave Inglesa', icon: '🔧' },
            { id: 'card', name: 'Carnet Oficial', icon: '🪪' },
            { id: 'tree_1', name: 'Roble Ancestral', icon: '🌲' },
            { id: 'tree_2', name: 'Pino Silvestre', icon: '🌲' },
            { id: 'tree_3', name: 'Abedul Esbelto', icon: '🌳' },
            { id: 'rock_dodec', name: 'Roca Dodecaédrica', icon: '🪨' },
            { id: 'rock_icosa', name: 'Roca Icosaédrica', icon: '🪨' }
        ];
        return systemItems.map(item => `
            <button class="godItemCard ${selectedCatalogItem?.sourceId === item.id ? 'active' : ''}" data-source="system" data-id="${item.id}">
                <span class="godItemIcon">${item.icon}</span>
                <span class="godItemLabel">${escapeHtml(item.name)}</span>
            </button>
        `).join('');
    }

    if (activeCatalogTab === 'customGlb') {
        if (uploadedModels.length === 0) {
            return `<div class="godEmptyMsg">Aún no has subido modelos .GLB de tu PC. Usa el botón "Cargar .GLB del PC" arriba.</div>`;
        }
        return uploadedModels.map(item => `
            <button class="godItemCard ${selectedCatalogItem?.sourceId === item.id ? 'active' : ''}" data-source="glb" data-id="${item.id}" data-url="${item.url}">
                <span class="godItemIcon">🎨</span>
                <span class="godItemLabel">${escapeHtml(item.name || item.filename)}</span>
            </button>
        `).join('');
    }

    return '';
}

/**
 * Crea y actualiza la tarjeta permanente con los atajos y controles en pantalla.
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
        background: rgba(10, 16, 12, 0.90);
        backdrop-filter: blur(8px);
        border: 1.5px solid rgba(212, 175, 55, 0.45);
        border-radius: 12px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.75);
        padding: 10px 14px;
        z-index: 999990;
        color: #fff8e7;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        user-select: none;
        transition: all 0.25s ease;
    `;

    renderControlsGuideContent();
    document.body.appendChild(controlsGuidePanel);
}

function renderControlsGuideContent() {
    if (!controlsGuidePanel) return;

    if (isGuideCollapsed) {
        controlsGuidePanel.style.padding = '6px 12px';
        controlsGuidePanel.style.width = 'auto';
        controlsGuidePanel.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:0.75rem;font-weight:700;color:#ffd54f;">⌨️ Controles (F1)</span>
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
            <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(212,175,55,0.3);padding-bottom:6px;margin-bottom:8px;">
                <span style="font-size:0.8rem;font-weight:800;color:#ffd54f;display:flex;align-items:center;gap:6px;">
                    ⌨️ Controles Modo Dios
                </span>
                <button id="godGuideToggleMinBtn" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#ffd54f;border-radius:4px;padding:1px 6px;cursor:pointer;font-size:0.68rem;font-weight:700;" title="Minimizar panel (F1)">
                    ▴ Ocultar
                </button>
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
                        <span style="background:rgba(2,132,199,0.3);border:1px solid #38bdf8;border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;color:#38bdf8;font-weight:700;">Arrastrar Clic</span><span style="color:#38bdf8;font-weight:700;">Mover en suelo en vivo</span>
                        <span style="background:rgba(2,132,199,0.3);border:1px solid #38bdf8;border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;color:#38bdf8;font-weight:700;">Tecla G</span><span style="color:#e0f2fe;">Agarrar (seguir cursor)</span>
                        <span style="background:rgba(124,58,237,0.3);border:1px solid #a78bfa;border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;color:#c4b5fd;font-weight:700;">Ctrl + D</span><span style="color:#c4b5fd;font-weight:700;">Duplicar seleccionado</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">R / T</span><span style="color:#cbd5e1;">Rotar ±15° (Shift: ±5°)</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">+ / -</span><span style="color:#cbd5e1;">Escalar (o teclear en HUD)</span>
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

    const minBtn = controlsGuidePanel.querySelector('#godGuideToggleMinBtn');
    if (minBtn) {
        minBtn.onclick = () => {
            isGuideCollapsed = !isGuideCollapsed;
            renderControlsGuideContent();
        };
    }
}

function setupHUDEvents() {
    if (!hudContainer) return;

    // Salir de Modo Dios
    const exitBtn = hudContainer.querySelector('#godExitBtn');
    if (exitBtn) exitBtn.onclick = exitGodMode;

    // Colapsar / Expandir HUD
    const collapseBtn = hudContainer.querySelector('#godCollapseBtn');
    if (collapseBtn) {
        collapseBtn.onclick = () => {
            hudContainer.classList.toggle('collapsed');
            const isCollapsed = hudContainer.classList.contains('collapsed');
            collapseBtn.innerHTML = isCollapsed ? '▴ Mostrar HUD' : '▾ Ocultar HUD';
        };
    }

    // Deshacer (Ctrl+Z)
    const undoBtn = hudContainer.querySelector('#godUndoBtn');
    if (undoBtn) {
        undoBtn.onclick = () => {
            const undone = undoLastPlacedObject();
            if (undone) {
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

    // Alternar Localizador de Modelos
    const locatorBtn = hudContainer.querySelector('#godLocatorBtn');
    if (locatorBtn) {
        locatorBtn.onclick = () => {
            isLocatorOpen = !isLocatorOpen;
            renderHUDContent();
        };
    }

    // Eventos dentro del panel Localizador de Modelos (Delegación Robusta con closest)
    if (isLocatorOpen) {
        const locatorPanel = hudContainer.querySelector('.godLocatorPanel');
        if (locatorPanel) {
            locatorPanel.onclick = (e) => {
                // 1. Obtener lista de entidades fresca en el momento exacto del clic
                const currentEntities = getAllLocatableEntities();
                const entitiesMap = new Map();
                currentEntities.forEach(ent => entitiesMap.set(ent.id, ent));

                // A. Botón 🎯 Enfocar
                const focusBtn = e.target.closest('.godLocatorFocusBtn');
                if (focusBtn) {
                    e.stopPropagation();
                    const entId = focusBtn.getAttribute('data-ent-id');
                    const target = entitiesMap.get(entId);
                    if (target) {
                        focusCameraOnTarget(target);
                    } else {
                        showDevToast(`⚠️ No se encontró la entidad "${entId}" en el mapa.`);
                    }
                    return;
                }

                // B. Botón 📍 Traer al frente
                const teleBtn = e.target.closest('.godLocatorTeleportBtn');
                if (teleBtn) {
                    e.stopPropagation();
                    const entId = teleBtn.getAttribute('data-ent-id');
                    const target = entitiesMap.get(entId);
                    if (target) {
                        teleportEntityToFrontOfCamera(target);
                    } else {
                        showDevToast(`⚠️ No se encontró la entidad "${entId}".`);
                    }
                    return;
                }

                // C. Botón 🔄 Reset a posición original
                const resetBtn = e.target.closest('.godLocatorResetBtn');
                if (resetBtn) {
                    e.stopPropagation();
                    const entId = resetBtn.getAttribute('data-ent-id');
                    const target = entitiesMap.get(entId);
                    if (target) {
                        resetEntityToSavedPosition(target);
                    } else {
                        showDevToast(`⚠️ No se encontró la entidad "${entId}".`);
                    }
                    return;
                }

                // D. Clic en la fila para seleccionar
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

                // 2. Crear versiones históricas de seguridad
                saveSceneVersion('Guardado desde Modo Dios');
                saveLayoutVersion('Guardado desde Modo Dios');

                // 3. Hornear directamente en el código fuente de la app (.js) para GitHub
                const bakeRes = await bakeCurrentWorldToCode();

                hasUnsavedChanges = false;
                pendingChangesCount = 0;

                if (bakeRes.success) {
                    showDevToast('✅ ¡Escenario guardado en LocalStorage y fijado con éxito en el código fuente para Git!', 5000);
                } else {
                    showDevToast(`💾 Cambios guardados en memoria y LocalStorage. (Aviso Git: ${bakeRes.error || bakeRes.message})`, 4500);
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

                    // 3. Re-sincronizar mallas en vivo con las coordenadas confirmadas
                    if (runtimeState.player && confirmedLayout.playerSpawn) {
                        const groundY = getHeightAt(confirmedLayout.playerSpawn.x, confirmedLayout.playerSpawn.z);
                        runtimeState.player.position.set(confirmedLayout.playerSpawn.x, groundY + (runtimeState.playerHeightOffset || 0), confirmedLayout.playerSpawn.z);
                        if (typeof confirmedLayout.playerSpawn.rotationY === 'number') {
                            runtimeState.player.rotation.y = confirmedLayout.playerSpawn.rotationY;
                        }
                    }

                    const npcsMap = confirmedLayout.npcs || {};
                    const altoMesh = getAltoNPC();
                    if (altoMesh && npcsMap.Alto) {
                        const groundY = getHeightAt(npcsMap.Alto.x, npcsMap.Alto.z);
                        altoMesh.position.set(npcsMap.Alto.x, groundY, npcsMap.Alto.z);
                        if (typeof npcsMap.Alto.rotationY === 'number') altoMesh.rotation.y = npcsMap.Alto.rotationY;
                        if (typeof npcsMap.Alto.scale === 'number') altoMesh.scale.setScalar(npcsMap.Alto.scale);
                    }

                    const pandaMesh = getPandaNPC();
                    if (pandaMesh && npcsMap.Panda) {
                        const groundY = getHeightAt(npcsMap.Panda.x, npcsMap.Panda.z);
                        pandaMesh.position.set(npcsMap.Panda.x, groundY, npcsMap.Panda.z);
                        if (typeof npcsMap.Panda.rotationY === 'number') pandaMesh.rotation.y = npcsMap.Panda.rotationY;
                    }

                    const telerinMesh = getTelerinNPC();
                    if (telerinMesh && (npcsMap['Telerín'] || npcsMap['Telerin'])) {
                        const t = npcsMap['Telerín'] || npcsMap['Telerin'];
                        const groundY = getHeightAt(t.x, t.z);
                        telerinMesh.position.set(t.x, groundY, t.z);
                        if (typeof t.rotationY === 'number') telerinMesh.rotation.y = t.rotationY;
                    }

                    const teleronMesh = getTeleronNPC();
                    if (teleronMesh && (npcsMap['Telerón'] || npcsMap['Teleron'])) {
                        const t = npcsMap['Telerón'] || npcsMap['Teleron'];
                        const groundY = getHeightAt(t.x, t.z);
                        teleronMesh.position.set(t.x, groundY, t.z);
                        if (typeof t.rotationY === 'number') teleronMesh.rotation.y = t.rotationY;
                    }

                    const muebleMesh = getMuebleObject();
                    if (muebleMesh && confirmedLayout.furniture?.mueble) {
                        const m = confirmedLayout.furniture.mueble;
                        const groundY = getHeightAt(m.x, m.z);
                        muebleMesh.position.set(m.x, groundY + 0.45, m.z);
                        if (typeof m.rotationY === 'number') muebleMesh.rotation.y = m.rotationY;
                    }

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
            const res = toggleObjectSolidState(selectedWorldObject.id);
            if (res) {
                if (selectedWorldObject.data) {
                    selectedWorldObject.data.isSolid = res.isSolid;
                }
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

    // Toggle drawer de objetos en escena
    const toggleObjectsListBtn = hudContainer.querySelector('#godToggleObjectsListBtn');
    if (toggleObjectsListBtn) {
        toggleObjectsListBtn.onclick = () => {
            showObjectsListDrawer = !showObjectsListDrawer;
            renderHUDContent();
        };
    }

    // Botones de duplicación dentro del drawer
    hudContainer.querySelectorAll('.godDrawerDuplicateBtn').forEach(b => {
        b.onclick = async (e) => {
            e.stopPropagation();
            const objId = b.getAttribute('data-id');
            const cloned = await duplicateWorldObject(objId);
            if (cloned && cloned.mesh) {
                selectWorldObject(cloned);
                showDevToast(`📑 ¡"${cloned.data?.name || 'Objeto'}" duplicado! Se ha seleccionado la copia para que puedas moverla`);
                renderHUDContent();
            }
        };
    });

    // Clic en el nombre para seleccionar desde el drawer
    hudContainer.querySelectorAll('.godDrawerSelectObj').forEach(el => {
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

    // Botones de eliminación dentro del drawer
    hudContainer.querySelectorAll('.godDrawerDeleteBtn').forEach(b => {
        b.onclick = (e) => {
            e.stopPropagation();
            const objId = b.getAttribute('data-id');
            removePlacedObjectFromWorld(objId);
            if (selectedWorldObject?.id === objId) clearSelectionHelper();
            showDevToast('🗑️ Objeto eliminado del escenario');
            renderHUDContent();
        };
    });

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
    hudContainer.querySelectorAll('.godToolBtn').forEach(btn => {
        btn.onclick = () => {
            hudContainer.querySelectorAll('.godToolBtn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTool = btn.getAttribute('data-tool');
            if (currentTool !== 'select') clearSelectionHelper();
        };
    });

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

    // Escala Libre (Botones +/- sin límite forzado y campo numérico editable)
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

    // Pestañas de catálogo
    hudContainer.querySelectorAll('.godCatTabBtn').forEach(btn => {
        btn.onclick = () => {
            activeCatalogTab = btn.getAttribute('data-cattab');
            renderHUDContent();
        };
    });

    // Selección de ítem en la lista
    hudContainer.querySelectorAll('.godItemCard').forEach(btn => {
        btn.onclick = () => {
            hudContainer.querySelectorAll('.godItemCard').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const source = btn.getAttribute('data-source');
            const id = btn.getAttribute('data-id');
            const url = btn.getAttribute('data-url');
            const name = btn.querySelector('.godItemLabel')?.textContent || 'Objeto';
            const icon = btn.querySelector('.godItemIcon')?.textContent || '📦';

            if (source === 'custom') {
                const found = getCustomItemById(id);
                setSelectedItem({
                    source: 'custom',
                    sourceId: id,
                    name: found ? found.name : name,
                    icon: found ? found.icon : icon,
                    code: found ? found.code : null
                });
            } else if (source === 'system') {
                if (id === 'tree_1') {
                    setSelectedItem({ source: 'tree', sourceId: id, archetypeIndex: 0, name, icon });
                } else if (id === 'tree_2') {
                    setSelectedItem({ source: 'tree', sourceId: id, archetypeIndex: 1, name, icon });
                } else if (id === 'tree_3') {
                    setSelectedItem({ source: 'tree', sourceId: id, archetypeIndex: 2, name, icon });
                } else if (id === 'rock_dodec') {
                    setSelectedItem({ source: 'rock', sourceId: id, geoType: 0, name, icon });
                } else if (id === 'rock_icosa') {
                    setSelectedItem({ source: 'rock', sourceId: id, geoType: 1, name, icon });
                } else {
                    setSelectedItem({ source: 'system', sourceId: id, name, icon });
                }
            } else if (source === 'glb') {
                setSelectedItem({ source: 'glb', sourceId: id, name, icon, url });
            }
        };
    });

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
                const modelUrl = serverRes.url;

                // 2. Registrar en catálogo local
                const newModelInfo = {
                    id: `uploaded_${Date.now()}`,
                    filename: file.name,
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    url: modelUrl,
                    uploadedAt: Date.now()
                };
                registerUploadedModel(newModelInfo);

                // 3. Cambiar a pestaña de subidos y seleccionar
                activeCatalogTab = 'customGlb';
                renderHUDContent();
                setSelectedItem({
                    source: 'glb',
                    sourceId: newModelInfo.id,
                    name: newModelInfo.name,
                    icon: '🎨',
                    url: modelUrl
                });

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

                activeCatalogTab = 'customGlb';
                renderHUDContent();
                setSelectedItem({
                    source: 'glb',
                    sourceId: localModelInfo.id,
                    name: localModelInfo.name,
                    icon: '🎨',
                    url: blobUrl
                });

                showDevToast(`✅ Modelo "${file.name}" cargado localmente con éxito`);
            }
        };
    }
}

function updateHUDActiveItemBadge() {
    if (!hudContainer || !selectedCatalogItem) return;
    hudContainer.querySelectorAll('.godItemCard').forEach(btn => {
        const id = btn.getAttribute('data-id');
        btn.classList.toggle('active', id === selectedCatalogItem.sourceId);
    });
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
}

function unbindGodModeEvents() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('contextmenu', onContextMenu);
}

function onKeyDown(e) {
    if (!isGodModeActive) return;

    // Ignorar si el usuario está escribiendo en cualquier campo de texto o elemento editable
    const targetTag = e.target?.tagName ? e.target.tagName.toUpperCase() : '';
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || Boolean(e.target?.isContentEditable)) return;

    // Atajo universal Ctrl+D / Cmd+D: Duplicar elemento seleccionado
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyD' || e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        e.stopPropagation();
        executeDuplicateSelectedObject();
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
                const undone = undoLastPlacedObject();
                if (undone) {
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
                if (btn) btn.innerHTML = isCollapsed ? '▴ Mostrar HUD' : '▾ Ocultar HUD';
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
                        commitSelectedObjectMove(currentGroundHit);
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
            break;
        case 'Escape':
            if (isGrabModeActive || isDraggingSelectedObject) {
                e.preventDefault();
                if (dragInitialPos) {
                    revertSelectedObjectPosition(dragInitialPos);
                    showDevToast('↩️ Movimiento cancelado');
                }
                isGrabModeActive = false;
                isDraggingSelectedObject = false;
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

    // Si el clic fue dentro de la barra HUD o del panel de guía de controles, no interactuar con el mundo 3D
    if (hudContainer && hudContainer.contains(e.target)) return;
    if (controlsGuidePanel && controlsGuidePanel.contains(e.target)) return;

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
                commitSelectedObjectMove(currentGroundHit);
                showDevToast(`📍 "${selectedWorldObject.data?.name || 'Objeto'}" fijado en (${currentGroundHit.x.toFixed(1)}, ${currentGroundHit.z.toFixed(1)})`);
            }
            isGrabModeActive = false;
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
                commitSelectedObjectMove(currentGroundHit);
                showDevToast(`📍 "${selectedWorldObject.data?.name || 'Objeto'}" movido a (${currentGroundHit.x.toFixed(1)}, ${currentGroundHit.z.toFixed(1)})`);
            }
            isDraggingSelectedObject = false;
            hasMovedSignificantly = false;
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

    const itemDesc = { ...selectedCatalogItem };
    const pos = { x: currentGroundHit.x, z: currentGroundHit.z };

    const placed = await placeObjectInWorld(itemDesc, pos, currentRotationY, currentScale);
    if (placed) {
        hasUnsavedChanges = true;
        pendingChangesCount++;
        showDevToast(`✅ Plantado "${placed.record.name}" en (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`);

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

    // 4. Mueble
    try {
        const mueble = getMuebleObject();
        if (mueble && mueble.visible !== false) candidates.push(mueble);
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

    // 1. ¿Es una malla instanciada (Árbol o Roca)?
    if (hitObj.isInstancedMesh && typeof hit.instanceId === 'number' && hit.instanceId >= 0) {
        const isTree = Boolean(hitObj.userData?.isTree || hitObj.userData?.type === 'tree');
        const isRock = Boolean(hitObj.userData?.isRock || hitObj.userData?.type === 'rock');
        const type = isTree ? 'tree' : (isRock ? 'rock' : 'instanced');

        const matrix = new THREE.Matrix4();
        hitObj.getMatrixAt(hit.instanceId, matrix);

        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        matrix.decompose(pos, quat, scale);

        const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
        const name = isTree 
            ? (hitObj.userData?.name || `Árbol #${hit.instanceId + 1}`)
            : (hitObj.userData?.name || `Roca #${hit.instanceId + 1}`);
        const icon = isTree ? '🌲' : '🪨';

        selectWorldObject({
            type,
            category: 'instanced',
            instancedMesh: hitObj,
            pairMesh: hitObj.userData?.pairMesh,
            instanceId: hit.instanceId,
            matrix,
            initialPos: pos.clone(),
            data: {
                name,
                icon,
                position: { x: pos.x, y: pos.y, z: pos.z },
                rotationY: euler.y,
                scale: scale.x
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
            selectWorldObject({
                type: 'player',
                mesh: runtimeState.player,
                data: {
                    name: 'Robot Player (Jugador)',
                    icon: '🤖',
                    position: runtimeState.player.position,
                    rotationY: runtimeState.player.rotation.y,
                    scale: runtimeState.player.scale.x / 1.4
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
                selectWorldObject({
                    type: 'npc',
                    mesh: npcMesh,
                    data: {
                        name: `NPC ${npcItem.name}`,
                        icon: npcItem.icon,
                        position: npcMesh.position,
                        rotationY: npcMesh.rotation.y,
                        scale: npcMesh.scale.x
                    }
                });
                return;
            }
        }
    }

    // 4. ¿Es el Mueble / Mobiliario?
    const mueble = getMuebleObject();
    if (mueble) {
        let curr = hitObj;
        let isMuebleHit = false;
        while (curr) {
            if (curr === mueble || curr.userData?.isFurniture || curr.userData?.type === 'mueble') {
                isMuebleHit = true;
                break;
            }
            curr = curr.parent;
        }
        if (isMuebleHit) {
            selectWorldObject({
                type: 'furniture',
                mesh: mueble,
                data: {
                    name: mueble.userData?.displayName || 'Mueble con Cajón Secreto',
                    icon: '🪑',
                    position: mueble.position,
                    rotationY: mueble.rotation.y,
                    scale: mueble.scale.x
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
        if (m) return { x: m.position.x, y: m.position.y, z: m.position.z };
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
function applyLiveMoveToSelectedObject(targetPos) {
    if (!selectedWorldObject || !targetPos) return;

    if (selectedWorldObject.type === 'custom') {
        if (selectedWorldObject.mesh) {
            snapObjectToTerrain(selectedWorldObject.mesh, targetPos.x, targetPos.z);
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
    } else if (selectedWorldObject.type === 'furniture' || selectedWorldObject.type === 'generic') {
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

/**
 * Promociona un árbol o roca instanciado (Opción A) a un objeto 3D individual
 * independiente gestionado por worldObjectsManager.
 * Oculta la instancia procedural original permanentemente en worldLayoutSystem
 * y crea un objeto idéntico con colisión física, manipulación total y persistencia.
 */
async function detachInstancedObjectToCustom(instObj) {
    if (!instObj || instObj.category !== 'instanced') return instObj;

    const isTree = instObj.type === 'tree';
    const isRock = instObj.type === 'rock';
    const instMesh = instObj.instancedMesh;
    const pairMesh = instObj.pairMesh;
    const instanceId = instObj.instanceId;

    if (!instMesh) return instObj;

    // 1. Extraer datos y colores originales
    const instances = instMesh.userData?.instances || [];
    const instData = instances[instanceId] || {};
    const archIdx = instMesh.userData?.archetypeIndex ?? (instData.archIdx || 0);
    const geoType = instMesh.userData?.geoType ?? (instData.geoType || 0);

    const origPos = instObj.initialPos || { x: instData.x || 0, z: instData.z || 0 };

    // 2. Ocultar la instancia procedural original en la GPU
    deleteInstancedObject(instMesh, pairMesh, instanceId);

    // Retirar colisión física procedural de collidables
    if (instData.colRef) {
        const colIdx = collidables.indexOf(instData.colRef);
        if (colIdx >= 0) collidables.splice(colIdx, 1);
    }

    // 3. Registrar como oculto permanentemente en worldLayoutSystem
    hideProceduralInstance(isTree ? 'trees' : 'rocks', {
        archIdx,
        geoType,
        instanceIdx: instanceId,
        x: origPos.x,
        z: origPos.z
    });

    // 4. Obtener matriz y transformación actual
    const currentMat = new THREE.Matrix4();
    instMesh.getMatrixAt(instanceId, currentMat);

    const sourceMat = (instObj.matrix && instObj.matrix.elements && instObj.matrix.elements[0] !== 0) ? instObj.matrix : currentMat;
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    sourceMat.decompose(pos, quat, scaleVec);

    const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
    const finalRotY = currentRotationY !== 0 ? currentRotationY : euler.y;
    const finalScale = currentScale !== 1.0 ? currentScale : (scaleVec.x > 0.05 ? scaleVec.x : (instData.scale || 1.0));

    // 5. Extraer colores
    let trunkHex = 0x5a3e28;
    let leafHex = 0x2e6f40;
    if (instData.trunkColor) {
        trunkHex = instData.trunkColor.getHex ? instData.trunkColor.getHex() : instData.trunkColor;
    } else if (instMesh.getColorAt) {
        const cTrunk = new THREE.Color();
        instMesh.getColorAt(instanceId, cTrunk);
        if (cTrunk.r !== 1 || cTrunk.g !== 1 || cTrunk.b !== 1) trunkHex = cTrunk.getHex();
    }
    if (instData.leafColor) {
        leafHex = instData.leafColor.getHex ? instData.leafColor.getHex() : instData.leafColor;
    } else if (pairMesh && pairMesh.getColorAt) {
        const cLeaf = new THREE.Color();
        pairMesh.getColorAt(instanceId, cLeaf);
        if (cLeaf.r !== 1 || cLeaf.g !== 1 || cLeaf.b !== 1) leafHex = cLeaf.getHex();
    }

    const itemDesc = {
        name: isTree ? `Árbol (Arquetipo ${archIdx + 1})` : `Roca (${geoType === 1 || geoType === 'icosaedro' ? 'Icosaédrica' : 'Dodecaédrica'})`,
        icon: isTree ? '🌲' : '🪨',
        source: isTree ? 'tree' : 'rock',
        archetypeIndex: archIdx,
        geoType: geoType,
        trunkColor: trunkHex,
        leafColor: leafHex,
        rockColor: 0x666666,
        isSolid: true
    };

    const origGroundY = getHeightAt(origPos.x, origPos.z);
    const origRelativeOffset = isRock ? 0 : (isTree ? -0.35 : (pos.y - origGroundY));

    const placedEntry = await placeObjectInWorld(
        itemDesc,
        { x: targetPos.x, y: targetPos.y, z: targetPos.z },
        finalRotY,
        finalScale,
        true
    );

    if (placedEntry && placedEntry.mesh) {
        placedEntry.mesh.userData.relativeGroundOffset = origRelativeOffset;
        if (placedEntry.record) placedEntry.record.relativeGroundOffset = origRelativeOffset;
        snapObjectToTerrain(placedEntry.mesh, targetPos.x, targetPos.z, origRelativeOffset);

        const newSelected = {
            ...placedEntry,
            type: 'custom'
        };
        selectWorldObject(newSelected);
        showDevToast(`✨ ${itemDesc.name} independizado (altura natural conservada)`);
        return newSelected;
    }

    return instObj;
}

/**
 * Consolida la posición final del objeto: actualiza chunks, colisiones y memoria staged.
 * No persiste en disco ni LocalStorage hasta que el usuario pulse 'Guardar y Hornear Escenario'.
 */
function commitSelectedObjectMove(targetPos) {
    if (!selectedWorldObject || !targetPos) return;

    if (selectedWorldObject.type === 'custom') {
        updatePlacedObjectTransform(selectedWorldObject.id, { x: targetPos.x, z: targetPos.z }, false);
        if (selectedWorldObject.data?.position) {
            selectedWorldObject.data.position.x = targetPos.x;
            selectedWorldObject.data.position.z = targetPos.z;
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
        }
    } else if (selectedWorldObject.type === 'furniture' || selectedWorldObject.type === 'generic') {
        if (selectedWorldObject.mesh) {
            snapObjectToTerrain(selectedWorldObject.mesh, targetPos.x, targetPos.z);
            updateEntityTransform('furniture', 'mueble', { x: targetPos.x, z: targetPos.z }, false);
        }
    } else if (selectedWorldObject.category === 'instanced') {
        const instToDetach = selectedWorldObject;
        detachInstancedObjectToCustom(instToDetach).then(newCustom => {
            if (newCustom && newCustom.mesh && targetPos) {
                snapObjectToTerrain(newCustom.mesh, targetPos.x, targetPos.z);
                updatePlacedObjectTransform(newCustom.id, { x: targetPos.x, z: targetPos.z }, false);
            }
        });
    }

    hasUnsavedChanges = true;
    pendingChangesCount++;

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
    applyLiveMoveToSelectedObject(origPos);
    commitSelectedObjectMove(origPos);
}

function selectWorldObject(objEntry) {
    selectedWorldObject = objEntry;

    // Crear caja visual de selección
    if (selectionBoxHelper) {
        scene.remove(selectionBoxHelper);
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
            selectionBoxHelper = new THREE.BoxHelper(objEntry.mesh, color);
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
    currentScale = objEntry.data?.scale || 1.0;

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
    if (selectionBoxHelper) {
        scene.remove(selectionBoxHelper);
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
                updateEntityTransform('npcs', npcName, { rotationY: currentRotationY }, false);
            }
        }
    } else if (selectedWorldObject.type === 'furniture' || selectedWorldObject.type === 'generic') {
        if (selectedWorldObject.mesh) {
            selectedWorldObject.mesh.rotation.y = currentRotationY;
            updateEntityTransform('furniture', 'mueble', { rotationY: currentRotationY }, false);
        }
    } else if (selectedWorldObject.category === 'instanced') {
        const instToDetach = selectedWorldObject;
        detachInstancedObjectToCustom(instToDetach).then(newCustom => {
            if (newCustom) {
                updatePlacedObjectTransform(newCustom.id, { rotationY: currentRotationY }, false);
            }
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
    currentScale = Math.max(0.01, newScale);
    const sVal = document.getElementById('godScaleVal');
    if (sVal) sVal.textContent = `${currentScale.toFixed(2)}x`;
    const scaleInput = document.getElementById('godScaleInput');
    if (scaleInput && document.activeElement !== scaleInput) {
        scaleInput.value = parseFloat(currentScale.toFixed(2)).toString();
    }

    if (!selectedWorldObject) {
        updateGhostTransform();
        return;
    }

    if (selectedWorldObject.type === 'custom') {
        updatePlacedObjectTransform(selectedWorldObject.id, { scale: currentScale }, false);
    } else if (selectedWorldObject.type === 'player') {
        if (runtimeState.player) {
            runtimeState.player.scale.set(currentScale * 1.4, currentScale * 1.4, currentScale * 1.4);
        }
    } else if (selectedWorldObject.type === 'npc') {
        if (selectedWorldObject.mesh) {
            selectedWorldObject.mesh.scale.setScalar(currentScale);
            const npcName = (selectedWorldObject.data?.name || selectedWorldObject.mesh.userData?.npcName || '').replace(/^NPC\s+/i, '').trim();
            if (npcName) {
                updateEntityTransform('npcs', npcName, { scale: currentScale }, false);
            }
        }
    } else if (selectedWorldObject.type === 'furniture' || selectedWorldObject.type === 'generic') {
        if (selectedWorldObject.mesh) {
            selectedWorldObject.mesh.scale.setScalar(currentScale);
            updateEntityTransform('furniture', 'mueble', { scale: currentScale }, false);
        }
    } else if (selectedWorldObject.category === 'instanced') {
        const instToDetach = selectedWorldObject;
        detachInstancedObjectToCustom(instToDetach).then(newCustom => {
            if (newCustom) {
                updatePlacedObjectTransform(newCustom.id, { scale: currentScale }, false);
            }
        });
    }

    hasUnsavedChanges = true;
    pendingChangesCount++;

    if (selectionBoxHelper && typeof selectionBoxHelper.update === 'function') {
        selectionBoxHelper.update();
    }
    updateGhostTransform();
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
        const newCustom = await detachInstancedObjectToCustom(instToDetach);
        if (newCustom && newCustom.mesh) {
            snapObjectToTerrain(newCustom.mesh, targetPos.x, targetPos.z);
            updatePlacedObjectTransform(newCustom.id, { x: targetPos.x, z: targetPos.z });
        }
    } else {
        applyLiveMoveToSelectedObject(targetPos);
        commitSelectedObjectMove(targetPos);
    }
    showDevToast(`📍 "${selectedWorldObject.data?.name || 'Objeto'}" trasladado a (${targetPos.x.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
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

    const cloned = await duplicateWorldObject(targetId);
    if (cloned && cloned.mesh) {
        selectWorldObject(cloned);
        showDevToast(`📑 ¡"${cloned.data?.name || 'Objeto'}" duplicado! Se ha seleccionado la copia para moverla`);
        renderHUDContent();
    } else {
        showDevToast('❌ Error al duplicar el objeto');
    }
}

/**
 * Abre el panel modal para configurar el comportamiento lógico,
 * nombre, interacción y eventos del objeto seleccionado en Modo Dios.
 */
function openObjectLogicModal(targetEntry) {
    if (!targetEntry || !targetEntry.id) return;
    const existing = document.getElementById('godObjectLogicModalOverlay');
    if (existing) existing.remove();

    const data = targetEntry.data || {};
    const currentName = data.name || 'Elemento 3D';
    const currentSolid = data.isSolid !== false;
    const currentLogicType = data.logicType || 'default';
    const logicConfig = data.logicConfig || {};

    const overlay = document.createElement('div');
    overlay.id = 'godObjectLogicModalOverlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 9999999;
        background: rgba(5, 10, 8, 0.85);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    lockInput('objectLogicModal');

    // Aislar eventos para que escribir en los campos de la ventana no afecte al juego
    ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(evt => {
        overlay.addEventListener(evt, (e) => e.stopPropagation());
    });
    ['keydown', 'keyup', 'keypress'].forEach(evt => {
        overlay.addEventListener(evt, (e) => {
            if (e.key === 'Escape') {
                close();
                return;
            }
            e.stopPropagation();
        });
    });

    overlay.innerHTML = `
        <div style="
            background: linear-gradient(145deg, #131f18 0%, #0a110d 100%);
            border: 1.5px solid rgba(212, 175, 55, 0.55);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85), 0 0 24px rgba(212, 175, 55, 0.2);
            border-radius: 14px;
            width: 100%;
            max-width: 490px;
            color: #fff8e7;
            padding: 20px 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            box-sizing: border-box;
        ">
            <!-- CABECERA -->
            <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(212,175,55,0.25);padding-bottom:10px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:1.3rem;">⚙️</span>
                    <div>
                        <div style="font-size:1.05rem;font-weight:800;color:#ffd54f;">Configuración Lógica</div>
                        <div style="font-size:0.72rem;color:#94a3b8;">ID: ${escapeHtml(targetEntry.id)}</div>
                    </div>
                </div>
                <button id="godLogicCloseBtn" style="background:transparent;border:none;color:#94a3b8;font-size:1.2rem;cursor:pointer;padding:4px 8px;">✕</button>
            </div>

            <!-- FORMULARIO -->
            <div style="display:flex;flex-direction:column;gap:12px;font-size:0.82rem;">
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
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px;">
                    <input type="checkbox" id="godLogicSolidCheck" ${currentSolid ? 'checked' : ''} style="cursor:pointer;accent-color:#ffd54f;width:16px;height:16px;" />
                    <span><strong>🧱 Física Sólida:</strong> El jugador y la cámara colisionan con este objeto</span>
                </label>
            </div>

            <!-- BOTONES DE ACCIÓN -->
            <div style="display:flex;justify-content:flex-end;gap:10px;border-top:1px solid rgba(212,175,55,0.2);padding-top:12px;margin-top:4px;">
                <button id="godLogicCancelBtn" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#cbd5e1;border-radius:6px;padding:7px 16px;cursor:pointer;font-size:0.8rem;font-weight:700;">
                    Cancelar
                </button>
                <button id="godLogicSaveBtn" style="background:#059669;border:1px solid #10b981;color:#fff;border-radius:6px;padding:7px 18px;cursor:pointer;font-size:0.82rem;font-weight:800;box-shadow:0 4px 12px rgba(5,150,105,0.4);">
                    💾 Guardar Lógica
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const typeSelect = overlay.querySelector('#godLogicTypeSelect');
    const dynamicFields = overlay.querySelector('#godLogicDynamicFields');

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
    typeSelect.onchange = () => renderDynamicFields(typeSelect.value);

    const close = () => {
        unlockInput('objectLogicModal');
        overlay.remove();
    };
    overlay.querySelector('#godLogicCloseBtn').onclick = close;
    overlay.querySelector('#godLogicCancelBtn').onclick = close;

    overlay.querySelector('#godLogicSaveBtn').onclick = () => {
        const newName = overlay.querySelector('#godLogicNameInput').value.trim() || currentName;
        const newType = typeSelect.value;
        const newSolid = overlay.querySelector('#godLogicSolidCheck').checked;
        const newConfig = {};

        if (newType === 'dialogue') {
            newConfig.dialogueText = overlay.querySelector('#godLogicText')?.value || '';
            newConfig.promptText = overlay.querySelector('#godLogicPrompt')?.value || 'Examinar';
        } else if (newType === 'locked_door') {
            newConfig.requiredItem = overlay.querySelector('#godLogicKeyItem')?.value || 'key';
            newConfig.lockedMessage = overlay.querySelector('#godLogicLockedMsg')?.value || '';
            newConfig.unlockedMessage = overlay.querySelector('#godLogicUnlockMsg')?.value || '';
        } else if (newType === 'mission_trigger') {
            newConfig.missionId = overlay.querySelector('#godLogicMissionId')?.value || '';
            newConfig.missionMessage = overlay.querySelector('#godLogicMissionMsg')?.value || '';
        } else if (newType === 'custom_event') {
            newConfig.eventName = overlay.querySelector('#godLogicEventName')?.value || '';
            newConfig.eventParam = overlay.querySelector('#godLogicEventParam')?.value || '';
        }

        updateWorldObjectLogic(targetEntry.id, {
            name: newName,
            logicType: newType,
            logicConfig: newConfig,
            isSolid: newSolid
        });

        if (targetEntry.data) {
            targetEntry.data.name = newName;
            targetEntry.data.logicType = newType;
            targetEntry.data.logicConfig = newConfig;
            targetEntry.data.isSolid = newSolid;
        }

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
        removePlacedObjectFromWorld(selectedWorldObject.id);
        clearSelectionHelper();
        showDevToast('🗑️ Objeto eliminado del escenario');
        renderHUDContent();
    } else if (selectedWorldObject.type === 'tree') {
        const instMesh = selectedWorldObject.instancedMesh;
        const pairMesh = selectedWorldObject.pairMesh;
        const instanceId = selectedWorldObject.instanceId;
        const instances = instMesh?.userData?.instances || [];
        const instData = instances[instanceId] || {};
        const origPos = selectedWorldObject.initialPos || { x: instData.x || 0, z: instData.z || 0 };

        deleteInstancedObject(instMesh, pairMesh, instanceId);

        if (instData.colRef) {
            const colIdx = collidables.indexOf(instData.colRef);
            if (colIdx >= 0) collidables.splice(colIdx, 1);
        }

        hideProceduralInstance('trees', {
            archIdx: instMesh?.userData?.archetypeIndex ?? 0,
            instanceIdx: instanceId,
            x: origPos.x,
            z: origPos.z
        });

        clearSelectionHelper();
        showDevToast('🪓 Árbol talado y eliminado de forma permanente');
        renderHUDContent();
    } else if (selectedWorldObject.type === 'rock') {
        const instMesh = selectedWorldObject.instancedMesh;
        const instanceId = selectedWorldObject.instanceId;
        const instances = instMesh?.userData?.instances || [];
        const instData = instances[instanceId] || {};
        const origPos = selectedWorldObject.initialPos || { x: instData.x || 0, z: instData.z || 0 };

        deleteInstancedObject(instMesh, null, instanceId);

        if (instData.colRef) {
            const colIdx = collidables.indexOf(instData.colRef);
            if (colIdx >= 0) collidables.splice(colIdx, 1);
        }

        hideProceduralInstance('rocks', {
            geoType: instMesh?.userData?.geoType ?? 0,
            instanceIdx: instanceId,
            x: origPos.x,
            z: origPos.z
        });

        clearSelectionHelper();
        showDevToast('🔨 Roca destruida y retirada de forma permanente');
        renderHUDContent();
    } else if (selectedWorldObject.type === 'npc') {
        showDevModalDialog({
            title: '👤 Ocultar NPC del Escenario',
            message: `¿Deseas ocultar a "${selectedWorldObject.data?.name || 'NPC'}" del escenario?`,
            confirmText: '🗑️ Ocultar NPC',
            cancelText: 'Cancelar',
            isDanger: true,
            onConfirm: () => {
                if (selectedWorldObject?.mesh) {
                    selectedWorldObject.mesh.visible = false;
                }
                clearSelectionHelper();
                showDevToast('🗑️ NPC ocultado del escenario');
                renderHUDContent();
            }
        });
    } else if (selectedWorldObject.type === 'furniture' || selectedWorldObject.type === 'generic') {
        showDevModalDialog({
            title: '🪑 Ocultar Elemento del Escenario',
            message: `¿Deseas ocultar "${selectedWorldObject.data?.name || 'Elemento'}" del escenario?`,
            confirmText: '🗑️ Ocultar',
            cancelText: 'Cancelar',
            isDanger: true,
            onConfirm: () => {
                if (selectedWorldObject?.mesh) {
                    selectedWorldObject.mesh.visible = false;
                }
                clearSelectionHelper();
                showDevToast('🗑️ Elemento ocultado del escenario');
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

    mat.compose(new THREE.Vector3(newPos.x, newPos.y, newPos.z), quat, sc);
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
