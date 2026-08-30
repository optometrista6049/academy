/*
Monteserin Academy

# Diary Module

*/

let diaryModule = null;

//======================================================
// CREAR MÓDULO
//======================================================

export function createDiaryModule(){

    if(diaryModule){

        return diaryModule;

    }

    diaryModule =
        document.createElement("div");

    diaryModule.id =
        "diaryModule";

    diaryModule.className =
        "registryModule";

    //--------------------------------------------------
    // TÍTULO
    //--------------------------------------------------

    const title =
        document.createElement("div");

    title.className =
        "registryModuleTitle";

    title.textContent =
        "Diario";

    //--------------------------------------------------
    // CONTENIDO
    //--------------------------------------------------

    const content =
        document.createElement("div");

    content.className =
        "registryModulePlaceholder";

    content.textContent =
        "Sistema de diario en construcción.";

    diaryModule.append(

        title,

        content

    );

    return diaryModule;

}

//======================================================
// OBTENER MÓDULO
//======================================================

export function getDiaryModule(){

    return diaryModule;

}