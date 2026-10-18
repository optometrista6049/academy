import { runtimeState }
from '../state/runtimeState.js';

import { gameState }
from '../state/gameState.js';

import { isInputLocked }
from '../systems/inputLockSystem.js';

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

import { dialogueState }
from '../dialogue/dialogueState.js';

import { dismissPandaReminder }
from '../ui/pandaReminder.js';

import {
    pandaIntroDialogue,
    montyWaitingDialogue,
    montyTurnInDialogue
} from '../dialogue/dialogues/pandaIntro.js';

import { getNextNeutralDialogue }
from '../dialogue/neutralDialogues.js';

import {
    hasInventoryItem,
    addInventoryItem,
    removeInventoryItem
} from '../ui/registry/modules/inventoryModuleV2.js';

import { archiveItem } from '../ui/registry/modules/archiveModule.js';
import { showItemObtainedBanner } from '../ui/itemObtainedNotification.js';

import {
    startMissionFromData,
    isMissionActive,
    isObjectiveCompleted,
    completeObjective
} from '../systems/missionManager.js';

import {
    playMuebleOpeningCinematic,
    isMuebleCinematicActive
} from '../cinematics/muebleCinematic.js';

import { updateDiaryContent }
from '../ui/registry/modules/diaryModule.js';

import { mission001 }
from '../systems/missions/missionData.js';


// =====================================
// ALTO (Analítico y Curioso)
// =====================================

const altoBusyDialogue = {

    speaker:'Señor Alto',
	
	portrait:
        './assets/ui/portraits/alto.png',

    pages:[

        'Bienvenido a Monteserín Academy.',

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

    if(panda){

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

    if(alto){

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

    if(telerin){

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

    if(teleron){

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

    if(mueble){

        const distance =

            player.position.distanceTo(

                mueble.position

            );

        if(distance < 2.8){

            interactionTarget =
                'mueble';

            showInteraction(
                'Examinar',
                'object'
            );

            return;

        }

    }

    hideInteraction();

}


// =====================================
// INTERACTION
// =====================================

export function tryInteraction(){
	
	if(

    dialogueState.active

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

            if (!gameState.flags.metPanda) {

                // Callback cuando el jugador completa la presentacion y encargo de Monty
                pandaIntroDialogue.onComplete = () => {
                    gameState.flags.metPanda = true;
                    gameState.flags.metMonty = true;
                    gameState.quests.mission_001 = 'active';
                    startMissionFromData(mission001);
                    setPandaIdle();
                    updateDiaryContent();
                };

                startDialogue(
                    pandaIntroDialogue
                );

            } else {

                // Si el jugador ya recogió la caja de cartón, entregar a Monty
                if (hasInventoryItem('badgeBox')) {

                    // Procesar transferencia de inmediato: caja retirada, carnet entregado y archivado
                    removeInventoryItem('badgeBox');
                    addInventoryItem('aspirantCard');
                    archiveItem('aspirantCard');
                    completeObjective('deliverBadgeBox');
                    completeObjective('receiveBadge');
                    gameState.flags.deliveredBox = true;
                    gameState.flags.receivedAspirantCard = true;
                    gameState.quests.mission_001 = 'completed';
                    updateDiaryContent();

                    // Disparar efecto audiovisual (Opción A: Banner flotante + Chime armónico)
                    // coordinado con la aparición del texto de Monty presentando el Carnet
                    setTimeout(() => {
                        showItemObtainedBanner({
                            title: '¡Acreditación Obtenida!',
                            itemName: 'Carnet de Aspirante',
                            subtitle: 'Añadido al Inventario y Archivado en Registro',
                            thumbnail: 'assets/ui/ASPIRANTE.jpg'
                        });
                    }, 1300);

                    montyTurnInDialogue.onComplete = () => {
                        updateDiaryContent();
                    };

                    startDialogue(montyTurnInDialogue);

                } else if (!gameState.flags.deliveredBox) {

                    startDialogue(montyWaitingDialogue);

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

    }

}


// =====================================
// HELPERS
// =====================================

export function hasInteractionTarget(){

    return interactionTarget !== null;

}