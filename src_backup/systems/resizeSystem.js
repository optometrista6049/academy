import { camera }
from '../core/camera.js';

import { renderer }
from '../core/renderer.js';

import {

    isMobile

} from '../mobile/mobileDetection.js';

// ======================================================
// APPLY RESOLUTION
// ======================================================

function applyResolution(){

    const width = window.innerWidth;

    const height = window.innerHeight;

    // =========================
    // CAMERA
    // =========================

    camera.aspect = width / height;

    camera.updateProjectionMatrix();

    // =========================
    // RENDERER
    // =========================

    renderer.setSize(width,height);

    // =========================
    // MOBILE PERFORMANCE
    // =========================

    if(isMobile()){

        renderer.setPixelRatio(

            Math.min(window.devicePixelRatio,1.5)

        );

    }else{

        renderer.setPixelRatio(

            Math.min(window.devicePixelRatio,2)

        );

    }

}

// ======================================================
// EVENTS
// ======================================================

window.addEventListener(

    'resize',
    applyResolution

);

// móvil rotación
window.addEventListener(

    'orientationchange',
    ()=>{

        setTimeout(applyResolution,200);

    }

);

// ======================================================
// INIT
// ======================================================

applyResolution();