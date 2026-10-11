/*
Monteserin Academy
# Diary Module
========================================================
*/

import { gameState } from "../../../state/gameState.js";
import { hasInventoryItem } from "./inventoryModuleV2.js";

let diaryModule = null;
let diaryListContainer = null;

//======================================================
// CREAR MÓDULO
//======================================================

export function createDiaryModule(){

    if(diaryModule){

        return diaryModule;

    }

    diaryModule = document.createElement("div");

    diaryModule.id = "diaryModule";

    diaryModule.className = "registryModule";

    //--------------------------------------------------
    // CONTENEDOR PRINCIPAL
    //--------------------------------------------------

    const diaryHeader = document.createElement("div");
    diaryHeader.className = "diaryHeader";

    const title = document.createElement("h2");
    title.className = "diaryTitle";
    title.textContent = "Diario de Misiones";

    const subtitle = document.createElement("p");
    subtitle.className = "diarySubtitle";
    subtitle.textContent = "Registro y seguimiento de tus objetivos en Monteserín Academy";

    diaryHeader.appendChild(title);
    diaryHeader.appendChild(subtitle);

    diaryListContainer = document.createElement("div");
    diaryListContainer.className = "diaryListContainer";

    diaryModule.appendChild(diaryHeader);
    diaryModule.appendChild(diaryListContainer);

    updateDiaryContent();

    return diaryModule;

}

//======================================================
// ACTUALIZAR CONTENIDO DEL DIARIO
//======================================================

export function updateDiaryContent(){

    if(!diaryListContainer) return;

    diaryListContainer.innerHTML = "";

    // Si aún no se ha hablado con Monty
    if(!gameState.flags.metPanda && !gameState.flags.hasFurnitureKey){

        const emptyCard = document.createElement("div");
        emptyCard.className = "diaryEmptyCard";
        emptyCard.innerHTML = `
            <div class="diaryEmptyIcon">📜</div>
            <div class="diaryEmptyTitle">Sin misiones activas</div>
            <div class="diaryEmptyText">Explora el entorno y habla con el personal de la academia para recibir tu primera tarea como Aspirante.</div>
        `;
        diaryListContainer.appendChild(emptyCard);
        return;

    }

    // Misión 1
    const missionCard = document.createElement("div");
    missionCard.className = "diaryMissionCard";

    const isMissionComplete = Boolean(gameState.flags.deliveredBox);
    const hasBox = hasInventoryItem('badgeBox');
    const openedMueble = Boolean(gameState.flags.openedMueble) || hasBox || isMissionComplete;

    missionCard.innerHTML = `
        <div class="diaryMissionTop">
            <span class="diaryMissionBadge ${isMissionComplete ? 'completed' : 'active'}">
                ${isMissionComplete ? 'COMPLETADA' : 'EN CURSO'}
            </span>
            <h3 class="diaryMissionTitle">Misión 1: Los preparativos de la Academia</h3>
        </div>
        <p class="diaryMissionDesc">
            Como nuevo aspirante a IA de Monteserín Academy, ayuda a Monty con los preparativos iniciales de la institución.
        </p>
        <div class="diaryObjectivesList">
            <div class="diaryObjectiveItem completed">
                <span class="diaryObjectiveStatus">✅</span>
                <span class="diaryObjectiveText">Presentarse ante Monty y registrarse como aspirante.</span>
            </div>
            <div class="diaryObjectiveItem ${openedMueble ? 'completed' : 'active'}">
                <span class="diaryObjectiveStatus">${openedMueble ? '✅' : '⏳'}</span>
                <span class="diaryObjectiveText">
                    ${openedMueble 
                        ? 'Caja de cartón recuperada del mueble.' 
                        : 'Abrir el mueble con la llave y recoger la caja de cartón.'}
                </span>
            </div>
            <div class="diaryObjectiveItem ${isMissionComplete ? 'completed' : (hasBox ? 'active' : 'locked')}">
                <span class="diaryObjectiveStatus">${isMissionComplete ? '✅' : (hasBox ? '⏳' : '🔒')}</span>
                <span class="diaryObjectiveText">
                    ${isMissionComplete 
                        ? 'Caja de cartón entregada a Monty.' 
                        : (hasBox ? 'Llevar la caja de cartón a Monty.' : 'Entregar la caja de cartón a Monty.')}
                </span>
            </div>
        </div>
    `;

    diaryListContainer.appendChild(missionCard);

}

//======================================================
// OBTENER MÓDULO
//======================================================

export function getDiaryModule(){

    return diaryModule;

}
