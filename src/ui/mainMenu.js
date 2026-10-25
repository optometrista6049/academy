import {
    hasSave,
    loadGame,
    deleteSave,
    hasMissionCheckpoint,
    loadMissionCheckpoint,
    getMissionCheckpointInfo
} from '../systems/saveSystem.js';

import {
    createControlsScreen
} from './controlsScreen.js';

import {
    createCreditsScreen
} from './creditsScreen.js';

import {
    showLoadingScreen
} from './loadingScreen.js';

import {
    sessionBattery,
    isCooldownActive,
    showRestOverlay,
    resetSessionBatteryForNewGame
} from '../systems/sessionBatterySystem.js';

export function createMainMenu(onStart) {
    const root = document.createElement('div');
    root.id = 'mainMenu';
    root.className = 'mainMenuContainer';
    // Garantizar carga directa e instantánea del fondo original de Monteserín Academy
    root.style.backgroundColor = '#090e18';
    root.style.backgroundImage = 'url(./assets/ui/mainmenu.jpg)';
    root.style.backgroundSize = 'cover';
    root.style.backgroundPosition = 'center center';
    root.style.backgroundRepeat = 'no-repeat';

    // Contenedor de Botones en 2 Columnas (limpio, sin caja translúcida ni textos que tapen el fondo)
    const menuCard = document.createElement('div');
    menuCard.className = 'mainMenuCard';

    // Grid de 2 Columnas
    const grid = document.createElement('div');
    grid.className = 'mainMenu2ColGrid';

    // Columna Izquierda: Acciones de Partida
    const colLeft = document.createElement('div');
    colLeft.className = 'mainMenuCol';

    // Columna Derecha: Controles y Créditos
    const colRight = document.createElement('div');
    colRight.className = 'mainMenuCol';

    grid.appendChild(colLeft);
    grid.appendChild(colRight);
    menuCard.appendChild(grid);
    root.appendChild(menuCard);

    // ======================================================
    // PANELES DE CONTROLES Y CRÉDITOS (EN DOCUMENT.BODY PARA MÁXIMA PRIORIDAD Z-INDEX)
    // ======================================================
    const controlsPanel = createControlsScreen();
    const creditsPanel = createCreditsScreen();
    document.body.appendChild(controlsPanel);
    document.body.appendChild(creditsPanel);

    // ======================================================
    // MODAL DE TOOLTIP INFORMATIVO CON CIERRE
    // ======================================================
    function showOptionInfoTooltip({ title, icon = 'ℹ️', description, statusHtml = '' }) {
        const overlay = document.createElement('div');
        overlay.className = 'mainMenuTooltipOverlay';

        const card = document.createElement('div');
        card.className = 'mainMenuTooltipCard';

        card.innerHTML = `
            <div class="mainMenuTooltipHeader">
                <div class="mainMenuTooltipTitle">
                    <span style="font-size:1.3rem;">${icon}</span>
                    <span>${title}</span>
                </div>
                <button class="mainMenuTooltipCloseBtn" title="Cerrar (Esc)">✕</button>
            </div>
            <div class="mainMenuTooltipBody">
                <div>${description}</div>
                ${statusHtml ? `<div class="mainMenuTooltipStatusBox">${statusHtml}</div>` : ''}
            </div>
            <div class="mainMenuTooltipFooter">
                <button class="mainMenuTooltipActionClose">Entendido 👍</button>
            </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        const close = () => {
            overlay.remove();
            document.removeEventListener('keydown', onKeyDown);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') close();
        };

        document.addEventListener('keydown', onKeyDown);
        card.querySelector('.mainMenuTooltipCloseBtn').onclick = close;
        card.querySelector('.mainMenuTooltipActionClose').onclick = close;
        overlay.onclick = (e) => {
            if (e.target === overlay) close();
        };
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
            border: '1.5px solid rgba(16, 185, 129, 0.55)',
            boxShadow: '0 12px 36px rgba(0,0,0,0.85), 0 0 24px rgba(16, 185, 129, 0.25)',
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
            <h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#34d399;text-transform:uppercase;letter-spacing:1px;">
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
                <button id="confirmCheckpointBtn" style="flex:1;padding:12px;background:linear-gradient(180deg,#059669,#047857);border:1px solid #10b981;color:#fff;border-radius:8px;cursor:pointer;font-weight:700;box-shadow:0 4px 14px rgba(5,150,105,0.4);">
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

    // Helper para crear una fila de botón con su icono táctil de información
    function createMenuRow({
        text,
        subtext = '',
        isCheckpoint = false,
        onClick,
        infoData
    }) {
        const row = document.createElement('div');
        row.className = 'mainMenuItemRow';

        const actionBtn = document.createElement('button');
        actionBtn.className = `mainMenuActionBtn ${isCheckpoint ? 'btnCheckpoint' : ''}`;
        actionBtn.innerHTML = `
            <span>${text}</span>
            ${subtext ? `<span class="mainMenuBtnSubtext">${subtext}</span>` : ''}
        `;
        actionBtn.onclick = onClick;

        const infoBtn = document.createElement('button');
        infoBtn.className = 'mainMenuInfoBtn';
        infoBtn.title = `Toca para ver información sobre ${text}`;
        infoBtn.setAttribute('aria-label', `Información de ${text}`);
        infoBtn.innerHTML = `
            <span class="mainMenuInfoHandIcon">👆</span>
            <span class="mainMenuInfoLabel">INFO</span>
        `;
        infoBtn.onclick = (e) => {
            e.stopPropagation();
            showOptionInfoTooltip(infoData);
        };

        row.appendChild(actionBtn);
        row.appendChild(infoBtn);
        return { row, actionBtn, infoBtn };
    }

    const cleanupMenu = () => {
        try { controlsPanel.remove(); } catch (_) {}
        try { creditsPanel.remove(); } catch (_) {}
        try { root.remove(); } catch (_) {}
    };

    // ======================================================
    // 1. CONTINUAR EXPERIENCIA (COLUMNA IZQUIERDA)
    // ======================================================
    const continueItem = createMenuRow({
        text: 'CONTINUAR EXPERIENCIA',
        onClick: () => {
            if (sessionBattery.enabled && isCooldownActive()) {
                showRestOverlay();
                return;
            }
            showLoadingScreen();
            loadGame();
            cleanupMenu();
            setTimeout(() => {
                onStart();
            }, 50);
        },
        infoData: {
            title: 'Continuar Experiencia',
            icon: '▶️',
            description: 'Reanuda tu aventura exactamente donde la dejaste en tu última sesión.',
            statusHtml: '💾 Carga la posición exacta de tu explorador, los objetos en el morral y el progreso en tiempo real de tu partida activa.'
        }
    });

    if (!hasSave()) {
        continueItem.row.style.display = 'none';
    }
    colLeft.appendChild(continueItem.row);

    // ======================================================
    // 2. RETOMAR ÚLTIMA MISIÓN (PUNTO SEGURO 100% COMPLETADA)
    // ======================================================
    const cpInfo = getMissionCheckpointInfo();
    const cpSubtext = cpInfo?.missionTitle ? `Punto seguro: ${cpInfo.missionTitle}` : '';

    const resumeMissionItem = createMenuRow({
        text: 'RETOMAR ÚLTIMA MISIÓN',
        subtext: cpSubtext,
        isCheckpoint: true,
        onClick: () => {
            if (sessionBattery.enabled && isCooldownActive()) {
                showRestOverlay();
                return;
            }
            showCheckpointConfirmModal(() => {
                showLoadingScreen();
                loadMissionCheckpoint();
                cleanupMenu();
                setTimeout(() => {
                    onStart();
                }, 50);
            });
        },
        infoData: {
            title: 'Retomar Última Misión',
            icon: '🛡️',
            description: 'Restaura el estado seguro registrado al completar al 100% tu última misión.',
            statusHtml: cpInfo
                ? `<strong>Misión guardada:</strong> ${cpInfo.missionTitle}<br><strong>Fecha de guardado:</strong> ${cpInfo.dateFormatted || 'Reciente'}<br><br>💡 Diseñado como red de seguridad ante errores de sincronización o bloqueos sin perder todo tu progreso general.`
                : 'No se detecta ningún punto de control de misión completada todavía.'
        }
    });

    if (!hasMissionCheckpoint()) {
        resumeMissionItem.row.style.display = 'none';
    }
    colLeft.appendChild(resumeMissionItem.row);

    // ======================================================
    // 3. NUEVA EXPERIENCIA (COLUMNA IZQUIERDA)
    // ======================================================
    const newItem = createMenuRow({
        text: 'NUEVA EXPERIENCIA',
        onClick: () => {
            resetSessionBatteryForNewGame();
            showLoadingScreen();
            deleteSave();
            cleanupMenu();
            setTimeout(() => {
                onStart();
            }, 50);
        },
        infoData: {
            title: 'Nueva Experiencia',
            icon: '✨',
            description: 'Comienza una aventura totalmente nueva desde el inicio en Monteserín Academy.',
            statusHtml: '⚠️ <strong>Atención:</strong> Iniciar una nueva experiencia reiniciará tu inventario, tus carnets archivados y las misiones desde el principio.'
        }
    });
    colLeft.appendChild(newItem.row);

    // ======================================================
    // 4. CONTROLES (COLUMNA DERECHA)
    // ======================================================
    const controlsItem = createMenuRow({
        text: 'CONTROLES',
        onClick: () => {
            controlsPanel.style.display = 'block';
        },
        infoData: {
            title: 'Guía de Controles',
            icon: '🎮',
            description: 'Consulta los botones de movimiento, salto, carrera, interacción y morral de inventario.',
            statusHtml: '📱 En móvil dispones de joystick virtual y botones táctiles ergonómicos.<br>💻 En ordenador puedes usar teclado (WASD / Flechas, Espacio, Shift, E e I).'
        }
    });
    colRight.appendChild(controlsItem.row);

    // ======================================================
    // 5. CRÉDITOS (COLUMNA DERECHA)
    // ======================================================
    const creditsItem = createMenuRow({
        text: 'CRÉDITOS',
        onClick: () => {
            creditsPanel.style.display = 'block';
        },
        infoData: {
            title: 'Créditos y Reconocimientos',
            icon: '📜',
            description: 'Conoce al equipo detrás de la aventura educativa Monteserín Academy.',
            statusHtml: '🌟 Diseño pedagógico, arte 3D, paisajes interactivos, música diegética y programación.'
        }
    });
    colRight.appendChild(creditsItem.row);

    document.body.appendChild(root);
}