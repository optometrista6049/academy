/*
Monteserin Academy

Registro
========================================================
*/

import {
    lockInput,
    unlockInput
} from "../../systems/inputLockSystem.js";

import {
    gameState
} from "../../state/gameState.js";

import {
    initializeRegistryModules,
    showRegistrySection,
    resetRegistryModulesVisualState
} from "./registryModuleConnector.js";

let initialized = false;

let isOpen = false;

let activeSection = 0;

let registryRoot = null;

let registryHeaderIcon = null;

let registryNav = null;

let registryContent = null;

let registryBase = null;

let registryButton = null;

let registryTabs = [];

const registrySections = [

    "Inventario",

    "Archivo",

    "Diario",

    "Ayuda"

];

//======================================================
// CREAR UI
//======================================================

export function createRegistryUI(){

    if(initialized){

        return;

    }

    initialized = true;

    registryRoot = document.createElement("div");

    registryRoot.id = "registry";

    registryRoot.hidden = true;

    //--------------------------------------------------
    // CABECERA
    //--------------------------------------------------

    registryHeaderIcon = document.createElement("img");

    registryHeaderIcon.id = "registryHeaderIcon";

    registryHeaderIcon.src =
        "./assets/ui/register/registerButton.png";

    registryHeaderIcon.alt = "Registro";

    registryHeaderIcon.draggable = false;

    registryRoot.appendChild(
        registryHeaderIcon
    );

    //--------------------------------------------------
    // NAVEGACIÓN
    //--------------------------------------------------

    registryNav = document.createElement("div");

    registryNav.id = "registryNav";

    registryTabs.length = 0;

registrySections.forEach((section,index)=>{

    const tab =
        document.createElement("button");

    tab.className =
        "registryTab";

    tab.dataset.section =
        index;

   //--------------------------------------------------
// TECLA
//--------------------------------------------------

const shortcut =
    document.createElement("img");

shortcut.className =
    "registryTabShortcut";

shortcut.alt =
    `Shortcut ${index + 1}`;

shortcut.draggable = false;

switch(index){

    case 0:

        shortcut.src =
            "./assets/ui/register/keys/key_1.svg";

        break;

    case 1:

        shortcut.src =
            "./assets/ui/register/keys/key_2.svg";

        break;

    case 2:

        shortcut.src =
            "./assets/ui/register/keys/key_3.svg";

        break;

    case 3:

        shortcut.src =
            "./assets/ui/register/keys/key_4.svg";

        break;

}

    //--------------------------------------------------
    // ICONO
    //--------------------------------------------------

    const icon =
        document.createElement("img");

    icon.className =
        "registryTabIcon";

    icon.alt =
        section;

    icon.draggable = false;

    switch(index){

        case 0:

            icon.src =
                "./assets/ui/register/icons/inventory.svg";

            break;

        case 1:

            icon.src =
                "./assets/ui/register/icons/archive.svg";

            break;

        case 2:

            icon.src =
                "./assets/ui/register/icons/diary.svg";

            break;

        case 3:

            icon.src =
                "./assets/ui/register/icons/help.svg";

            break;

    }

    //--------------------------------------------------
    // TEXTO
    //--------------------------------------------------

    const title =
        document.createElement("span");

    title.className =
        "registryTabTitle";

    title.textContent =
        section;

    //--------------------------------------------------
    // CONSTRUIR BOTÓN
    //--------------------------------------------------

    tab.appendChild(shortcut);

    tab.appendChild(icon);

    tab.appendChild(title);

    registryTabs.push(tab);

    registryNav.appendChild(tab);

});

    registryRoot.appendChild(
        registryNav
    );

    //--------------------------------------------------
    // CONTENIDO
    //--------------------------------------------------

    registryContent =
        document.createElement("div");

    registryContent.id =
        "registryContent";

    registryRoot.appendChild(
        registryContent
    );

    document.body.appendChild(
        registryRoot
    );

    //--------------------------------------------------
    // MÓDULOS
    //--------------------------------------------------

    initializeRegistryModules(
        registryContent
    );


    createRegistryButton();

    registerEvents();

    updateRegistryTabs();

}
//======================================================
// ESTADO
//======================================================

export function isRegistryOpen(){

    return isOpen;

}

//======================================================
// APERTURA
//======================================================

export function openRegistry(){

    if(!gameState.flags.registryUnlocked){

        return;

    }

    if(isOpen){

        return;

    }

    if(spotlightTimer){

        clearTimeout(spotlightTimer);

        spotlightTimer = null;

    }

    dismissRegistryAttentionPulse();

    if(registryBase){

        registryBase.classList.remove("registry-spotlight");

    }

    if(registryButton){

        registryButton.classList.remove("registry-spotlight");

        registryButton.classList.remove("registry-attention-pulse");

    }

    isOpen = true;

    lockInput("registry");

    registryRoot.hidden = false;

    //--------------------------------------------------
    // SIEMPRE ABRIMOS EN INVENTARIO
    //--------------------------------------------------

    activeSection = 0;

    updateRegistryTabs();

    resetRegistryModulesVisualState();

    showRegistrySection(
       activeSection
    );

}

//======================================================
// CIERRE
//======================================================

export function closeRegistry(){

    if(!isOpen){

        return;

    }

    isOpen = false;

    unlockInput("registry");

    registryRoot.hidden = true;

}

//======================================================
// TOGGLE
//======================================================

export function toggleRegistry(){

    if(!gameState.flags.registryUnlocked){

        return;

    }

    if(isOpen){

        closeRegistry();

    }

    else{

        openRegistry();

    }

}

//======================================================
// BOTÓN REGISTRO
//======================================================

function createRegistryButton(){

    registryBase =

        document.createElement("div");

    registryBase.id =

        "registryBase";

    if(!gameState.flags.registryUnlocked){

        registryBase.style.display = "none";

    }

    document.body.appendChild(

        registryBase

    );

    registryButton =

        document.createElement("img");

    registryButton.id =

        "registryButton";

    registryButton.src =

        "./assets/ui/register/registerButton.png";

    registryButton.alt =

        "Registro";

    registryButton.draggable = false;

    if(!gameState.flags.registryUnlocked){

        registryButton.style.display = "none";

    }

    document.body.appendChild(

        registryButton

    );

}

let spotlightTimer = null;
let attentionPulseTimer = null;

export function dismissRegistryAttentionPulse(){
    if(attentionPulseTimer){
        clearTimeout(attentionPulseTimer);
        attentionPulseTimer = null;
    }
    if(registryButton){
        registryButton.classList.remove("registry-attention-pulse");
    }
}

export function dismissRegistrySpotlight(){

    if(spotlightTimer){

        clearTimeout(spotlightTimer);

        spotlightTimer = null;

    }

    if(registryBase){

        registryBase.classList.remove("registry-spotlight");

    }

    if(registryButton){

        registryButton.classList.remove("registry-spotlight");

    }

}

/**
 * Dispara una pulsación dorada de absorción cuando un objeto vuela hacia el Registro.
 */
export function triggerRegistryIntakeEffect(){
    if(!registryButton) return;
    registryButton.classList.remove("registry-intake-pulse");
    void registryButton.offsetWidth; // Forzar reflow para reiniciar animación
    registryButton.classList.add("registry-intake-pulse");
    setTimeout(() => {
        if(registryButton){
            registryButton.classList.remove("registry-intake-pulse");
        }
    }, 1300);
}

//======================================================
// DESBLOQUEO DE REGISTRO
//======================================================

export function unlockRegistry(){

    gameState.flags.registryUnlocked = true;

    if(!registryBase || !registryButton) return;

    if(registryBase.style.display === "none" || registryButton.style.display === "none"){

        registryBase.style.display = "";
        registryButton.style.display = "";

        registryBase.classList.remove("registry-unlocked-reveal", "registry-spotlight");
        registryButton.classList.remove("registry-unlocked-reveal", "registry-spotlight", "registry-attention-pulse");

        void registryBase.offsetWidth;
        void registryButton.offsetWidth;

        registryBase.classList.add("registry-unlocked-reveal", "registry-spotlight");
        registryButton.classList.add("registry-unlocked-reveal", "registry-attention-pulse", "registry-spotlight");

        if(spotlightTimer){

            clearTimeout(spotlightTimer);

        }

        spotlightTimer = setTimeout(() => {

            dismissRegistrySpotlight();

        }, 3800);

        // Si el jugador no interactúa con el registro en 15 segundos, el destello dorado desaparece suavemente
        if(attentionPulseTimer){

            clearTimeout(attentionPulseTimer);

        }

        attentionPulseTimer = setTimeout(() => {

            dismissRegistryAttentionPulse();

        }, 15000);

    }

}

export function isRegistryUnlocked(){

    return Boolean(gameState.flags.registryUnlocked);

}

//======================================================
// ACTUALIZAR PESTAÑAS
//======================================================

function updateRegistryTabs(){

    registryTabs.forEach(

        (tab,index)=>{

            tab.classList.toggle(

                "active",

                index===activeSection

            );

        }

    );

}
//======================================================
// REGISTRAR EVENTOS
//======================================================

function registerEvents(){

    //--------------------------------------------------
    // TECLADO
    //--------------------------------------------------

    document.addEventListener(

        "keydown",

        onKeyDown

    );

    //--------------------------------------------------
    // BOTÓN REGISTRO
    //--------------------------------------------------

    registryButton.addEventListener(

        "click",

        onButtonClick

    );

    //--------------------------------------------------
    // PESTAÑAS
    //--------------------------------------------------

    registryTabs.forEach(

        (tab,index)=>{

            tab.addEventListener(

                "click",

                ()=>{

                    if(!isOpen){

                        return;

                    }

                    activeSection = index;

                    updateRegistryTabs();

                    showRegistrySection(

                        activeSection

                    );

                }

            );

        }

    );

}

//======================================================
// TECLADO
//======================================================

function onKeyDown(event){

    if(event.repeat){

        return;

    }

    //--------------------------------------------------
    // ABRIR / CERRAR REGISTRO
    //--------------------------------------------------

    if(

        event.key==="r"

        ||

        event.key==="R"

    ){

        if(!gameState.flags.registryUnlocked){

            return;

        }

        toggleRegistry();

        return;

    }

    //--------------------------------------------------
    // ATAJOS SOLO SI ESTÁ ABIERTO
    //--------------------------------------------------

    if(!isOpen){

        return;

    }

    switch(event.key){

        case "1":

            activeSection = 0;

            break;

        case "2":

            activeSection = 1;

            break;

        case "3":

            activeSection = 2;

            break;

        case "4":

            activeSection = 3;

            break;

        default:

            return;

    }

    updateRegistryTabs();

    showRegistrySection(

        activeSection

    );

}

//======================================================
// BOTÓN REGISTRO
//======================================================

function onButtonClick(){

    if(!gameState.flags.registryUnlocked){

        return;

    }

    toggleRegistry();

}
