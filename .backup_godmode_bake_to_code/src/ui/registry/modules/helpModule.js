/*
Monteserin Academy

# Help Module

*/

let helpModule = null;

//======================================================
// CREAR MÓDULO
//======================================================

export function createHelpModule(){

    if(helpModule){

        return helpModule;

    }

    helpModule =
        document.createElement("div");

    helpModule.id =
        "helpModule";

    helpModule.className =
        "registryModule";

    //--------------------------------------------------
    // TÍTULO
    //--------------------------------------------------

    const title =
        document.createElement("div");

    title.className =
        "registryModuleTitle";

    title.textContent =
        "Ayuda";

    //--------------------------------------------------
    // CONTENIDO
    //--------------------------------------------------

    const content =
        document.createElement("div");

    content.className =
        "registryModuleContent";

    content.style.padding = "16px";
    content.style.display = "flex";
    content.style.flexDirection = "column";
    content.style.gap = "14px";
    content.style.color = "#e2e8f0";

    content.innerHTML = `
        <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,213,79,0.3);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#ffd54f;">
                <span>🛡️</span>
                <span>Guardado Automático y Puntos Seguros</span>
            </div>
            <p style="margin:0;font-size:0.82rem;line-height:1.45;color:#cbd5e1;">
                Monteserín Academy guarda tu aventura de forma totalmente automática. Además, cada vez que completas con éxito una misión, el juego genera silenciosamente un punto de restauración seguro accesible desde el Menú de Inicio.
            </p>
            <div style="display:flex;gap:10px;margin-top:2px;">
                <button id="btnExitToMenu" style="padding:10px 18px;background:linear-gradient(135deg,rgba(214,176,106,0.25),rgba(180,140,70,0.35));border:1px solid #d6b06a;border-radius:8px;color:#fff;font-weight:700;cursor:pointer;font-size:0.82rem;display:inline-flex;align-items:center;gap:6px;">
                    <span>🏠</span>
                    <span>Volver al Menú Principal</span>
                </button>
            </div>
        </div>

        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;">
            <div style="font-weight:700;color:#cbd5e1;font-size:0.88rem;">🎮 Controles Rápidos</div>
            <ul style="margin:0;padding-left:18px;font-size:0.78rem;line-height:1.6;color:#94a3b8;">
                <li><strong>W, A, S, D / Flechas:</strong> Movimiento del explorador.</li>
                <li><strong>E / Botón Interacción:</strong> Hablar con NPCs, examinar muebles u objetos.</li>
                <li><strong>R / Botón Registro:</strong> Abrir / Cerrar tu morral y credenciales.</li>
            </ul>
        </div>
    `;

    import('../../../systems/saveSystem.js').then(({ saveGame }) => {
        const btnExit = content.querySelector('#btnExitToMenu');
        if (btnExit) {
            btnExit.onclick = () => {
                saveGame();
                window.location.reload();
            };
        }
    });

    helpModule.append(
        title,
        content
    );

    return helpModule;

}

//======================================================
// OBTENER MÓDULO
//======================================================

export function getHelpModule(){

    return helpModule;

}