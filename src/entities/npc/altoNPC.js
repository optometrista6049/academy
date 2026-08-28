import * as THREE from 'three';

import { loadModel }

from '../../systems/modelLoader.js';

import { collidables }

from '../collisions.js';

import {

    registerWorldObject

}
from '../../systems/visibilitySystem.js';

let AltoNPC;

let mixer;

let currentAction;

const actions = {};

export function loadAltoNPC(){

    console.log('LOAD ALTO NPC');

    loadModel(

        './assets/models/npc/AltoNPC.glb',

        4,
        2,

        2.7,

        (model,gltf)=>{

            console.log('ALTO MODEL LOADED');

            AltoNPC = model;
			
			registerWorldObject(

            AltoNPC,

            'npc'

            );

            AltoNPC.lookAt(

                0,

                AltoNPC.position.y,

                0

            );

            AltoNPC.userData.radius = 0.9;

            collidables.push(AltoNPC);

            mixer =
                new THREE.AnimationMixer(
                    AltoNPC
                );

            gltf.animations.forEach((clip)=>{

                actions[clip.name] =

                    mixer.clipAction(clip);

                console.log(
                    'AltoNPC animation:',
                    clip.name
                );

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

    if(!action){

        console.warn(
            'Animation not found:',
            keyword
        );

        return;

    }

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

export function updateAltoNPC(delta){

    if(

        !AltoNPC ||

        !AltoNPC.visible

    ) return;

    if(mixer){

        mixer.update(delta);

    }

}

export function getAltoNPC(){

    return AltoNPC;

}