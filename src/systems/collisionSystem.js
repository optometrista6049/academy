import {
    collidables,
    isWaterCollision
} from '../entities/collisions.js';
import { getNearbyCollidables } from './chunkSystem.js';

const PLAYER_RADIUS = 0.6;

export function collide(nextPosition){

    const px = nextPosition.x;
    const pz = nextPosition.z;

    // Bloqueo de entrada en agua (Lago y Río)
    if (isWaterCollision(px, pz)) {
        return true;
    }

    // Búsqueda espacial por chunks (O(1))
    const nearby = getNearbyCollidables(px, pz);
    const targetList = nearby.length > 0 ? nearby : collidables;

    for(let i = 0; i < targetList.length; i++){
        const o = targetList[i];
        if (!o || !o.position) continue;

        const ox = o.position.x;
        const oz = o.position.z;

        const dx = px - ox;
        const dz = pz - oz;

        const distSq = dx*dx + dz*dz;

        const radius =
            o.userData?.radius || 1.2;

        const minDist =
            PLAYER_RADIUS + radius;

        if(distSq < minDist * minDist){

            return true;

        }

    }

    return false;

}