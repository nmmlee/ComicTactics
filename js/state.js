import { CHAR_TYPES } from './character.js';
import { makeFragmentStore } from './gacha.js';

export const MAX_DEPLOYED = 4;
export const UNLOCK_COST = 3;

// 모든 모듈이 공유하는 게임 상태. 읽기는 자유, 쓰기는 담당 모듈에서만.
export const state = {
  wave: 1,
  tickets: 0,
  kills: 0,
  allies: [],
  enemies: [],
  roster: Object.fromEntries(Object.keys(CHAR_TYPES).map(t => [t, []])),
  fragments: makeFragmentStore(),
  phase: 'player',
  selectedAlly: null,
  movedThisTurn: new Set(),
  deployingChar: null,
  charIdCounter: 0,
  rangeIndicator: null,
  moveHighlights: [],
  lastHoverCell: null,
  enemyHoverRing: null,
  enemyHoverKey: null,
};
