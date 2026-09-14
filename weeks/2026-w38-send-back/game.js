/**
 * 返せ (Send Back)
 * Core verb: RETURN / REFLECT — timing-parry enemy shots back at them.
 * All tunables come from SEND_BACK_CONFIG — no magic numbers here.
 */
(function () {
  const CFG = window.SEND_BACK_CONFIG;
  const AudioSys = window.SendBackAudio;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayInner = document.getElementById('overlay-inner');
  const clearPopup = document.getElementById('clear-popup');
  const waveLabelEl = document.getElementById('wave-label');
  const hpRow = document.getElementById('hp-row');
  const nowReturnsEl = document.getElementById('now-returns');
  const nowWaveEl = document.getElementById('now-wave');
  const bestReturnsEl = document.getElementById('best-returns');
  const muteBtn = document.getElementById('mute-btn');
  const skipRoomBtn = document.getElementById('skip-room-btn');

  canvas.width = CFG.arenaWidthPixels;
  canvas.height = CFG.arenaHeightPixels;

  // —— Input: e.code only ——
  const keys = Object.create(null);
  let reflectPressedThisFrame = false;
  let anyKeyThisFrame = false;
  let pointerClickThisFrame = null;
  let reflectBufferSeconds = 0;

  const REFLECT_CODES = new Set(['Space']);
  const LEFT_CODES = new Set(['ArrowLeft', 'KeyA']);
  const RIGHT_CODES = new Set(['ArrowRight', 'KeyD']);
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
      if (REFLECT_CODES.has(e.code)) {
        if (!e.repeat) reflectPressedThisFrame = true;
        e.preventDefault();
      }
      if (LEFT_CODES.has(e.code) || RIGHT_CODES.has(e.code)) {
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

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    AudioSys.unlock();
    const pt = canvasPointFromClient(e.clientX, e.clientY);
    pointerClickThisFrame = { x: pt.x, y: pt.y };
    reflectPressedThisFrame = true;
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
      skipCurrentWaveAndRetry();
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
      skipCurrentWaveAndRetry();
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
    enemies: [],
    shots: [],
    reflectShots: [],
    pendingShots: [],
    effects: [],
    hitstopRemaining: 0,
    shakeAmount: 0,
    waveIndex: 0,
    waveTime: 0,
    scheduleCursor: 0,
    returns: 0,
    waveReturns: 0,
    bestReturns: 0,
    deathsOnCurrentWave: 0,
    clearPopupTimer: 0,
    breathTimer: 0,
    whiffCooldown: 0,
    animTime: 0,
    perfectFlash: 0,
    zoneHot: false,
  };

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function loadBest() {
    try {
      const v = localStorage.getItem('send-back-best-returns');
      if (v != null) state.bestReturns = Math.max(0, parseInt(v, 10) || 0);
    } catch (_) {}
  }

  function saveBest() {
    if (state.returns > state.bestReturns) {
      state.bestReturns = state.returns;
      try {
        localStorage.setItem('send-back-best-returns', String(state.bestReturns));
      } catch (_) {}
    }
  }

  function updateHud() {
    const hp = state.player ? state.player.hp : CFG.playerMaxHitPoints;
    hpRow.innerHTML = '';
    for (let i = 0; i < CFG.playerMaxHitPoints; i++) {
      const pip = document.createElement('div');
      pip.className = 'hp-pip' + (i < hp ? '' : ' empty');
      hpRow.appendChild(pip);
    }
    nowReturnsEl.textContent = String(state.returns);
    nowWaveEl.textContent = String(state.waveIndex + 1);
    bestReturnsEl.textContent = String(state.bestReturns);
    const wave = CFG.waves[state.waveIndex];
    waveLabelEl.textContent = wave ? wave.labelJa : '';
  }

  function resetWaveRuntime() {
    state.enemies = [];
    state.shots = [];
    state.reflectShots = [];
    state.pendingShots = [];
    state.effects = [];
    state.hitstopRemaining = 0;
    state.shakeAmount = 0;
    state.waveTime = 0;
    state.scheduleCursor = 0;
    state.waveReturns = 0;
    state.whiffCooldown = 0;
    state.perfectFlash = 0;
    state.zoneHot = false;
    reflectBufferSeconds = 0;
    clearPopup.classList.remove('show');
    clearPopup.textContent = '';
  }

  function spawnWave(index, opts) {
    const wave = CFG.waves[index];
    if (!wave) return;
    const fullHeal = !opts || opts.fullHeal !== false;
    const keepHp = opts && opts.keepHp ? (state.player ? state.player.hp : CFG.playerMaxHitPoints) : null;
    state.waveIndex = index;
    resetWaveRuntime();
    state.player = {
      baseX: CFG.playerXPixels,
      baseY: CFG.playerYPixels,
      x: CFG.playerXPixels,
      y: CFG.playerYPixels,
      r: CFG.playerRadiusPixels,
      hp: fullHeal ? CFG.playerMaxHitPoints : keepHp != null ? keepHp : CFG.playerMaxHitPoints,
      invuln: 0,
      hurtFlash: 0,
      poseSX: 1,
      poseSY: 1,
      poseTimer: 0,
      nudgeX: 0,
    };
    for (const e of wave.enemies) {
      state.enemies.push({
        x: e.x,
        y: e.y,
        r: CFG.enemyBaseRadiusPixels * (e.sizeMul || 1),
        hp: e.hp || CFG.enemyHitPoints,
        maxHp: e.hp || CFG.enemyHitPoints,
        alive: true,
        telegraph: 0,
        hurtFlash: 0,
        squash: 1,
      });
    }
    updateHud();
  }

  function startRun() {
    state.returns = 0;
    state.deathsOnCurrentWave = 0;
    state.waveIndex = 0;
    spawnWave(0, { fullHeal: true });
    state.mode = 'playing';
    hideOverlay();
    updateHud();
  }

  function skipCurrentWaveAndRetry() {
    const next =
      state.waveIndex >= CFG.waves.length - 1
        ? state.waveIndex
        : state.waveIndex + 1;
    state.deathsOnCurrentWave = 0;
    spawnWave(next, { fullHeal: true });
    state.mode = 'playing';
    hideOverlay();
    updateHud();
  }

  let overlayInputArmed = true;

  function armOverlayInput() {
    overlayInputArmed = false;
    setTimeout(() => {
      overlayInputArmed = true;
    }, CFG.overlayInputArmDelayMilliseconds);
  }

  function showTitle() {
    state.mode = 'title';
    armOverlayInput();
    overlay.classList.remove('hidden');
    overlay.classList.remove('howto');
    skipRoomBtn.classList.add('hidden');
    overlayInner.innerHTML = `
      <div class="title">返せ</div>
      <div class="hook">タイミングで弾を打ち返す。敵の弾が敵を倒す。</div>
      <div class="giant-start" id="start-btn">START</div>
      <div class="controls">
        <span class="reflect">返す クリック / Space</span>
        <span class="nudge">微移動 ← →</span>
      </div>
      <div class="sub">連打でスタート · F1–F5 デバッグ</div>
    `;
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        AudioSys.unlock();
        showHowTo(0);
      });
    }
    updateHud();
  }

  const HOWTO_SLIDES = [
    {
      kicker: 'あなたはコレ',
      title: '黒シルエット',
      body: '中央下の安全地帯に立つ。敵の弾が来るまで待つ。',
      art: 'you',
    },
    {
      kicker: '黄色い帯で返せ',
      title: 'タイミング！',
      body: '弾が黄色い帯に入ったら、クリック／Space／タップ。',
      art: 'band',
    },
    {
      kicker: '敵の弾を敵へ',
      title: '返しの快感',
      body: '打ち返した弾が敵を倒す。真ん中で返すとパーフェクト。',
      art: 'return',
    },
  ];

  function howArtHtml(kind) {
    if (kind === 'you') {
      return `<div class="how-art"><div class="enemy"></div><div class="player"></div></div>`;
    }
    if (kind === 'band') {
      return `<div class="how-art"><div class="enemy"></div><div class="shot"></div><div class="band"></div><div class="player"></div></div>`;
    }
    return `<div class="how-art"><div class="enemy"></div><div class="arrow-up"></div><div class="shot return"></div><div class="band"></div><div class="player"></div></div>`;
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
        <div class="how-title">${slide.title}</div>
        ${howArtHtml(slide.art)}
        <div class="how-body">${slide.body}</div>
        <div class="how-dots">${dots}</div>
        <button type="button" class="how-next" id="how-next">${index >= HOWTO_SLIDES.length - 1 ? 'はじめる' : 'つぎへ'}</button>
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
    if (state.howToIndex >= HOWTO_SLIDES.length - 1) {
      startRun();
      return;
    }
    showHowTo(state.howToIndex + 1);
  }

  function showDead() {
    state.mode = 'dead';
    armOverlayInput();
    saveBest();
    updateHud();
    overlay.classList.remove('hidden');
    overlay.classList.remove('howto');
    const showSkip = state.deathsOnCurrentWave >= CFG.deathsOnSameWaveBeforeSkipButton;
    if (showSkip) skipRoomBtn.classList.remove('hidden');
    else skipRoomBtn.classList.add('hidden');
    overlayInner.innerHTML = `
      <div class="title" style="font-size:clamp(32px,7vw,48px)">やられた</div>
      <div class="result-line">返し <span style="color:var(--score)">${state.returns}</span></div>
      <div class="giant-start" id="retry-btn">RETRY</div>
      <div class="sub">連打で即リスタート</div>
    `;
    const retry = document.getElementById('retry-btn');
    if (retry) {
      retry.addEventListener('click', (e) => {
        e.stopPropagation();
        retryCurrentWave();
      });
    }
  }

  function showWin() {
    state.mode = 'win';
    armOverlayInput();
    saveBest();
    updateHud();
    overlay.classList.remove('hidden');
    overlay.classList.remove('howto');
    skipRoomBtn.classList.add('hidden');
    overlayInner.innerHTML = `
      <div class="title" style="font-size:clamp(32px,7vw,48px)">全返し</div>
      <div class="result-line">返し <span style="color:var(--score)">${state.returns}</span></div>
      <div class="giant-start" id="again-btn">もう一度</div>
      <div class="sub">連打でタイトルへ</div>
    `;
    const again = document.getElementById('again-btn');
    if (again) {
      again.addEventListener('click', (e) => {
        e.stopPropagation();
        showTitle();
      });
    }
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
    overlay.classList.remove('howto');
    skipRoomBtn.classList.add('hidden');
  }

  function retryCurrentWave() {
    spawnWave(state.waveIndex, { fullHeal: true });
    state.mode = 'playing';
    hideOverlay();
    updateHud();
  }

  function killPlayer() {
    state.deathsOnCurrentWave += 1;
    AudioSys.ko();
    state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnPlayerHitSeconds);
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnPlayerHitPixels);
    showDead();
  }

  function hurtPlayer(dmg) {
    if (!state.player) return;
    if (debug.godMode) return;
    if (state.player.invuln > 0) return;
    state.player.hp -= dmg;
    state.player.invuln = CFG.playerInvincibleAfterHitSeconds;
    state.player.hurtFlash = CFG.playerHurtFlashDurationSeconds;
    state.player.poseSX = CFG.playerHurtSquashScaleX;
    state.player.poseSY = CFG.playerHurtSquashScaleY;
    state.player.poseTimer = CFG.playerPoseRecoverSeconds;
    state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnPlayerHitSeconds);
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnPlayerHitPixels);
    AudioSys.hurt();
    spawnHitMark(state.player.x, state.player.y);
    updateHud();
    if (state.player.hp <= 0) {
      killPlayer();
    }
  }

  function spawnHitMark(x, y) {
    if (debug.hideVfx) return;
    state.effects.push({
      kind: 'hitmark',
      x,
      y,
      life: CFG.hitMarkLifetimeSeconds,
      maxLife: CFG.hitMarkDurationSeconds,
    });
  }

  function spawnBurst(x, y, color) {
    if (debug.hideVfx) return;
    const n = CFG.reflectBurstParticleCount;
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const spd =
        CFG.reflectBurstSpeedMinPixelsPerSecond +
        Math.random() * CFG.reflectBurstSpeedRangePixelsPerSecond;
      state.effects.push({
        kind: 'particle',
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: CFG.reflectBurstDurationSeconds,
        maxLife: CFG.reflectBurstDurationSeconds,
        color: color || CFG.colorVfxCore,
        r: 3 + Math.random() * 3,
      });
    }
  }

  function pointInParryZone(px, py, shotX, shotY) {
    const dx = shotX - px;
    const dy = shotY - py;
    const d = Math.hypot(dx, dy);
    if (d < CFG.parryZoneInnerRadiusPixels || d > CFG.parryZoneOuterRadiusPixels) return null;
    const ang = Math.atan2(dy, dx);
    let diff = ang - CFG.parryZoneFacingRadians;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > CFG.parryZoneHalfAngleRadians) return null;
    const radialT =
      (d - CFG.parryZoneInnerRadiusPixels) /
      Math.max(1, CFG.parryZoneOuterRadiusPixels - CFG.parryZoneInnerRadiusPixels);
    // 0 at inner, 1 at outer; perfect near center (0.5)
    const centerDist = Math.abs(radialT - 0.5) * 2;
    const perfect = centerDist <= CFG.perfectWindowFraction;
    return { d, radialT, perfect };
  }

  function doWhiff() {
    state.whiffCooldown = CFG.parryWhiffCooldownSeconds;
    AudioSys.whiff();
    const p = state.player;
    if (!p) return;
    p.poseSX = 0.85;
    p.poseSY = 1.15;
    p.poseTimer = CFG.playerPoseRecoverSeconds * 0.6;
  }

  function findReflectableShot() {
    const p = state.player;
    if (!p) return null;
    let best = null;
    let bestScore = Infinity;
    for (const shot of state.shots) {
      if (!shot.alive || shot.reflected) continue;
      const info = pointInParryZone(p.x, p.y, shot.x, shot.y);
      if (!info) continue;
      const score = Math.abs(info.radialT - 0.5);
      if (score < bestScore) {
        bestScore = score;
        best = { shot, info };
      }
    }
    return best;
  }

  function performReflect(best) {
    const p = state.player;
    const { shot, info } = best;
    shot.alive = false;
    shot.reflected = true;

    const perfect = info.perfect;
    const speedMul = perfect ? CFG.perfectSpeedMul : CFG.normalReflectSpeedMul;
    const baseSpeed = shot.speed * speedMul;
    let tx = shot.originX;
    let ty = shot.originY;
    const owner = state.enemies[shot.ownerIndex];
    if (owner && owner.alive) {
      tx = owner.x;
      ty = owner.y;
    }
    let dx = tx - shot.x;
    let dy = ty - shot.y;
    let len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    state.reflectShots.push({
      x: shot.x,
      y: shot.y,
      vx: dx * baseSpeed,
      vy: dy * baseSpeed,
      r: CFG.reflectShotRadiusPixels,
      damage: CFG.reflectShotDamage + (perfect ? CFG.perfectDamageBonus : 0),
      alive: true,
      perfect,
      ownerIndex: shot.ownerIndex,
    });

    state.returns += 1;
    state.waveReturns += 1;
    saveBest();
    updateHud();

    p.poseSX = CFG.playerReflectStretchScaleX;
    p.poseSY = CFG.playerReflectStretchScaleY;
    p.poseTimer = CFG.playerPoseRecoverSeconds;

    if (perfect) {
      state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnPerfectSeconds);
      state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnPerfectPixels);
      state.perfectFlash = CFG.perfectFlashDurationSeconds;
      AudioSys.perfect();
    } else {
      state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnReflectSeconds);
      state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnReflectPixels);
      AudioSys.reflect();
    }
    spawnBurst(shot.x, shot.y, perfect ? CFG.colorPerfect : CFG.colorReflectShot);
    spawnHitMark(shot.x, shot.y);

    checkWaveClear();
  }

  function tryReflect() {
    if (state.whiffCooldown > 0) return false;
    const best = findReflectableShot();
    if (!best) {
      doWhiff();
      return false;
    }
    performReflect(best);
    return true;
  }

  function damageEnemy(enemy, dmg, hx, hy) {
    if (!enemy.alive) return;
    enemy.hp -= dmg;
    enemy.hurtFlash = CFG.enemyHurtFlashSeconds;
    enemy.squash = 0.7;
    state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnEnemyHitSeconds);
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnEnemyHitPixels);
    AudioSys.enemyHit();
    spawnHitMark(hx, hy);
    spawnBurst(hx, hy, CFG.colorEnemy);
    if (enemy.hp <= 0) {
      enemy.alive = false;
      spawnBurst(enemy.x, enemy.y, CFG.colorEnemy);
    }
  }

  function checkWaveClear() {
    const wave = CFG.waves[state.waveIndex];
    if (!wave) return;
    const allDead = state.enemies.every((e) => !e.alive);
    const enoughReturns = state.waveReturns >= wave.clearTargetReturns;
    if (allDead || enoughReturns) {
      // finish remaining enemies visually if returns met
      if (enoughReturns) {
        for (const e of state.enemies) {
          if (e.alive) {
            e.alive = false;
            spawnBurst(e.x, e.y, CFG.colorEnemy);
          }
        }
      }
      clearWave();
    }
  }

  function clearWave() {
    state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnClearSeconds);
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnClearPixels);
    AudioSys.clear();
    clearPopup.textContent = 'クリア！';
    clearPopup.classList.add('show');
    state.clearPopupTimer = CFG.clearPopupDurationSeconds;
    state.mode = 'breath';
    state.breathTimer = CFG.waveBreathSeconds;
    state.deathsOnCurrentWave = 0;
  }

  function advanceAfterBreath() {
    clearPopup.classList.remove('show');
    if (state.waveIndex >= CFG.waves.length - 1) {
      showWin();
      return;
    }
    spawnWave(state.waveIndex + 1, { keepHp: true, fullHeal: false });
    state.mode = 'playing';
  }

  function queuePendingFromSchedule(dt) {
    const wave = CFG.waves[state.waveIndex];
    if (!wave) return;
    state.waveTime += dt;
    const sched = wave.schedule;
    // Loop schedule with padding once exhausted (until clear)
    let t = state.waveTime;
    const lastAt = sched.length ? sched[sched.length - 1].atSeconds : 0;
    const loopLen = lastAt + CFG.scheduleLoopPaddingSeconds;
    while (state.scheduleCursor < sched.length && sched[state.scheduleCursor].atSeconds <= t) {
      enqueueShotEvent(sched[state.scheduleCursor]);
      state.scheduleCursor += 1;
    }
    if (state.scheduleCursor >= sched.length && loopLen > 0 && t > loopLen) {
      // restart schedule relative
      const loops = Math.floor(t / loopLen);
      const localT = t - loops * loopLen;
      // find next events in this loop
      for (let i = 0; i < sched.length; i++) {
        if (sched[i].atSeconds > localT - dt && sched[i].atSeconds <= localT) {
          enqueueShotEvent(sched[i]);
        }
      }
    }
  }

  function enqueueShotEvent(ev) {
    const enemy = state.enemies[ev.enemyIndex];
    if (!enemy || !enemy.alive) return;
    state.pendingShots.push({
      enemyIndex: ev.enemyIndex,
      telegraphLeft: ev.telegraphSeconds,
      telegraphMax: ev.telegraphSeconds,
      speed: ev.speedPixelsPerSecond,
      aimJitter: ev.aimJitterPixels || 0,
      feint: !!ev.feint,
      feintHold: ev.feintHoldSeconds || 0,
      feintPhase: ev.feint ? 'telegraph' : 'fire',
      fired: false,
    });
    enemy.telegraph = Math.max(enemy.telegraph, ev.telegraphSeconds);
    AudioSys.telegraph();
  }

  function updatePending(dt) {
    for (const pend of state.pendingShots) {
      if (pend.fired) continue;
      const enemy = state.enemies[pend.enemyIndex];
      if (!enemy || !enemy.alive) {
        pend.fired = true;
        continue;
      }
      if (pend.feint && pend.feintPhase === 'telegraph') {
        pend.telegraphLeft -= dt;
        enemy.telegraph = Math.max(enemy.telegraph, pend.telegraphLeft);
        if (pend.telegraphLeft <= 0) {
          pend.feintPhase = 'hold';
          pend.telegraphLeft = pend.feintHold;
          enemy.telegraph = 0;
        }
        continue;
      }
      if (pend.feint && pend.feintPhase === 'hold') {
        pend.telegraphLeft -= dt;
        if (pend.telegraphLeft <= 0) {
          pend.feintPhase = 'fire';
          pend.telegraphLeft = pend.telegraphMax * 0.55;
          enemy.telegraph = pend.telegraphLeft;
          AudioSys.telegraph();
        }
        continue;
      }
      // normal / final fire telegraph
      pend.telegraphLeft -= dt;
      enemy.telegraph = Math.max(enemy.telegraph, pend.telegraphLeft);
      if (pend.telegraphLeft <= 0) {
        fireShot(pend);
        pend.fired = true;
        enemy.telegraph = 0;
      }
    }
    state.pendingShots = state.pendingShots.filter((p) => !p.fired);
  }

  function fireShot(pend) {
    const enemy = state.enemies[pend.enemyIndex];
    if (!enemy || !enemy.alive) return;
    const p = state.player;
    const aimX = p.x + pend.aimJitter;
    const aimY = p.y;
    let dx = aimX - enemy.x;
    let dy = aimY - enemy.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    state.shots.push({
      x: enemy.x,
      y: enemy.y + enemy.r * 0.4,
      vx: dx * pend.speed,
      vy: dy * pend.speed,
      speed: pend.speed,
      r: CFG.shotRadiusPixels,
      alive: true,
      reflected: false,
      ownerIndex: pend.enemyIndex,
      originX: enemy.x,
      originY: enemy.y,
    });
  }

  function updateShots(dt) {
    const p = state.player;
    state.zoneHot = false;
    for (const shot of state.shots) {
      if (!shot.alive) continue;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (
        shot.x < -40 ||
        shot.x > CFG.arenaWidthPixels + 40 ||
        shot.y < -40 ||
        shot.y > CFG.arenaHeightPixels + 40
      ) {
        shot.alive = false;
        continue;
      }
      if (p && pointInParryZone(p.x, p.y, shot.x, shot.y)) {
        state.zoneHot = true;
      }
      if (p && dist(shot.x, shot.y, p.x, p.y) < shot.r + p.r) {
        shot.alive = false;
        hurtPlayer(CFG.shotDamage);
      }
    }
    state.shots = state.shots.filter((s) => s.alive);

    for (const rs of state.reflectShots) {
      if (!rs.alive) continue;
      rs.x += rs.vx * dt;
      rs.y += rs.vy * dt;
      if (
        rs.x < -40 ||
        rs.x > CFG.arenaWidthPixels + 40 ||
        rs.y < -40 ||
        rs.y > CFG.arenaHeightPixels + 40
      ) {
        rs.alive = false;
        continue;
      }
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        if (dist(rs.x, rs.y, enemy.x, enemy.y) < rs.r + enemy.r) {
          rs.alive = false;
          damageEnemy(enemy, rs.damage, enemy.x, enemy.y);
          checkWaveClear();
          break;
        }
      }
    }
    state.reflectShots = state.reflectShots.filter((s) => s.alive);
  }

  function updatePlayer(dt) {
    const p = state.player;
    if (!p) return;
    let move = 0;
    for (const c of LEFT_CODES) if (keys[c]) move -= 1;
    for (const c of RIGHT_CODES) if (keys[c]) move += 1;
    if (move !== 0) {
      p.nudgeX += move * CFG.playerNudgeSpeedPixelsPerSecond * dt;
      const max = CFG.playerNudgeMaxOffsetPixels;
      if (p.nudgeX > max) p.nudgeX = max;
      if (p.nudgeX < -max) p.nudgeX = -max;
    } else {
      // gentle recenter
      p.nudgeX *= Math.pow(0.08, dt);
      if (Math.abs(p.nudgeX) < 0.5) p.nudgeX = 0;
    }
    p.x = p.baseX + p.nudgeX;
    p.y = p.baseY;

    if (p.invuln > 0) p.invuln -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;
    if (p.poseTimer > 0) {
      p.poseTimer -= dt;
      const t = Math.max(0, p.poseTimer / CFG.playerPoseRecoverSeconds);
      p.poseSX = 1 + (p.poseSX - 1) * t;
      p.poseSY = 1 + (p.poseSY - 1) * t;
      if (p.poseTimer <= 0) {
        p.poseSX = 1;
        p.poseSY = 1;
      }
    }
  }

  function updateEffects(dt, hitstopOnly) {
    for (const ef of state.effects) {
      if (hitstopOnly && !ef.animateInHitstop) continue;
      ef.life -= dt;
      if (ef.kind === 'particle') {
        ef.x += ef.vx * dt;
        ef.y += ef.vy * dt;
        ef.vx *= 0.92;
        ef.vy *= 0.92;
      }
    }
    state.effects = state.effects.filter((ef) => ef.life > 0);
  }

  function updateEnemies(dt) {
    for (const e of state.enemies) {
      if (e.telegraph > 0) e.telegraph = Math.max(0, e.telegraph - dt);
      if (e.hurtFlash > 0) e.hurtFlash -= dt;
      if (e.squash < 1) {
        e.squash = Math.min(1, e.squash + dt * 4);
      }
    }
  }

  function updatePlaying(dt) {
    if (state.whiffCooldown > 0) state.whiffCooldown -= dt;
    if (state.perfectFlash > 0) state.perfectFlash -= dt;

    if (reflectPressedThisFrame) {
      reflectBufferSeconds = CFG.reflectInputBufferSeconds;
    }

    updatePlayer(dt);
    queuePendingFromSchedule(dt);
    updatePending(dt);
    updateShots(dt);
    updateEnemies(dt);

    // Buffer: wait for a shot in the yellow band; whiff only if buffer expires empty.
    if (reflectBufferSeconds > 0) {
      if (state.whiffCooldown <= 0) {
        const best = findReflectableShot();
        if (best) {
          performReflect(best);
          reflectBufferSeconds = 0;
        } else {
          reflectBufferSeconds -= dt;
          if (reflectBufferSeconds <= 0) doWhiff();
        }
      } else {
        reflectBufferSeconds -= dt;
      }
    }
  }

  function tick(dt) {
    state.animTime += dt;

    if (state.mode === 'title') {
      if (overlayInputArmed && (anyKeyThisFrame || reflectPressedThisFrame || pointerClickThisFrame)) {
        AudioSys.unlock();
        showHowTo(0);
      }
      return;
    }
    if (state.mode === 'howto') {
      if (overlayInputArmed && (anyKeyThisFrame || reflectPressedThisFrame || pointerClickThisFrame)) {
        advanceHowTo();
      }
      return;
    }
    if (state.mode === 'dead') {
      if (overlayInputArmed && (reflectPressedThisFrame || anyKeyThisFrame || pointerClickThisFrame)) {
        retryCurrentWave();
      }
      return;
    }
    if (state.mode === 'win') {
      if (overlayInputArmed && (reflectPressedThisFrame || anyKeyThisFrame || pointerClickThisFrame)) {
        showTitle();
      }
      return;
    }

    if (state.hitstopRemaining > 0) {
      state.hitstopRemaining -= dt;
      updateEffects(dt, true);
      // shake decays even in hitstop for feel
      if (state.shakeAmount > 0) {
        state.shakeAmount = Math.max(0, state.shakeAmount - CFG.shakeDecayPerSecond * dt);
        if (state.shakeAmount < CFG.shakeAmountCutoffPixels) state.shakeAmount = 0;
      }
      if (state.clearPopupTimer > 0) state.clearPopupTimer -= dt;
      return;
    }

    if (state.shakeAmount > 0) {
      state.shakeAmount = Math.max(0, state.shakeAmount - CFG.shakeDecayPerSecond * dt);
      if (state.shakeAmount < CFG.shakeAmountCutoffPixels) state.shakeAmount = 0;
    }

    if (state.clearPopupTimer > 0) {
      state.clearPopupTimer -= dt;
      if (state.clearPopupTimer <= 0) clearPopup.classList.remove('show');
    }

    if (state.mode === 'breath') {
      state.breathTimer -= dt;
      updateEffects(dt, false);
      if (state.breathTimer <= 0) advanceAfterBreath();
      return;
    }

    if (state.mode === 'playing') {
      updatePlaying(dt);
      updateEffects(dt, false);
    }
  }

  // —— Draw ——
  function drawArena() {
    const g = ctx.createLinearGradient(0, 0, 0, CFG.arenaHeightPixels);
    g.addColorStop(0, CFG.colorArenaFloorTop);
    g.addColorStop(1, CFG.colorArenaFloor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.arenaWidthPixels, CFG.arenaHeightPixels);

    ctx.strokeStyle = CFG.colorGridLine;
    ctx.lineWidth = 1;
    const step = CFG.arenaGridSpacingPixels;
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

    // safe pocket
    const p = state.player;
    const cx = p ? p.baseX : CFG.playerXPixels;
    const cy = p ? p.baseY : CFG.playerYPixels;
    const hw = CFG.playerSafePocketHalfWidthPixels;
    ctx.fillStyle = CFG.colorSafePocket;
    ctx.strokeStyle = CFG.colorSafePocketEdge;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, hw, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawParryZone() {
    const p = state.player;
    if (!p) return;
    const hot = state.zoneHot;
    const flash = state.perfectFlash > 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(CFG.parryZoneFacingRadians + Math.PI / 2);

    const inner = CFG.parryZoneInnerRadiusPixels;
    const outer = CFG.parryZoneOuterRadiusPixels;
    const half = CFG.parryZoneHalfAngleRadians;

    ctx.beginPath();
    ctx.arc(0, 0, outer, -half - Math.PI / 2, half - Math.PI / 2);
    ctx.arc(0, 0, inner, half - Math.PI / 2, -half - Math.PI / 2, true);
    ctx.closePath();
    ctx.fillStyle = hot || flash ? 'rgba(255, 224, 102, 0.42)' : 'rgba(255, 204, 51, 0.28)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = CFG.colorParryZoneEdge;
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hot || flash ? CFG.colorParryZoneActive : CFG.colorParryZone;
    ctx.stroke();

    // perfect band hint (center ring)
    const midR =
      (inner + outer) * 0.5 -
      ((outer - inner) * 0.5 * CFG.perfectWindowFraction) / 2;
    const midR2 =
      (inner + outer) * 0.5 +
      ((outer - inner) * 0.5 * CFG.perfectWindowFraction) / 2;
    ctx.beginPath();
    ctx.arc(0, 0, midR2, -half - Math.PI / 2, half - Math.PI / 2);
    ctx.arc(0, 0, midR, half - Math.PI / 2, -half - Math.PI / 2, true);
    ctx.closePath();
    ctx.fillStyle = flash ? 'rgba(255, 248, 231, 0.35)' : 'rgba(255, 248, 231, 0.12)';
    ctx.fill();

    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
    if (!p) return;
    if (p.invuln > 0) {
      const blink = Math.floor(state.animTime * CFG.playerInvulnBlinkHz) % 2 === 0;
      if (blink) return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.poseSX, p.poseSY);

    // solid black silhouette with light outline for readability
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.hurtFlash > 0 ? '#3a3a3a' : CFG.colorPlayerBody;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = CFG.colorPlayerEdge;
    ctx.stroke();

    // accent eye
    ctx.fillStyle = CFG.colorPlayerAccent;
    ctx.beginPath();
    ctx.arc(4, -3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#0a0a0a';
    ctx.stroke();

    ctx.restore();

    if (debug.showHitboxes) {
      ctx.strokeStyle = CFG.debugHitboxStrokeColor;
      ctx.lineWidth = CFG.debugHitboxLineWidthPixels;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawEnemies() {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      const sx = e.squash < 1 ? 1.2 : 1;
      const sy = e.squash;
      ctx.scale(sx, sy);

      const telegraphing = e.telegraph > 0;
      const flashOn =
        telegraphing &&
        Math.floor(state.animTime * CFG.enemyTelegraphFlashHz) % 2 === 0;

      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, Math.PI * 2);
      ctx.fillStyle =
        e.hurtFlash > 0
          ? CFG.colorVfxCore
          : flashOn
            ? CFG.colorEnemyTelegraph
            : CFG.colorEnemy;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = CFG.colorEnemyEdge;
      ctx.stroke();

      // eyes
      ctx.fillStyle = CFG.colorVfxCore;
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(-5, -2, 3.5, 0, Math.PI * 2);
      ctx.arc(5, -2, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      if (telegraphing) {
        // aim line telegraph (opaque core + edge)
        const p = state.player;
        if (p) {
          ctx.save();
          ctx.strokeStyle = CFG.colorParryZoneEdge;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.strokeStyle = CFG.colorEnemyTelegraph;
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      if (debug.showHitboxes) {
        ctx.strokeStyle = CFG.debugHitboxStrokeColor;
        ctx.lineWidth = CFG.debugHitboxLineWidthPixels;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawShotBall(x, y, r, fill, edge, core) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = CFG.shotOutlinePixels;
    ctx.strokeStyle = edge;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.2, CFG.shotCoreRadiusPixels, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = edge;
    ctx.stroke();
  }

  function drawShots() {
    for (const s of state.shots) {
      if (!s.alive) continue;
      drawShotBall(s.x, s.y, s.r, CFG.colorShot, CFG.colorShotEdge, CFG.colorShotCore);
      if (debug.showHitboxes) {
        ctx.strokeStyle = CFG.debugHitboxStrokeColor;
        ctx.lineWidth = CFG.debugHitboxLineWidthPixels;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const s of state.reflectShots) {
      if (!s.alive) continue;
      drawShotBall(
        s.x,
        s.y,
        s.r,
        s.perfect ? CFG.colorPerfect : CFG.colorReflectShot,
        CFG.colorReflectShotEdge,
        CFG.colorReflectShotCore
      );
    }
  }

  function drawEffects() {
    if (debug.hideVfx) return;
    for (const ef of state.effects) {
      const a = Math.max(0, ef.life / ef.maxLife);
      if (ef.kind === 'hitmark') {
        const s = CFG.hitMarkSizePixels * (0.6 + 0.4 * a);
        ctx.save();
        ctx.translate(ef.x, ef.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = CFG.colorVfxCore;
        ctx.strokeStyle = CFG.colorVfxEdge;
        ctx.lineWidth = 2.5;
        ctx.fillRect(-s / 2, -s / 6, s, s / 3);
        ctx.strokeRect(-s / 2, -s / 6, s, s / 3);
        ctx.fillRect(-s / 6, -s / 2, s / 3, s);
        ctx.strokeRect(-s / 6, -s / 2, s / 3, s);
        ctx.restore();
      } else if (ef.kind === 'particle') {
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, ef.r * a, 0, Math.PI * 2);
        ctx.fillStyle = ef.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = CFG.colorVfxEdge;
        ctx.stroke();
      }
    }
  }

  function drawGodBadge() {
    if (!debug.godMode) return;
    ctx.font = 'bold 12px Zen Maru Gothic, sans-serif';
    ctx.fillStyle = CFG.colorWaveAccent;
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 3;
    ctx.strokeText('GOD', 12, CFG.arenaHeightPixels - 12);
    ctx.fillText('GOD', 12, CFG.arenaHeightPixels - 12);
  }

  function render() {
    let sx = 0;
    let sy = 0;
    if (state.shakeAmount > 0) {
      sx = (Math.random() * 2 - 1) * state.shakeAmount;
      sy = (Math.random() * 2 - 1) * state.shakeAmount;
    }
    ctx.save();
    ctx.translate(sx, sy);
    drawArena();
    if (state.mode === 'playing' || state.mode === 'breath' || state.mode === 'dead') {
      drawParryZone();
      drawEnemies();
      drawShots();
      drawPlayer();
      drawEffects();
    } else {
      // title/howto idle silhouette preview
      drawParryZoneIdle();
      drawIdlePreview();
    }
    drawGodBadge();
    ctx.restore();
  }

  function drawParryZoneIdle() {
    const cx = CFG.playerXPixels;
    const cy = CFG.playerYPixels;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(CFG.parryZoneFacingRadians + Math.PI / 2);
    const inner = CFG.parryZoneInnerRadiusPixels;
    const outer = CFG.parryZoneOuterRadiusPixels;
    const half = CFG.parryZoneHalfAngleRadians;
    ctx.beginPath();
    ctx.arc(0, 0, outer, -half - Math.PI / 2, half - Math.PI / 2);
    ctx.arc(0, 0, inner, half - Math.PI / 2, -half - Math.PI / 2, true);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 204, 51, 0.22)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = CFG.colorParryZoneEdge;
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = CFG.colorParryZone;
    ctx.stroke();
    ctx.restore();
  }

  function drawIdlePreview() {
    const cx = CFG.playerXPixels;
    const cy = CFG.playerYPixels;
    ctx.beginPath();
    ctx.arc(cx, cy, CFG.playerRadiusPixels, 0, Math.PI * 2);
    ctx.fillStyle = CFG.colorPlayerBody;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = CFG.colorPlayerEdge;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(360, 72, CFG.enemyBaseRadiusPixels, 0, Math.PI * 2);
    ctx.fillStyle = CFG.colorEnemy;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = CFG.colorEnemyEdge;
    ctx.stroke();
  }

  // —— Main loop (fixed timestep) ——
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    let frameDt = (now - last) / 1000;
    last = now;
    if (frameDt > CFG.maxFrameDeltaSeconds) frameDt = CFG.maxFrameDeltaSeconds;
    acc += frameDt;
    const step = CFG.fixedTimestepSeconds;
    let consumedInput = false;
    while (acc >= step) {
      tick(step);
      acc -= step;
      // one-shot inputs apply to the first sim step only
      reflectPressedThisFrame = false;
      anyKeyThisFrame = false;
      pointerClickThisFrame = null;
      consumedInput = true;
    }
    // Do NOT clear inputs on frames that did not simulate — otherwise
    // clicks between ticks are dropped before tryReflect can see them.
    if (!consumedInput) {
      // keep latched inputs for the next physics step
    }
    render();
    requestAnimationFrame(frame);
  }

  loadBest();
  updateHud();
  showTitle();
  // Ensure player exists for idle draw
  state.player = {
    baseX: CFG.playerXPixels,
    baseY: CFG.playerYPixels,
    x: CFG.playerXPixels,
    y: CFG.playerYPixels,
    r: CFG.playerRadiusPixels,
    hp: CFG.playerMaxHitPoints,
    invuln: 0,
    hurtFlash: 0,
    poseSX: 1,
    poseSY: 1,
    poseTimer: 0,
    nudgeX: 0,
  };
  requestAnimationFrame(frame);
})();
