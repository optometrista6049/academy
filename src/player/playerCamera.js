import { camera }
from '../core/camera.js';

import { fixCameraCollision }
from './playerCameraCollision.js';

import {

    getHeightAt

} from '../terrain/terrainHeight.js';

import {

    runtimeState

} from '../state/runtimeState.js';

import {
    isInputLocked
} from '../systems/inputLockSystem.js';

// =====================================================
// CAMERA STATE
// =====================================================

const cam = runtimeState.camera;

// =====================================================
// DESKTOP CAMERA
// =====================================================

let drag = false;

addEventListener("mousedown",()=>{

    drag = true;

});

addEventListener("mouseup",()=>{

    drag = false;

});

addEventListener("mousemove",e=>{

    if(isInputLocked()) return;

    if(!drag) return;

    cam.ax -= e.movementX * 0.005;

    cam.ay -= e.movementY * 0.005;

    cam.ay = Math.max(

        -0.8,

        Math.min(1.2,cam.ay)

    );

});

// =====================================================
// MOBILE
// =====================================================

let lastTouchX = 0;
let lastTouchY = 0;

let pinchDistance = null;

// =====================================================
// TOUCH MOVE
// =====================================================

addEventListener("touchmove",(e)=>{
	
	if(isInputLocked()) return;

    // =====================================================
    // RIGHT SIDE TOUCHES
    // =====================================================

    const rightTouches = [];

    for(const touch of e.touches){

        if(
            touch.clientX >
            window.innerWidth * 0.28
        ){

            rightTouches.push(touch);

        }

    }

    // =====================================================
    // TWO FINGER ZOOM
    // =====================================================

    if(rightTouches.length === 2){

        const avgY =

            (
                rightTouches[0].clientY +
                rightTouches[1].clientY
            ) * 0.5;

        if(pinchDistance !== null){

            const delta =
                avgY - pinchDistance;

            const zoomSpeed =

                window.innerWidth < 700
                ? 0.08
                : 0.04;

            cam.targetDistance +=
                delta * zoomSpeed;

            cam.targetDistance = Math.max(

                cam.minZoom,

                Math.min(

                    cam.maxZoom,

                    cam.targetDistance

                )

            );

        }

        pinchDistance = avgY;

        return;

    }

    pinchDistance = null;

    // =====================================================
    // CAMERA DRAG
    // =====================================================

    let cameraTouch = null;

    for(const touch of e.touches){

        if(
            touch.clientX >
            window.innerWidth * 0.28
        ){

            cameraTouch = touch;

        }

    }

    if(cameraTouch){

        if(!lastTouchX){

            lastTouchX =
                cameraTouch.clientX;

            lastTouchY =
                cameraTouch.clientY;

        }

        const dx =
            cameraTouch.clientX - lastTouchX;

        const dy =
            cameraTouch.clientY - lastTouchY;

        cam.ax -= dx * 0.005;

        cam.ay -= dy * 0.005;

        cam.ay = Math.max(

            -0.8,

            Math.min(1.2,cam.ay)

        );

        lastTouchX =
            cameraTouch.clientX;

        lastTouchY =
            cameraTouch.clientY;

    }

},{ passive:true });

// =====================================================
// RESET TOUCH
// =====================================================

addEventListener("touchend",()=>{

    lastTouchX = 0;
    lastTouchY = 0;

    pinchDistance = null;

});

// =====================================================
// WHEEL ZOOM
// =====================================================

addEventListener("wheel", e => {
	
	if(isInputLocked()) return;

    cam.targetDistance +=
        e.deltaY * 0.01;

    cam.targetDistance = Math.max(

        cam.minZoom,

        Math.min(
            cam.maxZoom,
            cam.targetDistance
        )

    );

});

// =====================================================
// BLOCK CONTEXT MENU
// =====================================================

addEventListener("contextmenu", e => {

    e.preventDefault();

});

// =====================================================
// SMOOTH ZOOM
// =====================================================

function updateZoom(){

    cam.distance +=

        (
            cam.targetDistance -
            cam.distance
        ) * 0.08;

}

// =====================================================
// UPDATE CAMERA
// =====================================================

export function updateCamera(){

    if(!runtimeState.player) return;

    updateZoom();

    const p = runtimeState.player.position;

    const r = cam.distance;

    camera.position.x =

        p.x +

        r *

        Math.sin(cam.ax) *

        Math.cos(cam.ay);

    camera.position.z =

        p.z +

        r *

        Math.cos(cam.ax) *

        Math.cos(cam.ay);

    camera.position.y =

        p.y +

        r *

        Math.sin(cam.ay);

    // =====================================================
    // GROUND LIMIT
    // =====================================================

    const groundCam =

        getHeightAt(

            camera.position.x,
            camera.position.z

        ) + 2;

    if(camera.position.y < groundCam){

        camera.position.y = groundCam;

    }

    // =====================================================
    // CAMERA COLLISION
    // =====================================================

    fixCameraCollision(p);

    // =====================================================
    // LOOK PLAYER
    // =====================================================

    camera.lookAt(

        p.x,
        p.y + 1.5,
        p.z

    );

}

// =====================================================
// EXPORTS
// =====================================================

export function getCameraDistance(){

    return cam.distance;

}