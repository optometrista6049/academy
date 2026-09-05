/*
========================================================

Monteserin Academy

Inventory Module

========================================================
*/

let inventoryRoot = null;

let inventoryGrid = null;

let inventoryInfo = null;

let inventorySlots = null;

let inventoryHeader = null;

let inventoryThumbnail = null;

let inventoryMeta = null;

let inventoryTitle = null;

let inventoryActions = null;

let inventoryBody = null;

let inventoryDescription = null;


let inventoryWorkspace = null;

let inventoryLeft = null;

let inventoryRight = null;

/*========================================================
CREAR MÓDULO
========================================================*/

export function createInventoryModule(){

    if(inventoryRoot){

        return inventoryRoot;

    }

    buildModule();
	
	

    return inventoryRoot;

}

/*========================================================
CONSTRUIR MÓDULO
========================================================*/

function buildModule(){

    inventoryRoot = document.createElement("div");
    inventoryRoot.id = "inventoryModule";

    buildWorkspace();

}



/*===================================================
CREACION DE WORKSPACE PARA SOLUCIONAR PROBLEMA CON GRID 
=======================================================*/

function buildWorkspace(){

    inventoryWorkspace = document.createElement("div");
    inventoryWorkspace.id = "inventoryWorkspace";

    inventoryLeft = document.createElement("div");
    inventoryLeft.id = "inventoryLeft";

    inventoryRight = document.createElement("div");
    inventoryRight.id = "inventoryRight";

    inventoryRoot.appendChild(
        inventoryWorkspace
    );

    inventoryWorkspace.appendChild(
        inventoryLeft
    );

    inventoryWorkspace.appendChild(
        inventoryRight
    );

    buildLeftPanel();

    buildRightPanel();

}
/*========================================================
PANEL IZQUIERDO
========================================================*/

function buildLeftPanel(){

    inventoryGrid = document.createElement("div");

    inventoryGrid.id = "inventoryGrid";

    inventoryLeft.appendChild(

        inventoryGrid

    );

    buildSlots();

}

/*========================================================
CREAR GRID
========================================================*/

function buildSlots(){

    inventorySlots = document.createElement("div");

    inventorySlots.id = "inventorySlots";

    inventoryGrid.appendChild(

        inventorySlots

    );

    createInventoryCells();

}

/*========================================================
CREAR 20 CASILLAS
========================================================*/

function createInventoryCells(){

    for(

        let i = 0;

        i < 20;

        i++

    ){

        const cell =

            document.createElement("div");

        cell.className =

            "inventoryCell empty";

        cell.dataset.slot = i;

        inventorySlots.appendChild(

            cell

        );

    }

}
/*========================================================
PANEL DERECHO
========================================================*/

function buildRightPanel(){

    inventoryInfo = document.createElement("div");

    inventoryInfo.id = "inventoryInfo";

    inventoryRight.appendChild(

        inventoryInfo

    );

    buildInventoryInfo();

}

/*========================================================
CONTENEDOR PRINCIPAL
========================================================*/

function buildInventoryInfo(){

    inventoryHeader = document.createElement("div");
    inventoryHeader.id = "inventoryHeader";

    inventoryThumbnail = document.createElement("img");
    inventoryThumbnail.id = "inventoryThumbnail";
    inventoryThumbnail.draggable = false;
    inventoryThumbnail.alt = "";
    inventoryThumbnail.style.display = "none";

    inventoryMeta = document.createElement("div");
    inventoryMeta.id = "inventoryMeta";

    inventoryTitle = document.createElement("div");
    inventoryTitle.id = "inventoryTitle";
    inventoryTitle.textContent =
        "Selecciona un objeto";

    inventoryActions = document.createElement("div");
    inventoryActions.id = "inventoryActions";

    const openButton = document.createElement("button");
    openButton.id = "inventoryOpenButton";
    openButton.textContent = "Abrir";

    const archiveButton = document.createElement("button");
    archiveButton.id = "inventoryArchiveButton";
    archiveButton.textContent = "Archivar";

    inventoryActions.appendChild(openButton);
    inventoryActions.appendChild(archiveButton);

    inventoryBody = document.createElement("div");
    inventoryBody.id = "inventoryBody";

    inventoryDescription = document.createElement("div");
    inventoryDescription.id = "inventoryDescription";
    inventoryDescription.textContent =
        "Los objetos del inventario mostrarán aquí su información cuando sean seleccionados.";

    inventoryInfo.appendChild(inventoryHeader);
    inventoryInfo.appendChild(inventoryBody);

    inventoryHeader.appendChild(inventoryThumbnail);
    inventoryHeader.appendChild(inventoryMeta);

    inventoryMeta.appendChild(inventoryTitle);
    inventoryMeta.appendChild(inventoryActions);

    inventoryBody.appendChild(inventoryDescription);

}







/*========================================================
ACTUALIZAR TÍTULO
========================================================*/

export function setInventoryTitle(text){

    if(!inventoryTitle){

        return;

    }

    inventoryTitle.textContent = text;

}

/*========================================================
ACTUALIZAR DESCRIPCIÓN
========================================================*/

export function setInventoryDescription(text){

    if(!inventoryDescription){

        return;

    }

    inventoryDescription.textContent = text;

}

/*========================================================
ACTUALIZAR IMAGEN
========================================================*/

export function setInventoryPreviewImage(path){

    if(!inventoryThumbnail){

        return;

    }

    if(!path){

        inventoryThumbnail.style.display = "none";

        inventoryThumbnail.removeAttribute("src");

        return;

    }

    inventoryThumbnail.src = path;

    inventoryThumbnail.style.display = "block";

}

/*========================================================
OBTENER CONTENEDOR PRINCIPAL
========================================================*/

export function getInventoryModule(){

    return inventoryRoot;

}

/*========================================================
LIMPIAR INFORMACIÓN
========================================================*/

export function clearInventoryPreview(){
	
	setInventoryPreviewImage(null);

    setInventoryTitle(

        "Selecciona un objeto"

    );

    setInventoryDescription(

        "Los objetos del inventario mostrarán aquí su información cuando sean seleccionados."

    );

}

/*========================================================
RESETEAR INVENTARIO
========================================================*/

export function resetInventoryModule(){

    clearInventoryPreview();

    if(!inventorySlots){

        return;

    }

    const cells =

        inventorySlots.children;

    for(

        let i = 0;

        i < cells.length;

        i++

    ){

        cells[i].className =

            "inventoryCell empty";

        cells[i].innerHTML = "";

    }

}
/*========================================================
ACTUALIZAR ICONO DE UNA CASILLA
========================================================*/

export function setInventorySlotIcon(

    slot,

    iconPath

){

    if(

        !inventorySlots ||

        slot < 0 ||

        slot >= inventorySlots.children.length

    ){

        return;

    }

    const cell =

        inventorySlots.children[slot];

    cell.innerHTML = "";

    if(!iconPath){

        cell.className =

            "inventoryCell empty";

        return;

    }

    const img =

        document.createElement("img");

    img.src = iconPath;

    img.draggable = false;

    img.alt = "";

    cell.appendChild(img);

    cell.className =

        "inventoryCell occupied";

}

/*========================================================
SELECCIONAR CASILLA
========================================================*/

export function selectInventorySlot(slot){

    if(!inventorySlots){

        return;

    }

    const cells =

        inventorySlots.children;

    for(

        let i = 0;

        i < cells.length;

        i++

    ){

        cells[i].classList.remove(

            "selected"

        );

    }

    if(

        slot >= 0 &&

        slot < cells.length

    ){

        cells[slot]

            .classList

            .add(

                "selected"

            );

    }

}

/*========================================================
EXPORTACIÓN POR DEFECTO
========================================================*/

export default {

    createInventoryModule,

    getInventoryModule,

    setInventoryTitle,

    setInventoryDescription,
	
	setInventoryPreviewImage,

    clearInventoryPreview,
	

    resetInventoryModule,

    setInventorySlotIcon,

    selectInventorySlot

};