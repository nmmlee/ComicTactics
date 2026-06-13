import * as THREE from 'three';

export const COLS = 7;
export const ROWS = 9;
export const CELL = 1.4; // world units per cell

const TILE_MAT = {
  normal: 0x8abe68,
  ally:   0x76b058,
  enemy:  0x9ece76,
};

export class Grid {
  constructor(scene) {
    this.scene = scene;
    this.cells = [];
    this._buildTiles();
    this._buildFence();
    this._plantDecorations();
  }

  _plantDecorations() {
    // 꽃/선인장 배치할 타일 목록 (col, row, type)
    const spots = [
      { c:0, r:3, t:'flower_w' }, { c:2, r:4, t:'flower_w' }, { c:5, r:5, t:'flower_w' },
      { c:4, r:3, t:'flower_w' }, { c:6, r:7, t:'flower_w' },
      { c:1, r:5, t:'flower_y' }, { c:3, r:7, t:'flower_y' }, { c:5, r:3, t:'flower_y' },
      { c:0, r:6, t:'cactus'   }, { c:6, r:4, t:'cactus'   }, { c:3, r:5, t:'cactus'   },
      { c:2, r:7, t:'cactus'   }, { c:5, r:6, t:'cactus'   },
    ];

    spots.forEach(({ c, r, t }) => {
      const pos = this.toWorld(c, r);
      const ox = (Math.random() - 0.5) * CELL * 0.45;
      const oz = (Math.random() - 0.5) * CELL * 0.45;
      if (t === 'flower_w') this._addFlower(pos.x + ox, pos.z + oz, 0xffffff, 0xffd700);
      if (t === 'flower_y') this._addFlower(pos.x + ox, pos.z + oz, 0xffd700, 0xff8800);
      if (t === 'cactus')   this._addCactus(pos.x + ox, pos.z + oz);
    });
  }

  _addFlower(x, z, petalColor, centerColor) {
    const Y = 0.13;
    const petalMat = new THREE.MeshStandardMaterial({ color: petalColor, roughness: 0.6 });
    const centerMat = new THREE.MeshStandardMaterial({ color: centerColor, roughness: 0.5 });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a8a2a, roughness: 0.8 });
    const ps = 0.10, ph = 0.06; // 꽃잎 크기

    // 줄기
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05), stemMat);
    stem.position.set(x, Y - 0.03, z);
    this.scene.add(stem);

    // 꽃잎 4개 (십자 배치)
    [
      [ps, 0,   0  ],
      [-ps, 0,  0  ],
      [0,   0,  ps ],
      [0,   0, -ps ],
    ].forEach(([dx, dy, dz]) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(ph, ph, ph), petalMat.clone());
      p.position.set(x + dx, Y, z + dz);
      this.scene.add(p);
    });

    // 중앙 노란 네모
    const center = new THREE.Mesh(new THREE.BoxGeometry(ph, ph, ph), centerMat);
    center.position.set(x, Y, z);
    this.scene.add(center);

    // 작은 녹색 잎
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.06), stemMat.clone());
    leaf.position.set(x + 0.07, Y - 0.01, z + 0.04);
    this.scene.add(leaf);
  }

  _addCactus(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a9a2a, roughness: 0.75 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2e6a18, roughness: 0.75 });

    // 작은 큐브 클러스터 (3~5개)
    const blocks = [
      { dx:  0.00, dy: 0.08, dz:  0.00, w: 0.12, h: 0.16, d: 0.12, m: mat },
      { dx:  0.00, dy: 0.22, dz:  0.00, w: 0.09, h: 0.14, d: 0.09, m: darkMat },
      { dx:  0.12, dy: 0.09, dz:  0.04, w: 0.09, h: 0.18, d: 0.09, m: mat },
      { dx: -0.10, dy: 0.07, dz:  0.08, w: 0.08, h: 0.14, d: 0.08, m: darkMat },
      { dx:  0.04, dy: 0.05, dz: -0.10, w: 0.10, h: 0.10, d: 0.10, m: mat },
    ];

    blocks.forEach(({ dx, dy, dz, w, h, d, m }) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m.clone());
      b.position.set(x + dx, dy, z + dz);
      b.castShadow = true;
      this.scene.add(b);
    });
  }

  _buildTiles() {
    const tileGeo = new THREE.BoxGeometry(CELL * 0.98, 0.12, CELL * 0.98);
    const edgeGeo = new THREE.EdgesGeometry(tileGeo);

    for (let c = 0; c < COLS; c++) {
      this.cells[c] = [];
      for (let r = 0; r < ROWS; r++) {
        let color = TILE_MAT.normal;
        if (r < 3)           color = TILE_MAT.ally;
        else if (r >= ROWS - 3) color = TILE_MAT.enemy;

        const mat = new THREE.MeshStandardMaterial({
          color, roughness: 0.8, metalness: 0,
        });
        const mesh = new THREE.Mesh(tileGeo, mat);
        const pos = this.toWorld(c, r);
        mesh.position.set(pos.x, 0.06, pos.z);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        this.scene.add(mesh);

        // 격자선
        const line = new THREE.LineSegments(
          edgeGeo,
          new THREE.LineBasicMaterial({ color: 0x5a8a40, transparent: true, opacity: 0.5 })
        );
        line.position.set(pos.x, 0.06, pos.z);
        this.scene.add(line);

        this.cells[c][r] = { mesh, occupied: null };
      }
    }
  }

  _buildFence() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xa0724a, roughness: 0.85 });

    // 기둥: 세로로 긴 직육면체
    const postW = 0.18, postH = 0.72, postD = 0.18;
    // 레일: 가로로 긴 직육면체
    const railW = CELL - postW, railH = 0.12, railD = 0.12;

    const halfBx = (COLS * CELL) / 2;
    const halfBz = (ROWS * CELL) / 2;

    // 기둥 위치를 타일 경계(코너)에 배치
    // 기둥은 각 타일 사이 경계선 교차점에 위치
    // 좌측/우측 펜스: x = ±halfBx, z = -halfBz + i*CELL (i = 0..ROWS)
    // 상단/하단 펜스: z = ±halfBz, x = -halfBx + j*CELL (j = 0..COLS)

    const postGeo = new THREE.BoxGeometry(postW, postH, postD);
    const railGeoZ = new THREE.BoxGeometry(railD, railH, railW); // 좌우벽용 (Z방향 레일)
    const railGeoX = new THREE.BoxGeometry(railW, railH, railD); // 상하벽용 (X방향 레일)

    const addMesh = (geo, x, y, z) => {
      const m = new THREE.Mesh(geo, woodMat.clone());
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    };

    // 왼쪽 벽 (x = -halfBx)
    for (let i = 0; i <= ROWS; i++) {
      const z = -halfBz + i * CELL;
      addMesh(postGeo, -halfBx, postH / 2, z);
      if (i < ROWS) {
        const mz = z + CELL / 2;
        addMesh(railGeoZ, -halfBx, 0.48, mz); // 위 레일
        addMesh(railGeoZ, -halfBx, 0.22, mz); // 아래 레일
      }
    }

    // 오른쪽 벽 (x = +halfBx)
    for (let i = 0; i <= ROWS; i++) {
      const z = -halfBz + i * CELL;
      addMesh(postGeo, halfBx, postH / 2, z);
      if (i < ROWS) {
        const mz = z + CELL / 2;
        addMesh(railGeoZ, halfBx, 0.48, mz);
        addMesh(railGeoZ, halfBx, 0.22, mz);
      }
    }

    // 앞쪽 벽 (z = -halfBz) - 코너 기둥은 이미 위에서 생성됨
    for (let j = 0; j <= COLS; j++) {
      const x = -halfBx + j * CELL;
      addMesh(postGeo, x, postH / 2, -halfBz);
      if (j < COLS) {
        const mx = x + CELL / 2;
        addMesh(railGeoX, mx, 0.48, -halfBz);
        addMesh(railGeoX, mx, 0.22, -halfBz);
      }
    }

    // 뒤쪽 벽 (z = +halfBz)
    for (let j = 0; j <= COLS; j++) {
      const x = -halfBx + j * CELL;
      addMesh(postGeo, x, postH / 2, halfBz);
      if (j < COLS) {
        const mx = x + CELL / 2;
        addMesh(railGeoX, mx, 0.48, halfBz);
        addMesh(railGeoX, mx, 0.22, halfBz);
      }
    }
  }

  toWorld(col, row) {
    const ox = -((COLS - 1) / 2) * CELL;
    const oz = -((ROWS - 1) / 2) * CELL;
    return new THREE.Vector3(ox + col * CELL, 0, oz + row * CELL);
  }

  fromWorld(wx, wz) {
    const ox = -((COLS - 1) / 2) * CELL;
    const oz = -((ROWS - 1) / 2) * CELL;
    const c = Math.round((wx - ox) / CELL);
    const r = Math.round((wz - oz) / CELL);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { col: c, row: r };
  }

  isOccupied(col, row)          { return !!this.cells[col]?.[row]?.occupied; }
  setOccupied(col, row, entity) { if (this.cells[col]?.[row]) this.cells[col][row].occupied = entity; }
  clearOccupied(col, row)       { if (this.cells[col]?.[row]) this.cells[col][row].occupied = null; }
  getOccupied(col, row)         { return this.cells[col]?.[row]?.occupied ?? null; }

  highlight(col, row, color) {
    if (this.cells[col]?.[row]) {
      this.cells[col][row].mesh.material.emissive = new THREE.Color(color);
      this.cells[col][row].mesh.material.emissiveIntensity = 0.9;
    }
  }

  clearHighlights() {
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++)
        this.cells[c][r].mesh.material.emissiveIntensity = 0;
  }
}
