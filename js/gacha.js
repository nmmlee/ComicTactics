import { Character, CHAR_TYPES } from './character.js';

let charId = 0;

const WEIGHTS = { attacker: 40, healer: 30, piercer: 30 };

export function randomType() {
  const roll = Math.random() * 100;
  let acc = 0;
  for (const [type, w] of Object.entries(WEIGHTS)) {
    acc += w;
    if (roll < acc) return type;
  }
  return 'attacker';
}

export function makeCharacter(type, level = 1) {
  const c = new Character(type, charId++);
  c.level = level;
  return c;
}

// fragments[type][level] = count (0~2)
export function makeFragmentStore() {
  const store = {};
  for (const type of Object.keys(CHAR_TYPES)) {
    store[type] = { 1: 0, 2: 0, 3: 0, 4: 0 };
  }
  return store;
}
