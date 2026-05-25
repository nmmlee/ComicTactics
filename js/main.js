import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Grid, COLS, ROWS, CELL } from './grid.js';
import { Character, CHAR_TYPES } from './character.js';
import { Enemy, buildWave } from './enemy.js';
import { randomType, makeCharacter, makeFragmentStore } from './gacha.js';
import { applyAttack, resolveEnemyTurn } from './combat.js';
import { buildRangeRing } from './rangeViz.js';

// ── Scene ─────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);
scene.fog = new THREE.Fog(0x0a0a0f, 18, 32);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 14, 10);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI / 2.4;
controls.target.set(0, 0, 0);

// Lights
scene.add(new THREE.AmbientLight(0x334466, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(5, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
const fill = new THREE.PointLight(0x4444ff, 0.8, 20);
fill.position.set(-5, 6, -5);
scene.add(fill);

const groundGeo = new THREE.PlaneGeometry(COLS * CELL + 2, ROWS * CELL + 2);
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0x0d0d1a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

// ── Game state ────────────────────────────────────────────────────────────────

const grid = new Grid(scene);

let wave = 1;
let tickets = 0;
let kills = 0;
let allies = [];   // currently placed ally characters
let enemies = [];
const MAX_DEPLOYED = 4;
const UNLOCK_COST = 3; // 해금 티켓 비용

// roster[type] = Character[] — 배치중 + 대기중 전체 풀
// placed===true  → 필드에 있음
// placed===false → 대기(재배치 가능)
const roster = {};
for (const type of Object.keys(CHAR_TYPES)) roster[type] = [];

// Fragment store: fragments[type][level] = count (0~2)
const fragments = makeFragmentStore();

// Turn state
// phase: 'player' (select & move) | 'enemy' | 'draw'
let phase = 'player';
let selectedAlly = null;      // Character currently selected
let movedThisTurn = new Set(); // ids of allies already moved this turn
let rangeIndicator = null;
let moveHighlights = [];
let lastHoverCell = null;
let enemyHoverRing = null;
let enemyHoverKey  = null;

// Raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ── Build ally mesh ───────────────────────────────────────────────────────────

let charIdCounter = 0;

function buildCharMesh(char) {
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

  // HP bar
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

  // Ready indicator ring (glows when unit hasn't moved this turn)
  char.readyRing = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.46, 24),
    new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false })
  );
  char.readyRing.rotation.x = -Math.PI / 2;
  char.readyRing.position.y = 0.07;
  group.add(char.readyRing);

  return group;
}

function placeAlly(char, col, row) {
  char.gridX = col;
  char.gridZ = row;
  char.placed = true;
  char.mesh = buildCharMesh(char);
  const wp = grid.toWorld(col, row);
  char.mesh.position.set(wp.x, 0, wp.z);
  scene.add(char.mesh);
  grid.setOccupied(col, row, char);
  if (!allies.includes(char)) allies.push(char);
}

// ── Initial setup ─────────────────────────────────────────────────────────────

function createStarterAllies() {
  const warrior = new Character('attacker', charIdCounter++);
  const healer  = new Character('healer',   charIdCounter++);
  const archer  = new Character('piercer',  charIdCounter++);
  roster['attacker'].push(warrior);
  roster['healer'].push(healer);
  roster['piercer'].push(archer);
  placeAlly(warrior, 2, 1);
  placeAlly(healer,  3, 0);
  placeAlly(archer,  4, 1);
}

function spawnEnemies() {
  enemies = buildWave(wave, grid, scene);
  updateHUD();
}

function init() {
  createStarterAllies();
  spawnEnemies();
  setPhase('player');
  updateHUD();
  renderFragments();
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function updateHUD() {
  document.getElementById('hud-wave').textContent = wave;
  document.getElementById('hud-tickets').textContent = tickets;
  document.getElementById('hud-kills').textContent = kills;
  document.getElementById('btn-draw').disabled = tickets < 1;
  const totalOwned = Object.values(roster).reduce((s, pool) => s + pool.length, 0);
  const unlockBtn = document.getElementById('btn-unlock');
  unlockBtn.disabled = tickets < UNLOCK_COST || totalOwned >= MAX_DEPLOYED;
  unlockBtn.title = totalOwned >= MAX_DEPLOYED ? '이미 최대 슬롯' : `티켓 ${UNLOCK_COST}장 소모`;
  renderFragments();

  const aliveAllies = allies.filter(a => a.isAlive());
  const notMoved = aliveAllies.filter(a => !movedThisTurn.has(a.id));
  document.getElementById('turn-banner').textContent =
    phase === 'player'
      ? `-- 내 턴: ${notMoved.length}명 남음 --`
      : phase === 'enemy'
      ? '-- 적 턴 --'
      : '-- 드로우 턴 --';
}

// ── Roster / deploy / unlock system ──────────────────────────────────────────

let deployingChar = null; // Character being deployed from roster

function returnToRoster(unit) {
  if (unit.mesh) scene.remove(unit.mesh);
  unit.mesh = null;
  unit.hpFill = null;
  unit.readyRing = null;
  unit.placed = false;
  unit.gridX = -1;
  unit.gridZ = -1;
  unit.hp = unit.maxHp;
  allies = allies.filter(a => a !== unit);
  renderFragments();
}

// 해당 타입에서 대기 중인 첫 번째 캐릭터를 찾아 배치 모드 진입 (티켓 1장 소모)
function startRosterDeploy(type) {
  const char = roster[type].find(c => !c.placed);
  if (!char) return;
  if (tickets < 1) { showMergeHint('티켓이 부족합니다'); return; }
  if (allies.length >= MAX_DEPLOYED) { showMergeHint(`최대 ${MAX_DEPLOYED}마리까지 배치 가능`); return; }
  tickets--;
  clearSelection();
  deployingChar = char;
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      if (!grid.isOccupied(c, r)) grid.highlight(c, r, 0x004433);
  updateHUD();
}

function deployAtCell(col, row) {
  const char = deployingChar;
  deployingChar = null;
  grid.clearHighlights();
  char.hp = char.maxHp;
  placeAlly(char, col, row);
  movedThisTurn.add(char.id);
  renderFragments();
  updateHUD();
}

// 해금: 티켓 3장 소모 → 랜덤 타입 캐릭터 1명을 roster에 추가 (슬롯 +1)
// 최대 1회 (총 roster 보유 수 = 4가 되면 더 해금 불가)
function unlockSlot() {
  const totalOwned = Object.values(roster).reduce((s, pool) => s + pool.length, 0);
  if (totalOwned >= MAX_DEPLOYED) { showMergeHint('이미 최대 슬롯입니다'); return; }
  if (tickets < UNLOCK_COST) { showMergeHint(`해금에 티켓 ${UNLOCK_COST}장 필요`); return; }
  tickets -= UNLOCK_COST;
  const type = randomType();
  const newChar = makeCharacter(type);
  roster[type].push(newChar);
  showMergeHint(`${CHAR_TYPES[type].name} 해금! (4번째 슬롯 개방)`);
  updateHUD();
}

// ── 통합 카드 UI: 타입별 강화카드 1장 ────────────────────────────────────────

function renderFragments() {
  const container = document.getElementById('hand-cards');
  container.innerHTML = '';

  for (const [type, def] of Object.entries(CHAR_TYPES)) {
    const pool      = roster[type];               // 이 타입의 전체 캐릭터
    const onField   = pool.filter(c => c.placed); // 배치 중
    const onBench   = pool.filter(c => !c.placed);// 대기 중

    // 대표 레벨: 배치 중 최고 레벨, 없으면 대기 중 최고 레벨, 그것도 없으면 1
    const repChar   = [...onField, ...onBench].sort((a, b) => b.level - a.level)[0];
    const level     = repChar ? repChar.level : 1;
    const targetLv  = Math.min(level, 3);
    const fragCount = fragments[type][targetLv] ?? 0;

    const isDeploying = deployingChar?.type === type;
    const canDeploy   = onBench.length > 0 && allies.length < MAX_DEPLOYED && phase === 'player';

    const card = document.createElement('div');
    card.className = 'card' + (isDeploying ? ' selected' : '');
    card.dataset.type = type;

    // 슬롯 표시 (배치중 / 보유 총수)
    const slotText = pool.length > 0
      ? `${onField.length}/${pool.length} 배치중`
      : '미보유';
    const slotColor = onField.length > 0 ? '#44ff88' : pool.length > 0 ? '#ffd700' : '#555';

    // 배치 버튼
    const deployBtn = canDeploy && tickets >= 1
      ? `<button style="margin-top:4px;width:100%;padding:2px 0;font-size:10px;background:#004433;color:#44ff88;border:1px solid #44ff88;border-radius:3px;cursor:pointer" data-action="deploy" data-type="${type}">배치 🎟️1</button>`
      : canDeploy
      ? `<button style="margin-top:4px;width:100%;padding:2px 0;font-size:10px;background:#1a1a1a;color:#444;border:1px solid #333;border-radius:3px;cursor:default" disabled>배치 🎟️1</button>`
      : '';

    card.innerHTML = `
      <div class="card-level">Lv${level}</div>
      <div class="card-icon">${def.icon}</div>
      <div class="card-name">${def.name}</div>
      <div style="margin-top:4px;display:flex;gap:3px;justify-content:center">
        ${[0,1,2].map(i => `<div style="width:9px;height:9px;border-radius:50%;background:${i < fragCount ? '#ffd700' : '#333'};border:1px solid #555"></div>`).join('')}
      </div>
      <div style="font-size:10px;color:${slotColor};margin-top:3px">${slotText}</div>
      ${deployBtn}
    `;

    card.querySelector('[data-action="deploy"]')?.addEventListener('click', e => {
      e.stopPropagation();
      startRosterDeploy(type);
    });

    container.appendChild(card);
  }
}

function setPhase(p) {
  phase = p;
  updateHUD();
}

// ── Selection & movement highlight ───────────────────────────────────────────

function clearSelection() {
  selectedAlly = null;
  lastHoverCell = null;
  clearRangeIndicator();
  grid.clearHighlights();
  moveHighlights = [];
  enemyHoverKey = null;
}

function clearMoveHighlights() {
  grid.clearHighlights();
  moveHighlights = [];
}

function clearRangeIndicator() {
  if (rangeIndicator) { scene.remove(rangeIndicator); rangeIndicator = null; }
}

// Show moveable cells (BFS, 2 steps) + range ring at current position
function selectAlly(char) {
  clearSelection();
  selectedAlly = char;

  const moveRange = 2;
  const col = char.gridX, row = char.gridZ;

  moveHighlights = [];
  const visited = new Set();
  const queue = [{ c: col, r: row, steps: 0 }];
  visited.add(`${col},${row}`);

  while (queue.length) {
    const { c, r, steps } = queue.shift();
    if (steps > 0 && !grid.isOccupied(c, r)) {
      moveHighlights.push({ col: c, row: r });
      grid.highlight(c, r, 0x004444);
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

  // Show range ring at current position
  const def = CHAR_TYPES[char.type];
  rangeIndicator = buildRangeRing(scene, def.rangeType, char.range * CELL, def.color);
  const wp = grid.toWorld(col, row);
  rangeIndicator.position.set(wp.x, 0.15, wp.z);
}

// ── Mouse click on 3D grid ────────────────────────────────────────────────────

// Distinguish click from drag: record pointerdown position
let pointerDownPos = null;

canvas.addEventListener('pointerdown', e => {
  pointerDownPos = { x: e.clientX, y: e.clientY };

  if (phase !== 'player') return;

  // If the user presses down on a cell with an ally or a valid move target,
  // disable OrbitControls so the drag doesn't rotate the camera.
  updateMouse(e);
  raycaster.setFromCamera(mouse, camera);
  const clickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(clickPlane, pt)) return;
  const cell = grid.fromWorld(pt.x, pt.z);
  if (!cell) return;

  const { col, row } = cell;
  const occupant = grid.getOccupied(col, row);
  const isAllyCell = occupant instanceof Character && !movedThisTurn.has(occupant.id);
  const isMoveTarget = selectedAlly && moveHighlights.some(h => h.col === col && h.row === row);

  if (isAllyCell || isMoveTarget) {
    controls.enabled = false;
  }
});

// Hover: move range ring to hovered cell when a character is selected
const hoverPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hoverPt = new THREE.Vector3();

canvas.addEventListener('pointermove', e => {
  if (!selectedAlly || !rangeIndicator || phase !== 'player') return;
  updateMouse(e);
  raycaster.setFromCamera(mouse, camera);
  if (!raycaster.ray.intersectPlane(hoverPlane, hoverPt)) return;
  const cell = grid.fromWorld(hoverPt.x, hoverPt.z);

  const key = cell ? `${cell.col},${cell.row}` : null;
  if (lastHoverCell === key) return;
  lastHoverCell = key;

  // Snap ring to hovered move-target cell, or stay at character position
  const isMoveTarget = cell && moveHighlights.some(h => h.col === cell.col && h.row === cell.row);
  const previewCol = isMoveTarget ? cell.col : selectedAlly.gridX;
  const previewRow = isMoveTarget ? cell.row : selectedAlly.gridZ;
  const wp = grid.toWorld(previewCol, previewRow);
  rangeIndicator.position.set(wp.x, 0.15, wp.z);
});

// ── Enemy hover: show attack range ring ───────────────────────────────────────

const enemyHoverPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const enemyHoverPt    = new THREE.Vector3();

canvas.addEventListener('pointermove', e => {
  if (selectedAlly) return; // ally ring takes priority
  updateMouse(e);
  raycaster.setFromCamera(mouse, camera);
  if (!raycaster.ray.intersectPlane(enemyHoverPlane, enemyHoverPt)) return;
  const cell = grid.fromWorld(enemyHoverPt.x, enemyHoverPt.z);

  const key = cell ? `${cell.col},${cell.row}` : null;
  if (enemyHoverKey === key) return;
  enemyHoverKey = key;

  // Remove previous ring
  if (enemyHoverRing) { scene.remove(enemyHoverRing); enemyHoverRing = null; }

  if (!cell) return;
  const occupant = grid.getOccupied(cell.col, cell.row);
  if (!(occupant instanceof Enemy) || !occupant.isAlive()) return;

  // Enemy melee range = 1.5 cells * CELL, ranged = 3 cells * CELL
  const worldRange = occupant.type === 'ranged'
    ? 3 * CELL
    : occupant.type === 'aoe'
    ? 1.8 * CELL
    : 1.5 * CELL;

  const color = 0xff3300;
  const geo = new THREE.RingGeometry(worldRange - 0.05, worldRange + 0.05, 48);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
  enemyHoverRing = new THREE.Mesh(geo, mat);
  enemyHoverRing.rotation.x = -Math.PI / 2;
  const wp = grid.toWorld(cell.col, cell.row);
  enemyHoverRing.position.set(wp.x, 0.15, wp.z);
  scene.add(enemyHoverRing);
});

canvas.addEventListener('pointerup', e => {
  // Re-enable orbit controls
  controls.enabled = true;

  if (phase !== 'player' || !pointerDownPos) return;

  // Only treat as click if pointer didn't move much (not a drag)
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
  if (!cell) { clearSelection(); deployingChar = null; grid.clearHighlights(); return; }

  const { col, row } = cell;
  const occupant = grid.getOccupied(col, row);

  // 로스터 배치 모드
  if (deployingChar) {
    if (!occupant) deployAtCell(col, row);
    else { deployingChar = null; grid.clearHighlights(); }
    return;
  }

  if (selectedAlly) {
    const isReachable = moveHighlights.some(h => h.col === col && h.row === row);
    if (isReachable) {
      moveAlly(selectedAlly, col, row);
      return;
    }
    if (occupant instanceof Character && !movedThisTurn.has(occupant.id)) {
      selectAlly(occupant);
      return;
    }
    clearSelection();
    return;
  }

  if (occupant instanceof Character && !movedThisTurn.has(occupant.id)) {
    selectAlly(occupant);
  }
}

function moveAlly(char, col, row) {
  // Move on grid
  grid.clearOccupied(char.gridX, char.gridZ);
  char.gridX = col;
  char.gridZ = row;
  grid.setOccupied(col, row, char);
  const wp = grid.toWorld(col, row);
  if (char.mesh) char.mesh.position.set(wp.x, 0, wp.z);

  // Apply attack at new position
  applyAttack(char, allies, enemies, grid, scene, (unit, isAlly) => {
    grid.clearOccupied(unit.gridX, unit.gridZ);
    if (isAlly) {
      returnToRoster(unit);
    } else {
      unit.remove(scene);
      enemies = enemies.filter(en => en !== unit);
      kills++;
      tickets++;
    }
  });

  movedThisTurn.add(char.id);
  clearSelection();
  updateHUD();

  // Check if all alive allies have moved
  const aliveAllies = allies.filter(a => a.isAlive() && a.placed);
  const allMoved = aliveAllies.every(a => movedThisTurn.has(a.id));

  if (aliveAllies.length === 0) {
    showEndScreen(false);
    return;
  }

  if (allMoved) endPlayerTurn();

  if (enemies.length === 0) {
    waveCleared();
  }
}

// ── Turn flow ─────────────────────────────────────────────────────────────────

function endPlayerTurn() {
  setPhase('enemy');
  setTimeout(doEnemyTurn, 700);
}

async function doEnemyTurn() {
  const { killedAllies } = resolveEnemyTurn(enemies, allies, grid, scene, (unit, isAlly) => {
    grid.clearOccupied(unit.gridX, unit.gridZ);
    if (isAlly) returnToRoster(unit);
  });

  await delay(400);

  const allDead = Object.values(roster).every(pool => pool.length === 0) ||
    (allies.length === 0 && Object.values(roster).every(pool => pool.every(c => !c.placed)));
  if (allDead) {
    showEndScreen(false);
    return;
  }

  if (enemies.length === 0) {
    waveCleared();
    return;
  }

  // Start new player turn
  movedThisTurn.clear();
  setPhase('player');
  updateHUD();
}

function waveCleared() {
  wave++;
  movedThisTurn.clear();
  setTimeout(() => {
    spawnEnemies();
    setPhase('player');
    updateHUD();
  }, 800);
}

// ── Draw system ───────────────────────────────────────────────────────────────

document.getElementById('btn-unlock').addEventListener('click', () => unlockSlot());

document.getElementById('btn-draw').addEventListener('click', () => {
  if (tickets < 1) return;
  tickets--;
  const type = randomType();
  addFragment(type);
  updateHUD();
});

document.getElementById('btn-close-draw').addEventListener('click', () => {
  document.getElementById('draw-panel').style.display = 'none';
});

// Add one fragment of a type; if 3 collected, upgrade/add the character
function addFragment(type) {
  const def = CHAR_TYPES[type];

  // Which level are we collecting toward?
  const placed = allies.filter(a => a.type === type && a.isAlive());
  const targetLevel = placed.length > 0 ? Math.min(placed[0].level, 3) : 1;

  fragments[type][targetLevel] = (fragments[type][targetLevel] ?? 0) + 1;

  // Flash the drawn type in the panel briefly
  showDrawResult(type, fragments[type][targetLevel]);

  if (fragments[type][targetLevel] >= 3) {
    fragments[type][targetLevel] = 0;
    triggerUpgrade(type, targetLevel);
  }

  renderFragments();
}

function showDrawResult(type, count) {
  const def = CHAR_TYPES[type];
  const panel = document.getElementById('draw-panel');
  const result = document.getElementById('draw-result');
  result.innerHTML = `
    <div class="draw-card" style="border-color:rgba(255,215,0,0.6)">
      <div class="card-icon">${def.icon}</div>
      <div class="card-name">${def.name}</div>
      <div style="color:#ffd700;font-size:12px;margin-top:4px">${count}/3</div>
    </div>
  `;
  panel.style.display = 'block';
  clearTimeout(panel._t);
  panel._t = setTimeout(() => { panel.style.display = 'none'; }, 1200);
}

function triggerUpgrade(type, fromLevel) {
  const newLevel = fromLevel + 1;
  const placed = allies.filter(a => a.type === type && a.isAlive() && a.level === fromLevel);

  if (placed.length > 0) {
    // Upgrade the first matching placed ally
    const target = placed[0];
    target.level = newLevel;
    target.maxHp = 80 + newLevel * 20;
    target.hp = Math.min(target.hp + 30, target.maxHp);

    // Rebuild mesh to reflect new level
    const wp = grid.toWorld(target.gridX, target.gridZ);
    if (target.mesh) scene.remove(target.mesh);
    target.mesh = buildCharMesh(target);
    target.mesh.position.set(wp.x, 0, wp.z);
    scene.add(target.mesh);

    showMergeHint(`${CHAR_TYPES[type].name} Lv${newLevel} 강화!`);
  } else {
    // 필드에 없으면 roster 대기 중 캐릭터 업그레이드, 없으면 새로 추가
    const benchChar = roster[type].find(c => !c.placed && c.level === fromLevel);
    if (benchChar) {
      benchChar.level = newLevel;
      benchChar.maxHp = 80 + newLevel * 20;
      benchChar.hp = benchChar.maxHp;
      showMergeHint(`${CHAR_TYPES[type].name} Lv${newLevel} 강화 (대기중)!`);
    } else {
      // 아예 없으면 새 캐릭터를 해당 레벨로 roster에 추가
      const nc = makeCharacter(type, newLevel);
      roster[type].push(nc);
      showMergeHint(`${CHAR_TYPES[type].name} Lv${newLevel} 획득!`);
    }
  }
}

// ── Confirm button (end turn manually) ───────────────────────────────────────

document.getElementById('btn-confirm').addEventListener('click', () => {
  if (phase !== 'player') return;
  endPlayerTurn();
});

// ── End screen ────────────────────────────────────────────────────────────────

document.getElementById('btn-restart').addEventListener('click', () => location.reload());

function showEndScreen(win) {
  const overlay = document.getElementById('overlay');
  document.getElementById('overlay-title').textContent = win ? 'VICTORY!' : 'GAME OVER';
  document.getElementById('overlay-msg').textContent = win
    ? `Wave ${wave} 보스를 처치했습니다!`
    : '모든 아군이 쓰러졌습니다.';
  overlay.style.display = 'flex';
}

function showMergeHint(msg = '강화 완료!') {
  const hint = document.getElementById('merge-hint');
  hint.textContent = msg;
  hint.style.display = 'block';
  clearTimeout(hint._t);
  hint._t = setTimeout(() => hint.style.display = 'none', 2000);
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function updateMouse(e) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Render loop ───────────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  controls.update();

  const t = performance.now() / 1000;
  for (const c of allies) {
    if (!c.mesh) continue;
    const isMoved = movedThisTurn.has(c.id);

    // Float animation
    c.mesh.position.y = Math.sin(t * 1.5 + c.id) * 0.04;

    // Ready ring: visible + pulsing when not moved, hidden when moved
    if (c.readyRing) {
      c.readyRing.visible = !isMoved && phase === 'player';
      if (!isMoved) {
        c.readyRing.material.opacity = 0.5 + Math.sin(t * 3 + c.id) * 0.4;
      }
    }

    // Body emissive dim when moved
    const body = c.mesh.children[0];
    if (body?.material) {
      const def = CHAR_TYPES[c.type];
      body.material.emissiveIntensity = isMoved
        ? 0.05
        : (c === selectedAlly ? 0.5 + Math.sin(t * 4) * 0.3 : 0.3 + c.level * 0.1);
    }
  }

  renderer.render(scene, camera);
}

init();
animate();
