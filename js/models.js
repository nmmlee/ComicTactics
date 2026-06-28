import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const _cache = {};

const FILES = {
  attacker:     'models/Warrior_shaded.glb',
  healer:       'models/Healer_shaded.glb',
  piercer:      'models/Archer_shaded.glb',
  enemy_normal: 'models/Skeleton_Warrior_shaded.glb',
  enemy_charge: 'models/Golem_shaded.glb',
  enemy_ranged: 'models/Skeleton_Archer.glb',
  enemy_healer: 'models/Owl_Healer_shaded.glb',
  enemy_boss:   'models/DragonBoss_shaded.glb',
};

const TARGET_HEIGHT = 1.0; // 월드 유닛 기준 캐릭터 높이

function _load(type) {
  return new Promise((resolve, reject) => {
    loader.load(FILES[type], gltf => {
      const root = gltf.scene;

      // _shaded 모델은 라이팅이 텍스처에 베이크된 상태.
      // GLTFLoader가 설정한 원본 재질을 건드리지 않고,
      // emissiveMap = map 으로 텍스처가 씬 라이팅과 무관하게 스스로 색을 내도록 함.
      root.traverse(child => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;

        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => {
          if (!m.isMeshStandardMaterial) return;
          // 텍스처 기반 모델: emissiveMap으로 텍스처 자체 발광
          if (m.map) {
            m.emissiveMap = m.map;
            m.emissive.set(0xffffff);
            m.emissiveIntensity = 0.85;
          }
          // 버텍스 컬러 기반 모델: emissive color로 기본 색 자체 발광
          if (!m.map && m.vertexColors) {
            m.emissive.copy(m.color);
            m.emissiveIntensity = 0.85;
          }
          m.roughness = 1.0;
          m.metalness = 0.0;
          m.needsUpdate = true;
        });
      });

      // 높이 정규화 (모델 크기에 관계없이 TARGET_HEIGHT로 맞춤)
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      if (size.y > 0) root.scale.setScalar(TARGET_HEIGHT / size.y);

      // 바닥을 y=0에 정렬
      box.setFromObject(root);
      root.position.y = -box.min.y;

      _cache[type] = root;
      resolve();
    }, undefined, err => {
      console.error(`[models] ${type} 로드 실패:`, err);
      reject(err);
    });
  });
}

export function preloadModels() {
  return Promise.all(Object.keys(FILES).map(_load));
}

export function getModel(type) {
  const src = _cache[type];
  if (!src) return null;
  return src.clone(true);
}

// 선택/이동 상태 표시: emissive 추가 발광으로 tint 처리
// intensity 0 = 평상시(emissiveIntensity 0.85 유지), 양수 = 선택 glow
export function setModelEmissive(modelGroup, color, intensity) {
  modelGroup.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(m => {
      if (!m.isMeshStandardMaterial) return;
      if (intensity <= 0) {
        // 평상시: emissive를 흰색으로 유지 (베이크 텍스처 자체 발광)
        m.emissive.set(0xffffff);
        m.emissiveIntensity = 0.85;
      } else {
        // 선택/활성: 지정 색상으로 추가 발광
        m.emissive.set(color);
        m.emissiveIntensity = 0.85 + intensity;
      }
    });
  });
}
