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

    // Remover HUD flotante
    if (hudContainer && hudContainer.parentNode) {
        hudContainer.parentNode.removeChild(hudContainer);
        hudContainer = null;
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
    if (placementCursor) {
        placementCursor.visible = (currentTool === 'place' && hasValidGroundHit);
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
        selectionBoxHelper.update();
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
                <button class="godToolBtn ${currentTool === 'select' ? 'active' : ''}" data-tool="select" title="Seleccionar y transformar un objeto ya colocado">
                    ✋ Seleccionar
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

            <!-- BOTÓN DIRECTO DE ELIMINAR OBJETO SELECCIONADO -->
            ${selectedWorldObject ? `
                <button id="godDeleteSelectedBtn" class="godActionBtn" style="background:#b91c1c;border-color:#ef4444;font-weight:800;" title="Eliminar inmediatamente este objeto del mapa">
                    🗑️ Eliminar: ${escapeHtml(selectedWorldObject.data?.name || 'Objeto')}
                </button>
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
            <span>🖱️ <b>Arrastrar Clic Der:</b> Girar Cámara &bull; <b>Clic Izq:</b> Colocar &bull; <b>Flechas/WASD:</b> Volar &bull; <b>Q/E:</b> Bajar/Subir &bull; <b>R/T:</b> Rotar &bull; <b>Ctrl+Z:</b> Deshacer</span>
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
        revertBtn.onclick = async () => {
            if (confirm('¿Descartar los cambios no guardados y restaurar a la versión anterior?')) {
                await revertToLastSavedState();
                clearSelectionHelper();
                showDevToast('↩️ Cambios descartados');
                renderHUDContent();
            }
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

    // Eliminar objeto seleccionado
    const deleteSelectedBtn = hudContainer.querySelector('#godDeleteSelectedBtn');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.onclick = () => {
            if (selectedWorldObject) {
                removePlacedObjectFromWorld(selectedWorldObject.id);
                clearSelectionHelper();
                showDevToast('🗑️ Objeto eliminado del escenario');
                renderHUDContent();
            }
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

    // Selector de herramienta (Colocar / Seleccionar)
    hudContainer.querySelectorAll('.godToolBtn').forEach(btn => {
        btn.onclick = () => {
            hudContainer.querySelectorAll('.godToolBtn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTool = btn.getAttribute('data-tool');
            if (currentTool !== 'select') clearSelectionHelper();
        };
    });

    // Rotación
    const rotVal = hudContainer.querySelector('#godRotVal');
    const rotPrev = hudContainer.querySelector('#godRotPrevBtn');
    const rotNext = hudContainer.querySelector('#godRotNextBtn');
    if (rotPrev && rotNext) {
        rotPrev.onclick = () => {
            currentRotationY -= Math.PI / 4;
            if (rotVal) rotVal.textContent = `${Math.round(THREE.MathUtils.radToDeg(currentRotationY))}°`;
            if (selectedWorldObject) {
                updatePlacedObjectTransform(selectedWorldObject.id, { rotationY: currentRotationY });
                if (selectionBoxHelper) selectionBoxHelper.update();
            }
            updateGhostTransform();
        };
        rotNext.onclick = () => {
            currentRotationY += Math.PI / 4;
            if (rotVal) rotVal.textContent = `${Math.round(THREE.MathUtils.radToDeg(currentRotationY))}°`;
            if (selectedWorldObject) {
                updatePlacedObjectTransform(selectedWorldObject.id, { rotationY: currentRotationY });
                if (selectionBoxHelper) selectionBoxHelper.update();
            }
            updateGhostTransform();
        };
    }

    // Escala
    const scaleVal = hudContainer.querySelector('#godScaleVal');
    const scaleDown = hudContainer.querySelector('#godScaleDownBtn');
    const scaleUp = hudContainer.querySelector('#godScaleUpBtn');
    if (scaleDown && scaleUp) {
        scaleDown.onclick = () => {
            currentScale = Math.max(0.2, currentScale - 0.2);
            if (scaleVal) scaleVal.textContent = `${currentScale.toFixed(1)}x`;
            if (selectedWorldObject) {
                updatePlacedObjectTransform(selectedWorldObject.id, { scale: currentScale });
                if (selectionBoxHelper) selectionBoxHelper.update();
            }
            updateGhostTransform();
        };
        scaleUp.onclick = () => {
            currentScale = Math.min(5.0, currentScale + 0.2);
            if (scaleVal) scaleVal.textContent = `${currentScale.toFixed(1)}x`;
            if (selectedWorldObject) {
                updatePlacedObjectTransform(selectedWorldObject.id, { scale: currentScale });
                if (selectionBoxHelper) selectionBoxHelper.update();
            }
            updateGhostTransform();
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
            currentRotationY += Math.PI / 4;
            const rotValR = document.getElementById('godRotVal');
            if (rotValR) rotValR.textContent = `${Math.round(THREE.MathUtils.radToDeg(currentRotationY))}°`;
            if (selectedWorldObject) {
                updatePlacedObjectTransform(selectedWorldObject.id, { rotationY: currentRotationY });
                if (selectionBoxHelper) selectionBoxHelper.update();
            }
            updateGhostTransform();
            showDevToast(`🔄 Rotación: ${Math.round(THREE.MathUtils.radToDeg(currentRotationY))}°`);
            break;
        case 'KeyT':
            // Rotar -45°
            e.preventDefault();
            e.stopPropagation();
            currentRotationY -= Math.PI / 4;
            const rotValT = document.getElementById('godRotVal');
            if (rotValT) rotValT.textContent = `${Math.round(THREE.MathUtils.radToDeg(currentRotationY))}°`;
            if (selectedWorldObject) {
                updatePlacedObjectTransform(selectedWorldObject.id, { rotationY: currentRotationY });
                if (selectionBoxHelper) selectionBoxHelper.update();
            }
            updateGhostTransform();
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
            currentScale = Math.min(5.0, currentScale + 0.2);
            const sValUp = document.getElementById('godScaleVal');
            if (sValUp) sValUp.textContent = `${currentScale.toFixed(1)}x`;
            if (selectedWorldObject) {
                updatePlacedObjectTransform(selectedWorldObject.id, { scale: currentScale });
                if (selectionBoxHelper) selectionBoxHelper.update();
            }
            updateGhostTransform();
            break;
        case 'Minus':
        case 'NumpadSubtract':
            // Escalar -
            currentScale = Math.max(0.2, currentScale - 0.2);
            const sValDown = document.getElementById('godScaleVal');
            if (sValDown) sValDown.textContent = `${currentScale.toFixed(1)}x`;
            if (selectedWorldObject) {
                updatePlacedObjectTransform(selectedWorldObject.id, { scale: currentScale });
                if (selectionBoxHelper) selectionBoxHelper.update();
            }
            updateGhostTransform();
            break;
        case 'Delete':
        case 'Backspace':
            if (selectedWorldObject) {
                removePlacedObjectFromWorld(selectedWorldObject.id);
                clearSelectionHelper();
                showDevToast('🗑️ Objeto eliminado del escenario');
                renderHUDContent();
            }
            break;
        case 'KeyH':
            if (hudContainer) {
                hudContainer.classList.toggle('collapsed');
                const isCollapsed = hudContainer.classList.contains('collapsed');
                const btn = hudContainer.querySelector('#godCollapseBtn');
                if (btn) btn.innerHTML = isCollapsed ? '▴ Mostrar HUD' : '▾ Ocultar HUD';
            }
            break;
        case 'Escape':
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

    // Si se está arrastrando con el ratón (clic derecho o clic con herramienta 'fly')
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
}

function onMouseDown(e) {
    if (!isGodModeActive) return;

    // Si el clic fue dentro de la barra HUD, no interactuar con el mundo 3D
    if (hudContainer && hudContainer.contains(e.target)) return;

    // Clic derecho siempre activa la rotación de cámara
    if (e.button === 2) {
        isMouseDown = true;
        mouseStartX = e.clientX;
        mouseStartY = e.clientY;
        return;
    }

    // Clic izquierdo: acción de colocación o selección
    if (e.button === 0) {
        if (currentTool === 'place') {
            if (!selectedCatalogItem) {
                // Modo Puntero Libre: si hace clic sobre un objeto existente, seleccionarlo para poder eliminarlo o editarlo
                const worldMeshes = getActiveWorldMeshes();
                if (worldMeshes.length > 0) {
                    raycaster.setFromCamera(mouseNDC, camera);
                    const meshRoots = worldMeshes.map(w => w.mesh);
                    const intersects = raycaster.intersectObjects(meshRoots, true);
                    if (intersects.length > 0) {
                        handleSelectObjectClick();
                        return;
                    }
                }
                showDevToast('💡 Puntero libre: Haz clic en un objeto del catálogo para colocarlo, o en un objeto del mapa para seleccionarlo');
                return;
            }
            handlePlaceObjectClick();
        } else if (currentTool === 'select') {
            handleSelectObjectClick();
        }
    }
}

function onMouseUp(e) {
    if (e.button === 2) {
        isMouseDown = false;
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
 * Selecciona un objeto existente en el mundo al hacer clic sobre él.
 */
function handleSelectObjectClick() {
    raycaster.setFromCamera(mouseNDC, camera);

    const worldMeshes = getActiveWorldMeshes();
    const meshRoots = worldMeshes.map(w => w.mesh);

    const intersects = raycaster.intersectObjects(meshRoots, true);
    if (intersects.length > 0) {
        // Encontrar el objeto raíz
        let hitMesh = intersects[0].object;
        while (hitMesh.parent && !worldMeshes.some(w => w.mesh === hitMesh)) {
            hitMesh = hitMesh.parent;
        }

        const found = worldMeshes.find(w => w.mesh === hitMesh);
        if (found) {
            selectWorldObject(found);
        }
    } else {
        clearSelectionHelper();
    }
}

function selectWorldObject(objEntry) {
    selectedWorldObject = objEntry;

    // Crear caja visual de selección
    if (selectionBoxHelper) {
        scene.remove(selectionBoxHelper);
        selectionBoxHelper = null;
    }
    selectionBoxHelper = new THREE.BoxHelper(objEntry.mesh, 0x38bdf8);
    scene.add(selectionBoxHelper);

    currentRotationY = objEntry.data.rotationY || 0;
    currentScale = objEntry.data.scale || 1.0;

    const rotVal = document.getElementById('godRotVal');
    if (rotVal) rotVal.textContent = `${Math.round(THREE.MathUtils.radToDeg(currentRotationY))}°`;
    const sVal = document.getElementById('godScaleVal');
    if (sVal) sVal.textContent = `${currentScale.toFixed(1)}x`;

    showDevToast(`Seleccionado: "${objEntry.data.name}". Usa el botón rojo 🗑️ o Supr para eliminar.`);
    renderHUDContent();
}

function clearSelectionHelper(rerender = true) {
    const hadSelection = !!selectedWorldObject || !!selectionBoxHelper;
    selectedWorldObject = null;
    if (selectionBoxHelper) {
        scene.remove(selectionBoxHelper);
        selectionBoxHelper = null;
    }
    if (rerender && hadSelection && hudContainer) {
        renderHUDContent();
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
