import * as THREE from 'three';

import { camera }
from '../core/camera.js';

import { runtimeState }
from '../state/runtimeState.js';

import { getHeightAt }
from '../terrain/terrainHeight.js';

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

    const speed = 6 * delta;

    move.multiplyScalar(speed);

    // =========================
    // ROTACION
    // =========================

    const angle =
        Math.atan2(move.x, move.z);

    player.rotation.y = angle;

    // =========================
    // NUEVA POSICION
    // =========================

    const nextPos =
        player.position.clone().add(move);

    applyWorldBounds(nextPos);

    if(!collide(nextPos)){

        player.position.copy(nextPos);

    }

    // =========================
    // ALTURA TERRENO
    // =========================

    player.position.y =

        getHeightAt(
            player.position.x,
            player.position.z
        )

        + runtimeState.playerHeightOffset;

    return true;

}