import * as THREE from 'three';

// Constante de nivel de agua en el lago (-4.5m)
export const LAKE_WATER_LEVEL = -4.5;

// ======================================================
// PUNTOS DE CONTROL DEL AFLUENTE (De montañas 233,233 a lago 141,136)
// ======================================================

export const RIVER_START = { x: 258, z: 258, y: -1.6 };
export const RIVER_END = { x: 138, z: 124, y: LAKE_WATER_LEVEL };

// Curva serpenteante natural que nace directamente en la base rocosa de las montañas
const RIVER_WAYPOINTS = [
    new THREE.Vector3(268, -0.9, 268),  // Dentro del macizo montañoso
    new THREE.Vector3(258, -1.6, 258),  // Garganta de nacimiento entre montañas
    new THREE.Vector3(245, -2.3, 245),  // Descenso de ladera alta
    new THREE.Vector3(232, -2.9, 230),  // Curva de pie de monte
    new THREE.Vector3(218, -3.4, 208),  // Meandro 1
    new THREE.Vector3(205, -3.75, 185), // Curva hacia el valle
    new THREE.Vector3(192, -4.0, 172),  // Vado medio
    new THREE.Vector3(175, -4.2, 168),  // Meandro 2
    new THREE.Vector3(158, -4.35, 150), // Bajada al valle del lago
    new THREE.Vector3(146, LAKE_WATER_LEVEL, 134), // Tramo de desembocadura a nivel de agua
    new THREE.Vector3(138, LAKE_WATER_LEVEL, 124), // Entrada continua en el borde del lago (-4.5m)
    new THREE.Vector3(128, LAKE_WATER_LEVEL, 118)  // Guía tangencial interior
];

// Spline 3D continuo para la trayectoria del río
export const riverSpline = new THREE.CatmullRomCurve3(
    RIVER_WAYPOINTS,
    false,
    'centripetal',
    0.5
);

// Parámetros dimensionales del canal en U profundo con orillas bien marcadas
export const RIVER_HALF_WIDTH = 3.8;   // Radio de la lámina de agua (~7.6m de ancho)
export const RIVER_BANK_WIDTH = 10.5;  // Radio total del surco/taludes en U (~21m de corte)
export const RIVER_DEPTH = 1.6;        // Profundidad adicional del lecho bajo la lámina de agua
export const BANK_WALL_HEIGHT = 1.1;   // Altura de pared que sobresale sobre el agua antes de abrir el talud

// Pre-muestreo denso del spline para consultas espaciales ultrarrápidas O(1)/O(N_samples)
const SAMPLE_COUNT = 160;
const riverSamples = [];

for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;
    const pt = riverSpline.getPoint(t);
    const tangent = riverSpline.getTangent(t);
    riverSamples.push({
        t,
        x: pt.x,
        y: pt.y,
        z: pt.z,
        tangent
    });
}

/**
 * Encuentra la distancia mínima y datos del río para cualquier coordenada (x, z)
 */
export function getRiverInfo(x, z) {
    let minDistSq = Infinity;
    let closestIndex = 0;

    // Búsqueda del segmento más cercano
    for (let i = 0; i < riverSamples.length; i++) {
        const s = riverSamples[i];
        const dx = x - s.x;
        const dz = z - s.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < minDistSq) {
            minDistSq = dSq;
            closestIndex = i;
        }
    }

    // Refinamiento sub-segmento
    const sample = riverSamples[closestIndex];
    const prev = riverSamples[Math.max(0, closestIndex - 1)];
    const next = riverSamples[Math.min(riverSamples.length - 1, closestIndex + 1)];

    // Vector tangente 2D
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const tLen = Math.hypot(tx, tz);

    let projDist = 0;
    if (tLen > 0.001) {
        const dx = x - sample.x;
        const dz = z - sample.z;
        projDist = (dx * tx + dz * tz) / (tLen * tLen);
    }

    const tClamped = Math.max(0, Math.min(1, sample.t + projDist / SAMPLE_COUNT));
    const exactPt = riverSpline.getPoint(tClamped);

    const dist = Math.hypot(x - exactPt.x, z - exactPt.z);

    return {
        distance: dist,
        t: tClamped,
        x: exactPt.x,
        y: exactPt.y, // Altura de la superficie del agua en este punto
        z: exactPt.z
    };
}

/**
 * Obtiene la altura de la superficie del agua en cualquier punto (x, z) del mapa.
 * Retorna null si no hay masa de agua en esa posición.
 */
export function getWaterSurfaceLevel(x, z) {
    // 1. Verificación en el curso del afluente/río
    if (x >= 120 && x <= 275 && z >= 115 && z <= 275) {
        const info = getRiverInfo(x, z);
        if (info.t >= 0.0 && info.t <= 0.98 && info.distance <= (RIVER_BANK_WIDTH + 1.0)) {
            return info.y;
        }
    }

    // 2. Lago por defecto
    return LAKE_WATER_LEVEL;
}

/**
 * Determina si una posición (x, z) está dentro de la lámina de agua del río
 * (Usado para colisiones del jugador y NPCs)
 */
export function isPointInRiverWater(x, z) {
    // Verificación rápida de caja delimitadora
    if (x < 120 || x > 275 || z < 115 || z > 275) {
        return false;
    }

    const info = getRiverInfo(x, z);
    // Margen ajustado para evitar que el jugador se pare sobre el talud sumergido
    if (info.t >= 0.0 && info.t <= 0.98) {
        return info.distance < (RIVER_HALF_WIDTH + 0.35);
    }
    return false;
}

/**
 * Determina si una posición está cerca del curso del río (para evitar árboles/rocas)
 */
export function isPointNearRiver(x, z, margin = 9.8) {
    if (x < 125 || x > 275 || z < 120 || z > 275) {
        return false;
    }
    const info = getRiverInfo(x, z);
    return (info.t >= 0.0 && info.t <= 0.98) && (info.distance < margin);
}
