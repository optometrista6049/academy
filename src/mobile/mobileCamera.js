import { runtimeState }
from '../state/runtimeState.js';

let lastX = 0;
let lastY = 0;

export function setupMobileCamera(){

    addEventListener(
        "touchstart",
        e=>{

            if(e.touches.length !== 1)
                return;

            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;

        },
        { passive:false }
    );

    addEventListener(
        "touchmove",
        e=>{

            if(e.touches.length !== 1)
                return;

            const touch = e.touches[0];

            const dx =
                touch.clientX - lastX;

            const dy =
                touch.clientY - lastY;

            lastX = touch.clientX;
            lastY = touch.clientY;

            const cam =
                runtimeState.cameraState;

            cam.ax -= dx * 0.005;

            cam.ay -= dy * 0.005;

            cam.ay = Math.max(
                -0.8,
                Math.min(1.2, cam.ay)
            );

        },
        { passive:false }
    );

}