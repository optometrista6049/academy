import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { scene } from '../../core/scene.js';
import { getHeightAt } from '../../terrain/terrainHeight.js';
import { addCollidable } from '../collisions.js';
import { registerWorldObject } from '../../systems/visibilitySystem.js';

let muebleObject = null;

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

    loader.load(
        'assets/models/mueble.glb',
        (gltf)=>{

            const model = gltf.scene;

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

            console.log('MUEBLE 3D LOADED: width=1.82m, height=0.90m, depth=0.78m at (14.77, 23.26)');

            if(onLoaded){
                onLoaded(muebleObject);
            }

        },
        undefined,
        (error)=>{
            console.error('Error loading mueble.glb:', error);
        }
    );

}

export function getMuebleObject(){
    return muebleObject;
}
