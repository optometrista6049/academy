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

import { initPlayerEquipment } from './playerEquipment.js';
import { getEntityTransform } from '../systems/worldLayoutSystem.js';

export function loadPlayer(){
    const spawn = getEntityTransform('playerSpawn', null, { x: 0, z: 0, rotationY: 0 });

    loadModel(

        'assets/models/RobotAnimado.glb',

        spawn.x,
        spawn.z,

        1.4,

        function(model,gltf,offset){

            runtimeState.player = model;
            runtimeState.player.userData = { isPlayer: true, name: 'Robot Player', type: 'player' };

            runtimeState.playerHeightOffset = offset;
            if (typeof spawn.rotationY === 'number') {
                model.rotation.y = spawn.rotationY;
            }

            initPlayerEquipment(model);

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