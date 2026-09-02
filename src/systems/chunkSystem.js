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
 * Registra un objeto colisionable en la celda espacial correspondiente.
 */
export function registerCollidableInGrid(item) {
    if (!item || !item.position) return;
    const key = getChunkKeyFromPos(item.position.x, item.position.z);
    if (!spatialGrid.has(key)) {
        spatialGrid.set(key, []);
    }
    spatialGrid.get(key).push(item);
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

/**
 * Obtiene solo los colisionables situados en la celda del jugador y las 8 celdas adyacentes (3x3).
 */
export function getNearbyCollidables(px, pz) {
    const centerCx = getChunkCoord(px);
    const centerCz = getChunkCoord(pz);
    const nearby = [];

    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const key = getChunkKey(centerCx + dx, centerCz + dz);
            const bucket = spatialGrid.get(key);
            if (bucket && bucket.length > 0) {
                for (let i = 0; i < bucket.length; i++) {
                    nearby.push(bucket[i]);
                }
            }
        }
    }

    return nearby;
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

let lastChunkUpdate = 0;

/**
 * Actualiza la visibilidad de los chunks en base a la distancia al jugador
 */
export function updateChunkSystem() {
    const now = performance.now();
    if (now - lastChunkUpdate < 150) return; // Ejecutar cada 150ms para máxima eficiencia de CPU
    lastChunkUpdate = now;

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
                    obj.visible = isVisible;
                }
            }
        }
    });
}
