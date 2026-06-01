import { state, MAX_DEPLOYED, UNLOCK_COST } from './state.js';
import { CHAR_TYPES } from './character.js';

// 카드 배치 버튼 클릭 콜백 (upgrade.js에서 등록)
let deployCallback = null;
export function onDeploy(fn) { deployCallback = fn; }

export function updateHUD() {
  document.getElementById('hud-wave').textContent = state.wave;
  document.getElementById('hud-tickets').textContent = state.tickets;
  document.getElementById('hud-kills').textContent = state.kills;
  document.getElementById('btn-draw').disabled = state.tickets < 1;

  const totalOwned = Object.values(state.roster).reduce((s, pool) => s + pool.length, 0);
  const unlockBtn = document.getElementById('btn-unlock');
  unlockBtn.disabled = state.tickets < UNLOCK_COST || totalOwned >= MAX_DEPLOYED;
  unlockBtn.title = totalOwned >= MAX_DEPLOYED ? '이미 최대 슬롯' : `티켓 ${UNLOCK_COST}장 소모`;

  renderFragments();

  const aliveAllies = state.allies.filter(a => a.isAlive());
  const notMoved = aliveAllies.filter(a => !state.movedThisTurn.has(a.id));
  document.getElementById('turn-banner').textContent =
    state.phase === 'player'
      ? `-- 내 턴: ${notMoved.length}명 남음 --`
      : state.phase === 'enemy'
      ? '-- 적 턴 --'
      : '-- 드로우 턴 --';
}


export function renderFragments() {
  const container = document.getElementById('hand-cards');
  container.innerHTML = '';

  for (const [type, def] of Object.entries(CHAR_TYPES)) {
    const pool = state.roster[type];
    const onField = pool.filter(c => c.placed);
    const onBench = pool.filter(c => !c.placed);

    const repChar = [...onField, ...onBench].sort((a, b) => b.level - a.level)[0];
    const level = repChar ? repChar.level : 1;
    const targetLv = Math.min(level, 3);
    const fragCount = state.fragments[type][targetLv] ?? 0;

    const isDeploying = state.deployingChar?.type === type;
    const canDeploy = onBench.length > 0 && state.allies.length < MAX_DEPLOYED && state.phase === 'player';

    const card = document.createElement('div');
    card.className = 'card' + (isDeploying ? ' selected' : '');
    card.dataset.type = type;

    const slotText = pool.length > 0
      ? `${onField.length}/${pool.length} 배치중`
      : '미보유';
    const slotColor = onField.length > 0 ? '#44ff88' : pool.length > 0 ? '#ffd700' : '#555';

    const deployFragCount = state.fragments[type][1] ?? 0;
    const canAffordDeploy = onBench.length > 0 && deployFragCount >= 1;
    const deployBtn = canDeploy && canAffordDeploy
      ? `<button style="margin-top:4px;width:100%;padding:2px 0;font-size:10px;background:#004433;color:#44ff88;border:1px solid #44ff88;border-radius:3px;cursor:pointer" data-action="deploy" data-type="${type}">배치 💎${deployFragCount}</button>`
      : canDeploy
      ? `<button style="margin-top:4px;width:100%;padding:2px 0;font-size:10px;background:#1a1a1a;color:#444;border:1px solid #333;border-radius:3px;cursor:default" disabled>배치 💎0</button>`
      : '';

    card.innerHTML = `
      <div class="card-level">Lv${level}</div>
      <div class="card-icon">${def.icon}</div>
      <div class="card-name">${def.name}</div>
      <div style="margin-top:4px;display:flex;gap:3px;justify-content:center">
        ${[0,1,2].map(i => `<div style="width:9px;height:9px;border-radius:50%;background:${i < fragCount ? '#ffd700' : '#333'};border:1px solid #555"></div>`).join('')}
      </div>
      <div style="font-size:10px;color:${slotColor};margin-top:3px">${slotText}</div>
      ${deployBtn}
    `;

    card.querySelector('[data-action="deploy"]')?.addEventListener('click', e => {
      e.stopPropagation();
      deployCallback?.(type);
    });

    container.appendChild(card);
  }
}

export function showMergeHint(msg = '강화 완료!') {
  const hint = document.getElementById('merge-hint');
  hint.textContent = msg;
  hint.style.display = 'block';
  clearTimeout(hint._t);
  hint._t = setTimeout(() => hint.style.display = 'none', 2000);
}

export function showDrawResult(type, count) {
  const def = CHAR_TYPES[type];
  const panel = document.getElementById('draw-panel');
  const result = document.getElementById('draw-result');
  result.innerHTML = `
    <div class="draw-card" style="border-color:rgba(255,215,0,0.6)">
      <div class="card-icon">${def.icon}</div>
      <div class="card-name">${def.name}</div>
      <div style="color:#ffd700;font-size:12px;margin-top:4px">${count}/3</div>
    </div>
  `;
  panel.style.display = 'block';
  clearTimeout(panel._t);
  panel._t = setTimeout(() => { panel.style.display = 'none'; }, 1200);
}

export function showEndScreen(win) {
  const overlay = document.getElementById('overlay');
  document.getElementById('overlay-title').textContent = win ? 'VICTORY!' : 'GAME OVER';
  document.getElementById('overlay-msg').textContent = win
    ? `Wave ${state.wave} 보스를 처치했습니다!`
    : '모든 아군이 쓰러졌습니다.';
  overlay.style.display = 'flex';
}
