import * as THREE from 'three';

import { camera } from '../core/camera.js';

import { collidables } from '../entities/collisions.js';

const raycaster = new THREE.Raycaster();

export function fixCameraCollision(targetPos, camDistance){

    const dir = new THREE.Vector3()
        .subVectors(camera.position, targetPos)
        .normalize();

    raycaster.set(targetPos, dir);

    const intersects = raycaster.intersectObjects(
        collidables,
        true
    );

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