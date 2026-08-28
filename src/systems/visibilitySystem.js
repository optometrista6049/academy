import { runtimeState }
from '../state/runtimeState.js';

const worldObjects = [];

let lastVisibilityUpdate = 0;

export function registerWorldObject(

    object,

    type = 'generic'

){

    worldObjects.push({

        object,

        type,

        originalScale:

            object.scale.clone()

    });

}

export function updateVisibilitySystem(){

    const now = performance.now();

    if(

        now - lastVisibilityUpdate < 200

    ){

        return;

    }

    lastVisibilityUpdate = now;

    if(

        !runtimeState.player

    ) return;

    const playerPos =

        runtimeState.player.position;

    worldObjects.forEach((entry)=>{

        const object =

            entry.object;

        const distance =

            playerPos.distanceTo(

                object.position

            );

        // =====================================
        // DISTANCIA DE FADE
        // =====================================

        const fadeStart = 150;

        const fadeEnd = 180;

        // =====================================
        // MUY LEJOS
        // =====================================

        if(distance >= fadeEnd){

            object.visible = false;

            return;

        }

        object.visible = true;

        // =====================================
        // CALCULAR OPACIDAD
        // =====================================

        let opacity = 1;

        if(distance > fadeStart){

            opacity =

                1 -

                (

                    (distance - fadeStart)

                    /

                    (fadeEnd - fadeStart)

                );

        }

        // =====================================
        // APLICAR OPACIDAD
        // =====================================

        object.traverse((child)=>{

            if(

                child.isMesh

                &&

                child.material

            ){

                child.material.opacity =

                    opacity;

            }

        });

        // =====================================
        // LOD SIMPLE
        // =====================================

        if(distance > 60){

            object.scale.copy(

                entry.originalScale

            );

            object.scale.multiplyScalar(

                0.85

            );

        }

        else{

            object.scale.copy(

                entry.originalScale

            );

        }

    });

}