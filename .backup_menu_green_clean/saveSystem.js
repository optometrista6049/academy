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
        localStorage.removeItem(
            SAVE_KEY
        );
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

export function saveMissionCheckpoint(missionId, metadata = {}){
    try {
        if(runtimeState.player){
            gameState.player.x = runtimeState.player.position.x;
            gameState.player.y = runtimeState.player.position.y;
            gameState.player.z = runtimeState.player.position.z;
        }

        const payload = {
            version: 1,
            missionId: missionId || 'checkpoint',
            missionTitle: metadata.name || 'Misión Guardada',
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

        localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(payload));
        console.log(`💾 Punto de control seguro guardado [${payload.missionTitle}] (${payload.dateFormatted})`);
    } catch(err){
        console.warn('No se pudo guardar el punto de control de misión:', err);
    }
}

export function loadMissionCheckpoint(){
    try {
        const raw = localStorage.getItem(CHECKPOINT_KEY);
        if(!raw || typeof raw !== 'string' || !raw.trim()) return false;

        const data = JSON.parse(raw);
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

        // Regla estricta: Los puntos de control SEGUROS solo se registran cuando una misión
        // está 100% COMPLETADA, no durante su evolución o inicios para evitar desincronías.
        const isMission1Completed = save.quests?.mission_001 === 'completed' || save.flags?.receivedAspirantCard;

        if (isMission1Completed) {
            const rawCheckpoint = localStorage.getItem(CHECKPOINT_KEY);
            let shouldWrite = true;

            if (rawCheckpoint && rawCheckpoint.trim() && rawCheckpoint !== 'undefined') {
                try {
                    const existing = JSON.parse(rawCheckpoint);
                    // Si ya existe y es de misión completada válida y reciente, no sobreescribir
                    if (existing && existing.missionId === 'mission_001_complete' && existing.gameState?.quests?.mission_001 === 'completed') {
                        shouldWrite = false;
                    }
                } catch {
                    shouldWrite = true;
                }
            }

            if (shouldWrite) {
                const payload = {
                    version: 1,
                    missionId: 'mission_001_complete',
                    missionTitle: 'Misión 1: Carnet de Aspirante (Completada)',
                    safeLocation: { x: save.player?.x || 0, y: save.player?.y || 0, z: save.player?.z || 4 },
                    timestamp: Date.now(),
                    dateFormatted: new Date().toLocaleString('es-ES', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                    }),
                    gameState: JSON.parse(JSON.stringify(save))
                };
                localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(payload));
                console.log('🛡️ Punto de control seguro de misión completada sincronizado:', payload.missionTitle);
            }
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

export function hasMissionCheckpoint(){
    try {
        ensureMissionCheckpointFromSave();
        const raw = localStorage.getItem(CHECKPOINT_KEY);
        if(!raw || typeof raw !== 'string' || !raw.trim()) return false;
        const parsed = JSON.parse(raw);
        return Boolean(parsed && parsed.gameState && typeof parsed.gameState === 'object');
    } catch {
        return false;
    }
}

export function getMissionCheckpointInfo(){
    try {
        const raw = localStorage.getItem(CHECKPOINT_KEY);
        if(!raw) return null;
        const parsed = JSON.parse(raw);
        if(!parsed || !parsed.gameState) return null;
        return {
            missionId: parsed.missionId || 'checkpoint',
            missionTitle: parsed.missionTitle || 'Última Misión Guardada',
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
    } catch {}
}