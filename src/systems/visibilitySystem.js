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

    // En Modo Dios, mantener visibles los objetos activos salvo los ocultados explícitamente por el layout
    if (runtimeState.isGodMode) {
        worldObjects.forEach((entry) => {
            const object = entry.object;
            if (object) {
                const vis = !object.userData?.hiddenByLayout;
                object.visible = vis;
                if (typeof object.userData?.onVisibilityChange === 'function') {
                    object.userData.onVisibilityChange(vis);
                }
            }
        });
        return;
    }

    if(!runtimeState.player || worldObjects.length === 0) return;

    const playerPos = runtimeState.player.position;

    worldObjects.forEach((entry)=>{
        const object = entry.object;
        if(!object || !object.position) return;
        if (object.userData?.hiddenByLayout) {
            object.visible = false;
            if (typeof object.userData?.onVisibilityChange === 'function') {
                object.userData.onVisibilityChange(false);
            }
            return;
        }

        const distance = playerPos.distanceTo(object.position);
        const fadeEnd = 180;
        const vis = distance < fadeEnd;

        object.visible = vis;
        if (typeof object.userData?.onVisibilityChange === 'function') {
            object.userData.onVisibilityChange(vis);
        }
    });
}
