/*
Monteserin Academy

Registry Module Connector
========================================================
*/

import {

    initializeRegistryContent,

    registerRegistryModule,

    getRegisteredModules

} from "./registryContentManager.js";

import {
    createInventoryModuleV2,
    resetInventoryVisualState
} from "./modules/inventoryModuleV2.js";

import {

    createArchiveModule

}
from "./modules/archiveModule.js";

import {

    createDiaryModule

}
from "./modules/diaryModule.js";

import {

    createHelpModule

}
from "./modules/helpModule.js";



//======================================================
// INICIALIZAR
//======================================================

export function initializeRegistryModules(



    registryContent

){

    initializeRegistryContent(

        registryContent

    );

    registerRegistryModule(

        "inventory",

        createInventoryModuleV2()
		
		

    );
	
	registerRegistryModule(

        "archive",

         createArchiveModule()

);

    registerRegistryModule(

         "journal",

         createDiaryModule()

);

     registerRegistryModule(

         "help",

         createHelpModule()

);

console.log(
    "Módulos registrados:",
    getRegisteredModules()
);

}
//======================================================
// CONTENT MANAGER
//======================================================

import {

    showRegistryModule,

    getCurrentRegistryModule

} from "./registryContentManager.js";

//======================================================
// SECCIONES
//======================================================

const registrySectionMap = [

    "inventory",

    "archive",

    "journal",

    "help"

];

//======================================================
// MOSTRAR SECCIÓN
//======================================================

export function showRegistrySection(index){

    if(

        index < 0 ||

        index >= registrySectionMap.length

    ){

        return;

    }

    showRegistryModule(

        registrySectionMap[index]

    );
	
	

}

//======================================================
// OBTENER SECCIÓN ACTIVA
//======================================================

export function getCurrentRegistrySection(){

    return getCurrentRegistryModule();

}
//======================================================
// REINICIAR ESTADO VISUAL DE LOS MÓDULOS
//======================================================
export function resetRegistryModulesVisualState(){

    resetInventoryVisualState();

}
