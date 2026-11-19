/* ======================================================
   MONTESERIN ACADEMY - BAKE SYSTEM (DEV & GIT COMPATIBILITY)
   Permite fijar las posiciones y modelos de Modo Dios directamente
   en los archivos de código fuente (.js) y manifiestos (.json) del
   repositorio para que viajen a GitHub y se reproduzcan con total
   exactitud en GitHub Pages (móvil y PC).
   ====================================================== */

import { getWorldLayout, saveWorldLayout, saveLayoutVersion } from './worldLayoutSystem.js';
import { getSavedWorldObjects, saveWorldObjects, saveSceneVersion } from './worldObjectsManager.js';
import { getCustomItems } from './customItemStorage.js';

/**
 * Fija el estado actual del mundo (NPCs, spawn, mobiliario, modelos GLB, Three.js y procedurales)
 * directamente en los archivos de código fuente de la aplicación.
 * SOLO registra la versión "Fijado en Código (Git)" si el servidor confirma escritura real en disco.
 *
 * @returns {Promise<{ success: boolean, message: string, npcsCount?: number, objectsCount?: number, bakedAt?: number, error?: string }>}
 */
export async function bakeCurrentWorldToCode() {
    try {
        const layout = getWorldLayout();
        const placedObjects = getSavedWorldObjects();
        const customItems = getCustomItems();

        // 1. Enviar petición al servidor de desarrollo para actualizar archivos .js y .json en disco
        const response = await fetch('/api/bake-world-to-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                layout,
                placedObjects,
                customItems
            })
        });

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (!response.ok || !contentType.includes('application/json')) {
            const errData = contentType.includes('application/json')
                ? await response.json().catch(() => ({}))
                : {};
            throw new Error(
                errData.error ||
                (response.ok
                    ? 'Estás en una vista estática/compartida sin servidor de desarrollo local.'
                    : `HTTP ${response.status}: Error al guardar en código`)
            );
        }

        const result = await response.json();
        if (!result || result.success !== true) {
            throw new Error(result?.error || 'El servidor no confirmó la escritura en disco.');
        }

        const bakedAt = Number(result.bakedAt) || Date.now();

        // 2. Solo tras confirmación real del servidor, sincronizar timestamps y registrar snapshot único
        if (layout && typeof layout === 'object') {
            saveWorldLayout({ ...layout, updatedAt: bakedAt }, bakedAt);
        }
        saveWorldObjects(placedObjects, bakedAt);
        saveLayoutVersion('Fijado en Código (Git)');
        saveSceneVersion('Fijado en Código (Git)');

        return {
            success: true,
            message: 'Escenario fijado exitosamente en el código fuente (.js + .json) para Git.',
            npcsCount: result.npcsCount || Object.keys(layout?.npcs || {}).length,
            objectsCount: result.objectsCount ?? placedObjects.length,
            bundleStats: result.bundleStats || null,
            bakedAt
        };
    } catch (err) {
        console.error('[BakeSystem] Error fijando escenario en código:', err);
        return {
            success: false,
            message: 'No se pudo hornear en código fuente del servidor.',
            error: String(err.message || err)
        };
    }
}
