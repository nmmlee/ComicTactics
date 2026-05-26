import { state, MAX_DEPLOYED, UNLOCK_COST } from './state.js';
import { CHAR_TYPES } from './character.js';
import { randomType, makeCharacter } from './gacha.js';
import { COLS, ROWS } from './grid.js';
import { scene, grid } from './scene.js';
import { buildCharMesh, clearSelection } from './ally.js';
import { updateHUD, showMergeHint, showDrawResult, renderFragments } from './ui.js';

// 대기 중인 첫 번째 캐릭터를 찾아 배치 모드 진입 (Lv1 강화 재료 1개 소모)
export function startRosterDeploy(type) {
  const char = state.roster[type].find(c => !c.placed);
  if (!char) return;
  if (state.fragments[type][1] < 1) { showMergeHint('강화 재료가 부족합니다'); return; }
  if (state.allies.length >= MAX_DEPLOYED) { showMergeHint(`최대 ${MAX_DEPLOYED}마리까지 배치 가능`); return; }
  state.fragments[type][1]--;
  clearSelection();
  state.deployingChar = char;
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      if (!grid.isOccupied(c, r)) grid.highlight(c, r, 0x004433);
  updateHUD();
}

// 해금: 티켓 3장 → 랜덤 타입 캐릭터를 기존 동일 타입 최고 레벨로 추가
export function unlockSlot() {
  const totalOwned = Object.values(state.roster).reduce((s, pool) => s + pool.length, 0);
  if (totalOwned >= MAX_DEPLOYED) { showMergeHint('이미 최대 슬롯입니다'); return; }
  if (state.tickets < UNLOCK_COST) { showMergeHint(`해금에 티켓 ${UNLOCK_COST}장 필요`); return; }
  state.tickets -= UNLOCK_COST;
  const type = randomType();
  const existingLevel = state.roster[type].reduce((max, c) => Math.max(max, c.level), 1);
  const newChar = makeCharacter(type, existingLevel);
  newChar.maxHp = 80 + existingLevel * 20;
  newChar.hp = newChar.maxHp;
  state.roster[type].push(newChar);
  showMergeHint(`${CHAR_TYPES[type].name} Lv${existingLevel} 해금! (4번째 슬롯 개방)`);
  updateHUD();
}

export function addFragment(type) {
  const placed = state.allies.filter(a => a.type === type && a.isAlive());
  const targetLevel = placed.length > 0 ? Math.min(placed[0].level, 3) : 1;

  state.fragments[type][targetLevel] = (state.fragments[type][targetLevel] ?? 0) + 1;
  showDrawResult(type, state.fragments[type][targetLevel]);

  if (state.fragments[type][targetLevel] >= 3) {
    state.fragments[type][targetLevel] = 0;
    triggerUpgrade(type, targetLevel);
  }

  renderFragments();
}

function triggerUpgrade(type, fromLevel) {
  const newLevel = fromLevel + 1;
  const placed = state.allies.filter(a => a.type === type && a.isAlive() && a.level === fromLevel);

  if (placed.length > 0) {
    const target = placed[0];
    target.level = newLevel;
    target.maxHp = 80 + newLevel * 20;
    target.hp = Math.min(target.hp + 30, target.maxHp);

    const wp = grid.toWorld(target.gridX, target.gridZ);
    if (target.mesh) scene.remove(target.mesh);
    target.mesh = buildCharMesh(target);
    target.mesh.position.set(wp.x, 0, wp.z);
    scene.add(target.mesh);

    showMergeHint(`${CHAR_TYPES[type].name} Lv${newLevel} 강화!`);
  } else {
    const benchChar = state.roster[type].find(c => !c.placed && c.level === fromLevel);
    if (benchChar) {
      benchChar.level = newLevel;
      benchChar.maxHp = 80 + newLevel * 20;
      benchChar.hp = benchChar.maxHp;
      showMergeHint(`${CHAR_TYPES[type].name} Lv${newLevel} 강화 (대기중)!`);
    } else {
      const nc = makeCharacter(type, newLevel);
      state.roster[type].push(nc);
      showMergeHint(`${CHAR_TYPES[type].name} Lv${newLevel} 획득!`);
    }
  }
}
