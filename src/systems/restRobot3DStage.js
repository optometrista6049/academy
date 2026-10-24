/* ======================================================
   MONTESERIN ACADEMY - REST ROBOT 3D STAGE
   Renderiza en 3D en tiempo real al Robot Aspirante sentado
   en actitud de descanso (clip 'RobotArmature|Robot_Sitting')
   para la Pantalla de Reposo y Enfriamiento de 3 Horas.
   ====================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';

let renderer = null;
let scene = null;
let camera = null;
let mixer = null;
let animFrameId = null;
let currentModel = null;
let clock = null;
let cachedGLTF = null;
let isStageActive = false;

const gltfLoader = new GLTFLoader();

let resizeObserver = null;

export function mountRestRobot3DStage(container) {
    if (!container) return;
    unmountRestRobot3DStage(); // Limpiar previo si existía

    isStageActive = true;
    clock = new THREE.Clock();

    const w = container.clientWidth || 210;
    const h = container.clientHeight || 170;

    // 1. Escena
    scene = new THREE.Scene();

    // 2. Cámara enfocando al robot durmiendo sentado con encuadre amplio, holgado y sin cortes
    camera = new THREE.PerspectiveCamera(27, w / h, 0.1, 20);
    camera.position.set(0, 0.04, 3.2);
    camera.lookAt(0, -0.06, 0);

    // 3. Luces con atmósfera suave de descanso y enfriamiento
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x38bdf8, 1.4); // Cian suave
    keyLight.position.set(1.5, 2.0, 2.2);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffd54f, 0.8); // Halo dorado tenue
    rimLight.position.set(-1.4, 1.2, -1.8);
    scene.add(rimLight);

    // 4. Canvas y Renderer
    const canvas = document.createElement('canvas');
    canvas.className = 'robotRest3DCanvas';
    canvas.width = w * Math.min(window.devicePixelRatio || 1, 2);
    canvas.height = h * Math.min(window.devicePixelRatio || 1, 2);

    renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.outputEncoding = THREE.sRGBEncoding;

    container.innerHTML = '';
    container.appendChild(canvas);

    // Observador reactivo de redimensionamiento
    if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => {
            if (!renderer || !camera || !container || !isStageActive) return;
            const nw = container.clientWidth;
            const nh = container.clientHeight;
            if (nw > 10 && nh > 10) {
                camera.aspect = nw / nh;
                camera.updateProjectionMatrix();
                renderer.setSize(nw, nh);
            }
        });
        resizeObserver.observe(container);
    }

    // 5. Cargar / Reutilizar modelo del Robot Aspirante
    if (cachedGLTF) {
        setupRobotModel(cachedGLTF);
    } else {
        gltfLoader.load(
            'assets/models/RobotAnimado.glb',
            (gltf) => {
                cachedGLTF = gltf;
                if (isStageActive) {
                    setupRobotModel(gltf);
                }
            },
            undefined,
            (err) => {
                console.warn('No se pudo cargar el modelo 3D del robot para reposo:', err);
            }
        );
    }

    // 6. Bucle de renderizado con respiración sutil de descanso
    function animate() {
        if (!isStageActive) return;
        animFrameId = requestAnimationFrame(animate);

        const delta = clock.getDelta();
        const elapsed = clock.getElapsedTime();

        if (mixer) {
            mixer.update(delta);
        }

        // Efecto de respiración reposada mientras duerme sentado con holgura
        if (currentModel) {
            currentModel.position.y = -0.38 + Math.sin(elapsed * 1.5) * 0.003;
            currentModel.rotation.z = Math.sin(elapsed * 0.8) * 0.005;
        }

        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }

    animate();
}

function setupRobotModel(gltf) {
    if (!scene || !isStageActive) return;

    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }

    // Clonar escena del modelo
    const model = gltf.scene.clone(true);
    currentModel = model;

    // Escalar al tamaño óptimo y centrar verticalmente para amplio margen arriba y abajo
    model.scale.set(0.155, 0.155, 0.155);
    model.position.set(0, -0.38, 0);
    model.rotation.y = 0.28; // Inclinación diagonal suave y atractiva

    scene.add(model);

    // Configurar animación 'Robot_Sitting' ejecutándose 1 sola vez y manteniéndose sentado (sin bucle de sentadillas)
    mixer = new THREE.AnimationMixer(model);

    const sittingClip = gltf.animations.find(
        (a) => a.name.toLowerCase().includes('sitting') || a.name.toLowerCase().includes('sit')
    ) || gltf.animations.find(
        (a) => a.name.toLowerCase().includes('idle')
    );

    if (sittingClip) {
        const action = mixer.clipAction(sittingClip);
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true; // Permanece sentado en reposo al terminar de sentarse
        action.play();
    }
}

export function unmountRestRobot3DStage() {
    isStageActive = false;

    if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch {}
        resizeObserver = null;
    }

    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }

    if (mixer) {
        mixer.stopAllAction();
        mixer = null;
    }

    if (renderer) {
        try {
            renderer.dispose();
            renderer.forceContextLoss();
        } catch {}
        renderer = null;
    }

    if (scene) {
        while (scene.children.length > 0) {
            const obj = scene.children[0];
            scene.remove(obj);
        }
        scene = null;
    }

    currentModel = null;
    camera = null;
    clock = null;
}
