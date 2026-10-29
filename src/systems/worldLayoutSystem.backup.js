/* ======================================================
   MONTESERIN ACADEMY - WORLD LAYOUT SYSTEM
   Gestor centralizado del diseño y posicionamiento oficial del mapa (World Manifest).
   - Administra las posiciones de partida oficiales de NPCs, Player Spawn y Mobiliario.
   - Sincroniza en tiempo real entre LocalStorage y el archivo en disco del servidor (world_layout.json).
   - Garantiza que los cambios realizados por el desarrollador en Modo Dios permanezcan
     para cualquier nueva partida ("Nueva Experiencia") o sesión.
   ====================================================== */

export const DEFAULT_WORLD_LAYOUT = {
    playerSpawn: { x: 0, z: 0, rotationY: 0 },
    npcs: {
        Panda: { x: 16, z: 14, rotationY: 0, scale: 1.8 },
        Alto: { x: 4, z: 2, rotationY: 0, scale: 2.7 },
        'Telerín': { x: -4, z: 2, rotationY: 0, scale: 1.8 },
        'Telerón': { x: 0, z: 5, rotationY: 0, scale: 1.8 }
    },
    furniture: {
        mueble: { x: 14.77, z: 23.26, rotationY: Math.PI, scale: 1.0 }
    },
    updatedAt: 1729837000000
};

const LAYOUT_STORAGE_KEY = 'monteserin_world_layout';
const LAYOUT_VERSIONS_KEY = 'monteserin_world_layout_versions';

let currentLayout = null;

/**
 * Inicializa y carga el layout activo desde LocalStorage o los valores por defecto.
 */
export function initWorldLayout() {
    if (currentLayout) return currentLayout;

    try {
        const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                currentLayout = {
                    ...DEFAULT_WORLD_LAYOUT,
                    ...parsed,
                    npcs: { ...DEFAULT_WORLD_LAYOUT.npcs, ...(parsed.npcs || {}) },
                    furniture: { ...DEFAULT_WORLD_LAYOUT.furniture, ...(parsed.furniture || {}) }
                };
            }
        }
    } catch (e) {
        console.warn('[WorldLayoutSystem] Error leyendo layout local:', e);
    }

    if (!currentLayout) {
        currentLayout = JSON.parse(JSON.stringify(DEFAULT_WORLD_LAYOUT));
    }

    // Sincronizar en segundo plano con el servidor
    syncWorldLayoutWithServer();
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
 * Actualiza la posición, rotación o escala de una entidad y la persiste permanentemente.
 */
export function updateEntityTransform(category, entityId, transform) {
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

    layout.updatedAt = Date.now();

    // Guardar en LocalStorage
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

    return layout;
}

/**
 * Guarda una versión completa del layout del mundo.
 */
export function saveWorldLayout(newLayout) {
    currentLayout = { ...newLayout, updatedAt: Date.now() };
    try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(currentLayout));
    } catch (e) {
        console.warn('[WorldLayoutSystem] Error guardando layout completo:', e);
    }
    sendServerLayoutSync({
        action: 'save-layout',
        layout: currentLayout
    });
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
    if (typeof window === 'undefined') return;
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

/**
 * Sincronización inicial bidireccional con el servidor al cargar la aplicación.
 */
async function syncWorldLayoutWithServer() {
    if (typeof window === 'undefined') return;
    try {
        const res = await fetch('/api/world-layout').catch(() => null);
        if (res && res.ok) {
            const data = await res.json();
            if (data.success && data.layout && typeof data.layout === 'object' && Object.keys(data.layout).length > 0) {
                const serverLayout = data.layout;
                const localRaw = localStorage.getItem(LAYOUT_STORAGE_KEY);

                if (!localRaw) {
                    // Si el navegador está limpio (primera vez o caché borrada), adoptar lo del servidor en disco
                    currentLayout = {
                        ...DEFAULT_WORLD_LAYOUT,
                        ...serverLayout,
                        npcs: { ...DEFAULT_WORLD_LAYOUT.npcs, ...(serverLayout.npcs || {}) },
                        furniture: { ...DEFAULT_WORLD_LAYOUT.furniture, ...(serverLayout.furniture || {}) }
                    };
                    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(currentLayout));
                } else {
                    // Si ambos existen, el de fecha más reciente manda
                    const localParsed = JSON.parse(localRaw);
                    const localTime = localParsed.updatedAt || 0;
                    const serverTime = serverLayout.updatedAt || 0;

                    if (serverTime > localTime) {
                        currentLayout = {
                            ...DEFAULT_WORLD_LAYOUT,
                            ...serverLayout,
                            npcs: { ...DEFAULT_WORLD_LAYOUT.npcs, ...(serverLayout.npcs || {}) },
                            furniture: { ...DEFAULT_WORLD_LAYOUT.furniture, ...(serverLayout.furniture || {}) }
                        };
                        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(currentLayout));
                    } else if (localTime > serverTime) {
                        sendServerLayoutSync({ action: 'save-layout', layout: localParsed });
                    }
                }
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
