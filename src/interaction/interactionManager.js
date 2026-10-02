import { runtimeState }
from '../state/runtimeState.js';

import { gameState }
from '../state/gameState.js';

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
    montyWaitingDialogue
} from '../dialogue/dialogues/pandaIntro.js';

import { getNextNeutralDialogue }
from '../dialogue/neutralDialogues.js';

import {
    startMissionFromData,
    isMissionActive,
    isObjectiveCompleted
} from '../systems/missionManager.js';

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

    dialogueState.active

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
                gameState.flags.metPanda ? 'Hablar con Monty' : 'Hablar'
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
                'Hablar con Señor Alto'
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
                'Hablar con Telerín'
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
                'Hablar con Telerón'
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
                'Examinar'
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
                };

                startDialogue(
                    pandaIntroDialogue
                );

            } else {

                // Si la mision 1 esta activa y aun no se ha entregado la caja, dar recordatorio
                if (isMissionActive('mission001') && !isObjectiveCompleted('deliverBadgeBox')) {
                    startDialogue(montyWaitingDialogue);
                } else {
                    const next = getNextNeutralDialogue('panda');
                    if (next) {
                        startDialogue(next);
                    } else {
                        startDialogue(montyWaitingDialogue);
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

            startDialogue({

                speaker: 'Mueble',

                portrait: null,

                pages: [

                    'Una cómoda de madera noble con vetas naturales y varios cajones.',

                    'Por ahora los cajones están cerrados.'

                ]

            });

            break;

    }

}


// =====================================
// HELPERS
// =====================================

export function hasInteractionTarget(){

    return interactionTarget !== null;

}