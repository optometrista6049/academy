import { runtimeState } from '../state/runtimeState.js';
import { updateChunkSystem } from './chunkSystem.js';

const worldObjects = [];

let lastVisibilityUpdate = 0;

export function registerWorldObject(
    object,
    type = 'generic'
){
    if(!object) return;
    worldObjects.push({
        object,
        type,
        originalScale: object.scale ? object.scale.clone() : null
    });
}

export function updateVisibilitySystem(){
    // 1. Actualización de visibilidad espacial por chunks (O(1))
    updateChunkSystem();

    const now = performance.now();
    if(now - lastVisibilityUpdate < 200){
        return;
    }
    lastVisibilityUpdate = now;

    if(!runtimeState.player || worldObjects.length === 0) return;

    const playerPos = runtimeState.player.position;

    worldObjects.forEach((entry)=>{
        const object = entry.object;
        if(!object || !object.position) return;

        const distance = playerPos.distanceTo(object.position);

        const fadeStart = 150;
        const fadeEnd = 180;

        if(distance >= fadeEnd){
            object.visible = false;
            return;
        }

        object.visible = true;

        if(entry.originalScale){
            if(distance > 60){
                object.scale.copy(entry.originalScale).multiplyScalar(0.85);
            } else {
                object.scale.copy(entry.originalScale);
            }
        }
    });
}
