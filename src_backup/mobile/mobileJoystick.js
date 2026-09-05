import { runtimeState }
from '../state/runtimeState.js';

const joystick = {

    active:false,

    x:0,
    y:0,

    touchId:null

};

export function isMobile(){

    return /Android|iPhone|iPad|iPod/i
        .test(navigator.userAgent);

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
    // TOUCH END
    // =====================================================

    stick.addEventListener('touchend',(e)=>{

        joystick.active = false;

        joystick.touchId = null;

        joystick.x = 0;
        joystick.y = 0;

    },{ passive:true });

}

export function getJoystickInput(){

    return joystick;

}