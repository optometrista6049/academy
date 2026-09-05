import * as THREE from 'three';

import { camera }
from '../core/camera.js';

import { runtimeState }
from '../state/runtimeState.js';

import { getHeightAt }
from '../terrain/terrainHeight.js';

import { getBridgeHeight }
from '../environment/bridgeSystem.js';

import { collide }
from '../systems/collisionSystem.js';

import { applyWorldBounds }
from '../systems/worldBounds.js';

import {

    getJoystickInput

} from '../mobile/mobileJoystick.js';

import {
    isInputLocked
} from '../systems/inputLockSystem.js';

export function updateMovement(delta){

    const player = runtimeState.player;

if(!player) return false;

if(isInputLocked()){

    return false;

}

    // =========================
    // DIRECCIONES CAMARA
    // =========================

    const forward = new THREE.Vector3();

    camera.getWorldDirection(forward);

    forward.y = 0;

    forward.normalize();

    const right = new THREE.Vector3()
        .crossVectors(
            forward,
            new THREE.Vector3(0,1,0)
        );

    // =========================
    // INPUT
    // =========================

    const move = new THREE.Vector3();

    const keys = runtimeState.keys;

    // teclado
    if(keys.w) move.add(forward);
    if(keys.s) move.add(forward.clone().multiplyScalar(-1));
    if(keys.a) move.add(right.clone().multiplyScalar(-1));
    if(keys.d) move.add(right);

    // joystick móvil
    const joy = getJoystickInput();

    if(joy.active){

        move.add(
            forward.clone().multiplyScalar(joy.y)
        );

        move.add(
            right.clone().multiplyScalar(joy.x)
        );

    }

    // =========================
    // SIN MOVIMIENTO
    // =========================

    if(move.length() <= 0){

        return false;

    }

    // =========================
    // VELOCIDAD
    // =========================

    move.normalize();

    const totalDistance = 6 * delta;
    move.multiplyScalar(totalDistance);

    // =========================
    // ROTACION
    // =========================

    const angle =
        Math.atan2(move.x, move.z);

    player.rotation.y = angle;

    // =========================
    // SUB-STEPPING FÍSICO DE SEGURIDAD
    // =========================
    // Si la distancia supera 15 cm por frame, se divide en micro-pasos
    // para evitar tunelación a través de obstáculos o pilares.

    const MAX_SUBSTEP = 0.15;
    const steps = Math.max(1, Math.ceil(totalDistance / MAX_SUBSTEP));
    const stepMove = move.clone().multiplyScalar(1 / steps);

    for (let s = 0; s < steps; s++) {
        const nextPos = player.position.clone().add(stepMove);
        applyWorldBounds(nextPos);

        if (!collide(nextPos, player.position)) {
            player.position.copy(nextPos);
        } else {
            // Deslizamiento sobre superficies (componente X y Z independientes)
            const nextPosX = player.position.clone();
            nextPosX.x += stepMove.x;
            applyWorldBounds(nextPosX);
            if (Math.abs(stepMove.x) > 0.001 && !collide(nextPosX, player.position)) {
                player.position.copy(nextPosX);
            } else {
                const nextPosZ = player.position.clone();
                nextPosZ.z += stepMove.z;
                applyWorldBounds(nextPosZ);
                if (Math.abs(stepMove.z) > 0.001 && !collide(nextPosZ, player.position)) {
                    player.position.copy(nextPosZ);
                }
            }
        }
    }

    // =========================
    // ALTURA TERRENO / PUENTE
    // =========================

    const bridgeHeight = getBridgeHeight(
        player.position.x,
        player.position.z,
        player.position.y
    );

    const groundHeight = getHeightAt(
        player.position.x,
        player.position.z
    );

    const surfaceHeight = (bridgeHeight !== null) ? bridgeHeight : groundHeight;

    player.position.y = surfaceHeight + runtimeState.playerHeightOffset;

    return true;

}