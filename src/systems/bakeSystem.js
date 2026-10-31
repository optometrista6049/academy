/* ======================================================
   MONTESERIN ACADEMY - BAKE SYSTEM (DEV & GIT COMPATIBILITY)
   Permite fijar las posiciones y modelos de Modo Dios directamente
   en el código fuente (.js) del repositorio para que viajen a GitHub
   y se reproduzcan con total exactitud en GitHub Pages (móvil y PC).
   ====================================================== */

import { getWorldLayout, saveWorldLayout, saveLayoutVersion } from './worldLayoutSystem.js';
import { getSavedWorldObjects, saveWorldObjects, saveSceneVersion } from './worldObjectsManager.js';
import { getCustomItems } from './customItemStorage.js';

/**
 * Fija el estado actual del mundo (NPCs, spawn, mobiliario, modelos GLB, Three.js y procedurales)
 * directamente en los archivos de código fuente de la aplicación.
 *
 * @returns {Promise<{ success: boolean, message: string, npcsCount?: number, objectsCount?: number, error?: string }>}
 */
export async function bakeCurrentWorldToCode() {
    try {
        const layout = getWorldLayout();
        const placedObjects = getSavedWorldObjects();
        const customItems = getCustomItems();

        // 1. Guardar también en las versiones locales de respaldo
        saveLayoutVersion('Fijado en Código (Git)');
        saveSceneVersion('Fijado en Código (Git)');

        // 2. Enviar petición al servidor de desarrollo para actualizar los archivos .js en disco
        const response = await fetch('/api/bake-world-to-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                layout,
                placedObjects,
                customItems
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status}: Error al guardar en código`);
        }

        const result = await response.json();
        return {
            success: true,
            message: 'Escenario fijado exitosamente en el código fuente para Git.',
            npcsCount: result.npcsCount || Object.keys(layout.npcs || {}).length,
            objectsCount: result.objectsCount || placedObjects.length
        };
    } catch (err) {
        console.error('[BakeSystem] Error fijando escenario en código:', err);
        return {
            success: false,
            message: 'No se pudo comunicar con el servidor de desarrollo.',
            error: String(err.message || err)
        };
    }
}
