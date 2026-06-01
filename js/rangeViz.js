import * as THREE from 'three';
import { COLS, ROWS, CELL } from './grid.js';

// 아군 공격 범위 계산 (Chebyshev for circle, column-only for line)
export function getAttackCells(col, row, rangeType, range) {
  const cells = [];
  if (rangeType === 'circle') {
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (c === col && r === row) continue;
        if (Math.max(Math.abs(c - col), Math.abs(r - row)) <= range) cells.push({ c, r });
      }
    }
  } else if (rangeType === 'line') {
    for (let r = 0; r < ROWS; r++) {
      if (r !== row && Math.abs(r - row) <= range) cells.push({ c: col, r });
    }
  }
  return cells;
}

// 적 공격 범위 계산 (Euclidean, combat.js 로직과 동일)
export function getEnemyAttackCells(col, row, type) {
  const threshold = type === 'ranged' ? 3 : type === 'aoe' ? 1.8 : 1.5;
  const maxR = Math.ceil(threshold);
  const cells = [];
  for (let dc = -maxR; dc <= maxR; dc++) {
    for (let dr = -maxR; dr <= maxR; dr++) {
      if (dc === 0 && dr === 0) continue;
      if (Math.hypot(dc, dr) <= threshold) {
        const c = col + dc, r = row + dr;
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) cells.push({ c, r });
      }
    }
  }
  return cells;
}

// 각 셀 4모서리에 조준 브라켓(L자) 생성 후 scene에 추가
export function buildXMarkers(scene, grid, cells, color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthTest: false });

  const half = CELL * 0.94 / 2;  // 셀 내부 절반 크기
  const arm  = 0.28;              // 브라켓 팔 길이
  const thk  = 0.07;              // 브라켓 두께
  const yPos = 0.07;

  for (const { c, r } of cells) {
    const wp = grid.toWorld(c, r);

    for (const [sx, sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
      // 가로 팔 (X축)
      const hBar = new THREE.Mesh(
        new THREE.BoxGeometry(arm, thk, thk),
        mat.clone()
      );
      hBar.position.set(wp.x + sx * (half - arm / 2), yPos, wp.z + sz * half);
      group.add(hBar);

      // 세로 팔 (Z축)
      const vBar = new THREE.Mesh(
        new THREE.BoxGeometry(thk, thk, arm),
        mat.clone()
      );
      vBar.position.set(wp.x + sx * half, yPos, wp.z + sz * (half - arm / 2));
      group.add(vBar);
    }
  }

  scene.add(group);
  return group;
}
