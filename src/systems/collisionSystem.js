import {

    collidables

} from '../entities/collisions.js';

const PLAYER_RADIUS = 0.6;

export function collide(nextPosition){

    const px = nextPosition.x;
    const pz = nextPosition.z;

    for(const o of collidables){

        const ox = o.position.x;
        const oz = o.position.z;

        const dx = px - ox;
        const dz = pz - oz;

        const distSq = dx*dx + dz*dz;

        const radius =
            o.userData.radius || 1.2;

        const minDist =
            PLAYER_RADIUS + radius;

        if(distSq < minDist * minDist){

            return true;

        }

    }

    return false;

}