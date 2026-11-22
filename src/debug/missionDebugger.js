/* ======================================================
   MONTESERIN ACADEMY - MISSION DEBUGGER & STATE INJECTOR
   Permite saltar a cualquier punto de la historia y testear
   misiones de forma independiente sin repetir pasos anteriores.
   ====================================================== */

import { gameState } from '../state/gameState.js';
import { runtimeState } from '../state/runtimeState.js';
import {
    addInventoryItem,
    removeInventoryItem,
    getInventoryItems,
    restoreEquippedItemsFromGameState
} from '../ui/registry/modules/inventoryModuleV2.js';
import { missionState } from '../state/missionState.js';
import {
    archiveItem,
    getArchivedItems,
    restoreArchiveFromGameState
} from '../ui/registry/modules/archiveModule.js';
import { updateDiaryContent } from '../ui/registry/modules/diaryModule.js';
import {
    completeObjective,
    completeActiveMission,
    startMissionFromData
} from '../systems/missionManager.js';
import { mission001, mission002 } from '../systems/missions/missionData.js';
import { getEntityTransform } from '../systems/worldLayoutSystem.js';
import { getHeightAt } from '../terrain/terrainHeight.js';
import { syncMuebleDrawerTransform } from '../entities/objects/muebleObject.js';
import { collidables } from '../entities/collisions.js';
import { rebuildSpatialGrid } from '../systems/chunkSystem.js';
import { saveGame } from '../systems/saveSystem.js';
import {
    unlockBatterySystem,
    devSetSystemEnabled
} from '../systems/sessionBatterySystem.js';
import {
    syncMicrochipsFromGameState,
    MICROCHIP_SPAWN_POINTS
} from '../systems/microchipHuntSystem.js';
import { syncRegistryButtonVisibility } from '../ui/registry/registryUI.js';

function resetBaseStateForPreset() {
    clearInventoryAll();
    gameState.itemCounts = {};
    gameState.equipped = {
        rightHand: null,
        leftHand: null,
        back: null,
        head: null
    };
    restoreEquippedItemsFromGameState();
    gameState.flags.metPanda = false;
    gameState.flags.metMonty = false;
    gameState.flags.talkedToPanda = false;
    gameState.flags.hasFurnitureKey = false;
    gameState.flags.openedMueble = false;
    gameState.flags.drawerOpened = false;
    gameState.flags.deliveredBox = false;
    gameState.flags.receivedAspirantCard = false;
    gameState.flags.altoScannedCard = false;
    gameState.flags.deliveredMicrochips = false;
    gameState.flags.collectedMicrochips = [];
    gameState.flags.batterySystemUnlocked = false;
    gameState.flags.registryUnlocked = true;
    devSetSystemEnabled(false);
    gameState.quests = {};
    gameState.archived = [];
    gameState.dialogueIndices = {
        panda: 0,
        alto: 0,
        telerin: 0,
        teleron: 0
    };
    missionState.activeMissionId = null;
    missionState.activeMissionStatus = null;
    missionState.objectives = {};
    restoreArchiveFromGameState();
    syncMicrochipsFromGameState();
    syncRegistryButtonVisibility();
}

export const MISSION_PRESETS = [
    {
        id: 'clean_start',
        name: 'Estado 0: Inicio Limpio',
        description: 'Partida virgen. Sin misiones activas ni hablar con Monty.',
        apply() {
            resetBaseStateForPreset();
            gameState.flags.registryUnlocked = false;
            syncRegistryButtonVisibility();
            teleportPlayer(0, 0, 0);
            syncMuebleDrawerTransform({ syncState: true });
            rebuildSpatialGrid(collidables);
            updateDiaryContent();
            saveGame();
        }
    },
    {
        id: 'm1_key_acquired',
        name: 'Misión 1 (Paso 1): Llave recibida',
        description: 'Monty te ha dado la llave del mueble. Listo para abrir la cómoda.',
        apply() {
            resetBaseStateForPreset();
            gameState.flags.metPanda = true;
            gameState.flags.hasFurnitureKey = true;
            gameState.quests.mission_001 = 'active';
            startMissionFromData(mission001);
            addInventoryItem('furnitureKey');
            // Teletransportar cerca del mueble usando su posición oficial actual
            const furniture = getEntityTransform('furniture', 'mueble', { x: 14.77, z: 23.26 });
            teleportPlayer(furniture.x, 0, furniture.z - 2.2);
            syncMuebleDrawerTransform({ syncState: true });
            rebuildSpatialGrid(collidables);
            updateDiaryContent();
        }
    },
    {
        id: 'm1_box_acquired',
        name: 'Misión 1 (Paso 2): Caja de cartón en inventario',
        description: 'Caja recuperada del mueble. Listo para hablar con Monty y entregarla.',
        apply() {
            resetBaseStateForPreset();
            gameState.flags.metPanda = true;
            gameState.flags.hasFurnitureKey = true;
            gameState.flags.openedMueble = true;
            gameState.flags.drawerOpened = true;
            gameState.quests.mission_001 = 'active';
            startMissionFromData(mission001);
            completeObjective('findBadgeBox');
            addInventoryItem('badgeBox');
            // Teletransportar frente a Monty usando su posición oficial actual
            const panda = getEntityTransform('npcs', 'Panda', { x: 16, z: 14 });
            teleportPlayer(panda.x - 2.0, 0, panda.z - 2.0);
            syncMuebleDrawerTransform({ syncState: true });
            rebuildSpatialGrid(collidables);
            updateDiaryContent();
        }
    },
    {
        id: 'm1_completed',
        name: 'Misión 1 (Finalizada): Carnet de Aspirante Oficial',
        description: 'Caja entregada. Carnet en Inventario y Archivado en Registro.',
        apply() {
            resetBaseStateForPreset();
            gameState.flags.metPanda = true;
            gameState.flags.hasFurnitureKey = true;
            gameState.flags.openedMueble = true;
            gameState.flags.drawerOpened = true;
            gameState.flags.deliveredBox = true;
            gameState.flags.receivedAspirantCard = true;
            gameState.quests.mission_001 = 'completed';
            startMissionFromData(mission001);
            completeObjective('findBadgeBox');
            completeObjective('deliverBadgeBox');
            completeObjective('receiveBadge');
            addInventoryItem('aspirantCard');
            archiveItem('aspirantCard');
            teleportPlayer(0, 0, 0);
            syncMuebleDrawerTransform({ syncState: true });
            rebuildSpatialGrid(collidables);
            updateDiaryContent();
        }
    },
    {
        id: 'm2_prep',
        name: 'Misión 2 (Paso 1): Buscar al Señor Alto',
        description: 'Misión 1 completada con Carnet oficial. Listo para cruzar el puente y hablar con Señor Alto.',
        apply() {
            resetBaseStateForPreset();
            gameState.flags.metPanda = true;
            gameState.flags.metMonty = true;
            gameState.flags.hasFurnitureKey = true;
            gameState.flags.openedMueble = true;
            gameState.flags.drawerOpened = true;
            gameState.flags.deliveredBox = true;
            gameState.flags.receivedAspirantCard = true;
            gameState.quests.mission_001 = 'completed';
            gameState.quests.mission_002 = 'active';
            startMissionFromData(mission002);
            addInventoryItem('aspirantCard');
            archiveItem('aspirantCard');
            const alto = getEntityTransform('npcs', 'Alto', { x: -24, z: 10 });
            teleportPlayer(alto.x + 2.2, 0, alto.z - 2.2);
            syncMuebleDrawerTransform({ syncState: true });
            rebuildSpatialGrid(collidables);
            updateDiaryContent();
            saveGame();
        }
    },
    {
        id: 'm2_search_chips',
        name: 'Misión 2 (Paso 2): Detector recibido (0/7 microchips)',
        description: 'Alto ha escaneado el carnet y entregado el Detector de metales (sin equipar).',
        apply() {
            resetBaseStateForPreset();
            gameState.flags.metPanda = true;
            gameState.flags.metMonty = true;
            gameState.flags.hasFurnitureKey = true;
            gameState.flags.openedMueble = true;
            gameState.flags.drawerOpened = true;
            gameState.flags.deliveredBox = true;
            gameState.flags.receivedAspirantCard = true;
            gameState.flags.altoScannedCard = true;
            gameState.flags.collectedMicrochips = [];
            gameState.quests.mission_001 = 'completed';
            gameState.quests.mission_002 = 'active';
            startMissionFromData(mission002);
            completeObjective('showCardToAlto');
            addInventoryItem('aspirantCard');
            archiveItem('aspirantCard');
            addInventoryItem('metalDetector');
            syncMicrochipsFromGameState();
            const alto = getEntityTransform('npcs', 'Alto', { x: -24, z: 10 });
            teleportPlayer(alto.x + 2.2, 0, alto.z - 2.2);
            syncMuebleDrawerTransform({ syncState: true });
            rebuildSpatialGrid(collidables);
            updateDiaryContent();
            saveGame();
        }
    },
    {
        id: 'm2_chips_ready',
        name: 'Misión 2 (Paso 3): 7/7 Microchips listos para entregar',
        description: 'Tienes los 7 microchips apilados en el Inventario. Habla con Señor Alto para completar la Misión 2.',
        apply() {
            resetBaseStateForPreset();
            gameState.flags.metPanda = true;
            gameState.flags.metMonty = true;
            gameState.flags.hasFurnitureKey = true;
            gameState.flags.openedMueble = true;
            gameState.flags.drawerOpened = true;
            gameState.flags.deliveredBox = true;
            gameState.flags.receivedAspirantCard = true;
            gameState.flags.altoScannedCard = true;
            gameState.flags.collectedMicrochips = MICROCHIP_SPAWN_POINTS.map(p => p.id);
            gameState.quests.mission_001 = 'completed';
            gameState.quests.mission_002 = 'active';
            startMissionFromData(mission002);
            completeObjective('showCardToAlto');
            addInventoryItem('aspirantCard');
            archiveItem('aspirantCard');
            addInventoryItem('metalDetector');
            addInventoryItem('microchip', 7);
            syncMicrochipsFromGameState();
            const alto = getEntityTransform('npcs', 'Alto', { x: -24, z: 10 });
            teleportPlayer(alto.x + 2.2, 0, alto.z - 2.2);
            syncMuebleDrawerTransform({ syncState: true });
            rebuildSpatialGrid(collidables);
            updateDiaryContent();
            saveGame();
        }
    },
    {
        id: 'm2_completed',
        name: 'Misión 2 (Finalizada): Batería y Guías PDF',
        description: 'Misión 2 completada: Sistema de Control de Tiempo activo y 2 documentos PDF en el Registro.',
        apply() {
            resetBaseStateForPreset();
            gameState.flags.metPanda = true;
            gameState.flags.metMonty = true;
            gameState.flags.hasFurnitureKey = true;
            gameState.flags.openedMueble = true;
            gameState.flags.drawerOpened = true;
            gameState.flags.deliveredBox = true;
            gameState.flags.receivedAspirantCard = true;
            gameState.flags.altoScannedCard = true;
            gameState.flags.collectedMicrochips = MICROCHIP_SPAWN_POINTS.map(p => p.id);
            gameState.flags.deliveredMicrochips = true;
            gameState.quests.mission_001 = 'completed';
            gameState.quests.mission_002 = 'completed';
            startMissionFromData(mission002);
            completeObjective('showCardToAlto');
            completeObjective('findMicrochips');
            completeObjective('deliverMicrochipsToAlto');
            completeActiveMission();
            addInventoryItem('aspirantCard');
            archiveItem('aspirantCard');
            addInventoryItem('metalDetector');
            addInventoryItem('visualHygieneDoc');
            addInventoryItem('timeControlDoc');
            syncMicrochipsFromGameState();
            unlockBatterySystem(true);
            const alto = getEntityTransform('npcs', 'Alto', { x: -24, z: 10 });
            teleportPlayer(alto.x + 2.2, 0, alto.z - 2.2);
            syncMuebleDrawerTransform({ syncState: true });
            rebuildSpatialGrid(collidables);
            updateDiaryContent();
            saveGame();
        }
    }
];

function clearInventoryAll() {
    const items = getInventoryItems();
    items.forEach(it => {
        removeInventoryItem(it.id);
    });
}

function teleportPlayer(x, y, z) {
    const groundY = getHeightAt(x, z);
    const targetY = (typeof y === 'number' && y !== 0) ? y : groundY;
    gameState.player.x = x;
    gameState.player.y = targetY + (runtimeState.playerHeightOffset || 0);
    gameState.player.z = z;
    if (runtimeState.player) {
        runtimeState.player.position.set(x, targetY + (runtimeState.playerHeightOffset || 0), z);
    }
}
