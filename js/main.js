import { Character } from './character.js';
import { state } from './state.js';
import { onFrame, startRenderLoop } from './scene.js';
import { placeAlly, updateAllyAnimations } from './ally.js';
import { updateHUD, renderFragments } from './ui.js';
import { spawnEnemies, setPhase } from './turns.js';
import './input.js';

function createStarterAllies() {
  const warrior = new Character('attacker', state.charIdCounter++);
  const healer  = new Character('healer',   state.charIdCounter++);
  const archer  = new Character('piercer',  state.charIdCounter++);
  state.roster['attacker'].push(warrior);
  state.roster['healer'].push(healer);
  state.roster['piercer'].push(archer);
  placeAlly(warrior, 2, 1);
  placeAlly(healer,  3, 0);
  placeAlly(archer,  4, 1);
}

function init() {
  createStarterAllies();
  spawnEnemies();
  setPhase('player');
  updateHUD();
  renderFragments();
  onFrame(updateAllyAnimations);
  startRenderLoop();
}

init();
