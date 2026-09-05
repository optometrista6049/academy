import * as THREE from 'three';
import { WORLD_LIMIT } from '../core/config.js';
import { LAKE_CENTER_X, LAKE_CENTER_Z, getLakeBasinRadius, getShoreRatio } from '../terrain/terrainHeight.js';
import { isPointInRiverWater } from '../terrain/riverPath.js';
import { getNearbyCollidables, registerCollidableInGrid } from '../systems/chunkSystem.js';
import { isPointOnAnyBridge, checkBridgeRailCollision, checkBridgePierCollision } from '../environment/bridgeSystem.js';

export const collidables = [];
export const cameraObstacles = [];

export function addCollidable(item) {
    collidables.push(item);
    registerCollidableInGrid(item);
}

const PLAYER_RADIUS = 0.6;

export function isWaterCollision(px, pz, currentY = null) {
    // Si el jugador está sobre el tablero de un puente (y no abajo en el cauce), no colisiona con el agua debajo
    if (isPointOnAnyBridge(px, pz, currentY)) {
        return false;
    }

    // 1. Lago principal
    const dx = px - LAKE_CENTER_X;
    const dz = pz - LAKE_CENTER_Z;
    const distToLake = Math.hypot(dx, dz);
    if (distToLake < 80) {
        const theta = Math.atan2(dz, dx);
        const basinR = getLakeBasinRadius(theta);
        const shoreR = basinR * getShoreRatio(theta);
        if (distToLake < shoreR - 0.5) {
            return true;
        }
    }

    // 2. Afluente / Río
    if (isPointInRiverWater(px, pz)) {
        return true;
    }

    return false;
}

export function collide(nextPosition, currentPosition = null){

    const px = nextPosition.x;
    const pz = nextPosition.z;
    const currY = currentPosition ? currentPosition.y : null;

    // Barandillas laterales y límites físicos del puente (con verificación 3D)
    if (currentPosition && checkBridgeRailCollision(currentPosition.x, currentPosition.z, px, pz, currY)) {
        return true;
    }

    // Pilares de piedra del puente (OBB 3D - cubre caras anchas y estrechas bajo el tablero)
    if (checkBridgePierCollision(px, pz, currY)) {
        return true;
    }

    // Bloqueo de entrada en agua (Lago y Río)
    if (isWaterCollision(px, pz, currY)) {
        return true;
    }

    // Consulta espacial O(1) por chunks
    const nearby = getNearbyCollidables(px, pz);
    const targetList = nearby.length > 0 ? nearby : collidables;

    for(let i = 0; i < targetList.length; i++){
        const o = targetList[i];
        if (!o || !o.position) continue;

        // Comprobación de altura vertical 3D si el obstáculo define límites Y
        if (currY !== null) {
            const minY = o.userData?.minVerticalY;
            const maxY = o.userData?.maxVerticalY;
            if (minY !== undefined && currY < minY) continue;
            if (maxY !== undefined && currY > maxY) continue;
        }

        const ox = o.position.x;
        const oz = o.position.z;

        const dx = px - ox;
        const dz = pz - oz;

        const distSq = dx*dx + dz*dz;

        const radius = o.userData?.radius || 1.2;

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

    const validObstacles = cameraObstacles.filter(o => o && o.isObject3D);
    if(validObstacles.length === 0) return;

    const intersects =
        raycaster.intersectObjects(validObstacles, true);

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