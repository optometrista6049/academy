import {
    getRiverInfo,
    RIVER_HALF_WIDTH,
    RIVER_BANK_WIDTH,
    RIVER_DEPTH,
    BANK_WALL_HEIGHT
} from './riverPath.js';

export const LAKE_CENTER_X = 85;
export const LAKE_CENTER_Z = 110;

// Altura horizontal de la lámina de agua en el valle
export const LAKE_WATER_Y = -4.5;

/**
 * Calcula el radio exterior de la cuenca del cráter según el ángulo polar theta.
 * Se sitúa en el valle central (85, 110) dejando >80m libres hasta las montañas periféricas.
 */
export function getLakeBasinRadius(theta) {
    return 65.0
        + 7.5 * Math.cos(theta - 0.4)
        + 5.0 * Math.sin(2.0 * theta + 0.6)
        + 3.5 * Math.cos(3.0 * theta - 0.9)
        + 2.0 * Math.sin(5.0 * theta);
}

/**
 * Retorna la proporción del radio de la cuenca donde se ubica la orilla/playa de agua.
 * Modula ensenadas y playas arenosas orgánicas alrededor del lago.
 */
export function getShoreRatio(theta) {
    return 0.74 + 0.04 * Math.sin(2.0 * theta - 0.5) + 0.02 * Math.cos(4.0 * theta);
}

/**
 * Radio de exclusión para vegetación y rocas
 */
export const LAKE_RADIUS = 80;

/**
 * Función de ruido pseudo-aleatorio continuo y suave basado en ondas armónicas multiescala
 */
function getOrganicNoise(x, z) {
    // 1. Colinas amplias y suaves (macro relieve)
    const macro1 = Math.sin(x * 0.009 + 0.5) * Math.cos(z * 0.009 + 0.3) * 4.2;
    const macro2 = Math.cos((x * 0.013) - (z * 0.011) + 1.2) * 2.8;

    // 2. Ondulaciones medias (lomas y vaguadas naturales)
    const meso1 = Math.sin(x * 0.027 + Math.cos(z * 0.022)) * 1.5;
    const meso2 = Math.cos(z * 0.031 + Math.sin(x * 0.025)) * 1.2;

    // 3. Micro-relieve sutil (rugosidad orgánica del suelo)
    const micro1 = Math.sin(x * 0.073 + z * 0.061) * 0.4;
    const micro2 = Math.cos(x * 0.11 - z * 0.09) * 0.2;

    return macro1 + macro2 + meso1 + meso2 + micro1 + micro2;
}

export function getHeightAt(x, z) {
    // Relieve base orgánico
    let baseElevation = getOrganicNoise(x, z);

    // Suavizado del área inicial de spawn del jugador y los NPCs principales (alrededor de 0,0)
    const distToSpawn = Math.sqrt(x * x + z * z);
    if (distToSpawn < 28) {
        // Atenuación suave para que la plaza central sea cómoda y estable
        const spawnBlend = Math.min(1, distToSpawn / 28);
        const smoothSpawn = spawnBlend * spawnBlend * (3 - 2 * spawnBlend);
        baseElevation = baseElevation * (0.35 + smoothSpawn * 0.65);
    }

    // Deformación orgánica del cráter en (85, 110)
    let lakeElevation = baseElevation;
    const dx = x - LAKE_CENTER_X;
    const dz = z - LAKE_CENTER_Z;
    const distToLake = Math.sqrt(dx * dx + dz * dz);

    if (distToLake < 95) {
        const theta = Math.atan2(dz, dx);
        const basinR = getLakeBasinRadius(theta);

        if (distToLake < basinR) {
            const shoreRatio = getShoreRatio(theta);
            const shoreR = basinR * shoreRatio;

            if (distToLake >= shoreR) {
                // Ladera accesible del cráter (de basinR a shoreR):
                // Interpola suavemente desde baseElevation hasta LAKE_WATER_Y exactamente en shoreR
                const t = (basinR - distToLake) / (basinR - shoreR); // 0 en borde de pradera, 1 en la orilla
                const smoothT = t * t * (3 - 2 * t);
                lakeElevation = baseElevation * (1 - smoothT) + LAKE_WATER_Y * smoothT;
            } else {
                // Fondo sumergido bajo el agua (de 0 a shoreR):
                // Desciende de LAKE_WATER_Y (-4.5m) en la orilla a -6.3m en el centro (profundidad de ~1.8m)
                const tInner = distToLake / shoreR; // 0 en centro, 1 en orilla
                const bedDepth = (1 - tInner * tInner) * 1.8;
                lakeElevation = LAKE_WATER_Y - bedDepth;
            }
        }
    }

    // ----------------------------------------------------
    // Excavación del cauce y surco en U de los ríos (Afluente noreste y Emisario sur)
    // ----------------------------------------------------
    let riverElevation = baseElevation;
    const river = getRiverInfo(x, z);

    if (river && river.active && river.distance < river.bankWidth) {
        const halfWidth = river.halfWidth || RIVER_HALF_WIDTH;
        const bankWidth = river.bankWidth || RIVER_BANK_WIDTH;
        const depth = river.depth || RIVER_DEPTH;
        const bankWallH = river.bankWallHeight !== undefined ? river.bankWallHeight : BANK_WALL_HEIGHT;

        let targetElevation;
        if (river.distance <= halfWidth) {
            // Lecho del río en U excavado suavemente bajo la lámina de agua
            const u = river.distance / halfWidth;
            const bedDepth = (1.0 - u * u) * depth;
            targetElevation = river.y - bedDepth;
        } else {
            // Talud suave hacia la orilla que arranca exactamente al nivel de agua en river.distance = halfWidth
            const v = (river.distance - halfWidth) / (bankWidth - halfWidth);
            // v = 0 en el borde del agua, v = 1 en la pradera exterior
            const smoothV = v * v * (3.0 - 2.0 * v); // S-curve orgánica sin bordes afilados
            const shoreHeight = river.y + bankWallH;
            
            // Interpola suavemente desde shoreHeight hasta el terreno base
            targetElevation = shoreHeight * (1.0 - smoothV) + baseElevation * smoothV;
            // Asegura que en la orilla inmediata el terreno nunca caiga por debajo del agua ni cree un foso extraño
            targetElevation = Math.max(river.y + (v * bankWallH), targetElevation);
        }

        riverElevation = targetElevation;
    }

    // Fusión armónica entre el relieve base, la cuenca del lago y el lecho del río
    return Math.min(lakeElevation, riverElevation);
}



