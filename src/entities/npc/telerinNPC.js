import * as THREE from 'three';

import { loadModel }

from '../../systems/modelLoader.js';

import { collidables }

from '../collisions.js';

import {

    registerWorldObject

}
from '../../systems/visibilitySystem.js';

let TelerinNPC;

let mixer;

let currentAction;

const actions = {};

export function loadTelerinNPC(){

    console.log('LOAD TELERIN NPC');

    loadModel(

        './assets/models/npc/TelerinNPC.glb',

        -4,
        2,

        1.8,

        (model,gltf)=>{

            console.log('TELERIN MODEL LOADED');

            TelerinNPC = model;
			
			registerWorldObject(

            TelerinNPC,

            'npc'

             );

            TelerinNPC.lookAt(

                0,

                TelerinNPC.position.y,

                0

            );

            TelerinNPC.userData.radius = 0.9;

            collidables.push(TelerinNPC);

            mixer =
                new THREE.AnimationMixer(
                    TelerinNPC
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

export function updateTelerinNPC(delta){

    if(

        !TelerinNPC ||

        !TelerinNPC.visible

    ) return;

    if(mixer){

        mixer.update(delta);

    }

}

export function getTelerinNPC(){

    return TelerinNPC;

}