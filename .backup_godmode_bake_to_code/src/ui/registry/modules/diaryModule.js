/* ======================================================
   MONTESERIN ACADEMY - DIARY MODULE
   Diario de Misiones reestructurado en 2 columnas horizontales:
   - Columna Izquierda: Listado vertical de misiones con scroll
   - Columna Derecha: Avance y detalle de la misión seleccionada
   - Selección por defecto en la misión activa / en curso
   ====================================================== */

import { gameState } from "../../../state/gameState.js";
import { hasInventoryItem } from "./inventoryModuleV2.js";

let diaryRoot = null;
let diaryPanel = null;
let missionsListContainer = null;
let missionDetailContainer = null;

let selectedMissionId = null;

/* ======================================================
   CREAR MÓDULO
   ====================================================== */

export function createDiaryModule() {
    if (diaryRoot) {
        return diaryRoot;
    }

    diaryRoot = document.createElement("div");
    diaryRoot.id = "diaryModule";
    diaryRoot.className = "registryModule";

    diaryPanel = document.createElement("div");
    diaryPanel.id = "diaryPanel";

    diaryRoot.appendChild(diaryPanel);

    updateDiaryContent();

    return diaryRoot;
}

/* ======================================================
   OBTENER DATOS DE LAS MISIONES
   ====================================================== */

function getMissionsList() {
    // Si aún no se ha interactuado con Monty
    if (!gameState.flags.metPanda && !gameState.flags.hasFurnitureKey) {
        return [];
    }

    const isMissionComplete = Boolean(gameState.flags.deliveredBox);
    const hasBox = hasInventoryItem("badgeBox");
    const openedMueble = Boolean(gameState.flags.openedMueble) || hasBox || isMissionComplete;

    return [
        {
            id: "mission_001",
            title: "Misión 1: Los preparativos de la Academia",
            status: isMissionComplete ? "completed" : "active",
            statusLabel: isMissionComplete ? "COMPLETADA" : "EN CURSO",
            description:
                "Como nuevo aspirante a IA de Monteserín Academy, ayuda a Monty con los preparativos iniciales de la institución.",
            objectives: [
                {
                    title: "Presentarse ante Monty",
                    desc: "Presentarse ante Monty y registrarse como aspirante en la academia.",
                    status: "completed",
                    icon: "✅"
                },
                {
                    title: "Recuperar la caja",
                    desc: openedMueble
                        ? "Caja de cartón recuperada del mueble."
                        : "Abrir el mueble con la llave y recoger la caja de cartón.",
                    status: openedMueble ? "completed" : "active",
                    icon: openedMueble ? "✅" : "⏳"
                },
                {
                    title: "Entregar a Monty y recibir carnet",
                    desc: isMissionComplete
                        ? "Caja entregada a Monty. Carnet de Aspirante recibido y archivado."
                        : (hasBox ? "Llevar la caja de cartón a Monty." : "Entregar la caja de cartón a Monty."),
                    status: isMissionComplete ? "completed" : (hasBox ? "active" : "locked"),
                    icon: isMissionComplete ? "✅" : (hasBox ? "⏳" : "🔒")
                }
            ]
        }
    ];
}

/* ======================================================
   ACTUALIZAR CONTENIDO DEL DIARIO
   ====================================================== */

export function updateDiaryContent() {
    if (!diaryPanel) return;

    diaryPanel.innerHTML = "";

    const missions = getMissionsList();

    // Estado vacío si no hay misiones iniciadas
    if (missions.length === 0) {
        const emptyCard = document.createElement("div");
        emptyCard.className = "diaryEmptyCard";
        emptyCard.innerHTML = `
            <div class="diaryEmptyIcon">📜</div>
            <div class="diaryEmptyTitle">Sin misiones activas</div>
            <div class="diaryEmptyText">
                Explora el entorno y habla con el personal de la academia para recibir tu primera tarea como Aspirante.
            </div>
        `;
        diaryPanel.appendChild(emptyCard);
        return;
    }

    // Cabecera superior
    const header = document.createElement("div");
    header.className = "diaryHeader";

    const title = document.createElement("h2");
    title.className = "diaryTitle";
    title.textContent = "Diario de Misiones";

    const subtitle = document.createElement("p");
    subtitle.className = "diarySubtitle";
    subtitle.textContent = "Registro y seguimiento de tus objetivos en Monteserín Academy";

    header.appendChild(title);
    header.appendChild(subtitle);
    diaryPanel.appendChild(header);

    // Contenedor principal de dos columnas (Landscape 100%)
    const columnsWrapper = document.createElement("div");
    columnsWrapper.className = "diaryColumnsWrapper";

    // Columna Izquierda: Lista de misiones
    const leftColumn = document.createElement("div");
    leftColumn.className = "diaryLeftColumn";

    const listHeader = document.createElement("div");
    listHeader.className = "diaryColumnHeader";
    listHeader.textContent = "Listado de misiones";
    leftColumn.appendChild(listHeader);

    missionsListContainer = document.createElement("div");
    missionsListContainer.className = "diaryListContainer styledScrollbar";
    leftColumn.appendChild(missionsListContainer);

    // Columna Derecha: Detalle de misión
    missionDetailContainer = document.createElement("div");
    missionDetailContainer.className = "diaryRightColumn styledScrollbar";

    columnsWrapper.appendChild(leftColumn);
    columnsWrapper.appendChild(missionDetailContainer);
    diaryPanel.appendChild(columnsWrapper);

    // Selección por defecto: la misión activa / en curso.
    // Si no hay ninguna en curso, seleccionar la última completada.
    const activeMission = missions.find(m => m.status === "active");
    if (activeMission) {
        selectedMissionId = activeMission.id;
    } else if (missions.length > 0) {
        // Si no hay activa o la seleccionada ya no existe, elegir la última
        if (!selectedMissionId || !missions.some(m => m.id === selectedMissionId)) {
            selectedMissionId = missions[missions.length - 1].id;
        }
    }

    renderMissionsList(missions);
    renderSelectedMission(missions);
}

/* ======================================================
   RENDERIZAR LISTA DE MISIONES (COLUMNA IZQUIERDA)
   ====================================================== */

function renderMissionsList(missions) {
    if (!missionsListContainer) return;
    missionsListContainer.innerHTML = "";

    missions.forEach((mission) => {
        const itemEl = document.createElement("div");
        itemEl.className = "diaryListItem";
        if (mission.id === selectedMissionId) {
            itemEl.classList.add("selected");
        }

        const topRow = document.createElement("div");
        topRow.className = "diaryItemTopRow";

        const badge = document.createElement("span");
        badge.className = `diaryMissionBadge ${mission.status}`;
        badge.textContent = mission.statusLabel;

        topRow.appendChild(badge);

        const titleEl = document.createElement("div");
        titleEl.className = "diaryItemTitle";
        titleEl.textContent = mission.title;

        itemEl.appendChild(topRow);
        itemEl.appendChild(titleEl);

        itemEl.onclick = () => {
            selectedMissionId = mission.id;
            updateDiarySelection(missions);
            renderSelectedMission(missions);
        };

        missionsListContainer.appendChild(itemEl);
    });
}

function updateDiarySelection(missions) {
    if (!missionsListContainer) return;
    const items = missionsListContainer.querySelectorAll(".diaryListItem");
    items.forEach((itemEl, idx) => {
        const m = missions[idx];
        if (m && m.id === selectedMissionId) {
            itemEl.classList.add("selected");
        } else {
            itemEl.classList.remove("selected");
        }
    });
}

/* ======================================================
   RENDERIZAR DETALLE DE MISIÓN (COLUMNA DERECHA)
   ====================================================== */

function renderSelectedMission(missions) {
    if (!missionDetailContainer) return;
    missionDetailContainer.innerHTML = "";

    const mission = missions.find(m => m.id === selectedMissionId) || missions[0];
    if (!mission) {
        missionDetailContainer.innerHTML = `
            <div class="diaryEmptySelect">Selecciona una misión de la lista para ver su avance.</div>
        `;
        return;
    }

    const detailCard = document.createElement("div");
    detailCard.className = "diaryDetailCard";

    // Cabecera del detalle
    const topRow = document.createElement("div");
    topRow.className = "diaryDetailTopRow";

    const titleEl = document.createElement("h3");
    titleEl.className = "diaryDetailTitle";
    titleEl.textContent = mission.title;

    const badgeEl = document.createElement("span");
    badgeEl.className = `diaryMissionBadge ${mission.status}`;
    badgeEl.textContent = `ESTADO: ${mission.statusLabel}`;

    topRow.appendChild(titleEl);
    topRow.appendChild(badgeEl);
    detailCard.appendChild(topRow);

    // Descripción
    const descEl = document.createElement("p");
    descEl.className = "diaryDetailDesc";
    descEl.textContent = mission.description;
    detailCard.appendChild(descEl);

    // Lista de objetivos y avance
    const progressHeader = document.createElement("div");
    progressHeader.className = "diaryProgressHeader";
    progressHeader.textContent = "Avance de la misión:";
    detailCard.appendChild(progressHeader);

    const objectivesList = document.createElement("div");
    objectivesList.className = "diaryObjectivesList";

    mission.objectives.forEach(obj => {
        const objItem = document.createElement("div");
        objItem.className = `diaryObjectiveItem ${obj.status}`;

        const statusIcon = document.createElement("span");
        statusIcon.className = "diaryObjectiveStatus";
        statusIcon.textContent = obj.icon;

        const contentWrap = document.createElement("div");
        contentWrap.className = "diaryObjectiveContent";

        const objText = document.createElement("div");
        objText.className = "diaryObjectiveText";
        objText.textContent = obj.desc;

        contentWrap.appendChild(objText);
        objItem.appendChild(statusIcon);
        objItem.appendChild(contentWrap);

        objectivesList.appendChild(objItem);
    });

    detailCard.appendChild(objectivesList);
    missionDetailContainer.appendChild(detailCard);
}

/* ======================================================
   OBTENER MÓDULO
   ====================================================== */

export function getDiaryModule() {
    return diaryRoot;
}
