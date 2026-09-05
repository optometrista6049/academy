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

// Vectores reutilizables para cálculo de movimiento (Zero-Allocation por frame)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _move = new THREE.Vector3();
const _stepMove = new THREE.Vector3();
const _nextPos = new THREE.Vector3();
const _nextPosX = new THREE.Vector3();
const _nextPosZ = new THREE.Vector3();

export function updateMovement(delta){

    const player = runtimeState.player;

if(!player) return false;

if(isInputLocked()){

    return false;

}

    // =========================
    // DIRECCIONES CAMARA
    // =========================

    camera.getWorldDirection(_forward);
    _forward.y = 0;
    _forward.normalize();

    _right.crossVectors(_forward, _up);

    // =========================
    // INPUT
    // =========================

    _move.set(0, 0, 0);

    const keys = runtimeState.keys;

    // teclado
    if(keys.w) _move.add(_forward);
    if(keys.s) _move.addScaledVector(_forward, -1);
    if(keys.a) _move.addScaledVector(_right, -1);
    if(keys.d) _move.add(_right);

    // joystick móvil
    const joy = getJoystickInput();

    if(joy.active){
        _move.addScaledVector(_forward, joy.y);
        _move.addScaledVector(_right, joy.x);
    }

    // =========================
    // SIN MOVIMIENTO
    // =========================

    if(_move.lengthSq() <= 0.000001){

        return false;

    }

    // =========================
    // VELOCIDAD
    // =========================

    _move.normalize();

    const totalDistance = 6 * delta;
    _move.multiplyScalar(totalDistance);

    // =========================
    // ROTACION
    // =========================

    const angle =
        Math.atan2(_move.x, _move.z);

    player.rotation.y = angle;

    // =========================
    // SUB-STEPPING FÍSICO DE SEGURIDAD
    // =========================
    // Si la distancia supera 15 cm por frame, se divide en micro-pasos
    // para evitar tunelación a través de obstáculos o pilares.

    const MAX_SUBSTEP = 0.15;
    const steps = Math.max(1, Math.ceil(totalDistance / MAX_SUBSTEP));
    _stepMove.copy(_move).multiplyScalar(1 / steps);

    for (let s = 0; s < steps; s++) {
        _nextPos.copy(player.position).add(_stepMove);
        applyWorldBounds(_nextPos);

        if (!collide(_nextPos, player.position)) {
            player.position.copy(_nextPos);
        } else {
            // Deslizamiento sobre superficies (componente X y Z independientes)
            _nextPosX.copy(player.position);
            _nextPosX.x += _stepMove.x;
            applyWorldBounds(_nextPosX);
            if (Math.abs(_stepMove.x) > 0.001 && !collide(_nextPosX, player.position)) {
                player.position.copy(_nextPosX);
            } else {
                _nextPosZ.copy(player.position);
                _nextPosZ.z += _stepMove.z;
                applyWorldBounds(_nextPosZ);
                if (Math.abs(_stepMove.z) > 0.001 && !collide(_nextPosZ, player.position)) {
                    player.position.copy(_nextPosZ);
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