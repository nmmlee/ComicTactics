import * as THREE from 'three';

export const COLS = 7;
export const ROWS = 9;
export const CELL = 1.4; // world units per cell

export class Grid {
  constructor(scene) {
    this.scene = scene;
    this.cells = []; // 2D array [col][row] -> { mesh, occupied: null }
    this._buildMesh();
  }

  _buildMesh() {
    const geo = new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94);
    const matNormal = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e, roughness: 0.9, transparent: true, opacity: 0.85,
    });
    const matAlly = new THREE.MeshStandardMaterial({
      color: 0x1a3a1a, roughness: 0.9, transparent: true, opacity: 0.85,
    });
    const matEnemy = new THREE.MeshStandardMaterial({
      color: 0x3a1a1a, roughness: 0.9, transparent: true, opacity: 0.85,
    });

    for (let c = 0; c < COLS; c++) {
      this.cells[c] = [];
      for (let r = 0; r < ROWS; r++) {
        // bottom 3 rows = player zone, top 3 = enemy zone
        let mat = matNormal.clone();
        if (r < 3) mat = matAlly.clone();
        else if (r >= ROWS - 3) mat = matEnemy.clone();

        const mesh = new THREE.Mesh(geo, mat);
        const pos = this.toWorld(c, r);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(pos.x, 0.01, pos.z);
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        // border lines
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0x333355, transparent: true, opacity: 0.4 })
        );
        line.rotation.x = -Math.PI / 2;
        line.position.set(pos.x, 0.02, pos.z);
        this.scene.add(line);

        this.cells[c][r] = { mesh, occupied: null };
      }
    }
  }

  toWorld(col, row) {
    const ox = -((COLS - 1) / 2) * CELL;
    const oz = -((ROWS - 1) / 2) * CELL;
    return new THREE.Vector3(ox + col * CELL, 0, oz + row * CELL);
  }

  // Returns {col, row} from world XZ, or null if out of bounds
  fromWorld(wx, wz) {
    const ox = -((COLS - 1) / 2) * CELL;
    const oz = -((ROWS - 1) / 2) * CELL;
    const c = Math.round((wx - ox) / CELL);
    const r = Math.round((wz - oz) / CELL);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { col: c, row: r };
  }

  isOccupied(col, row) {
    return !!this.cells[col]?.[row]?.occupied;
  }

  setOccupied(col, row, entity) {
    if (this.cells[col]?.[row]) this.cells[col][row].occupied = entity;
  }

  clearOccupied(col, row) {
    if (this.cells[col]?.[row]) this.cells[col][row].occupied = null;
  }

  getOccupied(col, row) {
    return this.cells[col]?.[row]?.occupied ?? null;
  }

  highlight(col, row, color) {
    if (this.cells[col]?.[row]) {
      this.cells[col][row].mesh.material.emissive = new THREE.Color(color);
      this.cells[col][row].mesh.material.emissiveIntensity = 0.5;
    }
  }

  clearHighlights() {
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        this.cells[c][r].mesh.material.emissiveIntensity = 0;
      }
    }
  }
}
