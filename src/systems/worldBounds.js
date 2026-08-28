import {

    WORLD_LIMIT

} from '../core/config.js';

export function applyWorldBounds(pos){

    let bounced = false;

    if(pos.x > WORLD_LIMIT){

        pos.x = WORLD_LIMIT;

        bounced = true;

    }

    if(pos.x < -WORLD_LIMIT){

        pos.x = -WORLD_LIMIT;

        bounced = true;

    }

    if(pos.z > WORLD_LIMIT){

        pos.z = WORLD_LIMIT;

        bounced = true;

    }

    if(pos.z < -WORLD_LIMIT){

        pos.z = -WORLD_LIMIT;

        bounced = true;

    }

    return bounced;

}