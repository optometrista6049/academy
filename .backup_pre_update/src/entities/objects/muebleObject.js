import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { scene } from '../../core/scene.js';
import { getHeightAt } from '../../terrain/terrainHeight.js';
import { addCollidable } from '../collisions.js';
import { registerWorldObject } from '../../systems/visibilitySystem.js';
import { gameState } from '../../state/gameState.js';
import { MUEBLE_GLB_BASE64 } from './muebleModelData.js';

let muebleObject = null;
let muebleDrawerData = null;

/**
 * Genera coordenadas UV (mapeo cúbico / triplanar proyectado) para mallas
 * que no disponen de TEXCOORD_0 en su archivo GLTF de origen.
 */
function applyCabinetUVs(mesh, box, repeat = 1.0) {
    if (!mesh || !mesh.geometry) return;
    const geom = mesh.geometry;
    const pos = geom.attributes.position;
    const norm = geom.attributes.normal;
    if (!pos) return;

    const count = pos.count;
    const uvs = new Float32Array(count * 2);

    const minX = box.min.x;
    const maxX = box.max.x;
    const minY = box.min.y;
    const maxY = box.max.y;
    const minZ = box.min.z;
    const maxZ = box.max.z;

    const dx = (maxX - minX) || 1;
    const dy = (maxY - minY) || 1;
    const dz = (maxZ - minZ) || 1;

    for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);

        const nx = norm ? Math.abs(norm.getX(i)) : 0;
        const ny = norm ? Math.abs(norm.getY(i)) : 0;
        const nz = norm ? Math.abs(norm.getZ(i)) : 0;

        let u = 0;
        let v = 0;

        // En el sistema de coordenadas local del Drawer_4:
        // X = Anchura frontal/trasera
        // Y = Profundidad (frente de cajones)
        // Z = Altura vertical
        if (nx >= ny && nx >= nz) {
            // Laterales izquierdo / derecho (plano Y-Z)
            u = ((y - minY) / dy) * repeat;
            v = ((z - minZ) / dz) * repeat;
        } else if (ny >= nx && ny >= nz) {
            // Frontal de los cajones y trasera (plano X-Z)
            // Las vetas se extienden horizontalmente a lo largo del cajón
            u = ((x - minX) / dx) * repeat;
            v = ((z - minZ) / dz) * repeat;
        } else {
            // Tapa superior y base (plano X-Y)
            u = ((x - minX) / dx) * repeat;
            v = ((y - minY) / dy) * repeat;
        }

        uvs[i * 2] = u;
        uvs[i * 2 + 1] = v;
    }

    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.attributes.uv.needsUpdate = true;
}

/**
 * Dibuja un veteado de madera procedimental con ondas y anillos contrastados
 */
function drawProceduralWood(ctx, width, height) {
    // Fondo de madera cálida miel / ámbar
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#e4aa6b');
    bgGrad.addColorStop(0.5, '#cf8c4d');
    bgGrad.addColorStop(1, '#bd793b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Capa de vetas primarias fluidas muy contrastadas
    for (let i = 0; i < 70; i++) {
        const y = (i / 70) * height;
        ctx.beginPath();
        const isMainRing = (i % 4 === 0);
        const alpha = isMainRing ? 0.55 : 0.28;
        ctx.strokeStyle = isMainRing ? `rgba(54, 24, 6, ${alpha})` : `rgba(92, 44, 14, ${alpha})`;
        ctx.lineWidth = isMainRing ? 3.8 : 1.8;

        for (let x = 0; x <= width; x += 12) {
            const wave = Math.sin(x * 0.011 + i * 0.42) * 24 + Math.sin(x * 0.026 + i * 0.15) * 10;
            const py = y + wave;
            if (x === 0) ctx.moveTo(x, py);
            else ctx.lineTo(x, py);
        }
        ctx.stroke();
    }

    // Micro-fibras finas para textura táctil
    ctx.strokeStyle = 'rgba(40, 18, 5, 0.12)';
    ctx.lineWidth = 1;
    for (let j = 0; j < 120; j++) {
        const y = (j / 120) * height;
        ctx.beginPath();
        for (let x = 0; x <= width; x += 20) {
            const wave = Math.sin(x * 0.04 + j) * 5;
            if (x === 0) ctx.moveTo(x, y + wave);
            else ctx.lineTo(x, y + wave);
        }
        ctx.stroke();
    }
}

/**
 * Crea la textura de madera con vetas de alto contraste y resolución
 * combinando la imagen de muestra de StockCake y el generador de vetas.
 */
function createEnhancedWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Inicializar de inmediato con el veteado procedimental
    drawProceduralWood(ctx, 1024, 1024);

    const canvasTexture = new THREE.CanvasTexture(canvas);
    canvasTexture.wrapS = THREE.RepeatWrapping;
    canvasTexture.wrapT = THREE.RepeatWrapping;
    canvasTexture.repeat.set(1.0, 1.0);
    canvasTexture.generateMipmaps = true;
    canvasTexture.minFilter = THREE.LinearMipmapLinearFilter;
    canvasTexture.magFilter = THREE.LinearFilter;
    canvasTexture.anisotropy = 8;
    if (THREE.sRGBEncoding) {
        canvasTexture.encoding = THREE.sRGBEncoding;
    }

    // Cargar la imagen de muestra real de StockCake y renderizarla con contraste reforzado
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = 'assets/textures/wood_grain.jpg';
    img.onload = () => {
        ctx.clearRect(0, 0, 1024, 1024);
        ctx.filter = 'contrast(1.45) saturate(1.25) brightness(1.02)';
        ctx.drawImage(img, 0, 0, 1024, 1024);
        ctx.filter = 'none';
        canvasTexture.needsUpdate = true;
    };

    return canvasTexture;
}

/**
 * Crea un mapa de reflexión ambiental equirectangular para metales.
 * Permite que los pomos metálicos reflejen luz de cielo y brillen vívidamente
 * incluso sin un mapa HDR global en la escena.
 */
function createMetallicReflectionMap() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Gradiente de cielo diurno y horizonte soleado
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, '#ffffff'); // Luz zenital pura
    grad.addColorStop(0.3, '#d8f0ff'); // Cielo azul brillante
    grad.addColorStop(0.48, '#ffffff'); // Horizonte luminoso
    grad.addColorStop(0.53, '#ffe082'); // Destello dorado solar
    grad.addColorStop(0.72, '#966d3a'); // Reflejo cálido de suelo
    grad.addColorStop(1.0, '#4a2c14');  // Base profunda

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    // Destello de sol intenso para generar un reflejo especular marcado
    const sun = ctx.createRadialGradient(150, 40, 2, 150, 40, 45);
    sun.addColorStop(0, 'rgba(255, 255, 255, 1)');
    sun.addColorStop(0.35, 'rgba(255, 245, 200, 0.9)');
    sun.addColorStop(1, 'rgba(255, 235, 170, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, 256, 128);

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.generateMipmaps = true;
    return tex;
}

function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function applyMuebleModel(model, woodBodyMaterial, woodDrawerMaterial, metallicKnobMaterial, onLoaded) {
    // Bounding box inicial para calcular proporciones
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    const desiredHeight = 0.90; // Altura cómoda a la cintura
    const baseScale = desiredHeight / (size.y || 1);

    // Aumentar ancho (+50%) y fondo (+60%) para darle mayor presencia y robustez señorial
    const scaleX = baseScale * 1.50;
    const scaleY = baseScale;
    const scaleZ = baseScale * 1.60;
    model.scale.set(scaleX, scaleY, scaleZ);

    // Rotación exacta de 180 grados para que los pomos miren hacia el jugador
    model.rotation.y = Math.PI;

    // Recalcular caja tras escalado y rotación para alineación vertical exacta
    box.setFromObject(model);
    const groundOffset = -box.min.y;

    // Coordenadas solicitadas por el usuario
    const x = 14.77;
    const z = 23.26;
    const groundY = getHeightAt(x, z);

    model.position.set(x, groundY + groundOffset, z);

    // Bounding box unificada para proyección de UVs coordinadas en el mueble
    const cabinetBox = {
        min: { x: -0.014, y: -0.0056, z: 0.0 },
        max: { x: 0.014, y: 0.0056, z: 0.021 }
    };

    // Aplicar UVs generadas y asignar los nuevos materiales estilizados
    model.traverse((child)=>{
        if(child.isMesh){
            child.castShadow = true;
            child.receiveShadow = true;

            const matName = child.material ? child.material.name : '';

            if(matName === 'Wood' || child.name === 'Drawer_4_1'){
                // Estructura y laterales del mueble
                applyCabinetUVs(child, cabinetBox, 1.0);
                child.material = woodBodyMaterial;
            } else if(matName === 'Wood_Light' || child.name === 'Drawer_4_2'){
                // Frontal de los cajones
                applyCabinetUVs(child, cabinetBox, 1.0);
                child.material = woodDrawerMaterial;
            } else if(matName === 'Wood_Dark' || child.name === 'Drawer_4_3'){
                // Pomos y tiradores: conservan su posición nativa milimétricamente pegados a cada cajón
                child.material = metallicKnobMaterial;
            } else {
                applyCabinetUVs(child, cabinetBox, 1.0);
                child.material = woodBodyMaterial;
            }
        }
    });

    // Configuración de colisión física acorde a las nuevas dimensiones (más ancho y profundo)
    model.userData.radius = 0.95;
    model.userData.type = 'mueble';
    model.userData.solid = true;

    addCollidable(model);
    registerWorldObject(model, 'prop');

    scene.add(model);
    muebleObject = model;

    setupInteractiveDrawer(
        woodDrawerMaterial,
        woodBodyMaterial,
        metallicKnobMaterial,
        groundY,
        groundOffset
    );

    console.log('MUEBLE 3D LOADED: width=1.82m, height=0.90m, depth=0.78m at (14.77, 23.26)');

    if(onLoaded){
        onLoaded(muebleObject);
    }
}

function buildProceduralMuebleFallback(woodBodyMaterial, woodDrawerMaterial, metallicKnobMaterial, onLoaded) {
    console.log('Building high-fidelity procedural mueble fallback model...');
    const group = new THREE.Group();

    // Cuerpo principal
    const bodyGeom = new THREE.BoxGeometry(1.82, 0.90, 0.78);
    const bodyMesh = new THREE.Mesh(bodyGeom, woodBodyMaterial);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    const x = 14.77;
    const z = 23.26;
    const groundY = getHeightAt(x, z);
    const groundOffset = 0.45;

    group.position.set(x, groundY + groundOffset, z);
    group.userData.radius = 0.95;
    group.userData.type = 'mueble';
    group.userData.solid = true;

    addCollidable(group);
    registerWorldObject(group, 'prop');

    scene.add(group);
    muebleObject = group;

    setupInteractiveDrawer(
        woodDrawerMaterial,
        woodBodyMaterial,
        metallicKnobMaterial,
        groundY,
        groundOffset
    );

    if(onLoaded){
        onLoaded(muebleObject);
    }
}

export function loadMuebleObject(onLoaded = null){

    console.log('LOADING MUEBLE 3D OBJECT (EXTRA WIDTH & DEPTH, VIVID METALLIC KNOBS)...');

    const woodTexture = createEnhancedWoodTexture();
    const metallicReflectionMap = createMetallicReflectionMap();

    // Materiales especializados para estructura y cajones
    const woodBodyMaterial = new THREE.MeshStandardMaterial({
        map: woodTexture,
        color: 0xffffff,
        roughness: 0.38,
        metalness: 0.02
    });

    const woodDrawerMaterial = new THREE.MeshStandardMaterial({
        map: woodTexture,
        color: 0xfffcf7,
        roughness: 0.35,
        metalness: 0.02
    });

    // Pomos metálicos de alto brillo y reflectividad (dorado resplandeciente / latón pulido)
    const metallicKnobMaterial = new THREE.MeshStandardMaterial({
        color: 0xffea85,               // Tono dorado luminoso y limpio
        roughness: 0.08,               // Acabado espejo ultra pulido
        metalness: 0.85,               // Muy metálico
        emissive: 0xffa726,            // Emisión cálida viva para que destaquen sobre la madera
        emissiveIntensity: 0.32,       // Intensidad de emisión para máximo resalte visual
        envMap: metallicReflectionMap, // Reflejo ambiental 360° para brillo constante
        envMapIntensity: 2.8           // Resalta los destellos metálicos
    });

    const loader = new GLTFLoader();
    loader.setWithCredentials(true);

    // 1. Prioridad: Cargar directamente desde el binario embebido en memoria
    // Elimina peticiones de red, es 100% inmune a CORS, iframes, cookies o rutas de Vite
    if (typeof MUEBLE_GLB_BASE64 === 'string' && MUEBLE_GLB_BASE64.length > 100) {
        try {
            const arrayBuffer = base64ToArrayBuffer(MUEBLE_GLB_BASE64);
            loader.parse(
                arrayBuffer,
                '',
                (gltf) => {
                    applyMuebleModel(gltf.scene, woodBodyMaterial, woodDrawerMaterial, metallicKnobMaterial, onLoaded);
                },
                (parseErr) => {
                    console.warn('Error al procesar modelo embebido, reintentando vía red:', parseErr);
                    tryLoadFromNetwork();
                }
            );
            return;
        } catch (e) {
            console.warn('Excepción al decodificar modelo embebido:', e);
        }
    }

    tryLoadFromNetwork();

    function tryLoadFromNetwork() {
        loader.load(
            'assets/models/mueble.glb',
            (gltf) => {
                applyMuebleModel(gltf.scene, woodBodyMaterial, woodDrawerMaterial, metallicKnobMaterial, onLoaded);
            },
            undefined,
            (error) => {
                console.warn('Carga de mueble.glb por red falló, activando modelo procedural estilizado:', error);
                buildProceduralMuebleFallback(woodBodyMaterial, woodDrawerMaterial, metallicKnobMaterial, onLoaded);
            }
        );
    }

}

function createCardboardTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base kraft paper
    ctx.fillStyle = '#b88a57';
    ctx.fillRect(0, 0, 512, 512);

    // Fibras de cartón sutiles
    for (let i = 0; i < 2500; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const len = Math.random() * 8 + 3;
        ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(80, 50, 20, 0.08)' : 'rgba(255, 235, 190, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y);
        ctx.stroke();
    }

    // Cinta de embalaje sobre la junta superior
    ctx.fillStyle = 'rgba(235, 205, 155, 0.85)';
    ctx.fillRect(0, 220, 512, 70);
    ctx.strokeStyle = 'rgba(160, 120, 70, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 220, 512, 70);

    // Estampado de sello FRÁGIL
    ctx.strokeStyle = 'rgba(60, 35, 15, 0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(60, 60, 100, 100);
    ctx.fillStyle = 'rgba(60, 35, 15, 0.55)';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('FRÁGIL', 72, 118);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function setupInteractiveDrawer(woodDrawerMaterial, woodBodyMaterial, metallicKnobMaterial, groundY, groundOffset) {
    const drawerGroup = new THREE.Group();

    // Frontal del cajón superior izquierdo
    const frontGeom = new THREE.BoxGeometry(0.74, 0.26, 0.025);
    const frontMesh = new THREE.Mesh(frontGeom, woodDrawerMaterial);
    frontMesh.castShadow = true;
    frontMesh.receiveShadow = true;
    drawerGroup.add(frontMesh);

    // Pomos metálicos a juego con los tiradores originales
    const knobGeom = new THREE.CylinderGeometry(0.016, 0.022, 0.035, 16);
    knobGeom.rotateX(Math.PI / 2);

    const leftKnob = new THREE.Mesh(knobGeom, metallicKnobMaterial);
    leftKnob.position.set(-0.20, 0, -0.025);
    drawerGroup.add(leftKnob);

    const rightKnob = new THREE.Mesh(knobGeom, metallicKnobMaterial);
    rightKnob.position.set(0.20, 0, -0.025);
    drawerGroup.add(rightKnob);

    // Placa de cerradura (bocallave)
    const escutcheonGeom = new THREE.CylinderGeometry(0.022, 0.022, 0.005, 16);
    escutcheonGeom.rotateX(Math.PI / 2);
    const escutcheon = new THREE.Mesh(escutcheonGeom, metallicKnobMaterial);
    escutcheon.position.set(0, 0.02, -0.015);
    drawerGroup.add(escutcheon);

    // Ranura oscura de la cerradura
    const keyholeGeom = new THREE.BoxGeometry(0.004, 0.016, 0.006);
    const keyholeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const keyhole = new THREE.Mesh(keyholeGeom, keyholeMat);
    keyhole.position.set(0, 0.02, -0.018);
    drawerGroup.add(keyhole);

    // Caja interior del cajón (base, laterales y fondo)
    const bottomGeom = new THREE.BoxGeometry(0.70, 0.02, 0.50);
    const bottomMesh = new THREE.Mesh(bottomGeom, woodBodyMaterial);
    bottomMesh.position.set(0, -0.12, 0.25);
    drawerGroup.add(bottomMesh);

    const sideGeom = new THREE.BoxGeometry(0.02, 0.22, 0.50);
    const leftSide = new THREE.Mesh(sideGeom, woodBodyMaterial);
    leftSide.position.set(-0.35, 0, 0.25);
    drawerGroup.add(leftSide);

    const rightSide = new THREE.Mesh(sideGeom, woodBodyMaterial);
    rightSide.position.set(0.35, 0, 0.25);
    drawerGroup.add(rightSide);

    const backGeom = new THREE.BoxGeometry(0.70, 0.22, 0.02);
    const backMesh = new THREE.Mesh(backGeom, woodBodyMaterial);
    backMesh.position.set(0, 0, 0.50);
    drawerGroup.add(backMesh);

    // Llave 3D dorada
    const keyGroup = new THREE.Group();
    const ringGeom = new THREE.TorusGeometry(0.022, 0.005, 12, 24);
    const ringMesh = new THREE.Mesh(ringGeom, metallicKnobMaterial);
    ringMesh.position.set(0, 0, -0.05);
    keyGroup.add(ringMesh);

    const shaftGeom = new THREE.CylinderGeometry(0.004, 0.004, 0.05, 12);
    shaftGeom.rotateX(Math.PI / 2);
    const shaftMesh = new THREE.Mesh(shaftGeom, metallicKnobMaterial);
    shaftMesh.position.set(0, 0, -0.025);
    keyGroup.add(shaftMesh);

    const bitGeom = new THREE.BoxGeometry(0.005, 0.014, 0.010);
    const bitMesh = new THREE.Mesh(bitGeom, metallicKnobMaterial);
    bitMesh.position.set(0, -0.008, -0.008);
    keyGroup.add(bitMesh);

    keyGroup.position.set(0, 0.02, -0.02);
    drawerGroup.add(keyGroup);

    // Caja de cartón 3D ("Caja de cartón")
    const boxGroup = new THREE.Group();
    const cardboardTex = createCardboardTexture();
    const cardboardMat = new THREE.MeshStandardMaterial({
        map: cardboardTex,
        roughness: 0.88,
        metalness: 0.02
    });

    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.18, 0.24), cardboardMat);
    boxMesh.castShadow = true;
    boxMesh.receiveShadow = true;
    boxGroup.add(boxMesh);

    const glowLight = new THREE.PointLight(0xffd54f, 0, 2.5);
    glowLight.position.set(0, 0.15, 0);
    boxGroup.add(glowLight);

    boxGroup.position.set(0, -0.02, 0.22);
    drawerGroup.add(boxGroup);

    // Posición del cajón en escena
    const closedZ = 22.86;
    const openZ = 22.48;
    const baseY = groundY + groundOffset + 0.63;
    drawerGroup.position.set(14.35, baseY, closedZ);
    scene.add(drawerGroup);

    const alreadyOpened = Boolean(gameState.flags.openedMueble);
    if (alreadyOpened) {
        drawerGroup.position.z = openZ;
        keyGroup.visible = true;
        keyGroup.position.z = -0.02;
        keyGroup.rotation.z = Math.PI / 2;
        boxGroup.visible = false;
    } else {
        drawerGroup.position.z = closedZ;
        keyGroup.visible = false;
        boxGroup.visible = true;
    }

    muebleDrawerData = {
        drawerGroup,
        keyGroup,
        boxGroup,
        glowLight,
        closedZ,
        openZ,
        baseY,
        setDrawerProgress(progress) {
            drawerGroup.position.z = closedZ - (closedZ - openZ) * progress;
        },
        setKeyProgress(insertProgress, turnProgress, forceVisible = null) {
            if (forceVisible !== null) {
                keyGroup.visible = Boolean(forceVisible);
            } else {
                keyGroup.visible = insertProgress > 0.05;
            }
            keyGroup.position.z = -0.60 + (-0.02 - (-0.60)) * insertProgress;
            keyGroup.rotation.z = (Math.PI / 2) * turnProgress;
        },
        setBoxLift(liftProgress) {
            boxGroup.position.y = -0.02 + liftProgress * 0.12;
            glowLight.intensity = liftProgress * 1.8;
        },
        hideBox() {
            boxGroup.visible = false;
            glowLight.intensity = 0;
        }
    };
}

export function getMuebleDrawer(){
    return muebleDrawerData;
}

export function getMuebleObject(){
    return muebleObject;
}
