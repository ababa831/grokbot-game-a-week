/**
 * ひっくり返せ (Flip Gravity)
 * Core verb: FLIP — one click/tap/Space inverts gravity for the whole world.
 * All tunables come from FLIP_GRAVITY_CONFIG — no magic numbers here.
 */
(function () {
  const CFG = window.FLIP_GRAVITY_CONFIG;
  const AudioSys = window.FlipGravityAudio;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayInner = document.getElementById('overlay-inner');
  const clearPopup = document.getElementById('clear-popup');
  const roomLabelEl = document.getElementById('room-label');
  const hpRow = document.getElementById('hp-row');
  const nowRoomsEl = document.getElementById('now-rooms');
  const bestRoomsEl = document.getElementById('best-rooms');
  const muteBtn = document.getElementById('mute-btn');
  const skipRoomBtn = document.getElementById('skip-room-btn');

  canvas.width = CFG.arenaWidthPixels;
  canvas.height = CFG.arenaHeightPixels;

  // —— Input: track e.code only (no stuck keys) ——
  const keys = Object.create(null);
  let flipPressedThisFrame = false;
  let flipBuffered = false;
  let anyKeyThisFrame = false;

  const FLIP_CODES = new Set(['Space']);
  const START_IGNORE = new Set(['F1', 'F2', 'F3', 'F4', 'F5']);
  const MOVE_LEFT = new Set(['ArrowLeft', 'KeyA']);
  const MOVE_RIGHT = new Set(['ArrowRight', 'KeyD']);

  window.addEventListener(
    'keydown',
    (e) => {
      // Capture F-keys before browser default (F5 refresh etc.)
      if (e.code === 'F1' || e.code === 'F2' || e.code === 'F3' || e.code === 'F4' || e.code === 'F5') {
        e.preventDefault();
        e.stopPropagation();
        handleDebugKey(e);
        return;
      }
      keys[e.code] = true;
      if (FLIP_CODES.has(e.code)) {
        if (!e.repeat) flipPressedThisFrame = true;
        e.preventDefault();
      }
      if (MOVE_LEFT.has(e.code) || MOVE_RIGHT.has(e.code)) {
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

  // Blur clears stuck keys
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    AudioSys.unlock();
    flipPressedThisFrame = true;
    anyKeyThisFrame = true;
  });

  document.addEventListener('pointerdown', (e) => {
    AudioSys.unlock();
    // UI buttons must not count as start/retry pointerdown
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

  // —— Debug (shipped) ——
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
    mode: 'title', // title | playing | breath | dead | win
    player: null,
    platforms: [],
    spikes: [],
    movers: [],
    effects: [],
    gravitySign: 1, // 1 = down, -1 = up
    hitstopRemaining: 0,
    shakeAmount: 0,
    roomIndex: 0,
    roomsCleared: 0,
    bestRooms: 0,
    deathsOnCurrentRoom: 0,
    flipCooldown: 0,
    clearPopupTimer: 0,
    breathTimer: 0,
    wasGrounded: false,
  };

  function makePlayer(spawnX, spawnSurface) {
    const h = CFG.playerHeightPixels;
    const y =
      spawnSurface === 'ceiling'
        ? CFG.ceilingThicknessPixels
        : CFG.arenaHeightPixels - CFG.groundThicknessPixels - h;
    return {
      x: spawnX,
      y,
      w: CFG.playerWidthPixels,
      h,
      vx: 0,
      vy: 0,
      hp: CFG.playerMaxHitPoints,
      invuln: 0,
      grounded: true,
      coyote: 0,
      landPose: 0,
      flipPose: 0,
      hurtPose: 0,
      scaleX: 1,
      scaleY: 1,
      facing: 1,
    };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function buildRoom(index) {
    const rooms = CFG.rooms;
    const def = rooms[Math.min(index, rooms.length - 1)];
    state.platforms = def.platforms.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
    state.spikes = [];
    for (const group of def.spikes) {
      const sw = CFG.spikeBaseWidthPixels * group.sizeMul;
      const sh = CFG.spikeBaseHeightPixels * group.sizeMul;
      for (let i = 0; i < group.count; i++) {
        const sx = group.x + i * sw;
        let sy;
        if (group.surface === 'floor') {
          // Point up from floor platform top — find platform under
          const plat = findPlatformNear(sx + sw * 0.5, 'floor');
          sy = (plat ? plat.y : CFG.arenaHeightPixels - CFG.groundThicknessPixels) - sh;
        } else {
          const plat = findPlatformNear(sx + sw * 0.5, 'ceiling');
          sy = plat ? plat.y + plat.h : CFG.ceilingThicknessPixels;
        }
        state.spikes.push({
          x: sx,
          y: sy,
          w: sw,
          h: sh,
          surface: group.surface,
          // Lethal when gravity pulls toward the spike's surface
          // floor spikes lethal when gravitySign === 1 (standing on floor)
          // ceiling spikes lethal when gravitySign === -1
        });
      }
    }
    state.movers = def.movers.map((m) => ({
      x: m.x,
      y: m.y,
      w: m.w * m.sizeMul,
      h: m.h * m.sizeMul,
      axis: m.axis,
      range: m.range,
      speed: CFG.moverBaseSpeedPixelsPerSecond * m.speedMul,
      originX: m.x,
      originY: m.y,
      phase: 0,
      dir: 1,
    }));
    roomLabelEl.textContent = `ROOM ${index + 1} — ${def.labelJa}`;
    return def;
  }

  function findPlatformNear(x, surface) {
    let best = null;
    let bestDist = Infinity;
    for (const p of state.platforms) {
      if (x < p.x || x > p.x + p.w) continue;
      if (surface === 'floor') {
        // Prefer lower platforms (higher y)
        if (p.y > CFG.arenaHeightPixels * 0.4) {
          const d = Math.abs(p.y - (CFG.arenaHeightPixels - CFG.groundThicknessPixels));
          if (d < bestDist) {
            bestDist = d;
            best = p;
          }
        }
      } else {
        if (p.y < CFG.arenaHeightPixels * 0.4) {
          const d = Math.abs(p.y);
          if (d < bestDist) {
            bestDist = d;
            best = p;
          }
        }
      }
    }
    return best;
  }

  function currentRoomDef() {
    const rooms = CFG.rooms;
    return rooms[Math.min(state.roomIndex, rooms.length - 1)];
  }

  function resetRun(keepRoom) {
    state.gravitySign = 1;
    state.effects = [];
    state.hitstopRemaining = 0;
    state.shakeAmount = 0;
    state.flipCooldown = 0;
    state.clearPopupTimer = 0;
    state.breathTimer = 0;
    state.wasGrounded = true;
    if (!keepRoom) {
      state.roomIndex = 0;
      state.roomsCleared = 0;
      state.deathsOnCurrentRoom = 0;
    }
    const def = buildRoom(state.roomIndex);
    state.player = makePlayer(def.spawnX, def.spawnSurface);
    if (def.spawnSurface === 'ceiling') {
      state.gravitySign = -1;
    }
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
      <div class="title">ひっくり返せ</div>
      <div class="hook">クリックすると世界の上下が入れ替わる。床が天井になる。</div>
      <div class="giant-start" id="giant-start">START</div>
      <div class="controls">
        <span class="move">移動 ←→ / A D</span>
        <span class="flip">ひっくり返す クリック / Space</span>
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
      <div class="result-line" style="color:var(--goal)">ぜんぶひっくり返せた！</div>
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
    nowRoomsEl.textContent = String(state.roomsCleared);
    bestRoomsEl.textContent = String(state.bestRooms);
  }

  // —— Core: FLIP ——
  function doFlip() {
    if (state.flipCooldown > 0) return;
    state.gravitySign *= -1;
    state.flipCooldown = CFG.flipCooldownSeconds;
    const p = state.player;
    if (p) {
      p.vy = state.gravitySign * CFG.flipVelocityBoostPixelsPerSecond;
      p.flipPose = CFG.playerPoseRecoverSeconds;
      p.grounded = false;
      p.coyote = 0;
    }
    // World flip: player + spike lethality + movers (Y-reflected in updateMovers)
    state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnFlipSeconds);
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnFlipPixels);
    if (p) p.invuln = Math.max(p.invuln, CFG.flipInvincibleSeconds);
    spawnFlipVfx();
    AudioSys.flip();
  }

  function spawnFlipVfx() {
    if (debug.hideVfx || !state.player) return;
    const p = state.player;
    state.effects.push({
      kind: 'flipRing',
      x: p.x + p.w * 0.5,
      y: p.y + p.h * 0.5,
      life: CFG.flipRingLifetimeSeconds,
      maxLife: CFG.flipRingLifetimeSeconds,
    });
  }

  function spawnLandDust(px, py) {
    if (debug.hideVfx) return;
    for (let i = 0; i < CFG.landDustParticleCount; i++) {
      const ang = Math.PI * (0.15 + Math.random() * 0.7) * (Math.random() < 0.5 ? 1 : -1);
      const spd =
        CFG.landDustSpeedMinPixelsPerSecond + Math.random() * CFG.landDustSpeedRangePixelsPerSecond;
      state.effects.push({
        kind: 'dust',
        x: px,
        y: py,
        vx: Math.cos(ang) * spd,
        vy: -Math.sin(Math.abs(ang)) * spd * 0.4 * state.gravitySign,
        life: CFG.landDustLifetimeSeconds * (0.7 + Math.random() * 0.3),
        maxLife: CFG.landDustLifetimeSeconds,
        size: 3 + Math.random() * 4,
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
    });
  }

  // —— Physics ——
  function moveAxis(ent, dx, dy) {
    if (dx !== 0) {
      ent.x += dx;
      for (const plat of state.platforms) {
        if (!rectsOverlap(ent, plat)) continue;
        if (dx > 0) ent.x = plat.x - ent.w;
        else ent.x = plat.x + plat.w;
        ent.vx = 0;
      }
      // Room bounds
      if (ent.x < 0) {
        ent.x = 0;
        ent.vx = 0;
      }
      if (ent.x + ent.w > CFG.arenaWidthPixels) {
        ent.x = CFG.arenaWidthPixels - ent.w;
        ent.vx = 0;
      }
    }
    if (dy !== 0) {
      ent.y += dy;
      let hitGround = false;
      for (const plat of state.platforms) {
        if (!rectsOverlap(ent, plat)) continue;
        if (dy > 0) {
          // moving down
          ent.y = plat.y - ent.h;
          if (state.gravitySign > 0) hitGround = true;
        } else {
          ent.y = plat.y + plat.h;
          if (state.gravitySign < 0) hitGround = true;
        }
        ent.vy = 0;
      }
      // Do not clamp arena Y — pits must fall through to the out-of-world death check
      return hitGround;
    }
    return false;
  }

  function updatePlayer(dt) {
    const p = state.player;
    if (!p) return;

    let move = 0;
    for (const code of MOVE_LEFT) if (keys[code]) move -= 1;
    for (const code of MOVE_RIGHT) if (keys[code]) move += 1;
    if (move !== 0) p.facing = move > 0 ? 1 : -1;

    const speed = CFG.playerMoveSpeedPixelsPerSecond * (p.grounded ? 1 : CFG.playerAirControlMultiplier);
    p.vx = move * speed;

    // Gravity
    p.vy += state.gravitySign * CFG.gravityPixelsPerSecondSquared * dt;
    const maxFall = CFG.maxFallSpeedPixelsPerSecond;
    if (state.gravitySign > 0) {
      if (p.vy > maxFall) p.vy = maxFall;
    } else {
      if (p.vy < -maxFall) p.vy = -maxFall;
    }

    moveAxis(p, p.vx * dt, 0);
    const landed = moveAxis(p, 0, p.vy * dt);

    const wasGrounded = state.wasGrounded;
    if (landed) {
      p.grounded = true;
      p.coyote = CFG.coyoteTimeSeconds;
      if (!wasGrounded && Math.abs(p.vy) < 1) {
        // soft land already zeroed — still punch if we just became grounded
      }
      if (!wasGrounded) {
        p.landPose = CFG.playerPoseRecoverSeconds;
        state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnLandSeconds);
        state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnLandPixels);
        const footY = state.gravitySign > 0 ? p.y + p.h : p.y;
        spawnLandDust(p.x + p.w * 0.5, footY);
        AudioSys.land();
      }
    } else {
      // Check if still supported
      const probe = {
        x: p.x,
        y: p.y + state.gravitySign * CFG.groundedProbePixels,
        w: p.w,
        h: p.h,
      };
      let supported = false;
      for (const plat of state.platforms) {
        if (rectsOverlap(probe, plat)) {
          supported = true;
          break;
        }
      }
      if (!supported) {
        p.grounded = false;
        if (p.coyote > 0) p.coyote -= dt;
      } else {
        p.grounded = true;
        p.coyote = CFG.coyoteTimeSeconds;
      }
    }
    state.wasGrounded = p.grounded;

    // Pose recover
    if (p.landPose > 0) p.landPose -= dt;
    if (p.flipPose > 0) p.flipPose -= dt;
    if (p.hurtPose > 0) p.hurtPose -= dt;
    if (p.invuln > 0) p.invuln -= dt;

    // Squash / stretch
    p.scaleX = 1;
    p.scaleY = 1;
    if (p.landPose > 0) {
      const t = p.landPose / CFG.playerPoseRecoverSeconds;
      p.scaleX = 1 + (CFG.playerLandSquashScaleX - 1) * t;
      p.scaleY = 1 + (CFG.playerLandSquashScaleY - 1) * t;
    } else if (p.flipPose > 0) {
      const t = p.flipPose / CFG.playerPoseRecoverSeconds;
      p.scaleX = 1 + (CFG.playerFlipStretchScaleX - 1) * t;
      p.scaleY = 1 + (CFG.playerFlipStretchScaleY - 1) * t;
    } else if (p.hurtPose > 0) {
      const t = p.hurtPose / CFG.playerHurtFlashDurationSeconds;
      p.scaleX = 1 + 0.35 * t;
      p.scaleY = 1 - 0.35 * t;
    }

    // Fall out of world = death
    if (
      p.y > CFG.arenaHeightPixels + CFG.fallOutMarginPixels ||
      p.y + p.h < -CFG.fallOutMarginPixels
    ) {
      killPlayer();
    }
  }

  function updateMovers(dt) {
    for (const m of state.movers) {
      m.phase += m.speed * dt * m.dir;
      if (m.phase > m.range) {
        m.phase = m.range;
        m.dir = -1;
      } else if (m.phase < 0) {
        m.phase = 0;
        m.dir = 1;
      }
      // Oscillate in room space (parameter variety only — no AI).
      // When gravity is up, reflect Y so the hazard flips with the world.
      const localY = m.axis === 'y' ? m.originY + m.phase : m.originY;
      m.x = m.axis === 'x' ? m.originX + m.phase : m.originX;
      m.y = state.gravitySign > 0 ? localY : CFG.arenaHeightPixels - localY - m.h;
    }
  }

  function spikeIsLethal(spike) {
    // Floor spikes hurt when you're pulled onto the floor (gravity down)
    // Ceiling spikes hurt when you're pulled onto the ceiling (gravity up)
    // That's the core reread: after flip, the safe surface becomes lethal
    if (spike.surface === 'floor') return state.gravitySign > 0;
    return state.gravitySign < 0;
  }

  function checkHazards() {
    const p = state.player;
    if (!p || p.invuln > 0 || debug.godMode) return;

    for (const spike of state.spikes) {
      if (!spikeIsLethal(spike)) continue;
      const inset = CFG.spikeHitboxInsetPixels;
      const hit = {
        x: spike.x + inset,
        y: spike.y + inset,
        w: Math.max(2, spike.w - inset * 2),
        h: Math.max(2, spike.h - inset * 2),
      };
      if (rectsOverlap(p, hit)) {
        hurtPlayer(spike.x + spike.w * 0.5, spike.y + spike.h * 0.5);
        return;
      }
    }

    const inset = CFG.moverHitboxInsetPixels;
    for (const m of state.movers) {
      const hit = {
        x: m.x + inset,
        y: m.y + inset,
        w: m.w - inset * 2,
        h: m.h - inset * 2,
      };
      if (rectsOverlap(p, hit)) {
        hurtPlayer(m.x + m.w * 0.5, m.y + m.h * 0.5);
        return;
      }
    }
  }

  function hurtPlayer(hx, hy) {
    const p = state.player;
    if (!p) return;
    p.hp -= 1;
    p.invuln = CFG.playerInvincibleAfterHitSeconds;
    p.hurtPose = CFG.playerHurtFlashDurationSeconds;
    p.vy = -state.gravitySign * CFG.hurtKnockbackPixelsPerSecond;
    state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnHazardHitSeconds);
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnHazardHitPixels);
    spawnHitMark(hx, hy);
    updateHud();
    if (p.hp <= 0) {
      AudioSys.ko();
      killPlayer();
    } else {
      AudioSys.hurt();
    }
  }

  function killPlayer() {
    if (state.mode !== 'playing') return;
    state.deathsOnCurrentRoom += 1;
    showDead();
  }

  function checkGoal() {
    const p = state.player;
    if (!p) return;
    const def = currentRoomDef();
    if (p.x + p.w * 0.5 >= def.goalX - CFG.goalReachDistancePixels) {
      clearRoom();
    }
  }

  function clearRoom() {
    state.roomsCleared = Math.max(state.roomsCleared, state.roomIndex + 1);
    if (state.roomsCleared > state.bestRooms) state.bestRooms = state.roomsCleared;
    updateHud();
    showClearPopup(state.roomsCleared);
    state.hitstopRemaining = Math.max(state.hitstopRemaining, CFG.hitstopOnClearSeconds);
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnClearPixels);
    AudioSys.clear();

    if (state.roomIndex >= CFG.rooms.length - 1) {
      state.mode = 'win';
      // brief breath then win overlay
      state.breathTimer = CFG.roomBreathSeconds;
      return;
    }

    state.mode = 'breath';
    state.breathTimer = CFG.roomBreathSeconds;
    state.deathsOnCurrentRoom = 0;
  }

  function advanceAfterBreath() {
    if (state.mode === 'win' || (state.roomIndex >= CFG.rooms.length - 1 && state.roomsCleared >= CFG.rooms.length)) {
      showWin();
      return;
    }
    state.roomIndex += 1;
    const def = buildRoom(state.roomIndex);
    state.gravitySign = 1;
    state.player = makePlayer(def.spawnX, def.spawnSurface);
    if (def.spawnSurface === 'ceiling') state.gravitySign = -1;
    state.effects = [];
    state.hitstopRemaining = 0;
    state.flipCooldown = 0;
    state.wasGrounded = true;
    state.mode = 'playing';
    updateHud();
  }

  function updateEffects(dt) {
    for (const e of state.effects) {
      e.life -= dt;
      if (e.kind === 'dust') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vy += state.gravitySign * CFG.landDustGravityPixelsPerSecondSquared * dt;
      }
    }
    state.effects = state.effects.filter((e) => e.life > 0);
  }

  // —— Draw ——
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, CFG.arenaHeightPixels);
    g.addColorStop(0, CFG.colorArenaSkyTop);
    g.addColorStop(1, CFG.colorArenaSky);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.arenaWidthPixels, CFG.arenaHeightPixels);

    // Parallax stripes (atmosphere, not additive glow)
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    const spacing = CFG.parallaxStripeSpacingPixels;
    for (let x = 0; x < CFG.arenaWidthPixels; x += spacing) {
      ctx.fillRect(x, 0, 2, CFG.arenaHeightPixels);
    }
  }

  function drawPlatforms() {
    for (const p of state.platforms) {
      ctx.fillStyle = CFG.colorPlatformEdge;
      ctx.fillRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2);
      ctx.fillStyle = CFG.colorPlatform;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // Top lip (readable surface)
      const lipY = state.gravitySign > 0 ? p.y : p.y + p.h - 4;
      ctx.fillStyle = CFG.colorPlatformTop;
      ctx.fillRect(p.x, lipY, p.w, 4);
    }
  }

  function drawSpikes() {
    for (const s of state.spikes) {
      const lethal = spikeIsLethal(s);
      const core = lethal ? CFG.colorSpike : '#5a6474';
      const edge = lethal ? CFG.colorSpikeEdge : '#1a1e24';
      ctx.save();
      // Opaque wedge with dark edge
      const pointingUp = s.surface === 'floor';
      ctx.beginPath();
      if (pointingUp) {
        ctx.moveTo(s.x, s.y + s.h);
        ctx.lineTo(s.x + s.w * 0.5, s.y);
        ctx.lineTo(s.x + s.w, s.y + s.h);
      } else {
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + s.w * 0.5, s.y + s.h);
        ctx.lineTo(s.x + s.w, s.y);
      }
      ctx.closePath();
      ctx.fillStyle = edge;
      ctx.fill();
      ctx.beginPath();
      if (pointingUp) {
        ctx.moveTo(s.x + 2, s.y + s.h - 1);
        ctx.lineTo(s.x + s.w * 0.5, s.y + 3);
        ctx.lineTo(s.x + s.w - 2, s.y + s.h - 1);
      } else {
        ctx.moveTo(s.x + 2, s.y + 1);
        ctx.lineTo(s.x + s.w * 0.5, s.y + s.h - 3);
        ctx.lineTo(s.x + s.w - 2, s.y + 1);
      }
      ctx.closePath();
      ctx.fillStyle = core;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawMovers() {
    for (const m of state.movers) {
      const cx = m.x + m.w * 0.5;
      const cy = m.y + m.h * 0.5;
      const r = Math.min(m.w, m.h) * 0.5;
      // Dark edge disk
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = CFG.colorMoverEdge;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = CFG.colorMover;
      ctx.fill();
      // Cross teeth (opaque)
      ctx.strokeStyle = CFG.colorMoverEdge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.6, cy);
      ctx.lineTo(cx + r * 0.6, cy);
      ctx.moveTo(cx, cy - r * 0.6);
      ctx.lineTo(cx, cy + r * 0.6);
      ctx.stroke();
    }
  }

  function drawGoal() {
    const def = currentRoomDef();
    const gx = def.goalX;
    ctx.fillStyle = CFG.colorGoalEdge;
    ctx.fillRect(gx - 6, 40, 12, CFG.arenaHeightPixels - 80);
    ctx.fillStyle = CFG.colorGoal;
    ctx.fillRect(gx - 4, 42, 8, CFG.arenaHeightPixels - 84);
    // Flag
    ctx.fillStyle = CFG.colorGoalEdge;
    ctx.beginPath();
    ctx.moveTo(gx, 50);
    ctx.lineTo(gx + 28, 62);
    ctx.lineTo(gx, 74);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = CFG.colorGoal;
    ctx.beginPath();
    ctx.moveTo(gx + 2, 54);
    ctx.lineTo(gx + 22, 62);
    ctx.lineTo(gx + 2, 70);
    ctx.closePath();
    ctx.fill();
  }

  function drawEffects() {
    if (debug.hideVfx) return;
    for (const e of state.effects) {
      const t = e.life / e.maxLife;
      if (e.kind === 'dust') {
        ctx.fillStyle = CFG.colorVfxEdge;
        ctx.fillRect(e.x - e.size * 0.5 - 1, e.y - e.size * 0.5 - 1, e.size + 2, e.size + 2);
        ctx.fillStyle = CFG.colorVfxDust;
        ctx.globalAlpha = t;
        ctx.fillRect(e.x - e.size * 0.5, e.y - e.size * 0.5, e.size, e.size);
        ctx.globalAlpha = 1;
      } else if (e.kind === 'flipRing') {
        const r = CFG.flipRingMaxRadiusPixels * (1 - t);
        ctx.beginPath();
        ctx.arc(e.x, e.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = CFG.colorVfxEdge;
        ctx.lineWidth = 5;
        ctx.globalAlpha = t;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = CFG.colorFlipHint;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'hitMark') {
        const s = CFG.hitMarkSizePixels;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate((1 - t) * 0.4);
        ctx.fillStyle = CFG.colorVfxEdge;
        ctx.fillRect(-s * 0.5 - 1, -2, s + 2, 5);
        ctx.fillRect(-2, -s * 0.5 - 1, 5, s + 2);
        ctx.fillStyle = CFG.colorVfxCore;
        ctx.fillRect(-s * 0.5, -1, s, 3);
        ctx.fillRect(-1, -s * 0.5, 3, s);
        ctx.restore();
      }
    }
  }

  function drawPlayer() {
    const p = state.player;
    if (!p) return;

    if (p.invuln > 0) {
      const blink = Math.floor(p.invuln * CFG.playerInvulnBlinkHz) % 2 === 0;
      if (!blink) return;
    }

    const cx = p.x + p.w * 0.5;
    const cy = p.y + p.h * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    // World flip feel: draw player rotated when gravity is up
    if (state.gravitySign < 0) ctx.rotate(Math.PI);
    ctx.scale(p.scaleX * p.facing, p.scaleY);

    // Dark edge body
    ctx.fillStyle = CFG.colorPlayerEdge;
    ctx.fillRect(-p.w * 0.5 - 2, -p.h * 0.5 - 2, p.w + 4, p.h + 4);
    ctx.fillStyle = p.hurtPose > 0 ? CFG.colorSpike : CFG.colorPlayerBody;
    ctx.fillRect(-p.w * 0.5, -p.h * 0.5, p.w, p.h);

    // Accent stripe
    ctx.fillStyle = CFG.colorPlayerAccent;
    ctx.fillRect(-p.w * 0.5, -p.h * 0.5, p.w, 5);

    // Eye
    ctx.fillStyle = CFG.colorPlayerEdge;
    ctx.fillRect(2, -6, 5, 5);

    ctx.restore();
  }

  function drawDebugHitboxes() {
    if (!debug.showHitboxes) return;
    ctx.strokeStyle = CFG.debugHitboxStrokeColor;
    ctx.lineWidth = CFG.debugHitboxLineWidthPixels;
    if (state.player) {
      const p = state.player;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    }
    for (const s of state.spikes) {
      if (!spikeIsLethal(s)) continue;
      const inset = CFG.spikeHitboxInsetPixels;
      ctx.strokeRect(
        s.x + inset,
        s.y + inset,
        Math.max(2, s.w - inset * 2),
        Math.max(2, s.h - inset * 2)
      );
    }
    for (const m of state.movers) {
      ctx.strokeRect(m.x, m.y, m.w, m.h);
    }
  }

  function drawGravityIndicator() {
    // Small opaque arrow showing current "down"
    const ax = CFG.arenaWidthPixels - 28;
    const ay = 56;
    ctx.fillStyle = CFG.colorVfxEdge;
    ctx.beginPath();
    if (state.gravitySign > 0) {
      ctx.moveTo(ax, ay + 14);
      ctx.lineTo(ax - 8, ay);
      ctx.lineTo(ax + 8, ay);
    } else {
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 8, ay + 14);
      ctx.lineTo(ax + 8, ay + 14);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = CFG.colorFlipHint;
    ctx.beginPath();
    if (state.gravitySign > 0) {
      ctx.moveTo(ax, ay + 11);
      ctx.lineTo(ax - 5, ay + 2);
      ctx.lineTo(ax + 5, ay + 2);
    } else {
      ctx.moveTo(ax, ay + 3);
      ctx.lineTo(ax - 5, ay + 12);
      ctx.lineTo(ax + 5, ay + 12);
    }
    ctx.closePath();
    ctx.fill();
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = CFG.colorArenaSky;
    ctx.fillRect(0, 0, CFG.arenaWidthPixels, CFG.arenaHeightPixels);
    ctx.save();
    // Screen shake — max then decay
    if (state.shakeAmount > CFG.shakeAmountCutoffPixels) {
      const sx = (Math.random() * 2 - 1) * state.shakeAmount;
      const sy = (Math.random() * 2 - 1) * state.shakeAmount;
      ctx.translate(sx, sy);
    }

    drawBackground();
    drawPlatforms();
    drawSpikes();
    drawMovers();
    drawGoal();
    drawEffects();
    drawPlayer(); // always on top
    drawGravityIndicator();
    drawDebugHitboxes();

    // God mode badge
    if (debug.godMode) {
      ctx.fillStyle = CFG.colorVfxEdge;
      ctx.fillRect(8, 48, 52, 16);
      ctx.fillStyle = CFG.colorGoal;
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('GOD', 14, 60);
    }

    ctx.restore();
  }

  // —— Main loop ——
  let lastTs = 0;

  function frame(ts) {
    const rawDt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    const dt = Math.min(rawDt, CFG.maxFrameDeltaSeconds);

    // Overlay mash-to-start / retry. Win breath must finish before mash can restart.
    const overlayAcceptsStart =
      state.mode === 'title' ||
      state.mode === 'dead' ||
      (state.mode === 'win' && state.breathTimer <= 0);
    if (overlayAcceptsStart && overlayInputArmed && (anyKeyThisFrame || flipPressedThisFrame)) {
      if (state.mode === 'title' || state.mode === 'win') startPlaying();
      else retryFromDeath();
      flipPressedThisFrame = false;
      flipBuffered = false;
      anyKeyThisFrame = false;
    }

    if (state.mode === 'playing') {
      // Hitstop: freeze sim except effect timers slightly
      if (state.hitstopRemaining > 0) {
        state.hitstopRemaining -= dt;
        updateEffects(dt);
        if (flipPressedThisFrame) flipBuffered = true;
      } else {
        if (state.flipCooldown > 0) state.flipCooldown -= dt;
        if (flipPressedThisFrame || flipBuffered) doFlip();
        flipBuffered = false;
        updatePlayer(dt);
        updateMovers(dt);
        checkHazards();
        checkGoal();
        updateEffects(dt);
      }
    } else if (state.mode === 'breath' || (state.mode === 'win' && state.breathTimer > 0)) {
      state.breathTimer -= dt;
      if (state.hitstopRemaining > 0) state.hitstopRemaining -= dt;
      updateEffects(dt);
      if (state.breathTimer <= 0) {
        if (state.mode === 'win') showWin();
        else advanceAfterBreath();
      }
    }

    // Shake decay always
    if (state.shakeAmount > 0) {
      state.shakeAmount *= Math.exp(-CFG.shakeDecayPerSecond * dt);
      if (state.shakeAmount < CFG.shakeAmountCutoffPixels) state.shakeAmount = 0;
    }

    if (state.clearPopupTimer > 0) {
      state.clearPopupTimer -= dt;
      if (state.clearPopupTimer <= 0) hideClearPopup();
    }

    render();

    // Clear per-frame edge triggers
    flipPressedThisFrame = false;
    anyKeyThisFrame = false;

    requestAnimationFrame(frame);
  }

  // Boot
  showTitle();
  resetRun(false);
  state.mode = 'title';
  requestAnimationFrame(frame);
})();
