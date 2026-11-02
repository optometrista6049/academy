import { runtimeState }
from '../state/runtimeState.js';


import {

    tryInteraction

}
from '../interaction/interactionManager.js';

export function setupInput(){

    addEventListener('keydown',(e)=>{

        switch(e.code){

            case 'KeyW':
                runtimeState.keys.w = true;
                break;

            case 'KeyA':
                runtimeState.keys.a = true;
                break;

            case 'KeyS':
                runtimeState.keys.s = true;
                break;

            case 'KeyD':
                runtimeState.keys.d = true;
                break;
				
			case 'KeyE':

                 tryInteraction();

                 break;	

        }

    });

    addEventListener('keyup',(e)=>{

        switch(e.code){

            case 'KeyW':
                runtimeState.keys.w = false;
                break;

            case 'KeyA':
                runtimeState.keys.a = false;
                break;

            case 'KeyS':
                runtimeState.keys.s = false;
                break;

            case 'KeyD':
                runtimeState.keys.d = false;
                break;

        }

    });

}