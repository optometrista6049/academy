const locks = new Set();

export function lockInput(owner) {

    locks.add(owner);

}

export function unlockInput(owner) {

    locks.delete(owner);

}

export function isInputLocked() {

    return locks.size > 0;

}