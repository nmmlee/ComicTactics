import * as THREE from 'three';

let eid = 0;

// Enemy ability types:
// 'charge'  - 한 턴에 2칸 전진
// 'ranged'  - 근접 공격 대신 2칸 범위 원거리 공격 (이동 안 함)
// 'aoe'     - 주변 1칸 전체 범위 공격
// 'healer'  - 인접 적에게 HP 회복
// (normal)  - 1칸 전진 + 근접 공격

const ENEMY_TYPES = {
  normal:  { color: 0xcc3300, emissive: 0x220000, icon: '🟥', label: '전사',   hp: 80,  atk: 12, reward: 1, moveDesc: '가장 가까운 아군 방향 1칸 전진', skillDesc: '사거리 내 아군 1명 무작위 공격' },
  charge:  { color: 0xff6600, emissive: 0x331100, icon: '🟧', label: '돌격병', hp: 60,  atk: 18, reward: 1, moveDesc: '가장 가까운 아군 방향 2칸 전진', skillDesc: '사거리 내 아군 1명 강타' },
  ranged:  { color: 0xaa00cc, emissive: 0x220033, icon: '🟪', label: '원거리', hp: 50,  atk: 15, reward: 2, moveDesc: '이동하지 않음',                  skillDesc: '3칸 내 HP 가장 낮은 아군 원거리 공격' },
  aoe:     { color: 0xcc8800, emissive: 0x221100, icon: '🟨', label: '폭발병', hp: 70,  atk: 10, reward: 2, moveDesc: '가장 가까운 아군 방향 1칸 전진', skillDesc: '주변 모든 아군 동시 폭발 공격' },
  healer:  { color: 0x00cc44, emissive: 0x002211, icon: '🟩', label: '치료사', hp: 55,  atk:  6, reward: 2, moveDesc: '부상 동료 없으면 아군 방향 전진',  skillDesc: '인접한 적군 중 HP 최저 동료 회복' },
  boss:    { color: 0xff2200, emissive: 0x440000, icon: '👹', label: '보스',   hp: 500, atk: 40, reward: 5, moveDesc: '가장 가까운 아군 방향 1칸 전진', skillDesc: '사거리 내 아군 1명 강력 공격' },
};

export class Enemy {
  constructor(type, gridX, gridZ) {
    this.id = eid++;
    this.type = type;
    this.gridX = gridX;
    this.gridZ = gridZ;
    this.mesh = null;
    this.placed = true;
    this.hpFill = null;

    const def = ENEMY_TYPES[type] ?? ENEMY_TYPES.normal;
    this.def = def;
    this.maxHp = def.hp + Math.random() * 20;
    this.hp = this.maxHp;
    this.attack = def.atk + Math.random() * 5;
    this.ticketReward = def.reward;
    this.color = def.color;
  }

  isAlive() { return this.hp > 0; }

  takeDamage(dmg) {
    this.hp = Math.max(0, this.hp - dmg);
    this._updateHpBar();
  }

  receiveHeal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this._updateHpBar();
  }

  buildMesh(scene, worldPos) {
    const group = new THREE.Group();

    const isBoss = this.type === 'boss';
    const size = isBoss ? [0.95, 1.4, 0.95] : [0.68, 0.88, 0.68];
    const geo = new THREE.BoxGeometry(...size);
    const mat = new THREE.MeshStandardMaterial({
      color: this.color, emissive: this.def.emissive, emissiveIntensity: 0.4, roughness: 0.6,
    });
    const body = new THREE.Mesh(geo, mat);
    body.position.y = size[1] / 2;
    body.castShadow = true;
    group.add(body);

    // Ability indicator orb on top
    if (this.type !== 'normal' && !isBoss) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshBasicMaterial({ color: this.color })
      );
      orb.position.y = size[1] + 0.2;
      group.add(orb);
    }

    // HP bar background
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false })
    );
    bg.rotation.x = -Math.PI / 2;
    bg.position.set(0, 0.05, 0);
    group.add(bg);

    // HP bar fill
    this.hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.07),
      new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false })
    );
    this.hpFill.rotation.x = -Math.PI / 2;
    this.hpFill.position.set(0, 0.06, 0);
    group.add(this.hpFill);

    group.position.copy(worldPos);
    scene.add(group);
    this.mesh = group;
  }

  _updateHpBar() {
    if (!this.hpFill) return;
    const ratio = this.hp / this.maxHp;
    this.hpFill.scale.x = Math.max(0, ratio);
    this.hpFill.position.x = -(1 - ratio) * 0.4;
  }

  remove(scene) {
    if (this.mesh) scene.remove(this.mesh);
    this.mesh = null;
  }
}

// Wave pool: which enemy types appear and their weights per wave
function pickEnemyType(waveNum) {
  const pool = [
    { type: 'normal', w: 50 },
    { type: 'charge', w: waveNum >= 2 ? 20 : 0 },
    { type: 'ranged', w: waveNum >= 2 ? 15 : 0 },
    { type: 'aoe',    w: waveNum >= 3 ? 10 : 0 },
    { type: 'healer', w: waveNum >= 3 ? 5  : 0 },
  ];
  const total = pool.reduce((s, p) => s + p.w, 0);
  let roll = Math.random() * total;
  for (const { type, w } of pool) {
    roll -= w;
    if (roll <= 0) return type;
  }
  return 'normal';
}

export function buildWave(waveNum, grid, scene) {
  const isBossWave = waveNum % 5 === 0;
  const count = Math.min(3 + waveNum, 15);
  const enemies = [];

  const enemyRows = [6, 7, 8];
  const positions = [];
  for (let c = 0; c < 7; c++)
    for (const r of enemyRows) positions.push([c, r]);

  // shuffle
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  const picked = positions.slice(0, count);
  for (const [c, r] of picked) {
    if (grid.isOccupied(c, r)) continue;
    const type = pickEnemyType(waveNum);
    const e = new Enemy(type, c, r);
    const wp = grid.toWorld(c, r); wp.y = 0;
    e.buildMesh(scene, wp);
    grid.setOccupied(c, r, e);
    enemies.push(e);
  }

  // Boss at center top on boss waves
  if (isBossWave && !grid.isOccupied(3, 8)) {
    const boss = new Enemy('boss', 3, 8);
    const wp = grid.toWorld(3, 8); wp.y = 0;
    boss.buildMesh(scene, wp);
    grid.setOccupied(3, 8, boss);
    enemies.push(boss);
  }

  return enemies;
}
