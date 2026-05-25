// baseRange: 셀 단위 정수
// LEVEL_RANGE_BONUS: 레벨업마다 추가되는 셀 수
export const CHAR_TYPES = {
  attacker: {
    name: '전사',
    icon: '⚔️',
    color: 0xff4444,
    emissive: 0x441100,
    rangeType: 'circle',
    baseRange: 1,        // Lv1: 반경 1칸 (주변 8칸)
    rangePerLevel: 1,    // 레벨업마다 +1칸
    baseDamage: 30,
    damagePerLevel: 15,
    baseHeal: 0,
  },
  healer: {
    name: '성직자',
    icon: '✨',
    color: 0x44ff88,
    emissive: 0x004422,
    rangeType: 'circle',
    baseRange: 2,        // Lv1: 반경 2칸
    rangePerLevel: 1,
    baseDamage: 0,
    damagePerLevel: 0,
    baseHeal: 25,
    healPerLevel: 15,
  },
  piercer: {
    name: '궁수',
    icon: '🏹',
    color: 0x4488ff,
    emissive: 0x001144,
    rangeType: 'line',
    baseRange: 1,        // Lv1: 앞뒤 1칸
    rangePerLevel: 1,
    baseDamage: 20,
    damagePerLevel: 10,
    baseHeal: 0,
  },
};

export class Character {
  constructor(type, id) {
    this.id = id;
    this.type = type;
    this.level = 1;
    this.def = CHAR_TYPES[type];

    this.gridX = -1;
    this.gridZ = -1;
    this.mesh = null;
    this.placed = false;

    this.maxHp = 80;
    this.hp = 80;
    this.hpFill = null;
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

  _updateHpBar() {
    if (!this.hpFill) return;
    const ratio = this.hp / this.maxHp;
    this.hpFill.scale.x = ratio;
    this.hpFill.position.x = -(1 - ratio) * 0.4;
  }

  // 셀 단위 정수 사거리
  get range() {
    return this.def.baseRange + (this.level - 1) * this.def.rangePerLevel;
  }
  get damage() {
    return this.def.baseDamage + (this.level - 1) * (this.def.damagePerLevel ?? 0);
  }
  get heal() {
    return this.def.baseHeal + (this.level - 1) * (this.def.healPerLevel ?? 0);
  }

  // 그리드 좌표 기준으로 타겟 판별 (range = 셀 수)
  getTargets(gx, gz, grid, allies, enemies) {
    const r = this.range;

    if (this.def.rangeType === 'circle') {
      // Chebyshev 거리: max(|dc|, |dr|) <= range → 정사각형 범위
      const inRange = (ax, az) => Math.max(Math.abs(ax - gx), Math.abs(az - gz)) <= r;

      if (this.def.baseHeal > 0) {
        return allies.filter(a => a.placed && !(a.gridX === gx && a.gridZ === gz) && inRange(a.gridX, a.gridZ));
      }
      return [
        ...enemies.filter(e => inRange(e.gridX, e.gridZ)),
        ...allies.filter(a => a.placed && !(a.gridX === gx && a.gridZ === gz) && inRange(a.gridX, a.gridZ)),
      ];
    }

    if (this.def.rangeType === 'line') {
      // 같은 열(gridX 동일), 앞뒤 r칸
      const inRange = (ax, az) => ax === gx && Math.abs(az - gz) <= r && !(ax === gx && az === gz);
      return [
        ...enemies.filter(e => inRange(e.gridX, e.gridZ)),
        ...allies.filter(a => a.placed && inRange(a.gridX, a.gridZ)),
      ];
    }

    return [];
  }
}
