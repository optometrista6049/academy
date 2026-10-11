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

    archiveRoot = document.createElement("div");

    archiveRoot.id = "archiveModule";

    archiveRoot.className = "registryModule";

    buildArchivePanel();

}

/*========================================================*
* PANEL PRINCIPAL
*========================================================*/

function buildArchivePanel(){

    archivePanel = document.createElement("div");

    archivePanel.id = "archivePanel";

    buildArchiveTitle();

    const emptyContainer = document.createElement("div");
    emptyContainer.className = "archiveEmptyState";
    emptyContainer.innerHTML = `
        <div class="archiveEmptyIcon">📁</div>
        <div class="archiveEmptyTitle">Sin documentos archivados</div>
        <div class="archiveEmptyText">
            Actualmente no dispones de documentos o fotografías archivadas. 
            Los carnets, informes y recuerdos que decidas archivar desde tu Inventario se custodiarán aquí.
        </div>
    `;

    archivePanel.appendChild(emptyContainer);
    archiveRoot.appendChild(archivePanel);

}

/*========================================================*
* TÍTULO
*========================================================*/

function buildArchiveTitle(){

    archiveTitle = document.createElement("div");

    archiveTitle.id = "archiveTitle";

    archiveTitle.textContent = "ARCHIVO";

    archivePanel.appendChild(archiveTitle);

}
