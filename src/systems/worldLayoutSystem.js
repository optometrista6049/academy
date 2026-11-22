/* ======================================================
   MONTESERIN ACADEMY - WORLD LAYOUT SYSTEM
   Gestor centralizado del diseño y posicionamiento oficial del mapa (World Manifest).
   - Administra las posiciones de partida oficiales de NPCs, Player Spawn y Mobiliario.
   - Sincroniza en tiempo real entre LocalStorage y el archivo en disco del servidor (world_layout.json).
   - Garantiza que los cambios realizados por el desarrollador en Modo Dios permanezcan
     para cualquier nueva partida ("Nueva Experiencia") o sesión.
   ====================================================== */

import { DEV_CONFIG, isLocalEditorRuntime } from '../config/devConfig.js';

export const DEFAULT_WORLD_LAYOUT = {
    "playerSpawn": {
        "x": 0,
        "z": 0,
        "rotationY": 0
    },
    "npcs": {
        "Panda": {
            "x": 16,
            "z": 14,
            "rotationY": 0,
            "scale": 1.8
        },
        "Alto": {
            "x": 206.97917252483347,
            "z": -196.05004522154618,
            "rotationY": 4.128839038188898,
            "scale": 2.7
        },
        "Telerín": {
            "x": -4,
            "z": 2,
            "rotationY": 0,
            "scale": 1.8
        },
        "Telerón": {
            "x": 0,
            "z": 5,
            "rotationY": 0,
            "scale": 1.8
        }
    },
    "furniture": {
        "mueble": {
            "x": 14.77,
            "z": 23.26,
            "rotationY": 3.14159,
            "scale": 1
        }
    },
    "hiddenProcedural": {
        "trees": [
            {
                "id": "trees_6_idx_1",
                "archIdx": 6,
                "geoType": 0,
                "instanceIdx": 1,
                "x": 194.54,
                "z": -188.57
            }
        ],
        "rocks": [
            {
                "id": "rocks_0_idx_11",
                "archIdx": 0,
                "geoType": "dodecaedro",
                "instanceIdx": 11,
                "x": -113.78,
                "z": 7.09
            }
        ]
    },
    "updatedAt": 1795289865543
};

const LAYOUT_STORAGE_KEY = 'monteserin_world_layout';
const LAYOUT_VERSIONS_KEY = 'monteserin_world_layout_versions';
const MAX_LAYOUT_VERSIONS = 15;

let currentLayout = null;
let layoutSyncPromise = null;

function buildNormalizedLayout(sourceLayout, extraHidden = null) {
    return {
        ...DEFAULT_WORLD_LAYOUT,
        ...sourceLayout,
        npcs: { ...DEFAULT_WORLD_LAYOUT.npcs, ...(sourceLayout?.npcs || {}) },
        furniture: { ...DEFAULT_WORLD_LAYOUT.furniture, ...(sourceLayout?.furniture || {}) },
        hiddenProcedural: mergeHiddenProcedural(sourceLayout?.hiddenProcedural, extraHidden)
    };
}

/**
 * Permite esperar de forma segura a que termine la sincronización inicial del layout antes de spawnear Player y NPCs.
 */
export function waitForInitialLayoutSync(timeoutMs = 1500) {
    if (typeof window === 'undefined') return Promise.resolve();
    initWorldLayout();
    if (!layoutSyncPromise) return Promise.resolve();
    return Promise.race([
        layoutSyncPromise,
        new Promise((resolve) => setTimeout(resolve, timeoutMs))
    ]);
}

/**
 * Inicializa y carga el layout activo desde LocalStorage (solo en entorno de edición local) o los valores oficiales.
 */
export function initWorldLayout() {
    if (currentLayout) return currentLayout;

    // En versión jugador o despliegue estático (GitHub Pages), ignorar cachés locales de edición
    if (!isLocalEditorRuntime()) {
        currentLayout = JSON.parse(JSON.stringify(DEFAULT_WORLD_LAYOUT));
        layoutSyncPromise = syncWorldLayoutWithServer();
        return currentLayout;
    }

    try {
        const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                const defaultTime = Number(DEFAULT_WORLD_LAYOUT.updatedAt || 0);
                const localTime = Number(parsed.updatedAt || 0);
                if (defaultTime > localTime) {
                    // El código horneado del repositorio/GitHub Pages es más nuevo que la caché local antigua
                    currentLayout = JSON.parse(JSON.stringify(DEFAULT_WORLD_LAYOUT));
                    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(currentLayout));
                } else {
                    currentLayout = buildNormalizedLayout(parsed);
                }
            }
        }
    } catch (e) {
        console.warn('[WorldLayoutSystem] Error leyendo layout local:', e);
    }

    if (!currentLayout) {
        currentLayout = JSON.parse(JSON.stringify(DEFAULT_WORLD_LAYOUT));
    }

    // Sincronizar en segundo plano con el servidor o manifiesto estático
    layoutSyncPromise = syncWorldLayoutWithServer();
    return currentLayout;
}

/**
 * Retorna el layout activo en memoria.
 */
export function getWorldLayout() {
    if (!currentLayout) {
        return initWorldLayout();
    }
    return currentLayout;
}

/**
 * Obtiene la transformación (posición, rotación, escala) de una entidad específica.
 * Normaliza nombres de NPCs para soportar tildes ('Telerin' -> 'Telerín').
 */
export function getEntityTransform(category, entityId, fallback = null) {
    const layout = getWorldLayout();

    if (category === 'playerSpawn') {
        return layout.playerSpawn || fallback || DEFAULT_WORLD_LAYOUT.playerSpawn;
    }

    if (category === 'npcs') {
        const npcs = layout.npcs || {};
        // Normalización para búsquedas flexibles
        const match = npcs[entityId] ||
                      npcs[normalizeEntityName(entityId)] ||
                      fallback ||
                      DEFAULT_WORLD_LAYOUT.npcs[entityId] ||
                      DEFAULT_WORLD_LAYOUT.npcs[normalizeEntityName(entityId)];
        return match ? { ...match } : { x: 0, z: 0, rotationY: 0, scale: 1.0 };
    }

    if (category === 'furniture') {
        const furniture = layout.furniture || {};
        const match = furniture[entityId] || fallback || DEFAULT_WORLD_LAYOUT.furniture[entityId];
        return match ? { ...match } : { x: 0, z: 0, rotationY: 0, scale: 1.0 };
    }

    return fallback;
}

/**
 * Actualiza la posición, rotación o escala de una entidad.
 * Si shouldPersist es false, solo actualiza la memoria activa (modo edición/staged).
 * Si shouldPersist es true, guarda en LocalStorage y sincroniza con el servidor.
 */
export function updateEntityTransform(category, entityId, transform, shouldPersist = true) {
    const layout = getWorldLayout();
    const cleanId = category === 'npcs' ? normalizeEntityName(entityId) : entityId;

    if (category === 'playerSpawn') {
        layout.playerSpawn = {
            ...(layout.playerSpawn || DEFAULT_WORLD_LAYOUT.playerSpawn),
            ...transform
        };
    } else {
        if (!layout[category] || typeof layout[category] !== 'object') {
            layout[category] = {};
        }
        layout[category][cleanId] = {
            ...(layout[category][cleanId] || {}),
            ...transform
        };
    }

    if (shouldPersist) {
        layout.updatedAt = Date.now();

        if (isLocalEditorRuntime()) {
            // Guardar en LocalStorage solo en entorno local de edición
            try {
                localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
            } catch (e) {
                console.warn('[WorldLayoutSystem] Error guardando layout local:', e);
            }

            // Sincronizar inmediatamente al archivo en disco del servidor
            sendServerLayoutSync({
                action: 'update-entity',
                category,
                entityId: cleanId,
                transform
            });
        }
    }

    return layout;
}

/**
 * Persiste explícitamente el layout actual en memoria a LocalStorage y al servidor.
 */
export function commitStagedWorldLayout() {
    if (!currentLayout) return currentLayout;
    return saveWorldLayout(currentLayout);
}

/**
 * Recarga y descarta cambios no guardados en memoria volviendo al estado confirmado en LocalStorage.
 */
export function reloadWorldLayoutFromStorage() {
    currentLayout = null;
    return initWorldLayout();
}

/**
 * Guarda una versión completa del layout del mundo.
 */
export function saveWorldLayout(newLayout, explicitUpdatedAt = null) {
    const ts = Number(explicitUpdatedAt) || Date.now();
    currentLayout = { ...newLayout, updatedAt: ts };
    if (isLocalEditorRuntime()) {
        try {
            localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(currentLayout));
        } catch (e) {
            console.warn('[WorldLayoutSystem] Error guardando layout completo:', e);
        }
        sendServerLayoutSync({
            action: 'save-layout',
            layout: currentLayout
        });
    }
    return currentLayout;
}

/**
 * Obtiene el historial de versiones del layout del mapa.
 */
export function getLayoutVersions() {
    try {
        const raw = localStorage.getItem(LAYOUT_VERSIONS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

/**
 * Guarda un snapshot de versión del diseño del mapa.
 */
export function saveLayoutVersion(customName = '') {
    const layout = getWorldLayout();
    const versions = getLayoutVersions();
    const now = new Date();

    const versionRecord = {
        id: `layout_ver_${Date.now()}`,
        name: customName.trim() || `Diseño ${versions.length + 1} (${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        timestamp: Date.now(),
        dateStr: now.toLocaleDateString() + ' ' + now.toLocaleTimeString(),
        layout: JSON.parse(JSON.stringify(layout))
    };

    versions.unshift(versionRecord);
    if (versions.length > MAX_LAYOUT_VERSIONS) {
        versions.length = MAX_LAYOUT_VERSIONS;
    }
    try {
        localStorage.setItem(LAYOUT_VERSIONS_KEY, JSON.stringify(versions));
    } catch (err) {
        console.warn('[WorldLayoutSystem] Error guardando snapshot:', err);
    }

    sendServerLayoutSync({ action: 'save-versions', versions });
    return versionRecord;
}

/**
 * Restaura una versión anterior del diseño del mapa.
 */
export function restoreLayoutVersion(versionId) {
    const versions = getLayoutVersions();
    const found = versions.find(v => v.id === versionId);
    if (!found || !found.layout) throw new Error('Versión no encontrada');

    return saveWorldLayout(found.layout);
}

/**
 * Restablece el diseño completo del mundo a los valores de fábrica de código.
 */
export function resetWorldLayoutToDefaults() {
    return saveWorldLayout(JSON.parse(JSON.stringify(DEFAULT_WORLD_LAYOUT)));
}

/**
 * Normaliza nombres de entidades para evitar discordancias entre acentos o claves.
 */
function normalizeEntityName(name) {
    if (!name) return '';
    const clean = String(name).trim();
    if (clean.toLowerCase().includes('panda')) return 'Panda';
    if (clean.toLowerCase().includes('alto')) return 'Alto';
    if (clean.toLowerCase().includes('teler') && clean.toLowerCase().includes('in')) return 'Telerín';
    if (clean.toLowerCase().includes('teler') && clean.toLowerCase().includes('on')) return 'Telerón';
    return clean;
}

/**
 * Envía las actualizaciones del layout al servidor en disco.
 */
function sendServerLayoutSync(payload) {
    if (typeof window === 'undefined' || !isLocalEditorRuntime()) return;
    try {
        fetch('/api/world-layout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => {
            console.warn('[WorldLayoutSystem] Sincronización con servidor en segundo plano:', err);
        });
    } catch (_) {}
}

function mergeHiddenProcedural(primary, fallback = null) {
    const merged = { trees: [], rocks: [] };
    const appendUnique = (cat, items) => {
        if (!Array.isArray(items)) return;
        if (!Array.isArray(merged[cat])) merged[cat] = [];
        items.forEach((entry) => {
            if (!entry || typeof entry !== 'object') return;
            const exists = merged[cat].some((it) => {
                if (entry.id && it.id === entry.id) return true;
                if (typeof entry.archIdx === 'number' && it.archIdx === entry.archIdx &&
                    typeof entry.instanceIdx === 'number' && it.instanceIdx === entry.instanceIdx) {
                    return true;
                }
                if (typeof entry.geoType !== 'undefined' && it.geoType === entry.geoType &&
                    typeof entry.instanceIdx === 'number' && it.instanceIdx === entry.instanceIdx) {
                    return true;
                }
                return false;
            });
            if (!exists) merged[cat].push(entry);
        });
    };
    if (fallback && typeof fallback === 'object') {
        Object.keys(fallback).forEach((k) => appendUnique(k, fallback[k]));
    }
    if (primary && typeof primary === 'object') {
        Object.keys(primary).forEach((k) => appendUnique(k, primary[k]));
    }
    return merged;
}

/**
 * Registra una instancia procedural como oculta/eliminada.
 * Si shouldPersist es false, solo actualiza la memoria activa (modo edición/staged)
 * hasta que el usuario pulse 'Guardar y Hornear Escenario'.
 */
export function hideProceduralInstance(category, descriptor, shouldPersist = false) {
    const layout = getWorldLayout();
    const safeCat = String(category || 'procedural').trim() || 'procedural';
    if (!layout.hiddenProcedural) {
        layout.hiddenProcedural = { trees: [], rocks: [] };
    }
    if (!Array.isArray(layout.hiddenProcedural[safeCat])) {
        layout.hiddenProcedural[safeCat] = [];
    }

    const list = layout.hiddenProcedural[safeCat];
    // Evitar duplicados por id o proximidad de coordenadas
    const alreadyExists = list.some(item => {
        if (descriptor.id && item.id === descriptor.id) return true;
        if (typeof descriptor.archIdx === 'number' && item.archIdx === descriptor.archIdx &&
            typeof descriptor.instanceIdx === 'number' && item.instanceIdx === descriptor.instanceIdx) {
            return true;
        }
        if (typeof descriptor.geoType !== 'undefined' && item.geoType === descriptor.geoType &&
            typeof descriptor.instanceIdx === 'number' && item.instanceIdx === descriptor.instanceIdx) {
            return true;
        }
        if (typeof descriptor.x === 'number' && typeof item.x === 'number' &&
            typeof descriptor.z === 'number' && typeof item.z === 'number') {
            return Math.hypot(item.x - descriptor.x, item.z - descriptor.z) < 0.6;
        }
        return false;
    });

    if (!alreadyExists) {
        list.push({
            id: descriptor.id || `${safeCat}_${descriptor.archIdx ?? descriptor.geoType ?? 0}_idx_${descriptor.instanceIdx ?? list.length}`,
            archIdx: descriptor.archIdx,
            geoType: descriptor.geoType,
            instanceIdx: descriptor.instanceIdx,
            x: typeof descriptor.x === 'number' ? Math.round(descriptor.x * 100) / 100 : undefined,
            z: typeof descriptor.z === 'number' ? Math.round(descriptor.z * 100) / 100 : undefined
        });

        if (shouldPersist) {
            layout.updatedAt = Date.now();

            if (isLocalEditorRuntime()) {
                try {
                    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
                } catch (e) {
                    console.warn('[WorldLayoutSystem] Error guardando ocultos localmente:', e);
                }

                sendServerLayoutSync({
                    action: 'save-layout',
                    layout
                });
            }
        }
    }

    return layout.hiddenProcedural[safeCat];
}

/**
 * Consulta si una instancia procedural específica está marcada como oculta/eliminada.
 */
export function isProceduralInstanceHidden(category, descriptor) {
    const layout = getWorldLayout();
    const list = layout.hiddenProcedural?.[category];
    if (!Array.isArray(list) || list.length === 0) return false;

    return list.some(item => {
        if (descriptor.id && item.id === descriptor.id) return true;
        if (typeof descriptor.archIdx === 'number' && item.archIdx === descriptor.archIdx &&
            typeof descriptor.instanceIdx === 'number' && item.instanceIdx === descriptor.instanceIdx) {
            return true;
        }
        if (typeof descriptor.geoType !== 'undefined' && item.geoType === descriptor.geoType &&
            typeof descriptor.instanceIdx === 'number' && item.instanceIdx === descriptor.instanceIdx) {
            return true;
        }
        if (typeof descriptor.x === 'number' && typeof item.x === 'number' &&
            typeof descriptor.z === 'number' && typeof item.z === 'number') {
            return Math.hypot(item.x - descriptor.x, item.z - descriptor.z) < 0.6;
        }
        return false;
    });
}

/**
 * Obtiene la lista completa de instancias procedurales ocultas.
 */
export function getHiddenProceduralInstances(category) {
    const layout = getWorldLayout();
    return layout.hiddenProcedural?.[category] || [];
}

/**
 * Sincronización inicial bidireccional con el servidor al cargar la aplicación.
 */
async function syncWorldLayoutWithServer() {
    if (typeof window === 'undefined') return;
    try {
        let serverLayout = null;
        let isDevApi = false;
        const localEditor = isLocalEditorRuntime();

        if (localEditor) {
            const res = await fetch('/api/world-layout', { cache: 'no-store' }).catch(() => null);
            const ctype = (res?.headers?.get('content-type') || '').toLowerCase();
            if (res && res.ok && ctype.includes('application/json')) {
                const data = await res.json();
                if (data?.success && data.layout && typeof data.layout === 'object' && Object.keys(data.layout).length > 0) {
                    serverLayout = data.layout;
                    isDevApi = true;
                }
            }
        }

        // Fallback estático a ./assets/data/world_layout.json (GitHub Pages / producción)
        if (!serverLayout) {
            const staticRes = await fetch('./assets/data/world_layout.json', { cache: 'no-store' }).catch(() => null);
            const staticType = (staticRes?.headers?.get('content-type') || '').toLowerCase();
            if (staticRes && staticRes.ok && staticType.includes('application/json')) {
                const parsedStatic = await staticRes.json().catch(() => null);
                if (parsedStatic && typeof parsedStatic === 'object' && Object.keys(parsedStatic).length > 0) {
                    serverLayout = parsedStatic;
                }
            }
        }

        if (!serverLayout) return;

        const defaultTime = Number(DEFAULT_WORLD_LAYOUT.updatedAt || 0);
        const serverTime = Number(serverLayout.updatedAt || 0);

        if (!localEditor) {
            if (serverTime > defaultTime) {
                currentLayout = buildNormalizedLayout(serverLayout);
            }
            return;
        }

        const localRaw = localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (!localRaw) {
            if (serverTime >= defaultTime) {
                currentLayout = buildNormalizedLayout(serverLayout);
                localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(currentLayout));
            } else {
                currentLayout = JSON.parse(JSON.stringify(DEFAULT_WORLD_LAYOUT));
                localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(currentLayout));
                if (isDevApi) {
                    sendServerLayoutSync({ action: 'save-layout', layout: currentLayout });
                }
            }
        } else {
            const localParsed = JSON.parse(localRaw);
            const localTime = Number(localParsed.updatedAt || 0);
            const newestLocalOrCode = Math.max(localTime, defaultTime);

            if (serverTime > newestLocalOrCode) {
                currentLayout = buildNormalizedLayout(serverLayout, localParsed.hiddenProcedural);
                localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(currentLayout));
            } else if (isDevApi && localTime > serverTime) {
                sendServerLayoutSync({ action: 'save-layout', layout: localParsed });
            }
        }
    } catch (e) {
        console.warn('[WorldLayoutSystem] Error en sincronización inicial:', e);
    }
}

// Iniciar automáticamente
if (typeof window !== 'undefined') {
    initWorldLayout();
}
