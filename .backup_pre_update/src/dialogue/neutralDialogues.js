import { gameState } from '../state/gameState.js';
import { altoNeutralDialogues } from './dialogues/altoNeutral.js';
import { pandaNeutralDialogues } from './dialogues/pandaNeutral.js';
import { telerinNeutralDialogues } from './dialogues/telerinNeutral.js';
import { teleronNeutralDialogues } from './dialogues/teleronNeutral.js';

export const neutralDialoguesByNPC = {
    panda: pandaNeutralDialogues,
    monty: pandaNeutralDialogues,
    alto: altoNeutralDialogues,
    telerin: telerinNeutralDialogues,
    teleron: teleronNeutralDialogues
};

/**
 * Ensures dialogueIndices is properly initialized in gameState.
 */
function ensureDialogueIndices() {
    if (!gameState.dialogueIndices || typeof gameState.dialogueIndices !== 'object') {
        gameState.dialogueIndices = {
            panda: 0,
            alto: 0,
            telerin: 0,
            teleron: 0
        };
    }
}

/**
 * Gets the next neutral dialogue sequentially for a given NPC.
 * Increments the index in gameState so it is persisted and loops continuously.
 * @param {string} npcId - 'panda', 'monty', 'alto', 'telerin', or 'teleron'
 * @returns {object|null} The dialogue definition ready for startDialogue()
 */
export function getNextNeutralDialogue(npcId) {
    const key = (npcId || '').toLowerCase();
    const normalizedKey = key === 'monty' ? 'panda' : key;
    const list = neutralDialoguesByNPC[normalizedKey];

    if (!list || list.length === 0) {
        return null;
    }

    ensureDialogueIndices();

    const currentIndex = gameState.dialogueIndices[normalizedKey] || 0;
    const baseDialogue = list[currentIndex % list.length];

    // Advance to next index for the subsequent interaction
    gameState.dialogueIndices[normalizedKey] = (currentIndex + 1) % list.length;

    // Dynamically adjust speaker for Panda/Monty if needed
    if (normalizedKey === 'panda') {
        const isMonty = gameState.flags?.isMonty || (gameState.quests?.mission_001 !== undefined);
        return {
            ...baseDialogue,
            speaker: isMonty ? 'Monty' : (gameState.pandaName || 'Monty')
        };
    }

    return baseDialogue;
}
