import {
    collidables,
    isWaterCollision
} from '../entities/collisions.js';
import { getNearbyCollidables } from './chunkSystem.js';
import { checkBridgeRailCollision, checkBridgePierCollision } from '../environment/bridgeSystem.js';

const PLAYER_RADIUS = 0.6;

export function collide(nextPosition, currentPosition = null){

    const px = nextPosition.x;
    const pz = nextPosition.z;
    const currY = currentPosition ? currentPosition.y : null;

    // Barandillas laterales y límites físicos del puente (considerando la altura 3D del jugador)
    if (currentPosition && checkBridgeRailCollision(currentPosition.x, currentPosition.z, px, pz, currY)) {
        return true;
    }

    // Pilares de piedra del puente (OBB 3D - cubre caras anchas y estrechas bajo el tablero)
    if (checkBridgePierCollision(px, pz, currY)) {
        return true;
    }

    // Bloqueo de entrada en agua (Lago y Río)
    if (isWaterCollision(px, pz, currY)) {
        return true;
    }

    // Búsqueda espacial por chunks (O(1))
    const nearby = getNearbyCollidables(px, pz);
    const targetList = nearby.length > 0 ? nearby : collidables;

    for(let i = 0; i < targetList.length; i++){
        const o = targetList[i];
        if (!o || !o.position) continue;

        // Comprobación de altura vertical 3D si el obstáculo define límites Y
        if (currY !== null) {
            const minY = o.userData?.minVerticalY;
            const maxY = o.userData?.maxVerticalY;
            if (minY !== undefined && currY < minY) continue;
            if (maxY !== undefined && currY > maxY) continue;
        }

        const ox = o.position.x;
        const oz = o.position.z;

        const dx = px - ox;
        const dz = pz - oz;

        const distSq = dx*dx + dz*dz;

        const radius =
            o.userData?.radius || 1.2;

        const minDist =
            PLAYER_RADIUS + radius;
        const minDistSq = minDist * minDist;

        if(distSq < minDistSq){
            // Si el jugador ya se encuentra solapado (ej. por micro-tirón o teletransporte),
            // permitir el movimiento si este lo aleja del centro del obstáculo (desatasco),
            // evitando que quede permanentemente inmovilizado.
            if (currentPosition) {
                const currDx = currentPosition.x - ox;
                const currDz = currentPosition.z - oz;
                const currDistSq = currDx * currDx + currDz * currDz;
                if (currDistSq < minDistSq && distSq > currDistSq) {
                    continue;
                }
            }

            return true;

        }

    }

    return false;

}