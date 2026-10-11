import { getHeightAt } from '../terrain/terrainHeight.js';

export function snap(obj,x,z,offset=0){

    obj.position.set(
        x,
        getHeightAt(x,z)+offset,
        z
    );
}
