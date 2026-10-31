import {

    gameState

}
from '../state/gameState.js';

const SAVE_KEY =

    'monteserinAcademySave';

import {
    runtimeState
}
from '../state/runtimeState.js';

import { restoreInventoryFromGameState } from '../ui/registry/modules/inventoryModuleV2.js';
import { restoreArchiveFromGameState } from '../ui/registry/modules/archiveModule.js';
import { resetSessionBatteryForNewGame } from './sessionBatterySystem.js';

export function saveGame(){
    try {
        if(runtimeState.player){
            gameState.player.x =
                runtimeState.player.position.x;
            gameState.player.y =
                runtimeState.player.position.y;
            gameState.player.z =
                runtimeState.player.position.z;
        }

        const serialized = JSON.stringify(gameState);
        if(serialized){
            localStorage.setItem(
                SAVE_KEY,
                serialized
            );
        }
    } catch(err){
        console.warn('No se pudo guardar la partida:', err);
    }
}

export function loadGame(){
    try{
        const data =
            localStorage.getItem(
                SAVE_KEY
            );

        if(!data || typeof data !== 'string' || !data.trim() || data === 'undefined' || data === 'null'){
            return false;
        }

        const save =
            JSON.parse(data);

        if(save && typeof save === 'object' && !Array.isArray(save)){
            Object.assign(
                gameState,
                save
            );

            // Restaurar inventario y documentos archivados en el Registro
            try {
                restoreInventoryFromGameState();
                restoreArchiveFromGameState();
            } catch (err) {
                console.warn('Error restaurando inventario/archivo:', err);
            }

            return true;
        }

        localStorage.removeItem(SAVE_KEY);
        return false;
    }
    catch(error){
        console.warn('Partida guardada no válida o corrupta en localStorage. Se reinicia el almacenamiento:', error);
        try {
            localStorage.removeItem(SAVE_KEY);
        } catch {}
        return false;
    }
}

export function deleteSave(){
    try {
        localStorage.removeItem(SAVE_KEY);
        localStorage.removeItem(CHECKPOINT_KEY);
        localStorage.removeItem('monteserin_session_battery');
    } catch {}
    try {
        resetSessionBatteryForNewGame();
    } catch {}
    try {
        gameState.player = { x: 0, y: 0, z: 0 };
        gameState.quests = {};
        gameState.flags = { metPanda: false, registryUnlocked: false };
        gameState.inventory = [];
        gameState.archived = [];
        gameState.dialogueIndices = { panda: 0, alto: 0, telerin: 0, teleron: 0 };
        gameState.npcRelations = {};
        gameState.discoveredLocations = [];
        gameState.playTime = 0;
        if (gameState.missionCheckpoint) {
            delete gameState.missionCheckpoint;
        }
    } catch {}
}

export function hasSave(){
    try {
        const raw =
            localStorage.getItem(
                SAVE_KEY
            );

        if(!raw || typeof raw !== 'string' || !raw.trim() || raw === 'undefined' || raw === 'null'){
            return false;
        }

        const parsed = JSON.parse(raw);
        return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
    } catch {
        try {
            localStorage.removeItem(SAVE_KEY);
        } catch {}
        return false;
    }
}

// ======================================================
// PUNTOS DE CONTROL SEGUROS DE MISIÓN (CHECKPOINT RESTORE)
// Permite al jugador reanudar desde el último hito de misión
// seguro en caso de fallos de sincronía o pasos bloqueados.
// ======================================================

const CHECKPOINT_KEY = 'monteserinAcademy_missionCheckpoint';

// Catálogo y resolvedor dinámico de títulos de misiones
const MISSION_TITLES = {
    mission_001: 'Misión 1: Carnet de Aspirante',
    mission001: 'Misión 1: Carnet de Aspirante',
    mission_001_complete: 'Misión 1: Carnet de Aspirante',
    mission_002: 'Misión 2: Los Guardianes de la Academia',
    mission002: 'Misión 2: Los Guardianes de la Academia',
    mission_002_complete: 'Misión 2: Los Guardianes de la Academia',
    mission_003: 'Misión 3: El Enigma del Santuario',
    mission003: 'Misión 3: El Enigma del Santuario',
    mission_003_complete: 'Misión 3: El Enigma del Santuario'
};

export function resolveMissionTitle(missionId) {
    if (!missionId) return 'Misión Completada';
    if (MISSION_TITLES[missionId]) return MISSION_TITLES[missionId];
    const numMatch = missionId.match(/\d+/);
    if (numMatch) {
        const num = parseInt(numMatch[0], 10);
        return `Misión ${num}`;
    }
    return `Misión: ${missionId}`;
}

export function getLatestCompletedMission(sourceQuests = {}, sourceFlags = {}) {
    const completedList = [];

    if (sourceQuests && typeof sourceQuests === 'object') {
        for (const [mId, status] of Object.entries(sourceQuests)) {
            if (status === 'completed') {
                const numMatch = mId.match(/\d+/);
                const order = numMatch ? parseInt(numMatch[0], 10) : 1;
                completedList.push({ id: mId, order });
            }
        }
    }

    // Compatibilidad retroactiva con Misión 1 (Carnet de aspirante) si flags marcan completado
    if (sourceFlags && (sourceFlags.receivedAspirantCard || sourceFlags.deliveredBox)) {
        if (!completedList.some(m => m.id === 'mission_001' || m.id === 'mission001')) {
            completedList.push({ id: 'mission_001', order: 1 });
        }
    }

    if (completedList.length === 0) return null;

    completedList.sort((a, b) => b.order - a.order);
    const latest = completedList[0];
    return {
        id: latest.id,
        order: latest.order,
        title: resolveMissionTitle(latest.id)
    };
}

export function saveMissionCheckpoint(missionId, metadata = {}){
    try {
        if(runtimeState.player){
            gameState.player.x = runtimeState.player.position.x;
            gameState.player.y = runtimeState.player.position.y;
            gameState.player.z = runtimeState.player.position.z;
        }

        const cleanMissionId = missionId || 'checkpoint';
        const resolvedTitle = metadata.name || metadata.title || resolveMissionTitle(cleanMissionId);

        const payload = {
            version: 1,
            missionId: cleanMissionId,
            missionTitle: resolvedTitle,
            safeLocation: metadata.safeLocation || {
                x: gameState.player.x || 0,
                y: gameState.player.y || 0,
                z: gameState.player.z || 0
            },
            timestamp: Date.now(),
            dateFormatted: new Date().toLocaleString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }),
            gameState: JSON.parse(JSON.stringify(gameState))
        };

        // Guardado atómico dual: en su clave propia y dentro de gameState para persistir siempre
        gameState.missionCheckpoint = payload;
        localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(payload));
        saveGame();
        console.log(`💾 Punto de control seguro guardado atómicamente [${payload.missionTitle}] (${payload.dateFormatted})`);
    } catch(err){
        console.warn('No se pudo guardar el punto de control de misión:', err);
    }
}

export function loadMissionCheckpoint(){
    try {
        let data = null;
        const raw = localStorage.getItem(CHECKPOINT_KEY);
        if(raw && typeof raw === 'string' && raw.trim()) {
            try { data = JSON.parse(raw); } catch {}
        }

        if(!data && gameState.missionCheckpoint) {
            data = gameState.missionCheckpoint;
        }

        if(!data || !data.gameState || typeof data.gameState !== 'object') return false;

        // Sobrescribir el estado actual con el snapshot verificado del checkpoint
        Object.assign(gameState, data.gameState);

        // Si se especificó una ubicación segura para el checkpoint, asegurar posición del jugador
        if (data.safeLocation) {
            gameState.player.x = data.safeLocation.x ?? gameState.player.x;
            gameState.player.y = data.safeLocation.y ?? gameState.player.y;
            gameState.player.z = data.safeLocation.z ?? gameState.player.z;
        }

        if(runtimeState.player){
            runtimeState.player.position.set(
                gameState.player.x,
                gameState.player.y,
                gameState.player.z
            );
        }

        // Restaurar inventario y documentos archivados
        try {
            restoreInventoryFromGameState();
            restoreArchiveFromGameState();
        } catch (err) {
            console.warn('Error restaurando inventario/archivo desde checkpoint:', err);
        }

        // Sincronizar también con el guardado principal para persistir la recuperación
        saveGame();
        console.log(`✅ Partida reanudada desde el punto de control: ${data.missionTitle}`);
        return true;
    } catch(err){
        console.warn('Error cargando el punto de control de misión:', err);
        return false;
    }
}

export function ensureMissionCheckpointFromSave() {
    try {
        const rawSave = localStorage.getItem(SAVE_KEY);
        if (!rawSave) return false;
        const save = JSON.parse(rawSave);
        if (!save || typeof save !== 'object') return false;

        const latest = getLatestCompletedMission(save.quests, save.flags);
        if (!latest) {
            return false;
        }

        const rawCheckpoint = localStorage.getItem(CHECKPOINT_KEY);
        let shouldWrite = true;

        if (rawCheckpoint && rawCheckpoint.trim() && rawCheckpoint !== 'undefined' && rawCheckpoint !== 'null') {
            try {
                const existing = JSON.parse(rawCheckpoint);
                if (existing && existing.missionId && existing.gameState) {
                    const existingNumMatch = existing.missionId.match(/\d+/);
                    const existingOrder = existingNumMatch ? parseInt(existingNumMatch[0], 10) : 0;
                    if (existingOrder >= latest.order) {
                        shouldWrite = false;
                    }
                }
            } catch {
                shouldWrite = true;
            }
        }

        if (shouldWrite) {
            const payload = {
                version: 1,
                missionId: `${latest.id}_complete`,
                missionTitle: `${latest.title} (Completada)`,
                safeLocation: { x: save.player?.x || 0, y: save.player?.y || 0, z: save.player?.z || 4 },
                timestamp: Date.now(),
                dateFormatted: new Date().toLocaleString('es-ES', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                }),
                gameState: JSON.parse(JSON.stringify(save))
            };
            localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(payload));
            console.log('🛡️ Punto de control seguro sincronizado con última misión completada:', payload.missionTitle);
        }
        return true;
    } catch {
        return false;
    }
}

export function hasMissionCheckpoint(){
    try {
        ensureMissionCheckpointFromSave();
        const raw = localStorage.getItem(CHECKPOINT_KEY);
        if(raw && typeof raw === 'string' && raw.trim() && raw !== 'undefined' && raw !== 'null') {
            const parsed = JSON.parse(raw);
            if(parsed && parsed.gameState && typeof parsed.gameState === 'object') {
                const latestInCp = getLatestCompletedMission(parsed.gameState?.quests, parsed.gameState?.flags) ||
                                   (parsed.missionId && parsed.missionId.includes('complete'));
                if (latestInCp) {
                    return true;
                }
            }
        }

        // Verificación en gameState activo
        if (gameState.missionCheckpoint && gameState.missionCheckpoint.gameState) {
            const latestInActive = getLatestCompletedMission(
                gameState.missionCheckpoint.gameState.quests,
                gameState.missionCheckpoint.gameState.flags
            );
            if (latestInActive) {
                return true;
            }
        }

        // Verificación en guardado principal
        const rawSave = localStorage.getItem(SAVE_KEY);
        if (rawSave) {
            const save = JSON.parse(rawSave);
            if (save && getLatestCompletedMission(save.quests, save.flags)) {
                return true;
            }
        }

        return false;
    } catch {
        return false;
    }
}

export function getMissionCheckpointInfo(){
    try {
        if (!hasMissionCheckpoint()) return null;
        let parsed = null;
        const raw = localStorage.getItem(CHECKPOINT_KEY);
        if(raw && typeof raw === 'string' && raw.trim() && raw !== 'undefined' && raw !== 'null') {
            try { parsed = JSON.parse(raw); } catch {}
        }
        if(!parsed && gameState.missionCheckpoint) {
            parsed = gameState.missionCheckpoint;
        }
        if(!parsed) {
            const rawSave = localStorage.getItem(SAVE_KEY);
            if (rawSave) {
                const save = JSON.parse(rawSave);
                const latest = getLatestCompletedMission(save?.quests, save?.flags);
                if (latest) {
                    parsed = {
                        missionId: `${latest.id}_complete`,
                        missionTitle: `${latest.title} (Completada)`,
                        timestamp: Date.now(),
                        dateFormatted: new Date().toLocaleString('es-ES', {
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                        })
                    };
                }
            }
        }
        if(!parsed) return null;

        const resolvedTitle = parsed.missionTitle || (parsed.missionId ? resolveMissionTitle(parsed.missionId) : 'Última Misión Completada');

        return {
            missionId: parsed.missionId || 'mission_complete',
            missionTitle: resolvedTitle,
            timestamp: parsed.timestamp || 0,
            dateFormatted: parsed.dateFormatted || ''
        };
    } catch {
        return null;
    }
}

export function deleteMissionCheckpoint(){
    try {
        localStorage.removeItem(CHECKPOINT_KEY);
        if (gameState.missionCheckpoint) {
            delete gameState.missionCheckpoint;
        }
    } catch {}
}