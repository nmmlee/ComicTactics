import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { buildRangeRing } from './rangeViz.js';

// Apply one character's attack at its current grid position
// Returns { tickets, killedAllies }
export function applyAttack(actor, allies, enemies, grid, scene, onKill) {
  const targets = actor.getTargets(actor.gridX, actor.gridZ, grid, allies, enemies);
  let tickets = 0;
  const killedAllies = [];

  for (const t of targets) {
    if (t instanceof Enemy) {
      if (!t.isAlive()) continue;
      spawnDamageEffect(scene, grid.toWorld(t.gridX, t.gridZ), actor.damage, false);
      t.takeDamage(actor.damage);
      if (!t.isAlive()) {
        tickets += t.ticketReward;
        if (onKill) onKill(t, false);
      }
    } else {
      if (!t.isAlive()) continue;
      if (actor.def.baseHeal > 0) {
        spawnDamageEffect(scene, grid.toWorld(t.gridX, t.gridZ), actor.heal, true);
        t.receiveHeal(actor.heal);
      } else {
        spawnDamageEffect(scene, grid.toWorld(t.gridX, t.gridZ), actor.damage, false);
        t.takeDamage(actor.damage);
        if (!t.isAlive()) {
          killedAllies.push(t);
          if (onKill) onKill(t, true);
        }
      }
    }
  }

  return { tickets, killedAllies };
}

// Enemy AI turn: each enemy acts based on its type
export function resolveEnemyTurn(enemies, allies, grid, scene, onKill) {
  const killedAllies = [];

  for (const e of enemies) {
    if (!e.isAlive()) continue;

    const livePlaced = allies.filter(a => a.placed && a.isAlive());
    if (livePlaced.length === 0) break;

    switch (e.type) {
      case 'charge':  doCharge(e, livePlaced, grid, scene, killedAllies, onKill); break;
      case 'ranged':  doRanged(e, livePlaced, grid, scene, killedAllies, onKill); break;
      case 'aoe':     doAoe(e, livePlaced, grid, scene, killedAllies, onKill);    break;
      case 'healer':  doHealerEnemy(e, enemies, livePlaced, grid, scene);         break;
      default:        doMeleeAdvance(e, livePlaced, grid, scene, killedAllies, onKill, 1); break;
    }
  }

  return { killedAllies };
}

// Shared: move `steps` cells toward nearest ally
function advanceToward(e, nearest, steps, grid) {
  for (let s = 0; s < steps; s++) {
    const dx = nearest.gridX - e.gridX;
    const dz = nearest.gridZ - e.gridZ;
    if (dx === 0 && dz === 0) break;
    let stepX = 0, stepZ = 0;
    if (Math.abs(dx) >= Math.abs(dz)) stepX = Math.sign(dx);
    else stepZ = Math.sign(dz);

    const nx = e.gridX + stepX;
    const nz = e.gridZ + stepZ;
    if (nx < 0 || nx >= 7 || nz < 0 || nz >= 9) break;
    const occupant = grid.getOccupied(nx, nz);
    if (occupant) break;

    grid.clearOccupied(e.gridX, e.gridZ);
    e.gridX = nx; e.gridZ = nz;
    grid.setOccupied(nx, nz, e);
    if (e.mesh) {
      const wp = grid.toWorld(nx, nz);
      e.mesh.position.set(wp.x, 0, wp.z);
    }
  }
}

function getNearestAlly(e, livePlaced) {
  let nearest = null, nearDist = Infinity;
  for (const a of livePlaced) {
    const d = Math.hypot(e.gridX - a.gridX, e.gridZ - a.gridZ);
    if (d < nearDist) { nearDist = d; nearest = a; }
  }
  return { nearest, nearDist };
}

function hitAlly(target, dmg, grid, scene, killedAllies, onKill, isHeal = false) {
  spawnDamageEffect(scene, grid.toWorld(target.gridX, target.gridZ), dmg, isHeal);
  if (isHeal) { target.receiveHeal?.(dmg); return; }
  target.takeDamage(dmg);
  if (!target.isAlive()) {
    killedAllies.push(target);
    if (onKill) onKill(target, true);
  }
}

// Normal: 1-step advance + melee
function doMeleeAdvance(e, livePlaced, grid, scene, killedAllies, onKill, steps) {
  const { nearest, nearDist } = getNearestAlly(e, livePlaced);
  if (nearDist > steps) advanceToward(e, nearest, steps, grid);
  const inRange = livePlaced.filter(a => Math.hypot(e.gridX - a.gridX, e.gridZ - a.gridZ) <= 1.5);
  if (inRange.length === 0) return;
  const target = inRange[Math.floor(Math.random() * inRange.length)];
  hitAlly(target, Math.round(e.attack), grid, scene, killedAllies, onKill);
}

// Charge: 2-step advance + heavy melee
function doCharge(e, livePlaced, grid, scene, killedAllies, onKill) {
  doMeleeAdvance(e, livePlaced, grid, scene, killedAllies, onKill, 2);
}

// Ranged: doesn't move, attacks ally within 3 cells
function doRanged(e, livePlaced, grid, scene, killedAllies, onKill) {
  const inRange = livePlaced.filter(a => Math.hypot(e.gridX - a.gridX, e.gridZ - a.gridZ) <= 3);
  if (inRange.length === 0) return;
  // Pick the ally with lowest HP in range
  inRange.sort((a, b) => a.hp - b.hp);
  hitAlly(inRange[0], Math.round(e.attack), grid, scene, killedAllies, onKill);
}

// AoE: 1-step advance, then hit ALL allies within 1.8 cells
function doAoe(e, livePlaced, grid, scene, killedAllies, onKill) {
  const { nearest, nearDist } = getNearestAlly(e, livePlaced);
  if (nearDist > 1) advanceToward(e, nearest, 1, grid);
  const inRange = livePlaced.filter(a => Math.hypot(e.gridX - a.gridX, e.gridZ - a.gridZ) <= 1.8);
  for (const target of inRange) {
    hitAlly(target, Math.round(e.attack), grid, scene, killedAllies, onKill);
  }
}

// Healer enemy: heals adjacent injured enemies instead of attacking
function doHealerEnemy(e, allEnemies, livePlaced, grid, scene) {
  const wounded = allEnemies.filter(en =>
    en !== e && en.isAlive() && en.hp < en.maxHp &&
    Math.hypot(e.gridX - en.gridX, e.gridZ - en.gridZ) <= 1.5
  );
  if (wounded.length > 0) {
    const target = wounded.reduce((a, b) => a.hp < b.hp ? a : b);
    const healAmt = Math.round(e.attack * 1.5);
    spawnDamageEffect(scene, grid.toWorld(target.gridX, target.gridZ), healAmt, true);
    target.receiveHeal(healAmt);
  } else {
    // If no wounded nearby, advance toward player
    const { nearest } = getNearestAlly(e, livePlaced);
    advanceToward(e, nearest, 1, grid);
  }
}

function spawnDamageEffect(scene, pos, value, isHeal) {
  const geo = new THREE.SphereGeometry(0.12, 6, 6);
  const mat = new THREE.MeshBasicMaterial({
    color: isHeal ? 0x44ff88 : 0xff4444,
    transparent: true, opacity: 0.9,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos.x, 0.8, pos.z);
  scene.add(mesh);

  let t = 0;
  function animate() {
    t += 0.03;
    mesh.position.y += 0.03;
    mesh.material.opacity = Math.max(0, 0.9 - t * 0.9);
    if (t < 1) requestAnimationFrame(animate);
    else scene.remove(mesh);
  }
  animate();
}
