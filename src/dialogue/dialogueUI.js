import {
    dialogueState
}
from './dialogueState.js';

import {
    lockInput,
    unlockInput
}
from '../systems/inputLockSystem.js';

import {
    initDialogueStage,
    showDialogueStage,
    hideDialogueStage,
    onDialoguePageAdvance,
    isNPCSpeaker
} from './dialogueStage.js';



let root = null;

let header = null;

let portraitContainer = null;

let portraitImage = null;

let speakerLabel = null;

let scrollHintBadge = null;

let body = null;

let textLabel = null;

let footer = null;

let continueButton = null;

let dialogueEntryTimer = null;

// ======================================================
// CREATE UI
// ======================================================

export function createDialogueUI(){

    // ------------------------------------------
    // ROOT
    // ------------------------------------------

    root =
        document.createElement(
            'div'
        );

    root.className =
        'dialogue';

    // Aislar eventos táctiles dentro del cuadro de diálogo
    root.addEventListener('touchstart', (e) => {
        e.stopPropagation();
    }, { passive: true });

    root.addEventListener('touchmove', (e) => {
        e.stopPropagation();
    }, { passive: true });

    root.addEventListener('touchend', (e) => {
        e.stopPropagation();
    }, { passive: true });

    // ------------------------------------------
    // HEADER
    // ------------------------------------------

    header =
        document.createElement(
            'div'
        );

    header.className =
        'dialogue-header';

    // ------------------------------------------
    // PORTRAIT CONTAINER
    // ------------------------------------------

    portraitContainer =
        document.createElement(
            'div'
        );

    portraitContainer.className =
        'dialogue-portrait-container';

    // ------------------------------------------
    // PORTRAIT
    // ------------------------------------------

    portraitImage =
        document.createElement(
            'img'
        );

    portraitImage.className =
        'dialogue-portrait';

    portraitContainer.appendChild(

        portraitImage

    );

    // ------------------------------------------
    // SPEAKER
    // ------------------------------------------

    speakerLabel =
        document.createElement(
            'h3'
        );

    speakerLabel.className =
        'dialogue-speaker';

    header.appendChild(

        portraitContainer

    );

    header.appendChild(

        speakerLabel

    );

    // ------------------------------------------
    // SCROLL HINT BADGE
    // ------------------------------------------

    scrollHintBadge =
        document.createElement(
            'div'
        );

    scrollHintBadge.className =
        'dialogue-scroll-hint';

    scrollHintBadge.innerHTML =
        '<span class="scroll-hint-icon">📜</span> Desliza para leer más <span class="scroll-hint-arrow">↓</span>';

    scrollHintBadge.title =
        'Desliza para ver más texto';

    scrollHintBadge.onclick = () => {
        if(textLabel){
            textLabel.scrollBy({ top: 50, behavior: 'smooth' });
        }
    };

    header.appendChild(

        scrollHintBadge

    );

    // ------------------------------------------
    // BODY
    // ------------------------------------------

    body =
        document.createElement(
            'div'
        );

    body.className =
        'dialogue-body';

    // ------------------------------------------
    // TEXT
    // ------------------------------------------

    textLabel =
        document.createElement(
            'div'
        );

    textLabel.className =
        'dialogue-text';

    textLabel.addEventListener('scroll', checkScrollHint, { passive: true });

    window.addEventListener('resize', () => {
        if(dialogueState.active){
            checkScrollHint();
        }
    });

    body.appendChild(

        textLabel

    );

    // ------------------------------------------
    // FOOTER
    // ------------------------------------------

    footer =
        document.createElement(
            'div'
        );

    footer.className =
        'dialogue-footer';

    // ------------------------------------------
    // BUTTON
    // ------------------------------------------

    continueButton =
        document.createElement(
            'button'
        );

    continueButton.className =
        'dialogue-button';

    continueButton.innerText =
        'Continuar';

    continueButton.onclick =
        nextDialoguePage;

    footer.appendChild(

        continueButton

    );

    // ------------------------------------------
    // APPEND ROOT
    // ------------------------------------------

    root.appendChild(

        header

    );

    root.appendChild(

        body

    );

    root.appendChild(

        footer

    );

    document.body.appendChild(

        root

    );

    root.style.display =
        'none';

    try {
        initDialogueStage();
    } catch (e) {
        console.warn('initDialogueStage deferred:', e);
    }

}

// ======================================================
// SHOW DIALOGUE
// ======================================================

export function showDialogue(

    dialogue

){

    lockInput('dialogue');

    dialogueState.active =
        true;

    dialogueState.currentDialogue =
        dialogue;

    dialogueState.currentPage =
        0;

    if (dialogueEntryTimer) {
        clearTimeout(dialogueEntryTimer);
        dialogueEntryTimer = null;
    }

    let firstSpeaker = dialogue.speaker;
    if (typeof dialogue.speakerByPage === 'function') {
        firstSpeaker = dialogue.speakerByPage(0);
    } else if (Array.isArray(dialogue.speakers) && dialogue.speakers[0]) {
        firstSpeaker = dialogue.speakers[0];
    }

    const isNPC = isNPCSpeaker(firstSpeaker);

    if (isNPC) {
        // ENTRADA DIFERIDA COMBINADA:
        // 1. Ocultar caja de texto inicialmente para dar protagonismo total a la apertura de la cinemática
        root.classList.add('npc-mode');
        root.classList.remove('active-dialogue');
        root.style.display = 'none';

        // 2. Desplegar el escenario cinemático 3D (viñeta periférica + desenfoque + logo)
        try {
            showDialogueStage(firstSpeaker);
        } catch (err) {
            console.error('Error starting dialogue stage for NPC:', err);
        }

        // 3. Pre-renderizar contenido textual de la primera página
        updateDialogue();

        // 4. Lanzar la caja de diálogo SOLO cuando la cinemática ya esté plenamente asentada (~1250ms)
        dialogueEntryTimer = setTimeout(() => {
            if (!dialogueState.active || !root) return;
            root.style.display = 'flex';
            // Forzar reflow para animación ascendente suave
            void root.offsetWidth;
            root.classList.add('active-dialogue');
            checkScrollHint();
        }, 1250);

    } else {
        // Diálogos estándar no cinemáticos
        try {
            hideDialogueStage();
        } catch (_) {}
        root.classList.remove('npc-mode');
        root.style.display = 'flex';
        requestAnimationFrame(() => {
            if (root && dialogueState.active) {
                root.classList.add('active-dialogue');
            }
        });
        updateDialogue();
    }

}

// ======================================================
// SCROLL HINT CHECK
// ======================================================

function checkScrollHint(){

    if(!scrollHintBadge || !textLabel) return;

    // Verificar si el texto desborda la altura visible
    const hasScroll = textLabel.scrollHeight > (textLabel.clientHeight + 4);

    if(!hasScroll){

        scrollHintBadge.style.opacity = '0';
        scrollHintBadge.style.pointerEvents = 'none';
        return;

    }

    // Ocultar si el usuario ya se desplazó casi hasta el final (margen de 8px)
    const isAtBottom = (textLabel.scrollTop + textLabel.clientHeight) >= (textLabel.scrollHeight - 8);

    if(isAtBottom){

        scrollHintBadge.style.opacity = '0';
        scrollHintBadge.style.pointerEvents = 'none';

    }else{

        scrollHintBadge.style.opacity = '1';
        scrollHintBadge.style.pointerEvents = 'auto';

    }

}

// ======================================================
// UPDATE DIALOGUE
// ======================================================

function updateDialogue(){

    const dialogue =

        dialogueState.currentDialogue;

    if(

        !dialogue

    ){

        return;

    }

    // ------------------------------------------
    // SPEAKER & NPC STAGE MODE
    // ------------------------------------------

    let currentSpeaker = dialogue.speaker;
    if (typeof dialogue.speakerByPage === 'function') {
        currentSpeaker = dialogue.speakerByPage(dialogueState.currentPage);
    } else if (Array.isArray(dialogue.speakers) && dialogue.speakers[dialogueState.currentPage]) {
        currentSpeaker = dialogue.speakers[dialogueState.currentPage];
    }

    speakerLabel.innerText =
        currentSpeaker || 'Panda';

    const isNPC = isNPCSpeaker(currentSpeaker);

    if (isNPC) {
        // Opción 1: Reemplazar pantalla de juego por cinemática del modelo 3D del NPC gesticulando en fondo neutro
        root.classList.add('npc-mode');
        // En la caja de diálogo solo aparece el nombre, ocultando el retrato
        portraitContainer.style.display = 'none';

        try {
            showDialogueStage(currentSpeaker);
        } catch (err) {
            console.error('Error starting dialogue stage for NPC:', err);
        }
    } else {
        // Mantener estética estándar original cuando NO sea diálogo de NPC
        try {
            hideDialogueStage();
        } catch (_) {}
        root.classList.remove('npc-mode');

        if (dialogue.portrait) {
            portraitImage.src = dialogue.portrait;
            portraitContainer.style.display = '';
        } else {
            portraitContainer.style.display = 'none';
        }
    }

    // ------------------------------------------
    // TEXT
    // ------------------------------------------

    textLabel.innerText =

        dialogue.pages[

            dialogueState.currentPage

        ];

    textLabel.scrollTop =

        0;

    requestAnimationFrame(() => {
        checkScrollHint();
    });

    // ------------------------------------------
    // BUTTON TEXT
    // ------------------------------------------

    if (continueButton) {
        if (dialogueState.currentPage >= dialogue.pages.length - 1) {
            continueButton.innerText = 'Entendido';
        } else {
            continueButton.innerText = 'Continuar';
        }
    }

    // ------------------------------------------
    // PAGE CHANGE CALLBACK
    // ------------------------------------------

    if (typeof dialogue.onPageChange === 'function') {
        try {
            dialogue.onPageChange(dialogueState.currentPage);
        } catch (e) {
            console.error('Error in dialogue onPageChange:', e);
        }
    }

}

// ======================================================
// NEXT PAGE
// ======================================================

function nextDialoguePage(){

    const dialogue =

        dialogueState.currentDialogue;

    if(

        !dialogue

    ){

        return;

    }

    dialogueState.currentPage++;

    if(

        dialogueState.currentPage >=

        dialogue.pages.length

    ){

        closeDialogue();

        return;

    }

    onDialoguePageAdvance();
    updateDialogue();

}

// ======================================================
// CLOSE DIALOGUE
// ======================================================

export function closeDialogue(){

    if (dialogueEntryTimer) {
        clearTimeout(dialogueEntryTimer);
        dialogueEntryTimer = null;
    }

    unlockInput('dialogue');

    if (root) {
        root.classList.remove('active-dialogue');
    }

    try {
        hideDialogueStage();
    } catch (_) {}

    if(scrollHintBadge){
        scrollHintBadge.style.opacity = '0';
        scrollHintBadge.style.pointerEvents = 'none';
    }

    const finishedDialogue = dialogueState.currentDialogue;

    dialogueState.active =
        false;

    dialogueState.currentDialogue =
        null;

    dialogueState.currentPage =
        0;

    setTimeout(() => {
        if (!dialogueState.active && root) {
            root.style.display = 'none';
            root.classList.remove('npc-mode');
        }
    }, 420);

    if (finishedDialogue && typeof finishedDialogue.onComplete === 'function') {
        try {
            finishedDialogue.onComplete();
        } catch (e) {
            console.error('Error in dialogue onComplete:', e);
        }
    }

}

// ======================================================
// STATUS
// ======================================================

export function isDialogueOpen(){

    return dialogueState.active;

}

// ======================================================
// REFRESH
// ======================================================

export function refreshDialogue(){

    if(

        !dialogueState.active

    ){

        return;

    }

    if(

        !dialogueState.currentDialogue

    ){

        return;

    }

    updateDialogue();

}

