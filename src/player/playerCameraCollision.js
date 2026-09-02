import * as THREE from 'three';
import { camera } from '../core/camera.js';
import { cameraObstacles } from '../entities/collisions.js';

const raycaster = new THREE.Raycaster();

export function fixCameraCollision(targetPos, camDistance){

    const dir = new THREE.Vector3()
        .subVectors(camera.position, targetPos)
        .normalize();

    raycaster.set(targetPos, dir);

    const validObstacles = cameraObstacles.filter(o => o && o.isObject3D);
    if(validObstacles.length === 0) return;

    const intersects = raycaster.intersectObjects(
        validObstacles,
        true
    );

    if(intersects.length > 0){

        const dist = intersects[0].distance;

        if(dist < camDistance){

            camera.position.copy(
                targetPos.clone().add(
                    dir.multiplyScalar(Math.max(dist - 0.5, 0.5))
                )
            );

        }

    }

}