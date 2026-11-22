import { gameState } from '../state/gameState.js';
import { missionState } from '../state/missionState.js';
import { runtimeState } from '../state/runtimeState.js';
import { restoreInventoryFromGameState, restoreEquippedItemsFromGameState } from '../ui/registry/modules/inventoryModuleV2.js';
import { restoreArchiveFromGameState } from '../ui/registry/modules/archiveModule.js';
import { resetSessionBatteryForNewGame } from './sessionBatterySystem.js';
import { getHeightAt } from '../terrain/terrainHeight.js';
import { collidables } from '../entities/collisions.js';
import { rebuildSpatialGrid } from './chunkSystem.js';
import { getMuebleObject, syncMuebleDrawerTransform } from '../entities/objects/muebleObject.js';
import { syncMicrochipsFromGameState } from './microchipHuntSystem.js';
import { syncRegistryButtonVisibility } from '../ui/registry/registryUI.js';

function syncLiveSceneAfterLoad() {
    try {
        if (getMuebleObject()) {
            syncMuebleDrawerTransform({ syncState: true });
            rebuildSpatialGrid(collidables);
        }
    } catch (err) {
        console.warn('Error sincronizando mueble tras cargar partida:', err);
    }
    try {
        restoreEquippedItemsFromGameState();
    } catch (err) {
        console.warn('Error restaurando equipamiento tras cargar partida:', err);
    }
    try {
        syncMicrochipsFromGameState();
    } catch (err) {
        console.warn('Error sincronizando microchips tras cargar partida:', err);
    }
    try {
        syncRegistryButtonVisibility();
    } catch (err) {
        console.warn('Error sincronizando visibilidad del Registro tras cargar partida:', err);
    }
}

const SAVE_KEY = 'monteserinAcademySave';

function getDefaultGameStateSnapshot() {
    return {
        version: 1,
        player: { x: 0, y: 0, z: 0 },
        quests: {},
        flags: {
            metPanda: false,
            registryUnlocked: false,
            collectedMicrochips: []
        },
        inventory: [],
        itemCounts: {},
        equipped: {
            rightHand: null,
            leftHand: null,
            back: null,
            head: null
        },
        archived: [],
        dialogueIndices: {
            panda: 0,
            alto: 0,
            telerin: 0,
            teleron: 0
        },
        npcRelations: {},
        discoveredLocations: [],
        playTime: 0,
        sessionControl: {
            enabled: false,
            totalMinutesPlayed: 0,
            todayMinutesPlayed: 0,
            consumedSeconds: 0,
            cooldownUntil: null,
            lastActiveTimestamp: null
        }
    };
}

function applySavedGameState(save) {
    const defaults = getDefaultGameStateSnapshot();
    gameState.version = typeof save.version === 'number' ? save.version : defaults.version;
    gameState.player = { ...defaults.player, ...(save.player && typeof save.player === 'object' ? save.player : {}) };
    gameState.quests = { ...(save.quests && typeof save.quests === 'object' ? save.quests : {}) };
    gameState.flags = { ...defaults.flags, ...(save.flags && typeof save.flags === 'object' ? save.flags : {}) };
    gameState.flags.collectedMicrochips = Array.isArray(save.flags?.collectedMicrochips)
        ? [...save.flags.collectedMicrochips]
        : [];
    gameState.inventory = Array.isArray(save.inventory) ? [...save.inventory] : [];
    gameState.itemCounts = { ...(save.itemCounts && typeof save.itemCounts === 'object' ? save.itemCounts : {}) };
    gameState.equipped = { ...defaults.equipped, ...(save.equipped && typeof save.equipped === 'object' ? save.equipped : {}) };
    gameState.archived = Array.isArray(save.archived) ? [...save.archived] : [];
    gameState.dialogueIndices = { ...defaults.dialogueIndices, ...(save.dialogueIndices && typeof save.dialogueIndices === 'object' ? save.dialogueIndices : {}) };
    gameState.npcRelations = { ...(save.npcRelations && typeof save.npcRelations === 'object' ? save.npcRelations : {}) };
    gameState.discoveredLocations = Array.isArray(save.discoveredLocations) ? [...save.discoveredLocations] : [];
    gameState.playTime = typeof save.playTime === 'number' ? save.playTime : 0;
    gameState.sessionControl = { ...defaults.sessionControl, ...(save.sessionControl && typeof save.sessionControl === 'object' ? save.sessionControl : {}) };
    if (save.missionCheckpoint) {
        gameState.missionCheckpoint = save.missionCheckpoint;
    } else if (gameState.missionCheckpoint) {
        delete gameState.missionCheckpoint;
    }

    restoreMissionStateFromSave(save);
}

function restoreMissionStateFromSave(save) {
    const savedMission = save?.missionState;
    if (savedMission && typeof savedMission === 'object' && !Array.isArray(savedMission)) {
        missionState.activeMissionId = savedMission.activeMissionId || null;
        missionState.activeMissionStatus = savedMission.activeMissionStatus || null;
        missionState.objectives = savedMission.objectives && typeof savedMission.objectives === 'object'
            ? { ...savedMission.objectives }
            : {};
        return;
    }

    // Reconstrucción retroactiva si un guardado antiguo no incluía missionState
    const quests = gameState.quests || {};
    const flags = gameState.flags || {};
    const inv = Array.isArray(gameState.inventory) ? gameState.inventory : [];
    const hasBadgeBox = inv.some(it => (typeof it === 'string' ? it : it?.id) === 'badgeBox');
    const chipCount = Math.max(
        Number(gameState.itemCounts?.microchip || 0),
        Array.isArray(flags.collectedMicrochips) ? flags.collectedMicrochips.length : 0
    );

    if (quests.mission_002 === 'completed' || flags.deliveredMicrochips) {
        missionState.activeMissionId = 'mission002';
        missionState.activeMissionStatus = 'completed';
        missionState.objectives = {
            showCardToAlto: true,
            findMicrochips: true,
            deliverMicrochipsToAlto: true
        };
    } else if (quests.mission_002 === 'active' || flags.altoScannedCard || flags.receivedAspirantCard || flags.deliveredBox) {
        missionState.activeMissionId = 'mission002';
        missionState.activeMissionStatus = 'active';
        missionState.objectives = {
            showCardToAlto: Boolean(flags.altoScannedCard),
            findMicrochips: Boolean(flags.deliveredMicrochips || chipCount >= 7),
            deliverMicrochipsToAlto: Boolean(flags.deliveredMicrochips)
        };
    } else if (quests.mission_001 === 'completed') {
        missionState.activeMissionId = 'mission001';
        missionState.activeMissionStatus = 'completed';
        missionState.objectives = {
            findBadgeBox: true,
            deliverBadgeBox: true,
            receiveBadge: true
        };
    } else if (quests.mission_001 === 'active' || flags.metPanda || flags.hasFurnitureKey) {
        missionState.activeMissionId = 'mission001';
        missionState.activeMissionStatus = 'active';
        missionState.objectives = {
            findBadgeBox: Boolean(flags.openedMueble || hasBadgeBox || flags.deliveredBox),
            deliverBadgeBox: Boolean(flags.deliveredBox),
            receiveBadge: Boolean(flags.receivedAspirantCard)
        };
    } else {
        missionState.activeMissionId = null;
        missionState.activeMissionStatus = null;
        missionState.objectives = {};
    }
}

function buildSavePayload() {
    if (runtimeState.player) {
        gameState.player.x = runtimeState.player.position.x;
        gameState.player.y = runtimeState.player.position.y;
        gameState.player.z = runtimeState.player.position.z;
    }
    return {
        ...gameState,
        missionState: {
            activeMissionId: missionState.activeMissionId,
            activeMissionStatus: missionState.activeMissionStatus,
            objectives: { ...(missionState.objectives || {}) }
        }
    };
}

export function saveGame(){
    try {
        const payload = buildSavePayload();
        const serialized = JSON.stringify(payload);
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
            applySavedGameState(save);

            // Restaurar inventario y documentos archivados en el Registro
            try {
                restoreInventoryFromGameState();
                restoreArchiveFromGameState();
            } catch (err) {
                console.warn('Error restaurando inventario/archivo:', err);
            }

            syncLiveSceneAfterLoad();
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
        const defaults = getDefaultGameStateSnapshot();
        Object.assign(gameState, defaults);
        if (gameState.missionCheckpoint) {
            delete gameState.missionCheckpoint;
        }
        missionState.activeMissionId = null;
        missionState.activeMissionStatus = null;
        missionState.objectives = {};
        syncRegistryButtonVisibility();
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
    mission_002: 'Misión 2: El Registro de Entrada',
    mission002: 'Misión 2: El Registro de Entrada',
    mission_002_complete: 'Misión 2: El Registro de Entrada',
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

    // Compatibilidad retroactiva con Misión 2 (Registro de entrada y microchips)
    if (sourceFlags && sourceFlags.deliveredMicrochips) {
        if (!completedList.some(m => m.id === 'mission_002' || m.id === 'mission002')) {
            completedList.push({ id: 'mission_002', order: 2 });
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

        const snapshot = buildSavePayload();
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
            gameState: JSON.parse(JSON.stringify(snapshot))
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

        // Sobrescribir el estado actual con fusión segura de sub-objetos y missionState
        applySavedGameState(data.gameState);

        // Si se especificó una ubicación segura para el checkpoint, asegurar posición del jugador
        if (data.safeLocation) {
            const safeX = data.safeLocation.x ?? gameState.player.x;
            const safeZ = data.safeLocation.z ?? gameState.player.z;
            let safeY = data.safeLocation.y ?? gameState.player.y;
            const groundY = getHeightAt(safeX, safeZ);
            const expectedSurface = groundY + (runtimeState.playerHeightOffset || 0);
            if (!Number.isFinite(safeY) || safeY < groundY - 0.15 || (safeY === 0 && Math.abs(expectedSurface) > 0.15)) {
                safeY = expectedSurface;
            }
            gameState.player.x = safeX;
            gameState.player.y = safeY;
            gameState.player.z = safeZ;
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
        syncLiveSceneAfterLoad();
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
            const cpX = save.player?.x ?? 0;
            const cpZ = save.player?.z ?? 4;
            const cpY = (typeof save.player?.y === 'number' && save.player.y !== 0)
                ? save.player.y
                : getHeightAt(cpX, cpZ) + (runtimeState.playerHeightOffset || 0);
            const payload = {
                version: 1,
                missionId: `${latest.id}_complete`,
                missionTitle: `${latest.title} (Completada)`,
                safeLocation: { x: cpX, y: cpY, z: cpZ },
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