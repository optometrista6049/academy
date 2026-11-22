import { runtimeState } from '../state/runtimeState.js';

const locks = new Set();

export function resetMovementKeys() {
    if (runtimeState && runtimeState.keys) {
        runtimeState.keys.w = false;
        runtimeState.keys.a = false;
        runtimeState.keys.s = false;
        runtimeState.keys.d = false;
    }
}

export function lockInput(owner) {
    locks.add(owner);
    resetMovementKeys();
}

export function unlockInput(owner) {
    locks.delete(owner);
}

export function isInputLocked() {
    return locks.size > 0;
}

export function hasOtherInputLocks(excludedOwner) {
    for (const owner of locks) {
        if (owner !== excludedOwner) return true;
    }
    return false;
}