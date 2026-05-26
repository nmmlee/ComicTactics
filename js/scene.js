import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Grid, COLS, ROWS, CELL } from './grid.js';

export const canvas = document.getElementById('canvas');

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3a55);
scene.fog = new THREE.Fog(0x2a3a55, 22, 40);

export const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 14, 10);
camera.lookAt(0, 0, 0);

export const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI / 2.4;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0xb8c8e0, 2.4));

const sun = new THREE.DirectionalLight(0xfff4e0, 2.8);
sun.position.set(5, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const fill = new THREE.PointLight(0x88aaff, 1.4, 30);
fill.position.set(-5, 8, -5);
scene.add(fill);

const hemi = new THREE.HemisphereLight(0xddeeff, 0x4a5570, 1.2);
scene.add(hemi);

const groundGeo = new THREE.PlaneGeometry(COLS * CELL + 2, ROWS * CELL + 2);
const ground = new THREE.Mesh(
  groundGeo,
  new THREE.MeshStandardMaterial({ color: 0x3a4055, roughness: 1 })
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

const frameCallbacks = [];
export function onFrame(fn) { frameCallbacks.push(fn); }

export function startRenderLoop() {
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    const t = performance.now() / 1000;
    for (const fn of frameCallbacks) fn(t);
    renderer.render(scene, camera);
  }
  animate();
}
