import * as THREE from 'three';


// ======================================================
// CORE
// ======================================================

import { scene } from './core/scene.js';

import { camera } from './core/camera.js';

import { renderer } from './core/renderer.js';

import './core/lighting.js';

import { animate } from './core/gameLoop.js';

import {
    createMainMenu
}
from './ui/mainMenu.js';

import {
    DEV_CONFIG
}
from './config/devConfig.js';

import {
    initDevSuite
}
from './debug/devPanel.js';

import {
	showLoadingScreen,
    hideLoadingScreen
}
from './ui/loadingScreen.js';

import {
    updatePlayTime
}
from './systems/timeSystem.js';

import {
    initSessionBatterySystem
}
from './systems/sessionBatterySystem.js';

import {
    initScreenLockManager
}
from './mobile/screenLockManager.js';
import {

    createPandaReminder,
    updatePandaReminder

}
from './ui/pandaReminder.js';

//==================================
//SISTEMA DE DIALOGOS E INTERACCIONES
//==================================
import {

    createDialogueUI

}
from './dialogue/dialogueUI.js';

import {

    createInteractionUI

}
from './interaction/interactionUI.js';

import {

    updateInteractionSystem

}
from './interaction/interactionManager.js';

//=========================================
// REGISTRO
//==========================================
import {

    createRegistryUI

}
from './ui/registry/registryUI.js';

//==========================================
//SISTEMA DIALOGOS INTERACCIONES EN TLEFONO
//=======================================

export {
    hasInteractionTarget,
    tryInteraction
}
from './interaction/interactionManager.js';

import {

    createMobileInteractionButton,
    getMobileInteractionButton

}
from './mobile/mobileInteractionButton.js';

//=================================
//GUARDADO JUEGO
//===================================
import {

    saveGame

}
from './systems/saveSystem.js';

import { runtimeState } from './state/runtimeState.js';


// ======================================================
// TERRAIN
// ======================================================

import './terrain/terrain.js';

import './terrain/terrainFloor.js';


// ======================================================
// ENVIRONMENT
// ======================================================

import './environment/sky.js';

import {

  generateClouds,
  updateClouds

} from './environment/clouds.js';

import {

  createForest

} from './environment/trees.js';

import {

  generateMountainRange

} from './environment/mountains.js';


import {

    createRockField

}
from './environment/rocks.js';

import {
    createLake,
    updateLake
} from './environment/lake.js';

import {
    createRiver,
    updateRiver
} from './environment/river.js';

import {
    createBridges
} from './environment/bridgeSystem.js';

import {
    updateWaterMaterials
} from './environment/waterSystem.js';



//========================================
//CONTROL DE VISIBILIDAD
//============================================
import {

    updateVisibilitySystem

}
from './systems/visibilitySystem.js';


// ======================================================
// ENTITIES
// ======================================================

import './entities/entities.js';


// ======================================================
// PLAYER
// ======================================================

import {

  loadPlayer

} from './player/player.js';

import {

  updatePlayer

} from './player/playerController.js';
//======================================================
//CARGAMOS NPCs
//==========================================================
import {

    loadPandaNPC,
    updatePandaNPC

}
from './entities/npc/pandaNPC.js';


import {

    loadAltoNPC,
    updateAltoNPC

}
from './entities/npc/altoNPC.js';

import {

    loadTelerinNPC,
    updateTelerinNPC

}
from './entities/npc/telerinNPC.js';

import {

    loadTeleronNPC,
    updateTeleronNPC

}
from './entities/npc/teleronNPC.js';

import {

    loadMuebleObject

}
from './entities/objects/muebleObject.js';

// ======================================================
// MOBILE
// ======================================================

import {

  initMobileJoystick

} from './mobile/mobileJoystick.js';


// ======================================================
// SYSTEMS
// ======================================================

import {

  setupInput

} from './systems/inputSystem.js';

import {
    initMicrochipHuntSystem,
    updateMicrochipHuntSystem
} from './systems/microchipHuntSystem.js';

import './systems/resizeSystem.js';


// ======================================================
// UI
// ======================================================

import {

  createBootScreen

} from './ui/bootScreen.js';

import {

  createOrientationOverlay,
  enableOrientationOverlay

} from './ui/orientationOverlay.js';

//=========================================
//IMPORT PARA EL DEBUG DE POSICION DEL PLAYER
//=============================================
import {

    initworldEditor,
    updateworldEditor

}
from './debug/worldEditor.js';
import { loadAndSpawnWorldObjects } from './systems/worldObjectsManager.js';
import { waitForInitialLayoutSync } from './systems/worldLayoutSystem.js';


// ======================================================
// START GAME
// ======================================================

async function startGame(){

    runtimeState.sessionStarted = true;

    showLoadingScreen();

    
    enableOrientationOverlay();

   
    setupInput();

    
    createDialogueUI();

    
    createInteractionUI();
	
	
	createRegistryUI();
	
	
	createMobileInteractionButton();



    // =====================================
    // BOTÓN INTERACCIÓN MÓVIL
    // =====================================

    const interactionButton =

        getMobileInteractionButton();

    if(interactionButton){

        interactionButton.addEventListener(

            'click',

            ()=>{

                tryInteraction();

            }

        );

    }
    
    createPandaReminder();

    
    initMobileJoystick();

    
    await waitForInitialLayoutSync(1500);

    initMicrochipHuntSystem();

    generateClouds();

    createForest();

    createRockField();

    createLake();

    createRiver();

    createBridges();

    generateMountainRange();

    const loadStartTime = performance.now();

    const playerPromise = loadPlayer();

    if (DEV_CONFIG.enabled) {
        initworldEditor();
    }

    const worldObjectsPromise = loadAndSpawnWorldObjects();
    const pandaPromise = loadPandaNPC();
    const altoPromise = loadAltoNPC();
    const telerinPromise = loadTelerinNPC();
    const teleronPromise = loadTeleronNPC();
    const mueblePromise = loadMuebleObject();

    animate({
        scene,
        camera,
        renderer,
        updateFunctions:[
            updatePlayer,
            updateInteractionSystem,
            updatePandaReminder,
            updateLake,
            updateRiver,
            () => updateWaterMaterials(performance.now() * 0.001),
            updateClouds,
            updatePlayTime,
            updatePandaNPC,
            updateAltoNPC,
            updateTelerinNPC,
            updateTeleronNPC,
            updateMicrochipHuntSystem,
            ...(DEV_CONFIG.enabled ? [updateworldEditor] : []),
            updateVisibilitySystem
        ]
    });

    await Promise.race([
        Promise.allSettled([
            playerPromise,
            worldObjectsPromise,
            pandaPromise,
            altoPromise,
            telerinPromise,
            teleronPromise,
            mueblePromise
        ]),
        new Promise((resolve) => setTimeout(resolve, 5000))
    ]);

    const elapsed = performance.now() - loadStartTime;
    const minDisplayMs = 450;
    if (elapsed < minDisplayMs) {
        await new Promise((resolve) => setTimeout(resolve, minDisplayMs - elapsed));
    }

    hideLoadingScreen();

}

//================================================
// SAVE ON EXIT
//===============================================
window.addEventListener(

    'beforeunload',

    ()=>{

        if (runtimeState.sessionStarted) {
            saveGame();
        }

    }

);
// ======================================================
// UI INIT
// ======================================================

createOrientationOverlay();

if (DEV_CONFIG.enabled) {
    initDevSuite();
}

initSessionBatterySystem();

initScreenLockManager();

createBootScreen(

    ()=>{

        createMainMenu(

            startGame

        );

    }

);