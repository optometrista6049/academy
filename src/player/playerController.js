import { runtimeState }
from '../state/runtimeState.js';

import { updateMovement }
from './playerMovement.js';

import { updateCamera }
from './playerCamera.js';

import { updatePlayerAnimation }
from './playerAnimation.js';

export function updatePlayer(delta){

    // esperar a que exista jugador
    if(!runtimeState.player) return;

    // movimiento
    const moving = updateMovement(delta);

    // cámara
    updateCamera();

    // animaciones
    updatePlayerAnimation(moving, delta);

}