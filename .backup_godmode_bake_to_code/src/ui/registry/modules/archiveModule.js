/* ======================================================
   MONTESERIN ACADEMY - ARCHIVE MODULE
   Gestor de documentos y acreditaciones archivadas
   Diseño horizontal en dos columnas (Lista + Detalle)
   ====================================================== */

import { registryCatalog } from "../registryCatalog.js";
import { openDocumentViewer } from "../../documentViewer.js";
import { gameState } from "../../../state/gameState.js";
import { saveGame } from "../../../systems/saveSystem.js";

let archiveRoot = null;
let archivePanel = null;
let listContainer = null;
let detailContainer = null;

// Lista de documentos archivados
const archivedDocuments = [];
let selectedDocumentId = null;

/* ======================================================
   SINCRONIZACIÓN Y PERSISTENCIA
   ====================================================== */

function syncArchiveToGameState(){
    if (!Array.isArray(gameState.archived)) {
        gameState.archived = [];
    }
    gameState.archived = archivedDocuments.map(doc => doc.id);
    saveGame();
}

export function restoreArchiveFromGameState(){
    archivedDocuments.length = 0;

    // 1. Reconstruir desde gameState.archived si existe
    if (Array.isArray(gameState.archived) && gameState.archived.length > 0) {
        gameState.archived.forEach(id => {
            const doc = registryCatalog[id];
            if (doc && !archivedDocuments.some(d => d.id === doc.id)) {
                archivedDocuments.push(doc);
            }
        });
    }

    // 2. Red de seguridad / Fallback de misiones completadas:
    if (gameState.flags?.deliveredBox || gameState.flags?.receivedAspirantCard) {
        const aspirantCard = registryCatalog['aspirantCard'];
        if (aspirantCard && !archivedDocuments.some(d => d.id === aspirantCard.id)) {
            archivedDocuments.push(aspirantCard);
        }
    }

    if (!Array.isArray(gameState.archived)) {
        gameState.archived = [];
    }
    gameState.archived = archivedDocuments.map(doc => doc.id);

    if (archivedDocuments.length > 0 && !selectedDocumentId) {
        selectedDocumentId = archivedDocuments[0].id;
    }

    if (archiveRoot) {
        updateArchiveContent();
    }
}

/* ======================================================
   API DE ARCHIVO
   ====================================================== */

export function archiveItem(itemId) {
    const item = typeof itemId === "string" ? registryCatalog[itemId] : itemId;
    if (!item) {
        console.warn(`archiveItem: Objeto no encontrado: ${itemId}`);
        return false;
    }

    const alreadyArchived = archivedDocuments.some(doc => doc.id === item.id);
    if (alreadyArchived) {
        return false;
    }

    archivedDocuments.push(item);

    // Si es el primer elemento, seleccionarlo por defecto
    if (!selectedDocumentId) {
        selectedDocumentId = item.id;
    }

    syncArchiveToGameState();
    updateArchiveContent();
    return true;
}

export function hasArchivedItem(itemId) {
    return archivedDocuments.some(doc => doc.id === itemId);
}

export function getArchivedItems() {
    return [...archivedDocuments];
}

/* ======================================================
   CREAR MÓDULO
   ====================================================== */

export function createArchiveModule() {
    if (archiveRoot) {
        return archiveRoot;
    }

    archiveRoot = document.createElement("div");
    archiveRoot.id = "archiveModule";
    archiveRoot.className = "registryModule";

    archivePanel = document.createElement("div");
    archivePanel.id = "archivePanel";

    archiveRoot.appendChild(archivePanel);

    updateArchiveContent();
    return archiveRoot;
}

/* ======================================================
   ACTUALIZAR CONTENIDO DEL ARCHIVO
   ====================================================== */

export function updateArchiveContent() {
    if (!archivePanel) return;

    archivePanel.innerHTML = "";

    // Estado vacío si no hay ningún documento archivado
    if (archivedDocuments.length === 0) {
        const emptyContainer = document.createElement("div");
        emptyContainer.className = "archiveEmptyState";
        emptyContainer.innerHTML = `
            <div class="archiveEmptyIcon">📁</div>
            <div class="archiveEmptyTitle">Sin documentos archivados</div>
            <div class="archiveEmptyText">
                Actualmente no dispones de documentos o fotografías archivadas. 
                Los carnets, acreditaciones y registros oficiales se custodiarán aquí permanentemente.
            </div>
        `;
        archivePanel.appendChild(emptyContainer);
        return;
    }

    // Cabecera del Archivo
    const archiveHeader = document.createElement("div");
    archiveHeader.className = "archiveHeader";

    const title = document.createElement("h2");
    title.className = "archiveMainTitle";
    title.textContent = "Archivo de Documentos";

    const subtitle = document.createElement("p");
    subtitle.className = "archiveSubtitle";
    subtitle.textContent = "Expediente y acreditaciones oficiales archivadas en Monteserín Academy";

    archiveHeader.appendChild(title);
    archiveHeader.appendChild(subtitle);
    archivePanel.appendChild(archiveHeader);

    // Contenedor principal de 2 columnas (apaisado)
    const columnsWrapper = document.createElement("div");
    columnsWrapper.className = "archiveColumnsWrapper";

    // Columna Izquierda: Lista de documentos archivados
    const leftColumn = document.createElement("div");
    leftColumn.className = "archiveLeftColumn";

    const listTitle = document.createElement("div");
    listTitle.className = "archiveColumnHeader";
    listTitle.textContent = "Documentos disponibles";
    leftColumn.appendChild(listTitle);

    listContainer = document.createElement("div");
    listContainer.className = "archiveListContainer styledScrollbar";
    leftColumn.appendChild(listContainer);

    // Columna Derecha: Detalle del documento seleccionado
    detailContainer = document.createElement("div");
    detailContainer.className = "archiveRightColumn styledScrollbar";

    columnsWrapper.appendChild(leftColumn);
    columnsWrapper.appendChild(detailContainer);
    archivePanel.appendChild(columnsWrapper);

    renderDocumentList();
    renderSelectedDocument();
}

/* ======================================================
   RENDERIZAR LISTA IZQUIERDA
   ====================================================== */

function renderDocumentList() {
    if (!listContainer) return;
    listContainer.innerHTML = "";

    archivedDocuments.forEach((doc, index) => {
        const itemEl = document.createElement("div");
        itemEl.className = "archiveListItem";
        if (doc.id === selectedDocumentId || (!selectedDocumentId && index === 0)) {
            itemEl.classList.add("selected");
            selectedDocumentId = doc.id;
        }

        const thumb = document.createElement("img");
        thumb.className = "archiveItemThumb";
        thumb.src = doc.thumbnail || doc.documentImage;
        thumb.alt = doc.title;
        thumb.draggable = false;

        const info = document.createElement("div");
        info.className = "archiveItemMeta";

        const title = document.createElement("div");
        title.className = "archiveItemTitle";
        title.textContent = doc.title;

        const tag = document.createElement("span");
        tag.className = "archiveItemBadge";
        tag.textContent = "Archivado";

        info.appendChild(title);
        info.appendChild(tag);

        itemEl.appendChild(thumb);
        itemEl.appendChild(info);

        itemEl.onclick = () => {
            selectedDocumentId = doc.id;
            updateArchiveSelection();
            renderSelectedDocument();
        };

        listContainer.appendChild(itemEl);
    });
}

function updateArchiveSelection() {
    if (!listContainer) return;
    const items = listContainer.querySelectorAll(".archiveListItem");
    items.forEach((itemEl, idx) => {
        const doc = archivedDocuments[idx];
        if (doc && doc.id === selectedDocumentId) {
            itemEl.classList.add("selected");
        } else {
            itemEl.classList.remove("selected");
        }
    });
}

/* ======================================================
   RENDERIZAR DETALLE DERECHO
   ====================================================== */

function renderSelectedDocument() {
    if (!detailContainer) return;
    detailContainer.innerHTML = "";

    const doc = archivedDocuments.find(d => d.id === selectedDocumentId) || archivedDocuments[0];
    if (!doc) {
        detailContainer.innerHTML = `
            <div class="archiveEmptySelect">Selecciona un documento de la lista para ver sus detalles.</div>
        `;
        return;
    }

    const card = document.createElement("div");
    card.className = "archiveDetailCard";

    // Visualización previa
    const previewWrap = document.createElement("div");
    previewWrap.className = "archivePreviewFrame";
    previewWrap.title = "Haz clic en 'Abrir' para ver a pantalla completa";

    const previewImg = document.createElement("img");
    previewImg.className = "archivePreviewImage";
    previewImg.src = doc.documentImage || doc.thumbnail;
    previewImg.alt = doc.title;
    previewImg.draggable = false;

    previewWrap.appendChild(previewImg);
    card.appendChild(previewWrap);

    // Contenido textual
    const infoWrap = document.createElement("div");
    infoWrap.className = "archiveDetailInfo";

    const titleRow = document.createElement("div");
    titleRow.className = "archiveDetailTitleRow";

    const titleEl = document.createElement("h3");
    titleEl.className = "archiveDetailTitle";
    titleEl.textContent = doc.title;

    const badgeEl = document.createElement("span");
    badgeEl.className = "archiveOfficialBadge";
    badgeEl.textContent = "Documento Oficial";

    titleRow.appendChild(titleEl);
    titleRow.appendChild(badgeEl);
    infoWrap.appendChild(titleRow);

    const descEl = document.createElement("p");
    descEl.className = "archiveDetailDesc";
    descEl.textContent = doc.description;
    infoWrap.appendChild(descEl);

    // Barra de acciones: Abrir y Descargar
    const actionsRow = document.createElement("div");
    actionsRow.className = "archiveDetailActions";

    const openBtn = document.createElement("button");
    openBtn.className = "archiveBtn archiveBtnOpen";
    openBtn.innerHTML = `<span>👁️ Abrir</span>`;
    openBtn.title = "Abrir documento a pantalla completa";
    openBtn.onclick = () => {
        openDocumentViewer(doc.documentImage || doc.thumbnail, doc.title);
    };

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "archiveBtn archiveBtnDownload";
    downloadBtn.innerHTML = `<span>📥 Descargar</span>`;
    downloadBtn.title = "Descargar carnet al dispositivo";
    downloadBtn.onclick = () => {
        triggerDeviceDownload(doc.documentImage || doc.thumbnail, doc.downloadFilename || "Carnet_Aspirante_Monteserin.jpg");
    };

    actionsRow.appendChild(openBtn);
    actionsRow.appendChild(downloadBtn);
    infoWrap.appendChild(actionsRow);

    card.appendChild(infoWrap);
    detailContainer.appendChild(card);
}

/* ======================================================
   DESCARGA DIRECTA AL DISPOSITIVO (PC / MÓVIL)
   ====================================================== */

function triggerDeviceDownload(fileUrl, fileName) {
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = fileName;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
