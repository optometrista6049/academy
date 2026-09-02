import * as THREE from 'three';

import { scene } from '../core/scene.js';

import {

    WORLD_SIZE,
    LIMIT

} from '../core/config.js';

import {

    rand

} from '../utils/random.js';

import {
    addCollidable,
    cameraObstacles
} from '../entities/collisions.js';

function createMountain(x, z){

    const height = 12 + rand() * 30;

    const mountain = new THREE.Mesh(

        new THREE.ConeGeometry(10, height, 8),

        new THREE.MeshStandardMaterial({

            color: 0x6b6b6b,
            roughness: 1

        })

    );

    const baseOffset = -6 + rand() * 2;

    mountain.position.set(

        x + (rand() - 0.5) * 8,

        height / 2 + baseOffset,

        z + (rand() - 0.5) * 8

    );

    const s = 0.8 + rand() * 1.4;

    mountain.scale.set(
        s * 1.2,
        s,
        s * 1.2
    );

    mountain.rotation.y =
        rand() * Math.PI * 2;

    mountain.userData.solid = true;

    addCollidable(mountain);
    cameraObstacles.push(mountain);

    scene.add(mountain);

}

export function generateMountainRange(){

    const mountainOffset = 8;
    const depth = 3;
    const step = 20;

    for(let x = -LIMIT; x <= LIMIT; x += step){

        for(let d = 0; d < depth; d++){

            const offsetZ =
                mountainOffset + d * 12;

            // Apertura de cañón para la desembocadura y ensenada del Río 2 (x entre 25 y 80 en el límite sur)
            const isRiverCanyonPass = (x >= 25 && x <= 80);

            if (!isRiverCanyonPass) {
                createMountain(
                    x,
                    -LIMIT - offsetZ
                );
            }

            createMountain(
                x,
                LIMIT + offsetZ
            );

        }

    }

    for(let z = -LIMIT; z <= LIMIT; z += step){

        for(let d = 0; d < depth; d++){

            const offsetX =
                mountainOffset + d * 12;

            createMountain(
                -LIMIT - offsetX,
                z
            );

            createMountain(
                LIMIT + offsetX,
                z
            );

        }

    }

    // Acantilados y farallones rocosos que flanquean la entrada de la Ensenada / Cañón del Río
    createCanyonGateCliffs();
}

/**
 * Genera farallones y acantilados de roca que enmarcan la garganta de la ensenada
 * como una imponente puerta natural por donde el río escapa a través de las montañas.
 */
function createCanyonGateCliffs() {
    const cliffGeo = new THREE.DodecahedronGeometry(1, 1);
    const cliffMat = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.92,
        metalness: 0.12,
        flatShading: true
    });

    // Flanco Oeste (x ~ 18..24, z ~ -245..-275)
    const westPillars = [
        { x: 22, y: 3, z: -246, sx: 7, sy: 14, sz: 8 },
        { x: 18, y: 6, z: -258, sx: 9, sy: 18, sz: 10 },
        { x: 14, y: 8, z: -272, sx: 10, sy: 22, sz: 11 }
    ];

    // Flanco Este (x ~ 80..86, z ~ -242..-270)
    const eastPillars = [
        { x: 80, y: 3, z: -242, sx: 7, sy: 13, sz: 8 },
        { x: 84, y: 5, z: -254, sx: 8, sy: 17, sz: 9 },
        { x: 88, y: 8, z: -268, sx: 10, sy: 21, sz: 10 }
    ];

    [...westPillars, ...eastPillars].forEach(p => {
        const cliff = new THREE.Mesh(cliffGeo, cliffMat);
        cliff.position.set(p.x, p.y, p.z);
        cliff.scale.set(p.sx, p.sy, p.sz);
        cliff.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
        cliff.castShadow = true;
        cliff.receiveShadow = true;
        cliff.userData.solid = true;
        cliff.userData.radius = p.sx * 0.8;
        addCollidable(cliff);
        cameraObstacles.push(cliff);
        scene.add(cliff);
    });
}