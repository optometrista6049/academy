import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/utils/SkeletonUtils.js';

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
let hairLight = null;

// Caché de modelos y animaciones GLTF para apertura instantánea
const npcModelCache = {};
const gltfLoader = new GLTFLoader();
gltfLoader.setWithCredentials(true);

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

    const savedLogo = localStorage.getItem('monteserin_custom_logo') || 'assets/ui/monteserin_academy_logo_clean.png';

    overlay = document.createElement('div');
    overlay.id = 'dialogueStageOverlay';
    overlay.className = 'dialogue-stage-overlay';
    overlay.innerHTML = `
        <div class="dialogue-stage-backdrop"></div>
        <div class="dialogue-stage-iris"></div>
        <div class="dialogue-stage-watermark" aria-hidden="true">
            <img src="${savedLogo}" alt="Monteserín Academy" class="dialogue-stage-logo-img" />
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
    camera = new THREE.PerspectiveCamera(25, w / h, 0.1, 50);
    camera.position.set(0, 0.38, 3.65);
    camera.lookAt(0, 0.35, 0);

    // Iluminación de estudio con matices esmeralda, luz principal cálida dorada y rim light
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
    // Luz ambiental equilibrada y neutra para preservar fidelidad cromática
    ambientLight = new THREE.AmbientLight(0xffffff, 0.90);
    scene.add(ambientLight);

    // Luz principal clara y suave, sin amarillear excesivamente los tonos capilares
    keyLight = new THREE.DirectionalLight(0xfff8f2, 1.15);
    keyLight.position.set(1.4, 2.8, 2.5);
    scene.add(keyLight);

    // Luz de relleno suave para matizar sombras
    fillLight = new THREE.DirectionalLight(0xf2f4f8, 0.45);
    fillLight.position.set(-1.8, 1.4, 1.8);
    scene.add(fillLight);

    // Luz cenital suave para dar volumen sin quemar ni desteñir el cabello a rubio
    hairLight = new THREE.DirectionalLight(0xffece0, 0.55);
    hairLight.position.set(0.2, 3.2, 0.8);
    scene.add(hairLight);

    // Luz de recorte posterior neutra-blanca
    rimLight = new THREE.DirectionalLight(0xfff5ea, 0.90);
    rimLight.position.set(0, 2.4, -2.4);
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
        // En caso de redimensión vertical
        camera.fov = 30;
        camera.position.set(0, 0.40, 3.65);
        camera.lookAt(0, 0.36, 0);
    } else {
        // Móvil horizontal / Desktop: encuadre de plano medio calibrado
        // con margen superior holgado (headroom) para que jamás se corten las orejas ni el peinado
        camera.fov = 25;
        camera.position.set(0, 0.38, 3.65);
        camera.lookAt(0, 0.35, 0);
    }
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);

    // Ajustar posición horizontal del modelo según si es pantalla ancha o móvil
    if (currentModel) {
        const baseX = isPortrait ? 0 : 0.40;
        currentModel.userData.baseX = baseX;
        currentModel.position.x = baseX;
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
    const isTeleron = speakerLower.includes('teleron') || 
                      speakerLower.includes('telerón') || 
                      (modelUrl && modelUrl.toLowerCase().includes('teleron'));
    const isTelerin = (speakerLower.includes('telerin') || 
                       speakerLower.includes('telerín') || 
                       (modelUrl && modelUrl.toLowerCase().includes('telerin'))) && !isTeleron;

    // Igualar y calibrar color de pelo para Telerín y Telerón idénticos al 3D
    if (isTelerin || isTeleron) {
        model.traverse((child) => {
            if (child.isMesh && (child.name === 'Hair' || child.name.toLowerCase().includes('hair')) && child.material) {
                const hairMat = child.material.clone();
                hairMat.map = null;
                if (isTeleron) {
                    // Pelirrojo puro y rojizo intenso (#c83e18), eliminando el deslumbramiento amarillo/rubio
                    hairMat.color.set('#c83e18');
                    hairMat.emissive = new THREE.Color('#4d1004');
                    hairMat.roughness = 0.82;
                    hairMat.metalness = 0.04;
                } else {
                    // Castaño profundo para Telerín (#382317), idéntico al tono del entorno 3D
                    // y sin emisión artificial para mantener los contrastes y sombras reales
                    hairMat.color.set('#382317');
                    hairMat.emissive = new THREE.Color(0x000000);
                    hairMat.roughness = 0.85;
                    hairMat.metalness = 0.03;
                }
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

    // Ajuste uniforme y proporcional de escala y centrado para todos los NPCs
    // Altura calibrada a 1.76 para todos (Telerín, Telerón, Señor Alto y Panda)
    // asegurando encuadre de plano medio con margen superior holgado (headroom)
    // para que jamás se corten las orejas ni el peinado en móvil horizontal
    const desiredHeight = 1.76;
    const scale = desiredHeight / (size.y || 1);
    model.scale.setScalar(scale);

    // Centrar en el escenario
    box.setFromObject(model);
    const isPortrait = (window.innerWidth / window.innerHeight) < 1;
    const baseX = isPortrait ? 0 : 0.38;
    model.position.x = baseX; // En horizontal hacia la derecha del logo
    model.userData.baseX = baseX;
    model.position.z = 0;
    model.position.y = isPortrait 
        ? (-box.min.y - 0.78) 
        : (-box.min.y - 0.94);

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
        // Micro-movimiento sutil de respiración/presencia sin sobreescribir la posición base
        const t = performance.now() * 0.001;
        const baseX = typeof currentModel.userData.baseX === 'number' ? currentModel.userData.baseX : 0;
        currentModel.position.x = baseX + Math.sin(t * 0.8) * 0.012;
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

    const logoImg = overlay.querySelector('.dialogue-stage-logo-img');
    if (logoImg) {
        const savedLogo = localStorage.getItem('monteserin_custom_logo');
        if (savedLogo && logoImg.src !== savedLogo) {
            logoImg.src = savedLogo;
        }
    }

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

    // Esperar al fade-out completo (1200ms) antes de desmantelar
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
    }, 1200);
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
