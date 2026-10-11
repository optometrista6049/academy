/*========================================================*
* ARCHIVE MODULE
*========================================================*/

let archiveRoot = null;

let archivePanel = null;

let archiveTitle = null;

/*========================================================*
* CREAR MÓDULO
*========================================================*/

export function createArchiveModule(){

    if(archiveRoot){

        return archiveRoot;

    }

    buildModule();

    return archiveRoot;

}

/*========================================================*
* CONSTRUIR MÓDULO
*========================================================*/

function buildModule(){

    archiveRoot =

        document.createElement("div");

    archiveRoot.id =

        "archiveModule";

    buildArchivePanel();

}

/*========================================================*
* PANEL PRINCIPAL
*========================================================*/

function buildArchivePanel(){

    archivePanel =

        document.createElement("div");

    archivePanel.id =

        "archivePanel";

    archiveRoot.appendChild(

        archivePanel

    );

    buildArchiveTitle();

}

/*========================================================*
* TÍTULO
*========================================================*/

function buildArchiveTitle(){

    archiveTitle =

        document.createElement("div");

    archiveTitle.id =

        "archiveTitle";

    archiveTitle.textContent =

        "ARCHIVO";

    archivePanel.appendChild(

        archiveTitle

    );

}