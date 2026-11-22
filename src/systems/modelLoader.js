import * as THREE from 'three';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { scene } from '../core/scene.js';

import { getHeightAt } from '../terrain/terrainHeight.js';

export function loadModel(
    url,
    x,
    z,
    desiredHeight = 2,
    onLoaded = null
) {
    return new Promise((resolve) => {
        const loader = new GLTFLoader();

        loader.load(url, function(gltf) {
            const model = gltf.scene;

            // =========================
            // AUTO SCALE
            // =========================

            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);

            const safeHeight = size.y > 0.0001 ? size.y : 1;
            const scale = desiredHeight / safeHeight;

            model.scale.setScalar(scale);

            // recalcular box
            box.setFromObject(model);
            const groundOffset = -box.min.y;

            // =========================
            // POSITION
            // =========================

            model.position.x = x;
            model.position.z = z;
            model.position.y = getHeightAt(x, z) + groundOffset;

            // =========================
            // SHADOWS
            // =========================

            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            scene.add(model);

            if (onLoaded) {
                onLoaded(
                    model,
                    gltf,
                    groundOffset
                );
            }

            resolve(model);
        }, undefined, function(err) {
            console.warn('Failed loading model from ' + url + ':', err);
            resolve(null);
        });
    });
}
