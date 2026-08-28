/**
 * 置いて逃げろ (Place and Run)
 * Core verb: PLACE a delayed burst, then RUN.
 * All tunables come from PLACE_AND_RUN_CONFIG — no magic numbers here.
 */
(function () {
  const CFG = window.PLACE_AND_RUN_CONFIG;
  const AudioSys = window.PlaceAndRunAudio;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayInner = document.getElementById('overlay-inner');
  const wrapPopup = document.getElementById('wrap-popup');
  const waveLabelEl = document.getElementById('wave-label');
  const hpRow = document.getElementById('hp-row');
  const nowWrapEl = document.getElementById('now-wrap');
  const bestWrapEl = document.getElementById('best-wrap');
  const muteBtn = document.getElementById('mute-btn');
  const skipWaveBtn = document.getElementById('skip-wave-btn');

  canvas.width = CFG.arenaWidthPixels;
  canvas.height = CFG.arenaHeightPixels;

  // —— Input (zero extra delay — polled each frame) ——
  const keys = Object.create(null);
  let plantPressedThisFrame = false;
  let anyKeyThisFrame = false;
  let pointerDownPlant = false;
  const pointerAim = {
    x: CFG.arenaWidthPixels * 0.5,
    y: CFG.arenaHeightPixels * 0.5,
    overCanvas: false,
  };

  const PLANT_KEYS = new Set([' ', 'Spacebar', 'z', 'Z', 'Space']);
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

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (PLANT_KEYS.has(e.key) || e.code === 'Space' || e.code === 'KeyZ') {
      plantPressedThisFrame = true;
      e.preventDefault();
    }
    if (!START_IGNORE.has(e.key) && !e.key.startsWith('F')) {
      anyKeyThisFrame = true;
    }
    handleDebugKey(e);
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
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
    const pt = canvasPointFromClient(e.clientX, e.clientY);
    pointerAim.x = pt.x;
    pointerAim.y = pt.y;
    pointerAim.overCanvas = true;
    AudioSys.unlock();
    pointerDownPlant = true;
    plantPressedThisFrame = true;
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
    muteBtn.textContent = m ? '音声オフ' : '音声オン';
  });

  skipWaveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.mode === 'dead') {
      skipCurrentWaveAndRetry();
    }
  });

  // —— Debug flags (shipped Day 1) ——
  const debug = {
    godMode: false,
    hideVfx: false,
    showHitboxes: false,
  };

  function handleDebugKey(e) {
    if (e.key === 'F1') {
      e.preventDefault();
      if (!state.player) return;
      state.player.hp = CFG.playerMaxHitPoints;
      updateHud();
    } else if (e.key === 'F2') {
      e.preventDefault();
      skipCurrentWaveAndRetry();
    } else if (e.key === 'F3') {
      e.preventDefault();
      debug.godMode = !debug.godMode;
    } else if (e.key === 'F4') {
      e.preventDefault();
      debug.hideVfx = !debug.hideVfx;
    } else if (e.key === 'F5') {
      e.preventDefault();
      debug.showHitboxes = !debug.showHitboxes;
    }
  }

  // —— Game state ——
  const state = {
    mode: 'title', // title | playing | breath | dead
    player: null,
    enemies: [],
    bursts: [],
    effects: [], // fire/smoke/hitmarks — hitmarks keep animating in hitstop
    hitstopRemaining: 0,
    shakeAmount: 0,
    waveIndex: 0,
    spawnQueue: 0,
    spawnTimer: 0,
    breathTimer: 0,
    bestWrap: 0,
    lastBurstWrap: 0,
    wrapPopupTimer: 0,
    deathsOnCurrentWave: 0,
    plantCooldown: 0,
    waveClearPending: false,
  };

  function makePlayer() {
    return {
      x: CFG.arenaWidthPixels * 0.5,
      y: CFG.arenaHeightPixels * 0.5,
      r: CFG.playerRadiusPixels,
      hp: CFG.playerMaxHitPoints,
      invuln: 0,
      plantPose: 0,
      hurtPose: 0,
      facingX: 0,
      facingY: -1,
      scaleX: 1,
      scaleY: 1,
    };
  }

  function resetRun(keepWave) {
    state.player = makePlayer();
    state.enemies = [];
    state.bursts = [];
    state.effects = [];
    state.hitstopRemaining = 0;
    state.shakeAmount = 0;
    state.spawnQueue = 0;
    state.spawnTimer = 0;
    state.breathTimer = 0;
    state.lastBurstWrap = 0;
    state.wrapPopupTimer = 0;
    state.plantCooldown = 0;
    state.waveClearPending = false;
    if (!keepWave) {
      state.waveIndex = 0;
      state.deathsOnCurrentWave = 0;
      state.bestWrap = 0;
    }
    updateHud();
    hideWrapPopup();
  }

  function currentWave() {
    const waves = CFG.waves;
    return waves[Math.min(state.waveIndex, waves.length - 1)];
  }

  function beginWave(index) {
    state.waveIndex = index;
    const w = currentWave();
    state.spawnQueue = w.enemyCount;
    state.spawnTimer = 0;
    state.waveClearPending = false;
    waveLabelEl.textContent = `WAVE ${index + 1} — ${w.labelJa}`;
    updateHud();
  }

  function spawnEnemy() {
    const w = currentWave();
    const side = Math.floor(Math.random() * 4);
    const margin = CFG.enemySpawnMarginOutsideArenaPixels;
    let x, y;
    if (side === 0) {
      x = Math.random() * CFG.arenaWidthPixels;
      y = -margin;
    } else if (side === 1) {
      x = Math.random() * CFG.arenaWidthPixels;
      y = CFG.arenaHeightPixels + margin;
    } else if (side === 2) {
      x = -margin;
      y = Math.random() * CFG.arenaHeightPixels;
    } else {
      x = CFG.arenaWidthPixels + margin;
      y = Math.random() * CFG.arenaHeightPixels;
    }
    state.enemies.push({
      x,
      y,
      r: CFG.enemyBaseRadiusPixels * w.sizeMultiplier,
      speed: CFG.enemyBaseSpeedPixelsPerSecond * w.speedMultiplier,
      hp: w.hitPoints,
      maxHp: w.hitPoints,
      color: w.colorHex,
      dead: false,
      deathTimer: 0,
      hitFlash: 0,
      scaleX: 1,
      scaleY: 1,
    });
  }

  function skipCurrentWaveAndRetry() {
    AudioSys.unlock();
    const next = Math.min(state.waveIndex + 1, CFG.waves.length - 1);
    const keptBest = state.bestWrap;
    state.deathsOnCurrentWave = 0;
    resetRun(true);
    state.bestWrap = keptBest;
    state.mode = 'playing';
    hideOverlay();
    beginWave(next);
    updateHud();
  }

  // —— Overlay ——
  // Ignore start/retry input for a short latch so death-frame keys don't auto-restart,
  // and so overlay cannot flicker from the same physical keydown that was already held.
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
    skipWaveBtn.classList.add('hidden');
    overlayInner.innerHTML = `
      <div class="title">置いて逃げろ</div>
      <div class="hook">攻撃は未来に置く。今の自分は当たる側。</div>
      <div class="giant-start" id="giant-start">START</div>
      <div class="controls">
        <span class="move">移動 ポインタ方向 / WASD</span>
        <span class="plant">設置 Space / Z / クリック</span>
      </div>
      <div class="sub">何かキーを押せば即プレイ</div>
    `;
    const gs = document.getElementById('giant-start');
    if (gs) {
      gs.addEventListener('click', (e) => {
        e.stopPropagation();
        startPlaying();
      });
    }
  }

  function showDead() {
    state.mode = 'dead';
    armOverlayInputSoon();
    overlay.classList.remove('hidden');
    const showSkip = state.deathsOnCurrentWave >= CFG.deathsOnSameWaveBeforeSkipButton;
    if (showSkip) skipWaveBtn.classList.remove('hidden');
    else skipWaveBtn.classList.add('hidden');
    overlayInner.innerHTML = `
      <div class="result-line">やられた</div>
      <div class="result-line" style="color:var(--best)">最大ヒット ${state.bestWrap}</div>
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

  function hideOverlay() {
    overlay.classList.add('hidden');
    skipWaveBtn.classList.add('hidden');
  }

  function startPlaying() {
    AudioSys.unlock();
    resetRun(false);
    state.mode = 'playing';
    hideOverlay();
    beginWave(0);
  }

  function retryFromDeath() {
    AudioSys.unlock();
    // Same wave, instant — no fade
    resetRun(true);
    state.mode = 'playing';
    hideOverlay();
    beginWave(state.waveIndex);
  }

  function showWrapPopup(n) {
    wrapPopup.textContent = n >= CFG.wrapPopupBigThreshold ? `ヒット ×${n}！` : `ヒット ${n}`;
    wrapPopup.classList.toggle('big', n >= CFG.wrapPopupBigThreshold);
    wrapPopup.classList.add('show');
    state.wrapPopupTimer = CFG.wrapPopupDurationSeconds;
  }

  function hideWrapPopup() {
    wrapPopup.classList.remove('show', 'big');
  }

  function updateHud() {
    const p = state.player;
    hpRow.innerHTML = '';
    for (let i = 0; i < CFG.playerMaxHitPoints; i++) {
      const d = document.createElement('div');
      d.className = 'hp-pip' + (p && i < p.hp ? '' : ' empty');
      hpRow.appendChild(d);
    }
    nowWrapEl.textContent = String(state.lastBurstWrap);
    bestWrapEl.textContent = String(state.bestWrap);
  }

  // —— Core actions ——
  function tryPlant() {
    if (state.mode !== 'playing') return;
    if (state.plantCooldown > 0) return;
    const p = state.player;
    state.bursts.push({
      x: p.x,
      y: p.y,
      r: CFG.burstRadiusPixels,
      timer: CFG.plantDelaySeconds,
      detonated: false,
    });
    p.plantPose = CFG.playerPlantPoseDurationSeconds;
    p.scaleX = CFG.playerPlantStretchScaleX;
    p.scaleY = CFG.playerPlantStretchScaleY;
    state.plantCooldown = CFG.plantCooldownSeconds;
    AudioSys.plant();
  }

  function detonateBurst(burst) {
    burst.detonated = true;
    const hits = [];
    let wrapCount = 0;

    // Enemies
    for (const en of state.enemies) {
      if (en.dead) continue;
      const d = dist(burst.x, burst.y, en.x, en.y);
      if (d <= burst.r + en.r) {
        wrapCount++;
        hits.push({ x: (burst.x + en.x) * 0.5, y: (burst.y + en.y) * 0.5, enemy: en });
        en.hp -= CFG.burstDamageToEnemyHitPoints;
        en.hitFlash = 0.1;
        // knockback away from center
        const ang = Math.atan2(en.y - burst.y, en.x - burst.x);
        en.x += Math.cos(ang) * CFG.enemyKnockbackOnHitPixels;
        en.y += Math.sin(ang) * CFG.enemyKnockbackOnHitPixels;
        const isKo = en.hp <= 0;
        if (isKo) {
          en.dead = true;
          en.deathTimer = CFG.enemyDeathShrinkDurationSeconds;
        }
        AudioSys.hit(isKo);
      }
    }

    // Player self-hit
    const p = state.player;
    const pd = dist(burst.x, burst.y, p.x, p.y);
    if (pd <= burst.r + p.r) {
      damagePlayer(CFG.burstDamageToPlayerHitPoints);
      spawnHitMark(p.x, p.y);
    }

    for (const h of hits) spawnHitMark(h.x, h.y);

    // VFX stages
    if (!debug.hideVfx) {
      state.effects.push({
        kind: 'burstFlash',
        x: burst.x,
        y: burst.y,
        r: burst.r,
        life: CFG.burstFlashDurationSeconds,
        maxLife: CFG.burstFlashDurationSeconds,
        animateInHitstop: true,
      });
      state.effects.push({
        kind: 'burstFire',
        x: burst.x,
        y: burst.y,
        r: burst.r,
        life: CFG.burstFireDurationSeconds,
        maxLife: CFG.burstFireDurationSeconds,
        delay: 0,
        animateInHitstop: true,
      });
      state.effects.push({
        kind: 'burstSmoke',
        x: burst.x,
        y: burst.y,
        r: burst.r * 0.85,
        life: CFG.burstSmokeDurationSeconds,
        maxLife: CFG.burstSmokeDurationSeconds,
        delay: CFG.burstFireDurationSeconds * 0.55,
        animateInHitstop: true,
      });
    }

    // Hitstop + shake (bigger for multi-wrap)
    const multi = wrapCount >= CFG.hitstopMinimumWrapCountForExtra;
    state.hitstopRemaining = multi
      ? CFG.hitstopOnMultiWrapSeconds
      : CFG.hitstopOnSingleConnectSeconds;
    // Still hitstop a bit even on miss? Spec: on every connect. If wrap 0, shorter shake only.
    if (wrapCount === 0) {
      state.hitstopRemaining = 0;
      state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnSingleWrapPixels * 0.4);
    } else {
      state.shakeAmount = Math.max(
        state.shakeAmount,
        multi ? CFG.shakeOnMultiWrapPixels : CFG.shakeOnSingleWrapPixels
      );
    }

    AudioSys.burst(wrapCount);
    if (wrapCount > 0) {
      state.lastBurstWrap = wrapCount;
      if (wrapCount > state.bestWrap) state.bestWrap = wrapCount;
      showWrapPopup(wrapCount);
      AudioSys.wrapFanfare(wrapCount);
      updateHud();
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
      // flag: animates during hitstop
      animateInHitstop: true,
    });
  }

  function damagePlayer(amount) {
    const p = state.player;
    if (debug.godMode) return;
    if (p.invuln > 0) return;
    p.hp -= amount;
    p.invuln = CFG.playerInvincibleAfterHitSeconds;
    p.hurtPose = CFG.playerHurtFlashDurationSeconds;
    p.scaleX = CFG.playerHurtSquashScaleX;
    p.scaleY = CFG.playerHurtSquashScaleY;
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnSingleWrapPixels * 1.2);
    AudioSys.hurt();
    updateHud();
    if (p.hp <= 0) {
      state.deathsOnCurrentWave += 1;
      showDead();
    }
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.hypot(dx, dy);
  }

  function clampPlayer() {
    const p = state.player;
    const pad = CFG.arenaPaddingFromWallPixels;
    p.x = Math.max(pad, Math.min(CFG.arenaWidthPixels - pad, p.x));
    p.y = Math.max(pad, Math.min(CFG.arenaHeightPixels - pad, p.y));
  }

  // —— Update ——
  function update(dt) {
    // Title / dead: wait for mash
    if (state.mode === 'title') {
      if (overlayInputArmed && (anyKeyThisFrame || plantPressedThisFrame)) startPlaying();
      return;
    }
    if (state.mode === 'dead') {
      if (overlayInputArmed && (plantPressedThisFrame || anyKeyThisFrame)) {
        // Space on result restarts (rescue)
        retryFromDeath();
      }
      return;
    }

    // Hitstop: freeze sim, but hit marks keep animating
    if (state.hitstopRemaining > 0) {
      state.hitstopRemaining -= dt;
      updateEffectsHitstopOnly(dt);
      updateShake(dt);
      updateWrapPopup(dt);
      return;
    }

    if (state.mode === 'breath') {
      state.breathTimer -= dt;
      updateEffects(dt);
      updateShake(dt);
      updateWrapPopup(dt);
      updatePlayerVisualTimers(dt);
      if (state.breathTimer <= 0) {
        const next = state.waveIndex + 1;
        if (next >= CFG.waves.length) {
          // Loop hardest wave with peaky feel — restart wave list peak
          beginWave(CFG.waves.length - 1);
        } else {
          beginWave(next);
        }
        state.deathsOnCurrentWave = 0;
        state.mode = 'playing';
      }
      return;
    }

    // playing
    updatePlayer(dt);
    updateBursts(dt);
    updateEnemies(dt);
    updateSpawns(dt);
    updateEffects(dt);
    updateShake(dt);
    updateWrapPopup(dt);
    checkWaveClear();

    if (state.plantCooldown > 0) state.plantCooldown -= dt;
  }

  function updatePlayer(dt) {
    const p = state.player;
    let mx = 0;
    let my = 0;
    if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) my += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
    if (mx === 0 && my === 0 && pointerAim.overCanvas) {
      const dx = pointerAim.x - p.x;
      const dy = pointerAim.y - p.y;
      const pointerDistance = Math.hypot(dx, dy);
      const aimingIntoOwnBurst = state.bursts.some(
        (b) => !b.detonated && dist(pointerAim.x, pointerAim.y, b.x, b.y) <= b.r + p.r
      );
      if (pointerDistance > CFG.pointerMoveDeadzonePixels && !aimingIntoOwnBurst) {
        mx = dx / pointerDistance;
        my = dy / pointerDistance;
      }
    }
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my) || 1;
      mx /= len;
      my /= len;
      p.x += mx * CFG.playerMoveSpeedPixelsPerSecond * dt;
      p.y += my * CFG.playerMoveSpeedPixelsPerSecond * dt;
      p.facingX = mx;
      p.facingY = my;
    }
    clampPlayer();

    if (plantPressedThisFrame || pointerDownPlant) tryPlant();

    if (p.invuln > 0) p.invuln -= dt;
    updatePlayerVisualTimers(dt);

    // Contact damage from enemies
    for (const en of state.enemies) {
      if (en.dead) continue;
      if (dist(p.x, p.y, en.x, en.y) <= p.r + en.r) {
        damagePlayer(1);
        spawnHitMark((p.x + en.x) * 0.5, (p.y + en.y) * 0.5);
        break;
      }
    }
  }

  function updatePlayerVisualTimers(dt) {
    const p = state.player;
    if (!p) return;
    if (p.plantPose > 0) {
      p.plantPose -= dt;
      if (p.plantPose <= 0) {
        p.scaleX = 1;
        p.scaleY = 1;
      }
    }
    if (p.hurtPose > 0) {
      p.hurtPose -= dt;
      if (p.hurtPose <= 0 && p.plantPose <= 0) {
        p.scaleX = 1;
        p.scaleY = 1;
      }
    }
  }

  function updateBursts(dt) {
    for (const b of state.bursts) {
      if (b.detonated) continue;
      b.timer -= dt;
      if (b.timer <= 0) detonateBurst(b);
    }
    state.bursts = state.bursts.filter((b) => !b.detonated);
  }

  function updateEnemies(dt) {
    const p = state.player;
    for (const en of state.enemies) {
      if (en.dead) {
        en.deathTimer -= dt;
        en.scaleX = Math.max(0.01, en.deathTimer / CFG.enemyDeathShrinkDurationSeconds);
        en.scaleY = en.scaleX;
        continue;
      }
      const dx = p.x - en.x;
      const dy = p.y - en.y;
      const len = Math.hypot(dx, dy) || 1;
      en.x += (dx / len) * en.speed * dt;
      en.y += (dy / len) * en.speed * dt;
      if (en.hitFlash > 0) en.hitFlash -= dt;
    }
    state.enemies = state.enemies.filter((en) => !en.dead || en.deathTimer > 0);
  }

  function updateSpawns(dt) {
    if (state.spawnQueue <= 0) return;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.spawnQueue -= 1;
      state.spawnTimer = CFG.waveEnemySpawnStaggerSeconds;
    }
  }

  function checkWaveClear() {
    if (state.spawnQueue > 0) return;
    if (state.enemies.some((e) => !e.dead)) return;
    if (state.bursts.length > 0) return;
    if (state.mode !== 'playing') return;
    state.mode = 'breath';
    state.breathTimer = CFG.waveClearBreathSeconds;
    waveLabelEl.textContent = '…息…';
  }

  function updateEffects(dt) {
    for (const fx of state.effects) {
      if (fx.delay && fx.delay > 0) {
        fx.delay -= dt;
        continue;
      }
      fx.life -= dt;
    }
    state.effects = state.effects.filter((fx) => fx.life > 0 || (fx.delay && fx.delay > 0));
  }

  function updateEffectsHitstopOnly(dt) {
    for (const fx of state.effects) {
      if (!fx.animateInHitstop) continue;
      if (fx.delay && fx.delay > 0) {
        fx.delay -= dt;
        continue;
      }
      fx.life -= dt;
    }
    state.effects = state.effects.filter((fx) => {
      if (fx.delay && fx.delay > 0) return true;
      return fx.life > 0;
    });
  }

  function updateShake(dt) {
    if (state.shakeAmount > 0) {
      state.shakeAmount = Math.max(0, state.shakeAmount - CFG.shakeDecayPerSecond * dt * state.shakeAmount);
      if (state.shakeAmount < CFG.shakeAmountCutoffPixels) state.shakeAmount = 0;
    }
  }

  function updateWrapPopup(dt) {
    if (state.wrapPopupTimer > 0) {
      state.wrapPopupTimer -= dt;
      if (state.wrapPopupTimer <= 0) hideWrapPopup();
    }
  }

  // —— Draw ——
  function draw() {
    const shake = state.shakeAmount;
    let ox = 0;
    let oy = 0;
    if (shake > 0) {
      // Strongest feel on first frames via current amount; random jitter
      ox = (Math.random() * 2 - 1) * shake * CFG.shakeRandomJitterStrength;
      oy = (Math.random() * 2 - 1) * shake * CFG.shakeRandomJitterStrength;
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(ox, oy);

    // Floor
    ctx.fillStyle = CFG.colorArenaFloor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // subtle grid (cheap atmosphere, not bloom)
    ctx.strokeStyle = '#22262f';
    ctx.lineWidth = 1;
    const grid = CFG.arenaGridSpacingPixels;
    for (let x = 0; x < canvas.width; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Bursts (warning)
    for (const b of state.bursts) {
      drawBurstWarning(b);
    }

    // Effects under player (fire/smoke/hitmarks) — player ABOVE effects
    if (!debug.hideVfx) {
      for (const fx of state.effects) {
        if (fx.kind === 'hitMark') continue; // hit marks drawn above enemies but player still on top of fire
        drawEffect(fx);
      }
    }

    // Enemies
    for (const en of state.enemies) drawEnemy(en);

    // Hit marks (high contrast) — still under player per "player above effects"
    if (!debug.hideVfx) {
      for (const fx of state.effects) {
        if (fx.kind === 'hitMark') drawEffect(fx);
      }
    }

    // Player on top
    if (state.player) drawPlayer(state.player);

    // Hitboxes debug
    if (debug.showHitboxes) drawHitboxes();

    // God mode indicator
    if (debug.godMode) {
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('GOD', 8, 16);
    }

    ctx.restore();
  }

  function drawBurstWarning(b) {
    const t = b.timer / CFG.plantDelaySeconds;
    const pulse = 0.55 + 0.45 * Math.sin((1 - t) * Math.PI * 2 * CFG.burstWarningPulseHz);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = CFG.colorBurstWarning;
    ctx.globalAlpha = CFG.burstWarningDiskAlphaBase + CFG.burstWarningDiskAlphaPulse * pulse;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = CFG.burstWarningOuterLineWidthPixels;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.strokeStyle = CFG.colorBurstWarning;
    ctx.globalAlpha = CFG.burstWarningStrokeAlphaBase + CFG.burstWarningStrokeAlphaPulse * pulse;
    ctx.lineWidth = CFG.burstWarningBrightLineWidthPixels;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, Math.max(4, b.r * (1 - t)), 0, Math.PI * 2);
    ctx.fillStyle = CFG.colorBurstWarning;
    ctx.globalAlpha =
      CFG.burstWarningFillAlphaBase + CFG.burstWarningFillAlphaPulse * pulse + CFG.burstWarningFillAlphaExtra;
    ctx.fill();
    ctx.globalAlpha = 1;
    const arm = CFG.burstWarningCrosshairArmPixels;
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - arm, b.y);
    ctx.lineTo(b.x + arm, b.y);
    ctx.moveTo(b.x, b.y - arm);
    ctx.lineTo(b.x, b.y + arm);
    ctx.stroke();
    ctx.strokeStyle = CFG.colorBurstWarning;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x - arm, b.y);
    ctx.lineTo(b.x + arm, b.y);
    ctx.moveTo(b.x, b.y - arm);
    ctx.lineTo(b.x, b.y + arm);
    ctx.stroke();
  }

  function drawEffect(fx) {
    if (fx.delay && fx.delay > 0) return;
    const lifeRatio = fx.life / fx.maxLife;

    if (fx.kind === 'burstFlash') {
      // 1-frame flash with dark mixed in
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r * 1.05, 0, Math.PI * 2);
      ctx.fillStyle = CFG.colorBurstFlash;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 4;
      ctx.globalAlpha = 1;
      ctx.stroke();
      // dark mix
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1008';
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'burstFire') {
      // crisp spiky fire
      const spikes = CFG.burstSpikyPointCount;
      const r = fx.r * (0.75 + 0.25 * lifeRatio);
      ctx.beginPath();
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.55;
        const px = fx.x + Math.cos(a) * rr;
        const py = fx.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = CFG.colorBurstFire;
      ctx.globalAlpha = 0.95 * lifeRatio + 0.2;
      ctx.fill();
      ctx.strokeStyle = CFG.colorBurstFireEdge;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 1;
      ctx.stroke();
    } else if (fx.kind === 'burstSmoke') {
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r * (1.1 - 0.3 * lifeRatio), 0, Math.PI * 2);
      ctx.fillStyle = CFG.colorBurstSmoke;
      ctx.globalAlpha = 0.55 * lifeRatio;
      ctx.fill();
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7 * lifeRatio;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'hitMark') {
      const s = CFG.hitMarkSizePixels * (0.7 + 0.3 * lifeRatio);
      ctx.save();
      ctx.translate(fx.x, fx.y);
      ctx.rotate((1 - lifeRatio) * CFG.hitMarkSpinRadiansOverLife);
      for (let i = 0; i < CFG.hitMarkSpikeCount; i++) {
        const a = (i / CFG.hitMarkSpikeCount) * Math.PI * 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        ctx.lineTo(Math.cos(a + 0.35) * s * 0.35, Math.sin(a + 0.35) * s * 0.35);
        ctx.closePath();
        ctx.fillStyle = CFG.colorHitMark;
        ctx.fill();
        ctx.strokeStyle = CFG.colorHitMarkEdge;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawEnemy(en) {
    ctx.save();
    ctx.translate(en.x, en.y);
    ctx.scale(en.scaleX, en.scaleY);
    // body — opaque with dark edge
    ctx.beginPath();
    ctx.arc(0, 0, en.r, 0, Math.PI * 2);
    ctx.fillStyle = en.hitFlash > 0 ? '#ffffff' : en.color;
    ctx.fill();
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 3;
    ctx.stroke();
    // eye notch toward player for readability
    if (state.player && !en.dead) {
      const a = Math.atan2(state.player.y - en.y, state.player.x - en.x);
      ctx.beginPath();
      ctx.arc(
        Math.cos(a) * en.r * CFG.enemyEyeOffsetFractionOfBody,
        Math.sin(a) * en.r * CFG.enemyEyeOffsetFractionOfBody,
        en.r * CFG.enemyEyeRadiusFractionOfBody,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.scaleX, p.scaleY);
    // invuln blink
    if (p.invuln > 0 && Math.floor(p.invuln * CFG.playerInvulnBlinkHz) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }
    // extreme hurt silhouette: dark flash ring
    if (p.hurtPose > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, p.r * 1.55, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0a0a';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.hurtPose > 0 ? '#ff5c5c' : CFG.colorPlayerBody;
    ctx.fill();
    ctx.strokeStyle = CFG.colorPlayerEdge;
    ctx.lineWidth = 3;
    ctx.stroke();
    // facing chevron
    const fx = p.facingX;
    const fy = p.facingY;
    ctx.beginPath();
    ctx.moveTo(fx * p.r * 0.15, fy * p.r * 0.15);
    ctx.lineTo(fx * p.r * 0.75 - fy * p.r * 0.35, fy * p.r * 0.75 + fx * p.r * 0.35);
    ctx.lineTo(fx * p.r * 0.75 + fy * p.r * 0.35, fy * p.r * 0.75 - fx * p.r * 0.35);
    ctx.closePath();
    ctx.fillStyle = CFG.colorPlayerPlantButtonHint;
    ctx.fill();
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawHitboxes() {
    ctx.lineWidth = CFG.debugHitboxLineWidthPixels;
    ctx.strokeStyle = CFG.debugHitboxStrokeColor;
    if (state.player) {
      ctx.beginPath();
      ctx.arc(state.player.x, state.player.y, state.player.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const en of state.enemies) {
      if (en.dead) continue;
      ctx.beginPath();
      ctx.arc(en.x, en.y, en.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const b of state.bursts) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // —— Loop ——
  let last = performance.now();

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > CFG.maxFrameDeltaSeconds) dt = CFG.maxFrameDeltaSeconds;

    update(dt);
    draw();

    plantPressedThisFrame = false;
    anyKeyThisFrame = false;
    pointerDownPlant = false;

    requestAnimationFrame(frame);
  }

  // Boot
  showTitle();
  updateHud();
  requestAnimationFrame(frame);
})();
