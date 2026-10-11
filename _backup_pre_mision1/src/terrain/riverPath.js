import * as THREE from 'three';

// Constante de nivel de agua en el lago (-4.5m)
export const LAKE_WATER_LEVEL = -4.5;

// ======================================================
// RÍO 1: AFLUENTE NORESTE (De montañas 258,258 a lago 138,124)
// ======================================================

export const RIVER_START = { x: 258, z: 258, y: -1.6 };
export const RIVER_END = { x: 138, z: 124, y: LAKE_WATER_LEVEL };

export const RIVER_WAYPOINTS = [
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

export const riverSpline = new THREE.CatmullRomCurve3(
    RIVER_WAYPOINTS,
    false,
    'centripetal',
    0.5
);

// ======================================================
// RÍO 2: EMISARIO SUR (Nace en lago 112,77 -> 182,10 -> 159,-80 -> 151,-156 -> Ensenada 69.59,-233)
// ======================================================

export const RIVER2_START = { x: 112, z: 77, y: LAKE_WATER_LEVEL };
export const RIVER2_END = { x: 69.59, z: -233, y: -5.50 };

export const RIVER2_WAYPOINTS = [
    new THREE.Vector3(104, LAKE_WATER_LEVEL, 86),      // Guía sumergida dentro del lago (-4.50m)
    new THREE.Vector3(112, LAKE_WATER_LEVEL, 77),      // 1. Nacimiento en orilla del lago (112, 77) (-4.50m)
    new THREE.Vector3(128, -4.53, 64),                 // Curva suave inicial
    new THREE.Vector3(148, -4.58, 48),                 // Meandro este
    new THREE.Vector3(168, -4.62, 30),                 // Ampliación del cauce
    new THREE.Vector3(182, -4.66, 10),                 // 2. Vértice oriental (182, 10) (-4.66m)
    new THREE.Vector3(186, -4.72, -14),                // Giro suave hacia el sur
    new THREE.Vector3(178, -4.78, -38),                // Meandro intermedio
    new THREE.Vector3(167, -4.84, -60),                // Descenso hacia el sur
    new THREE.Vector3(159, -4.90, -80),                // 3. Meandro central (159, -80) (-4.90m)
    new THREE.Vector3(152, -4.98, -106),               // Valle meridional
    new THREE.Vector3(148, -5.06, -132),               // Curva hacia el sudoeste
    new THREE.Vector3(151, -5.15, -156),               // 4. Meandro meridional (151, -156) (-5.15m)
    new THREE.Vector3(145, -5.25, -182),               // Giro hacia las montañas
    new THREE.Vector3(130, -5.35, -204),               // Aproximación a la ensenada
    new THREE.Vector3(104, -5.43, -222),               // Meandro pre-ensenada
    new THREE.Vector3(69.59, -5.50, -233),             // 5. Desembocadura en la ensenada (69.59, -233) (-5.50m)
    new THREE.Vector3(52, -5.54, -246),                // Boca del cañón de la ensenada
    new THREE.Vector3(38, -5.58, -260),                // Garganta entre las montañas
    new THREE.Vector3(26, -5.62, -276)                 // Proyección hacia la niebla periférica
];

export const riverOutflowSpline = new THREE.CatmullRomCurve3(
    RIVER2_WAYPOINTS,
    false,
    'centripetal',
    0.5
);

// ======================================================
// RÍO 3: AFLUENTE/EMISARIO OESTE (Nace en lago 42, 103.5 -> Cueva -214, -233)
// ======================================================

export const RIVER3_START = { x: 42, z: 103.50, y: LAKE_WATER_LEVEL };
export const RIVER3_END = { x: -214, z: -233, y: -5.84 };

// COPIA DE SEGURIDAD DEL TRAZADO ORIGINAL (V1) para revertir en cualquier momento si se desea:
export const RIVER3_WAYPOINTS_ORIGINAL_BACKUP = [
    new THREE.Vector3(54, LAKE_WATER_LEVEL, 104.5),      // Guía tangencial en el borde del lago (-4.50m)
    new THREE.Vector3(42, LAKE_WATER_LEVEL, 103.50),     // 1. Nacimiento en orilla oeste del lago (42, 103.50)
    new THREE.Vector3(9, -4.58, 103.8),                  // Curva sinuosa occidental
    new THREE.Vector3(-24, -4.68, 102.0),                // 2. Paso continuo (-24, 102)
    new THREE.Vector3(-58, -4.80, 91.5),                 // Meandro de ladera suave
    new THREE.Vector3(-92, -4.95, 78.50),                // 3. Paso continuo (-92, 78.50)
    new THREE.Vector3(-118, -5.10, 42.0),                // Inflexión hacia el sur-suroeste
    new THREE.Vector3(-141.94, -5.25, 0.75),             // 4. Paso continuo (-141.94, 0.75)
    new THREE.Vector3(-148.0, -5.38, -50.0),             // Sinuosidad entre praderas occidentales
    new THREE.Vector3(-152.48, -5.50, -99.90),           // 5. Paso continuo (-152.48, -99.90)
    new THREE.Vector3(-168.0, -5.62, -152.0),            // Descenso hacia el pie de monte
    new THREE.Vector3(-190.0, -5.74, -196.0),            // Meandro de aproximación a la garganta montañosa
    new THREE.Vector3(-214.0, -5.84, -233.0),            // 6. Desembocadura en la boca de la Cueva (-214, -233)
    new THREE.Vector3(-224.0, -5.92, -250.0),            // Adentramiento cavernoso bajo los farallones
    new THREE.Vector3(-232.0, -5.98, -264.0)             // Disipación en la oscuridad interior del macizo
];

// TRAZADO MÁS SINUOSO (V2) con meandro profundo pasando por (x: -90, z: -34):
export const RIVER3_WAYPOINTS = [
    new THREE.Vector3(54, LAKE_WATER_LEVEL, 104.5),      // Guía tangencial en el borde del lago (-4.50m)
    new THREE.Vector3(42, LAKE_WATER_LEVEL, 103.50),     // 1. Nacimiento en orilla oeste del lago (42, 103.50)
    new THREE.Vector3(9, -4.58, 103.8),                  // Curva sinuosa occidental
    new THREE.Vector3(-24, -4.68, 102.0),                // 2. Paso continuo (-24, 102)
    new THREE.Vector3(-58, -4.80, 91.5),                 // Meandro de ladera suave
    new THREE.Vector3(-92, -4.95, 78.50),                // 3. Paso continuo (-92, 78.50)
    new THREE.Vector3(-128, -5.08, 38.0),                // Gran meandro hacia el oeste para dibujar una amplia 'S' natural
    new THREE.Vector3(-130, -5.18, 0.0),                 // Inflexión suave hacia el sureste
    new THREE.Vector3(-114, -5.26, -18.0),               // Transición abierta y continua al meandro
    new THREE.Vector3(-91.5, -5.35, -34.0),              // *** Curva sinuosa solicitada (x: -91.5, z: -34) con amplio radio de giro ***
    new THREE.Vector3(-106.0, -5.44, -54.0),             // Salida con radio de giro generoso sin compresión de orilla
    new THREE.Vector3(-132.0, -5.50, -78.0),             // Enlace fluido con el curso bajo
    new THREE.Vector3(-152.48, -5.56, -99.90),           // 5. Paso continuo (-152.48, -99.90)
    new THREE.Vector3(-168.0, -5.65, -152.0),            // Descenso hacia el pie de monte
    new THREE.Vector3(-190.0, -5.75, -196.0),            // Meandro de aproximación a la garganta montañosa
    new THREE.Vector3(-214.0, -5.84, -233.0),            // 6. Desembocadura en la boca de la Cueva (-214, -233)
    new THREE.Vector3(-224.0, -5.92, -250.0),            // Adentramiento cavernoso bajo los farallones
    new THREE.Vector3(-232.0, -5.98, -264.0)             // Disipación en la oscuridad interior del macizo
];

export const river3Spline = new THREE.CatmullRomCurve3(
    RIVER3_WAYPOINTS,
    false,
    'centripetal',
    0.5
);

// Parámetros dimensionales del canal en U
export const RIVER_HALF_WIDTH = 3.8;   // Radio de la lámina de agua estándar (~7.6m de ancho)
export const RIVER_BANK_WIDTH = 10.5;  // Radio total del surco/taludes estándar (~21m de corte)
export const RIVER_DEPTH = 1.6;        // Profundidad adicional del lecho bajo el agua
export const BANK_WALL_HEIGHT = 1.1;   // Altura de pared sobre el agua antes de abrir el talud

// Pre-muestreo denso de los splines para consultas espaciales ultrarrápidas
const SAMPLE_COUNT = 180;
const river1Samples = [];
const river2Samples = [];
const river3Samples = [];

for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_COUNT;

    const pt1 = riverSpline.getPoint(t);
    const tangent1 = riverSpline.getTangent(t);
    river1Samples.push({
        t,
        x: pt1.x,
        y: pt1.y,
        z: pt1.z,
        tangent: tangent1
    });

    const pt2 = riverOutflowSpline.getPoint(t);
    const tangent2 = riverOutflowSpline.getTangent(t);
    river2Samples.push({
        t,
        x: pt2.x,
        y: pt2.y,
        z: pt2.z,
        tangent: tangent2
    });

    const pt3 = river3Spline.getPoint(t);
    const tangent3 = river3Spline.getTangent(t);
    river3Samples.push({
        t,
        x: pt3.x,
        y: pt3.y,
        z: pt3.z,
        tangent: tangent3
    });
}

function querySpline(samples, spline, x, z) {
    let minDistSq = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const dx = x - s.x;
        const dz = z - s.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < minDistSq) {
            minDistSq = dSq;
            closestIndex = i;
        }
    }

    const sample = samples[closestIndex];
    const prev = samples[Math.max(0, closestIndex - 1)];
    const next = samples[Math.min(samples.length - 1, closestIndex + 1)];

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
    const exactPt = spline.getPoint(tClamped);
    const dist = Math.hypot(x - exactPt.x, z - exactPt.z);

    return {
        distance: dist,
        t: tClamped,
        x: exactPt.x,
        y: exactPt.y,
        z: exactPt.z
    };
}

/**
 * Encuentra la distancia mínima y datos del río más cercano para cualquier coordenada (x, z).
 * Resuelve tanto el Río 1 (Afluente) como el Río 2 (Emisario con Ensenada).
 */
export function getRiverInfo(x, z) {
    // Caja delimitadora rápida Río 1 (Afluente noreste)
    const inBBox1 = (x >= 120 && x <= 275 && z >= 115 && z <= 275);
    // Caja delimitadora rápida Río 2 (Emisario sur)
    const inBBox2 = (x >= 15 && x <= 200 && z >= -285 && z <= 95);
    // Caja delimitadora rápida Río 3 (Emisario oeste hacia Cueva suroeste)
    const inBBox3 = (x >= -255 && x <= 65 && z >= -285 && z <= 125);

    if (!inBBox1 && !inBBox2 && !inBBox3) {
        // Ningún río cerca: respuesta rápida
        return {
            distance: 9999,
            t: 0,
            x: 0,
            y: LAKE_WATER_LEVEL,
            z: 0,
            halfWidth: RIVER_HALF_WIDTH,
            bankWidth: RIVER_BANK_WIDTH,
            depth: RIVER_DEPTH,
            active: false,
            riverIndex: 0
        };
    }

    let info1 = null;
    let info2 = null;
    let info3 = null;

    if (inBBox1) {
        info1 = querySpline(river1Samples, riverSpline, x, z);
        info1.halfWidth = RIVER_HALF_WIDTH;
        info1.bankWidth = RIVER_BANK_WIDTH;
        info1.depth = RIVER_DEPTH;
        info1.active = info1.t <= 0.96;
        info1.riverIndex = 1;
    }

    if (inBBox2) {
        info2 = querySpline(river2Samples, riverOutflowSpline, x, z);
        // Ensanchamiento natural en la ensenada y desembocadura montañosa (t > 0.70)
        let deltaSpread = 1.0;
        if (info2.t > 0.70) {
            deltaSpread = 1.0 + Math.pow((info2.t - 0.70) / 0.30, 1.2) * 1.5; // Expansión de hasta 2.5x en la ensenada (hasta ~26m de ancho)
        }
        // Río 2: Cauce más ancho (5.5m radio = 11m ancho base) y riberas más amplias y tendidas (14.5m)
        info2.halfWidth = 5.5 * deltaSpread;
        info2.bankWidth = 14.5 * deltaSpread;
        info2.depth = 0.85; // Excavación menos profunda, lecho accesible y natural
        info2.bankWallHeight = 0.40; // Orillas a ras de la pradera
        info2.active = info2.t >= 0.03 && info2.t <= 0.99;
        info2.riverIndex = 2;
    }

    if (inBBox3) {
        info3 = querySpline(river3Samples, river3Spline, x, z);
        // Río 3: Idéntica sección natural que el Río 2, ensanchándose desde x: -174.01, z: -179.13 (t > 0.785)
        // hasta ocupar todo el ancho del cañón y la entrada a la cueva (~19.6m de ancho total)
        if (info3.t > 0.785) {
            const caveT = Math.min((info3.t - 0.785) / 0.09, 1.0);
            const expandSmooth = caveT * caveT * (3.0 - 2.0 * caveT);
            info3.halfWidth = 5.2 + expandSmooth * 4.6; // Se ensancha progresivamente de 5.2m a 9.8m (19.6m total)
            info3.bankWidth = 14.0 + expandSmooth * 4.5; // Margen ampliado para acoger el canal ensanchado
        } else {
            info3.halfWidth = 5.2;
            info3.bankWidth = 14.0;
        }
        info3.depth = 0.85;
        info3.bankWallHeight = 0.40;
        info3.active = info3.t >= 0.02 && info3.t <= 0.99;
        info3.riverIndex = 3;
    }

    let closest = null;
    if (info1 && (!closest || info1.distance < closest.distance)) closest = info1;
    if (info2 && (!closest || info2.distance < closest.distance)) closest = info2;
    if (info3 && (!closest || info3.distance < closest.distance)) closest = info3;

    return closest;
}

/**
 * Obtiene la altura de la superficie del agua en cualquier punto (x, z) del mapa.
 */
export function getWaterSurfaceLevel(x, z) {
    const info = getRiverInfo(x, z);
    if (info && info.active && info.distance <= (info.bankWidth + 1.0)) {
        return info.y;
    }
    return LAKE_WATER_LEVEL;
}

/**
 * Determina si una posición (x, z) está dentro de la lámina de agua de cualquiera de los ríos.
 */
export function isPointInRiverWater(x, z) {
    const info = getRiverInfo(x, z);
    if (info && info.active) {
        return info.distance < (info.halfWidth + 0.4);
    }
    return false;
}

/**
 * Determina si una posición está cerca del curso de cualquier río (para evitar árboles/rocas).
 */
export function isPointNearRiver(x, z, margin = 9.8) {
    const info = getRiverInfo(x, z);
    if (!info || !info.active) return false;
    const effectiveMargin = Math.max(margin, info.bankWidth + 1.5);
    return info.distance < effectiveMargin;
}

