import * as THREE from 'three';
import { CHAR_TYPES } from './character.js';
import { Enemy } from './enemy.js';
import { scene, grid } from './scene.js';
import { state } from './state.js';
import { COLS, ROWS, CELL } from './grid.js';
import { getAttackCells, buildXMarkers } from './rangeViz.js';
import { applyAttack } from './combat.js';

export function buildCharMesh(char) {
  const def = CHAR_TYPES[char.type];
  const group = new THREE.Group();

  const h = 0.5 + char.level * 0.15;
  const geo = new THREE.CylinderGeometry(0.3, 0.35, h, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: def.color, emissive: def.emissive,
    emissiveIntensity: 0.3 + char.level * 0.1, roughness: 0.5,
  });
  const body = new THREE.Mesh(geo, mat);
  body.position.y = h / 2;
  body.castShadow = true;
  group.add(body);

  for (let i = 0; i < char.level; i++) {
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd700 })
    );
    const angle = (i / 4) * Math.PI * 2;
    orb.position.set(Math.cos(angle) * 0.28, h + 0.1, Math.sin(angle) * 0.28);
    group.add(orb);
  }

  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x222222, depthTest: false })
  );
  bg.rotation.x = -Math.PI / 2;
  bg.position.set(0, 0.03, 0);
  group.add(bg);

  char.hpFill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.07),
    new THREE.MeshBasicMaterial({ color: 0x44aaff, depthTest: false })
  );
  char.hpFill.rotation.x = -Math.PI / 2;
  char.hpFill.position.set(0, 0.04, 0);
  group.add(char.hpFill);

  char.readyRing = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.46, 24),
    new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false })
  );
  char.readyRing.rotation.x = -Math.PI / 2;
  char.readyRing.position.y = 0.07;
  group.add(char.readyRing);

  return group;
}

export function placeAlly(char, col, row) {
  char.gridX = col;
  char.gridZ = row;
  char.placed = true;
  char.mesh = buildCharMesh(char);
  const wp = grid.toWorld(col, row);
  char.mesh.position.set(wp.x, 0, wp.z);
  scene.add(char.mesh);
  grid.setOccupied(col, row, char);
  if (!state.allies.includes(char)) state.allies.push(char);
}

export function returnToRoster(unit) {
  if (unit.mesh) scene.remove(unit.mesh);
  unit.mesh = null;
  unit.hpFill = null;
  unit.readyRing = null;
  unit.placed = false;
  unit.gridX = -1;
  unit.gridZ = -1;
  unit.hp = unit.maxHp;
  state.allies = state.allies.filter(a => a !== unit);
}

export function deployAtCell(col, row) {
  const char = state.deployingChar;
  state.deployingChar = null;
  grid.clearHighlights();
  char.hp = char.maxHp;
  placeAlly(char, col, row);
  state.movedThisTurn.add(char.id);
}

export function clearMoveHighlights() {
  grid.clearHighlights();
  state.moveHighlights = [];
}

export function clearRangeIndicator() {
  if (state.rangeIndicator) { scene.remove(state.rangeIndicator); state.rangeIndicator = null; }
}

export function clearSelection() {
  state.selectedAlly = null;
  state.lastHoverCell = null;
  clearRangeIndicator();
  grid.clearHighlights();
  state.moveHighlights = [];
  state.enemyHoverKey = null;
}

export function selectAlly(char) {
  clearSelection();
  state.selectedAlly = char;

  const moveRange = 2;
  const col = char.gridX, row = char.gridZ;

  state.moveHighlights = [];
  const visited = new Set();
  const queue = [{ c: col, r: row, steps: 0 }];
  visited.add(`${col},${row}`);

  while (queue.length) {
    const { c, r, steps } = queue.shift();
    if (steps > 0 && !grid.isOccupied(c, r)) {
      state.moveHighlights.push({ col: c, row: r });
      grid.highlight(c, r, 0x00e8ff);
    }
    if (steps >= moveRange) continue;
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nc = c + dc, nr = r + dr;
      const key = `${nc},${nr}`;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      if (visited.has(key)) continue;
      const occ = grid.getOccupied(nc, nr);
      if (occ instanceof Enemy) continue;
      visited.add(key);
      queue.push({ c: nc, r: nr, steps: steps + 1 });
    }
  }

  const def = CHAR_TYPES[char.type];
  const attackCells = getAttackCells(col, row, def.rangeType, char.range);
  state.rangeIndicator = buildXMarkers(scene, grid, attackCells, def.color);
}

// 이동만 처리하고 결과를 반환. 턴 종료/웨이브 클리어 판단은 호출자가 한다.
export function moveAlly(char, col, row) {
  grid.clearOccupied(char.gridX, char.gridZ);
  char.gridX = col;
  char.gridZ = row;
  grid.setOccupied(col, row, char);
  const wp = grid.toWorld(col, row);
  if (char.mesh) char.mesh.position.set(wp.x, 0, wp.z);

  applyAttack(char, state.allies, state.enemies, grid, scene, (unit, isAlly) => {
    grid.clearOccupied(unit.gridX, unit.gridZ);
    if (isAlly) {
      returnToRoster(unit);
    } else {
      unit.remove(scene);
      state.enemies = state.enemies.filter(en => en !== unit);
      state.kills++;
      state.tickets++;
    }
  });

  state.movedThisTurn.add(char.id);
  clearSelection();
}

// 매 프레임 아군 메시 애니메이션 업데이트
export function updateAllyAnimations(t) {
  for (const c of state.allies) {
    if (!c.mesh) continue;
    const isMoved = state.movedThisTurn.has(c.id);

    c.mesh.position.y = Math.sin(t * 1.5 + c.id) * 0.04;

    if (c.readyRing) {
      c.readyRing.visible = !isMoved && state.phase === 'player';
      if (!isMoved) {
        c.readyRing.material.opacity = 0.5 + Math.sin(t * 3 + c.id) * 0.4;
      }
    }

    const body = c.mesh.children[0];
    if (body?.material) {
      body.material.emissiveIntensity = isMoved
        ? 0.05
        : (c === state.selectedAlly ? 0.5 + Math.sin(t * 4) * 0.3 : 0.3 + c.level * 0.1);
    }
  }
}
