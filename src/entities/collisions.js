import * as THREE from 'three';
import { WORLD_LIMIT } from '../core/config.js';

export const collidables = [];

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

        const radius = o.userData.radius || 1.2;

        const minDist = PLAYER_RADIUS + radius;

        if(distSq < minDist * minDist){

            return true;

        }

    }

    return false;
}

export function applyWorldBounds(pos){

    let bounced = false;

    if(pos.x > WORLD_LIMIT){

        pos.x = WORLD_LIMIT;
        bounced = true;

    }

    if(pos.x < -WORLD_LIMIT){

        pos.x = -WORLD_LIMIT;
        bounced = true;

    }

    if(pos.z > WORLD_LIMIT){

        pos.z = WORLD_LIMIT;
        bounced = true;

    }

    if(pos.z < -WORLD_LIMIT){

        pos.z = -WORLD_LIMIT;
        bounced = true;

    }

    return bounced;
}

const raycaster = new THREE.Raycaster();

export function fixCameraCollision(camera, targetPos, camDistance){

    const dir = new THREE.Vector3()
        .subVectors(camera.position, targetPos)
        .normalize();

    raycaster.set(targetPos, dir);

    const intersects =
        raycaster.intersectObjects(collidables, true);

    if(intersects.length > 0){

        const dist = intersects[0].distance;

        if(dist < camDistance){

            camera.position.copy(
                targetPos.clone().add(
                    dir.multiplyScalar(dist - 0.5)
                )
            );

        }

    }

}