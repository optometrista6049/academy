import {
    dialogueState
}
from './dialogueState.js';



let root = null;

let header = null;

let portraitContainer = null;

let portraitImage = null;

let speakerLabel = null;

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

    speakerLabel.innerText =

        dialogue.speaker;

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

    dialogueState.active =

        false;

    dialogueState.currentDialogue =

        null;

    dialogueState.currentPage =

        0;

    root.style.display =

        'none';

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

