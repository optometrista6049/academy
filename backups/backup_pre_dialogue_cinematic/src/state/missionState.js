// ======================================================
// MISSION STATE
// Estado global de la progresión de misiones
// ======================================================

export const missionState = {

    // ID de la misión actualmente activa
    activeMissionId: null,

    // Estado de la misión activa
    // null | "active" | "completed"
    activeMissionStatus: null,

    // Objetivos de la misión activa
    objectives: {}

};