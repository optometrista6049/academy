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
    getInventoryItems
} from '../ui/registry/modules/inventoryModuleV2.js';
import {
    archiveItem,
    getArchivedItems
} from '../ui/registry/modules/archiveModule.js';
import { updateDiaryContent } from '../ui/registry/modules/diaryModule.js';
import {
    completeObjective,
    startMissionFromData
} from '../systems/missionManager.js';
import { mission001 } from '../systems/missions/missionData.js';

export const MISSION_PRESETS = [
    {
        id: 'clean_start',
        name: 'Estado 0: Inicio Limpio',
        description: 'Partida virgen. Sin misiones activas ni hablar con Monty.',
        apply() {
            clearInventoryAll();
            gameState.flags.metPanda = false;
            gameState.flags.hasFurnitureKey = false;
            gameState.flags.openedMueble = false;
            gameState.flags.deliveredBox = false;
            gameState.flags.receivedAspirantCard = false;
            gameState.flags.registryUnlocked = true;
            gameState.quests = {};
            teleportPlayer(0, 0, 0);
            updateDiaryContent();
        }
    },
    {
        id: 'm1_key_acquired',
        name: 'Misión 1 (Paso 1): Llave recibida',
        description: 'Monty te ha dado la llave del mueble. Listo para abrir la cómoda.',
        apply() {
            clearInventoryAll();
            gameState.flags.metPanda = true;
            gameState.flags.hasFurnitureKey = true;
            gameState.flags.openedMueble = false;
            gameState.flags.deliveredBox = false;
            gameState.flags.receivedAspirantCard = false;
            gameState.flags.registryUnlocked = true;
            gameState.quests.mission_001 = 'active';
            startMissionFromData(mission001);
            addInventoryItem('furnitureKey');
            // Teletransportar cerca del mueble
            teleportPlayer(-4, 0, 4);
            updateDiaryContent();
        }
    },
    {
        id: 'm1_box_acquired',
        name: 'Misión 1 (Paso 2): Caja de cartón en inventario',
        description: 'Caja recuperada del mueble. Listo para hablar con Monty y entregarla.',
        apply() {
            clearInventoryAll();
            gameState.flags.metPanda = true;
            gameState.flags.hasFurnitureKey = true;
            gameState.flags.openedMueble = true;
            gameState.flags.deliveredBox = false;
            gameState.flags.receivedAspirantCard = false;
            gameState.flags.registryUnlocked = true;
            gameState.quests.mission_001 = 'active';
            startMissionFromData(mission001);
            completeObjective('findBadgeBox');
            addInventoryItem('badgeBox');
            // Teletransportar frente a Monty
            teleportPlayer(1.5, 0, 1.5);
            updateDiaryContent();
        }
    },
    {
        id: 'm1_completed',
        name: 'Misión 1 (Finalizada): Carnet de Aspirante Oficial',
        description: 'Caja entregada. Carnet en Inventario y Archivado en Registro.',
        apply() {
            clearInventoryAll();
            gameState.flags.metPanda = true;
            gameState.flags.hasFurnitureKey = true;
            gameState.flags.openedMueble = true;
            gameState.flags.deliveredBox = true;
            gameState.flags.receivedAspirantCard = true;
            gameState.flags.registryUnlocked = true;
            gameState.quests.mission_001 = 'completed';
            startMissionFromData(mission001);
            completeObjective('findBadgeBox');
            completeObjective('deliverBadgeBox');
            completeObjective('receiveBadge');
            addInventoryItem('aspirantCard');
            archiveItem('aspirantCard');
            teleportPlayer(0, 0, 0);
            updateDiaryContent();
        }
    },
    {
        id: 'm2_prep',
        name: 'Misión 2: Inicio (Preparado para siguientes personajes)',
        description: 'Misión 1 completada con acreditación oficial. Listo para interactuar con Alto, Telerín y Telerón.',
        apply() {
            clearInventoryAll();
            gameState.flags.metPanda = true;
            gameState.flags.hasFurnitureKey = true;
            gameState.flags.openedMueble = true;
            gameState.flags.deliveredBox = true;
            gameState.flags.receivedAspirantCard = true;
            gameState.flags.registryUnlocked = true;
            gameState.quests.mission_001 = 'completed';
            gameState.quests.mission_002 = 'active';
            addInventoryItem('aspirantCard');
            archiveItem('aspirantCard');
            teleportPlayer(-2, 0, 2);
            updateDiaryContent();
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
    gameState.player.x = x;
    gameState.player.y = y;
    gameState.player.z = z;
    if (runtimeState.player) {
        runtimeState.player.position.set(x, y + (runtimeState.playerHeightOffset || 0), z);
    }
}
