import { collidables }

from '../entities/collisions.js';

import {

    registerWorldObject

}
from '../systems/visibilitySystem.js';

import {

    loadModel

}
from '../systems/modelLoader.js';

import {

    snap

}
from '../utils/snap.js';

// =====================================
// GENERIC DECORATION LOADER
// =====================================

export function createDecoration(

    modelPath,

    x,

    z,

    size = 2,

    collision = true

){

    loadModel(

        modelPath,

        x,

        z,

        size,

        (model)=>{

            snap(

                model,

                x,

                z,

                0

            );

            if(collision){

                model.userData.radius =

                    size * 0.6;

                collidables.push(model);

            }

            registerWorldObject(

                model,

                'decoration'

            );

        }

    );

}