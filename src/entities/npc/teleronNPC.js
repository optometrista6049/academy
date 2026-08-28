import * as THREE from 'three';

import { loadModel }

from '../../systems/modelLoader.js';

import { collidables }

from '../collisions.js';

import {

    registerWorldObject

}
from '../../systems/visibilitySystem.js';

let TeleronNPC;

let mixer;

let currentAction;

const actions = {};

export function loadTeleronNPC(){

    console.log('LOAD TELERON NPC');

    loadModel(

        './assets/models/npc/TeleronNPC.glb',

        0,
        5,

        1.8,

        (model,gltf)=>{

            console.log('TELERON MODEL LOADED');

            TeleronNPC = model;
			registerWorldObject(

            TeleronNPC,

            'npc'

            );

            TeleronNPC.lookAt(

                0,

                TeleronNPC.position.y,

                0

            );

            TeleronNPC.userData.radius = 0.9;

            collidables.push(TeleronNPC);

            mixer =
                new THREE.AnimationMixer(
                    TeleronNPC
                );

            gltf.animations.forEach((clip)=>{

                actions[clip.name] =

                    mixer.clipAction(clip);

            });

            playAnimationByKeyword('idle');

        }

    );

}

function findAnimation(keyword){

    keyword = keyword.toLowerCase();

    for(const name in actions){

        if(
            name
            .toLowerCase()
            .includes(keyword)
        ){

            return actions[name];

        }

    }

    return null;

}

export function playAnimationByKeyword(keyword){

    const action =
        findAnimation(keyword);

    if(!action) return;

    if(currentAction){

        currentAction.fadeOut(0.3);

    }

    currentAction = action;

    currentAction.reset();

    currentAction.fadeIn(0.3);

    currentAction.setLoop(
        THREE.LoopRepeat
    );

    currentAction.play();

}

export function updateTeleronNPC(delta){

    if(

        !TeleronNPC ||

        !TeleronNPC.visible

    ) return;

    if(mixer){

        mixer.update(delta);

    }

}

export function getTeleronNPC(){

    return TeleronNPC;

}