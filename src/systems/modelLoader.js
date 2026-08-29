import * as THREE from 'three';

import { GLTFLoader }

from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';

import { scene } from '../core/scene.js';

import { getHeightAt }

from '../terrain/terrainHeight.js';

export function loadModel(

    url,
    x,
    z,
    desiredHeight = 2,
    onLoaded = null

){

    const loader = new GLTFLoader();

    loader.load(url, function(gltf){

        const model = gltf.scene;

        // =========================
        // AUTO SCALE
        // =========================

        const box = new THREE.Box3().setFromObject(model);

        const size = new THREE.Vector3();

        box.getSize(size);

        const scale = desiredHeight / size.y;

        model.scale.setScalar(scale);

        // recalcular box

        box.setFromObject(model);

        const groundOffset = -box.min.y;

        // =========================
        // POSITION
        // =========================

        model.position.x = x;

        model.position.z = z;

        model.position.y =
            getHeightAt(x,z)
            + groundOffset;

        // =========================
        // SHADOWS
        // =========================

        model.traverse((child)=>{

            if(child.isMesh){

                child.castShadow = true;

                child.receiveShadow = true;

            }

        });

        scene.add(model);

        if(onLoaded){

            onLoaded(
                model,
                gltf,
                groundOffset
            );

        }

    });

}