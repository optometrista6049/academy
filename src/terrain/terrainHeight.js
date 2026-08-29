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

export function getHeightAt(x, z) {
    const meadowHeight = (
        Math.sin(x * 0.02) * 2 +
        Math.cos(z * 0.02) * 2 +
        Math.sin((x + z) * 0.01) * 3
    );

    // Deformación orgánica del cráter en (85, 110)
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
                // Interpola suavemente desde meadowHeight hasta LAKE_WATER_Y exactamente en shoreR
                const t = (basinR - distToLake) / (basinR - shoreR); // 0 en borde de pradera, 1 en la orilla
                const smoothT = t * t * (3 - 2 * t);
                return meadowHeight * (1 - smoothT) + LAKE_WATER_Y * smoothT;
            } else {
                // Fondo sumergido bajo el agua (de 0 a shoreR):
                // Desciende de LAKE_WATER_Y (-4.5m) en la orilla a -6.3m en el centro (profundidad de ~1.8m)
                const tInner = distToLake / shoreR; // 0 en centro, 1 en orilla
                const bedDepth = (1 - tInner * tInner) * 1.8;
                return LAKE_WATER_Y - bedDepth;
            }
        }
    }

    return meadowHeight;
}



