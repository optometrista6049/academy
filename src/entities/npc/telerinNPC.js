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

let TelerinNPC;

let mixer;

let currentAction;

const actions = {};

import { getEntityTransform } from '../../systems/worldLayoutSystem.js';

export function loadTelerinNPC(){

    console.log('LOAD TELERIN NPC');
    const transform = getEntityTransform('npcs', 'Telerín', { x: -4, z: 2, rotationY: 0, scale: 1.8 });

    return loadModel(

        'assets/models/npc/TelerinNPC.glb',

        transform.x,
        transform.z,

        transform.scale || 1.8,

        (model,gltf)=>{

            console.log('TELERIN MODEL LOADED');

            const initDesiredScale = transform.scale || 1.8;
            const rawHeightFactor = (model.scale.x || initDesiredScale) / initDesiredScale;

            TelerinNPC = model;
            TelerinNPC.userData = { isNPC: true, npcName: 'Telerín', type: 'npc', rawHeightFactor };

            if (transform.scaleXYZ && typeof transform.scaleXYZ === 'object') {
                const sx = Number(transform.scaleXYZ.x) || initDesiredScale;
                const sy = Number(transform.scaleXYZ.y) || initDesiredScale;
                const sz = Number(transform.scaleXYZ.z) || initDesiredScale;
                TelerinNPC.scale.set(sx * rawHeightFactor, sy * rawHeightFactor, sz * rawHeightFactor);
                const b = new THREE.Box3().setFromObject(TelerinNPC);
                if (!b.isEmpty()) {
                    const gOff = TelerinNPC.position.y - b.min.y;
                    TelerinNPC.position.y = getHeightAt(transform.x, transform.z) + gOff;
                    TelerinNPC.userData.relativeGroundOffset = gOff;
                }
            }
            if (typeof transform.relativeGroundOffset === 'number') {
                TelerinNPC.userData.relativeGroundOffset = transform.relativeGroundOffset;
                TelerinNPC.position.y = getHeightAt(transform.x, transform.z) + transform.relativeGroundOffset;
            }

            // Personalizar color de pelo: Castaño (#5a3825)
            TelerinNPC.traverse((child)=>{
                if(child.isMesh && child.name === 'Hair'){
                    const hairMat = child.material.clone();
                    hairMat.map = null;
                    hairMat.color.set('#5a3825');
                    hairMat.roughness = 0.8;
                    hairMat.metalness = 0.1;
                    hairMat.skinning = true;
                    hairMat.needsUpdate = true;
                    child.material = hairMat;
                }
            });
			
			registerWorldObject(

            TelerinNPC,

            'npc'

             );

            if (typeof transform.rotationY === 'number' && (transform.rotationY !== 0 || transform.explicitRotation === true)) {
                TelerinNPC.rotation.y = transform.rotationY;
            } else {
                TelerinNPC.lookAt(

                    0,

                    TelerinNPC.position.y,

                    0

                );
            }

            TelerinNPC.userData.radius = 0.9;
            TelerinNPC.userData.hiddenByLayout = Boolean(transform.hidden);
            TelerinNPC.visible = !TelerinNPC.userData.hiddenByLayout;

            if (!TelerinNPC.userData.hiddenByLayout) {
                addCollidable(TelerinNPC);
            }

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