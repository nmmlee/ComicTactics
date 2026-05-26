import { state } from './state.js';
import { scene, grid } from './scene.js';
import { resolveEnemyTurn } from './combat.js';
import { buildWave } from './enemy.js';
import { returnToRoster } from './ally.js';
import { updateHUD, showEndScreen } from './ui.js';

export function setPhase(p) {
  state.phase = p;
  updateHUD();
}

export function spawnEnemies() {
  state.enemies = buildWave(state.wave, grid, scene);
  updateHUD();
}

export function endPlayerTurn() {
  setPhase('enemy');
  setTimeout(doEnemyTurn, 700);
}

async function doEnemyTurn() {
  resolveEnemyTurn(state.enemies, state.allies, grid, scene, (unit, isAlly) => {
    grid.clearOccupied(unit.gridX, unit.gridZ);
    if (isAlly) returnToRoster(unit);
  });

  await delay(400);

  const allDead = Object.values(state.roster).every(pool => pool.length === 0) ||
    (state.allies.length === 0 && Object.values(state.roster).every(pool => pool.every(c => !c.placed)));
  if (allDead) {
    showEndScreen(false);
    return;
  }

  if (state.enemies.length === 0) {
    waveCleared();
    return;
  }

  state.movedThisTurn.clear();
  setPhase('player');
  updateHUD();
}

export function waveCleared() {
  state.wave++;
  state.movedThisTurn.clear();
  setTimeout(() => {
    spawnEnemies();
    setPhase('player');
    updateHUD();
  }, 800);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
