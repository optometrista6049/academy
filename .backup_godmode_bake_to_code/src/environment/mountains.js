import * as THREE from 'three';

import { scene } from '../core/scene.js';

import {

    WORLD_SIZE,
    LIMIT

} from '../core/config.js';

import {

    rand

} from '../utils/random.js';

import {
    addCollidable,
    cameraObstacles
} from '../entities/collisions.js';

import { riverSpline } from '../terrain/riverPath.js';

// ============================================================================
// PUNTOS CLAVE DEL NACIMIENTO DEL RÍO 1 (Afluente del Lago)
// ============================================================================
// El nacimiento discurre entre t=0.12 (dentro del macizo x:254, z:254) y t=0.35 (x:220, z:208)
// Pasando exactamente por la zona del manto de partículas y espuma en x: 233, z: 222..232
const SPRING_CLEARANCE_SAMPLES = [];
for (let t = 0.12; t <= 0.36; t += 0.005) {
    SPRING_CLEARANCE_SAMPLES.push(riverSpline.getPoint(t));
}

// ============================================================================
// PALETAS MINERALES PROCEDURALES PARA ESTRATIFICACIÓN GEOLÓGICA
// ============================================================================
const GEOLOGY_PALETTES = [
    // 1. Granito alpino gris-azulado (pizarra basal, granito medio, aristas frías claras)
    {
        base: new THREE.Color(0.22, 0.26, 0.20),
        mid:  new THREE.Color(0.34, 0.37, 0.40),
        high: new THREE.Color(0.50, 0.54, 0.58),
        peak: new THREE.Color(0.72, 0.76, 0.80)
    },
    // 2. Arenisca mineral y caliza cálida (tierra pardo-verdosa, estratos arcilla/ocre, caliza dorada)
    {
        base: new THREE.Color(0.26, 0.24, 0.19),
        mid:  new THREE.Color(0.42, 0.38, 0.33),
        high: new THREE.Color(0.58, 0.54, 0.48),
        peak: new THREE.Color(0.78, 0.74, 0.68)
    },
    // 3. Pizarra oscura y esquisto profundo (humus basal, pizarra grafito, roca ceniza)
    {
        base: new THREE.Color(0.19, 0.22, 0.18),
        mid:  new THREE.Color(0.29, 0.31, 0.34),
        high: new THREE.Color(0.44, 0.47, 0.51),
        peak: new THREE.Color(0.66, 0.69, 0.73)
    }
];

// Material único de alto rendimiento con sombreado facetado e iluminación por vértice
const mountainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.06,
    flatShading: true
});

/**
 * Esculpe una geometría de macizo montañoso alpino altamente orgánico:
 * - Ruido fractal multi-octava (FBM) que elimina toda apariencia de cono geométrico
 * - Cumbres alargadas en arista (arêtes) y espolones asimétricos
 * - Paredes abruptas verticales combinadas con vertientes tendidas de canchal
 * - Fisuras, cárcavas y estratificación geológica horizontal
 * - Gradiente mineral y simulación de sombra oclusiva según inclinación de faceta
 */
function generateOrganicMountainGeo(radius, height) {
    const radialSegs = 10 + Math.floor(rand() * 3); // 10 a 12 facetas para rica geometría low-poly natural
    const heightSegs = 8; // 8 anillos para modelar estratos y transiciones verticales suaves
    const geo = new THREE.ConeGeometry(radius, height, radialSegs, heightSegs, false);
    const pos = geo.attributes.position;
    const colors = [];

    // Selección de familia mineral y matiz individual
    const palette = GEOLOGY_PALETTES[Math.floor(rand() * GEOLOGY_PALETTES.length)];
    const tintR = (rand() - 0.5) * 0.04;
    const tintG = (rand() - 0.5) * 0.03;
    const tintB = (rand() - 0.5) * 0.04;

    const baseCol = palette.base.clone().addScalar(tintR);
    const midCol  = palette.mid.clone().addScalar(tintG);
    const highCol = palette.high.clone().addScalar(tintB);
    const peakCol = palette.peak.clone().addScalar(tintR * 0.5);

    // Morfología y tipología de cumbre (Domo alpino, espolón asimétrico o arista unificada)
    const crestAngle = rand() * Math.PI * 2;
    const crestLength = radius * (0.20 + rand() * 0.22);
    const peakShiftX = (rand() - 0.5) * radius * 0.38;
    const peakShiftZ = (rand() - 0.5) * radius * 0.38;

    // Suavizado vertical apical (allana la aguja de radio cero convirtiéndola en cumbre rocosa erosionada)
    const apexDip = height * (0.028 + rand() * 0.032);
    const summitBulge = 0.15 + rand() * 0.12;

    // Fases de armónicos FBM
    const p1 = rand() * Math.PI * 2;
    const p2 = rand() * Math.PI * 2;
    const p3 = rand() * Math.PI * 2;
    const p4 = rand() * Math.PI * 2;
    const ridgeCount = rand() > 0.4 ? 3 : 2;

    // Contrafuerte o aguja lateral en ~40% de las cumbres (a cota media, nunca en la cumbre)
    const hasSpur = rand() > 0.58;
    const spurAngle = rand() * Math.PI * 2;
    const spurNormY = 0.38 + rand() * 0.18;
    const spurBulge = radius * (0.20 + rand() * 0.16);

    for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i);
        let z = pos.getZ(i);

        // Progreso normalizado de altura: 0 en la base, 1 en la cumbre
        const t = Math.max(0, Math.min(1, (y + height * 0.5) / height));

        if (t >= 0.98) {
            // CÚSPIDE UNIFICADA: Todos los vértices del extremo superior comparten
            // exactamente la misma coordenada 3D, imposibilitando la división o duplicación de picos
            x = peakShiftX;
            z = peakShiftZ;
            y = (height * 0.5) - apexDip;
        } else if (t > 0.01) {
            const angle = Math.atan2(z, x);

            // 1. Armónicos fractales multi-octava (Macro-relieve + Meso-aristas + Micro-relieve)
            const macroRidge = Math.cos(angle * ridgeCount + p1) * 0.24 + Math.sin(angle * 2.0 + p2) * 0.12;
            const mesoGully = Math.sin(angle * 5.0 + t * 4.0 + p3) * 0.09;
            const microCrag = Math.cos(angle * 8.0 - t * 6.0 + p4) * 0.035;

            const fbm = macroRidge + mesoGully + microCrag;

            // Retención de volumen en la cumbre: curva suave que redondea la cima y elimina la aguja punzante
            const summitRounding = t > 0.65 ? Math.sin((t - 0.65) / 0.33 * Math.PI) * summitBulge : 0;
            const radMod = 1.0 + fbm * (1.0 - t * 0.45) + summitRounding;

            // 2. Canchal basal controlado (fusión suave con el suelo sin inflar desproporcionadamente la base)
            const baseTalus = t < 0.25 ? Math.exp(-t * 6.0) * 0.14 : 0;

            x *= (radMod + baseTalus);
            z *= (radMod + baseTalus);

            // 3. Desplazamiento orgánico asimétrico de la masa hacia la cúspide
            const peakWeight = Math.pow(t, 1.4);
            x += peakShiftX * peakWeight;
            z += peakShiftZ * peakWeight;

            // 4. Arista sub-apical continua (t: 0.65..0.97): modulación sin discontinuidades
            if (t > 0.65 && t < 0.98) {
                const subCrestWeight = Math.sin((t - 0.65) / 0.33 * Math.PI) * 0.22;
                const crestOffset = Math.cos(angle - crestAngle) * crestLength * subCrestWeight;
                x += Math.cos(crestAngle) * crestOffset;
                z += Math.sin(crestAngle) * crestOffset;
            }

            // 5. Contrafuerte rocoso lateral secundario (solo en ladera media)
            if (hasSpur) {
                const angleDiff = Math.atan2(Math.sin(angle - spurAngle), Math.cos(angle - spurAngle));
                const lateralDecay = Math.exp(-(angleDiff * angleDiff) * 5.0);
                const heightDecay = Math.exp(-Math.pow((t - spurNormY) / 0.15, 2.0));
                const push = lateralDecay * heightDecay * spurBulge;
                x += Math.cos(spurAngle) * push;
                z += Math.sin(spurAngle) * push;
            }

            // 6. Suavizado del perfil vertical de cumbre (domo rocoso erosionado)
            if (t > 0.82) {
                const domeFlatten = Math.pow((t - 0.82) / 0.18, 1.8) * apexDip;
                y -= domeFlatten;
            }

            // 7. Estratificación geológica sutil y terrazas de roca
            const terrace = Math.sin(t * Math.PI * 6.0 + p1) * 0.020 * height;
            y += terrace;
        }

        pos.setXYZ(i, x, y, z);

        // Coloración por estrato altitudinal
        const c = new THREE.Color();
        if (t < 0.20) {
            c.copy(baseCol).lerp(midCol, t / 0.20);
        } else if (t < 0.62) {
            c.copy(midCol).lerp(highCol, (t - 0.20) / 0.42);
        } else {
            c.copy(highCol).lerp(peakCol, (t - 0.62) / 0.38);
        }

        // Variación lumínica y de sombra según orientación y fractura
        const facetShading = Math.sin(Math.atan2(z, x) * 2.0 + t * 4.0) * 0.03;
        c.r = Math.max(0, Math.min(1, c.r + facetShading));
        c.g = Math.max(0, Math.min(1, c.g + facetShading));
        c.b = Math.max(0, Math.min(1, c.b + facetShading));

        colors.push(c.r, c.g, c.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
}

/**
 * Esculpe la base de la montaña en la zona del nacimiento del Río 1:
 * Garantiza que la roca forme una pared vertical cerrada en la orilla del cauce,
 * permitiendo que el agua y el sistema de partículas surjan directamente del pie
 * de la montaña sin que ningún vértice invada la lámina de agua ni tape las partículas.
 */
function carveSpringClearance(mesh, posX, posY, posZ, scaleX, scaleY, scaleZ) {
    const posAttr = mesh.geometry.attributes.position;
    const clearance = 5.2; // Anchura libre del cauce del río + margen de partículas
    let modified = 0;

    for (let i = 0; i < posAttr.count; i++) {
        const lx = posAttr.getX(i);
        const ly = posAttr.getY(i);
        const lz = posAttr.getZ(i);

        let wx = posX + lx * scaleX;
        let wy = posY + ly * scaleY;
        let wz = posZ + lz * scaleZ;

        // Solo intervenir en la base inferior donde la roca podría invadir el río
        if (wy < 4.5) {
            let minDist = 99999;
            let closestPt = null;

            for (let j = 0; j < SPRING_CLEARANCE_SAMPLES.length; j++) {
                const s = SPRING_CLEARANCE_SAMPLES[j];
                const dx = wx - s.x;
                const dz = wz - s.z;
                const d = Math.sqrt(dx * dx + dz * dz);
                if (d < minDist) {
                    minDist = d;
                    closestPt = s;
                }
            }

            if (minDist < clearance && closestPt) {
                let dirX = wx - closestPt.x;
                let dirZ = wz - closestPt.z;
                const len = Math.hypot(dirX, dirZ);

                if (len > 0.01) {
                    dirX /= len;
                    dirZ /= len;
                } else {
                    dirX = 1;
                    dirZ = 0;
                }

                // Retranqueo suave hacia la orilla del río: la roca cae verticalmente a los lados del manantial
                const targetDist = clearance + 0.3;
                wx = closestPt.x + dirX * targetDist;
                wz = closestPt.z + dirZ * targetDist;

                posAttr.setXYZ(
                    i,
                    (wx - posX) / scaleX,
                    ly,
                    (wz - posZ) / scaleZ
                );
                modified++;
            }
        }
    }

    if (modified > 0) {
        posAttr.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
    }
}

function createMountain(x, z, depthIndex = 0){

    // La altura aumenta progresivamente con la profundidad para crear una cordillera escalonada
    const baseHeight = 14 + rand() * 26 + depthIndex * 6;
    const baseRadius = 8.5 + rand() * 2.2;

    const geo = generateOrganicMountainGeo(baseRadius, baseHeight);
    const mountain = new THREE.Mesh(geo, mountainMaterial);

    const baseOffset = -6 + rand() * 2;

    // En la zona del nacimiento del afluente (esquina noreste), estabilizamos el desplazamiento
    // para que la montaña forme la muralla continua de nacimiento sin invadir el canal
    const isNearSpring = (x >= 215 && x <= 275 && z >= 215 && z <= 275);
    const jitterX = isNearSpring ? (rand() * 2.0) : ((rand() - 0.5) * 7);
    const jitterZ = isNearSpring ? (rand() * 2.0) : ((rand() - 0.5) * 7);

    const posX = x + jitterX;
    const posY = baseHeight / 2 + baseOffset;
    const posZ = z + jitterZ;

    mountain.position.set(posX, posY, posZ);

    const s = 0.85 + rand() * 1.15;
    const scaleX = s * 1.15;
    const scaleY = s;
    const scaleZ = s * 1.15;

    mountain.scale.set(scaleX, scaleY, scaleZ);

    mountain.rotation.y = rand() * Math.PI * 2;

    // Si la montaña se sitúa en las inmediaciones del nacimiento del afluente,
    // adaptamos su pie de monte para liberar el manantial y sus partículas
    if (isNearSpring) {
        carveSpringClearance(mountain, posX, posY, posZ, scaleX, scaleY, scaleZ);
    }

    // Preservación estricta de físicas y colisiones
    mountain.userData.solid = true;
    mountain.userData.radius = baseRadius * s * 0.70;

    addCollidable(mountain);
    cameraObstacles.push(mountain);

    scene.add(mountain);

}

export function generateMountainRange(){

    const mountainOffset = 8;
    const depth = 3;
    const step = 20;

    for(let x = -LIMIT; x <= LIMIT; x += step){

        for(let d = 0; d < depth; d++){

            const offsetZ =
                mountainOffset + d * 12;

            // Apertura de cañón para la desembocadura y ensenada del Río 2 (x entre 25 y 80 en el límite sur)
            const isRiver2Pass = (x >= 25 && x <= 80);

            if (!isRiver2Pass) {
                createMountain(
                    x,
                    -LIMIT - offsetZ,
                    d
                );
            }

            createMountain(
                x,
                LIMIT + offsetZ,
                d
            );

        }

    }

    for(let z = -LIMIT; z <= LIMIT; z += step){

        for(let d = 0; d < depth; d++){

            const offsetX =
                mountainOffset + d * 12;

            createMountain(
                -LIMIT - offsetX,
                z,
                d
            );

            createMountain(
                LIMIT + offsetX,
                z,
                d
            );

        }

    }

    // Acantilados y farallones rocosos que flanquean la entrada de la Ensenada / Cañón del Río
    createCanyonGateCliffs();
}

/**
 * Genera farallones y acantilados de roca que enmarcan la garganta de la ensenada
 * como una imponente puerta natural por donde el río escapa a través de las montañas.
 */
function createCanyonGateCliffs() {
    const cliffGeo = new THREE.DodecahedronGeometry(1, 1);
    const cliffMat = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.92,
        metalness: 0.12,
        flatShading: true
    });

    // Flanco Oeste (x ~ 18..24, z ~ -245..-275)
    const westPillars = [
        { x: 22, y: 3, z: -246, sx: 7, sy: 14, sz: 8 },
        { x: 18, y: 6, z: -258, sx: 9, sy: 18, sz: 10 },
        { x: 14, y: 8, z: -272, sx: 10, sy: 22, sz: 11 }
    ];

    // Flanco Este (x ~ 80..86, z ~ -242..-270)
    const eastPillars = [
        { x: 80, y: 3, z: -242, sx: 7, sy: 13, sz: 8 },
        { x: 84, y: 5, z: -254, sx: 8, sy: 17, sz: 9 },
        { x: 88, y: 8, z: -268, sx: 10, sy: 21, sz: 10 }
    ];

    [...westPillars, ...eastPillars].forEach(p => {
        const cliff = new THREE.Mesh(cliffGeo, cliffMat);
        cliff.position.set(p.x, p.y, p.z);
        cliff.scale.set(p.sx, p.sy, p.sz);
        cliff.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
        cliff.castShadow = true;
        cliff.receiveShadow = true;
        cliff.userData.solid = true;
        cliff.userData.radius = p.sx * 0.8;
        addCollidable(cliff);
        cameraObstacles.push(cliff);
        scene.add(cliff);
    });
}