import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Grid, COLS, ROWS, CELL } from './grid.js';

export const canvas = document.getElementById('canvas');

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 저폴리 스타일에 최적
renderer.toneMapping = THREE.LinearToneMapping;   // ACESFilmic은 저폴리 색상을 죽임
renderer.toneMappingExposure = 1.0;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8d4);
scene.fog = new THREE.Fog(0x87b8d4, 30, 55);

export const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 14, 10);
camera.lookAt(0, 0, 0);

export const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI / 2.3;
controls.target.set(0, 0, 0);

// 앰비언트: 너무 강하면 그림자가 안 보임 — 적당히 낮춤
scene.add(new THREE.AmbientLight(0xfff0d0, 1.1));

// 태양광: 저폴리 특유의 명확한 측면 그림자를 위해 45° 비스듬히
const sun = new THREE.DirectionalLight(0xfff8e8, 2.2);
sun.position.set(8, 18, 6);
sun.castShadow = true;

// frustum을 씬에 딱 맞게 타이트하게 → 해상도 낭비 없이 선명
const boardHalf = Math.max(COLS, ROWS) * CELL * 0.5 + 6;
sun.shadow.camera.left   = -boardHalf;
sun.shadow.camera.right  =  boardHalf;
sun.shadow.camera.top    =  boardHalf;
sun.shadow.camera.bottom = -boardHalf;
sun.shadow.camera.near   = 0.5;
sun.shadow.camera.far    = 50;

// 2048 해상도 + PCFSoft → 부드럽고 선명한 그림자
sun.shadow.mapSize.set(2048, 2048);

// shadow acne 방지 (저폴리 박스에 최적화된 값)
sun.shadow.bias       = -0.0005;
sun.shadow.normalBias =  0.02;

// 그림자 경계 소프트니스 (1=선명, 8=매우부드럽 — 저폴리엔 3~4가 적합)
sun.shadow.radius = 3;

scene.add(sun);

// 보조광: 그림자 부분이 완전히 검지 않게 쿨 블루 계열
const fill = new THREE.PointLight(0x88aadd, 0.6, 40);
fill.position.set(-8, 6, -4);
scene.add(fill);

// 헤미스피어: 하늘/땅 색 반사로 자연스러운 ambient occlusion 효과
scene.add(new THREE.HemisphereLight(0xc8dff0, 0xb8a870, 0.8));

// 바닥 (모래색)
const groundGeo = new THREE.PlaneGeometry(COLS * CELL + 30, ROWS * CELL + 30);
const ground = new THREE.Mesh(
  groundGeo,
  new THREE.MeshStandardMaterial({ color: 0xd4b483, roughness: 1.0, metalness: 0 })
);
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

export const grid = new Grid(scene);

// 나무 색상 팔레트
const TREE_COLORS = [
  { body: 0x8ece3a, top: 0xb8e84a }, // 밝은 연두
  { body: 0x5aa022, top: 0x7cc83a }, // 중간 초록
  { body: 0x3e8818, top: 0x5aaa2e }, // 진한 초록
  { body: 0xa0c030, top: 0xc8e040 }, // 노란-초록
];

// idle 애니메이션 대상 목록
const idleObjects = [];

// Group을 씬에 배치하고 idle 등록
function _addIdleGroup(group, wx, wz, speed, amplitude, phase) {
  group.position.set(wx, 0, wz);
  scene.add(group);
  idleObjects.push({ group, speed, amplitude, phase });
}

function _m(group, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  group.add(m);
}

// 타입 A: 세로 막대 + 가로 판 교차
function _treeA(g, s, bodyMat, topMat, trunkMat) {
  _m(g, new THREE.BoxGeometry(0.28*s, 0.30*s, 0.28*s), trunkMat, 0, 0.15*s, 0);
  const tallH = 1.55*s;
  _m(g, new THREE.BoxGeometry(0.72*s, tallH, 0.72*s), bodyMat, 0, 0.30*s + tallH/2, 0);
  _m(g, new THREE.BoxGeometry(1.2*s, 0.68*s, 1.0*s), topMat, 0, 0.30*s + tallH*0.42, 0);
}

// 타입 B: T자형 (기둥 + 위에 넓은 판)
function _treeB(g, s, bodyMat, topMat, trunkMat) {
  _m(g, new THREE.BoxGeometry(0.32*s, 0.38*s, 0.32*s), trunkMat, 0, 0.19*s, 0);
  const pillarH = 1.0*s;
  _m(g, new THREE.BoxGeometry(0.60*s, pillarH, 0.60*s), bodyMat, 0, 0.38*s + pillarH/2, 0);
  _m(g, new THREE.BoxGeometry(1.3*s, 0.55*s, 1.1*s), topMat, 0, 0.38*s + pillarH + 0.28*s, 0);
  _m(g, new THREE.BoxGeometry(0.50*s, 0.40*s, 0.50*s), bodyMat, 0, 0.38*s + pillarH + 0.75*s, 0);
}

// 타입 C: 계단식 3단 피라미드
function _treeC(g, s, bodyMat, topMat, trunkMat) {
  _m(g, new THREE.BoxGeometry(0.24*s, 0.44*s, 0.24*s), trunkMat, 0, 0.22*s, 0);
  const base = 0.44*s;
  _m(g, new THREE.BoxGeometry(1.1*s, 0.50*s, 0.95*s), topMat,  0, base + 0.25*s, 0);
  _m(g, new THREE.BoxGeometry(0.80*s, 0.50*s, 0.70*s), bodyMat, 0, base + 0.75*s, 0);
  _m(g, new THREE.BoxGeometry(0.50*s, 0.45*s, 0.50*s), topMat,  0, base + 1.20*s, 0);
}

// 타입 D: 옆으로 불룩한 덤불형
function _treeD(g, s, bodyMat, topMat, trunkMat) {
  _m(g, new THREE.BoxGeometry(0.30*s, 0.22*s, 0.30*s), trunkMat, 0, 0.11*s, 0);
  _m(g, new THREE.BoxGeometry(1.25*s, 0.80*s, 1.0*s), bodyMat, 0, 0.22*s + 0.40*s, 0);
  _m(g, new THREE.BoxGeometry(0.50*s, 0.65*s, 0.65*s), topMat, -0.60*s, 0.22*s + 0.33*s, 0);
  _m(g, new THREE.BoxGeometry(0.45*s, 0.60*s, 0.60*s), topMat,  0.58*s, 0.22*s + 0.30*s, 0);
  _m(g, new THREE.BoxGeometry(0.55*s, 0.38*s, 0.55*s), bodyMat, 0.10*s, 0.22*s + 0.99*s, -0.08*s);
}

function addTree(x, z, scale = 1.0, colorIdx = 0, type = 0) {
  const col = TREE_COLORS[colorIdx % TREE_COLORS.length];
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3510, roughness: 0.9 });
  const bodyMat  = new THREE.MeshStandardMaterial({ color: col.body, roughness: 0.65 });
  const topMat   = new THREE.MeshStandardMaterial({ color: col.top,  roughness: 0.65 });
  const g = new THREE.Group();
  [_treeA, _treeB, _treeC, _treeD][type % 4](g, scale, bodyMat, topMat, trunkMat);
  // 각 나무마다 속도·위상 랜덤으로 다르게 → 동시에 같이 흔들리지 않음
  const phase = (x * 3.7 + z * 2.1) % (Math.PI * 2);
  _addIdleGroup(g, x, z, 0.45 + (type * 0.08), 0.025, phase);
}

// 맵 주변 꽃
function addWorldFlower(x, z, petalColor, centerColor) {
  const g = new THREE.Group();
  const stemMat   = new THREE.MeshStandardMaterial({ color: 0x3a7a1a, roughness: 0.8 });
  const petalMat  = new THREE.MeshStandardMaterial({ color: petalColor, roughness: 0.6 });
  const centerMat = new THREE.MeshStandardMaterial({ color: centerColor, roughness: 0.5 });

  _m(g, new THREE.BoxGeometry(0.08, 0.55, 0.08), stemMat, 0, 0.28, 0);
  const ps = 0.18;
  [[ps,0,0],[-ps,0,0],[0,0,ps],[0,0,-ps]].forEach(([dx,,dz]) => {
    _m(g, new THREE.BoxGeometry(0.12, 0.12, 0.12), petalMat.clone(), dx, 0.56, dz);
  });
  _m(g, new THREE.BoxGeometry(0.13, 0.13, 0.13), centerMat, 0, 0.56, 0);

  const phase = (x * 5.1 + z * 3.3) % (Math.PI * 2);
  _addIdleGroup(g, x, z, 0.9 + Math.abs(Math.sin(x + z)) * 0.4, 0.035, phase);
}

// 소
function addCow(x, z) {
  const g = new THREE.Group();
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf0ede0, roughness: 0.8 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  const brownMat = new THREE.MeshStandardMaterial({ color: 0x8b6040, roughness: 0.8 });
  const pinkMat  = new THREE.MeshStandardMaterial({ color: 0xe8a090, roughness: 0.7 });

  _m(g, new THREE.BoxGeometry(0.90, 0.55, 0.55), whiteMat,  0,    0.62,  0);
  _m(g, new THREE.BoxGeometry(0.30, 0.56, 0.20), blackMat, -0.18, 0.62,  0.18);
  _m(g, new THREE.BoxGeometry(0.22, 0.56, 0.18), blackMat,  0.22, 0.62, -0.15);
  _m(g, new THREE.BoxGeometry(0.44, 0.40, 0.42), whiteMat,  0.58, 0.68,  0);
  _m(g, new THREE.BoxGeometry(0.44, 0.18, 0.42), brownMat,  0.58, 0.97,  0);
  _m(g, new THREE.BoxGeometry(0.07, 0.07, 0.06), blackMat,  0.81, 0.76,  0.13);
  _m(g, new THREE.BoxGeometry(0.07, 0.07, 0.06), blackMat,  0.81, 0.76, -0.13);
  _m(g, new THREE.BoxGeometry(0.18, 0.14, 0.12), pinkMat,   0.82, 0.56,  0);
  _m(g, new THREE.BoxGeometry(0.10, 0.14, 0.08), brownMat,  0.58, 1.06,  0.24);
  _m(g, new THREE.BoxGeometry(0.10, 0.14, 0.08), brownMat,  0.58, 1.06, -0.24);
  _m(g, new THREE.BoxGeometry(0.18, 0.34, 0.18), blackMat, -0.30, 0.17,  0.16);
  _m(g, new THREE.BoxGeometry(0.18, 0.34, 0.18), blackMat, -0.30, 0.17, -0.16);
  _m(g, new THREE.BoxGeometry(0.18, 0.34, 0.18), blackMat,  0.24, 0.17,  0.16);
  _m(g, new THREE.BoxGeometry(0.18, 0.34, 0.18), blackMat,  0.24, 0.17, -0.16);

  // 소는 아주 살짝 좌우 흔들림
  _addIdleGroup(g, x, z, 0.30, 0.012, 0);
}

const HBX = (COLS * CELL) / 2; // 4.9
const HBZ = (ROWS * CELL) / 2; // 6.3

// 아군 뒤쪽(z 음수)에는 나무 없음 — 타입(t)을 다르게 해서 모양 변화
const treePositions = [
  // 왼쪽
  { x: -HBX - 2.2, z: -3.5, s: 1.3, c: 1, t: 0 },
  { x: -HBX - 1.6, z: -0.8, s: 1.0, c: 0, t: 2 },
  { x: -HBX - 2.8, z:  2.2, s: 1.2, c: 3, t: 1 },
  { x: -HBX - 1.4, z:  4.8, s: 0.85,c: 2, t: 3 },
  // 오른쪽
  { x:  HBX + 2.0, z: -3.0, s: 1.1, c: 2, t: 1 },
  { x:  HBX + 1.5, z:  0.5, s: 1.3, c: 0, t: 3 },
  { x:  HBX + 2.6, z:  3.0, s: 0.9, c: 1, t: 0 },
  { x:  HBX + 1.8, z:  5.2, s: 1.0, c: 3, t: 2 },
  // 앞쪽
  { x: -HBX - 1.0, z:  HBZ + 1.8, s: 1.3, c: 2, t: 2 },
  { x: -0.8,       z:  HBZ + 2.2, s: 1.1, c: 1, t: 0 },
  { x:  HBX + 0.8, z:  HBZ + 1.6, s: 1.4, c: 0, t: 1 },
  { x:  2.2,       z:  HBZ + 2.8, s: 0.9, c: 3, t: 3 },
];

treePositions.forEach(({ x, z, s, c, t }) => addTree(x, z, s, c, t));

// 소
addCow(-HBX - 2.0, 1.5);

// 맵 주변 꽃 (울타리 바깥 모래 위)
const FLOWER_COLORS = [
  { p: 0x55ccff, c: 0xffee44 }, // 파란 꽃
  { p: 0xffffff, c: 0xffd700 }, // 흰 꽃
  { p: 0xff88cc, c: 0xffaa00 }, // 분홍 꽃
  { p: 0xffdd44, c: 0xff8800 }, // 노란 꽃
];
const flowerSpots = [
  { x: -HBX - 1.2, z: -4.5, ci: 0 }, { x: -HBX - 3.0, z: -1.5, ci: 1 },
  { x: -HBX - 0.8, z:  1.8, ci: 2 }, { x: -HBX - 2.5, z:  4.0, ci: 0 },
  { x:  HBX + 1.0, z: -4.0, ci: 3 }, { x:  HBX + 2.8, z: -1.0, ci: 1 },
  { x:  HBX + 1.3, z:  2.5, ci: 0 }, { x:  HBX + 2.0, z:  4.8, ci: 2 },
  { x: -1.5,       z:  HBZ + 1.0, ci: 3 }, { x:  0.8, z: HBZ + 2.0, ci: 0 },
  { x:  2.5,       z:  HBZ + 1.2, ci: 1 }, { x: -3.0, z: HBZ + 1.5, ci: 2 },
  { x: -HBX - 1.8, z: -2.8, ci: 2 }, { x:  HBX + 3.2, z:  1.5, ci: 3 },
];
flowerSpots.forEach(({ x, z, ci }) => {
  const fc = FLOWER_COLORS[ci];
  addWorldFlower(x, z, fc.p, fc.c);
  // 옆에 하나 더 (군집 효과)
  addWorldFlower(x + 0.3, z + 0.25, fc.p, fc.c);
});

const frameCallbacks = [];
export function onFrame(fn) { frameCallbacks.push(fn); }

export function startRenderLoop() {
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    const t = performance.now() / 1000;

    // 장식물 idle: 살랑살랑 흔들림 (rotation.z = sin wave)
    for (const { group, speed, amplitude, phase } of idleObjects) {
      group.rotation.z = Math.sin(t * speed + phase) * amplitude;
      // X축으로도 살짝 → 입체감 있는 흔들림
      group.rotation.x = Math.sin(t * speed * 0.7 + phase + 1.2) * amplitude * 0.5;
    }

    for (const fn of frameCallbacks) fn(t);
    renderer.render(scene, camera);
  }
  animate();
}
