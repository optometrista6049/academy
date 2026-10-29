/* ======================================================
   MONTESERIN ACADEMY - DEV MODAL DIALOG HELPER
   Diálogo modal interactivo visual para el entorno de depuración.
   Elimina la dependencia de window.confirm() y window.prompt(),
   que los navegadores modernos bloquean dentro de iframes.
   ====================================================== */

export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Muestra un diálogo modal interactivo estilizado integrado en el DOM.
 *
 * @param {Object} options
 * @param {string} options.title Título de la ventana
 * @param {string} options.message Mensaje o descripción (soporta HTML seguro)
 * @param {Object} [options.input] Opcional { value, placeholder } para diálogo con input de texto
 * @param {string} [options.confirmText] Texto del botón de confirmación
 * @param {string} [options.cancelText] Texto del botón de cancelación
 * @param {boolean} [options.isDanger] Si es true, muestra botón rojo de advertencia
 * @param {Function} options.onConfirm Callback al confirmar (recibe el valor del input si existe)
 * @param {Function} [options.onCancel] Callback al cancelar
 */
export function showDevModalDialog({
    title,
    message,
    input = null,
    confirmText = 'Aceptar',
    cancelText = 'Cancelar',
    isDanger = false,
    onConfirm,
    onCancel
}) {
    const prev = document.getElementById('devCustomDialogOverlay');
    if (prev) prev.remove();

    const overlay = document.createElement('div');
    overlay.id = 'devCustomDialogOverlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 9999999;
        background: rgba(5, 10, 8, 0.85);
        backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
    `;

    overlay.innerHTML = `
        <div style="
            background: linear-gradient(145deg, #16241c 0%, #0c1410 100%);
            border: 1.5px solid rgba(212, 175, 55, 0.5);
            box-shadow: 0 16px 45px rgba(0,0,0,0.85), 0 0 25px rgba(212, 175, 55, 0.2);
            border-radius: 12px;
            width: 100%;
            max-width: 440px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            color: #e2e8f0;
            font-family: inherit;
        ">
            <div style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 18px;
                border-bottom: 1px solid rgba(212, 175, 55, 0.25);
                background: rgba(212, 175, 55, 0.08);
            ">
                <span style="font-size: 0.95rem; font-weight: 700; color: #ffd54f; display: flex; align-items: center; gap: 8px;">
                    ${title}
                </span>
                <button id="devDialogCloseX" style="
                    background: transparent;
                    border: none;
                    color: rgba(255,255,255,0.6);
                    font-size: 1.3rem;
                    cursor: pointer;
                    line-height: 1;
                    padding: 0 4px;
                " title="Cerrar">&times;</button>
            </div>

            <div style="padding: 20px 18px; font-size: 0.88rem; line-height: 1.5; color: #cbd5e1;">
                <div>${message}</div>
                ${input ? `
                    <div style="margin-top: 14px;">
                        <input type="text" id="devDialogInputField" value="${escapeHtml(input.value || '')}" placeholder="${escapeHtml(input.placeholder || '')}" style="
                            width: 100%;
                            box-sizing: border-box;
                            padding: 10px 12px;
                            background: rgba(0, 0, 0, 0.55);
                            border: 1.5px solid #10b981;
                            border-radius: 6px;
                            color: #ffffff;
                            font-size: 0.92rem;
                            font-weight: 600;
                            outline: none;
                            box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
                        " />
                    </div>
                ` : ''}
            </div>

            <div style="
                padding: 12px 18px;
                background: rgba(0,0,0,0.3);
                border-top: 1px solid rgba(255,255,255,0.08);
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            ">
                <button id="devDialogCancelBtn" style="
                    padding: 8px 16px;
                    border-radius: 6px;
                    border: 1px solid rgba(255,255,255,0.2);
                    background: rgba(255,255,255,0.06);
                    color: #cbd5e1;
                    font-size: 0.82rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                ">${cancelText}</button>
                <button id="devDialogConfirmBtn" style="
                    padding: 8px 18px;
                    border-radius: 6px;
                    border: 1px solid ${isDanger ? '#ef4444' : '#10b981'};
                    background: ${isDanger ? '#dc2626' : '#10b981'};
                    color: ${isDanger ? '#ffffff' : '#042f1a'};
                    font-size: 0.82rem;
                    font-weight: 700;
                    cursor: pointer;
                    box-shadow: 0 2px 8px ${isDanger ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.3)'};
                    transition: all 0.2s;
                ">${confirmText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const inputField = overlay.querySelector('#devDialogInputField');
    const closeBtn = overlay.querySelector('#devDialogCloseX');
    const cancelBtn = overlay.querySelector('#devDialogCancelBtn');
    const confirmBtn = overlay.querySelector('#devDialogConfirmBtn');

    const closeModal = () => {
        window.removeEventListener('keydown', handleKey);
        overlay.remove();
    };

    const handleConfirm = () => {
        const val = inputField ? inputField.value.trim() : null;
        closeModal();
        if (typeof onConfirm === 'function') {
            onConfirm(val);
        }
    };

    const handleCancel = () => {
        closeModal();
        if (typeof onCancel === 'function') {
            onCancel();
        }
    };

    const handleKey = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        } else if (e.key === 'Enter' && (!e.target || e.target.tagName !== 'TEXTAREA')) {
            e.preventDefault();
            handleConfirm();
        }
    };

    window.addEventListener('keydown', handleKey);
    overlay.onclick = (e) => {
        if (e.target === overlay) handleCancel();
    };
    if (closeBtn) closeBtn.onclick = handleCancel;
    if (cancelBtn) cancelBtn.onclick = handleCancel;
    if (confirmBtn) confirmBtn.onclick = handleConfirm;

    if (inputField) {
        setTimeout(() => {
            inputField.focus();
            inputField.select();
        }, 50);
    }
}
