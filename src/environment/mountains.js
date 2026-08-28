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

    collidables

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

    collidables.push(mountain);

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

            createMountain(
                x,
                -LIMIT - offsetZ
            );

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

}