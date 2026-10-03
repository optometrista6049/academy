import {
    dialogueState
}
from './dialogueState.js';

import {
    lockInput,
    unlockInput
}
from '../systems/inputLockSystem.js';



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

    root.style.display =
        'flex';

    updateDialogue();

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
    // SPEAKER
    // ------------------------------------------

    let currentSpeaker = dialogue.speaker;
    if (typeof dialogue.speakerByPage === 'function') {
        currentSpeaker = dialogue.speakerByPage(dialogueState.currentPage);
    } else if (Array.isArray(dialogue.speakers) && dialogue.speakers[dialogueState.currentPage]) {
        currentSpeaker = dialogue.speakers[dialogueState.currentPage];
    }

    speakerLabel.innerText =
        currentSpeaker || 'Panda';

    // ------------------------------------------
    // PORTRAIT
    // ------------------------------------------

    if(

        dialogue.portrait

    ){

        portraitImage.src =

            dialogue.portrait;

        portraitContainer.style.display =

            '';

    }

    else{

        portraitContainer.style.display =

            'none';

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

    updateDialogue();

}

// ======================================================
// CLOSE DIALOGUE
// ======================================================

export function closeDialogue(){

    unlockInput('dialogue');

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

    root.style.display =

        'none';

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

