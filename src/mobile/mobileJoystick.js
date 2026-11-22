import { runtimeState } from '../state/runtimeState.js';
import { isMobile } from './mobileDetection.js';
import { isInputLocked } from '../systems/inputLockSystem.js';

const joystick = {

    active:false,

    x:0,
    y:0,

    touchId:null

};

export { isMobile };

export function resetJoystickState(){
    joystick.active = false;
    joystick.touchId = null;
    joystick.x = 0;
    joystick.y = 0;
}

export function initMobileJoystick(){

    if(!isMobile()) return;

    const size = Math.min(

        window.innerWidth * 0.14,
        75

    );

    const stick = document.createElement('div');

    stick.id = 'mobileJoystick';

    stick.style.position = 'fixed';

    stick.style.left = '20px';

    stick.style.bottom = '20px';

    stick.style.width = `${size}px`;

    stick.style.height = `${size}px`;

    stick.style.borderRadius = '50%';

    stick.style.background =
        'rgba(255,255,255,0.07)';

    stick.style.border =
        '2px solid rgba(255,255,255,0.16)';

    stick.style.backdropFilter =
        'blur(4px)';

    stick.style.zIndex = '9999';

    stick.style.touchAction = 'none';

    document.body.appendChild(stick);

    let centerX = 0;
    let centerY = 0;

    // =====================================================
    // TOUCH START
    // =====================================================

    stick.addEventListener('touchstart',(e)=>{
        if(runtimeState.isGodMode || isInputLocked()) return;

        const touch = e.changedTouches[0];

        joystick.active = true;

        joystick.touchId =
            touch.identifier;

        const rect =
            stick.getBoundingClientRect();

        centerX =
            rect.left + rect.width/2;

        centerY =
            rect.top + rect.height/2;

    },{ passive:true });

    // =====================================================
    // TOUCH MOVE
    // =====================================================

    stick.addEventListener('touchmove',(e)=>{

        if(!joystick.active) return;
        if(runtimeState.isGodMode || isInputLocked()){
            resetJoystickState();
            return;
        }

        let touchFound = null;

        for(const touch of e.touches){

            if(
                touch.identifier ===
                joystick.touchId
            ){

                touchFound = touch;

            }

        }

        if(!touchFound) return;

        const radius = size * 0.35;

        const dx =
            (touchFound.clientX - centerX)
            / radius;

        const dy =
            (touchFound.clientY - centerY)
            / radius;

        joystick.x =
            Math.max(-1,Math.min(1,dx));

        joystick.y =
            Math.max(-1,Math.min(1,-dy));

    },{ passive:true });

    // =====================================================
    // TOUCH END / CANCEL / BLUR
    // =====================================================

    stick.addEventListener('touchend', resetJoystickState, { passive:true });
    stick.addEventListener('touchcancel', resetJoystickState, { passive:true });
    window.addEventListener('blur', resetJoystickState, { passive:true });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) resetJoystickState();
    });

}

export function getJoystickInput(){
    if(runtimeState.isGodMode || isInputLocked()){
        if(joystick.active || joystick.x !== 0 || joystick.y !== 0){
            resetJoystickState();
        }
    }
    return joystick;
}