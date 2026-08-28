import * as THREE from 'three';
import { getWaterInfluence } from '../environment/waterSystem.js';
import { getBridgeInteraction } from '../environment/bridges.js';

// ======================================================
// CONTENCIÓN Y REBOTE SUAVE EN ORILLAS DE AGUA
// ======================================================
export function checkWaterAndBridgeMovement(currentPos, nextPos) {
    // 1. Si está en un puente, el puente tiene prioridad
    const bridgeInteraction = getBridgeInteraction(nextPos.x, nextPos.z);

    if (bridgeInteraction.onBridge) {
        if (bridgeInteraction.blocked) {
            // Chocó contra la barandilla lateral del puente
            return {
                allowed: false,
                onBridge: true,
                walkHeight: bridgeInteraction.walkHeight
            };
        }
        // Permitido cruzar por la pasarela del puente
        return {
            allowed: true,
            onBridge: true,
            walkHeight: bridgeInteraction.walkHeight
        };
    }

    // 2. Verificar si intenta entrar al agua (fuera de un puente)
    const waterInfo = getWaterInfluence(nextPos.x, nextPos.z);

    if (waterInfo.inWater) {
        // Bloquear avance dentro del agua
        // Intentamos deslizamiento lateral (slide) en X o en Z si es seguro
        const testX = new THREE.Vector3(nextPos.x, currentPos.y, currentPos.z);
        const testZ = new THREE.Vector3(currentPos.x, currentPos.y, nextPos.z);

        const waterX = getWaterInfluence(testX.x, testX.z);
        const waterZ = getWaterInfluence(testZ.x, testZ.z);

        if (!waterX.inWater) {
            nextPos.z = currentPos.z;
            return { allowed: true, onBridge: false, walkHeight: null };
        } else if (!waterZ.inWater) {
            nextPos.x = currentPos.x;
            return { allowed: true, onBridge: false, walkHeight: null };
        }

        // Rebote suave: permanece en la orilla
        return {
            allowed: false,
            onBridge: false,
            walkHeight: null
        };
    }

    return {
        allowed: true,
        onBridge: false,
        walkHeight: null
    };
}
