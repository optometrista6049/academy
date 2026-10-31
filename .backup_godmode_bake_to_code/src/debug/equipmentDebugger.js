/* ======================================================
   MONTESERIN ACADEMY - EQUIPMENT DEBUGGER & 3D VIEWPORT
   Visor 3D interactivo en tiempo real con rotación de cámara 360°
   para calibrar y probar acople de objetos al modelo del Player.
   - Encuadre de cuerpo entero amplio con zoom libre y centrado automático
   - Detección precisa de huesos (Palm2R, Palm2L, Torso_1)
   - Normalización de escala métrica 1:1 en sockets
   - Calibración de escala avanzada (Uniforme y por ejes X/Y/Z)
   - Reproducción de animación Idle o pose estática
   ====================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
    equipItem as equipInGameItem,
    unequipItem as unequipInGameItem,
    createProceduralItem,
    updateEquippedTransform as updateInGameTransform
} from '../player/playerEquipment.js';
import { getCustomItems, getCustomItemById, buildThreeMeshFromCode, updateCustomItemTransform } from '../systems/customItemStorage.js';
import { showDevToast } from './devPanel.js';

let previewScene = null;
let previewCamera = null;
let previewRenderer = null;
let previewControls = null;
let previewAnimationId = null;
let previewPlayerModel = null;
let previewMixer = null;
let previewIdleAction = null;
let previewIsAnimating = true;
let previewClock = new THREE.Clock();

let cachedRobotGLTF = null;
let currentSelectedItemId = 'flashlight';

let previewSockets = { rightHand: null, leftHand: null, back: null, head: null };
let previewEquipped = { rightHand: null, leftHand: null, back: null, head: null };
let resizeObserver = null;
let customItemsListener = null;

let currentSocket = 'rightHand';
let isUniformScale = true;
let currentTransform = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1.0,
    scaleAxes: { x: 1.0, y: 1.0, z: 1.0 }
};

export function cleanupEquipmentDebugger() {
    if (previewAnimationId) {
        cancelAnimationFrame(previewAnimationId);
        previewAnimationId = null;
    }
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    if (previewMixer) {
        previewMixer.stopAllAction();
        previewMixer = null;
    }
    if (previewControls) {
        previewControls.dispose();
        previewControls = null;
    }
    if (previewRenderer) {
        previewRenderer.dispose();
        previewRenderer = null;
    }
    if (customItemsListener) {
        window.removeEventListener('customItemsUpdated', customItemsListener);
        customItemsListener = null;
    }
    clearPreviewSockets();
    previewScene = null;
    previewCamera = null;
}

function clearPreviewSockets() {
    for (const key of Object.keys(previewSockets)) {
        const socket = previewSockets[key];
        if (socket && socket.parent) {
            socket.parent.remove(socket);
        }
    }
    previewSockets = { rightHand: null, leftHand: null, back: null, head: null };
    previewEquipped = { rightHand: null, leftHand: null, back: null, head: null };
}

export function renderEquipmentDebuggerTab(container) {
    container.innerHTML = `
        <div class="devEquipWrapper">
            <!-- COLUMNA IZQUIERDA: CONTROLES, SLIDERS Y CALIBRACIÓN -->
            <div class="devEquipLeft styledScrollbar">
                <!-- 1. SOCKETS -->
                <div class="devSectionTitle">1. Punto de Anclaje (Socket)</div>
                <div class="devButtonGroup">
                    <button class="devBtn socketBtn active" data-socket="rightHand">✋ Mano Derecha</button>
                    <button class="devBtn socketBtn" data-socket="leftHand">🤚 Mano Izquierda</button>
                    <button class="devBtn socketBtn" data-socket="back">🎒 Espalda</button>
                </div>

                <!-- 2. OBJETOS -->
                <div class="devSectionTitle" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;">
                    <span>2. Objeto 3D a Probar</span>
                    <button id="devGoToGenBtn" class="devSmallBtn" style="color:#d4af37;border-color:rgba(212,175,55,0.4);" title="Ir a la pestaña de Generador 3D con Three.js">
                        ✨ Crear con IA / Prompt
                    </button>
                </div>
                
                <div style="font-size:0.75rem;color:rgba(255,255,255,0.65);margin-bottom:4px;font-weight:600;">Objetos del Sistema:</div>
                <div class="devItemGrid" id="devSystemItemGrid">
                    <button class="devItemBtn" data-item="flashlight">🔦 Linterna</button>
                    <button class="devItemBtn" data-item="key">🔑 Llave Dorada</button>
                    <button class="devItemBtn" data-item="notebook">📓 Cuaderno</button>
                    <button class="devItemBtn" data-item="wrench">🔧 Llave Inglesa</button>
                    <button class="devItemBtn" data-item="card">🪪 Carnet Oficial</button>
                </div>

                <!-- BIBLIOTECA DE MODELOS GUARDADOS -->
                <div style="font-size:0.75rem;color:#d4af37;margin-top:10px;margin-bottom:4px;font-weight:700;display:flex;justify-content:space-between;align-items:center;">
                    <span>🌟 Biblioteca Guardada:</span>
                    <span id="devCustomItemsCountBadge" style="font-size:0.7rem;color:rgba(255,255,255,0.45);font-weight:normal;"></span>
                </div>
                <div class="devItemGrid" id="devCustomItemGrid">
                    <!-- Rellenado dinámicamente con los modelos de customItemStorage -->
                </div>

                <div style="margin-top:8px;display:flex;gap:8px;">
                    <label class="devFileBtn" style="padding:6px 10px;font-size:0.75rem;flex:1;">
                        📁 Cargar Archivo .GLB
                        <input type="file" id="devEquipGlbInput" accept=".glb, .gltf" style="display:none;" />
                    </label>
                    <button id="devUnequipBtn" class="devDangerBtn" style="padding:6px 12px;font-size:0.75rem;">
                        ❌ Desequipar
                    </button>
                </div>

                <!-- 3. CALIBRACIÓN EN TIEMPO REAL -->
                <div class="devSectionTitle" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;">
                    <span>3. Calibración en Tiempo Real</span>
                    <button id="devResetTransformBtn" class="devSmallBtn" title="Restablecer posición, rotación y escala a 0">
                        🔄 Restablecer
                    </button>
                </div>

                <div class="devSliders">
                    <!-- POSICIÓN -->
                    <div class="sliderSubHeader">📍 Posición Relativa (Metros)</div>
                    <div class="sliderGroup">
                        <label>X: <span id="valPosX">0.00</span>m</label>
                        <input type="range" id="sliderPosX" min="-0.8" max="0.8" step="0.01" value="0" />
                    </div>
                    <div class="sliderGroup">
                        <label>Y: <span id="valPosY">0.00</span>m</label>
                        <input type="range" id="sliderPosY" min="-0.8" max="0.8" step="0.01" value="0" />
                    </div>
                    <div class="sliderGroup">
                        <label>Z: <span id="valPosZ">0.00</span>m</label>
                        <input type="range" id="sliderPosZ" min="-0.8" max="0.8" step="0.01" value="0" />
                    </div>

                    <!-- ROTACIÓN -->
                    <div class="sliderSubHeader" style="margin-top:10px;">🔄 Rotación (Grados)</div>
                    <div class="sliderGroup">
                        <label>Rot X: <span id="valRotX">0</span>°</label>
                        <input type="range" id="sliderRotX" min="-180" max="180" step="5" value="0" />
                    </div>
                    <div class="sliderGroup">
                        <label>Rot Y: <span id="valRotY">0</span>°</label>
                        <input type="range" id="sliderRotY" min="-180" max="180" step="5" value="0" />
                    </div>
                    <div class="sliderGroup">
                        <label>Rot Z: <span id="valRotZ">0</span>°</label>
                        <input type="range" id="sliderRotZ" min="-180" max="180" step="5" value="0" />
                    </div>

                    <!-- ESCALADO DE MODELOS -->
                    <div class="sliderSubHeader" style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
                        <span>🔍 Escalado del Modelo</span>
                        <div class="scaleToggleWrap">
                            <label class="scaleToggleLabel">
                                <input type="checkbox" id="devUniformScaleCheck" checked />
                                <span id="devScaleModeText">Uniforme</span>
                            </label>
                        </div>
                    </div>

                    <!-- PREAJUSTES RÁPIDOS DE ESCALA -->
                    <div class="scalePresetRow">
                        <button class="scalePresetBtn" data-scale="0.5">0.5x</button>
                        <button class="scalePresetBtn" data-scale="0.8">0.8x</button>
                        <button class="scalePresetBtn activeScale" data-scale="1.0">1.0x (Normal)</button>
                        <button class="scalePresetBtn" data-scale="1.4">1.4x</button>
                        <button class="scalePresetBtn" data-scale="2.0">2.0x</button>
                        <button class="scalePresetBtn" data-scale="3.0">3.0x</button>
                    </div>

                    <!-- SLIDER UNIFORME -->
                    <div id="devUniformScaleContainer" class="sliderGroup" style="margin-top:6px;">
                        <label>Escala Proporcional: <span id="valScale">1.00</span>x (<span id="valScalePct">100%</span>)</label>
                        <input type="range" id="sliderScale" min="0.1" max="5.0" step="0.05" value="1.0" />
                    </div>

                    <!-- SLIDERS POR EJE (OPCIONALES) -->
                    <div id="devAxesScaleContainer" style="display:none;margin-top:6px;">
                        <div class="sliderGroup">
                            <label>Escala X (Ancho): <span id="valScaleX">1.00</span>x</label>
                            <input type="range" id="sliderScaleX" min="0.1" max="5.0" step="0.05" value="1.0" />
                        </div>
                        <div class="sliderGroup">
                            <label>Escala Y (Alto): <span id="valScaleY">1.00</span>x</label>
                            <input type="range" id="sliderScaleY" min="0.1" max="5.0" step="0.05" value="1.0" />
                        </div>
                        <div class="sliderGroup">
                            <label>Escala Z (Profundidad): <span id="valScaleZ">1.00</span>x</label>
                            <input type="range" id="sliderScaleZ" min="0.1" max="5.0" step="0.05" value="1.0" />
                        </div>
                    </div>
                </div>

                <!-- 4. ENFOQUES Y ZOOM DE CÁMARA -->
                <div class="devSectionTitle" style="margin-top:14px;">4. Enfoque y Zoom de Cámara</div>
                <div class="devCamPresetGroup">
                    <button id="camFullBodyBtn" class="devCamBtn activeCam" title="Centrar cámara y ver todo el personaje completo">👁️ Centrar Cámara</button>
                    <button id="camRightHandBtn" class="devCamBtn" title="Enfoque cercano en la mano derecha">✋ Mano Der.</button>
                    <button id="camLeftHandBtn" class="devCamBtn" title="Enfoque cercano en la mano izquierda">🤚 Mano Izq.</button>
                    <button id="camBackBtn" class="devCamBtn" title="Enfoque en la espalda">🎒 Espalda</button>
                </div>

                <!-- SLIDER DE ZOOM MANUAL DE CÁMARA -->
                <div class="sliderGroup" style="margin-top:8px;">
                    <label>Distancia Cámara (Zoom): <span id="valCamDist">3.8</span>m</label>
                    <input type="range" id="sliderCamDist" min="0.4" max="15.0" step="0.2" value="3.8" />
                </div>

                <!-- ANIMACIÓN POSE -->
                <div style="margin-top:10px;display:flex;gap:8px;">
                    <button id="devAnimToggleBtn" class="devSecondaryBtn" style="flex:1;">
                        ⏸️ Pausar Pose
                    </button>
                </div>

                <!-- GUARDAR CALIBRACIÓN DIRECTA (100% AUTOMÁTICO) -->
                <div class="devSaveCalibrationBox" style="margin-top:12px;display:flex;flex-direction:column;gap:6px;">
                    <button id="devSaveCalibrationBtn" class="devActionBtn" style="width:100%;background:#10b981;color:#0e1410;font-weight:700;" title="Guarda la posición, rotación y escala automáticamente dentro de este objeto">
                        💾 Guardar Calibración en este Objeto
                    </button>
                    <span id="devSaveCalibrationFeedback" class="devCopyMsg" style="color:#34d399;font-size:0.75rem;text-align:center;"></span>
                </div>

                <!-- EXPORTAR CÓDIGO (OPCIONAL) -->
                <div class="devCopyBox" style="margin-top:8px;">
                    <button id="devCopyTransformBtn" class="devSecondaryBtn" style="width:100%;font-size:0.78rem;" title="Copiar código JSON para desarrolladores">
                        📋 Copiar Configuración JS
                    </button>
                    <span id="devCopyFeedback" class="devCopyMsg"></span>
                </div>
            </div>

            <!-- COLUMNA DERECHA: VISOR 3D INTERACTIVO -->
            <div class="devEquipRight">
                <div class="devViewportFrame" id="devViewportFrame">
                    <!-- BARRA SUPERIOR DE HERRAMIENTAS DEL VISOR -->
                    <div class="devViewportTopBar">
                        <span class="devViewportHint">🖱️ Arrastra para girar 360° | Rueda o botones para Zoom</span>
                        <div class="devZoomQuickBtns">
                            <button id="quickZoomInBtn" class="devQuickZoomBtn" title="Acercar cámara">+</button>
                            <button id="quickZoomOutBtn" class="devQuickZoomBtn" title="Alejar cámara">-</button>
                            <button id="quickCenterBtn" class="devQuickZoomBtn" title="Centrar modelo entero">⛶ Centrar</button>
                        </div>
                    </div>

                    <div id="dev3DLoading" class="dev3DLoading">Cargando modelo 3D del Player...</div>
                    <canvas id="devEquipment3DCanvas"></canvas>
                </div>
            </div>
        </div>
    `;

    setupEquipEvents();
    init3DPreview();
}

/**
 * Inicializa la escena 3D autónoma del Visor de Desarrollo.
 */
function init3DPreview() {
    const frame = document.getElementById('devViewportFrame');
    const canvas = document.getElementById('devEquipment3DCanvas');
    const loadingEl = document.getElementById('dev3DLoading');
    if (!frame || !canvas) return;

    if (previewAnimationId) {
        cancelAnimationFrame(previewAnimationId);
        previewAnimationId = null;
    }

    const width = frame.clientWidth || 550;
    const height = frame.clientHeight || 460;

    // 1. Escena 3D
    previewScene = new THREE.Scene();
    previewScene.background = new THREE.Color(0x0a110e);

    // 2. Cámara: encuadre generoso para ver 100% del modelo desde cabeza a pies + peana
    previewCamera = new THREE.PerspectiveCamera(40, width / height, 0.05, 100);
    previewCamera.position.set(0, 0.85, 3.8);

    // 3. Renderizador WebGL
    previewRenderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    });
    previewRenderer.setSize(width, height);
    previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    previewRenderer.toneMappingExposure = 1.25;
    previewRenderer.shadowMap.enabled = true;

    // 4. Controles OrbitControls con zoom amplio e ilimitado
    previewControls = new OrbitControls(previewCamera, canvas);
    previewControls.enableDamping = true;
    previewControls.dampingFactor = 0.08;
    previewControls.target.set(0, 0.70, 0); // Centro de masa del robot (altura 1.4m)
    previewControls.minDistance = 0.15;     // Permite acercarse mucho a detalles
    previewControls.maxDistance = 22.0;    // Permite alejarse todo lo necesario sin tope
    previewControls.maxPolarAngle = Math.PI / 2 + 0.15; // Límite en el suelo

    // Sincronizar slider de zoom cuando el usuario usa la rueda del ratón
    previewControls.addEventListener('change', () => {
        const dist = previewCamera.position.distanceTo(previewControls.target);
        const distSlider = document.getElementById('sliderCamDist');
        const distVal = document.getElementById('valCamDist');
        if (distSlider && distVal) {
            distSlider.value = dist.toFixed(1);
            distVal.textContent = dist.toFixed(1);
        }
    });

    // 5. Iluminación de estudio 3D
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
    previewScene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.6);
    keyLight.position.set(2.5, 4.0, 3.0);
    previewScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd4af37, 0.9);
    fillLight.position.set(-2.5, 2.0, -1.0);
    previewScene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x52b788, 1.1);
    rimLight.position.set(0, 3.0, -3.0);
    previewScene.add(rimLight);

    // Rejilla de suelo sutil
    const grid = new THREE.GridHelper(4.0, 16, 0xd4af37, 0x1a2e22);
    grid.position.y = 0;
    previewScene.add(grid);

    // Peana circular estilizada
    const baseGeo = new THREE.CylinderGeometry(0.85, 0.90, 0.04, 36);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x141f18, roughness: 0.7, metalness: 0.3 });
    const pedestal = new THREE.Mesh(baseGeo, baseMat);
    pedestal.position.y = -0.02;
    previewScene.add(pedestal);

    // Aro dorado decorativo en peana
    const ringGeo = new THREE.TorusGeometry(0.85, 0.015, 12, 36);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });
    const goldRing = new THREE.Mesh(ringGeo, ringMat);
    goldRing.rotation.x = Math.PI / 2;
    goldRing.position.y = 0.002;
    previewScene.add(goldRing);

    // 6. Cargar modelo 3D del Player y configurar esqueleto + sockets normalizados
    const onPlayerReady = () => {
        if (loadingEl) loadingEl.style.display = 'none';
        equipCurrentSelectedItem();
        fitCameraToPreview();
    };

    if (previewPlayerModel) {
        clearPreviewSockets();
        setupPreviewSockets(previewPlayerModel);
        previewScene.add(previewPlayerModel);
        if (previewMixer && previewIdleAction) {
            previewIdleAction.play();
        }
        onPlayerReady();
    } else {
        loadPlayerModel(
            (model, gltf) => {
                previewPlayerModel = model;
                setupPreviewSockets(previewPlayerModel);
                if (gltf && gltf.animations && gltf.animations.length > 0) {
                    previewMixer = new THREE.AnimationMixer(previewPlayerModel);
                    const idleClip = gltf.animations.find((a) => a.name.toLowerCase().includes('idle')) || gltf.animations[0];
                    if (idleClip) {
                        previewIdleAction = previewMixer.clipAction(idleClip);
                        previewIdleAction.play();
                    }
                }
                previewScene.add(previewPlayerModel);
                onPlayerReady();
            },
            (err) => {
                console.warn('[EquipmentDebugger] Error cargando RobotAnimado.glb, usando robot procedural:', err);
                createFallbackPreviewRobot();
                onPlayerReady();
            }
        );
    }

    // 7. ResizeObserver
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => {
        if (!frame || !previewRenderer || !previewCamera) return;
        const newW = frame.clientWidth || 550;
        const newH = frame.clientHeight || 460;
        previewCamera.aspect = newW / newH;
        previewCamera.updateProjectionMatrix();
        previewRenderer.setSize(newW, newH);
    });
    resizeObserver.observe(frame);

    // 8. Bucle de renderizado
    previewClock.start();
    function animatePreview() {
        previewAnimationId = requestAnimationFrame(animatePreview);
        const delta = previewClock.getDelta();

        if (previewMixer && previewIsAnimating) {
            previewMixer.update(delta);
        }

        if (previewControls) previewControls.update();
        if (previewRenderer && previewScene && previewCamera) {
            previewRenderer.render(previewScene, previewCamera);
        }
    }
    animatePreview();
}

/**
 * Busca de forma flexible un hueso en el esqueleto.
 */
function findPreviewBone(model, candidateNames) {
    let found = null;
    model.traverse((node) => {
        if (found || !node.isBone) return;
        const name = (node.name || '').toLowerCase();
        for (const candidate of candidateNames) {
            if (typeof candidate === 'string') {
                if (name === candidate.toLowerCase() || name.includes(candidate.toLowerCase())) {
                    found = node;
                    return;
                }
            } else if (Array.isArray(candidate)) {
                if (candidate.every((kw) => name.includes(kw.toLowerCase()))) {
                    found = node;
                    return;
                }
            }
        }
    });
    return found;
}

/**
 * Configura los sockets garantizando que la escala sea exactamente 1:1 independiente del armature.
 */
function setupPreviewSockets(model) {
    previewSockets = { rightHand: null, leftHand: null, back: null, head: null };

    // Buscar huesos exactos en RobotAnimado.glb
    const rHandBone = findPreviewBone(model, [
        'Palm2R', 'Palm1R', 'Palm3R', ['palm', 'r'], ['hand', 'r'], 'LowerArmR'
    ]);
    const lHandBone = findPreviewBone(model, [
        'Palm2L', 'Palm1L', 'Palm3L', ['palm', 'l'], ['hand', 'l'], 'LowerArmL'
    ]);
    const backBone = findPreviewBone(model, [
        'Torso_1', 'Torso', 'Chest', 'Spine2', 'Spine', 'Abdomen', 'Body'
    ]);
    const headBone = findPreviewBone(model, [
        'Head', 'Neck'
    ]);

    model.updateMatrixWorld(true);

    const createSocket = (socketName, bone, fallbackPos) => {
        const socketGroup = new THREE.Group();
        socketGroup.name = `preview_socket_${socketName}`;

        if (bone) {
            bone.add(socketGroup);
            // Invertir la escala acumulada del hueso/armature para tener escala 1.0 exacta en el socket
            const boneWorldScale = new THREE.Vector3();
            bone.getWorldScale(boneWorldScale);
            if (boneWorldScale.x !== 0 && boneWorldScale.y !== 0 && boneWorldScale.z !== 0) {
                socketGroup.scale.set(
                    1 / boneWorldScale.x,
                    1 / boneWorldScale.y,
                    1 / boneWorldScale.z
                );
            }
        } else {
            socketGroup.position.copy(fallbackPos);
            model.add(socketGroup);
            const modelScale = new THREE.Vector3();
            model.getWorldScale(modelScale);
            if (modelScale.x !== 0 && modelScale.y !== 0 && modelScale.z !== 0) {
                socketGroup.scale.set(
                    1 / modelScale.x,
                    1 / modelScale.y,
                    1 / modelScale.z
                );
            }
        }

        previewSockets[socketName] = socketGroup;
    };

    createSocket('rightHand', rHandBone, new THREE.Vector3(0.35, 0.75, 0.25));
    createSocket('leftHand', lHandBone, new THREE.Vector3(-0.35, 0.75, 0.25));
    createSocket('back', backBone, new THREE.Vector3(0.0, 0.95, -0.25));
    createSocket('head', headBone, new THREE.Vector3(0.0, 1.45, 0.05));
}

function loadPlayerModel(onSuccess, onError) {
    if (cachedRobotGLTF) {
        const model = cachedRobotGLTF.scene || cachedRobotGLTF.scenes[0];
        preparePlayerModel(model);
        onSuccess(model, cachedRobotGLTF);
        return;
    }

    const loader = new GLTFLoader();
    loader.setWithCredentials(true);

    let hasResponded = false;
    const safetyTimeout = setTimeout(() => {
        if (!hasResponded) {
            hasResponded = true;
            console.warn('[EquipmentDebugger] Timeout cargando RobotAnimado.glb, activando fallback');
            onError(new Error('Timeout de carga'));
        }
    }, 4500);

    const tryLoad = (url, fallbackUrls = []) => {
        loader.load(
            url,
            (gltf) => {
                if (hasResponded) return;
                hasResponded = true;
                clearTimeout(safetyTimeout);
                cachedRobotGLTF = gltf;
                const model = gltf.scene || gltf.scenes[0];
                preparePlayerModel(model);
                onSuccess(model, gltf);
            },
            undefined,
            (err) => {
                if (fallbackUrls.length > 0) {
                    tryLoad(fallbackUrls[0], fallbackUrls.slice(1));
                } else if (!hasResponded) {
                    hasResponded = true;
                    clearTimeout(safetyTimeout);
                    onError(err);
                }
            }
        );
    };

    tryLoad('assets/models/RobotAnimado.glb', [
        '/assets/models/RobotAnimado.glb',
        './assets/models/RobotAnimado.glb'
    ]);
}

function preparePlayerModel(model) {
    // Auto-escalado a altura exacta (1.4m)
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const desiredHeight = 1.4;
    const scaleFactor = desiredHeight / (size.y || 1);
    model.scale.setScalar(scaleFactor);

    // Apoyar pies exactamente en Y = 0
    box.setFromObject(model);
    const groundOffset = -box.min.y;
    model.position.set(0, groundOffset, 0);

    // Sombras y render
    model.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });
}

function createFallbackPreviewRobot() {
    previewPlayerModel = new THREE.Group();
    previewPlayerModel.name = 'FallbackRobot';

    const bodyGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.65, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, metalness: 0.5, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.65;
    previewPlayerModel.add(body);

    const headGeo = new THREE.SphereGeometry(0.16, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.15;
    previewPlayerModel.add(head);

    clearPreviewSockets();
    setupPreviewSockets(previewPlayerModel);
    previewScene.add(previewPlayerModel);
}

/**
 * Centra y encuadra cómodamente todo el modelo en el viewport.
 */
function fitCameraToPreview() {
    if (!previewCamera || !previewControls) return;
    previewControls.target.set(0, 0.70, 0);
    previewCamera.position.set(0, 0.85, 3.8);
    previewControls.update();

    const distSlider = document.getElementById('sliderCamDist');
    const distVal = document.getElementById('valCamDist');
    if (distSlider && distVal) {
        distSlider.value = '3.8';
        distVal.textContent = '3.8';
    }
}

/**
 * Sincroniza la UI de escala uniforme y por ejes con un valor numérico.
 */
function updateScaleUI(sVal) {
    const scaleSlider = document.getElementById('sliderScale');
    if (scaleSlider) scaleSlider.value = sVal.toString();
    const valScale = document.getElementById('valScale');
    if (valScale) valScale.textContent = sVal.toFixed(2);
    const valScalePct = document.getElementById('valScalePct');
    if (valScalePct) valScalePct.textContent = `${Math.round(sVal * 100)}%`;

    ['X', 'Y', 'Z'].forEach(axis => {
        const el = document.getElementById(`sliderScale${axis}`);
        if (el) el.value = sVal.toString();
        const v = document.getElementById(`valScale${axis}`);
        if (v) v.textContent = sVal.toFixed(2);
    });
}

/**
 * Equipa el ítem seleccionado actualmente (sea del sistema o personalizado).
 * Se encarga de instanciarlo, aplicarle escala y transformaciones y montarlo al socket.
 */
function equipCurrentSelectedItem() {
    if (!currentSelectedItemId) return;
    const socket = previewSockets[currentSocket];
    if (!socket) return;

    while (socket.children.length > 0) {
        socket.remove(socket.children[0]);
    }

    let previewMesh = null;
    let inGameMesh = null;
    const custom = getCustomItemById(currentSelectedItemId);

    if (custom && custom.code) {
        try {
            const built = buildThreeMeshFromCode(custom.code);
            if (built && built.success && built.object) {
                previewMesh = built.object;
                inGameMesh = buildThreeMeshFromCode(custom.code).object || createProceduralItem('flashlight');
                if (custom.transform) {
                    if (custom.transform.position) {
                        currentTransform.position = { ...custom.transform.position };
                        const px = document.getElementById('sliderPosX');
                        const py = document.getElementById('sliderPosY');
                        const pz = document.getElementById('sliderPosZ');
                        if (px) px.value = currentTransform.position.x;
                        if (py) py.value = currentTransform.position.y;
                        if (pz) pz.value = currentTransform.position.z;
                        const vx = document.getElementById('valPosX');
                        const vy = document.getElementById('valPosY');
                        const vz = document.getElementById('valPosZ');
                        if (vx) vx.textContent = Number(currentTransform.position.x).toFixed(2);
                        if (vy) vy.textContent = Number(currentTransform.position.y).toFixed(2);
                        if (vz) vz.textContent = Number(currentTransform.position.z).toFixed(2);
                    }
                    if (custom.transform.rotation) {
                        currentTransform.rotation = { ...custom.transform.rotation };
                        const rx = document.getElementById('sliderRotX');
                        const ry = document.getElementById('sliderRotY');
                        const rz = document.getElementById('sliderRotZ');
                        if (rx) rx.value = currentTransform.rotation.x;
                        if (ry) ry.value = currentTransform.rotation.y;
                        if (rz) rz.value = currentTransform.rotation.z;
                        const vrx = document.getElementById('valRotX');
                        const vry = document.getElementById('valRotY');
                        const vrz = document.getElementById('valRotZ');
                        if (vrx) vrx.textContent = currentTransform.rotation.x;
                        if (vry) vry.textContent = currentTransform.rotation.y;
                        if (vrz) vrz.textContent = currentTransform.rotation.z;
                    }
                    if (custom.transform.scale !== undefined) {
                        const s = custom.transform.scale;
                        if (typeof s === 'number') {
                            currentTransform.scale = s;
                            currentTransform.scaleAxes = { x: s, y: s, z: s };
                            updateScaleUI(s);
                        } else if (typeof s === 'object' && s !== null) {
                            currentTransform.scale = s.x || 1.0;
                            currentTransform.scaleAxes = { x: s.x || 1.0, y: s.y || 1.0, z: s.z || 1.0 };
                            updateScaleUI(s.x || 1.0);
                        }
                    }
                } else if (typeof custom.scale === 'number' && custom.scale > 0 && custom.scale !== 1.0) {
                    currentTransform.scale = custom.scale;
                    currentTransform.scaleAxes = { x: custom.scale, y: custom.scale, z: custom.scale };
                    updateScaleUI(custom.scale);
                }
            } else {
                console.warn('[EquipmentDebugger] Fallo al compilar custom item, usando fallback linterna:', built?.error);
                showDevToast(`⚠️ Error al compilar: ${built?.error || 'Código inválido'}`);
                previewMesh = createProceduralItem('flashlight');
                inGameMesh = createProceduralItem('flashlight');
            }
        } catch (err) {
            console.error('[EquipmentDebugger] Excepción compilando Three.js:', err);
            showDevToast(`⚠️ Excepción en Three.js: ${err.message || err}`);
            previewMesh = createProceduralItem('flashlight');
            inGameMesh = createProceduralItem('flashlight');
        }
    } else {
        previewMesh = createProceduralItem(currentSelectedItemId);
        inGameMesh = createProceduralItem(currentSelectedItemId);
    }

    if (!previewMesh) return;

    previewEquipped[currentSocket] = previewMesh;
    applyItemTransform(previewMesh);
    socket.add(previewMesh);

    // Sincronizar también con el jugador del juego
    const scalePayload = isUniformScale ? currentTransform.scale : { ...currentTransform.scaleAxes };
    equipInGameItem(currentSocket, inGameMesh, {
        position: currentTransform.position,
        rotation: currentTransform.rotation,
        scale: scalePayload
    });

    syncActiveButtonsInUI();
}

/**
 * Equipa un objeto en el socket activo del visor.
 */
function equipCurrentItemInPreview(itemTypeOrMesh = null) {
    if (itemTypeOrMesh) {
        if (typeof itemTypeOrMesh === 'string') {
            currentSelectedItemId = itemTypeOrMesh;
        }
        equipCurrentSelectedItem();
        return;
    }

    equipCurrentSelectedItem();
}

/**
 * Aplica transformaciones de traslación, rotación y escala al ítem.
 */
function applyItemTransform(mesh) {
    if (!mesh) return;

    mesh.position.set(currentTransform.position.x, currentTransform.position.y, currentTransform.position.z);
    mesh.rotation.set(
        THREE.MathUtils.degToRad(currentTransform.rotation.x),
        THREE.MathUtils.degToRad(currentTransform.rotation.y),
        THREE.MathUtils.degToRad(currentTransform.rotation.z)
    );

    if (isUniformScale) {
        mesh.scale.set(currentTransform.scale, currentTransform.scale, currentTransform.scale);
    } else {
        mesh.scale.set(
            currentTransform.scaleAxes.x,
            currentTransform.scaleAxes.y,
            currentTransform.scaleAxes.z
        );
    }
}

function updatePreviewTransform() {
    const socket = previewSockets[currentSocket];
    if (!socket || socket.children.length === 0) return;

    const item = socket.children[0];
    applyItemTransform(item);

    // Sincronizar en el juego
    const scalePayload = isUniformScale ? currentTransform.scale : { ...currentTransform.scaleAxes };
    updateInGameTransform(currentSocket, {
        position: currentTransform.position,
        rotation: currentTransform.rotation,
        scale: scalePayload
    });
}

function setCameraFocus(camX, camY, camZ, targetX, targetY, targetZ) {
    if (!previewControls || !previewCamera) return;
    previewControls.target.set(targetX, targetY, targetZ);
    previewCamera.position.set(camX, camY, camZ);
    previewControls.update();

    const dist = previewCamera.position.distanceTo(previewControls.target);
    const distSlider = document.getElementById('sliderCamDist');
    const distVal = document.getElementById('valCamDist');
    if (distSlider && distVal) {
        distSlider.value = dist.toFixed(1);
        distVal.textContent = dist.toFixed(1);
    }
}

function focusOnSocket(socketName) {
    const socket = previewSockets[socketName];
    if (!socket || !previewControls || !previewCamera) {
        fitCameraToPreview();
        return;
    }

    previewPlayerModel?.updateMatrixWorld(true);
    const targetWorld = new THREE.Vector3();
    socket.getWorldPosition(targetWorld);

    if (socketName === 'rightHand') {
        setCameraFocus(
            targetWorld.x - 0.35, targetWorld.y + 0.18, targetWorld.z + 0.70,
            targetWorld.x, targetWorld.y, targetWorld.z
        );
    } else if (socketName === 'leftHand') {
        setCameraFocus(
            targetWorld.x + 0.35, targetWorld.y + 0.18, targetWorld.z + 0.70,
            targetWorld.x, targetWorld.y, targetWorld.z
        );
    } else if (socketName === 'back') {
        setCameraFocus(
            targetWorld.x, targetWorld.y + 0.15, targetWorld.z - 1.10,
            targetWorld.x, targetWorld.y, targetWorld.z
        );
    } else {
        fitCameraToPreview();
    }
}

function syncActiveButtonsInUI() {
    // Sockets
    document.querySelectorAll('.socketBtn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-socket') === currentSocket);
    });
    // Items
    document.querySelectorAll('.devItemBtn').forEach(b => {
        b.classList.toggle('activeItem', b.getAttribute('data-item') === currentSelectedItemId);
    });
}

function setupEquipEvents() {
    // 1. Selector de Sockets (NO salta la cámara bruscamente para respetar la vista del usuario)
    const socketBtns = document.querySelectorAll('.socketBtn');
    socketBtns.forEach(btn => {
        btn.onclick = () => {
            currentSocket = btn.getAttribute('data-socket');
            syncActiveButtonsInUI();
            equipCurrentSelectedItem();
        };
    });

    // 1b. Botón para saltar al Generador 3D
    const goToGenBtn = document.getElementById('devGoToGenBtn');
    if (goToGenBtn) {
        goToGenBtn.onclick = () => {
            const genTabBtn = document.querySelector('.devTabBtn[data-tab="modelGenerator"]');
            if (genTabBtn) genTabBtn.click();
        };
    }

    // 2. Selector unificado de Items (Sistema + Biblioteca Guardada)
    function bindAllItemButtons() {
        const itemBtns = document.querySelectorAll('.devItemBtn');
        itemBtns.forEach(btn => {
            btn.onclick = () => {
                const itemType = btn.getAttribute('data-item');
                const suggestedSocket = btn.getAttribute('data-socket');
                currentSelectedItemId = itemType;

                // Si tiene un socket sugerido y es diferente, adaptarlo
                if (suggestedSocket && suggestedSocket !== currentSocket) {
                    currentSocket = suggestedSocket;
                }

                syncActiveButtonsInUI();
                equipCurrentSelectedItem();

                const custom = getCustomItemById(itemType);
                const name = custom ? custom.name : (btn.textContent || itemType).trim();
                const icon = custom ? (custom.icon || '📦') : '';
                showDevToast(`${icon} "${name}" acoplado al Player`);
            };
        });
    }

    function refreshCustomItemsGrid() {
        const grid = document.getElementById('devCustomItemGrid');
        const badge = document.getElementById('devCustomItemsCountBadge');
        if (!grid) return;

        const items = getCustomItems();
        if (badge) badge.textContent = `(${items.length} objetos)`;

        if (items.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1 / -1; font-size:0.72rem; color:rgba(255,255,255,0.4); text-align:center; padding:6px;">Sin objetos personalizados aún. ¡Usa el botón "Crear con IA"!</div>`;
            return;
        }

        grid.innerHTML = items.map(item => `
            <button class="devItemBtn devCustomItemBtn" data-item="${item.id}" data-socket="${item.socket || ''}" title="${escapeHtml(item.name)} (${item.socket || 'rightHand'})">
                ${escapeHtml(item.icon || '📦')} ${escapeHtml(item.name)}
            </button>
        `).join('');

        bindAllItemButtons();
        syncActiveButtonsInUI();
    }

    // Si venimos del Generador 3D con un ítem pendiente de equipar, auto-seleccionarlo en el estado
    const pendingEquipId = sessionStorage.getItem('monteserin_pending_equip_item_id');
    if (pendingEquipId) {
        sessionStorage.removeItem('monteserin_pending_equip_item_id');
        currentSelectedItemId = pendingEquipId;
        const customItem = getCustomItemById(pendingEquipId);
        if (customItem && customItem.socket) {
            currentSocket = customItem.socket;
        }
    }

    // Poblar por primera vez
    refreshCustomItemsGrid();
    bindAllItemButtons();
    syncActiveButtonsInUI();

    // Escuchar actualizaciones dinámicas de la biblioteca
    if (customItemsListener) {
        window.removeEventListener('customItemsUpdated', customItemsListener);
    }
    customItemsListener = () => {
        refreshCustomItemsGrid();
    };
    window.addEventListener('customItemsUpdated', customItemsListener);

    // 3. Cargar .GLB externo con auto-normalización de dimensiones
    const glbInput = document.getElementById('devEquipGlbInput');
    if (glbInput) {
        glbInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const blobUrl = URL.createObjectURL(file);
            const loader = new GLTFLoader();
            loader.load(blobUrl, (gltf) => {
                const model = gltf.scene || gltf.scenes[0];

                // Auto-ajustar tamaño si viene fuera de escala
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);
                if (maxDim > 0 && (maxDim > 1.2 || maxDim < 0.1)) {
                    const factor = 0.35 / maxDim;
                    model.scale.multiplyScalar(factor);
                }

                equipCurrentItemInPreview(model);
                const scalePayload = isUniformScale ? currentTransform.scale : { ...currentTransform.scaleAxes };
                equipInGameItem(currentSocket, model.clone(), {
                    position: currentTransform.position,
                    rotation: currentTransform.rotation,
                    scale: scalePayload
                });
            });
        };
    }

    // 4. Desequipar
    const unequipBtn = document.getElementById('devUnequipBtn');
    if (unequipBtn) {
        unequipBtn.onclick = () => {
            const socket = previewSockets[currentSocket];
            if (socket) {
                while (socket.children.length > 0) socket.remove(socket.children[0]);
            }
            previewEquipped[currentSocket] = null;
            unequipInGameItem(currentSocket);
            document.querySelectorAll('.devItemBtn').forEach(b => b.classList.remove('activeItem'));
        };
    }

    // 5. Restablecer Transformación completa
    const resetTransformBtn = document.getElementById('devResetTransformBtn');
    if (resetTransformBtn) {
        resetTransformBtn.onclick = () => {
            currentTransform.position = { x: 0, y: 0, z: 0 };
            currentTransform.rotation = { x: 0, y: 0, z: 0 };
            currentTransform.scale = 1.0;
            currentTransform.scaleAxes = { x: 1.0, y: 1.0, z: 1.0 };

            ['sliderPosX', 'sliderPosY', 'sliderPosZ', 'sliderRotX', 'sliderRotY', 'sliderRotZ'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '0';
            });
            ['valPosX', 'valPosY', 'valPosZ'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '0.00';
            });
            ['valRotX', 'valRotY', 'valRotZ'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '0';
            });

            const scaleSlider = document.getElementById('sliderScale');
            if (scaleSlider) scaleSlider.value = '1.0';
            const valScale = document.getElementById('valScale');
            if (valScale) valScale.textContent = '1.00';
            const valScalePct = document.getElementById('valScalePct');
            if (valScalePct) valScalePct.textContent = '100%';

            ['sliderScaleX', 'sliderScaleY', 'sliderScaleZ'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '1.0';
            });
            ['valScaleX', 'valScaleY', 'valScaleZ'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '1.00';
            });

            document.querySelectorAll('.scalePresetBtn').forEach(b => b.classList.remove('activeScale'));
            document.querySelector('.scalePresetBtn[data-scale="1.0"]')?.classList.add('activeScale');

            updatePreviewTransform();
        };
    }

    // 6. Preajustes Rápidos de Escala
    const scalePresetBtns = document.querySelectorAll('.scalePresetBtn');
    scalePresetBtns.forEach(btn => {
        btn.onclick = () => {
            scalePresetBtns.forEach(b => b.classList.remove('activeScale'));
            btn.classList.add('activeScale');

            const sVal = parseFloat(btn.getAttribute('data-scale')) || 1.0;
            currentTransform.scale = sVal;
            currentTransform.scaleAxes = { x: sVal, y: sVal, z: sVal };

            const scaleSlider = document.getElementById('sliderScale');
            if (scaleSlider) scaleSlider.value = sVal.toString();
            const valScale = document.getElementById('valScale');
            if (valScale) valScale.textContent = sVal.toFixed(2);
            const valScalePct = document.getElementById('valScalePct');
            if (valScalePct) valScalePct.textContent = `${Math.round(sVal * 100)}%`;

            ['X', 'Y', 'Z'].forEach(axis => {
                const el = document.getElementById(`sliderScale${axis}`);
                if (el) el.value = sVal.toString();
                const v = document.getElementById(`valScale${axis}`);
                if (v) v.textContent = sVal.toFixed(2);
            });

            updatePreviewTransform();
        };
    });

    // 7. Toggle Escala Uniforme / Libre
    const uniformCheck = document.getElementById('devUniformScaleCheck');
    const scaleModeText = document.getElementById('devScaleModeText');
    const uniformContainer = document.getElementById('devUniformScaleContainer');
    const axesContainer = document.getElementById('devAxesScaleContainer');

    if (uniformCheck) {
        uniformCheck.onchange = (e) => {
            isUniformScale = e.target.checked;
            if (scaleModeText) scaleModeText.textContent = isUniformScale ? 'Uniforme' : 'Por Ejes';
            if (uniformContainer) uniformContainer.style.display = isUniformScale ? 'block' : 'none';
            if (axesContainer) axesContainer.style.display = isUniformScale ? 'none' : 'block';
            updatePreviewTransform();
        };
    }

    // 8. Sliders de Posición
    bindSlider('sliderPosX', 'valPosX', (v) => {
        currentTransform.position.x = parseFloat(v);
        updatePreviewTransform();
    });
    bindSlider('sliderPosY', 'valPosY', (v) => {
        currentTransform.position.y = parseFloat(v);
        updatePreviewTransform();
    });
    bindSlider('sliderPosZ', 'valPosZ', (v) => {
        currentTransform.position.z = parseFloat(v);
        updatePreviewTransform();
    });

    // 9. Sliders de Rotación
    bindSlider('sliderRotX', 'valRotX', (v) => {
        currentTransform.rotation.x = parseFloat(v);
        updatePreviewTransform();
    });
    bindSlider('sliderRotY', 'valRotY', (v) => {
        currentTransform.rotation.y = parseFloat(v);
        updatePreviewTransform();
    });
    bindSlider('sliderRotZ', 'valRotZ', (v) => {
        currentTransform.rotation.z = parseFloat(v);
        updatePreviewTransform();
    });

    // 10. Sliders de Escala
    const sliderScale = document.getElementById('sliderScale');
    const valScale = document.getElementById('valScale');
    const valScalePct = document.getElementById('valScalePct');
    if (sliderScale) {
        sliderScale.oninput = (e) => {
            const val = parseFloat(e.target.value);
            currentTransform.scale = val;
            currentTransform.scaleAxes = { x: val, y: val, z: val };
            if (valScale) valScale.textContent = val.toFixed(2);
            if (valScalePct) valScalePct.textContent = `${Math.round(val * 100)}%`;

            scalePresetBtns.forEach(b => b.classList.remove('activeScale'));
            updatePreviewTransform();
        };
    }

    bindSlider('sliderScaleX', 'valScaleX', (v) => {
        currentTransform.scaleAxes.x = parseFloat(v);
        updatePreviewTransform();
    });
    bindSlider('sliderScaleY', 'valScaleY', (v) => {
        currentTransform.scaleAxes.y = parseFloat(v);
        updatePreviewTransform();
    });
    bindSlider('sliderScaleZ', 'valScaleZ', (v) => {
        currentTransform.scaleAxes.z = parseFloat(v);
        updatePreviewTransform();
    });

    // 11. Enfoques de Cámara
    const camFullBody = document.getElementById('camFullBodyBtn');
    const camRHand = document.getElementById('camRightHandBtn');
    const camLHand = document.getElementById('camLeftHandBtn');
    const camBack = document.getElementById('camBackBtn');

    const markActiveCam = (btn) => {
        document.querySelectorAll('.devCamBtn').forEach(b => b.classList.remove('activeCam'));
        if (btn) btn.classList.add('activeCam');
    };

    if (camFullBody) {
        camFullBody.onclick = () => {
            markActiveCam(camFullBody);
            fitCameraToPreview();
        };
    }
    if (camRHand) {
        camRHand.onclick = () => {
            markActiveCam(camRHand);
            focusOnSocket('rightHand');
        };
    }
    if (camLHand) {
        camLHand.onclick = () => {
            markActiveCam(camLHand);
            focusOnSocket('leftHand');
        };
    }
    if (camBack) {
        camBack.onclick = () => {
            markActiveCam(camBack);
            focusOnSocket('back');
        };
    }

    // 12. Slider de Zoom de Cámara Manual
    const camDistSlider = document.getElementById('sliderCamDist');
    const camDistVal = document.getElementById('valCamDist');
    if (camDistSlider) {
        camDistSlider.oninput = (e) => {
            const dist = parseFloat(e.target.value);
            if (camDistVal) camDistVal.textContent = dist.toFixed(1);
            if (!previewCamera || !previewControls) return;

            const dir = new THREE.Vector3().subVectors(previewCamera.position, previewControls.target).normalize();
            previewCamera.position.copy(previewControls.target).addScaledVector(dir, dist);
            previewControls.update();
        };
    }

    // 13. Botones Rápidos de Zoom sobre el Visor
    const quickZoomIn = document.getElementById('quickZoomInBtn');
    const quickZoomOut = document.getElementById('quickZoomOutBtn');
    const quickCenter = document.getElementById('quickCenterBtn');

    if (quickZoomIn) {
        quickZoomIn.onclick = () => {
            if (!previewCamera || !previewControls) return;
            const currentDist = previewCamera.position.distanceTo(previewControls.target);
            const newDist = Math.max(0.3, currentDist * 0.78);
            const dir = new THREE.Vector3().subVectors(previewCamera.position, previewControls.target).normalize();
            previewCamera.position.copy(previewControls.target).addScaledVector(dir, newDist);
            previewControls.update();
        };
    }
    if (quickZoomOut) {
        quickZoomOut.onclick = () => {
            if (!previewCamera || !previewControls) return;
            const currentDist = previewCamera.position.distanceTo(previewControls.target);
            const newDist = Math.min(20.0, currentDist * 1.25);
            const dir = new THREE.Vector3().subVectors(previewCamera.position, previewControls.target).normalize();
            previewCamera.position.copy(previewControls.target).addScaledVector(dir, newDist);
            previewControls.update();
        };
    }
    if (quickCenter) {
        quickCenter.onclick = () => {
            markActiveCam(camFullBody);
            fitCameraToPreview();
        };
    }

    // 14. Toggle de Animación
    const animToggleBtn = document.getElementById('devAnimToggleBtn');
    if (animToggleBtn) {
        animToggleBtn.onclick = () => {
            previewIsAnimating = !previewIsAnimating;
            if (previewIsAnimating) {
                animToggleBtn.textContent = '⏸️ Pausar Pose';
                animToggleBtn.classList.remove('btnPaused');
            } else {
                animToggleBtn.textContent = '▶️ Reanudar Reposo (Idle)';
                animToggleBtn.classList.add('btnPaused');
            }
        };
    }

    // 15. Guardar Calibración Directa en el Objeto (Automático e Interno)
    const saveCalibBtn = document.getElementById('devSaveCalibrationBtn');
    const saveCalibFeedback = document.getElementById('devSaveCalibrationFeedback');
    if (saveCalibBtn) {
        saveCalibBtn.onclick = () => {
            const custom = getCustomItemById(currentSelectedItemId);
            if (!custom) {
                if (saveCalibFeedback) {
                    saveCalibFeedback.textContent = 'ℹ️ Objeto del sistema. Usa "Copiar Configuración JS".';
                    setTimeout(() => { if (saveCalibFeedback) saveCalibFeedback.textContent = ''; }, 3000);
                }
                return;
            }

            const scalePayload = isUniformScale ? currentTransform.scale : { ...currentTransform.scaleAxes };
            updateCustomItemTransform(currentSelectedItemId, {
                socket: currentSocket,
                position: { ...currentTransform.position },
                rotation: { ...currentTransform.rotation },
                scale: scalePayload
            });

            if (saveCalibFeedback) {
                saveCalibFeedback.textContent = `✅ Calibración guardada en "${custom.name}". ¡100% automático!`;
                setTimeout(() => { if (saveCalibFeedback) saveCalibFeedback.textContent = ''; }, 3500);
            }
            showDevToast(`✅ Calibración guardada en "${custom.name}"`);
        };
    }

    // 16. Copiar Código
    const copyBtn = document.getElementById('devCopyTransformBtn');
    const copyFeedback = document.getElementById('devCopyFeedback');
    if (copyBtn) {
        copyBtn.onclick = () => {
            const exportPayload = {
                socket: currentSocket,
                position: { ...currentTransform.position },
                rotation: { ...currentTransform.rotation },
                scale: isUniformScale ? currentTransform.scale : { ...currentTransform.scaleAxes }
            };
            const code = JSON.stringify(exportPayload, null, 2);
            navigator.clipboard.writeText(code).then(() => {
                copyFeedback.textContent = '¡Copiado al portapapeles!';
                setTimeout(() => { copyFeedback.textContent = ''; }, 2500);
            }).catch(() => {
                copyFeedback.textContent = code;
            });
        };
    }
}

function bindSlider(sliderId, labelId, onChange) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    if (!slider || !label) return;

    slider.oninput = (e) => {
        label.textContent = e.target.value;
        onChange(e.target.value);
    };
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

