/**
 * 伸ばせ (Stretch)
 * Core verb: STRETCH — hold to rubber-extend toward pointer, grab with tip, release to snap/slingshot.
 * All tunables come from STRETCH_CONFIG — no magic numbers here.
 */
(function () {
  const CFG = window.STRETCH_CONFIG;
  const AudioSys = window.StretchAudio;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayInner = document.getElementById('overlay-inner');
  const hpRow = document.getElementById('hp-row');
  const nowGrabsEl = document.getElementById('now-grabs');
  const bestGrabsEl = document.getElementById('best-grabs');
  const muteBtn = document.getElementById('mute-btn');

  canvas.width = CFG.arenaWidthPixels;
  canvas.height = CFG.arenaHeightPixels;

  // —— Input ——
  const keys = Object.create(null);
  let stretchHeld = false;
  let stretchReleasedThisFrame = false;
  let anyKeyThisFrame = false;
  const pointerAim = {
    x: CFG.arenaWidthPixels * 0.5,
    y: CFG.arenaHeightPixels * 0.35,
    overCanvas: false,
  };

  const STRETCH_CODES = new Set(['Space']);
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
      if (STRETCH_CODES.has(e.code)) {
        if (!e.repeat) stretchHeld = true;
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
    if (STRETCH_CODES.has(e.code)) {
      if (stretchHeld) stretchReleasedThisFrame = true;
      stretchHeld = false;
    }
  });

  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    if (stretchHeld) stretchReleasedThisFrame = true;
    stretchHeld = false;
    pointerDown = false;
  });

  let pointerDown = false;

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
    pointerDown = true;
    stretchHeld = true;
    anyKeyThisFrame = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
  });

  canvas.addEventListener('pointerup', (e) => {
    if (pointerDown) {
      stretchReleasedThisFrame = true;
      stretchHeld = false;
      pointerDown = false;
    }
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
  });

  canvas.addEventListener('pointercancel', () => {
    if (pointerDown || stretchHeld) stretchReleasedThisFrame = true;
    pointerDown = false;
    stretchHeld = false;
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

  // —— Debug ——
  const debug = {
    godMode: false,
    hideVfx: false,
    showHitboxes: false,
  };

  function handleDebugKey(e) {
    if (e.code === 'F1') {
      if (!state.player) return;
      state.player.hp = CFG.playerMaxHitPoints;
      updateHud();
    } else if (e.code === 'F2') {
      // skip-ish: clear nearby threats + spawn a close target
      if (state.mode !== 'play') return;
      state.enemies.length = 0;
      spawnTargetNearAim();
      state.grabCooldown = 0;
    } else if (e.code === 'F3') {
      debug.godMode = !debug.godMode;
    } else if (e.code === 'F4') {
      debug.hideVfx = !debug.hideVfx;
    } else if (e.code === 'F5') {
      debug.showHitboxes = !debug.showHitboxes;
    }
  }

  // —— Helpers ——
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function dist(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.hypot(dx, dy);
  }

  function norm(dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len, len };
  }

  function randRange(a, b) {
    return a + Math.random() * (b - a);
  }

  function bestScoreKey() {
    return 'stretch-w39-best-grabs';
  }

  function loadBest() {
    try {
      return Math.max(0, parseInt(localStorage.getItem(bestScoreKey()) || '0', 10) || 0);
    } catch (_) {
      return 0;
    }
  }

  function saveBest(n) {
    try {
      localStorage.setItem(bestScoreKey(), String(n));
    } catch (_) {}
  }

  // —— State ——
  const state = {
    mode: 'title', // title | howto | play | dead
    howSlide: 0,
    overlayArmedAt: 0,
    player: null,
    stretch: null,
    enemies: [],
    targets: [],
    particles: [],
    floatTexts: [],
    grabs: 0,
    bestGrabs: loadBest(),
    hitstop: 0,
    shake: 0,
    shakeAngle: 0,
    targetSpawnTimer: 0,
    enemySpawnTimer: 0,
    grabCooldown: 0,
    deathTimer: 0,
    time: 0,
  };

  function makePlayer() {
    return {
      x: CFG.arenaWidthPixels * 0.5,
      y: CFG.arenaHeightPixels * 0.55,
      vx: 0,
      vy: 0,
      hp: CFG.playerMaxHitPoints,
      invuln: CFG.playerSpawnInvincibleSeconds,
      hurtFlash: 0,
      scaleX: 1,
      scaleY: 1,
      poseT: 0,
    };
  }

  function makeStretch() {
    return {
      active: false,
      length: CFG.stretchMinLengthPixels,
      angle: -Math.PI / 2,
      tipX: 0,
      tipY: 0,
      grabbedThisHold: false,
      snapbackT: 0,
      snapbackFrom: 0,
      warning: false,
      danger: false,
      needRelease: false,
    };
  }

  function resetRun() {
    state.player = makePlayer();
    state.stretch = makeStretch();
    state.enemies = [];
    state.targets = [];
    state.particles = [];
    state.floatTexts = [];
    state.grabs = 0;
    state.hitstop = 0;
    state.shake = 0;
    state.targetSpawnTimer = 0.35;
    state.enemySpawnTimer = 2.2;
    state.grabCooldown = 0;
    state.deathTimer = 0;
    state.time = 0;
    // easy opener: one star above the player
    state.targets.push({
      x: CFG.arenaWidthPixels * 0.5,
      y: CFG.arenaHeightPixels * 0.22,
      r: CFG.targetRadiusPixels,
      life: CFG.targetLifetimeSeconds,
      alive: true,
      phase: 0,
    });
    spawnTarget();
    for (let i = 0; i < CFG.enemyInitialCount; i++) spawnEnemy();
    updateHud();
  }

  function updateHud() {
    const p = state.player;
    const maxHp = CFG.playerMaxHitPoints;
    hpRow.innerHTML = '';
    for (let i = 0; i < maxHp; i++) {
      const pip = document.createElement('div');
      pip.className = 'hp-pip' + (p && i < p.hp ? '' : ' empty');
      hpRow.appendChild(pip);
    }
    nowGrabsEl.textContent = String(state.grabs);
    if (state.grabs > state.bestGrabs) {
      state.bestGrabs = state.grabs;
      saveBest(state.bestGrabs);
    }
    bestGrabsEl.textContent = String(state.bestGrabs);
  }

  // —— Spawns ——
  function spawnEnemy() {
    if (state.enemies.length >= CFG.enemyMaxAlive) return;
    const variant = CFG.enemyVariants[Math.floor(Math.random() * CFG.enemyVariants.length)];
    const pad = CFG.enemySpawnEdgePaddingPixels;
    const side = Math.floor(Math.random() * 4);
    let x;
    let y;
    if (side === 0) {
      x = randRange(pad, CFG.arenaWidthPixels - pad);
      y = pad;
    } else if (side === 1) {
      x = randRange(pad, CFG.arenaWidthPixels - pad);
      y = CFG.arenaHeightPixels - pad;
    } else if (side === 2) {
      x = pad;
      y = randRange(pad, CFG.arenaHeightPixels - pad);
    } else {
      x = CFG.arenaWidthPixels - pad;
      y = randRange(pad, CFG.arenaHeightPixels - pad);
    }
    // keep away from player core on spawn
    if (state.player && dist(x, y, state.player.x, state.player.y) < 120) {
      x = CFG.arenaWidthPixels - x;
      y = CFG.arenaHeightPixels - y;
    }
    state.enemies.push({
      x,
      y,
      r: CFG.enemyBaseRadiusPixels * variant.sizeMul,
      speed: CFG.enemyBaseSpeedPixelsPerSecond * variant.speedMul,
      alive: true,
    });
  }

  function spawnTarget() {
    if (state.targets.length >= CFG.targetMaxAlive) return;
    const pad = CFG.targetEdgePaddingPixels;
    const p = state.player;
    let x = 0;
    let y = 0;
    let ok = false;
    for (let tries = 0; tries < 24; tries++) {
      x = randRange(pad, CFG.arenaWidthPixels - pad);
      y = randRange(pad, CFG.arenaHeightPixels - pad);
      if (!p || dist(x, y, p.x, p.y) >= CFG.targetMinDistanceFromPlayerPixels) {
        ok = true;
        break;
      }
    }
    if (!ok && p) {
      const ang = Math.random() * Math.PI * 2;
      x = clamp(p.x + Math.cos(ang) * 180, pad, CFG.arenaWidthPixels - pad);
      y = clamp(p.y + Math.sin(ang) * 180, pad, CFG.arenaHeightPixels - pad);
    }
    state.targets.push({
      x,
      y,
      r: CFG.targetRadiusPixels,
      life: CFG.targetLifetimeSeconds,
      alive: true,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function spawnTargetNearAim() {
    const p = state.player;
    if (!p) return;
    const n = norm(pointerAim.x - p.x, pointerAim.y - p.y);
    const len = 120;
    state.targets.push({
      x: clamp(p.x + n.x * len, 40, CFG.arenaWidthPixels - 40),
      y: clamp(p.y + n.y * len, 40, CFG.arenaHeightPixels - 40),
      r: CFG.targetRadiusPixels,
      life: CFG.targetLifetimeSeconds,
      alive: true,
      phase: 0,
    });
  }

  // —— VFX ——
  function addBurst(x, y, count, life, speedMin, speedRange, color) {
    if (debug.hideVfx) return;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = speedMin + Math.random() * speedRange;
      state.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life,
        maxLife: life,
        r: 3 + Math.random() * 3,
        color: color || CFG.colorVfxCore,
      });
    }
  }

  function addFloatText(x, y, text, color) {
    if (debug.hideVfx) return;
    state.floatTexts.push({
      x,
      y,
      text,
      color: color || CFG.colorScoreAccent,
      life: CFG.floatTextLifetimeSeconds,
      maxLife: CFG.floatTextLifetimeSeconds,
    });
  }

  function applyShake(amount) {
    state.shake = Math.max(state.shake, amount);
    state.shakeAngle = Math.random() * Math.PI * 2;
  }

  function applyHitstop(seconds) {
    state.hitstop = Math.max(state.hitstop, seconds);
  }

  // —— Combat ——
  function hurtPlayer(amount, fromX, fromY) {
    const p = state.player;
    if (!p || state.mode !== 'play') return;
    if (debug.godMode) return;
    if (p.invuln > 0) return;
    p.hp -= amount;
    p.invuln = CFG.playerInvincibleAfterHitSeconds;
    p.hurtFlash = CFG.playerHurtFlashDurationSeconds;
    p.scaleX = 1.35;
    p.scaleY = 0.6;
    p.poseT = CFG.playerPoseRecoverSeconds;
    applyHitstop(CFG.hitstopOnHurtSeconds);
    applyShake(CFG.shakeOnHurtPixels);
    AudioSys.hurt();
    if (fromX != null && fromY != null) {
      const n = norm(p.x - fromX, p.y - fromY);
      p.vx += n.x * 180;
      p.vy += n.y * 180;
    }
    updateHud();
    if (p.hp <= 0) {
      die();
    }
  }

  function die() {
    state.mode = 'dead';
    state.deathTimer = CFG.deathRetryDelaySeconds;
    AudioSys.stopStretchHum();
    AudioSys.ko();
    applyShake(CFG.shakeOnOverstretchSnapPixels);
    showDeadOverlay();
  }

  function onGrab(x, y, kind) {
    state.grabs += kind === 'enemy' ? CFG.enemyGrabScore : CFG.targetGrabScore;
    state.grabCooldown = CFG.stretchGrabCooldownSeconds;
    state.stretch.grabbedThisHold = true;
    applyHitstop(kind === 'enemy' ? CFG.hitstopOnEnemySlapSeconds : CFG.hitstopOnGrabSeconds);
    applyShake(kind === 'enemy' ? CFG.shakeOnEnemySlapPixels : CFG.shakeOnGrabPixels);
    AudioSys.grab();
    addBurst(
      x,
      y,
      CFG.grabBurstParticleCount,
      CFG.grabBurstLifetimeSeconds,
      CFG.grabBurstSpeedMinPixelsPerSecond,
      CFG.grabBurstSpeedRangePixelsPerSecond,
      CFG.colorVfxCore
    );
    addFloatText(x, y - 10, '掴み', CFG.colorScoreAccent);
    // squash on successful grab
    const p = state.player;
    p.scaleX = 0.7;
    p.scaleY = 1.35;
    p.poseT = CFG.playerPoseRecoverSeconds;
    updateHud();

    // escalate: more enemies over time
    if (state.grabs > 0 && state.grabs % CFG.enemyWaveEveryGrabs === 0) {
      spawnEnemy();
    }
  }

  function overstretchSnap() {
    const p = state.player;
    const s = state.stretch;
    const tipX = s.tipX;
    const tipY = s.tipY;
    s.active = false;
    s.length = CFG.stretchMinLengthPixels;
    s.snapbackT = 0;
    s.needRelease = true;
    AudioSys.stopStretchHum();
    AudioSys.snap();
    applyHitstop(CFG.hitstopOnOverstretchSnapSeconds);
    applyShake(CFG.shakeOnOverstretchSnapPixels);
    addBurst(
      tipX,
      tipY,
      CFG.snapParticleCount,
      CFG.snapBurstLifetimeSeconds,
      100,
      180,
      CFG.colorStretchDanger
    );
    // slingshot reverse
    const n = norm(Math.cos(s.angle), Math.sin(s.angle));
    p.vx -= n.x * CFG.stretchReleaseSnapForcePixelsPerSecond * 0.55;
    p.vy -= n.y * CFG.stretchReleaseSnapForcePixelsPerSecond * 0.55;
    p.scaleX = 1.45;
    p.scaleY = 0.55;
    p.poseT = CFG.playerPoseRecoverSeconds;
    hurtPlayer(CFG.stretchOverstretchSelfDamage, tipX, tipY);
  }

  function releaseStretch() {
    const p = state.player;
    const s = state.stretch;
    if (!s.active) return;
    const len = s.length;
    const n = { x: Math.cos(s.angle), y: Math.sin(s.angle) };
    s.active = false;
    s.snapbackT = CFG.stretchSnapbackDurationSeconds;
    s.snapbackFrom = len;
    AudioSys.stopStretchHum();
    AudioSys.release();
    applyShake(4 + len * 0.02);
    // slingshot: body launches toward stretch direction (rubber pull)
    const force =
      CFG.stretchSlingshotForcePixelsPerSecond *
      clamp(len / CFG.stretchMaxSafeLengthPixels, 0.25, 1.15);
    p.vx += n.x * force;
    p.vy += n.y * force;
    p.scaleX = 0.65;
    p.scaleY = 1.4;
    p.poseT = CFG.playerPoseRecoverSeconds;
    addBurst(
      s.tipX,
      s.tipY,
      6,
      0.14,
      60,
      100,
      CFG.colorStretchBody
    );
    s.length = CFG.stretchMinLengthPixels;
  }

  // —— Physics / update ——
  function clampPlayerToArena(p) {
    const pad = CFG.arenaPaddingFromWallPixels + CFG.playerCoreRadiusPixels;
    p.x = clamp(p.x, pad, CFG.arenaWidthPixels - pad);
    p.y = clamp(p.y, pad, CFG.arenaHeightPixels - pad);
  }

  function updateStretch(dt) {
    const p = state.player;
    const s = state.stretch;
    const rawHolding = stretchHeld || !!keys.Space;
    if (!rawHolding) s.needRelease = false;
    const holding = rawHolding && !s.needRelease;

    // aim angle always follows pointer
    const aim = norm(pointerAim.x - p.x, pointerAim.y - p.y);
    if (aim.len > 4) s.angle = Math.atan2(aim.y, aim.x);

    if (s.snapbackT > 0) {
      s.snapbackT -= dt;
      if (s.snapbackT < 0) s.snapbackT = 0;
    }

    if (holding && state.mode === 'play' && p.hp > 0) {
      if (!s.active) {
        s.active = true;
        s.length = CFG.stretchMinLengthPixels;
        s.grabbedThisHold = false;
      }
      s.length += CFG.stretchGrowPixelsPerSecond * dt;
      const warnAt = CFG.stretchSnapLengthPixels * CFG.stretchWarningRatio;
      s.warning = s.length >= warnAt;
      s.danger = s.length >= CFG.stretchMaxSafeLengthPixels;
      // tension squash
      const t = clamp(s.length / CFG.stretchSnapLengthPixels, 0, 1);
      p.scaleX = 1 - t * 0.25;
      p.scaleY = 1 + t * 0.35;
      AudioSys.startStretchHum(t);

      if (s.length >= CFG.stretchSnapLengthPixels) {
        overstretchSnap();
        return;
      }
    } else if (s.active) {
      // released
      releaseStretch();
    }

    s.tipX = p.x + Math.cos(s.angle) * s.length;
    s.tipY = p.y + Math.sin(s.angle) * s.length;

    // grab checks while stretching
    if (s.active && state.grabCooldown <= 0) {
      // targets
      for (const t of state.targets) {
        if (!t.alive) continue;
        if (dist(s.tipX, s.tipY, t.x, t.y) <= t.r + CFG.stretchTipRadiusPixels) {
          t.alive = false;
          onGrab(t.x, t.y, 'target');
          break;
        }
      }
      // enemies — slap/grab with tip
      for (const e of state.enemies) {
        if (!e.alive) continue;
        if (dist(s.tipX, s.tipY, e.x, e.y) <= e.r + CFG.stretchTipRadiusPixels) {
          e.alive = false;
          onGrab(e.x, e.y, 'enemy');
          state.enemySpawnTimer = Math.max(state.enemySpawnTimer, CFG.enemyRespawnDelaySeconds);
          break;
        }
      }
    }
  }

  function stretchBodyHitsEnemy(e) {
    const p = state.player;
    const s = state.stretch;
    // short reach: tip risk only; long stretch = elongated hurtbox
    if (!s.active || s.length < CFG.playerCoreRadiusPixels * 3) return false;
    // approximate capsule: distance from enemy center to segment
    const ax = p.x;
    const ay = p.y;
    const bx = s.tipX;
    const by = s.tipY;
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby || 1;
    let t = ((e.x - ax) * abx + (e.y - ay) * aby) / len2;
    t = clamp(t, 0.15, 1); // ignore near-core segment (core has its own check)
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    const hitR = CFG.stretchBodyHalfWidthPixels + e.r * 0.75;
    return dist(cx, cy, e.x, e.y) <= hitR;
  }

  function updateEnemies(dt) {
    const p = state.player;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const n = norm(p.x - e.x, p.y - e.y);
      e.x += n.x * e.speed * dt;
      e.y += n.y * e.speed * dt;
      // core contact
      if (dist(e.x, e.y, p.x, p.y) <= e.r + CFG.playerCoreRadiusPixels) {
        hurtPlayer(CFG.enemyHitDamage, e.x, e.y);
      } else if (state.stretch.active && stretchBodyHitsEnemy(e)) {
        // stretched body is a longer hurtbox — risk of holding
        hurtPlayer(CFG.enemyHitDamage, e.x, e.y);
      }
    }
    state.enemies = state.enemies.filter((e) => e.alive);
  }

  function updateTargets(dt) {
    for (const t of state.targets) {
      t.life -= dt;
      if (t.life <= 0) t.alive = false;
    }
    state.targets = state.targets.filter((t) => t.alive);
  }

  function updateParticles(dt) {
    for (const pt of state.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const ft of state.floatTexts) {
      ft.life -= dt;
      ft.y -= CFG.floatTextRisePixelsPerSecond * dt;
    }
    state.floatTexts = state.floatTexts.filter((ft) => ft.life > 0);
  }

  function updatePlayer(dt) {
    const p = state.player;
    // velocity decay (slingshot coast)
    p.vx *= Math.exp(-CFG.stretchSlingshotDecayPerSecond * dt);
    p.vy *= Math.exp(-CFG.stretchSlingshotDecayPerSecond * dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    clampPlayerToArena(p);

    if (p.invuln > 0) p.invuln -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;
    if (p.poseT > 0) {
      p.poseT -= dt;
      const k = clamp(p.poseT / CFG.playerPoseRecoverSeconds, 0, 1);
      p.scaleX = p.scaleX * k + 1 * (1 - k);
      p.scaleY = p.scaleY * k + 1 * (1 - k);
    } else if (!state.stretch.active) {
      p.scaleX += (1 - p.scaleX) * Math.min(1, dt * 10);
      p.scaleY += (1 - p.scaleY) * Math.min(1, dt * 10);
    }
  }

  function fixedUpdate(dt) {
    if (state.mode === 'dead') {
      state.deathTimer -= dt;
      if (state.deathTimer <= 0 && (anyKeyThisFrame || stretchReleasedThisFrame || stretchHeld)) {
        beginPlay();
      }
      return;
    }
    if (state.mode !== 'play') return;

    state.time += dt;
    if (state.hitstop > 0) {
      state.hitstop -= dt;
      return;
    }

    if (state.grabCooldown > 0) state.grabCooldown -= dt;

    updatePlayer(dt);
    updateStretch(dt);
    updateEnemies(dt);
    updateTargets(dt);
    updateParticles(dt);

    // spawn cadence
    state.targetSpawnTimer -= dt;
    if (state.targetSpawnTimer <= 0) {
      spawnTarget();
      state.targetSpawnTimer = CFG.targetSpawnIntervalSeconds;
    }
    state.enemySpawnTimer -= dt;
    if (state.enemySpawnTimer <= 0) {
      spawnEnemy();
      state.enemySpawnTimer = CFG.enemyRespawnDelaySeconds + Math.random() * 0.8;
    }

    if (state.shake > 0) {
      state.shake = Math.max(0, state.shake - CFG.shakeDecayPerSecond * dt);
      if (state.shake < CFG.shakeAmountCutoffPixels) state.shake = 0;
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

    // border
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, CFG.arenaWidthPixels - 4, CFG.arenaHeightPixels - 4);
  }

  function stretchColor() {
    const s = state.stretch;
    if (!s) return CFG.colorStretchBody;
    if (s.danger) return CFG.colorStretchDanger;
    if (s.warning) return CFG.colorStretchWarn;
    return CFG.colorStretchBody;
  }

  function drawStretch() {
    const p = state.player;
    const s = state.stretch;
    if (!p || !s) return;
    if (!s.active && s.snapbackT <= 0) return;

    let len = s.length;
    if (s.snapbackT > 0) {
      const k = s.snapbackT / CFG.stretchSnapbackDurationSeconds;
      len = s.snapbackFrom * k;
    }
    if (len < 4) return;

    const tipX = p.x + Math.cos(s.angle) * len;
    const tipY = p.y + Math.sin(s.angle) * len;
    const col = stretchColor();

    // tension shake on body
    let ox = 0;
    let oy = 0;
    if (s.active && s.warning) {
      const amp = CFG.stretchHeldShakeMaxPixels * (s.danger ? 1 : 0.5);
      ox = Math.sin(state.time * CFG.stretchTensionPulseHz * Math.PI * 2) * amp;
      oy = Math.cos(state.time * CFG.stretchTensionPulseHz * Math.PI * 2) * amp * 0.6;
    }

    ctx.save();
    ctx.translate(ox, oy);

    // dark outline body
    ctx.strokeStyle = CFG.colorPlayerEdge;
    ctx.lineWidth = CFG.stretchBodyHalfWidthPixels * 2 + 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // opaque core
    ctx.strokeStyle = col;
    ctx.lineWidth = CFG.stretchBodyHalfWidthPixels * 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // tip
    ctx.beginPath();
    ctx.arc(tipX, tipY, CFG.stretchTipRadiusPixels + 2, 0, Math.PI * 2);
    ctx.fillStyle = CFG.colorPlayerEdge;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tipX, tipY, CFG.stretchTipRadiusPixels, 0, Math.PI * 2);
    ctx.fillStyle = CFG.colorStretchTip;
    ctx.fill();

    // warn ring near snap
    if (s.active && s.warning) {
      ctx.strokeStyle = s.danger ? CFG.colorStretchDanger : CFG.colorStretchWarn;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tipX, tipY, CFG.stretchTipRadiusPixels + 6 + Math.sin(state.time * 20) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    if (debug.showHitboxes) {
      ctx.strokeStyle = CFG.debugHitboxStrokeColor;
      ctx.lineWidth = CFG.debugHitboxLineWidthPixels;
      ctx.beginPath();
      ctx.arc(tipX, tipY, CFG.stretchTipRadiusPixels, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const p = state.player;
    if (!p) return;
    const blink =
      p.invuln > 0 && Math.floor(state.time * CFG.playerInvulnBlinkHz) % 2 === 0;
    if (blink) return;

    const bob = Math.sin(state.time * CFG.playerIdleBobHz * Math.PI * 2) * CFG.playerIdleBobPixels;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.scale(p.scaleX, p.scaleY);

    // outline
    ctx.beginPath();
    ctx.arc(0, 0, CFG.playerCoreRadiusPixels + 2, 0, Math.PI * 2);
    ctx.fillStyle = CFG.colorPlayerEdge;
    ctx.fill();

    // body
    ctx.beginPath();
    ctx.arc(0, 0, CFG.playerCoreRadiusPixels, 0, Math.PI * 2);
    ctx.fillStyle = p.hurtFlash > 0 ? CFG.colorStretchDanger : CFG.colorPlayerBody;
    ctx.fill();

    // accent band
    ctx.beginPath();
    ctx.arc(0, -2, CFG.playerCoreRadiusPixels * 0.55, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = CFG.colorPlayerAccent;
    ctx.lineWidth = 4;
    ctx.stroke();

    // eye toward aim
    const ang = state.stretch.angle;
    const ex = Math.cos(ang) * 5;
    const ey = Math.sin(ang) * 5;
    ctx.beginPath();
    ctx.arc(ex, ey, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = CFG.colorPlayerEdge;
    ctx.fill();

    ctx.restore();

    if (debug.showHitboxes) {
      ctx.strokeStyle = CFG.debugHitboxStrokeColor;
      ctx.lineWidth = CFG.debugHitboxLineWidthPixels;
      ctx.beginPath();
      ctx.arc(p.x, p.y, CFG.playerCoreRadiusPixels, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawAimHint() {
    const s = state.stretch;
    if (state.mode !== 'play' || !s || s.active) return;
    const p = state.player;
    if (!p) return;
    const n = norm(pointerAim.x - p.x, pointerAim.y - p.y);
    if (n.len < 8) return;
    ctx.strokeStyle = CFG.colorAimLine;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(p.x + n.x * 22, p.y + n.y * 22);
    ctx.lineTo(p.x + n.x * 54, p.y + n.y * 54);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function drawTargets() {
    for (const t of state.targets) {
      const pulse = 1 + Math.sin(state.time * CFG.targetPulseHz * Math.PI * 2 + t.phase) * 0.08;
      const r = t.r * pulse;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(Math.PI / 4);
      // outline diamond
      ctx.fillStyle = CFG.colorTargetEdge;
      ctx.fillRect(-r - 2, -r - 2, (r + 2) * 2, (r + 2) * 2);
      ctx.fillStyle = CFG.colorTarget;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();

      // lifetime tick
      const lifeRatio = clamp(t.life / CFG.targetLifetimeSeconds, 0, 1);
      ctx.strokeStyle = CFG.colorTargetEdge;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lifeRatio);
      ctx.stroke();
      ctx.strokeStyle = CFG.colorTarget;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lifeRatio);
      ctx.stroke();
    }
  }

  function drawEnemies() {
    for (const e of state.enemies) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 2, 0, Math.PI * 2);
      ctx.fillStyle = CFG.colorEnemyEdge;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fillStyle = CFG.colorEnemy;
      ctx.fill();
      // eyes
      ctx.fillStyle = CFG.colorVfxCore;
      ctx.beginPath();
      ctx.arc(e.x - e.r * 0.28, e.y - e.r * 0.15, 3, 0, Math.PI * 2);
      ctx.arc(e.x + e.r * 0.28, e.y - e.r * 0.15, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = CFG.colorEnemyEdge;
      ctx.beginPath();
      ctx.arc(e.x - e.r * 0.28, e.y - e.r * 0.15, 1.4, 0, Math.PI * 2);
      ctx.arc(e.x + e.r * 0.28, e.y - e.r * 0.15, 1.4, 0, Math.PI * 2);
      ctx.fill();

      if (debug.showHitboxes) {
        ctx.strokeStyle = CFG.debugHitboxStrokeColor;
        ctx.lineWidth = CFG.debugHitboxLineWidthPixels;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawParticles() {
    for (const pt of state.particles) {
      const a = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = CFG.colorVfxEdge;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const ft of state.floatTexts) {
      const a = clamp(ft.life / ft.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = '700 18px Fredoka, Zen Maru Gothic, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = CFG.colorVfxEdge;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  function drawTensionMeter() {
    if (state.mode !== 'play' || !state.stretch.active) return;
    const s = state.stretch;
    const ratio = clamp(s.length / CFG.stretchSnapLengthPixels, 0, 1);
    const w = 160;
    const h = 10;
    const x = (CFG.arenaWidthPixels - w) / 2;
    const y = 16;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#2a3140';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = stretchColor();
    ctx.fillRect(x, y, w * ratio, h);
    // warn marker
    const warnX = x + w * CFG.stretchWarningRatio;
    ctx.fillStyle = CFG.colorVfxCore;
    ctx.fillRect(warnX - 1, y - 3, 2, h + 6);
  }

  function draw() {
    ctx.save();
    if (state.shake > 0) {
      const sx = Math.cos(state.shakeAngle) * state.shake;
      const sy = Math.sin(state.shakeAngle) * state.shake;
      ctx.translate(sx, sy);
      state.shakeAngle += 0.7;
    }
    drawArena();
    if (state.mode === 'play' || state.mode === 'dead') {
      drawAimHint();
      drawTargets();
      drawEnemies();
      drawStretch();
      drawPlayer();
      drawParticles();
      drawTensionMeter();
    }
    ctx.restore();
  }

  // —— Overlay / flow ——
  function armOverlay() {
    state.overlayArmedAt = performance.now() + CFG.overlayInputArmDelayMilliseconds;
  }

  function overlayReady() {
    return performance.now() >= state.overlayArmedAt;
  }

  function showTitle() {
    state.mode = 'title';
    armOverlay();
    overlay.classList.remove('hidden', 'howto');
    overlayInner.innerHTML = `
      <div class="title">伸ばせ</div>
      <div class="hook">押し続けて体をゴムのように伸ばす。<br/>届かないものを掴み、離すと弾ける。</div>
      <div class="giant-start" id="start-mash">Mash to Start</div>
      <div class="controls">
        <span class="aim">照準 ポインタ</span>
        <span class="stretch">伸ばす ホールド / Space</span>
      </div>
      <div class="sub">離すとスナップバック。伸ばしすぎ注意。</div>
    `;
  }

  function showHowTo(slide) {
    state.mode = 'howto';
    state.howSlide = slide;
    armOverlay();
    overlay.classList.remove('hidden');
    overlay.classList.add('howto');
    const slides = [
      {
        kicker: 'HOW 1 / 2',
        title: 'ホールドで伸ばせ',
        body: 'ポインタ方向へ体がゴム伸びする。長いほど届くが、胴体の被弾も増える。',
        art: `<div class="how-art"><div class="core"></div><div class="arm"></div><div class="tip"></div><div class="star"></div><div class="warn-bar"></div></div>`,
      },
      {
        kicker: 'HOW 2 / 2',
        title: '先端で掴み、離して弾け',
        body: '星や敵を先端で掴むと「掴み」。離すとスリングショット。黄色→赤でスナップ自傷。',
        art: `<div class="how-art"><div class="core"></div><div class="arm" style="width:70px"></div><div class="tip" style="left:132px"></div><div class="enemy"></div><div class="star" style="right:70px;top:28px"></div></div>`,
      },
    ];
    const s = slides[slide] || slides[0];
    overlayInner.innerHTML = `
      <div class="how-card">
        <div class="how-kicker">${s.kicker}</div>
        <div class="how-title">${s.title}</div>
        ${s.art}
        <div class="how-body">${s.body}</div>
        <div class="how-dots">${slides
          .map((_, i) => `<span class="${i === slide ? 'on' : ''}"></span>`)
          .join('')}</div>
        <button type="button" class="how-next" id="how-next">${slide < slides.length - 1 ? 'つぎへ' : 'はじめる'}</button>
      </div>
    `;
    const btn = document.getElementById('how-next');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        advanceHowTo();
      });
    }
  }

  function advanceHowTo() {
    if (!overlayReady()) return;
    if (state.howSlide < CFG.howToSlideCount - 1) {
      showHowTo(state.howSlide + 1);
    } else {
      beginPlay();
    }
  }

  function showDeadOverlay() {
    armOverlay();
    overlay.classList.remove('hidden', 'howto');
    overlayInner.innerHTML = `
      <div class="title" style="font-size:clamp(32px,8vw,52px);color:var(--danger)">ちぎれた</div>
      <div class="result-line">掴み <span style="color:var(--score)">${state.grabs}</span></div>
      <div class="giant-start" id="start-mash">Mash to Retry</div>
      <div class="sub">すぐ再開（約0.5秒）</div>
    `;
  }

  function beginPlay() {
    AudioSys.unlock();
    AudioSys.stopStretchHum();
    // clear sticky input from mash / overlay clicks
    for (const k of Object.keys(keys)) keys[k] = false;
    stretchHeld = false;
    stretchReleasedThisFrame = false;
    pointerDown = false;
    resetRun();
    state.stretch.needRelease = true; // ignore held mash until a fresh press
    state.mode = 'play';
    overlay.classList.add('hidden');
  }

  function tryStartFromOverlay() {
    if (!overlayReady()) return;
    if (state.mode === 'title') {
      showHowTo(0);
    } else if (state.mode === 'howto') {
      advanceHowTo();
    } else if (state.mode === 'dead' && state.deathTimer <= 0) {
      beginPlay();
    }
  }

  overlay.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('button')) return;
    anyKeyThisFrame = true;
    tryStartFromOverlay();
  });

  // —— Main loop ——
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    try {
      const raw = Math.min(CFG.maxFrameDeltaSeconds, (now - last) / 1000);
      last = now;
      acc += raw;

      // overlay mash
      if (
        (state.mode === 'title' || state.mode === 'howto' || state.mode === 'dead') &&
        anyKeyThisFrame
      ) {
        tryStartFromOverlay();
      }

      const step = CFG.fixedTimestepSeconds;
      while (acc >= step) {
        fixedUpdate(step);
        acc -= step;
      }

      draw();
    } catch (err) {
      console.error('[伸ばせ]', err);
    } finally {
      anyKeyThisFrame = false;
      stretchReleasedThisFrame = false;
      requestAnimationFrame(frame);
    }
  }

  // boot — keep entities allocated so draw never sees null refs
  bestGrabsEl.textContent = String(state.bestGrabs);
  state.player = makePlayer();
  state.stretch = makeStretch();
  showTitle();
  updateHud();
  requestAnimationFrame(frame);
})();
