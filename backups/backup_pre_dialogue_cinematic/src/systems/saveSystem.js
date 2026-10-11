import {

    gameState

}
from '../state/gameState.js';

const SAVE_KEY =

    'monteserinAcademySave';

import {

    runtimeState

}
from '../state/runtimeState.js';

export function saveGame(){
    try {
        if(runtimeState.player){
            gameState.player.x =
                runtimeState.player.position.x;
            gameState.player.y =
                runtimeState.player.position.y;
            gameState.player.z =
                runtimeState.player.position.z;
        }

        const serialized = JSON.stringify(gameState);
        if(serialized){
            localStorage.setItem(
                SAVE_KEY,
                serialized
            );
        }
    } catch(err){
        console.warn('No se pudo guardar la partida:', err);
    }
}

export function loadGame(){
    try{
        const data =
            localStorage.getItem(
                SAVE_KEY
            );

        if(!data || typeof data !== 'string' || !data.trim() || data === 'undefined' || data === 'null'){
            return false;
        }

        const save =
            JSON.parse(data);

        if(save && typeof save === 'object' && !Array.isArray(save)){
            Object.assign(
                gameState,
                save
            );
            return true;
        }

        localStorage.removeItem(SAVE_KEY);
        return false;
    }
    catch(error){
        console.warn('Partida guardada no válida o corrupta en localStorage. Se reinicia el almacenamiento:', error);
        try {
            localStorage.removeItem(SAVE_KEY);
        } catch {}
        return false;
    }
}

export function deleteSave(){
    try {
        localStorage.removeItem(
            SAVE_KEY
        );
    } catch {}
}

export function hasSave(){
    try {
        const raw =
            localStorage.getItem(
                SAVE_KEY
            );

        if(!raw || typeof raw !== 'string' || !raw.trim() || raw === 'undefined' || raw === 'null'){
            return false;
        }

        const parsed = JSON.parse(raw);
        return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
    } catch {
        try {
            localStorage.removeItem(SAVE_KEY);
        } catch {}
        return false;
    }
}