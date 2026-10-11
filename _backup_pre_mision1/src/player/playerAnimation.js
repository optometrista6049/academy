import {

    runtimeState

} from '../state/runtimeState.js';

let currentAction = null;

// =====================================================
// CAMBIAR ANIMACIÓN
// =====================================================

function playAnimation(name){

    name = name.toLowerCase();

    const action =
        runtimeState.actions[name];

    if(!action) return;

    if(currentAction === action) return;

    if(currentAction){

        currentAction.fadeOut(0.2);

    }

    action.reset();

    action.fadeIn(0.2);

    action.play();

    currentAction = action;

}

// =====================================================
// UPDATE ANIMACIONES
// =====================================================

export function updatePlayerAnimation(
    moving,
    delta
){

    if(runtimeState.mixer){

        runtimeState.mixer.update(delta);

    }

    if(moving){

        playAnimation(
            "robotarmature|robot_running"
        );

    }else{

        playAnimation(
            "robotarmature|robot_idle"
        );

    }

}