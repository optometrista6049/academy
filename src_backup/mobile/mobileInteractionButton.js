import {

    isMobileDevice

}
from '../utils/deviceDetection.js';

let button = null;

export function createMobileInteractionButton(){

    button =
        document.createElement('button');

    button.id =
        'mobileInteractionButton';

    button.innerHTML =

        `<img
            src="./assets/ui/icons/talk.svg"
            width="64"
            height="64"
        >`;

    Object.assign(

        button.style,

        {

            position:'fixed',

            right:'20px',

            bottom:'140px',

            width:'80px',

            height:'80px',

            border:'none',

            background:'rgba(0,0,0,0.55)',

            borderRadius:'50%',

            display:'none',

            zIndex:'15000'

        }

    );

    document.body.appendChild(
        button
    );

}

export function showMobileInteractionButton(){

    if(!button) return;

    if(!isMobileDevice()) return;

    button.style.display =
        'block';

}

export function hideMobileInteractionButton(){

    if(!button) return;

    button.style.display =
        'none';

}

export function getMobileInteractionButton(){

    return button;

}