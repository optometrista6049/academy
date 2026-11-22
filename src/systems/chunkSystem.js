import * as THREE from 'three';
import { runtimeState } from '../state/runtimeState.js';

// ======================================================
// CONFIGURACIÓN DE CHUNKS & SPATIAL HASH GRID
// ======================================================
export const CHUNK_SIZE = 50; // Tamaño de celda en metros (10x10 celdas para mapa 500x500)
export const VISIBILITY_DISTANCE = 180; // Distancia máxima de activación de chunks
export const VISIBILITY_DISTANCE_SQ = VISIBILITY_DISTANCE * VISIBILITY_DISTANCE;

// Spatial Hash Grid para colisiones rápidas O(1)
const spatialGrid = new Map();

// Chunks visuales para gestión de oclusión y objetos 3D
const visualChunks = new Map();

// ======================================================
// HELPERS DE CLAVE ESPACIAL
// ======================================================
export function getChunkCoord(val) {
    return Math.floor(val / CHUNK_SIZE);
}

export function getChunkKey(cx, cz) {
    return `${cx}_${cz}`;
}

export function getChunkKeyFromPos(x, z) {
    return `${getChunkCoord(x)}_${getChunkCoord(z)}`;
}

// ======================================================
// SPATIAL HASH GRID PARA FÍSICA Y COLISIONES
// ======================================================
/**
 * Registra un objeto colisionable en todas las celdas espaciales que cubre su caja OBB o radio.
 */
export function registerCollidableInGrid(item) {
    if (!item || !item.position) return;

    let wx = item.position.x;
    let wz = item.position.z;
    let extentX = 0.5;
    let extentZ = 0.5;

    const obb = item.userData?.obbCollision;
    let minCx;
    let maxCx;
    let minCz;
    let maxCz;

    if (obb && typeof obb.halfX === 'number' && typeof obb.halfZ === 'number') {
        const ry = item.rotation ? item.rotation.y : 0;
        const cosR = Math.cos(ry);
        const sinR = Math.sin(ry);
        const computeBounds = (box) => {
            const ox = box.offsetX || 0;
            const oz = box.offsetZ || 0;
            const bx = item.position.x + ox * cosR + oz * sinR;
            const bz = item.position.z - ox * sinR + oz * cosR;
            const ex = box.halfX * Math.abs(cosR) + box.halfZ * Math.abs(sinR) + 0.5;
            const ez = box.halfX * Math.abs(sinR) + box.halfZ * Math.abs(cosR) + 0.5;
            return {
                minCx: getChunkCoord(bx - ex),
                maxCx: getChunkCoord(bx + ex),
                minCz: getChunkCoord(bz - ez),
                maxCz: getChunkCoord(bz + ez)
            };
        };

        const baseBounds = computeBounds(obb);
        minCx = baseBounds.minCx;
        maxCx = baseBounds.maxCx;
        minCz = baseBounds.minCz;
        maxCz = baseBounds.maxCz;

        const extraObbs = item.userData?.extraObbCollisions;
        if (Array.isArray(extraObbs)) {
            for (let i = 0; i < extraObbs.length; i++) {
                const sub = extraObbs[i];
                if (!sub || typeof sub.halfX !== 'number' || typeof sub.halfZ !== 'number') continue;
                const sb = computeBounds(sub);
                minCx = Math.min(minCx, sb.minCx);
                maxCx = Math.max(maxCx, sb.maxCx);
                minCz = Math.min(minCz, sb.minCz);
                maxCz = Math.max(maxCz, sb.maxCz);
            }
        }
    } else {
        if (typeof item.userData?.radius === 'number' && item.userData.radius > 0) {
            extentX = item.userData.radius;
            extentZ = item.userData.radius;
        }
        minCx = getChunkCoord(wx - extentX);
        maxCx = getChunkCoord(wx + extentX);
        minCz = getChunkCoord(wz - extentZ);
        maxCz = getChunkCoord(wz + extentZ);
    }

    for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
            const key = getChunkKey(cx, cz);
            if (!spatialGrid.has(key)) {
                spatialGrid.set(key, []);
            }
            const bucket = spatialGrid.get(key);
            if (!bucket.includes(item)) {
                bucket.push(item);
            }
        }
    }
}

/**
 * Reconstruye el grid espacial si hay cambios dinámicos o tras la carga inicial
 */
export function rebuildSpatialGrid(collidablesList) {
    spatialGrid.clear();
    for (let i = 0; i < collidablesList.length; i++) {
        registerCollidableInGrid(collidablesList[i]);
    }
}

// Buffer y Set preasignados reutilizables para consultas espaciales (Zero-Allocation)
const nearbyBuffer = [];
const nearbySeenSet = new Set();

/**
 * Obtiene solo los colisionables situados en la celda del jugador y las 8 celdas adyacentes (3x3).
 */
export function getNearbyCollidables(px, pz) {
    const centerCx = getChunkCoord(px);
    const centerCz = getChunkCoord(pz);
    nearbyBuffer.length = 0;
    nearbySeenSet.clear();

    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const key = getChunkKey(centerCx + dx, centerCz + dz);
            const bucket = spatialGrid.get(key);
            if (bucket && bucket.length > 0) {
                for (let i = 0; i < bucket.length; i++) {
                    const obj = bucket[i];
                    if (!nearbySeenSet.has(obj)) {
                        nearbySeenSet.add(obj);
                        nearbyBuffer.push(obj);
                    }
                }
            }
        }
    }

    return nearbyBuffer;
}

// ======================================================
// GESTIÓN DE CHUNKS VISUALES (LOD & STREAMING DE OBJETOS)
// ======================================================
/**
 * Registra un objeto o grupo visual en su chunk correspondiente
 */
export function registerVisualInChunk(object3D, x, z) {
    const cx = getChunkCoord(x);
    const cz = getChunkCoord(z);
    const key = getChunkKey(cx, cz);

    if (!visualChunks.has(key)) {
        visualChunks.set(key, {
            cx,
            cz,
            worldX: (cx + 0.5) * CHUNK_SIZE,
            worldZ: (cz + 0.5) * CHUNK_SIZE,
            objects: [],
            visible: true
        });
    }

    const chunk = visualChunks.get(key);
    chunk.objects.push(object3D);
}

/**
 * Desregistra un objeto de su chunk visual si se mueve o se elimina
 */
export function unregisterVisualFromChunk(object3D) {
    if (!object3D) return;
    visualChunks.forEach(chunk => {
        const idx = chunk.objects.indexOf(object3D);
        if (idx >= 0) {
            chunk.objects.splice(idx, 1);
        }
    });
}

let lastChunkUpdate = 0;

/**
 * Actualiza la visibilidad de los chunks en base a la distancia al jugador
 */
export function updateChunkSystem() {
    const now = performance.now();
    if (now - lastChunkUpdate < 150) return; // Ejecutar cada 150ms para máxima eficiencia de CPU
    lastChunkUpdate = now;

    if (runtimeState.isGodMode) {
        visualChunks.forEach(chunk => {
            if (!chunk.visible) {
                chunk.visible = true;
                for (let i = 0; i < chunk.objects.length; i++) {
                    const obj = chunk.objects[i];
                    if (obj) {
                        obj.visible = !obj.userData?.hiddenByLayout;
                    }
                }
            }
        });
        return;
    }

    if (!runtimeState.player) return;

    const px = runtimeState.player.position.x;
    const pz = runtimeState.player.position.z;

    visualChunks.forEach(chunk => {
        const dx = chunk.worldX - px;
        const dz = chunk.worldZ - pz;
        const distSq = dx * dx + dz * dz;

        // Si el centro del chunk está más allá de la distancia activa + radio del chunk
        const chunkRadius = CHUNK_SIZE * 0.7071; // Radio circunscrito
        const maxDist = VISIBILITY_DISTANCE + chunkRadius;
        const isVisible = distSq <= maxDist * maxDist;

        if (chunk.visible !== isVisible) {
            chunk.visible = isVisible;
            for (let i = 0; i < chunk.objects.length; i++) {
                const obj = chunk.objects[i];
                if (obj) {
                    obj.visible = !obj.userData?.hiddenByLayout && isVisible;
                }
            }
        }
    });
}
