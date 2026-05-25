import * as THREE from 'three';

export function buildRangeRing(scene, type, range, color) {
  if (type === 'circle') {
    const geo = new THREE.RingGeometry(range - 0.05, range + 0.05, 48);
    const mat = new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, transparent: true, opacity: 0.6,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    scene.add(ring);
    return ring;
  }

  if (type === 'line') {
    // 앞뒤 양방향 → 전체 길이 range*2, 중심 기준
    const geo = new THREE.PlaneGeometry(0.15, range * 2);
    const mat = new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, transparent: true, opacity: 0.5,
    });
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, 0.15, 0);
    scene.add(plane);
    return plane;
  }

  return null;
}
