// ======================================================
// INVENTORY MODULE V2
// Arquitectura limpia - Versión inicial
// ======================================================

import { registryCatalog } from "../registryCatalog.js";
import { openDocumentViewer } from "../../documentViewer.js";
import { archiveItem, hasArchivedItem } from "./archiveModule.js";
import { gameState } from "../../../state/gameState.js";
import { saveGame } from "../../../systems/saveSystem.js";

let inventoryModule;

let inventoryCells = [];

// ======================================================
// ESTADO REAL DEL INVENTARIO
// ======================================================

const inventoryObjects = [];

// ======================================================
// OBJETO ACTUALMENTE SELECCIONADO
// ======================================================

let selectedObject = null;


// ======================================================
// SINCRONIZACIÓN Y PERSISTENCIA
// ======================================================

function syncInventoryToGameState(){
    if (!Array.isArray(gameState.inventory)) {
        gameState.inventory = [];
    }
    gameState.inventory = inventoryObjects.map(item => item.id);
    saveGame();
}

export function restoreInventoryFromGameState(){
    inventoryObjects.length = 0;

    // 1. Reconstruir desde gameState.inventory si existe
    if (Array.isArray(gameState.inventory) && gameState.inventory.length > 0) {
        gameState.inventory.forEach(id => {
            const item = registryCatalog[id];
            if (item && !inventoryObjects.some(it => it.id === item.id)) {
                inventoryObjects.push(item);
            }
        });
    }

    // 2. Red de seguridad / Fallback de misiones completadas:
    if (gameState.flags?.deliveredBox || gameState.flags?.receivedAspirantCard) {
        const aspirantCardItem = registryCatalog['aspirantCard'];
        if (aspirantCardItem && !inventoryObjects.some(it => it.id === aspirantCardItem.id)) {
            inventoryObjects.push(aspirantCardItem);
        }
    }

    if (gameState.flags?.hasFurnitureKey && !gameState.flags?.drawerOpened) {
        const keyItem = registryCatalog['badgeKey'];
        if (keyItem && !inventoryObjects.some(it => it.id === keyItem.id)) {
            inventoryObjects.push(keyItem);
        }
    }

    if (gameState.flags?.drawerOpened && !gameState.flags?.deliveredBox) {
        const boxItem = registryCatalog['badgeBox'];
        if (boxItem && !inventoryObjects.some(it => it.id === boxItem.id)) {
            inventoryObjects.push(boxItem);
        }
    }

    if (!Array.isArray(gameState.inventory)) {
        gameState.inventory = [];
    }
    gameState.inventory = inventoryObjects.map(item => item.id);

    if (inventoryModule) {
        refreshGrid();
    }
}

// ======================================================
// API DEL INVENTARIO
// ======================================================

export function addInventoryItem(itemId){

    const item = registryCatalog[itemId];

    if(!item){

        console.warn(
            `Objeto no encontrado en registryCatalog: ${itemId}`
        );

        return false;

    }

    if(inventoryObjects.some(it => it.id === item.id)){

        return false;

    }

    if(inventoryObjects.length >= 20){

        console.warn(
            "El inventario está lleno."
        );

        return false;

    }

    inventoryObjects.push(item);

    syncInventoryToGameState();

    refreshGrid();

    return true;

}


export function removeInventoryItem(itemId){

    const index =
        inventoryObjects.findIndex(
            item => item.id === itemId
        );

    if(index === -1){

        return false;

    }

    const removedItem =
        inventoryObjects.splice(index,1)[0];

    if(selectedObject === removedItem){

        selectedObject = null;

        initializeInfoPanel();

    }

    syncInventoryToGameState();

    refreshGrid();

    return true;

}


export function hasInventoryItem(itemId){

    return inventoryObjects.some(
        item => item.id === itemId
    );

}


export function getInventoryItems(){

    return [...inventoryObjects];

}

let previewImage;
let previewTitle;
let description;
let actions;
let inventoryNotice = null;
let noticeTimer = null;

export function showInventoryNotice(text) {
    if (!inventoryNotice) return;
    inventoryNotice.textContent = text;
    inventoryNotice.style.opacity = "1";
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
        if (inventoryNotice) {
            inventoryNotice.style.opacity = "0";
        }
    }, 3500);
}

export function createInventoryModuleV2() {

    inventoryModule = document.createElement("section");
    inventoryModule.id = "inventoryModule";

    buildLayout();

    initializeInfoPanel();

    return inventoryModule;
}

// ======================================================
// MUESTRA UN OBJETO DEL REGISTRO EN EL PANEL DERECHO
// ======================================================

function showRegistryObject(objectData){

    //-------------------------------------------------
    // Miniatura
    //-------------------------------------------------

    previewImage.style.backgroundImage =
        `url(${objectData.thumbnail})`;

    previewImage.style.backgroundSize = "contain";

    previewImage.style.backgroundRepeat = "no-repeat";

    previewImage.style.backgroundPosition = "center";

    //-------------------------------------------------
    // Nombre
    //-------------------------------------------------

    previewTitle.textContent = objectData.title;

    //-------------------------------------------------
    // Descripción
    //-------------------------------------------------

    description.textContent = objectData.description;

    //-------------------------------------------------
    // Botones
    //-------------------------------------------------

    actions.style.display = "flex";

    openButton.style.display =
        objectData.canOpen ? "block" : "none";

    saveButton.style.display =
        objectData.canArchive ? "block" : "none";

}

function buildLayout(){

    const body = document.createElement("div");
    body.id = "inventoryBody";

    const gridPanel = document.createElement("section");
    gridPanel.id = "inventoryGridPanel";

    const slots = document.createElement("div");
    slots.id = "inventorySlots";

for (let i = 0; i < 20; i++) {

    const cell = document.createElement("div");

    cell.dataset.slot = i;

    //-------------------------------------------------
    // Selección del objeto representado
    //-------------------------------------------------

    cell.addEventListener("click", () => {

    selectObject(cell.inventoryObject);

    });

    //-------------------------------------------------
    // ¿Existe un objeto en esta posición?
    //-------------------------------------------------

    const object = inventoryObjects[i];

    if(object){

        cell.className = "inventoryCell occupied";

        const icon = document.createElement("img");

        icon.src = object.thumbnail;

        icon.alt = object.title;

        icon.draggable = false;

        cell.appendChild(icon);

    }else{

        cell.className = "inventoryCell empty";

    }
	
    inventoryCells.push(cell);
    slots.appendChild(cell);

}

    const infoPanel = document.createElement("section");
    infoPanel.id = "inventoryInfoPanel";

    gridPanel.appendChild(slots);
	
	// ======================================================
// CABECERA
// ======================================================

const previewHeader = document.createElement("div");
previewHeader.id = "inventoryPreviewHeader";

// Miniatura

previewImage = document.createElement("div");
previewImage.id = "inventoryPreviewImage";

// Nombre

previewTitle = document.createElement("div");
previewTitle.id = "inventoryPreviewTitle";


previewHeader.appendChild(previewImage);
previewHeader.appendChild(previewTitle);

// ======================================================
// DESCRIPCIÓN
// ======================================================

description = document.createElement("div");
description.id = "inventoryDescription";


// ======================================================
// ACCIONES
// ======================================================

actions = document.createElement("div");
actions.id = "inventoryActions";

const openButton = document.createElement("button");
openButton.id = "inventoryOpenButton";
openButton.textContent = "Abrir";
openButton.onclick = () => {
    if (selectedObject && (selectedObject.canOpen || selectedObject.documentImage)) {
        openDocumentViewer(selectedObject.documentImage || selectedObject.thumbnail, selectedObject.title);
    }
};

const saveButton = document.createElement("button");
saveButton.id = "inventorySaveButton";
saveButton.textContent = "Archivar";
saveButton.onclick = () => {
    if (!selectedObject) return;
    if (hasArchivedItem(selectedObject.id) || selectedObject.isArchived) {
        showInventoryNotice("Este objeto ya se encuentra archivado en tu Registro.");
    } else {
        archiveItem(selectedObject.id);
        showInventoryNotice("Documento archivado con éxito en el Registro.");
    }
};

actions.appendChild(openButton);
actions.appendChild(saveButton);

// Mensaje de feedback para acciones (ej. aviso de ya archivado)
inventoryNotice = document.createElement("div");
inventoryNotice.id = "inventoryNotice";
inventoryNotice.className = "inventoryNotice";

// ======================================================
// ENSAMBLAJE
// ======================================================

// ======================================================
// CONTENEDOR INTERNO DEL PANEL DERECHO
// (misma filosofía que los diálogos)
// ======================================================

const infoContent = document.createElement("div");
infoContent.id = "inventoryInfoContent";

// ======================================================
// ENSAMBLAJE DEL PANEL DERECHO
// ======================================================

infoContent.appendChild(previewHeader);
infoContent.appendChild(description);
infoContent.appendChild(actions);
infoContent.appendChild(inventoryNotice);

infoPanel.appendChild(infoContent);

// ======================================================
// ENSAMBLAJE GENERAL
// ======================================================

body.appendChild(gridPanel);
body.appendChild(infoPanel);

inventoryModule.appendChild(body);

refreshGrid();

}

// ======================================================
// ESTADO INICIAL PANEL DERECHO
// ======================================================
function initializeInfoPanel(){

    // ------------------------------------------
    // Miniatura
    // ------------------------------------------

    previewImage.style.backgroundImage = "";

    // ------------------------------------------
    // Título
    // ------------------------------------------

    previewTitle.textContent =
        "Selecciona un objeto";

    // ------------------------------------------
    // Descripción
    // ------------------------------------------

    description.textContent =
        "Selecciona un objeto del inventario para ver su información.";

    // ------------------------------------------
    // Acciones
    // ------------------------------------------

    showActions(false);

    if (inventoryNotice) {
        inventoryNotice.textContent = "";
        inventoryNotice.style.opacity = "0";
    }

}

// ======================================================
// LIMPIAR SELECCIÓN
// ======================================================
function clearSelection(){

    selectedObject = null;

    initializeInfoPanel();

    refreshGrid();

}

// ======================================================
// SELECCIONAR OBJETO
// ======================================================
function selectObject(object){

    //-------------------------------------------------
    // Si pulsamos sobre un hueco vacío
    //-------------------------------------------------

if(!object){

    clearSelection();

    return;

}

    //-------------------------------------------------
    // Si pulsamos el mismo objeto, se deselecciona
    //-------------------------------------------------

if(selectedObject === object){

    clearSelection();

    return;

}

    //-------------------------------------------------
    // Nueva selección
    //-------------------------------------------------

    selectedObject = object;

    //-------------------------------------------------
    // Mostrar información
    //-------------------------------------------------

    displayItem(object);

    //-------------------------------------------------
    // Actualizar grid
    //-------------------------------------------------

    refreshGrid();

}


// ======================================================
// ACTUALIZAR GRID
// ======================================================

function refreshGrid(){

    for(let i = 0; i < inventoryCells.length; i++){

        const cell = inventoryCells[i];
        const object = inventoryObjects[i];
		
    //-------------------------------------------------
    // Asociar el objeto a la casilla
    //-------------------------------------------------
		cell.inventoryObject = object ?? null;

        //-------------------------------------------------
        // Limpiar contenido anterior
        //-------------------------------------------------

        cell.innerHTML = "";

        //-------------------------------------------------
        // Estado vacío
        //-------------------------------------------------

        if(!object){

            cell.className = "inventoryCell empty";

            continue;

        }

        //-------------------------------------------------
        // Estado ocupado
        //-------------------------------------------------

        cell.className = "inventoryCell occupied";

        //-------------------------------------------------
        // Estado seleccionado
        //-------------------------------------------------

        if(selectedObject === object){

            cell.classList.add("selected");

        }

        //-------------------------------------------------
        // Miniatura
        //-------------------------------------------------

        const icon = document.createElement("img");

        icon.src = object.thumbnail;

        icon.alt = object.title;

        icon.draggable = false;

        cell.appendChild(icon);

    }

}
// ======================================================
// MOSTRAR DOCUMENTO
// ======================================================

function displayDocument(documentData){

    setPreviewImage(documentData.image);

    setPreviewTitle(documentData.title);

    setDescription(documentData.description);

    showActions(true);

}

// ======================================================
// MOSTRAR OBJETO NORMAL
// ======================================================
function displayItem(itemData){

    if(!itemData){

        initializeInfoPanel();

        return;

    }

    //-------------------------------------------------
    // Miniatura
    //-------------------------------------------------

    setPreviewImage(itemData.thumbnail);

    //-------------------------------------------------
    // Nombre
    //-------------------------------------------------

    setPreviewTitle(itemData.title);

    //-------------------------------------------------
    // Descripción
    //-------------------------------------------------

    setDescription(itemData.description);

    //-------------------------------------------------
    // Acciones (Abrir y Archivar)
    //-------------------------------------------------

    const canOpen = Boolean(itemData.canOpen);
    const canArchive = Boolean(itemData.canArchive);

    const openBtn = document.getElementById("inventoryOpenButton");
    const saveBtn = document.getElementById("inventorySaveButton");

    if(openBtn){
        openBtn.style.display = canOpen ? "" : "none";
    }

    if(saveBtn){
        saveBtn.style.display = canArchive ? "" : "none";
        saveBtn.textContent = "Archivar";
    }

    showActions(canOpen || canArchive);

}

// ======================================================
// CAMBIAR MINIATURA
// ======================================================

function setPreviewImage(imageURL){

    if(!imageURL){

        previewImage.style.backgroundImage = "";

        return;

    }

    previewImage.style.backgroundImage =
        `url(${imageURL})`;

    previewImage.style.backgroundSize = "contain";

    previewImage.style.backgroundRepeat = "no-repeat";

    previewImage.style.backgroundPosition = "center";

}

// ======================================================
// CAMBIAR NOMBRE
// ======================================================

function setPreviewTitle(text){

    previewTitle.textContent = text || "";

}

// ======================================================
// CAMBIAR DESCRIPCIÓN
// ======================================================

function setDescription(text){

    description.textContent = text || "";

}

// ======================================================
// MOSTRAR / OCULTAR ACCIONES
// ======================================================

function showActions(show){

    actions.style.display =
        show ? "flex" : "none";

}

// ======================================================
// REINICIAR ESTADO VISUAL
// ======================================================
export function resetInventoryVisualState(){
    clearSelection();
}


