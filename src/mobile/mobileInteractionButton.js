import {

    isMobileDevice

}
from '../utils/deviceDetection.js';

let button = null;
let label = null;
let iconImg = null;

let isVisible = false;
let currentText = '';
let currentType = '';
let onInteractCallback = null;
let lastTriggerTime = 0;

function triggerInteraction() {
    if (!isVisible) return;

    const now = performance.now();
    if (now - lastTriggerTime < 260) return;
    lastTriggerTime = now;

    if (typeof onInteractCallback === 'function') {
        onInteractCallback();
    }
}

function attachTouchAndClickHandlers(el) {
    if (!el) return;

    let activeTouchId = null;
    let startX = 0;
    let startY = 0;

    el.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        if (e.changedTouches && e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            activeTouchId = touch.identifier;
            startX = touch.clientX;
            startY = touch.clientY;
        }
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        e.stopPropagation();
    }, { passive: true });

    el.addEventListener('touchcancel', (e) => {
        e.stopPropagation();
        activeTouchId = null;
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
        e.stopPropagation();

        let isTap = true;
        if (activeTouchId !== null && e.changedTouches) {
            for (const touch of e.changedTouches) {
                if (touch.identifier === activeTouchId) {
                    const dx = touch.clientX - startX;
                    const dy = touch.clientY - startY;
                    isTap = Math.hypot(dx, dy) <= 48;
                    break;
                }
            }
        }
        activeTouchId = null;

        if (!isTap) return;

        if (e.cancelable) {
            e.preventDefault();
        }
        triggerInteraction();
    }, { passive: false });

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerInteraction();
    });
}

export function setMobileInteractionHandler(handler) {
    onInteractCallback = typeof handler === 'function' ? handler : null;
}

export function createMobileInteractionButton(onInteract){

    if (typeof onInteract === 'function') {
        setMobileInteractionHandler(onInteract);
    }

    if (button && label) return;

    button =
        document.createElement('button');

    button.type = 'button';

    button.id =
        'mobileInteractionButton';

    button.innerHTML =
        `<img
            id="mobileInteractionIcon"
            src="./assets/ui/icons/talk.svg"
            width="64"
            height="64"
            alt="Interacción"
            draggable="false"
            style="pointer-events:none; user-select:none; -webkit-user-select:none; -webkit-user-drag:none; display:block;"
        >`;

    iconImg = button.querySelector('#mobileInteractionIcon');

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
            userSelect:'none',
            webkitUserSelect:'none',
            webkitTapHighlightColor:'transparent',
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
            webkitUserSelect:'none',
            webkitTapHighlightColor:'transparent',
            touchAction:'manipulation'
        }
    );

    attachTouchAndClickHandlers(button);
    attachTouchAndClickHandlers(label);

    document.body.appendChild(label);
    document.body.appendChild(button);

    isVisible = false;
    currentText = '';
    currentType = 'talk';

}

export function showMobileInteractionButton(text = '', type = 'talk'){

    if(!button) return;

    if(!isMobileDevice()) return;

    const nextText = text || '';
    const nextType = type || 'talk';

    if (iconImg && nextType !== currentType) {
        if (nextType === 'pickup') {
            iconImg.src = './assets/ui/icons/pickup_hand.svg';
            iconImg.alt = 'Recoger objeto';
        } else if (nextType === 'object') {
            iconImg.src = './assets/ui/icons/interact_object.svg';
            iconImg.alt = 'Examinar objeto';
        } else {
            iconImg.src = './assets/ui/icons/talk.svg';
            iconImg.alt = 'Hablar';
        }
        currentType = nextType;
    }

    if (!isVisible) {
        button.style.display = 'flex';
    }

    if(label){
        if (!isVisible || nextText !== currentText) {
            if(nextText){
                label.textContent = nextText;
                label.style.display = 'block';
            } else {
                label.textContent = '';
                label.style.display = 'none';
            }
            currentText = nextText;
        }
    }

    isVisible = true;

}

export function hideMobileInteractionButton(){

    if(!button) return;

    if(!isVisible && button.style.display === 'none') return;

    isVisible = false;

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