import * as THREE from 'three';
import { WORLD_LIMIT } from '../core/config.js';
import { LAKE_CENTER_X, LAKE_CENTER_Z, getLakeBasinRadius, getShoreRatio } from '../terrain/terrainHeight.js';
import { isPointInRiverWater } from '../terrain/riverPath.js';
import { getNearbyCollidables, registerCollidableInGrid, rebuildSpatialGrid } from '../systems/chunkSystem.js';
import { isPointOnAnyBridge, checkBridgeRailCollision, checkBridgePierCollision } from '../environment/bridgeSystem.js';
import { runtimeState } from '../state/runtimeState.js';

export const collidables = [];
export const cameraObstacles = [];

export function addCollidable(item) {
    if (!item) return null;
    if (!collidables.includes(item)) {
        collidables.push(item);
        registerCollidableInGrid(item);
    }
    return item;
}

export function removeCollidable(item) {
    if (!item) return;
    const idx = collidables.indexOf(item);
    if (idx >= 0) {
        collidables.splice(idx, 1);
        rebuildSpatialGrid(collidables);
    }
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
    const targetList = nearby;

    for(let i = 0; i < targetList.length; i++){
        const o = targetList[i];
        if (!o || !o.position) continue;

        // Comprobación de altura vertical 3D si el obstáculo define límites Y
        if (currY !== null) {
            const minY = o.userData?.minVerticalY;
            const maxY = o.userData?.maxVerticalY;
            const footY = currY - (runtimeState.playerHeightOffset || 0);
            const headY = footY + 1.4;
            if (minY !== undefined && headY < minY) continue;
            if (maxY !== undefined && footY > maxY) continue;
        }

        const ox = o.position.x;
        const oz = o.position.z;

        const obb = o.userData?.obbCollision;
        if (obb && typeof obb.halfX === 'number' && typeof obb.halfZ === 'number') {
            const ry = o.rotation ? o.rotation.y : 0;
            const cosR = Math.cos(ry);
            const sinR = Math.sin(ry);
            const dx = px - ox;
            const dz = pz - oz;

            const checkRotatedBox = (box) => {
                if (!box || typeof box.halfX !== 'number' || typeof box.halfZ !== 'number') return false;
                const lx = dx * cosR - dz * sinR - (box.offsetX || 0);
                const lz = dx * sinR + dz * cosR - (box.offsetZ || 0);

                const clampedX = Math.max(-box.halfX, Math.min(box.halfX, lx));
                const clampedZ = Math.max(-box.halfZ, Math.min(box.halfZ, lz));
                const ex = lx - clampedX;
                const ez = lz - clampedZ;
                const boxDistSq = ex * ex + ez * ez;

                if (boxDistSq < PLAYER_RADIUS * PLAYER_RADIUS) {
                    if (currentPosition) {
                        const cdx = currentPosition.x - ox;
                        const cdz = currentPosition.z - oz;
                        const clx = cdx * cosR - cdz * sinR - (box.offsetX || 0);
                        const clz = cdx * sinR + cdz * cosR - (box.offsetZ || 0);
                        const cClampedX = Math.max(-box.halfX, Math.min(box.halfX, clx));
                        const cClampedZ = Math.max(-box.halfZ, Math.min(box.halfZ, clz));
                        const cex = clx - cClampedX;
                        const cez = clz - cClampedZ;
                        const currBoxDistSq = cex * cex + cez * cez;
                        if (currBoxDistSq < PLAYER_RADIUS * PLAYER_RADIUS && boxDistSq > currBoxDistSq) {
                            return false;
                        }
                    }
                    return true;
                }
                return false;
            };

            if (checkRotatedBox(obb)) {
                return true;
            }
            const extraObbs = o.userData?.extraObbCollisions;
            if (Array.isArray(extraObbs)) {
                for (let j = 0; j < extraObbs.length; j++) {
                    if (checkRotatedBox(extraObbs[j])) {
                        return true;
                    }
                }
            }
            continue;
        }

        const dx = px - ox;
        const dz = pz - oz;

        const distSq = dx*dx + dz*dz;

        const radius = o.userData?.radius || 1.2;

        const minDist = PLAYER_RADIUS + radius;
        const minDistSq = minDist * minDist;

        if(distSq < minDistSq){
            // Si el jugador ya se encuentra solapado, permitir el movimiento si lo aleja del centro
            if (currentPosition) {
                const currDx = currentPosition.x - ox;
                const currDz = currentPosition.z - oz;
                const currDistSq = currDx * currDx + currDz * currDz;
                if (currDistSq < minDistSq && distSq > currDistSq) {
                    continue;
                }
            }

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