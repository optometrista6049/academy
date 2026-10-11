import {

    gameState

}
from '../state/gameState.js';

import {

    saveGame

}
from './saveSystem.js';

let accumulator = 0;

let autoSaveTimer = 0;

export function updatePlayTime(delta){

    accumulator += delta;

    autoSaveTimer += delta;

    if(accumulator >= 1){

        gameState.playTime +=
            accumulator;

        accumulator = 0;

    }

    // ====================
    // AUTOSAVE
    // ====================

    if(autoSaveTimer >= 30){

        saveGame();

        autoSaveTimer = 0;

        console.log(
            'AUTOSAVE'
        );

    }

}