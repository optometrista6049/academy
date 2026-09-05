import * as THREE from 'three';
import { camera } from '../core/camera.js';
import { cameraObstacles } from '../entities/collisions.js';

const raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _tempObstacles = [];
const _tempPos = new THREE.Vector3();

export function fixCameraCollision(targetPos, camDistance){
    if (!camDistance || camDistance <= 0.5) return;

    _dir.subVectors(camera.position, targetPos);
    const currentLen = _dir.length();
    if (currentLen < 0.001) return;
    _dir.multiplyScalar(1 / currentLen);

    raycaster.set(targetPos, _dir);
    raycaster.far = camDistance;

    // Solo comprobar obstáculos que estén a tiro de cámara (radio camDistance + 3m de margen)
    const maxCheckDistSq = (camDistance + 3.0) * (camDistance + 3.0);
    _tempObstacles.length = 0;

    for (let i = 0; i < cameraObstacles.length; i++) {
        const o = cameraObstacles[i];
        if (!o || !o.isObject3D) continue;
        const ox = o.position ? o.position.x : 0;
        const oz = o.position ? o.position.z : 0;
        const dx = targetPos.x - ox;
        const dz = targetPos.z - oz;
        if (dx * dx + dz * dz < maxCheckDistSq) {
            _tempObstacles.push(o);
        }
    }

    if (_tempObstacles.length === 0) return;

    const intersects = raycaster.intersectObjects(
        _tempObstacles,
        true
    );

    if (intersects.length > 0) {
        const dist = intersects[0].distance;
        if (dist < camDistance) {
            const safeDist = Math.max(dist - 0.4, 0.5);
            _tempPos.copy(targetPos).addScaledVector(_dir, safeDist);
            camera.position.copy(_tempPos);
        }
    }
}
