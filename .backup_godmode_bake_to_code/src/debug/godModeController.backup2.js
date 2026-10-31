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
    getSavedWorldObjects
} from '../systems/worldObjectsManager.js';
import { dismissPandaReminder } from '../ui/pandaReminder.js';
import { showDevToast, closeDevPanel, openDevPanel } from './devPanel.js';
import { showDevModalDialog } from './devModalDialog.js';
import { getPandaNPC } from '../entities/npc/pandaNPC.js';
import { getAltoNPC } from '../entities/npc/altoNPC.js';
import { getTelerinNPC } from '../entities/npc/telerinNPC.js';
import { getTeleronNPC } from '../entities/npc/teleronNPC.js';
import { getMuebleObject } from '../entities/objects/muebleObject.js';

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
export function exitGodMode() {
    if (!isGodModeActive) return;
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

    // 1. Actualizar posición de la cámara libre según teclas
    updateFlyCameraPosition(delta);

    // 2. Actualizar orientación de la cámara
    applyFlyCameraTransform();

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

    hudContainer.innerHTML = `
        <button id="godCollapseBtn" class="godCollapseBtn" title="Ocultar/Mostrar HUD (Tecla H)">▾ Ocultar HUD</button>
        <div class="godBarHeader">
            <div class="godBarTitle">
                <span class="godDotLive"></span>
                <span>🌍 MODO DIOS &bull; EDITOR DE MUNDO</span>
            </div>
            <div class="godBarActions">
                <button id="godGuideBtn" class="godPillBtn" style="background:rgba(212,175,55,0.18);border-color:rgba(212,175,55,0.5);color:#ffd54f;font-weight:700;" title="Ver controles y atajos de teclado (Tecla F1)">
                    ⌨️ Guía (F1)
                </button>
                <button id="godSpeedBtn" class="godPillBtn" title="Velocidad de Vuelo (1x, 2x, 4x)">
                    🚀 ${flyCam.speedFactor}x
                </button>
                <button id="godUndoBtn" class="godPillBtn" title="Deshacer último objeto colocado (Ctrl+Z)" ${activeMeshes.length === 0 ? 'style="opacity:0.5;cursor:not-allowed;"' : ''}>
                    ↶ Deshacer
                </button>
                <button id="godTeleportPlayerBtn" class="godActionBtn" style="background:#0284c7;" title="Traer al Player a la posición actual de la cámara">
                    📍 Traer Player
                </button>
                <button id="godSaveSceneBtn" class="godActionBtn" style="background:#15803d;" title="Guardar escenario y registrar nueva versión en historial">
                    💾 Guardar Versión
                </button>
                <button id="godRevertBtn" class="godActionBtn" style="background:#b45309;" title="Descartar cambios y restaurar a la versión anterior">
                    ↩️ Descartar
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
                    ${selectedWorldObject.type === 'custom' ? `
                        <button id="godToggleSolidBtn" class="godActionBtn" style="${selectedWorldObject.data?.isSolid !== false ? 'background:#059669;border-color:#10b981;' : 'background:#475569;border-color:#64748b;'}font-weight:700;" title="Alternar entre física sólida con colisión o elemento decorativo traspasable">
                            ${selectedWorldObject.data?.isSolid !== false ? '🧱 Sólido' : '👻 Traspasable'}
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

            <!-- CONTROLES DE TRANSFORMACIÓN RÁPIDA -->
            <div class="godTransformGroup">
                <div class="godMiniInputGroup">
                    <label>Rot (R/T):</label>
                    <button id="godRotPrevBtn" class="godMiniBtn" title="Girar -45° (Tecla T)">-45°</button>
                    <span id="godRotVal">${Math.round(THREE.MathUtils.radToDeg(currentRotationY))}°</span>
                    <button id="godRotNextBtn" class="godMiniBtn" title="Girar +45° (Tecla R)">+45°</button>
                </div>

                <div class="godMiniInputGroup">
                    <label>Escala:</label>
                    <button id="godScaleDownBtn" class="godMiniBtn" title="Reducir escala (-)">-</button>
                    <span id="godScaleVal">${currentScale.toFixed(1)}x</span>
                    <button id="godScaleUpBtn" class="godMiniBtn" title="Aumentar escala (+)">+</button>
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

        <!-- LISTA DESPLEGABLE DE OBJETOS EN ESCENARIO -->
        ${showObjectsListDrawer ? `
            <div class="godObjectsDrawer styledScrollbar" style="max-height:120px;overflow-y:auto;background:rgba(0,0,0,0.65);border:1px solid rgba(212,175,55,0.35);border-radius:8px;padding:6px;display:flex;flex-direction:column;gap:4px;">
                <div style="font-size:0.72rem;color:#ffd54f;font-weight:700;display:flex;justify-content:space-between;margin-bottom:2px;">
                    <span>Objetos Plantados en el Escenario (${activeMeshes.length}):</span>
                    <span style="color:#94a3b8;font-size:0.68rem;">Haz clic en 🗑️ para eliminar cualquier objeto</span>
                </div>
                ${activeMeshes.length === 0 ? '<div style="font-size:0.7rem;color:#94a3b8;padding:4px;">No hay ningún objeto colocado en el mapa aún.</div>' : ''}
                ${activeMeshes.map(m => `
                    <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.06);padding:4px 8px;border-radius:4px;font-size:0.73rem;">
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${m.data?.icon || '📦'} <strong>${escapeHtml(m.data?.name || 'Objeto')}</strong>
                            <span style="color:#94a3b8;font-size:0.68rem;margin-left:6px;">(X: ${m.data?.position?.x?.toFixed(1) || 0}, Z: ${m.data?.position?.z?.toFixed(1) || 0})</span>
                        </span>
                        <button class="godDrawerDeleteBtn" data-id="${m.id}" style="background:#b91c1c;border:none;color:#fff;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:0.7rem;font-weight:700;" title="Eliminar este objeto del mapa">
                            🗑️ Eliminar
                        </button>
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
            { id: 'card', name: 'Carnet Oficial', icon: '🪪' }
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
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">R / T</span><span style="color:#cbd5e1;">Rotar en giros ±45°</span>
                        <span style="background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);border-radius:3px;padding:1px 4px;font-family:monospace;font-size:0.65rem;">+ / -</span><span style="color:#cbd5e1;">Escalar tamaño</span>
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

    // Guardar Versión
    const saveBtn = hudContainer.querySelector('#godSaveSceneBtn');
    if (saveBtn) {
        saveBtn.onclick = () => {
            const ver = saveSceneVersion();
            showDevToast(`💾 Escenario guardado permanentemente (${ver.name})`);
            renderHUDContent();
        };
    }

    // Descartar Cambios
    const revertBtn = hudContainer.querySelector('#godRevertBtn');
    if (revertBtn) {
        revertBtn.onclick = () => {
            showDevModalDialog({
                title: '↩️ Descartar Cambios del Escenario',
                message: '¿Estás seguro de que deseas descartar los cambios no guardados y restaurar a la última versión guardada?',
                confirmText: '↩️ Sí, Descartar Cambios',
                cancelText: 'Cancelar',
                isDanger: true,
                onConfirm: async () => {
                    await revertToLastSavedState();
                    clearSelectionHelper();
                    showDevToast('↩️ Cambios descartados');
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

    // Rotación
    const rotPrev = hudContainer.querySelector('#godRotPrevBtn');
    const rotNext = hudContainer.querySelector('#godRotNextBtn');
    if (rotPrev && rotNext) {
        rotPrev.onclick = () => {
            applyRotationToSelected(currentRotationY - Math.PI / 4);
        };
        rotNext.onclick = () => {
            applyRotationToSelected(currentRotationY + Math.PI / 4);
        };
    }

    // Escala
    const scaleDown = hudContainer.querySelector('#godScaleDownBtn');
    const scaleUp = hudContainer.querySelector('#godScaleUpBtn');
    if (scaleDown && scaleUp) {
        scaleDown.onclick = () => {
            applyScaleToSelected(Math.max(0.2, currentScale - 0.2));
        };
        scaleUp.onclick = () => {
            applyScaleToSelected(Math.min(5.0, currentScale + 0.2));
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
                setSelectedItem({ source: 'system', sourceId: id, name, icon });
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

    // Ignorar si el usuario está escribiendo en un input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

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
        case 'KeyR':
            // Rotar +45°
            e.preventDefault();
            e.stopPropagation();
            applyRotationToSelected(currentRotationY + Math.PI / 4);
            showDevToast(`🔄 Rotación: ${Math.round(THREE.MathUtils.radToDeg(currentRotationY))}°`);
            break;
        case 'KeyT':
            // Rotar -45°
            e.preventDefault();
            e.stopPropagation();
            applyRotationToSelected(currentRotationY - Math.PI / 4);
            showDevToast(`🔄 Rotación: ${Math.round(THREE.MathUtils.radToDeg(currentRotationY))}°`);
            break;
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
        case 'NumpadAdd':
            // Escalar +
            applyScaleToSelected(Math.min(5.0, currentScale + 0.2));
            break;
        case 'Minus':
        case 'NumpadSubtract':
            // Escalar -
            applyScaleToSelected(Math.max(0.2, currentScale - 0.2));
            break;
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
            selectedWorldObject.mesh.position.set(targetPos.x, targetPos.y, targetPos.z);
        }
    } else if (selectedWorldObject.type === 'furniture' || selectedWorldObject.type === 'generic') {
        if (selectedWorldObject.mesh) {
            selectedWorldObject.mesh.position.set(targetPos.x, targetPos.y + 0.45, targetPos.z);
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
 * Consolida la posición final del objeto: actualiza chunks, colisiones y persistencia.
 */
function commitSelectedObjectMove(targetPos) {
    if (!selectedWorldObject || !targetPos) return;

    if (selectedWorldObject.type === 'custom') {
        updatePlacedObjectTransform(selectedWorldObject.id, { x: targetPos.x, z: targetPos.z });
        if (selectedWorldObject.data?.position) {
            selectedWorldObject.data.position.x = targetPos.x;
            selectedWorldObject.data.position.z = targetPos.z;
        }
    } else if (selectedWorldObject.type === 'player') {
        if (runtimeState.player) {
            const offset = runtimeState.playerHeightOffset || 0;
            runtimeState.player.position.set(targetPos.x, targetPos.y + offset, targetPos.z);
        }
    } else if (selectedWorldObject.type === 'npc') {
        if (selectedWorldObject.mesh) {
            selectedWorldObject.mesh.position.set(targetPos.x, targetPos.y, targetPos.z);
        }
    } else if (selectedWorldObject.type === 'furniture' || selectedWorldObject.type === 'generic') {
        if (selectedWorldObject.mesh) {
            selectedWorldObject.mesh.position.set(targetPos.x, targetPos.y + 0.45, targetPos.z);
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
    } else {
        const color = objEntry.type === 'player' ? 0x38bdf8 :
                      objEntry.type === 'npc' ? 0x10b981 :
                      objEntry.type === 'furniture' ? 0xa855f7 : 0xf59e0b;
        selectionBoxHelper = new THREE.BoxHelper(objEntry.mesh, color);
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
    const rotVal = document.getElementById('godRotVal');
    if (rotVal) rotVal.textContent = `${Math.round(THREE.MathUtils.radToDeg(currentRotationY))}°`;

    if (!selectedWorldObject) {
        updateGhostTransform();
        return;
    }

    if (selectedWorldObject.type === 'custom') {
        updatePlacedObjectTransform(selectedWorldObject.id, { rotationY: currentRotationY });
    } else if (selectedWorldObject.type === 'player') {
        if (runtimeState.player) {
            runtimeState.player.rotation.y = currentRotationY;
        }
    } else if (selectedWorldObject.type === 'npc' || selectedWorldObject.type === 'furniture' || selectedWorldObject.type === 'generic') {
        if (selectedWorldObject.mesh) {
            selectedWorldObject.mesh.rotation.y = currentRotationY;
        }
    } else if (selectedWorldObject.category === 'instanced') {
        updateInstancedObjectTransform(
            selectedWorldObject.instancedMesh,
            selectedWorldObject.pairMesh,
            selectedWorldObject.instanceId,
            currentRotationY,
            null
        );
    }

    if (selectionBoxHelper && typeof selectionBoxHelper.update === 'function') {
        selectionBoxHelper.update();
    }
    updateGhostTransform();
}

function applyScaleToSelected(newScale) {
    currentScale = newScale;
    const sVal = document.getElementById('godScaleVal');
    if (sVal) sVal.textContent = `${currentScale.toFixed(1)}x`;

    if (!selectedWorldObject) {
        updateGhostTransform();
        return;
    }

    if (selectedWorldObject.type === 'custom') {
        updatePlacedObjectTransform(selectedWorldObject.id, { scale: currentScale });
    } else if (selectedWorldObject.type === 'player') {
        if (runtimeState.player) {
            runtimeState.player.scale.set(currentScale * 1.4, currentScale * 1.4, currentScale * 1.4);
        }
    } else if (selectedWorldObject.type === 'npc' || selectedWorldObject.type === 'furniture' || selectedWorldObject.type === 'generic') {
        if (selectedWorldObject.mesh) {
            selectedWorldObject.mesh.scale.setScalar(currentScale);
        }
    } else if (selectedWorldObject.category === 'instanced') {
        updateInstancedObjectTransform(
            selectedWorldObject.instancedMesh,
            selectedWorldObject.pairMesh,
            selectedWorldObject.instanceId,
            null,
            currentScale
        );
    }

    if (selectionBoxHelper && typeof selectionBoxHelper.update === 'function') {
        selectionBoxHelper.update();
    }
    updateGhostTransform();
}

function executeMoveSelectedToCursor() {
    if (!selectedWorldObject || !hasValidGroundHit) {
        showDevToast('⚠️ Apunta con el ratón al terreno para mover el elemento');
        return;
    }

    const targetPos = { x: currentGroundHit.x, y: currentGroundHit.y, z: currentGroundHit.z };
    applyLiveMoveToSelectedObject(targetPos);
    commitSelectedObjectMove(targetPos);
    showDevToast(`📍 "${selectedWorldObject.data?.name || 'Objeto'}" trasladado a (${targetPos.x.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
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
        deleteInstancedObject(
            selectedWorldObject.instancedMesh,
            selectedWorldObject.pairMesh,
            selectedWorldObject.instanceId
        );
        clearSelectionHelper();
        showDevToast('🪓 Árbol talado y eliminado del mapa');
        renderHUDContent();
    } else if (selectedWorldObject.type === 'rock') {
        deleteInstancedObject(
            selectedWorldObject.instancedMesh,
            null,
            selectedWorldObject.instanceId
        );
        clearSelectionHelper();
        showDevToast('🔨 Roca destruida y retirada del mapa');
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
