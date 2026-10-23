import {
    hasSave,
    loadGame,
    deleteSave,
    hasMissionCheckpoint,
    loadMissionCheckpoint,
    getMissionCheckpointInfo
}
from '../systems/saveSystem.js';

import {
    createControlsScreen
}
from './controlsScreen.js';

import {
    createCreditsScreen
}
from './creditsScreen.js';

import {
    showLoadingScreen
}
from './loadingScreen.js';

import {
    sessionBattery,
    isCooldownActive,
    showRestOverlay
}
from '../systems/sessionBatterySystem.js';

export function createMainMenu(onStart){

    const root =
        document.createElement('div');

    root.id = 'mainMenu';

    Object.assign(
        root.style,
        {
            position:'fixed',
            inset:'0',
            background:
                'url(assets/ui/mainmenu.jpg)',
            backgroundSize:'cover',
            backgroundPosition:'center',
            display:'flex',
            flexDirection:'column',
            justifyContent:'center',
            alignItems:'center',
            gap:'20px',
            zIndex:'9999'
        }
    );

    function createButton(text){
        const btn =
            document.createElement('button');

        btn.innerText = text;

        Object.assign(
            btn.style,
            {
                width:'320px',
                padding:'16px',
                fontSize:'17px',
                fontWeight:'600',
                borderRadius:'12px',
                border:'1px solid rgba(255,255,255,0.15)',
                cursor:'pointer',
                background:
                    'rgba(0,0,0,0.68)',
                color:'white',
                backdropFilter:'blur(6px)',
                transition:'transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease'
            }
        );

        btn.onmouseenter = () => {
            btn.style.transform = 'scale(1.02)';
            btn.style.boxShadow = '0 6px 20px rgba(0,0,0,0.6)';
        };
        btn.onmouseleave = () => {
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = 'none';
        };

        return btn;
    }

    // Modal de confirmación para retomar misión
    function showCheckpointConfirmModal(onConfirm) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '100000',
            padding: '16px'
        });

        const info = getMissionCheckpointInfo();
        const missionName = info?.missionTitle || 'Última Misión Guardada';
        const dateStr = info?.dateFormatted ? ` (${info.dateFormatted})` : '';

        const card = document.createElement('div');
        Object.assign(card.style, {
            background: 'linear-gradient(160deg, rgba(15, 23, 42, 0.98), rgba(9, 14, 26, 0.98))',
            border: '1.5px solid rgba(56, 189, 248, 0.5)',
            boxShadow: '0 12px 36px rgba(0,0,0,0.85), 0 0 24px rgba(56, 189, 248, 0.25)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '420px',
            width: '90%',
            textAlign: 'center',
            color: '#f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
        });

        card.innerHTML = `
            <div style="font-size:2rem;line-height:1;">🛡️</div>
            <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;">
                Retomar Última Misión
            </h3>
            <p style="margin:0;font-size:0.88rem;line-height:1.5;color:#cbd5e1;">
                ¿Deseas restaurar la partida al punto de control seguro de <strong>"${missionName}"</strong>${dateStr}?
            </p>
            <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px;font-size:0.78rem;color:#94a3b8;line-height:1.4;">
                ℹ️ Esta opción restablece tu inventario, posición segura y pasos para solucionar cualquier error de sincronización sin tener que reiniciar todo el juego.
            </div>
            <div style="display:flex;gap:10px;justify-content:center;margin-top:6px;">
                <button id="cancelCheckpointBtn" style="flex:1;padding:12px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#e2e8f0;border-radius:8px;cursor:pointer;font-weight:600;">
                    Cancelar
                </button>
                <button id="confirmCheckpointBtn" style="flex:1;padding:12px;background:linear-gradient(180deg,#0284c7,#0369a1);border:1px solid #38bdf8;color:#fff;border-radius:8px;cursor:pointer;font-weight:700;box-shadow:0 4px 14px rgba(2,132,199,0.4);">
                    Retomar Misión
                </button>
            </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        card.querySelector('#cancelCheckpointBtn').onclick = () => overlay.remove();
        card.querySelector('#confirmCheckpointBtn').onclick = () => {
            overlay.remove();
            onConfirm();
        };
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };
    }

    // =========================
    // CONTINUAR
    // =========================

    const btnContinue =
        createButton(
            'CONTINUAR EXPERIENCIA'
        );

    if(!hasSave()){

        btnContinue.style.display =
            'none';

    }

    btnContinue.onclick = ()=>{

        if(sessionBattery.enabled && isCooldownActive()){
            showRestOverlay();
            return;
        }

        showLoadingScreen();

        loadGame();

        root.remove();

        setTimeout(()=>{

            onStart();

        },50);

    };

    // =========================
    // RETOMAR ÚLTIMA MISIÓN (CHECKPOINT SEGURO)
    // =========================

    const btnResumeMission =
        createButton(
            'RETOMAR ÚLTIMA MISIÓN'
        );

    btnResumeMission.style.background = 'linear-gradient(135deg, rgba(20, 38, 66, 0.82) 0%, rgba(10, 20, 38, 0.9) 100%)';
    btnResumeMission.style.border = '1px solid rgba(56, 189, 248, 0.45)';
    btnResumeMission.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 10px rgba(56, 189, 248, 0.15)';

    const cpInfo = getMissionCheckpointInfo();
    if (cpInfo && cpInfo.missionTitle) {
        const sub = document.createElement('div');
        sub.style.fontSize = '11px';
        sub.style.color = '#38bdf8';
        sub.style.marginTop = '4px';
        sub.style.fontWeight = 'normal';
        sub.innerText = `Punto seguro: ${cpInfo.missionTitle}`;
        btnResumeMission.appendChild(sub);
    }

    if (!hasMissionCheckpoint()) {
        btnResumeMission.style.display = 'none';
    }

    btnResumeMission.onclick = () => {
        if(sessionBattery.enabled && isCooldownActive()){
            showRestOverlay();
            return;
        }

        showCheckpointConfirmModal(() => {
            showLoadingScreen();
            loadMissionCheckpoint();
            root.remove();
            setTimeout(() => {
                onStart();
            }, 50);
        });
    };

    // =========================
    // NUEVA PARTIDA
    // =========================

    const btnNew =
        createButton(
            'NUEVA EXPERIENCIA'
        );

    btnNew.onclick = ()=>{

        if(sessionBattery.enabled && isCooldownActive()){
            showRestOverlay();
            return;
        }

        showLoadingScreen();

        deleteSave();

        root.remove();

        setTimeout(()=>{

            onStart();

        },50);

    };

    // =========================
    // PANELES
    // =========================

    const controlsPanel =
        createControlsScreen();

    const creditsPanel =
        createCreditsScreen();

    // =========================
    // CONTROLES
    // =========================

    const btnControls =
        createButton(
            'CONTROLES'
        );

    btnControls.onclick = ()=>{

        controlsPanel.style.display =
            'block';

    };

    // =========================
    // CREDITOS
    // =========================

    const btnCredits =
        createButton(
            'CRÉDITOS'
        );

    btnCredits.onclick = ()=>{

        creditsPanel.style.display =
            'block';

    };

    // =========================
    // APPEND
    // =========================

    root.appendChild(
        btnContinue
    );

    root.appendChild(
        btnResumeMission
    );

    root.appendChild(
        btnNew
    );

    root.appendChild(
        btnControls
    );

    root.appendChild(
        btnCredits
    );

    root.appendChild(
        controlsPanel
    );

    root.appendChild(
        creditsPanel
    );

    document.body.appendChild(
        root
    );

}