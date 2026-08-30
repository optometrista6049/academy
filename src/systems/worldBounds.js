import {
    WORLD_LIMIT
} from '../core/config.js';

import {
    LAKE_CENTER_X,
    LAKE_CENTER_Z,
    LAKE_WATER_Y,
    getLakeBasinRadius,
    getShoreRatio,
    getHeightAt
} from '../terrain/terrainHeight.js';

export function applyWorldBounds(pos){

    let bounced = false;

    // Límite exterior del mundo
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

    // Límite de colisión suave del Gran Lago:
    // Evita entrar en el agua o sumergirse por debajo del corte de la orilla/playa
    const dx = pos.x - LAKE_CENTER_X;
    const dz = pos.z - LAKE_CENTER_Z;
    const distToLake = Math.sqrt(dx * dx + dz * dz);

    if(distToLake < 95 && distToLake > 0.001){
        const theta = Math.atan2(dz, dx);
        const basinR = getLakeBasinRadius(theta);
        const shoreRatio = getShoreRatio(theta);
        // Radio exacto de la orilla de tierra seca (+0.4m de margen sobre la orilla)
        const safeDryR = basinR * shoreRatio + 0.4;

        // Si intenta entrar al agua, mantenerlo suavemente sobre la orilla seca
        if(distToLake < safeDryR){
            const pushFactor = safeDryR / distToLake;
            pos.x = LAKE_CENTER_X + dx * pushFactor;
            pos.z = LAKE_CENTER_Z + dz * pushFactor;
            bounced = true;
        }
    }

    return bounced;
}


