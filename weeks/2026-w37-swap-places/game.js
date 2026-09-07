/**
 * 置き換えろ (Swap Places)
 * Core verb: SWAP — click/tap a target to instantly trade places.
 * All tunables come from SWAP_PLACES_CONFIG — no magic numbers here.
 */
(function () {
  const CFG = window.SWAP_PLACES_CONFIG;
  const AudioSys = window.SwapPlacesAudio;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayInner = document.getElementById('overlay-inner');
  const clearPopup = document.getElementById('clear-popup');
  const roomLabelEl = document.getElementById('room-label');
  const hpRow = document.getElementById('hp-row');
  const nowKeysEl = document.getElementById('now-keys');
  const needKeysEl = document.getElementById('need-keys');
  const nowRoomsEl = document.getElementById('now-rooms');
  const bestRoomsEl = document.getElementById('best-rooms');
  const muteBtn = document.getElementById('mute-btn');
  const skipRoomBtn = document.getElementById('skip-room-btn');

  canvas.width = CFG.arenaWidthPixels;
  canvas.height = CFG.arenaHeightPixels;

  // —— Input: e.code only ——
  const keys = Object.create(null);
  let swapPressedThisFrame = false;
  let anyKeyThisFrame = false;
  let pointerClickThisFrame = null; // {x,y} or null
  const pointerAim = {
    x: CFG.arenaWidthPixels * 0.5,
    y: CFG.arenaHeightPixels * 0.5,
    overCanvas: false,
  };
  let clickMoveTarget = null; // {x,y} or null

  const SWAP_CODES = new Set(['Space']);
  const START_IGNORE = new Set(['F1', 'F2', 'F3', 'F4', 'F5']);

  function canvasPointFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'F1' || e.code === 'F2' || e.code === 'F3' || e.code === 'F4' || e.code === 'F5') {
        e.preventDefault();
        e.stopPropagation();
        handleDebugKey(e);
        return;
      }
      keys[e.code] = true;
      if (SWAP_CODES.has(e.code)) {
        if (!e.repeat) swapPressedThisFrame = true;
        e.preventDefault();
      }
      if (!e.repeat && !START_IGNORE.has(e.code) && !e.code.startsWith('F')) {
        anyKeyThisFrame = true;
      }
    },
    true
  );

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
  });

  canvas.addEventListener('pointermove', (e) => {
    const pt = canvasPointFromClient(e.clientX, e.clientY);
    pointerAim.x = pt.x;
    pointerAim.y = pt.y;
    pointerAim.overCanvas = true;
  });

  canvas.addEventListener('pointerleave', () => {
    pointerAim.overCanvas = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    AudioSys.unlock();
    const pt = canvasPointFromClient(e.clientX, e.clientY);
    pointerAim.x = pt.x;
    pointerAim.y = pt.y;
    pointerAim.overCanvas = true;
    pointerClickThisFrame = { x: pt.x, y: pt.y };
    anyKeyThisFrame = true;
  });

  document.addEventListener('pointerdown', (e) => {
    AudioSys.unlock();
    if (e.target instanceof Element && e.target.closest('button')) return;
    anyKeyThisFrame = true;
  });

  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const m = AudioSys.toggleMute();
    muteBtn.setAttribute('aria-pressed', String(m));
    muteBtn.textContent = m ? '音声オフ' : '音声オン';
  });

  skipRoomBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.mode === 'dead') {
      skipCurrentRoomAndRetry();
    }
  });

  // —— Debug ——
  const debug = {
    godMode: false,
    hideVfx: false,
    showHitboxes: false,
  };

  function handleDebugKey(e) {
    if (e.code === 'F1') {
      e.preventDefault();
      if (!state.player) return;
      state.player.hp = CFG.playerMaxHitPoints;
      updateHud();
    } else if (e.code === 'F2') {
      e.preventDefault();
      skipCurrentRoomAndRetry();
    } else if (e.code === 'F3') {
      e.preventDefault();
      debug.godMode = !debug.godMode;
    } else if (e.code === 'F4') {
      e.preventDefault();
      debug.hideVfx = !debug.hideVfx;
    } else if (e.code === 'F5') {
      e.preventDefault();
      debug.showHitboxes = !debug.showHitboxes;
    }
  }

  // —— Game state ——
  const state = {
    mode: 'title', // title | howto | playing | breath | dead | win
    howToIndex: 0,
    player: null,
    walls: [],
    spikes: [],
    holes: [],
    enemies: [],
    keys: [],
    stones: [],
    exit: null,
    keysRequired: 1,
    keysHeld: 0,
    effects: [],
    hitstopRemaining: 0,
    shakeAmount: 0,
    roomIndex: 0,
    roomsCleared: 0,
    bestRooms: 0,
    deathsOnCurrentRoom: 0,
    swapCooldown: 0,
    clearPopupTimer: 0,
    breathTimer: 0,
    highlightTarget: null,
    animTime: 0,
  };

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function circleHitsRect(cx, cy, r, rect) {
    const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    return dist(cx, cy, nx, ny) < r;
  }

  function resolveCircleVsWalls(ent) {
    for (const wall of state.walls) {
      if (!circleHitsRect(ent.x, ent.y, ent.r, wall)) continue;
      const nearestX = Math.max(wall.x, Math.min(ent.x, wall.x + wall.w));
      const nearestY = Math.max(wall.y, Math.min(ent.y, wall.y + wall.h));
      let dx = ent.x - nearestX;
      let dy = ent.y - nearestY;
      if (dx === 0 && dy === 0) {
        const left = ent.x - wall.x;
        const right = wall.x + wall.w - ent.x;
        const top = ent.y - wall.y;
        const bottom = wall.y + wall.h - ent.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) ent.x = wall.x - ent.r;
        else if (m === right) ent.x = wall.x + wall.w + ent.r;
        else if (m === top) ent.y = wall.y - ent.r;
        else ent.y = wall.y + wall.h + ent.r;
        continue;
      }
      const d = Math.hypot(dx, dy) || 1;
      const push = ent.r - d;
      if (push > 0) {
        ent.x += (dx / d) * push;
        ent.y += (dy / d) * push;
      }
    }
    const pad = CFG.arenaPaddingFromWallPixels;
    ent.x = Math.max(pad + ent.r, Math.min(CFG.arenaWidthPixels - pad - ent.r, ent.x));
    ent.y = Math.max(pad + ent.r, Math.min(CFG.arenaHeightPixels - pad - ent.r, ent.y));
  }

  function makePlayer(x, y) {
    return {
      x,
      y,
      r: CFG.playerRadiusPixels,
      hp: CFG.playerMaxHitPoints,
      invuln: 0,
      stun: 0,
      swapPose: 0,
      hurtPose: 0,
      scaleX: 1,
      scaleY: 1,
      facingX: 1,
      facingY: 0,
      spikeCooldown: 0,
    };
  }

  function buildRoom(index) {
    const rooms = CFG.rooms;
    const def = rooms[Math.min(index, rooms.length - 1)];
    state.walls = def.walls.map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h }));
    state.spikes = def.spikes.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h }));
    state.holes = def.holes.map((h) => ({ x: h.x, y: h.y, w: h.w, h: h.h }));
    state.enemies = def.enemies.map((e) => ({
      kind: 'enemy',
      x: e.x,
      y: e.y,
      r: CFG.enemyBaseRadiusPixels * e.sizeMul,
      speed: CFG.enemyBaseSpeedPixelsPerSecond * e.speedMul,
      swappable: true,
    }));
    state.keys = def.keys.map((k) => ({
      kind: 'key',
      x: k.x,
      y: k.y,
      r: CFG.keyRadiusPixels,
      swappable: true,
      taken: false,
    }));
    state.stones = def.stones.map((s) => ({
      kind: 'stone',
      x: s.x,
      y: s.y,
      r: CFG.swapStoneRadiusPixels,
      swappable: true,
    }));
    state.exit = {
      x: def.exit.x - CFG.exitWidthPixels * 0.5,
      y: def.exit.y - CFG.exitHeightPixels * 0.5,
      w: CFG.exitWidthPixels,
      h: CFG.exitHeightPixels,
      cx: def.exit.x,
      cy: def.exit.y,
    };
    state.keysRequired = def.keysRequired;
    state.keysHeld = 0;
    roomLabelEl.textContent = `ROOM ${index + 1} — ${def.labelJa}`;
    return def;
  }

  function currentRoomDef() {
    const rooms = CFG.rooms;
    return rooms[Math.min(state.roomIndex, rooms.length - 1)];
  }

  function resetRun(keepRoom) {
    state.effects = [];
    state.hitstopRemaining = 0;
    state.shakeAmount = 0;
    state.swapCooldown = 0;
    state.clearPopupTimer = 0;
    state.breathTimer = 0;
    state.highlightTarget = null;
    clickMoveTarget = null;
    if (!keepRoom) {
      state.roomIndex = 0;
      state.roomsCleared = 0;
      state.deathsOnCurrentRoom = 0;
    }
    const def = buildRoom(state.roomIndex);
    state.player = makePlayer(def.spawnX, def.spawnY);
    updateHud();
    hideClearPopup();
  }

  function skipCurrentRoomAndRetry() {
    AudioSys.unlock();
    const next = Math.min(state.roomIndex + 1, CFG.rooms.length - 1);
    const keptBest = state.bestRooms;
    const keptCleared = Math.max(state.roomsCleared, next);
    state.deathsOnCurrentRoom = 0;
    state.roomIndex = next;
    resetRun(true);
    state.bestRooms = keptBest;
    state.roomsCleared = keptCleared;
    state.mode = 'playing';
    hideOverlay();
    updateHud();
  }

  // —— Overlay ——
  let overlayInputArmed = true;

  function armOverlayInputSoon() {
    overlayInputArmed = false;
    setTimeout(() => {
      overlayInputArmed = true;
    }, CFG.overlayInputArmDelayMilliseconds);
  }

  function showTitle() {
    state.mode = 'title';
    armOverlayInputSoon();
    overlay.classList.remove('hidden');
    skipRoomBtn.classList.add('hidden');
    overlayInner.innerHTML = `
      <div class="title">置き換えろ</div>
      <div class="hook">クリックした相手と場所が入れ替わる。敵の足元が自分の足元になる。</div>
      <div class="giant-start" id="giant-start">START</div>
      <div class="controls">
        <span class="move">移動 ポインタ方向 / クリック先</span>
        <span class="swap">入れ替え 対象クリック / Space</span>
      </div>
      <div class="sub">何かキーを押せば説明へ</div>
    `;
    const gs = document.getElementById('giant-start');
    if (gs) {
      gs.addEventListener('click', (e) => {
        e.stopPropagation();
        beginHowTo();
      });
    }
  }

  const HOWTO_SLIDES = Object.freeze([
    Object.freeze({
      kicker: '1 / 3',
      titleJa: 'あなたはコレです',
      bodyJa: 'この丸が自分。ポインタの方向へ自動で歩きます。',
      art: '<div class="how-art you" aria-hidden="true"><div class="player"></div><svg class="cursor" viewBox="0 0 24 32" width="36" height="48"><path d="M2 1 L2 26 L8 21 L12 31 L16 29 L12 19 L22 19 Z" fill="#ffcc33" stroke="#0a0a0a" stroke-width="2.4" stroke-linejoin="round"/></svg></div>',
      nextJa: 'つぎ',
    }),
    Object.freeze({
      kicker: '2 / 3',
      titleJa: '鍵を集めよう',
      bodyJa: '黄色い◆が「鍵」。必要数そろえて出口へ。',
      art: '<div class="how-art key-shot" aria-hidden="true"><div class="key"></div><div class="key-label">鍵</div></div>',
      nextJa: 'つぎ',
    }),
    Object.freeze({
      kicker: '3 / 3',
      titleJa: 'クリックで入れ替え',
      bodyJa: '敵・鍵・水色の石をクリックすると場所が入れ替わる。入れ替え後は短い隙！',
      art: '<div class="how-art swap-shot" aria-hidden="true"><div class="player"></div><div class="swap-arrows"></div><div class="enemy"></div><svg class="cursor" viewBox="0 0 24 32" width="36" height="48"><path d="M2 1 L2 26 L8 21 L12 31 L16 29 L12 19 L22 19 Z" fill="#66d9ef" stroke="#0a0a0a" stroke-width="2.4" stroke-linejoin="round"/></svg></div>',
      nextJa: 'はじめる',
    }),
  ]);

  function beginHowTo() {
    AudioSys.unlock();
    resetRun(false);
    showHowTo(0);
  }

  function showHowTo(index) {
    state.mode = 'howto';
    state.howToIndex = index;
    overlayInputArmed = false;
    setTimeout(() => {
      overlayInputArmed = true;
    }, CFG.howToInputArmDelayMilliseconds);
    overlay.classList.remove('hidden');
    overlay.classList.add('howto');
    skipRoomBtn.classList.add('hidden');
    const slide = HOWTO_SLIDES[index];
    const dots = HOWTO_SLIDES.map((_, i) => `<span class="${i === index ? 'on' : ''}"></span>`).join('');
    overlayInner.innerHTML = `
      <div class="how-card">
        <div class="how-kicker">${slide.kicker}</div>
        <div class="how-title">${slide.titleJa}</div>
        ${slide.art}
        <div class="how-body">${slide.bodyJa}</div>
        <div class="how-dots">${dots}</div>
        <button type="button" class="how-next" id="how-next">${slide.nextJa}</button>
        <div class="sub">Space / クリックで進む</div>
      </div>
    `;
    const next = document.getElementById('how-next');
    if (next) {
      next.addEventListener('click', (e) => {
        e.stopPropagation();
        advanceHowTo();
      });
    }
  }

  function advanceHowTo() {
    AudioSys.unlock();
    if (state.howToIndex >= HOWTO_SLIDES.length - 1) {
      startPlaying();
      return;
    }
    showHowTo(state.howToIndex + 1);
  }

  function showDead() {
    state.mode = 'dead';
    armOverlayInputSoon();
    overlay.classList.remove('hidden');
    const showSkip = state.deathsOnCurrentRoom >= CFG.deathsOnSameRoomBeforeSkipButton;
    if (showSkip) skipRoomBtn.classList.remove('hidden');
    else skipRoomBtn.classList.add('hidden');
    overlayInner.innerHTML = `
      <div class="result-line">やられた</div>
      <div class="result-line" style="color:var(--best)">最大部屋 ${state.bestRooms}</div>
      <div class="giant-start" id="giant-start">START</div>
      <div class="sub">Space / クリックで即リトライ</div>
    `;
    const gs = document.getElementById('giant-start');
    if (gs) {
      gs.addEventListener('click', (e) => {
        e.stopPropagation();
        retryFromDeath();
      });
    }
  }

  function showWin() {
    state.mode = 'win';
    armOverlayInputSoon();
    overlay.classList.remove('hidden');
    skipRoomBtn.classList.add('hidden');
    overlayInner.innerHTML = `
      <div class="result-line" style="color:var(--goal)">ぜんぶ置き換えられた！</div>
      <div class="result-line" style="color:var(--best)">最大部屋 ${state.bestRooms}</div>
      <div class="giant-start" id="giant-start">START</div>
      <div class="sub">もう一度</div>
    `;
    const gs = document.getElementById('giant-start');
    if (gs) {
      gs.addEventListener('click', (e) => {
        e.stopPropagation();
        startPlaying();
      });
    }
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
    overlay.classList.remove('howto');
    skipRoomBtn.classList.add('hidden');
  }

  function startPlaying() {
    AudioSys.unlock();
    resetRun(false);
    state.mode = 'playing';
    hideOverlay();
    updateHud();
  }

  function retryFromDeath() {
    AudioSys.unlock();
    resetRun(true);
    state.mode = 'playing';
    hideOverlay();
    updateHud();
  }

  function showClearPopup(n) {
    clearPopup.textContent = `部屋 ${n}`;
    clearPopup.classList.add('show');
    state.clearPopupTimer = CFG.clearPopupDurationSeconds;
  }

  function hideClearPopup() {
    clearPopup.classList.remove('show');
  }

  function updateHud() {
    const p = state.player;
    hpRow.innerHTML = '';
    const hp = p ? p.hp : 0;
    for (let i = 0; i < CFG.playerMaxHitPoints; i++) {
      const pip = document.createElement('div');
      pip.className = 'hp-pip' + (i < hp ? '' : ' empty');
      hpRow.appendChild(pip);
    }
    nowKeysEl.textContent = String(state.keysHeld);
    needKeysEl.textContent = String(state.keysRequired);
    nowRoomsEl.textContent = String(state.roomsCleared);
    bestRoomsEl.textContent = String(state.bestRooms);
  }

  // —— Swappable list ——
  function listSwappables() {
    const list = [];
    for (const e of state.enemies) list.push(e);
    for (const k of state.keys) if (!k.taken) list.push(k);
    for (const s of state.stones) list.push(s);
    return list;
  }

  function pickTargetAt(x, y) {
    const pickR = CFG.swapClickPickRadiusPixels;
    let best = null;
    let bestD = Infinity;
    for (const t of listSwappables()) {
      const d = dist(x, y, t.x, t.y);
      if (d <= pickR + t.r && d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  function nearestSwappable() {
    const p = state.player;
    if (!p) return null;
    let best = null;
    let bestD = Infinity;
    for (const t of listSwappables()) {
      const d = dist(p.x, p.y, t.x, t.y);
      if (d < bestD && d <= CFG.swapNearestMaxDistancePixels) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  function updateHighlight() {
    const p = state.player;
    if (!p || state.mode !== 'playing') {
      state.highlightTarget = null;
      return;
    }
    // Prefer aim under pointer, else nearest
    let t = null;
    if (pointerAim.overCanvas) {
      t = pickTargetAt(pointerAim.x, pointerAim.y);
    }
    if (!t) t = nearestSwappable();
    state.highlightTarget = t;
  }

  // —— Core: SWAP ——
  function doSwap(target) {
    const p = state.player;
    if (!p || !target) return;
    if (state.swapCooldown > 0) return;
    if (p.stun > 0) return;

    const px = p.x;
    const py = p.y;
    const tx = target.x;
    const ty = target.y;

    p.x = tx;
    p.y = ty;
    target.x = px;
    target.y = py;

    // Swapping with a key claims it immediately (don't leave it behind).
    if (target.kind === 'key' && !target.taken) {
      target.taken = true;
      state.keysHeld += 1;
      state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnKeyPickupSeconds);
      state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnKeyPickupPixels);
      spawnHitMark(tx, ty);
      AudioSys.key();
      updateHud();
    }

    p.stun = CFG.swapStunSeconds;
    p.swapPose = CFG.playerPoseRecoverSeconds;
    p.scaleX = CFG.playerSwapStretchScaleX;
    p.scaleY = CFG.playerSwapStretchScaleY;
    p.invuln = Math.max(p.invuln, CFG.swapInvincibleSeconds);
    state.swapCooldown = CFG.swapCooldownSeconds;
    clickMoveTarget = null;

    state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnSwapSeconds);
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnSwapPixels);
    spawnSwapVfx(px, py, tx, ty);
    AudioSys.swap();

    // Landing on a key via swap still picks it up next frame via overlap
  }

  function spawnSwapVfx(ax, ay, bx, by) {
    if (debug.hideVfx) return;
    state.effects.push({
      kind: 'swapRing',
      x: bx,
      y: by,
      life: CFG.swapVfxLifetimeSeconds,
      maxLife: CFG.swapVfxLifetimeSeconds,
      animateInHitstop: true,
    });
    state.effects.push({
      kind: 'swapTrail',
      x0: ax,
      y0: ay,
      x1: bx,
      y1: by,
      life: CFG.swapTrailLifetimeSeconds,
      maxLife: CFG.swapTrailLifetimeSeconds,
      animateInHitstop: true,
    });
    for (let i = 0; i < CFG.swapBurstParticleCount; i++) {
      const ang = (Math.PI * 2 * i) / CFG.swapBurstParticleCount;
      const spd =
        CFG.swapBurstSpeedMinPixelsPerSecond + Math.random() * CFG.swapBurstSpeedRangePixelsPerSecond;
      state.effects.push({
        kind: 'burst',
        x: bx,
        y: by,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: CFG.swapBurstLifetimeSeconds * (0.7 + Math.random() * 0.3),
        maxLife: CFG.swapBurstLifetimeSeconds,
        size: 3 + Math.random() * 4,
        animateInHitstop: true,
      });
    }
  }

  function spawnHitMark(x, y) {
    if (debug.hideVfx) return;
    state.effects.push({
      kind: 'hitMark',
      x,
      y,
      life: CFG.hitMarkLifetimeSeconds,
      maxLife: CFG.hitMarkLifetimeSeconds,
      animateInHitstop: true,
    });
  }

  function damagePlayer(amount) {
    const p = state.player;
    if (!p) return;
    if (debug.godMode) return;
    if (p.invuln > 0) return;
    p.hp -= amount;
    p.invuln = CFG.playerInvincibleAfterHitSeconds;
    p.hurtPose = CFG.playerHurtFlashDurationSeconds;
    p.scaleX = CFG.playerHurtSquashScaleX;
    p.scaleY = CFG.playerHurtSquashScaleY;
    state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnHazardHitSeconds);
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnHazardHitPixels);
    spawnHitMark(p.x, p.y);
    AudioSys.hurt();
    updateHud();
    if (p.hp <= 0) {
      AudioSys.ko();
      state.deathsOnCurrentRoom += 1;
      showDead();
    }
  }

  function killPlayerInHole() {
    const p = state.player;
    if (!p) return;
    if (debug.godMode) return;
    p.hp = 0;
    state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnHazardHitSeconds);
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnHazardHitPixels);
    spawnHitMark(p.x, p.y);
    AudioSys.ko();
    updateHud();
    state.deathsOnCurrentRoom += 1;
    showDead();
  }

  function tryPickupKeys() {
    const p = state.player;
    if (!p) return;
    for (const k of state.keys) {
      if (k.taken) continue;
      if (dist(p.x, p.y, k.x, k.y) <= CFG.keyPickupDistancePixels + k.r * 0.2) {
        k.taken = true;
        state.keysHeld += 1;
        state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnKeyPickupSeconds);
        state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnKeyPickupPixels);
        spawnHitMark(k.x, k.y);
        AudioSys.key();
        updateHud();
      }
    }
  }

  function tryClearRoom() {
    const p = state.player;
    if (!p || !state.exit) return;
    if (state.keysHeld < state.keysRequired) return;
    const pad = CFG.exitEnterPaddingPixels;
    const ex = state.exit;
    if (
      p.x > ex.x - pad &&
      p.x < ex.x + ex.w + pad &&
      p.y > ex.y - pad &&
      p.y < ex.y + ex.h + pad
    ) {
      clearRoom();
    }
  }

  function clearRoom() {
    state.roomsCleared = Math.max(state.roomsCleared, state.roomIndex + 1);
    if (state.roomsCleared > state.bestRooms) state.bestRooms = state.roomsCleared;
    state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnClearSeconds);
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnClearPixels);
    showClearPopup(state.roomIndex + 1);
    AudioSys.clear();
    updateHud();

    if (state.roomIndex >= CFG.rooms.length - 1) {
      state.mode = 'breath';
      state.breathTimer = CFG.roomBreathSeconds;
      state._pendingWin = true;
      return;
    }

    state.mode = 'breath';
    state.breathTimer = CFG.roomBreathSeconds;
    state._pendingWin = false;
    state._pendingNextRoom = state.roomIndex + 1;
  }

  // —— Update ——
  function updatePlayer(dt) {
    const p = state.player;
    if (!p) return;

    if (p.invuln > 0) p.invuln -= dt;
    if (p.stun > 0) p.stun -= dt;
    if (p.spikeCooldown > 0) p.spikeCooldown -= dt;
    if (p.swapPose > 0) p.swapPose -= dt;
    if (p.hurtPose > 0) p.hurtPose -= dt;

    // Pose recover toward 1
    const recover = dt / Math.max(0.001, CFG.playerPoseRecoverSeconds);
    p.scaleX += (1 - p.scaleX) * Math.min(1, recover * 3);
    p.scaleY += (1 - p.scaleY) * Math.min(1, recover * 3);

    if (p.stun > 0) return;

    // Movement: pointer aim (primary) or click-move target
    let tx = null;
    let ty = null;
    if (clickMoveTarget) {
      tx = clickMoveTarget.x;
      ty = clickMoveTarget.y;
      if (dist(p.x, p.y, tx, ty) <= CFG.clickMoveArriveDistancePixels) {
        clickMoveTarget = null;
        tx = null;
      }
    }
    if (tx === null && pointerAim.overCanvas) {
      tx = pointerAim.x;
      ty = pointerAim.y;
    }

    if (tx !== null) {
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d > CFG.pointerMoveDeadzonePixels) {
        const spd = CFG.playerMoveSpeedPixelsPerSecond;
        p.x += (dx / d) * spd * dt;
        p.y += (dy / d) * spd * dt;
        p.facingX = dx / d;
        p.facingY = dy / d;
      }
    }

    resolveCircleVsWalls(p);
  }

  function updateEnemies(dt) {
    const p = state.player;
    if (!p) return;
    for (const en of state.enemies) {
      const dx = p.x - en.x;
      const dy = p.y - en.y;
      const d = Math.hypot(dx, dy) || 1;
      en.x += (dx / d) * en.speed * dt;
      en.y += (dy / d) * en.speed * dt;
      resolveCircleVsWalls(en);

      // Don't walk into holes voluntarily much — still can; holes only kill player
      if (dist(p.x, p.y, en.x, en.y) < p.r + en.r * 0.85) {
        damagePlayer(CFG.enemyHitDamage);
      }
    }
  }

  function updateHazards() {
    const p = state.player;
    if (!p) return;

    for (const hole of state.holes) {
      if (circleHitsRect(p.x, p.y, p.r * 0.55, hole)) {
        if (CFG.holeLethal) {
          killPlayerInHole();
          return;
        }
      }
    }

    if (p.spikeCooldown <= 0) {
      for (const sp of state.spikes) {
        if (circleHitsRect(p.x, p.y, p.r * 0.7, sp)) {
          p.spikeCooldown = CFG.spikeHurtCooldownSeconds;
          damagePlayer(CFG.spikeDamage);
          break;
        }
      }
    }
  }

  function handlePlayingInput() {
    // Click: swap if on target, else set move destination
    if (pointerClickThisFrame) {
      const t = pickTargetAt(pointerClickThisFrame.x, pointerClickThisFrame.y);
      if (t) {
        doSwap(t);
      } else {
        clickMoveTarget = { x: pointerClickThisFrame.x, y: pointerClickThisFrame.y };
      }
    }
    if (swapPressedThisFrame) {
      const t = nearestSwappable();
      if (t) doSwap(t);
    }
  }

  function updateEffects(dt, hitstopOnly) {
    for (let i = state.effects.length - 1; i >= 0; i--) {
      const ef = state.effects[i];
      if (hitstopOnly && !ef.animateInHitstop) continue;
      ef.life -= dt;
      if (ef.kind === 'burst') {
        ef.x += ef.vx * dt;
        ef.y += ef.vy * dt;
        ef.vx *= 0.92;
        ef.vy *= 0.92;
      }
      if (ef.life <= 0) state.effects.splice(i, 1);
    }
  }

  function updateShake(dt) {
    if (state.shakeAmount > 0) {
      state.shakeAmount -= CFG.shakeDecayPerSecond * dt * (state.shakeAmount * 0.15 + 1);
      if (state.shakeAmount < CFG.shakeAmountCutoffPixels) state.shakeAmount = 0;
    }
  }

  function updateClearPopup(dt) {
    if (state.clearPopupTimer > 0) {
      state.clearPopupTimer -= dt;
      if (state.clearPopupTimer <= 0) hideClearPopup();
    }
  }

  function update(dt) {
    state.animTime += dt;

    if (state.mode === 'title') {
      if (overlayInputArmed && (anyKeyThisFrame || swapPressedThisFrame || pointerClickThisFrame)) {
        beginHowTo();
      }
      return;
    }
    if (state.mode === 'howto') {
      if (overlayInputArmed && (anyKeyThisFrame || swapPressedThisFrame || pointerClickThisFrame)) {
        advanceHowTo();
      }
      return;
    }
    if (state.mode === 'dead') {
      if (overlayInputArmed && (swapPressedThisFrame || anyKeyThisFrame || pointerClickThisFrame)) {
        retryFromDeath();
      }
      return;
    }
    if (state.mode === 'win') {
      if (overlayInputArmed && (swapPressedThisFrame || anyKeyThisFrame || pointerClickThisFrame)) {
        startPlaying();
      }
      return;
    }

    if (state.hitstopRemaining > 0) {
      state.hitstopRemaining -= dt;
      updateEffects(dt, true);
      updateShake(dt);
      updateClearPopup(dt);
      return;
    }

    if (state.mode === 'breath') {
      state.breathTimer -= dt;
      updateEffects(dt, false);
      updateShake(dt);
      updateClearPopup(dt);
      if (state.breathTimer <= 0) {
        if (state._pendingWin) {
          state._pendingWin = false;
          showWin();
          return;
        }
        if (state._pendingNextRoom != null) {
          state.roomIndex = state._pendingNextRoom;
          state._pendingNextRoom = null;
          state.deathsOnCurrentRoom = 0;
          const def = buildRoom(state.roomIndex);
          state.player = makePlayer(def.spawnX, def.spawnY);
          state.effects = [];
          clickMoveTarget = null;
          state.mode = 'playing';
          updateHud();
        }
      }
      return;
    }

    // playing
    if (state.swapCooldown > 0) state.swapCooldown -= dt;
    handlePlayingInput();
    updateHighlight();
    updatePlayer(dt);
    if (state.mode !== 'playing') return; // died mid-frame
    updateEnemies(dt);
    if (state.mode !== 'playing') return;
    updateHazards();
    if (state.mode !== 'playing') return;
    tryPickupKeys();
    tryClearRoom();
    updateEffects(dt, false);
    updateShake(dt);
    updateClearPopup(dt);
  }

  // —— Draw ——
  function drawArena() {
    const g = ctx.createLinearGradient(0, 0, 0, CFG.arenaHeightPixels);
    g.addColorStop(0, CFG.colorArenaFloorTop);
    g.addColorStop(1, CFG.colorArenaFloor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.arenaWidthPixels, CFG.arenaHeightPixels);

    const step = CFG.arenaGridSpacingPixels;
    ctx.strokeStyle = CFG.colorGridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= CFG.arenaWidthPixels; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, CFG.arenaHeightPixels);
    }
    for (let y = 0; y <= CFG.arenaHeightPixels; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(CFG.arenaWidthPixels, y + 0.5);
    }
    ctx.stroke();
  }

  function drawRectBlock(r, fill, edge, top) {
    ctx.fillStyle = edge;
    ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    ctx.fillStyle = fill;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (top) {
      ctx.fillStyle = top;
      ctx.fillRect(r.x, r.y, r.w, 4);
    }
  }

  function drawHoles() {
    for (const h of state.holes) {
      ctx.fillStyle = CFG.colorHoleEdge;
      ctx.fillRect(h.x - 2, h.y - 2, h.w + 4, h.h + 4);
      ctx.fillStyle = CFG.colorHole;
      ctx.fillRect(h.x, h.y, h.w, h.h);
      // inner darker core (opaque, no additive glow)
      ctx.fillStyle = '#020308';
      ctx.fillRect(h.x + 6, h.y + 6, Math.max(0, h.w - 12), Math.max(0, h.h - 12));
    }
  }

  function drawSpikes() {
    for (const s of state.spikes) {
      ctx.fillStyle = CFG.colorSpikeEdge;
      ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
      ctx.fillStyle = CFG.colorSpike;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      // triangular teeth
      const teeth = Math.max(2, Math.floor(s.w / 14));
      const tw = s.w / teeth;
      ctx.fillStyle = CFG.colorSpikeEdge;
      for (let i = 0; i < teeth; i++) {
        const x0 = s.x + i * tw;
        ctx.beginPath();
        ctx.moveTo(x0, s.y + s.h);
        ctx.lineTo(x0 + tw * 0.5, s.y + 4);
        ctx.lineTo(x0 + tw, s.y + s.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff6a75';
        ctx.beginPath();
        ctx.moveTo(x0 + 2, s.y + s.h - 2);
        ctx.lineTo(x0 + tw * 0.5, s.y + 8);
        ctx.lineTo(x0 + tw - 2, s.y + s.h - 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = CFG.colorSpikeEdge;
      }
    }
  }

  function drawExit() {
    const ex = state.exit;
    if (!ex) return;
    const open = state.keysHeld >= state.keysRequired;
    ctx.fillStyle = CFG.colorExitEdge;
    ctx.fillRect(ex.x - 3, ex.y - 3, ex.w + 6, ex.h + 6);
    ctx.fillStyle = open ? CFG.colorExitOpen : CFG.colorExitLocked;
    ctx.fillRect(ex.x, ex.y, ex.w, ex.h);
    ctx.font = '700 12px "Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = open ? '出口' : '鍵不足';
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText(label, ex.cx + 1, ex.cy + 1);
    ctx.fillStyle = open ? '#f4f0e6' : '#9aa0ab';
    ctx.fillText(label, ex.cx, ex.cy);
  }

  function drawCircleEntity(x, y, r, fill, edge, scaleX, scaleY) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scaleX || 1, scaleY || 1);
    ctx.beginPath();
    ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = edge;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  function drawKey(k) {
    if (k.taken) return;
    const pulse = 1 + Math.sin(state.animTime * 6) * 0.06;
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.rotate(Math.PI / 4);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = CFG.colorKeyEdge;
    ctx.fillRect(-k.r - 2, -k.r - 2, k.r * 2 + 4, k.r * 2 + 4);
    ctx.fillStyle = CFG.colorKey;
    ctx.fillRect(-k.r, -k.r, k.r * 2, k.r * 2);
    // opaque core
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(-k.r * 0.35, -k.r * 0.35, k.r * 0.7, k.r * 0.7);
    ctx.restore();
  }

  function drawStone(s) {
    const pulse = 1 + Math.sin(state.animTime * 5) * 0.05;
    drawCircleEntity(s.x, s.y, s.r * pulse, CFG.colorStone, CFG.colorStoneEdge, 1, 1);
    ctx.fillStyle = CFG.colorStoneEdge;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8f4ff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEnemy(en) {
    drawCircleEntity(en.x, en.y, en.r, CFG.colorEnemy, CFG.colorEnemyEdge, 1, 1);
    // eyes
    const er = en.r * 0.22;
    ctx.fillStyle = '#fff8e7';
    ctx.beginPath();
    ctx.arc(en.x - en.r * 0.28, en.y - en.r * 0.1, er, 0, Math.PI * 2);
    ctx.arc(en.x + en.r * 0.28, en.y - en.r * 0.1, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(en.x - en.r * 0.28, en.y - en.r * 0.1, er * 0.45, 0, Math.PI * 2);
    ctx.arc(en.x + en.r * 0.28, en.y - en.r * 0.1, er * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer() {
    const p = state.player;
    if (!p) return;
    if (p.invuln > 0 && Math.floor(state.animTime * CFG.playerInvulnBlinkHz) % 2 === 0) {
      // blink — skip body briefly
    } else {
      drawCircleEntity(
        p.x,
        p.y,
        p.r,
        p.hurtPose > 0 ? '#ffb0b0' : CFG.colorPlayerBody,
        CFG.colorPlayerEdge,
        p.scaleX,
        p.scaleY
      );
      // accent bangs
      ctx.fillStyle = CFG.colorPlayerAccent;
      ctx.beginPath();
      ctx.arc(p.x, p.y - p.r * 0.35 * p.scaleY, p.r * 0.55, Math.PI, 0);
      ctx.fill();
      // eye
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(
        p.x + p.facingX * p.r * 0.25,
        p.y + p.facingY * p.r * 0.15,
        2.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    // stun ring
    if (p.stun > 0) {
      const t = p.stun / CFG.swapStunSeconds;
      ctx.strokeStyle = CFG.colorSwapHint;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2 * t);
      ctx.stroke();
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2 * t);
      ctx.stroke();
    }
  }

  function drawHighlight() {
    const t = state.highlightTarget;
    if (!t || state.mode !== 'playing') return;
    const pulse = 0.5 + 0.5 * Math.sin(state.animTime * Math.PI * 2 * CFG.swapHighlightPulseHz);
    const rad = t.r + 6 + pulse * 3;
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = CFG.colorHighlight;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(t.x, t.y, rad, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawEffects() {
    for (const ef of state.effects) {
      const lifeT = ef.life / ef.maxLife;
      if (ef.kind === 'swapRing') {
        const rad = (1 - lifeT) * 40 + 10;
        ctx.strokeStyle = CFG.colorVfxEdge;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = CFG.colorVfxCore;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, rad, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ef.kind === 'swapTrail') {
        ctx.strokeStyle = CFG.colorVfxEdge;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(ef.x0, ef.y0);
        ctx.lineTo(ef.x1, ef.y1);
        ctx.stroke();
        ctx.strokeStyle = CFG.colorSwapHint;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ef.x0, ef.y0);
        ctx.lineTo(ef.x1, ef.y1);
        ctx.stroke();
        // cores at ends
        ctx.fillStyle = CFG.colorVfxEdge;
        ctx.beginPath();
        ctx.arc(ef.x0, ef.y0, 6, 0, Math.PI * 2);
        ctx.arc(ef.x1, ef.y1, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = CFG.colorVfxCore;
        ctx.beginPath();
        ctx.arc(ef.x0, ef.y0, 4, 0, Math.PI * 2);
        ctx.arc(ef.x1, ef.y1, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (ef.kind === 'burst') {
        ctx.fillStyle = CFG.colorVfxEdge;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, ef.size + 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = CFG.colorVfxCore;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, ef.size * lifeT, 0, Math.PI * 2);
        ctx.fill();
      } else if (ef.kind === 'hitMark') {
        const s = CFG.hitMarkSizePixels * lifeT;
        ctx.save();
        ctx.translate(ef.x, ef.y);
        ctx.rotate((1 - lifeT) * 0.4);
        ctx.strokeStyle = CFG.colorVfxEdge;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-s, 0);
        ctx.lineTo(s, 0);
        ctx.moveTo(0, -s);
        ctx.lineTo(0, s);
        ctx.stroke();
        ctx.strokeStyle = CFG.colorVfxCore;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s, 0);
        ctx.lineTo(s, 0);
        ctx.moveTo(0, -s);
        ctx.lineTo(0, s);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawDebug() {
    if (!debug.showHitboxes) return;
    ctx.strokeStyle = CFG.debugHitboxStrokeColor;
    ctx.lineWidth = CFG.debugHitboxLineWidthPixels;
    const p = state.player;
    if (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const en of state.enemies) {
      ctx.beginPath();
      ctx.arc(en.x, en.y, en.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const w of state.walls) ctx.strokeRect(w.x, w.y, w.w, w.h);
    for (const s of state.spikes) ctx.strokeRect(s.x, s.y, s.w, s.h);
    for (const h of state.holes) ctx.strokeRect(h.x, h.y, h.w, h.h);
  }

  function drawMoveHint() {
    if (state.mode !== 'playing' || !clickMoveTarget) return;
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(clickMoveTarget.x, clickMoveTarget.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = CFG.colorMoveHint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(clickMoveTarget.x, clickMoveTarget.y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  function draw() {
    let ox = 0;
    let oy = 0;
    if (state.shakeAmount > 0) {
      ox = (Math.random() * 2 - 1) * state.shakeAmount;
      oy = (Math.random() * 2 - 1) * state.shakeAmount;
    }
    ctx.save();
    ctx.translate(ox, oy);

    drawArena();
    drawHoles();
    drawSpikes();
    for (const w of state.walls) {
      drawRectBlock(w, CFG.colorWall, CFG.colorWallEdge, CFG.colorWallTop);
    }
    drawExit();
    for (const k of state.keys) drawKey(k);
    for (const s of state.stones) drawStone(s);
    for (const en of state.enemies) drawEnemy(en);
    drawHighlight();
    drawPlayer();
    if (!debug.hideVfx) drawEffects();
    drawMoveHint();
    drawDebug();

    ctx.restore();
  }

  // —— Fixed timestep loop ——
  let lastTs = performance.now();
  let accumulator = 0;

  function frame(ts) {
    let rawDt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (rawDt > CFG.maxFrameDeltaSeconds) rawDt = CFG.maxFrameDeltaSeconds;
    accumulator += rawDt;
    const step = CFG.fixedTimestepSeconds;
    while (accumulator >= step) {
      update(step);
      // Edge triggers fire at most once even if we catch up multiple steps.
      swapPressedThisFrame = false;
      anyKeyThisFrame = false;
      pointerClickThisFrame = null;
      accumulator -= step;
    }
    draw();
    requestAnimationFrame(frame);
  }

  // boot
  resetRun(false);
  showTitle();
  updateHud();
  requestAnimationFrame(frame);
})();
