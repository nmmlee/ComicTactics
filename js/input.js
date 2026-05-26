import * as THREE from 'three';
import { canvas, scene, camera, controls, grid } from './scene.js';
import { CELL } from './grid.js';
import { state } from './state.js';
import { Character } from './character.js';
import { Enemy } from './enemy.js';
import { randomType } from './gacha.js';
import { selectAlly, clearSelection, moveAlly, deployAtCell } from './ally.js';
import { startRosterDeploy, addFragment, unlockSlot } from './upgrade.js';
import { endPlayerTurn, waveCleared } from './turns.js';
import { updateHUD, showEndScreen, renderFragments, onDeploy } from './ui.js';

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function updateMouse(e) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

let pointerDownPos = null;

canvas.addEventListener('pointerdown', e => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  if (state.phase !== 'player') return;

  updateMouse(e);
  raycaster.setFromCamera(mouse, camera);
  const clickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(clickPlane, pt)) return;
  const cell = grid.fromWorld(pt.x, pt.z);
  if (!cell) return;

  const { col, row } = cell;
  const occupant = grid.getOccupied(col, row);
  const isAllyCell = occupant instanceof Character && !state.movedThisTurn.has(occupant.id);
  const isMoveTarget = state.selectedAlly && state.moveHighlights.some(h => h.col === col && h.row === row);

  if (isAllyCell || isMoveTarget) {
    controls.enabled = false;
  }
});

// Hover: 선택된 아군이 있으면 공격 범위 링을 따라다니게 함
const hoverPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hoverPt = new THREE.Vector3();

canvas.addEventListener('pointermove', e => {
  if (!state.selectedAlly || !state.rangeIndicator || state.phase !== 'player') return;
  updateMouse(e);
  raycaster.setFromCamera(mouse, camera);
  if (!raycaster.ray.intersectPlane(hoverPlane, hoverPt)) return;
  const cell = grid.fromWorld(hoverPt.x, hoverPt.z);

  const key = cell ? `${cell.col},${cell.row}` : null;
  if (state.lastHoverCell === key) return;
  state.lastHoverCell = key;

  const isMoveTarget = cell && state.moveHighlights.some(h => h.col === cell.col && h.row === cell.row);
  const previewCol = isMoveTarget ? cell.col : state.selectedAlly.gridX;
  const previewRow = isMoveTarget ? cell.row : state.selectedAlly.gridZ;
  const wp = grid.toWorld(previewCol, previewRow);
  state.rangeIndicator.position.set(wp.x, 0.15, wp.z);
});

// 적 호버 시 공격 범위 링 표시
const enemyHoverPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const enemyHoverPt = new THREE.Vector3();

canvas.addEventListener('pointermove', e => {
  if (state.selectedAlly) return; // 아군 링이 우선
  updateMouse(e);
  raycaster.setFromCamera(mouse, camera);
  if (!raycaster.ray.intersectPlane(enemyHoverPlane, enemyHoverPt)) return;
  const cell = grid.fromWorld(enemyHoverPt.x, enemyHoverPt.z);

  const key = cell ? `${cell.col},${cell.row}` : null;
  if (state.enemyHoverKey === key) return;
  state.enemyHoverKey = key;

  if (state.enemyHoverRing) { scene.remove(state.enemyHoverRing); state.enemyHoverRing = null; }

  if (!cell) return;
  const occupant = grid.getOccupied(cell.col, cell.row);
  if (!(occupant instanceof Enemy) || !occupant.isAlive()) return;

  const worldRange = occupant.type === 'ranged'
    ? 3 * CELL
    : occupant.type === 'aoe'
    ? 1.8 * CELL
    : 1.5 * CELL;

  const color = 0xff3300;
  const geo = new THREE.RingGeometry(worldRange - 0.05, worldRange + 0.05, 48);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
  state.enemyHoverRing = new THREE.Mesh(geo, mat);
  state.enemyHoverRing.rotation.x = -Math.PI / 2;
  const wp = grid.toWorld(cell.col, cell.row);
  state.enemyHoverRing.position.set(wp.x, 0.15, wp.z);
  scene.add(state.enemyHoverRing);
});

canvas.addEventListener('pointerup', e => {
  controls.enabled = true;
  if (state.phase !== 'player' || !pointerDownPos) return;

  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  if (Math.hypot(dx, dy) > 6) return;

  onGridClick(e);
});

function onGridClick(e) {
  updateMouse(e);
  raycaster.setFromCamera(mouse, camera);

  const clickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(clickPlane, pt)) { clearSelection(); return; }
  const cell = grid.fromWorld(pt.x, pt.z);
  if (!cell) { clearSelection(); state.deployingChar = null; grid.clearHighlights(); return; }

  const { col, row } = cell;
  const occupant = grid.getOccupied(col, row);

  if (state.deployingChar) {
    if (!occupant) {
      deployAtCell(col, row);
      renderFragments();
      updateHUD();
    } else {
      state.deployingChar = null;
      grid.clearHighlights();
    }
    return;
  }

  if (state.selectedAlly) {
    const isReachable = state.moveHighlights.some(h => h.col === col && h.row === row);
    if (isReachable) {
      handleMove(state.selectedAlly, col, row);
      return;
    }
    if (occupant instanceof Character && !state.movedThisTurn.has(occupant.id)) {
      selectAlly(occupant);
      return;
    }
    clearSelection();
    return;
  }

  if (occupant instanceof Character && !state.movedThisTurn.has(occupant.id)) {
    selectAlly(occupant);
  }
}

// 이동 후 턴 종료/웨이브 클리어 체크는 여기서 한다 (ally.js → turns.js 순환 의존 회피)
function handleMove(char, col, row) {
  moveAlly(char, col, row);
  updateHUD();

  const aliveAllies = state.allies.filter(a => a.isAlive() && a.placed);
  if (aliveAllies.length === 0) {
    showEndScreen(false);
    return;
  }

  const allMoved = aliveAllies.every(a => state.movedThisTurn.has(a.id));
  if (allMoved) endPlayerTurn();
  if (state.enemies.length === 0) waveCleared();
}

// 버튼 바인딩
document.getElementById('btn-unlock').addEventListener('click', () => unlockSlot());

document.getElementById('btn-draw').addEventListener('click', () => {
  if (state.tickets < 1) return;
  state.tickets--;
  const type = randomType();
  addFragment(type);
  updateHUD();
});

document.getElementById('btn-close-draw').addEventListener('click', () => {
  document.getElementById('draw-panel').style.display = 'none';
});

document.getElementById('btn-confirm').addEventListener('click', () => {
  if (state.phase !== 'player') return;
  endPlayerTurn();
});

document.getElementById('btn-restart').addEventListener('click', () => location.reload());

// 카드의 배치 버튼 클릭 → upgrade.startRosterDeploy 연결
onDeploy(type => startRosterDeploy(type));
