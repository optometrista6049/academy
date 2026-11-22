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
import { restoreEquippedItemsFromGameState } from '../ui/registry/modules/inventoryModuleV2.js';
import { getEntityTransform } from '../systems/worldLayoutSystem.js';
import { getHeightAt } from '../terrain/terrainHeight.js';
import { getBridgeHeight } from '../environment/bridgeSystem.js';

export function loadPlayer(){
    const spawn = getEntityTransform('playerSpawn', null, { x: 0, z: 0, rotationY: 0 });

    return loadModel(

        'assets/models/RobotAnimado.glb',

        spawn.x,
        spawn.z,

        1.4,

        function(model,gltf,offset){

            const baseScale = model.scale.x || 1;
            let resolvedOffset = offset;
            if (spawn.scaleXYZ && typeof spawn.scaleXYZ === 'object') {
                const sx = Number(spawn.scaleXYZ.x) || 1;
                const sy = Number(spawn.scaleXYZ.y) || 1;
                const sz = Number(spawn.scaleXYZ.z) || 1;
                model.scale.set(baseScale * sx, baseScale * sy, baseScale * sz);
                const reBox = new THREE.Box3().setFromObject(model);
                resolvedOffset = Number.isFinite(reBox.min.y) ? (model.position.y - reBox.min.y) : offset;
            } else if (typeof spawn.scale === 'number' && spawn.scale > 0 && Math.abs(spawn.scale - 1.0) > 0.001) {
                model.scale.setScalar(baseScale * spawn.scale);
                const reBox = new THREE.Box3().setFromObject(model);
                resolvedOffset = Number.isFinite(reBox.min.y) ? (model.position.y - reBox.min.y) : offset;
            }

            if (typeof spawn.relativeGroundOffset === 'number') {
                resolvedOffset = spawn.relativeGroundOffset;
            }
            model.position.y = getHeightAt(spawn.x, spawn.z) + resolvedOffset;

            runtimeState.player = model;
            runtimeState.player.userData = {
                isPlayer: true,
                name: 'Robot Player',
                type: 'player',
                baseScale,
                relativeGroundOffset: resolvedOffset
            };

            runtimeState.playerHeightOffset = resolvedOffset;
            if (typeof spawn.rotationY === 'number') {
                model.rotation.y = spawn.rotationY;
            }

            initPlayerEquipment(model);
            restoreEquippedItemsFromGameState();

            // =========================
            // RESTORE SAVE POSITION
            // =========================

            if(hasSave()){

                const px = Number.isFinite(gameState.player.x) ? gameState.player.x : spawn.x;
                const pz = Number.isFinite(gameState.player.z) ? gameState.player.z : spawn.z;
                let py = gameState.player.y;
                const groundY = getHeightAt(px, pz);
                const bridgeY = getBridgeHeight(px, pz, Number.isFinite(py) ? py : groundY);
                const surfaceY = (bridgeY !== null ? Math.max(groundY, bridgeY) : groundY) + resolvedOffset;

                if (!Number.isFinite(py) || py < surfaceY - 0.15 || (py === 0 && Math.abs(surfaceY) > 0.15)) {
                    py = surfaceY;
                    gameState.player.y = py;
                }

                model.position.set(px, py, pz);

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