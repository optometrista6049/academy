/* ======================================================
   MONTESERIN ACADEMY - MASTER DEV SWITCH
   Interruptor único para todas las herramientas de desarrollo:
   - true  -> Activa DevTools [F9], Modo Dios, coordenadas X/Y/Z,
              desbloqueo rápido en descanso y edición en LocalStorage
              (funciona tanto en PC local como en pruebas móviles en GitHub Pages).
   - false -> Versión definitiva para jugadores: desactiva y oculta
              por completo cualquier herramienta de desarrollo y garantiza
              que los jugadores carguen siempre el escenario oficial.
   ====================================================== */

export const DEV_CONFIG = {
    enabled: true
};

/**
 * Indica si estamos ejecutando en una suite de desarrollo/edición local o de AI Studio
 * (con servidor Vite activo y permiso de lectura/escritura de caché de editor en LocalStorage).
 * En despliegues estáticos como GitHub Pages (*.github.io) devuelve false para que el
 * navegador/móvil cargue SIEMPRE el estado oficial del repositorio sin arrastrar cachés viejas
 * del editor, manteniendo DEV_CONFIG.enabled activo para poder usar DevTools [F9] en pruebas.
 */
export function isLocalEditorRuntime() {
    if (!DEV_CONFIG.enabled) return false;
    if (typeof window === 'undefined') return false;
    const host = (window.location?.hostname || '').toLowerCase();
    if (!host) return false;

    if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '[::1]' ||
        host.endsWith('.run.app') ||
        host.endsWith('.usercontent.goog') ||
        host.endsWith('.googleusercontent.com') ||
        window.location?.protocol === 'file:'
    ) {
        return true;
    }

    if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
        return true;
    }

    return false;
}

