import * as THREE from 'three';

import {

    runtimeState

} from '../state/runtimeState.js';

import {

    loadModel

} from '../systems/modelLoader.js';


import {

    gameState

}
from '../state/gameState.js';

import {

    hasSave

}
from '../systems/saveSystem.js';

export function loadPlayer(){

    loadModel(

        'assets/models/RobotAnimado.glb',

        0,
        0,

        1.4,

        function(model,gltf,offset){

            runtimeState.player = model;

            runtimeState.playerHeightOffset = offset;

            // =========================
            // RESTORE SAVE POSITION
            // =========================

            if(hasSave()){

                model.position.set(

                    gameState.player.x,
                    gameState.player.y,
                    gameState.player.z

                );

            }

            // =========================
            // ANIMATION MIXER
            // =========================

            runtimeState.mixer =
                new THREE.AnimationMixer(model);

            gltf.animations.forEach((clip)=>{

                const action =
                    runtimeState.mixer.clipAction(clip);

                runtimeState.actions[
                    clip.name.toLowerCase()
                ] = action;

            });

        }

    );

}