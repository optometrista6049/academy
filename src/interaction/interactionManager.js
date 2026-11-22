import { runtimeState }
from '../state/runtimeState.js';

import { gameState }
from '../state/gameState.js';

import { isInputLocked }
from '../systems/inputLockSystem.js';

import { saveGame, saveMissionCheckpoint }
from '../systems/saveSystem.js';

import { getHeightAt }
from '../terrain/terrainHeight.js';

import {

    showInteraction,
    hideInteraction

}
from './interactionUI.js';

import {

    startDialogue

}
from '../dialogue/dialogueManager.js';

import {

    getPandaNPC,
    setPandaIdle

}
from '../entities/npc/pandaNPC.js';

import {

    getAltoNPC

}
from '../entities/npc/altoNPC.js';

import {

    getTelerinNPC

}
from '../entities/npc/telerinNPC.js';

import {

    getTeleronNPC

}
from '../entities/npc/teleronNPC.js';

import {

    getMuebleObject

}
from '../entities/objects/muebleObject.js';

let interactionTarget = null;
let itemBannerTimer = null;

import { dialogueState }
from '../dialogue/dialogueState.js';

import { dismissPandaReminder }
from '../ui/pandaReminder.js';

import {
    pandaIntroDialogue,
    montyWaitingDialogue,
    montyTurnInDialogue,
    montyMission2WaitingDialogue
} from '../dialogue/dialogues/pandaIntro.js';

import {
    altoMission2IntroDialogue,
    altoMission2WaitingDialogue,
    altoMission2TurnInDialogue
} from '../dialogue/dialogues/altoMission2.js';

import { getNextNeutralDialogue }
from '../dialogue/neutralDialogues.js';

import {
    hasInventoryItem,
    getInventoryItemCount,
    addInventoryItem,
    removeInventoryItem
} from '../ui/registry/modules/inventoryModuleV2.js';

import { archiveItem } from '../ui/registry/modules/archiveModule.js';
import { showItemObtainedBanner } from '../ui/itemObtainedNotification.js';
import { unlockBatterySystem } from '../systems/sessionBatterySystem.js';

import {
    startMissionFromData,
    isMissionActive,
    isObjectiveCompleted,
    completeObjective,
    completeActiveMission
} from '../systems/missionManager.js';

import {
    playMuebleOpeningCinematic,
    isMuebleCinematicActive
} from '../cinematics/muebleCinematic.js';

import { updateDiaryContent }
from '../ui/registry/modules/diaryModule.js';

import { mission001, mission002 }
from '../systems/missions/missionData.js';

import {
    getNearbyMicrochipTarget,
    collectActiveMicrochip
} from '../systems/microchipHuntSystem.js';


// =====================================
// ALTO (Analítico y Curioso)
// =====================================

const altoBusyDialogue = {

    speaker:'Señor Alto',
	
	portrait:
        './assets/ui/portraits/alto.png',

    pages:[

        'Te doy la bienvenida a Monteserín Academy.',

        'Ahora mismo estoy analizando algunos datos y sistemas del entorno.',

        'Creo que Panda quería hablar contigo.'

    ]

};


// =====================================
// TELERIN (Ordenada y Organizada)
// =====================================

const telerinBusyDialogue = {

    speaker:'Telerín',
	
	 portrait:
        './assets/ui/portraits/telerin.png',

    pages:[

       'Hola.',

        'Ahora mismo estoy organizando algunas cosas por aquí.',

        'Habla primero con Panda, seguro que te puede orientar mejor.'

    ]

};


// =====================================
// TELERON
// =====================================

const teleronBusyDialogue = {

    speaker:'Telerón',
	
	portrait:
        './assets/ui/portraits/teleron.png',

    pages:[

        'Buenas.',

        'Panda te está buscando.',

        'Seguro que tiene algo importante que contarte.'

    ]

};


// =====================================
// UPDATE
// =====================================

export function updateInteractionSystem(){
	
	if(
        dialogueState.active ||
        isMuebleCinematicActive() ||
        isInputLocked()
    ){

        hideInteraction();

        return;

    }

    const player =
        runtimeState.player;

    if(!player){

        hideInteraction();

        return;

    }

    interactionTarget = null;

    const panda =
        getPandaNPC();

    const alto =
        getAltoNPC();

    const telerin =
        getTelerinNPC();

    const teleron =
        getTeleronNPC();


    // ==========================
    // PANDA
    // ==========================

    if(panda && !panda.userData?.hiddenByLayout){

        const distance =

            player.position.distanceTo(

                panda.position

            );

        if(distance < 3){

            interactionTarget =
                'panda';

            showInteraction(
                gameState.flags.metPanda ? 'Hablar con Monty' : 'Hablar',
                'talk'
            );

            return;

        }

    }


    // ==========================
    // ALTO
    // ==========================

    if(alto && !alto.userData?.hiddenByLayout){

        const distance =

            player.position.distanceTo(

                alto.position

            );

        if(distance < 3){

            interactionTarget =
                'alto';

            showInteraction(
                'Hablar con Señor Alto',
                'talk'
            );

            return;

        }

    }


    // ==========================
    // TELERIN
    // ==========================

    if(telerin && !telerin.userData?.hiddenByLayout){

        const distance =

            player.position.distanceTo(

                telerin.position

            );

        if(distance < 3){

            interactionTarget =
                'telerin';

            showInteraction(
                'Hablar con Telerín',
                'talk'
            );

            return;

        }

    }


    // ==========================
    // TELERON
    // ==========================

    if(teleron && !teleron.userData?.hiddenByLayout){

        const distance =

            player.position.distanceTo(

                teleron.position

            );

        if(distance < 3){

            interactionTarget =
                'teleron';

            showInteraction(
                'Hablar con Telerón',
                'talk'
            );

            return;

        }

    }


    // ==========================
    // MUEBLE
    // ==========================

    const mueble = getMuebleObject();

    if(mueble && !mueble.userData?.hiddenByLayout){

        const distance =

            player.position.distanceTo(

                mueble.position

            );

        const muebleScale = mueble.userData?.logicalScale;
        const maxEdge = Math.max(1.0, muebleScale?.x || 1.0, muebleScale?.z || 1.0);
        const interactRange = 2.0 + 0.8 * maxEdge;

        if(distance < interactRange){

            interactionTarget =
                'mueble';

            showInteraction(
                'Examinar',
                'object'
            );

            return;

        }

    }

    // ==========================
    // MICROCHIP (DETECTOR EQUIPADO)
    // ==========================

    const nearbyChip = getNearbyMicrochipTarget();

    if(nearbyChip){

        interactionTarget =
            'microchip';

        showInteraction(
            'Recoger microchip',
            'pickup'
        );

        return;

    }

    hideInteraction();

}


// =====================================
// INTERACTION
// =====================================

export function tryInteraction(){
	
	if(

    dialogueState.active ||
    isMuebleCinematicActive() ||
    isInputLocked()

){

    return;

}

    if(!interactionTarget){

        return;

    }

    switch(interactionTarget){

        case 'panda':

            gameState.flags.talkedToPanda = true;
            dismissPandaReminder();
            setPandaIdle();

            if (!gameState.flags.metPanda) {

                // Callback cuando el jugador completa la presentacion y encargo de Monty
                const introPayload = {
                    ...pandaIntroDialogue,
                    onComplete: () => {
                        if (typeof pandaIntroDialogue.onComplete === 'function') {
                            pandaIntroDialogue.onComplete();
                        }
                        gameState.flags.metPanda = true;
                        gameState.flags.metMonty = true;
                        gameState.quests.mission_001 = 'active';
                        startMissionFromData(mission001);
                        setPandaIdle();
                        updateDiaryContent();
                        saveGame();
                    }
                };

                startDialogue(introPayload);

            } else {

                // Si el jugador ya recogió la caja de cartón, entregar a Monty
                if (hasInventoryItem('badgeBox')) {

                    // Procesar transferencia de inmediato: caja retirada, carnet entregado y archivado
                    removeInventoryItem('badgeBox');
                    addInventoryItem('aspirantCard');
                    archiveItem('aspirantCard');
                    completeObjective('deliverBadgeBox');
                    completeObjective('receiveBadge');
                    completeActiveMission();
                    gameState.flags.deliveredBox = true;
                    gameState.flags.receivedAspirantCard = true;
                    gameState.quests.mission_001 = 'completed';
                    gameState.quests.mission_002 = 'active';
                    startMissionFromData(mission002);
                    updateDiaryContent();
                    saveMissionCheckpoint('mission_001_complete', {
                        name: 'Misión 1: Carnet de Aspirante',
                        safeLocation: {
                            x: 0,
                            y: getHeightAt(0, 4) + (runtimeState.playerHeightOffset || 0),
                            z: 4
                        }
                    });
                    saveGame();

                    // Disparar efecto audiovisual (Opción A: Banner flotante + Chime armónico)
                    // coordinado con la aparición del texto de Monty presentando el Carnet
                    if (itemBannerTimer) {
                        clearTimeout(itemBannerTimer);
                        itemBannerTimer = null;
                    }
                    itemBannerTimer = setTimeout(() => {
                        itemBannerTimer = null;
                        if (!runtimeState.sessionStarted) return;
                        showItemObtainedBanner({
                            title: '¡Acreditación Obtenida!',
                            itemName: 'Carnet de Aspirante',
                            subtitle: 'Añadido al Inventario y Archivado en Registro',
                            thumbnail: 'assets/ui/ASPIRANTE.jpg'
                        });
                    }, 1300);

                    const turnInPayload = {
                        ...montyTurnInDialogue,
                        onComplete: () => {
                            if (typeof montyTurnInDialogue.onComplete === 'function') {
                                montyTurnInDialogue.onComplete();
                            }
                            updateDiaryContent();
                        }
                    };

                    startDialogue(turnInPayload);

                } else if (!gameState.flags.deliveredBox) {

                    startDialogue(montyWaitingDialogue);

                } else if (gameState.quests?.mission_002 === 'active' && !gameState.flags?.altoScannedCard) {

                    startDialogue(montyMission2WaitingDialogue);

                } else {

                    const next = getNextNeutralDialogue('panda');
                    if (next) {
                        startDialogue(next);
                    } else {
                        startDialogue(montyTurnInDialogue);
                    }

                }

            }

            break;


        case 'alto':

            if (!gameState.flags.metPanda) {
                startDialogue(altoBusyDialogue);
            } else if (
                (gameState.quests?.mission_002 === 'active' || gameState.flags?.receivedAspirantCard) &&
                !gameState.flags?.altoScannedCard
            ) {
                let detectorGranted = false;
                const grantDetectorStep = () => {
                    if (detectorGranted) return;
                    detectorGranted = true;
                    if (gameState.quests?.mission_002 !== 'active' && gameState.quests?.mission_002 !== 'completed') {
                        gameState.quests.mission_002 = 'active';
                        startMissionFromData(mission002);
                    }
                    gameState.flags.altoScannedCard = true;
                    completeObjective('showCardToAlto');
                    const addedDetector = addInventoryItem('metalDetector');
                    updateDiaryContent();
                    saveGame();
                    if (addedDetector) {
                        showItemObtainedBanner({
                            title: '¡Herramienta Recibida!',
                            itemName: 'Detector de metales',
                            subtitle: 'Añadido al Inventario · Equípalo cuando lo necesites',
                            thumbnail: 'assets/registry/inventory/metalDetector.svg'
                        });
                    }
                };

                startDialogue({
                    ...altoMission2IntroDialogue,
                    onPageChange(pageIndex) {
                        if (pageIndex === 2) {
                            grantDetectorStep();
                        }
                    },
                    onComplete() {
                        grantDetectorStep();
                        updateDiaryContent();
                    }
                });
            } else if (gameState.flags?.altoScannedCard && !gameState.flags?.deliveredMicrochips) {
                const chipCount = getInventoryItemCount('microchip');
                if (chipCount < 7) {
                    startDialogue(altoMission2WaitingDialogue);
                } else {
                    removeInventoryItem('microchip');
                    addInventoryItem('visualHygieneDoc');
                    addInventoryItem('timeControlDoc');
                    unlockBatterySystem(true);
                    gameState.flags.deliveredMicrochips = true;
                    gameState.quests.mission_002 = 'completed';
                    completeObjective('findMicrochips');
                    completeObjective('deliverMicrochipsToAlto');
                    completeActiveMission();
                    updateDiaryContent();
                    saveMissionCheckpoint('mission_002_complete', {
                        name: 'Misión 2: El Registro de Entrada',
                        safeLocation: {
                            x: runtimeState.player ? runtimeState.player.position.x : gameState.player.x,
                            y: runtimeState.player ? runtimeState.player.position.y : gameState.player.y,
                            z: runtimeState.player ? runtimeState.player.position.z : gameState.player.z
                        }
                    });
                    saveGame();

                    let docsBannerShown = false;
                    startDialogue({
                        ...altoMission2TurnInDialogue,
                        onPageChange(pageIndex) {
                            if (pageIndex === 2 && !docsBannerShown) {
                                docsBannerShown = true;
                                showItemObtainedBanner({
                                    title: '¡Documentos Recibidos!',
                                    itemName: '2 Guías Oficiales (PDF)',
                                    subtitle: 'Disponibles en tu Registro para abrir o archivar',
                                    thumbnail: 'assets/registry/inventory/docTimeControl.svg'
                                });
                            }
                        },
                        onComplete() {
                            if (!docsBannerShown) {
                                docsBannerShown = true;
                                showItemObtainedBanner({
                                    title: '¡Registro Completado!',
                                    itemName: 'Control de Tiempo y Guías PDF',
                                    subtitle: 'Sistema activado y documentos en Registro',
                                    thumbnail: 'assets/registry/inventory/docTimeControl.svg'
                                });
                            }
                            updateDiaryContent();
                        }
                    });
                }
            } else {
                const next = getNextNeutralDialogue('alto');
                if (next) {
                    startDialogue(next);
                }
            }

            break;


        case 'telerin':

            if (!gameState.flags.metPanda) {
                startDialogue(telerinBusyDialogue);
            } else {
                const next = getNextNeutralDialogue('telerin');
                if (next) {
                    startDialogue(next);
                }
            }

            break;


        case 'teleron':

            if (!gameState.flags.metPanda) {
                startDialogue(teleronBusyDialogue);
            } else {
                const next = getNextNeutralDialogue('teleron');
                if (next) {
                    startDialogue(next);
                }
            }

            break;


        case 'mueble':

            if (gameState.flags.openedMueble || isObjectiveCompleted('findBadgeBox')) {

                startDialogue({

                    speaker: 'Mueble',

                    portrait: null,

                    pages: [

                        'El cajón de la cómoda ya está abierto y la cerradura desbloqueada.',

                        'Ya has recogido la caja de cartón de su interior.'

                    ]

                });

            } else if (hasInventoryItem('furnitureKey')) {

                hideInteraction();
                playMuebleOpeningCinematic();

            } else {

                startDialogue({

                    speaker: 'Mueble',

                    portrait: null,

                    pages: [

                        'Una cómoda de madera noble con vetas naturales y varios cajones.',

                        'Todos los cajones están firmemente cerrados con llave. Parece que necesitas la llave correspondiente para poder abrirlos.'

                    ]

                });

            }

            break;


        case 'microchip':

            collectActiveMicrochip();

            break;

    }

}


// =====================================
// HELPERS
// =====================================

export function hasInteractionTarget(){

    return interactionTarget !== null;

}