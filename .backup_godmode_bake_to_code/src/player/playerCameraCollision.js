import * as THREE from 'three';
import { camera } from '../core/camera.js';
import { cameraObstacles } from '../entities/collisions.js';

const raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _tempObstacles = [];
const _tempPos = new THREE.Vector3();
const _focusPos = new THREE.Vector3();

export function fixCameraCollision(targetPos, camDistance){
    if (!camDistance || camDistance <= 0.5 || !targetPos) return;

    // Asegurar que el punto de origen del rayo esté a la altura del pecho/cabeza (nunca en los pies)
    _focusPos.copy(targetPos);
    // Si la posición objetivo viene en la base (pies), elevar al centro de masa / torso
    _focusPos.y += 1.3;

    _dir.subVectors(camera.position, _focusPos);
    const currentLen = _dir.length();
    if (currentLen < 0.001) return;
    _dir.multiplyScalar(1 / currentLen);

    raycaster.set(_focusPos, _dir);
    raycaster.far = camDistance;

    // Solo comprobar obstáculos que estén a tiro de cámara (radio camDistance + 3m de margen)
    const maxCheckDistSq = (camDistance + 3.0) * (camDistance + 3.0);
    _tempObstacles.length = 0;

    for (let i = 0; i < cameraObstacles.length; i++) {
        const o = cameraObstacles[i];
        if (!o || !o.isObject3D) continue;

        // Si el objeto tiene una posición explícita en el mundo, filtrar por distancia inmediata
        if (o.position && (o.position.x !== 0 || o.position.z !== 0)) {
            const dx = _focusPos.x - o.position.x;
            const dz = _focusPos.z - o.position.z;
            if (dx * dx + dz * dz > maxCheckDistSq) {
                continue;
            }
        }

        _tempObstacles.push(o);
    }

    if (_tempObstacles.length === 0) return;

    const intersects = raycaster.intersectObjects(
        _tempObstacles,
        true
    );

    if (intersects.length > 0) {
        const dist = intersects[0].distance;
        if (dist < camDistance) {
            // Mantener al menos 1.0m para no meter la cámara dentro del cuerpo del personaje
            const safeDist = Math.max(dist - 0.35, 1.0);
            _tempPos.copy(_focusPos).addScaledVector(_dir, safeDist);
            camera.position.copy(_tempPos);
        }
    }
}
