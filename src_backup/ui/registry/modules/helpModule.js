/*
Monteserin Academy

# Help Module

*/

let helpModule = null;

//======================================================
// CREAR MÓDULO
//======================================================

export function createHelpModule(){

    if(helpModule){

        return helpModule;

    }

    helpModule =
        document.createElement("div");

    helpModule.id =
        "helpModule";

    helpModule.className =
        "registryModule";

    //--------------------------------------------------
    // TÍTULO
    //--------------------------------------------------

    const title =
        document.createElement("div");

    title.className =
        "registryModuleTitle";

    title.textContent =
        "Ayuda";

    //--------------------------------------------------
    // CONTENIDO
    //--------------------------------------------------

    const content =
        document.createElement("div");

    content.className =
        "registryModulePlaceholder";

    content.textContent =
        "Manual del jugador en construcción.";

    helpModule.append(

        title,

        content

    );

    return helpModule;

}

//======================================================
// OBTENER MÓDULO
//======================================================

export function getHelpModule(){

    return helpModule;

}