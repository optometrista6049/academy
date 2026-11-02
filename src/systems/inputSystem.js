import { runtimeState } from '../state/runtimeState.js';
import { tryInteraction } from '../interaction/interactionManager.js';
import { isInputLocked } from './inputLockSystem.js';

function isTypingInField(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toUpperCase() : '';
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target.isContentEditable);
}

export function setupInput(){

    addEventListener('keydown',(e)=>{

        if (isTypingInField(e.target)) return;
        if (runtimeState.isGodMode || isInputLocked()) return;

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

        if (isTypingInField(e.target)) return;
        if (runtimeState.isGodMode || isInputLocked()) {
            runtimeState.keys.w = false;
            runtimeState.keys.a = false;
            runtimeState.keys.s = false;
            runtimeState.keys.d = false;
            return;
        }

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