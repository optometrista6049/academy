// ======================================================
// INVENTORY MODULE V2
// Arquitectura limpia - Versión inicial
// ======================================================

import { registryCatalog } from "../registryCatalog.js";
import { openDocumentViewer } from "../../documentViewer.js";
import { archiveItem, hasArchivedItem } from "./archiveModule.js";
import { gameState } from "../../../state/gameState.js";
import { saveGame } from "../../../systems/saveSystem.js";
import {
    playerEquipment,
    equipItem,
    unequipItem,
    createProceduralItem
} from "../../../player/playerEquipment.js";
import { getCustomItemById } from "../../../systems/customItemStorage.js";

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

function ensureInventoryStructures() {
    if (!Array.isArray(gameState.inventory)) {
        gameState.inventory = [];
    }
    if (!gameState.itemCounts || typeof gameState.itemCounts !== 'object') {
        gameState.itemCounts = {};
    }
    if (!gameState.equipped || typeof gameState.equipped !== 'object') {
        gameState.equipped = {
            rightHand: null,
            leftHand: null,
            back: null,
            head: null
        };
    }
}

function syncInventoryToGameState(shouldSave = true){
    ensureInventoryStructures();
    gameState.inventory = inventoryObjects.map(item => item.id);
    if (shouldSave) {
        saveGame();
    }
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
    const isDelivered = Boolean(gameState.flags?.deliveredBox || gameState.flags?.receivedAspirantCard);
    const isOpened = Boolean(gameState.flags?.openedMueble || gameState.flags?.drawerOpened);
    const hasKeyFlag = Boolean(gameState.flags?.hasFurnitureKey);

    if (isDelivered) {
        const aspirantCardItem = registryCatalog['aspirantCard'];
        if (aspirantCardItem && !inventoryObjects.some(it => it.id === aspirantCardItem.id)) {
            inventoryObjects.push(aspirantCardItem);
        }
    }

    if (hasKeyFlag && !isOpened) {
        const keyItem = registryCatalog['furnitureKey'] || registryCatalog['badgeKey'];
        if (keyItem && !inventoryObjects.some(it => it.id === keyItem.id)) {
            inventoryObjects.push(keyItem);
        }
    }

    if (isOpened && !isDelivered) {
        const boxItem = registryCatalog['badgeBox'];
        if (boxItem && !inventoryObjects.some(it => it.id === boxItem.id)) {
            inventoryObjects.push(boxItem);
        }
    }

    if (gameState.flags?.altoScannedCard) {
        const detectorItem = registryCatalog['metalDetector'];
        if (detectorItem && !inventoryObjects.some(it => it.id === detectorItem.id)) {
            inventoryObjects.push(detectorItem);
        }
    }

    if (
        gameState.flags?.altoScannedCard &&
        !gameState.flags?.deliveredMicrochips &&
        Array.isArray(gameState.flags?.collectedMicrochips) &&
        gameState.flags.collectedMicrochips.length > 0
    ) {
        const chipItem = registryCatalog['microchip'];
        const collectedCount = Math.min(7, gameState.flags.collectedMicrochips.length);
        if (chipItem) {
            if (!inventoryObjects.some(it => it.id === chipItem.id)) {
                inventoryObjects.push(chipItem);
            }
            ensureInventoryStructures();
            const storedCount = Number(gameState.itemCounts.microchip || 0);
            if (storedCount < collectedCount) {
                gameState.itemCounts.microchip = collectedCount;
            }
        }
    }

    if (gameState.flags?.deliveredMicrochips) {
        ['visualHygieneDoc', 'timeControlDoc'].forEach((docId) => {
            const docItem = registryCatalog[docId];
            if (docItem && !inventoryObjects.some(it => it.id === docItem.id)) {
                inventoryObjects.push(docItem);
            }
        });
    }

    ensureInventoryStructures();
    gameState.inventory = inventoryObjects.map(item => item.id);

    if (inventoryModule) {
        refreshGrid();
        if (selectedObject && !inventoryObjects.some(it => it.id === selectedObject.id)) {
            clearSelection();
        } else if (selectedObject) {
            displayItem(selectedObject);
        }
    }
}

// ======================================================
// EQUIPO (EQUIPAR / DESEQUIPAR)
// ======================================================

export function isItemEquipped(itemId) {
    const item = registryCatalog[itemId];
    if (!item || !item.canEquip) return false;
    const socket = item.equipSocket || 'rightHand';
    return gameState.equipped?.[socket] === itemId;
}

function attachEquippedMeshToPlayer(item) {
    if (!item || !playerEquipment.initialized) return false;
    const socket = item.equipSocket || 'rightHand';
    const customId = item.customItemId || item.proceduralType || item.id;
    const customData = item.customItemId ? getCustomItemById(item.customItemId) : null;
    const mesh = createProceduralItem(customId);
    const transform = customData?.transform || item.equipTransform || {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: customData?.scale ?? 1.0
    };
    return equipItem(socket, mesh, transform);
}

export function equipInventoryItem(itemId, { silent = false } = {}) {
    const item = registryCatalog[itemId];
    if (!item || !item.canEquip || !hasInventoryItem(itemId)) {
        return false;
    }

    ensureInventoryStructures();
    const socket = item.equipSocket || 'rightHand';
    gameState.equipped[socket] = item.id;

    if (playerEquipment.initialized) {
        attachEquippedMeshToPlayer(item);
    }

    saveGame();
    if (inventoryModule) {
        refreshGrid();
        if (selectedObject?.id === item.id) {
            displayItem(selectedObject);
        }
    }
    if (!silent) {
        showInventoryNotice(`${item.title} equipado.`);
    }
    return true;
}

export function unequipInventoryItem(itemId, { silent = false } = {}) {
    const item = registryCatalog[itemId];
    if (!item || !item.canEquip) {
        return false;
    }

    ensureInventoryStructures();
    const socket = item.equipSocket || 'rightHand';
    if (gameState.equipped[socket] === item.id) {
        gameState.equipped[socket] = null;
    }

    if (playerEquipment.initialized) {
        unequipItem(socket);
    }

    saveGame();
    if (inventoryModule) {
        refreshGrid();
        if (selectedObject?.id === item.id) {
            displayItem(selectedObject);
        }
    }
    if (!silent) {
        showInventoryNotice(`${item.title} guardado en el inventario.`);
    }
    return true;
}

export function restoreEquippedItemsFromGameState() {
    ensureInventoryStructures();
    const sockets = ['rightHand', 'leftHand', 'back', 'head'];
    sockets.forEach((socket) => {
        const equippedId = gameState.equipped?.[socket];
        if (equippedId && hasInventoryItem(equippedId)) {
            const item = registryCatalog[equippedId];
            if (item && item.canEquip) {
                attachEquippedMeshToPlayer(item);
                return;
            }
        }
        if (equippedId && !hasInventoryItem(equippedId)) {
            gameState.equipped[socket] = null;
        }
        if (playerEquipment.initialized && playerEquipment.equipped?.[socket]) {
            unequipItem(socket);
        }
    });
    if (inventoryModule) {
        refreshGrid();
        if (selectedObject) {
            displayItem(selectedObject);
        }
    }
}

// ======================================================
// API DEL INVENTARIO
// ======================================================

export function getInventoryItemCount(itemId) {
    const item = registryCatalog[itemId];
    const exists = inventoryObjects.some(it => it.id === itemId);
    if (!exists) return 0;
    if (item?.stackable) {
        const stored = Number(gameState.itemCounts?.[itemId]);
        return Number.isFinite(stored) && stored > 0 ? stored : 1;
    }
    return 1;
}

export function addInventoryItem(itemId, amount = 1){

    const item = registryCatalog[itemId];

    if(!item){

        console.warn(
            `Objeto no encontrado en registryCatalog: ${itemId}`
        );

        return false;

    }

    ensureInventoryStructures();
    const addQty = Math.max(1, Number(amount) || 1);
    const alreadyExists = inventoryObjects.some(it => it.id === item.id);

    if(alreadyExists){
        if (item.stackable) {
            const maxStack = item.maxStack || 99;
            const current = getInventoryItemCount(item.id);
            const next = Math.min(maxStack, current + addQty);
            if (next === current) {
                return false;
            }
            gameState.itemCounts[item.id] = next;
            syncInventoryToGameState();
            refreshGrid();
            if (selectedObject?.id === item.id) {
                displayItem(selectedObject);
            }
            return true;
        }
        return false;
    }

    if(inventoryObjects.length >= 20){

        console.warn(
            "El inventario está lleno."
        );

        return false;

    }

    inventoryObjects.push(item);

    if (item.stackable) {
        const maxStack = item.maxStack || 99;
        gameState.itemCounts[item.id] = Math.min(maxStack, addQty);
    }

    syncInventoryToGameState();

    refreshGrid();

    return true;

}


export function removeInventoryItem(itemId, amount = null){

    const index =
        inventoryObjects.findIndex(
            item => item.id === itemId
        );

    if(index === -1){

        return false;

    }

    const item = inventoryObjects[index];
    ensureInventoryStructures();

    if (amount !== null && item.stackable) {
        const current = getInventoryItemCount(itemId);
        const remaining = current - Math.max(1, Number(amount) || 1);
        if (remaining > 0) {
            gameState.itemCounts[itemId] = remaining;
            syncInventoryToGameState();
            refreshGrid();
            if (selectedObject?.id === itemId) {
                displayItem(selectedObject);
            }
            return true;
        }
    }

    const removedItem =
        inventoryObjects.splice(index,1)[0];

    if (gameState.itemCounts && itemId in gameState.itemCounts) {
        delete gameState.itemCounts[itemId];
    }

    if (isItemEquipped(itemId)) {
        unequipInventoryItem(itemId, { silent: true });
    }

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

function buildLayout(){

    inventoryCells.length = 0;

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

const equipButton = document.createElement("button");
equipButton.id = "inventoryEquipButton";
equipButton.textContent = "Equipar";
equipButton.onclick = () => {
    if (!selectedObject || !selectedObject.canEquip) return;
    if (isItemEquipped(selectedObject.id)) {
        unequipInventoryItem(selectedObject.id);
    } else {
        equipInventoryItem(selectedObject.id);
    }
};

actions.appendChild(equipButton);
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

    if (!previewImage || !previewTitle || !description) return;

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

        if (object.stackable) {
            const count = getInventoryItemCount(object.id);
            const countBadge = document.createElement("span");
            countBadge.className = "inventoryCountBadge";
            countBadge.textContent = `x${count}`;
            cell.appendChild(countBadge);
        }

        if (object.canEquip && isItemEquipped(object.id)) {
            cell.classList.add("equipped");
            const eqBadge = document.createElement("span");
            eqBadge.className = "inventoryEquippedBadge";
            eqBadge.textContent = "EQ";
            cell.appendChild(eqBadge);
        }

    }

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
    // Nombre (con contador si es apilable)
    //-------------------------------------------------

    if (itemData.stackable) {
        const count = getInventoryItemCount(itemData.id);
        const suffix = itemData.maxStack
            ? ` (${count} / ${itemData.maxStack})`
            : ` (x${count})`;
        setPreviewTitle(`${itemData.title}${suffix}`);
    } else {
        setPreviewTitle(itemData.title);
    }

    //-------------------------------------------------
    // Descripción
    //-------------------------------------------------

    if (itemData.stackable && itemData.maxStack) {
        const count = getInventoryItemCount(itemData.id);
        setDescription(`${itemData.description}\n\nProgreso actual: ${count} / ${itemData.maxStack} recogidos.`);
    } else {
        setDescription(itemData.description);
    }

    //-------------------------------------------------
    // Acciones (Equipar, Abrir y Archivar)
    //-------------------------------------------------

    const canEquip = Boolean(itemData.canEquip);
    const canOpen = Boolean(itemData.canOpen);
    const canArchive = Boolean(itemData.canArchive);

    const equipBtn = document.getElementById("inventoryEquipButton");
    const openBtn = document.getElementById("inventoryOpenButton");
    const saveBtn = document.getElementById("inventorySaveButton");

    if(equipBtn){
        equipBtn.style.display = canEquip ? "" : "none";
        if (canEquip) {
            const equipped = isItemEquipped(itemData.id);
            equipBtn.textContent = equipped ? "Desequipar" : "Equipar";
            equipBtn.classList.toggle("equippedActive", equipped);
        } else {
            equipBtn.classList.remove("equippedActive");
        }
    }

    if(openBtn){
        openBtn.style.display = canOpen ? "" : "none";
    }

    if(saveBtn){
        saveBtn.style.display = canArchive ? "" : "none";
        saveBtn.textContent = "Archivar";
    }

    showActions(canEquip || canOpen || canArchive);

}

// ======================================================
// CAMBIAR MINIATURA
// ======================================================

function setPreviewImage(imageURL){

    if (!previewImage) return;

    if(!imageURL){

        previewImage.style.backgroundImage = "";

        return;

    }

    previewImage.style.backgroundImage =
        `url("${imageURL}")`;

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

    if (!actions) return;

    actions.style.display =
        show ? "flex" : "none";

}

// ======================================================
// REINICIAR ESTADO VISUAL
// ======================================================
export function resetInventoryVisualState(){
    clearSelection();
}


