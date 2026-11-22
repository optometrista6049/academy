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

let TeleronNPC;

let mixer;

let currentAction;

const actions = {};

import { getEntityTransform } from '../../systems/worldLayoutSystem.js';

export function loadTeleronNPC(){

    console.log('LOAD TELERON NPC');
    const transform = getEntityTransform('npcs', 'Telerón', { x: 0, z: 5, rotationY: 0, scale: 1.8 });

    return loadModel(

        'assets/models/npc/TeleronNPC.glb',

        transform.x,
        transform.z,

        transform.scale || 1.8,

        (model,gltf)=>{

            console.log('TELERON MODEL LOADED');

            const initDesiredScale = transform.scale || 1.8;
            const rawHeightFactor = (model.scale.x || initDesiredScale) / initDesiredScale;

            TeleronNPC = model;
            TeleronNPC.userData = { isNPC: true, npcName: 'Telerón', type: 'npc', rawHeightFactor };

            if (transform.scaleXYZ && typeof transform.scaleXYZ === 'object') {
                const sx = Number(transform.scaleXYZ.x) || initDesiredScale;
                const sy = Number(transform.scaleXYZ.y) || initDesiredScale;
                const sz = Number(transform.scaleXYZ.z) || initDesiredScale;
                TeleronNPC.scale.set(sx * rawHeightFactor, sy * rawHeightFactor, sz * rawHeightFactor);
                const b = new THREE.Box3().setFromObject(TeleronNPC);
                if (!b.isEmpty()) {
                    const gOff = TeleronNPC.position.y - b.min.y;
                    TeleronNPC.position.y = getHeightAt(transform.x, transform.z) + gOff;
                    TeleronNPC.userData.relativeGroundOffset = gOff;
                }
            }
            if (typeof transform.relativeGroundOffset === 'number') {
                TeleronNPC.userData.relativeGroundOffset = transform.relativeGroundOffset;
                TeleronNPC.position.y = getHeightAt(transform.x, transform.z) + transform.relativeGroundOffset;
            }

            // Personalizar color de pelo: Pelirrojo (#d05e26)
            TeleronNPC.traverse((child)=>{
                if(child.isMesh && child.name === 'Hair'){
                    const hairMat = child.material.clone();
                    hairMat.map = null;
                    hairMat.color.set('#d05e26');
                    hairMat.roughness = 0.8;
                    hairMat.metalness = 0.1;
                    hairMat.skinning = true;
                    hairMat.needsUpdate = true;
                    child.material = hairMat;
                }
            });

			registerWorldObject(

            TeleronNPC,

            'npc'

            );

            if (typeof transform.rotationY === 'number' && (transform.rotationY !== 0 || transform.explicitRotation === true)) {
                TeleronNPC.rotation.y = transform.rotationY;
            } else {
                TeleronNPC.lookAt(

                    0,

                    TeleronNPC.position.y,

                    0

                );
            }

            TeleronNPC.userData.radius = 0.9;
            TeleronNPC.userData.hiddenByLayout = Boolean(transform.hidden);
            TeleronNPC.visible = !TeleronNPC.userData.hiddenByLayout;

            if (!TeleronNPC.userData.hiddenByLayout) {
                addCollidable(TeleronNPC);
            }

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