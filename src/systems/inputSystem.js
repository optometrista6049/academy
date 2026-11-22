import { runtimeState } from '../state/runtimeState.js';
import { tryInteraction } from '../interaction/interactionManager.js';
import { isInputLocked, resetMovementKeys } from './inputLockSystem.js';

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
            case 'ArrowUp':
                runtimeState.keys.w = true;
                break;

            case 'KeyA':
            case 'ArrowLeft':
                runtimeState.keys.a = true;
                break;

            case 'KeyS':
            case 'ArrowDown':
                runtimeState.keys.s = true;
                break;

            case 'KeyD':
            case 'ArrowRight':
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
            resetMovementKeys();
            return;
        }

        switch(e.code){

            case 'KeyW':
            case 'ArrowUp':
                runtimeState.keys.w = false;
                break;

            case 'KeyA':
            case 'ArrowLeft':
                runtimeState.keys.a = false;
                break;

            case 'KeyS':
            case 'ArrowDown':
                runtimeState.keys.s = false;
                break;

            case 'KeyD':
            case 'ArrowRight':
                runtimeState.keys.d = false;
                break;

        }

    });

    addEventListener('blur', resetMovementKeys);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) resetMovementKeys();
    });

}