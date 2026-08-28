import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { getHeightAtBase } from '../terrain/terrainHeight.js';

// ======================================================
// CONFIGURACIÓN DEL LAGO Y RÍOS
// ======================================================
export const LAKE_CONFIG = {
    x: 160.43,
    z: 168.82,
    radiusX: 28,
    radiusZ: 24,
    waterY: -1.8,
    torrentSource: { x: 232, z: 200 }
};

// Puntos de control para el Río 1 (Noroeste)
// Inicia en el lago, serpentea esquivando el centro y muere en la ensenada noroeste
export const RIVER_1_POINTS = [
    new THREE.Vector3(146, 0, 158),
    new THREE.Vector3(125, 0, 178),
    new THREE.Vector3(90, 0, 186),
    new THREE.Vector3(45, 0, 192),
    new THREE.Vector3(-10, 0, 180),
    new THREE.Vector3(-65, 0, 155),
    new THREE.Vector3(-115, 0, 135),
    new THREE.Vector3(-165, 0, 140),
    new THREE.Vector3(-200, 0, 168),
    new THREE.Vector3(-234, 0, 192) // Ensenada Noroeste en montañas
];

// Puntos de control para el Río 2 (Sur / Suroeste)
// Inicia en el lago, pasa al sur de las rocas antiguas (78, 22) y el centro (0,0), muriendo en el suroeste
export const RIVER_2_POINTS = [
    new THREE.Vector3(158, 0, 145),
    new THREE.Vector3(152, 0, 100),
    new THREE.Vector3(138, 0, 45),
    new THREE.Vector3(126, 0, -15),
    new THREE.Vector3(105, 0, -65),
    new THREE.Vector3(65, 0, -115),
    new THREE.Vector3(15, 0, -145),
    new THREE.Vector3(-45, 0, -165),
    new THREE.Vector3(-110, 0, -178),
    new THREE.Vector3(-175, 0, -192),
    new THREE.Vector3(-234, 0, -206) // Ensenada Suroeste en montañas
];

// Puntos para el torrente que alimenta el lago desde las montañas
export const TORRENT_POINTS = [
    new THREE.Vector3(232, 0, 202),
    new THREE.Vector3(210, 0, 192),
    new THREE.Vector3(188, 0, 182),
    new THREE.Vector3(175, 0, 176)
];

// Curvas CatmullRom para muestreo suave y continuo
export const river1Curve = new THREE.CatmullRomCurve3(RIVER_1_POINTS, false, 'catmullrom', 0.2);
export const river2Curve = new THREE.CatmullRomCurve3(RIVER_2_POINTS, false, 'catmullrom', 0.2);
export const torrentCurve = new THREE.CatmullRomCurve3(TORRENT_POINTS, false, 'catmullrom', 0.1);

// Muestreo precalculado para rendimiento en tiempo real
const SAMPLE_COUNT = 160;
const river1Samples = river1Curve.getPoints(SAMPLE_COUNT);
const river2Samples = river2Curve.getPoints(SAMPLE_COUNT);
const torrentSamples = torrentCurve.getPoints(40);

// Anchos base de los cauces
export const RIVER_WIDTH_1 = 11.0;
export const RIVER_WIDTH_2 = 11.5;
export const TORRENT_WIDTH = 7.0;

// ======================================================
// CÁLCULO DE DISTANCIA A LAS CURVAS
// ======================================================
function distToSegmentSq(px, pz, ax, az, bx, bz) {
    const l2 = (bx - ax) * (bx - ax) + (bz - az) * (bz - az);
    if (l2 === 0) return (px - ax) * (px - ax) + (pz - az) * (pz - az);
    let t = ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / l2;
    t = Math.max(0, Math.min(1, t));
    const nx = ax + t * (bx - ax);
    const nz = az + t * (bz - az);
    const dx = px - nx;
    const dz = pz - nz;
    return dx * dx + dz * dz;
}

export function getDistanceToCurve(px, pz, points) {
    let minDistSq = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
        const dSq = distToSegmentSq(
            px, pz,
            points[i].x, points[i].z,
            points[i + 1].x, points[i + 1].z
        );
        if (dSq < minDistSq) {
            minDistSq = dSq;
        }
    }
    return Math.sqrt(minDistSq);
}

// ======================================================
// INFORMACIÓN HIDROGRÁFICA EN CADA PUNTO (X, Z)
// ======================================================
export function getWaterInfluence(x, z) {
    // 1. Distancia al Lago
    const dxLake = (x - LAKE_CONFIG.x) / LAKE_CONFIG.radiusX;
    const dzLake = (z - LAKE_CONFIG.z) / LAKE_CONFIG.radiusZ;
    // Añadimos ligera irregularidad natural al borde del lago
    const lakeAngle = Math.atan2(z - LAKE_CONFIG.z, x - LAKE_CONFIG.x);
    const lakeNoise = Math.sin(lakeAngle * 4) * 0.08 + Math.cos(lakeAngle * 3) * 0.05;
    const distLakeNorm = Math.sqrt(dxLake * dxLake + dzLake * dzLake) + lakeNoise;

    // 2. Distancias a los ríos
    const distRiver1 = getDistanceToCurve(x, z, river1Samples);
    const distRiver2 = getDistanceToCurve(x, z, river2Samples);
    const distTorrent = getDistanceToCurve(x, z, torrentSamples);

    // 3. Ensenadas terminales (zonas más anchas en los extremos)
    const distCove1 = Math.hypot(x - (-234), z - 192);
    const distCove2 = Math.hypot(x - (-234), z - (-206));

    let inWater = false;
    let waterDepthFactor = 0; // 0 = tierra firme, 1 = centro profundo
    let bankFactor = 0;       // 1 = cresta de la orilla (lip)

    // Evaluar lago
    if (distLakeNorm < 1.0) {
        inWater = true;
        waterDepthFactor = Math.max(waterDepthFactor, 1.0 - distLakeNorm);
    } else if (distLakeNorm < 1.35) {
        const t = (distLakeNorm - 1.0) / 0.35; // 0 en el agua, 1 en tierra
        bankFactor = Math.max(bankFactor, Math.sin(t * Math.PI));
    }

    // Evaluar Río 1
    const halfW1 = RIVER_WIDTH_1 * 0.5;
    if (distRiver1 < halfW1) {
        inWater = true;
        waterDepthFactor = Math.max(waterDepthFactor, (halfW1 - distRiver1) / halfW1);
    } else if (distRiver1 < halfW1 + 5.0) {
        const t = (distRiver1 - halfW1) / 5.0;
        bankFactor = Math.max(bankFactor, Math.sin(t * Math.PI));
    }

    // Evaluar Río 2
    const halfW2 = RIVER_WIDTH_2 * 0.5;
    if (distRiver2 < halfW2) {
        inWater = true;
        waterDepthFactor = Math.max(waterDepthFactor, (halfW2 - distRiver2) / halfW2);
    } else if (distRiver2 < halfW2 + 5.0) {
        const t = (distRiver2 - halfW2) / 5.0;
        bankFactor = Math.max(bankFactor, Math.sin(t * Math.PI));
    }

    // Evaluar Torrente
    const halfWT = TORRENT_WIDTH * 0.5;
    if (distTorrent < halfWT) {
        inWater = true;
        waterDepthFactor = Math.max(waterDepthFactor, (halfWT - distTorrent) / halfWT);
    } else if (distTorrent < halfWT + 4.0) {
        const t = (distTorrent - halfWT) / 4.0;
        bankFactor = Math.max(bankFactor, Math.sin(t * Math.PI));
    }

    // Evaluar Ensenadas (ensanchamiento en la desembocadura)
    if (distCove1 < 18.0) {
        inWater = true;
        waterDepthFactor = Math.max(waterDepthFactor, (18.0 - distCove1) / 18.0);
    }
    if (distCove2 < 18.0) {
        inWater = true;
        waterDepthFactor = Math.max(waterDepthFactor, (18.0 - distCove2) / 18.0);
    }

    return {
        inWater,
        waterDepthFactor,
        bankFactor,
        distLakeNorm,
        distRiver1,
        distRiver2,
        distTorrent
    };
}
