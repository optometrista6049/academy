/*
Monteserin Academy

Registry Content Manager
========================================================
*/

const modules = new Map();

let currentModule = null;

let contentRoot = null;

//======================================================
// INICIALIZAR
//======================================================

export function initializeRegistryContent(root){
	
	

    contentRoot = root;

}

//======================================================
// REGISTRAR MÓDULO
//======================================================

export function registerRegistryModule(

    id,

    moduleRoot

){

    modules.set(

        id,

        moduleRoot

    );

    moduleRoot.hidden = true;

    contentRoot.appendChild(

        moduleRoot

    );

}
//======================================================
// OCULTAR TODOS
//======================================================

function hideAllModules(){

    modules.forEach(module=>{

        module.hidden = true;

    });

}

//======================================================
// MOSTRAR MÓDULO
//======================================================

export function showRegistryModule(id){

    if(!modules.has(id)){

        return;

    }

    hideAllModules();

    currentModule = id;

    modules.get(id).hidden = false;

}

//======================================================
// OBTENER MÓDULO ACTIVO
//======================================================

export function getCurrentRegistryModule(){

    return currentModule;

}

//======================================================
// OBTENER MÓDULOS REGISTRADOS (DEPURACIÓN)
//======================================================

export function getRegisteredModules(){

    return [...modules.keys()];

}

//======================================================
// COMPROBAR EXISTENCIA
//======================================================

export function hasRegistryModule(id){

    return modules.has(id);

}

//======================================================
// ELIMINAR TODOS LOS MÓDULOS
//======================================================

export function clearRegistryModules(){

    modules.forEach(module=>{

        module.remove();

    });

    modules.clear();

    currentModule = null;

}

