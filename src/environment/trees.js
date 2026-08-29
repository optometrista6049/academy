import * as THREE from 'three';

import { scene } from '../core/scene.js';

import { WORLD_SIZE } from '../core/config.js';

import { rand } from '../utils/random.js';

import { snap } from '../utils/snap.js';

import { collidables } from '../entities/collisions.js';

import {

    registerWorldObject

}
from '../systems/visibilitySystem.js';

function createTree(x,z){

    const tree = new THREE.Group();

    const variant =
        Math.floor(Math.random()*12);

    const trunkColor = 0x8b5a2b;

    const leafColors = [

        0x2e8b57,
        0x3a8f4d,
        0x4a9c55,
        0x228b22

    ];

    const leafColor =

        leafColors[
            Math.floor(
                Math.random()
                *
                leafColors.length
            )
        ];

    let trunk;

    let leaves;

    switch(variant){

        // =================================
        // ROBLE REDONDO
        // =================================

        case 0:

            trunk = new THREE.Mesh(

                new THREE.CylinderGeometry(
                    0.3,
                    0.4,
                    2.2
                ),

                new THREE.MeshStandardMaterial({
                    color:trunkColor
                })

            );

            leaves = new THREE.Mesh(

                new THREE.SphereGeometry(
                    1.4,
                    8,
                    8
                ),

                new THREE.MeshStandardMaterial({
                    color:leafColor
                })

            );

        break;

        // =================================
        // ROBLE GRANDE
        // =================================

        case 1:

            trunk = new THREE.Mesh(

                new THREE.CylinderGeometry(
                    0.45,
                    0.55,
                    3
                ),

                new THREE.MeshStandardMaterial({
                    color:trunkColor
                })

            );

            leaves = new THREE.Mesh(

                new THREE.SphereGeometry(
                    2,
                    8,
                    8
                ),

                new THREE.MeshStandardMaterial({
                    color:leafColor
                })

            );

        break;

        // =================================
        // PINO
        // =================================

        case 2:

            trunk = new THREE.Mesh(

                new THREE.CylinderGeometry(
                    0.25,
                    0.35,
                    3.5
                ),

                new THREE.MeshStandardMaterial({
                    color:trunkColor
                })

            );

            leaves = new THREE.Group();

            for(let i=0;i<3;i++){

                const cone = new THREE.Mesh(

                    new THREE.ConeGeometry(
                        1.4-(i*0.2),
                        2,
                        8
                    ),

                    new THREE.MeshStandardMaterial({
                        color:leafColor
                    })

                );

                cone.position.y =
                    i*0.9;

                leaves.add(cone);

            }

        break;

        // =================================
        // ABETO ALTO
        // =================================

        case 3:

            trunk = new THREE.Mesh(

                new THREE.CylinderGeometry(
                    0.2,
                    0.3,
                    4
                ),

                new THREE.MeshStandardMaterial({
                    color:trunkColor
                })

            );

            leaves = new THREE.Group();

            for(let i=0;i<4;i++){

                const cone = new THREE.Mesh(

                    new THREE.ConeGeometry(
                        1.6-(i*0.25),
                        2,
                        8
                    ),

                    new THREE.MeshStandardMaterial({
                        color:leafColor
                    })

                );

                cone.position.y =
                    i*1.0;

                leaves.add(cone);

            }

        break;

        // =================================
        // ÁRBOL PEQUEÑO
        // =================================

        case 4:

            trunk = new THREE.Mesh(

                new THREE.CylinderGeometry(
                    0.2,
                    0.25,
                    1.4
                ),

                new THREE.MeshStandardMaterial({
                    color:trunkColor
                })

            );

            leaves = new THREE.Mesh(

                new THREE.SphereGeometry(
                    0.9,
                    8,
                    8
                ),

                new THREE.MeshStandardMaterial({
                    color:leafColor
                })

            );

        break;

        // =================================
        // ÁRBOL ANCHO
        // =================================

        case 5:

            trunk = new THREE.Mesh(

                new THREE.CylinderGeometry(
                    0.35,
                    0.45,
                    2.2
                ),

                new THREE.MeshStandardMaterial({
                    color:trunkColor
                })

            );

            leaves = new THREE.Mesh(

                new THREE.SphereGeometry(
                    2.3,
                    8,
                    8
                ),

                new THREE.MeshStandardMaterial({
                    color:leafColor
                })

            );

        break;

        // =================================
        // ÁRBOL INCLINADO
        // =================================

        case 6:

            trunk = new THREE.Mesh(

                new THREE.CylinderGeometry(
                    0.25,
                    0.35,
                    2.8
                ),

                new THREE.MeshStandardMaterial({
                    color:trunkColor
                })

            );

            trunk.rotation.z =

                THREE.MathUtils.degToRad(
                    10
                );

            leaves = new THREE.Mesh(

                new THREE.SphereGeometry(
                    1.4,
                    8,
                    8
                ),

                new THREE.MeshStandardMaterial({
                    color:leafColor
                })

            );

        break;

        // =================================
        // ÁRBOL BIFURCADO
        // =================================

        case 7:

            trunk = new THREE.Group();

            const branch1 = new THREE.Mesh(

                new THREE.CylinderGeometry(
                    0.18,
                    0.25,
                    2
                ),

                new THREE.MeshStandardMaterial({
                    color:trunkColor
                })

            );

            const branch2 = branch1.clone();

            branch1.rotation.z =
                0.3;

            branch2.rotation.z =
                -0.3;

            trunk.add(branch1);

            trunk.add(branch2);

            leaves = new THREE.Mesh(

                new THREE.SphereGeometry(
                    1.5,
                    8,
                    8
                ),

                new THREE.MeshStandardMaterial({
                    color:leafColor
                })

            );

        break;

        //=================================
		// ARBOL FRONDOSO
		//==================================
		case 8:

    trunk = new THREE.Mesh(

        new THREE.CylinderGeometry(
            0.35,
            0.45,
            2.8
        ),

        new THREE.MeshStandardMaterial({
            color:trunkColor
        })

    );

    leaves = new THREE.Mesh(

        new THREE.SphereGeometry(
            1.8,
            8,
            8
        ),

        new THREE.MeshStandardMaterial({
            color:leafColor
        })

    );

break;

        // =================================
        // VARIANTES EXTRA
        // =================================

        default:

            trunk = new THREE.Mesh(

                new THREE.CylinderGeometry(
                    0.2 + Math.random()*0.2,
                    0.3 + Math.random()*0.2,
                    2 + Math.random()*2
                ),

                new THREE.MeshStandardMaterial({
                    color:trunkColor
                })

            );

            leaves = new THREE.Mesh(

                new THREE.SphereGeometry(
                    1 + Math.random()*1.5,
                    8,
                    8
                ),

                new THREE.MeshStandardMaterial({
                    color:leafColor
                })

            );

        break;

    }

    const box = new THREE.Box3()

    .setFromObject(trunk);

const trunkHeight =

    box.max.y - box.min.y;

trunk.position.y =

    trunkHeight / 2;

leaves.position.y =

    trunkHeight + 0.8;

    tree.add(trunk);

    tree.add(leaves);
	
	tree.traverse((child)=>{

    if(

        child.isMesh

        &&

        child.material

    ){

        child.material.transparent = true;

    }

});

    snap(tree,x,z,0);

    tree.userData.radius = 1.2;

    collidables.push(tree);

    scene.add(tree);
	
	registerWorldObject(

    tree,

    'tree'

);

}

export function createForest(){

    for(let i=0;i<90;i++){

        const x =
            (rand()-0.5)*WORLD_SIZE;

        const z =
            (rand()-0.5)*WORLD_SIZE;

        if(

            Math.abs(x)<20 &&
            Math.abs(z)<20

        ) continue;

        createTree(x,z);

    }

}