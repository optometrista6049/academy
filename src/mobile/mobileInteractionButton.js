import {

    isMobileDevice

}
from '../utils/deviceDetection.js';

let button = null;
let label = null;

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
            alt="Interacción"
        >`;

    Object.assign(
        button.style,
        {
            position:'fixed',
            right:'20px',
            bottom:'140px',
            width:'80px',
            height:'80px',
            border:'2px solid rgba(214, 176, 106, 0.4)',
            background:'rgba(0,0,0,0.65)',
            borderRadius:'50%',
            display:'none',
            zIndex:'15000',
            cursor:'pointer',
            padding:'0',
            outline:'none',
            alignItems:'center',
            justifyContent:'center',
            boxShadow:'0 4px 14px rgba(0,0,0,0.5)',
            touchAction:'manipulation'
        }
    );

    label =
        document.createElement('div');

    label.id =
        'mobileInteractionLabel';

    Object.assign(
        label.style,
        {
            position:'fixed',
            right:'108px',
            bottom:'160px',
            maxWidth:'calc(100vw - 130px)',
            overflow:'hidden',
            textOverflow:'ellipsis',
            background:'rgba(0,0,0,0.85)',
            border:'1.5px solid #d6b06a',
            borderRadius:'12px',
            color:'white',
            padding:'8px 14px',
            fontSize:'14px',
            fontFamily:'Georgia, serif',
            whiteSpace:'nowrap',
            display:'none',
            zIndex:'15000',
            cursor:'pointer',
            boxShadow:'0 4px 12px rgba(0,0,0,0.5)',
            userSelect:'none',
            touchAction:'manipulation'
        }
    );

    label.addEventListener('click', () => {
        if(button) button.click();
    });

    document.body.appendChild(label);
    document.body.appendChild(button);

}

export function showMobileInteractionButton(text = ''){

    if(!button) return;

    if(!isMobileDevice()) return;

    button.style.display =
        'flex';

    if(label){

        if(text){
            label.innerText = text;
            label.style.display = 'block';
        } else {
            label.style.display = 'none';
        }

    }

}

export function hideMobileInteractionButton(){

    if(!button) return;

    button.style.display =
        'none';

    if(label){
        label.style.display =
            'none';
    }

}

export function getMobileInteractionButton(){

    return button;

}