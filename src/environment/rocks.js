import * as THREE from 'three';

import { scene }

from '../core/scene.js';

import { WORLD_SIZE }

from '../core/config.js';

import { rand }

from '../utils/random.js';

import { snap }

from '../utils/snap.js';

import { collidables }

from '../entities/collisions.js';

import {

    registerWorldObject

}
from '../systems/visibilitySystem.js';

// =====================================
// CREATE ROCK
// =====================================

function createRock(

    x,

    z,

    scale = 1

){

    const geometryTypes = [

        THREE.DodecahedronGeometry,

        THREE.IcosahedronGeometry

    ];

    const Geo =

        geometryTypes[

            Math.floor(

                Math.random()

                *

                geometryTypes.length

            )

        ];

    const rock =

        new THREE.Mesh(

            new Geo(

                1,

                0

            ),

            new THREE.MeshStandardMaterial({

                color:0x666666

            })

        );

    rock.scale.set(

        scale * (0.8 + Math.random()*0.5),

        scale * (0.7 + Math.random()*0.8),

        scale * (0.8 + Math.random()*0.5)

    );

    rock.rotation.x =

        Math.random() * Math.PI;

    rock.rotation.y =

        Math.random() * Math.PI;

    rock.rotation.z =

        Math.random() * Math.PI;

    snap(

        rock,

        x,

        z,

        0

    );

    rock.userData.radius =

        scale;

    collidables.push(

        rock

    );

    scene.add(

        rock

    );

    registerWorldObject(

        rock,

        'rock'

    );

}

// =====================================
// ANCIENT ROCKS
// =====================================

function createAncientRocks(){

    const centerX = 78;

    const centerZ = 14;

    for(

        let i=0;

        i<8;

        i++

    ){

        createRock(

            centerX +

            (Math.random()-0.5)*14,

            centerZ +

            (Math.random()-0.5)*14,

            3 + Math.random()*2

        );

    }

}

// =====================================
// RANDOM ROCKS
// =====================================

function createScatteredRocks(){

    for(

        let i=0;

        i<30;

        i++

    ){

        const x =

            (rand()-0.5)

            *

            WORLD_SIZE;

        const z =

            (rand()-0.5)

            *

            WORLD_SIZE;

        if(

            Math.abs(x)<25

            &&

            Math.abs(z)<25

        ) continue;

        createRock(

            x,

            z,

            1 + Math.random()*2.5

        );

    }

}

// =====================================
// PUBLIC
// =====================================

export function createRockField(){

    createAncientRocks();

    createScatteredRocks();

}