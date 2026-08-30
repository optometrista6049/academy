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

let interactionTarget = null;

import { dialogueState }
from '../dialogue/dialogueState.js';

// =====================================
// PANDA
// =====================================

const pandaIntroDialogue = {

    speaker:'Panda',
	
	 portrait:
        './assets/ui/portraits/panda.png',

    pages:[

        'Hola. Bienvenido a Monteserin Academy.',

        'Me alegra mucho verte por aquí.',

        'Pronto necesitaré tu ayuda para una pequeña tarea.'

    ]

};


// =====================================
// ALTO
// =====================================

const altoBusyDialogue = {

    speaker:'Senor Alto',
	
	portrait:
        './assets/ui/portraits/alto.png',


    pages:[

        'Bienvenido a Monteserin Academy.',

        'Ahora mismo estoy organizando algunas cosas.',

        'Creo que Panda queria hablar contigo.'

    ]

};


// =====================================
// TELERIN
// =====================================

const telerinBusyDialogue = {

    speaker:'Telerin',
	
	 portrait:
        './assets/ui/portraits/telerin.png',

    pages:[

       'Hola.',

        'Creo que Panda te puede ayudar mejor que yo ahora.',

        'Habla primero con Panda.'

    ]

};


// =====================================
// TELERON
// =====================================

const teleronBusyDialogue = {

    speaker:'Teleron',
	
	portrait:
        './assets/ui/portraits/teleron.png',


    pages:[

        'Buenas.',

        'Panda te esta buscando.',

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
                'Hablar'
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
                'Hablar'
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
                'Hablar'
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
                'Hablar'
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

            startDialogue(

                pandaIntroDialogue

            );

            gameState.flags.metPanda =
                true;

            setPandaIdle();

            break;


        case 'alto':

            if(

                !gameState.flags.metPanda

            ){

                startDialogue(

                    altoBusyDialogue

                );

            }

            break;


        case 'telerin':

            if(

                !gameState.flags.metPanda

            ){

                startDialogue(

                    telerinBusyDialogue

                );

            }

            break;


        case 'teleron':

            if(

                !gameState.flags.metPanda

            ){

                startDialogue(

                    teleronBusyDialogue

                );

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