import * as THREE from 'three';

import {
  GLTFLoader
} from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';


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
	showLoadingScreen,
    hideLoadingScreen
}
from './ui/loadingScreen.js';

import {

    updatePlayTime

}
from './systems/timeSystem.js';
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

export function hasInteractionTarget(){

    return interactionTarget !== null;

}

import {

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


// ======================================================
// START GAME
// ======================================================

function startGame(){

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

    
    generateClouds();

   
    createForest();

    createRockField();

    createLake();

    createRiver();

    generateMountainRange();


    
    loadPlayer();

   
    initworldEditor();

    
    loadPandaNPC();

    
    loadAltoNPC();

    
    loadTelerinNPC();

    
    loadTeleronNPC();

    

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

            updateworldEditor,

            updateVisibilitySystem

        ]

    });

    

    setTimeout(()=>{

        hideLoadingScreen();

    },5000);

}

//================================================
// SAVE ON EXIT
//===============================================
window.addEventListener(

    'beforeunload',

    ()=>{

        saveGame();

    }

);
// ======================================================
// UI INIT
// ======================================================

createOrientationOverlay();

createBootScreen(

    ()=>{

        createMainMenu(

            startGame

        );

    }

);