import { getWaterInfluence, LAKE_CONFIG } from '../environment/waterSystem.js';

// ======================================================
// ALTURA PROCEDURAL BASE ORIGINAL
// ======================================================
export function getHeightAtBase(x, z) {
    return (
        Math.sin(x * 0.02) * 2 +
        Math.cos(z * 0.02) * 2 +
        Math.sin((x + z) * 0.01) * 3
    );
}

// ======================================================
// ALTURA REAL DEL TERRENO (CON CAUCES, ORILLAS Y LAGO)
// ======================================================
export function getHeightAt(x, z) {
    const baseH = getHeightAtBase(x, z);
    const waterInfo = getWaterInfluence(x, z);

    let h = baseH;

    // 1. Elevación sutil de las orillas (Berm / Lip de contención para evitar efecto flotante)
    if (waterInfo.bankFactor > 0) {
        h += waterInfo.bankFactor * 0.55;
    }

    // 2. Excavación del lecho de los ríos y fondo del lago
    if (waterInfo.inWater) {
        // Nivel de agua de referencia
        const targetWaterY = LAKE_CONFIG.waterY;
        // Fondo del agua: entre 1.0 y 2.5 unidades por debajo de la superficie
        const bedDepth = 1.2 + waterInfo.waterDepthFactor * 1.5;
        const riverBedY = targetWaterY - bedDepth;

        // Mezcla suave hacia el fondo del cauce
        const t = Math.min(1.0, waterInfo.waterDepthFactor * 1.4);
        h = baseH * (1 - t) + riverBedY * t;

        // Asegurarse de que el lecho quede bajo el agua
        if (h > targetWaterY - 0.5) {
            h = targetWaterY - 0.5 - waterInfo.waterDepthFactor * 1.2;
        }
    }

    return h;
}
