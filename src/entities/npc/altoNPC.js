import * as THREE from 'three';

import { loadModel }

from '../../systems/modelLoader.js';

import { addCollidable }

from '../collisions.js';

import { getHeightAt } from '../../terrain/terrainHeight.js';

import {

    registerWorldObject

}
from '../../systems/visibilitySystem.js';

let AltoNPC;

let mixer;

let currentAction;

const actions = {};

import { getEntityTransform } from '../../systems/worldLayoutSystem.js';

export function loadAltoNPC(){

    console.log('LOAD ALTO NPC');
    const transform = getEntityTransform('npcs', 'Alto', { x: 4, z: 2, rotationY: 0, scale: 2.7 });

    return loadModel(

        'assets/models/npc/AltoNPC.glb',

        transform.x,
        transform.z,

        transform.scale || 2.7,

        (model,gltf)=>{

            console.log('ALTO MODEL LOADED');

            const initDesiredScale = transform.scale || 2.7;
            const rawHeightFactor = (model.scale.x || initDesiredScale) / initDesiredScale;

            AltoNPC = model;
            AltoNPC.userData = { isNPC: true, npcName: 'Alto', type: 'npc', rawHeightFactor };

            if (transform.scaleXYZ && typeof transform.scaleXYZ === 'object') {
                const sx = Number(transform.scaleXYZ.x) || initDesiredScale;
                const sy = Number(transform.scaleXYZ.y) || initDesiredScale;
                const sz = Number(transform.scaleXYZ.z) || initDesiredScale;
                AltoNPC.scale.set(sx * rawHeightFactor, sy * rawHeightFactor, sz * rawHeightFactor);
                const b = new THREE.Box3().setFromObject(AltoNPC);
                if (!b.isEmpty()) {
                    const gOff = AltoNPC.position.y - b.min.y;
                    AltoNPC.position.y = getHeightAt(transform.x, transform.z) + gOff;
                    AltoNPC.userData.relativeGroundOffset = gOff;
                }
            }
            if (typeof transform.relativeGroundOffset === 'number') {
                AltoNPC.userData.relativeGroundOffset = transform.relativeGroundOffset;
                AltoNPC.position.y = getHeightAt(transform.x, transform.z) + transform.relativeGroundOffset;
            }
			
			registerWorldObject(

            AltoNPC,

            'npc'

            );

            if (typeof transform.rotationY === 'number' && (transform.rotationY !== 0 || transform.explicitRotation === true)) {
                AltoNPC.rotation.y = transform.rotationY;
            } else {
                AltoNPC.lookAt(

                    0,

                    AltoNPC.position.y,

                    0

                );
            }

            AltoNPC.userData.radius = 0.9;
            AltoNPC.userData.hiddenByLayout = Boolean(transform.hidden);
            AltoNPC.visible = !AltoNPC.userData.hiddenByLayout;

            if (!AltoNPC.userData.hiddenByLayout) {
                addCollidable(AltoNPC);
            }

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

            playAnimationByKeyword('assembly_loop');

        }

    );

}

function findAnimation(keyword){

    keyword = keyword.toLowerCase();

    // Preferir versión _loop si se busca assembly
    if (keyword === 'assembly' || keyword === 'assembly_loop') {
        const loopMatch = Object.keys(actions).find(n => n.toLowerCase().includes('assembly_loop'));
        if (loopMatch) return actions[loopMatch];
    }

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