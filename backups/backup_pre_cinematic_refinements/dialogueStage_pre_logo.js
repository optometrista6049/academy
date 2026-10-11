import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Escenario Cinemático de Estudio para Diálogos con NPCs (Opción 1):
 * - Fondo neutro y elegante con degradado de estudio.
 * - Emblema/marca de Monteserín Academy en marca de agua difuminada con halo dorado.
 * - Renderizado en 3D en primer plano/plano medio del modelo del NPC gesticulando y hablando en vivo.
 */

let overlay = null;
let canvas = null;
let scene = null;
let camera = null;
let renderer = null;
let currentMixer = null;
let currentModel = null;
let currentLoadedUrl = null;
let currentClipAction = null;
let idleAction = null;
let isStageActive = false;
let animFrameId = null;
let clock = null;
let currentSpeaker = '';

// Iluminación de estudio con matices esmeralda y oro suave
let ambientLight = null;
let keyLight = null;
let fillLight = null;
let rimLight = null;

// Caché de modelos y animaciones GLTF para apertura instantánea
const npcModelCache = {};
const gltfLoader = new GLTFLoader();

const NPC_MODELS_MAP = {
    'panda': 'assets/models/npc/PandaNPC.glb',
    'monty': 'assets/models/npc/PandaNPC.glb',
    'alto': 'assets/models/npc/AltoNPC.glb',
    'señor alto': 'assets/models/npc/AltoNPC.glb',
    'senor alto': 'assets/models/npc/AltoNPC.glb',
    'sr. alto': 'assets/models/npc/AltoNPC.glb',
    'sr alto': 'assets/models/npc/AltoNPC.glb',
    'telerin': 'assets/models/npc/TelerinNPC.glb',
    'telerín': 'assets/models/npc/TelerinNPC.glb',
    'teleron': 'assets/models/npc/TeleronNPC.glb',
    'telerón': 'assets/models/npc/TeleronNPC.glb'
};

export function isNPCSpeaker(speakerName) {
    if (!speakerName || typeof speakerName !== 'string') return false;
    const s = speakerName.toLowerCase().trim();
    if (NPC_MODELS_MAP[s]) return true;
    return s.includes('panda') ||
           s.includes('monty') ||
           s.includes('alto') ||
           s.includes('telerin') ||
           s.includes('telerín') ||
           s.includes('teleron') ||
           s.includes('telerón');
}

export function getNPCModelUrl(speakerName) {
    if (!speakerName || typeof speakerName !== 'string') return NPC_MODELS_MAP['panda'];
    const s = speakerName.toLowerCase().trim();
    if (NPC_MODELS_MAP[s]) return NPC_MODELS_MAP[s];
    if (s.includes('panda') || s.includes('monty')) return NPC_MODELS_MAP['panda'];
    if (s.includes('alto')) return NPC_MODELS_MAP['alto'];
    if (s.includes('telerin') || s.includes('telerín')) return NPC_MODELS_MAP['telerin'];
    if (s.includes('teleron') || s.includes('telerón')) return NPC_MODELS_MAP['teleron'];
    return NPC_MODELS_MAP['panda'];
}

/**
 * Inicializa el DOM del escenario cinemático y la escena Three.js
 */
export function initDialogueStage() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = 'dialogueStageOverlay';
    overlay.className = 'dialogue-stage-overlay';
    overlay.innerHTML = `
        <div class="dialogue-stage-backdrop"></div>
        <div class="dialogue-stage-watermark" aria-hidden="true">
            <svg viewBox="0 0 500 500" class="dialogue-stage-logo-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Corona de laureles clásica exterior -->
                <circle cx="250" cy="250" r="226" stroke="#d4af37" stroke-width="3" stroke-dasharray="14 10" opacity="0.45"/>
                <circle cx="250" cy="250" r="212" stroke="#f5e197" stroke-width="1.5" opacity="0.55"/>
                <circle cx="250" cy="250" r="162" stroke="#d4af37" stroke-width="1.5" opacity="0.35"/>
                
                <!-- Blasón / Escudo Central -->
                <path d="M250 115 L325 155 V245 C325 315 250 365 250 365 C250 365 175 315 175 245 V155 Z" 
                      fill="rgba(212, 175, 55, 0.08)" stroke="#d4af37" stroke-width="3.5"/>
                
                <!-- Monograma central 'M' y estrella de la Academia -->
                <path d="M210 260 V185 L250 228 L290 185 V260" stroke="#fdf4c7" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
                <polygon points="250,140 256,155 272,156 259,166 264,181 250,172 236,181 241,166 228,156 244,155" fill="#f5e197"/>
                
                <!-- Lema circular de Monteserín Academy -->
                <path id="curveTop" d="M 95 250 A 155 155 0 0 1 405 250" fill="none"/>
                <path id="curveBottom" d="M 405 250 A 155 155 0 0 1 95 250" fill="none"/>
                
                <text font-family="'Cinzel', 'Trajan Pro', 'Georgia', serif" font-size="19" font-weight="700" letter-spacing="7" fill="#fdf4c7">
                    <textPath href="#curveTop" startOffset="50%" text-anchor="middle">
                        MONTESERÍN ACADEMY
                    </textPath>
                </text>
                <text font-family="'Cinzel', 'Trajan Pro', 'Georgia', serif" font-size="12" font-weight="600" letter-spacing="5" fill="#d4af37">
                    <textPath href="#curveBottom" startOffset="50%" text-anchor="middle">
                        • SAPIENTIA ET VIRTUS •
                    </textPath>
                </text>
            </svg>
        </div>
        <canvas id="dialogueStageCanvas" class="dialogue-stage-canvas"></canvas>
    `;

    document.body.appendChild(overlay);

    canvas = overlay.querySelector('#dialogueStageCanvas');
    clock = new THREE.Clock();

    // Configuración Three.js
    scene = new THREE.Scene();

    const w = window.innerWidth;
    const h = window.innerHeight;
    camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 50);
    camera.position.set(0, 0.42, 3.35);
    camera.lookAt(0, 0.35, 0);

    // Iluminación de estudio con matices esmeralda y oro suave
    createLights();

    renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.outputEncoding = THREE.sRGBEncoding;

    window.addEventListener('resize', onStageResize, { passive: true });

    // Pre-cargar modelos de NPCs para que estén listos inmediatamente
    Object.values(NPC_MODELS_MAP).forEach(url => {
        loadAndCacheModel(url);
    });
}

function createLights() {
    ambientLight = new THREE.AmbientLight(0xe8f5ea, 0.90);
    scene.add(ambientLight);

    keyLight = new THREE.DirectionalLight(0xfffaed, 1.40);
    keyLight.position.set(1.4, 2.8, 2.5);
    scene.add(keyLight);

    fillLight = new THREE.DirectionalLight(0x76a788, 0.50);
    fillLight.position.set(-1.8, 1.2, 1.8);
    scene.add(fillLight);

    rimLight = new THREE.DirectionalLight(0xd4af37, 1.55);
    rimLight.position.set(0, 2.2, -2.4);
    scene.add(rimLight);
}

function onStageResize() {
    if (!renderer || !camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    const isPortrait = camera.aspect < 1;
    const isPanda = isPandaSpeaker(currentSpeaker);

    if (isPortrait) {
        // Móvil vertical: encuadre adaptado con aire superior
        camera.fov = isPanda ? 32 : 34;
        camera.position.set(0, isPanda ? 0.36 : 0.40, isPanda ? 3.90 : 3.65);
        camera.lookAt(0, isPanda ? 0.32 : 0.38, 0);
    } else {
        // Desktop / horizontal: NPC posicionado ligeramente hacia el lado derecho (X: 0.35)
        // para dar protagonismo cinematográfico al logo de Monteserín Academy a su izquierda
        camera.fov = isPanda ? 25 : 27;
        camera.position.set(0, isPanda ? 0.38 : 0.42, isPanda ? 3.65 : 3.25);
        camera.lookAt(0, isPanda ? 0.34 : 0.38, 0);
    }
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);

    // Ajustar posición horizontal del modelo según si es pantalla ancha o móvil
    if (currentModel) {
        currentModel.position.x = isPortrait ? 0 : 0.40;
    }
}

function isPandaSpeaker(speaker) {
    if (!speaker || typeof speaker !== 'string') return false;
    const s = speaker.toLowerCase().trim();
    return s.includes('panda') || s.includes('monty');
}

/**
 * Carga y cachea un modelo GLTF con sus animaciones
 */
function loadAndCacheModel(url) {
    if (npcModelCache[url]) {
        return Promise.resolve(npcModelCache[url]);
    }

    return new Promise((resolve) => {
        gltfLoader.load(
            url,
            (gltf) => {
                npcModelCache[url] = gltf;
                resolve(gltf);
            },
            undefined,
            (err) => {
                console.warn('Error loading NPC model for dialogue stage:', url, err);
                resolve(null);
            }
        );
    });
}

/**
 * Prepara el modelo del NPC para el escenario de retrato
 */
function setupNPCInStage(gltf, modelUrl, speakerName) {
    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }
    if (currentMixer) {
        currentMixer.stopAllAction();
        currentMixer = null;
    }

    if (!gltf) return;

    currentLoadedUrl = modelUrl;

    // Clonar jerarquía y re-bind de huesos con SkeletonUtils
    const model = SkeletonUtils.clone(gltf.scene);
    currentModel = model;

    const speakerLower = (speakerName || '').toLowerCase().trim();
    const isPanda = isPandaSpeaker(speakerLower);
    const isTelerin = speakerLower.includes('telerin') || speakerLower.includes('telerín');
    const isTeleron = speakerLower.includes('teleron') || speakerLower.includes('telerón');

    // Igualar color de pelo para Telerín (castaño #5a3825) y Telerón (pelirrojo #d05e26)
    if (isTelerin || isTeleron) {
        const hairColor = isTelerin ? '#5a3825' : '#d05e26';
        model.traverse((child) => {
            if (child.isMesh && child.name === 'Hair' && child.material) {
                const hairMat = child.material.clone();
                hairMat.map = null;
                hairMat.color.set(hairColor);
                hairMat.roughness = 0.8;
                hairMat.metalness = 0.1;
                hairMat.skinning = true;
                hairMat.needsUpdate = true;
                child.material = hairMat;
            }
        });
    }

    // Calcular escala uniforme para retrato
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Ajuste específico de escala y centrado para Panda vs Otros NPCs
    // Para Panda: altura calibrada a 1.76 y margen inferior ampliado para evitar corte superior
    const desiredHeight = isPanda ? 1.76 : 2.05;
    const scale = desiredHeight / (size.y || 1);
    model.scale.setScalar(scale);

    // Centrar en el escenario
    box.setFromObject(model);
    const isPortrait = (window.innerWidth / window.innerHeight) < 1;
    model.position.x = isPortrait ? 0 : 0.40; // En desktop hacia la derecha del logo
    model.position.z = 0;
    model.position.y = isPanda 
        ? (-box.min.y - 0.94)  // Bajamos más a Panda para dejar abundante aire superior
        : (-box.min.y - 0.72);

    // Orientación hacia el frente/centro con dinamismo sutil
    model.rotation.y = isPortrait ? -0.10 : -0.25;

    scene.add(model);

    // Animación
    currentMixer = new THREE.AnimationMixer(model);

    // Buscar animación de habla ('yes' o 'idle')
    const yesClip = gltf.animations.find(a => a.name.toLowerCase().includes('yes')) || gltf.animations[0];
    const idleClip = gltf.animations.find(a => a.name.toLowerCase().includes('idle'));

    if (yesClip) {
        currentClipAction = currentMixer.clipAction(yesClip);
        currentClipAction.setLoop(THREE.LoopRepeat);
        currentClipAction.timeScale = 0.90;
        currentClipAction.play();
    }

    if (idleClip && idleClip !== yesClip) {
        idleAction = currentMixer.clipAction(idleClip);
        idleAction.setLoop(THREE.LoopRepeat);
        idleAction.setEffectiveWeight(0.35);
        idleAction.play();
    }
}

/**
 * Bucle de renderizado del escenario de estudio
 */
function renderStageLoop() {
    if (!isStageActive) return;

    animFrameId = requestAnimationFrame(renderStageLoop);

    const delta = clock ? clock.getDelta() : 0.016;

    if (currentMixer) {
        currentMixer.update(delta);
    }

    if (currentModel) {
        // Micro-movimiento sutil de respiración/presencia
        const t = performance.now() * 0.001;
        currentModel.position.x = Math.sin(t * 0.8) * 0.015;
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

/**
 * Muestra el escenario de estudio cinemático con el NPC correspondiente
 */
export function showDialogueStage(speakerName) {
    if (!overlay) {
        initDialogueStage();
    }

    currentSpeaker = speakerName || '';
    const modelUrl = getNPCModelUrl(speakerName);

    isStageActive = true;
    overlay.style.display = 'block';
    // Forzar reflow para animación suave de fade-in
    void overlay.offsetWidth;
    overlay.classList.add('visible');

    if (clock) clock.start();

    onStageResize();

    // Si el modelo actual ya corresponde a este NPC, reanimar gesto sin recargar
    if (currentModel && currentLoadedUrl === modelUrl) {
        onDialoguePageAdvance();
        return;
    }

    loadAndCacheModel(modelUrl).then((gltf) => {
        if (!isStageActive) return;
        setupNPCInStage(gltf, modelUrl, speakerName);
    });

    if (!animFrameId) {
        renderStageLoop();
    }
}

/**
 * Oculta y limpia el escenario de estudio cinemático
 */
export function hideDialogueStage() {
    if (!overlay) return;

    isStageActive = false;
    overlay.classList.remove('visible');

    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }

    // Esperar al fade-out completo (550ms) antes de desmantelar
    setTimeout(() => {
        if (!isStageActive && overlay) {
            overlay.style.display = 'none';
            if (currentModel) {
                scene.remove(currentModel);
                currentModel = null;
            }
            if (currentMixer) {
                currentMixer.stopAllAction();
                currentMixer = null;
            }
            currentLoadedUrl = null;
            currentSpeaker = '';
        }
    }, 560);
}

/**
 * Callback cuando el diálogo avanza de página: anima un gesto vivo del NPC
 */
export function onDialoguePageAdvance() {
    if (!currentClipAction) return;
    try {
        currentClipAction.reset();
        currentClipAction.fadeIn(0.2);
        currentClipAction.play();
    } catch (_) {}
}
