import { runtimeState }
from '../state/runtimeState.js';

import { updateMovement }
from './playerMovement.js';

import { updateCamera }
from './playerCamera.js';

import { updatePlayerAnimation }
from './playerAnimation.js';

import { updateSunLighting }
from '../core/lighting.js';

export function updatePlayer(delta){

    // esperar a que exista jugador
    if(!runtimeState.player) return;

    // movimiento
    const moving = updateMovement(delta);

    // cámara
    updateCamera(delta);

    // animaciones
    updatePlayerAnimation(moving, delta);

    // sincronizar sombras y luz solar con la posición del jugador
    updateSunLighting(runtimeState.player.position);

}
