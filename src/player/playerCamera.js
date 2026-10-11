import { camera }
from '../core/camera.js';

import { fixCameraCollision }
from './playerCameraCollision.js';

import {
    getHeightAt,
    LAKE_WATER_Y
} from '../terrain/terrainHeight.js';

import {
    getBridgeHeight
} from '../environment/bridgeSystem.js';

import {
    getWaterSurfaceLevel
} from '../terrain/riverPath.js';

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

// Ángulos objetivo para interpolación suave (elimina tirones de ráfagas de ratón/touch)
let targetAx = cam.ax;
let targetAy = cam.ay;

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

    targetAx -= e.movementX * 0.005;

    targetAy -= e.movementY * 0.005;

    targetAy = Math.max(

        -0.40,

        Math.min(1.2, targetAy)

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

        targetAx -= dx * 0.005;

        targetAy -= dy * 0.005;

        targetAy = Math.max(

            -0.40,

            Math.min(1.2, targetAy)

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
// CINEMATIC OVERRIDE
// =====================================================

let cinematicOverride = null;

export function setCameraCinematicOverride(overrideFn){
    cinematicOverride = overrideFn;
}

export function clearCameraCinematicOverride(){
    cinematicOverride = null;
}

export function isCameraCinematicActive(){
    return cinematicOverride !== null;
}

export function snapCameraOrbitTo(pos, lookTarget){
    if(!runtimeState.player) return;
    const p = runtimeState.player.position;
    if(!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return;

    const dx = pos.x - p.x;
    const dy = pos.y - p.y;
    const dz = pos.z - p.z;
    const r = Math.sqrt(dx * dx + dz * dz + dy * dy);

    const minZ = cam.minZoom || 2.0;
    const maxZ = cam.maxZoom || 15.0;
    const safeR = (Number.isFinite(r) && r > 0.1) ? r : 6.0;
    cam.distance = Math.max(minZ, Math.min(maxZ, safeR));
    cam.targetDistance = cam.distance;

    if (Number.isFinite(dx) && Number.isFinite(dz) && (dx !== 0 || dz !== 0)) {
        cam.ax = Math.atan2(dx, dz);
        targetAx = cam.ax;
    }

    const horizDist = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
    if (Number.isFinite(dy)) {
        cam.ay = Math.atan2(dy, horizDist);
        targetAy = Math.max(-0.40, Math.min(1.2, cam.ay));
    }
}

// =====================================================
// UPDATE CAMERA
// =====================================================

export function updateCamera(delta = 0.016){

    if(!runtimeState.player) return;

    if(cinematicOverride){
        cinematicOverride(delta, camera);
        return;
    }

    updateZoom();

    // Guardas de robustez contra valores no finitos (anti-NaN)
    if (!Number.isFinite(cam.distance) || cam.distance <= 0) {
        cam.distance = 6.0;
        cam.targetDistance = 6.0;
    }
    if (!Number.isFinite(cam.ax)) cam.ax = 0;
    if (!Number.isFinite(cam.ay)) cam.ay = 0.35;
    if (!Number.isFinite(targetAx)) targetAx = cam.ax;
    if (!Number.isFinite(targetAy)) targetAy = cam.ay;

    // Suavizado reactivo independiente del framerate (elimina micro-tirones sin añadir lag perceptible)
    const smoothFactor = 1.0 - Math.exp(-22.0 * delta);
    cam.ax += (targetAx - cam.ax) * smoothFactor;
    cam.ay += (targetAy - cam.ay) * smoothFactor;

    const p = runtimeState.player.position;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        return;
    }

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
    // GROUND & WATER SURFACE LIMIT
    // =====================================================

    const camBridgeH = getBridgeHeight(camera.position.x, camera.position.z);
    const camGroundH = getHeightAt(camera.position.x, camera.position.z);
    const camBaseH = (camBridgeH !== null) ? Math.max(camGroundH, camBridgeH) : camGroundH;

    const groundCam = camBaseH + 1.2;

    const localWaterY = getWaterSurfaceLevel(camera.position.x, camera.position.z);
    const minWaterCam = (localWaterY !== null ? localWaterY : LAKE_WATER_Y) + 0.8;
    const minCamY = Math.max(groundCam, minWaterCam);

    if(camera.position.y < minCamY){

        camera.position.y = minCamY;

    }

    // =====================================================
    // CAMERA COLLISION
    // =====================================================

    fixCameraCollision(p, r);

    // Reaplicar límite inferior para garantizar que ninguna corrección de obstáculos
    // hunda la cámara por debajo del suelo, puente o superficie de agua
    const postBridgeH = getBridgeHeight(camera.position.x, camera.position.z);
    const postGroundH = getHeightAt(camera.position.x, camera.position.z);
    const postBaseH = (postBridgeH !== null) ? Math.max(postGroundH, postBridgeH) : postGroundH;
    const postWaterY = getWaterSurfaceLevel(camera.position.x, camera.position.z);
    const postMinCamY = Math.max(postBaseH + 1.2, (postWaterY !== null ? postWaterY : LAKE_WATER_Y) + 0.8);

    if(camera.position.y < postMinCamY){
        camera.position.y = postMinCamY;
    }

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