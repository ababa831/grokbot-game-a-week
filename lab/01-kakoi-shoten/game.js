/**
 * かこい商店 (Kakoi Shōten)
 * Core: enclose customers (not area %) — hold to draw from the border.
 * Tunables: KAKOI_CONFIG only.
 */
(function () {
  const CFG = window.KAKOI_CONFIG;
  const AudioSys = window.KakoiAudio;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayInner = document.getElementById('overlay-inner');
  const muteBtn = document.getElementById('mute-btn');
  const hudRent = document.getElementById('hud-rent');
  const hudDay = document.getElementById('hud-day');
  const hudSales = document.getElementById('hud-sales');
  const hudTimer = document.getElementById('hud-timer');
  const hudTimerCell = document.getElementById('hud-timer-cell');
  const hudLives = document.getElementById('hud-lives');

  const COLS = CFG.fieldCols;
  const ROWS = CFG.fieldRows;
  const CELL = CFG.cellSizePixels;
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  // claimed: 1 = owned/safe, 0 = open floor
  let claimed = null;
  // trailMask: 2 = active trail cells while drawing
  let trailMask = null;

  const pointer = { x: canvas.width / 2, y: canvas.height / 2, down: false, justDown: false, justUp: false };
  let anyClickThisFrame = false;
  let overlayArmed = false;

  const debug = { godMode: false, showHitboxes: false };

  const state = {
    mode: 'title', // title | playing | upgrade | gameover
    day: 1,
    dayTimeLeft: CFG.dayDurationSeconds,
    daySales: 0,
    totalSales: 0,
    rent: CFG.baseRentYen,
    lives: CFG.startingLives,
    upgrades: { line_speed: 0, lure: 0, life: 0, slow_debt: 0 },
    upgradeChoices: [],
    player: null,
    drawing: false,
    trail: [], // [{x,y}] continuous
    trailCells: [],
    idleDrawSeconds: 0,
    fuseDist: 0,
    fuseActive: false,
    customers: [],
    collectors: [],
    effects: [],
    hitstopRemaining: 0,
    shakeAmount: 0,
    invincibleRemaining: 0,
    fillFlashRemaining: 0,
    screenFlashRemaining: 0,
    bestDays: 0,
    bestSales: 0,
  };

  // —— Helpers ——
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.hypot(dx, dy);
  }

  function cellOf(x, y) {
    return {
      c: clamp(Math.floor(x / CELL), 0, COLS - 1),
      r: clamp(Math.floor(y / CELL), 0, ROWS - 1),
    };
  }

  function cellCenter(c, r) {
    return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 };
  }

  function idx(c, r) {
    return r * COLS + c;
  }

  function isClaimed(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
    return claimed[idx(c, r)] === 1;
  }

  function isOpen(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    return claimed[idx(c, r)] === 0;
  }

  function isBorderCell(c, r) {
    if (!isClaimed(c, r)) return false;
    const n = [
      [c + 1, r],
      [c - 1, r],
      [c, r + 1],
      [c, r - 1],
    ];
    for (const [nc, nr] of n) {
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      if (claimed[idx(nc, nr)] === 0 || trailMask[idx(nc, nr)] === 2) return true;
    }
    return false;
  }

  function nearestBorderPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!isBorderCell(c, r)) continue;
        const p = cellCenter(c, r);
        const d = dist(x, y, p.x, p.y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    return best || { x: CELL * 1.5, y: CELL * 1.5 };
  }

  function initClaimedBorder() {
    claimed = new Uint8Array(COLS * ROWS);
    trailMask = new Uint8Array(COLS * ROWS);
    const t = CFG.borderThicknessCells;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c < t || r < t || c >= COLS - t || r >= ROWS - t) {
          claimed[idx(c, r)] = 1;
        }
      }
    }
  }

  function rentForDay(day) {
    const base = CFG.baseRentYen + (day - 1) * CFG.rentGrowthPerDayYen;
    return Math.floor(base * Math.pow(CFG.rentGrowthExponent, Math.max(0, day - 1) * 0.15));
  }

  function drawSpeed() {
    const stacks = state.upgrades.line_speed || 0;
    return CFG.drawSpeedPixelsPerSecond * Math.pow(CFG.upgradeLineSpeedMulPerStack, stacks);
  }

  function lureRadius() {
    const stacks = state.upgrades.lure || 0;
    return CFG.customerLureRadiusPixels * Math.pow(CFG.upgradeLureRadiusMulPerStack, stacks);
  }

  function collectorSpeed() {
    const stacks = state.upgrades.slow_debt || 0;
    return CFG.collectorSpeedPixelsPerSecond * Math.pow(CFG.upgradeCollectorSpeedMulPerStack, stacks);
  }

  function customerCountForDay(day) {
    return Math.min(CFG.customerMaxCount, CFG.customerStartCount + (day - 1) * CFG.customersPerDaySpawnExtra);
  }

  function collectorCountForDay(day) {
    return day >= CFG.collectorSecondAppearsOnDay ? CFG.collectorMaxCount : CFG.collectorStartCount;
  }

  function randomOpenPoint(padding) {
    const pad = padding || CFG.customerSpawnPaddingCells;
    for (let i = 0; i < 80; i++) {
      const c = pad + Math.floor(Math.random() * (COLS - pad * 2));
      const r = pad + Math.floor(Math.random() * (ROWS - pad * 2));
      if (isOpen(c, r)) return cellCenter(c, r);
    }
    return cellCenter(Math.floor(COLS / 2), Math.floor(ROWS / 2));
  }

  function spawnCustomers(n) {
    state.customers = [];
    for (let i = 0; i < n; i++) {
      const p = randomOpenPoint();
      state.customers.push({
        x: p.x,
        y: p.y,
        vx: (Math.random() - 0.5) * CFG.customerWanderSpeedPixelsPerSecond,
        vy: (Math.random() - 0.5) * CFG.customerWanderSpeedPixelsPerSecond,
        changeIn: CFG.customerDriftChangeSecondsMin + Math.random() * (CFG.customerDriftChangeSecondsMax - CFG.customerDriftChangeSecondsMin),
        alive: true,
      });
    }
  }

  function spawnCollectors(n) {
    state.collectors = [];
    for (let i = 0; i < n; i++) {
      const p = randomOpenPoint(8);
      state.collectors.push({
        x: p.x,
        y: p.y,
        vx: (Math.random() - 0.5) * collectorSpeed(),
        vy: (Math.random() - 0.5) * collectorSpeed(),
        changeIn: CFG.collectorWanderChangeSeconds,
        telegraph: false,
      });
    }
  }

  function resetTrail() {
    state.drawing = false;
    state.trail = [];
    state.trailCells = [];
    state.idleDrawSeconds = 0;
    state.fuseDist = 0;
    state.fuseActive = false;
    trailMask.fill(0);
    AudioSys.stopDrawHum();
  }

  function startDay(day) {
    state.mode = 'playing';
    state.day = day;
    state.dayTimeLeft = CFG.dayDurationSeconds;
    state.daySales = 0;
    state.rent = rentForDay(day);
    state.effects = [];
    state.hitstopRemaining = 0;
    state.shakeAmount = 0;
    state.invincibleRemaining = 0;
    state.fillFlashRemaining = 0;
    state.screenFlashRemaining = 0;
    initClaimedBorder();
    resetTrail();
    const border = nearestBorderPoint(canvas.width / 2, canvas.height - CELL * 3);
    state.player = { x: border.x, y: border.y };
    spawnCustomers(customerCountForDay(day));
    spawnCollectors(collectorCountForDay(day));
    hideOverlay();
    updateHud();
  }

  function beginRun() {
    state.totalSales = 0;
    state.lives = CFG.startingLives + (state.upgrades.life || 0);
    // fresh run resets upgrades except we reset all on new game
    state.upgrades = { line_speed: 0, lure: 0, life: 0, slow_debt: 0 };
    state.lives = CFG.startingLives;
    startDay(1);
  }

  // —— Input ——
  function canvasPointFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
  }

  function onPointerDown(e) {
    e.preventDefault();
    AudioSys.unlock();
    const pt = canvasPointFromClient(e.clientX, e.clientY);
    pointer.x = pt.x;
    pointer.y = pt.y;
    pointer.down = true;
    pointer.justDown = true;
    anyClickThisFrame = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onPointerMove(e) {
    const pt = canvasPointFromClient(e.clientX, e.clientY);
    pointer.x = pt.x;
    pointer.y = pt.y;
  }

  function onPointerUp(e) {
    e.preventDefault();
    pointer.down = false;
    pointer.justUp = true;
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('pointerup', () => {
    if (pointer.down) {
      pointer.down = false;
      pointer.justUp = true;
    }
  });

  document.addEventListener('pointerdown', (e) => {
    AudioSys.unlock();
    if (e.target instanceof Element && e.target.closest('button')) return;
    anyClickThisFrame = true;
  });

  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const m = AudioSys.toggleMute();
    muteBtn.setAttribute('aria-pressed', String(m));
    muteBtn.textContent = m ? '音声オフ' : '音声オン';
  });

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        debug.godMode = !debug.godMode;
      } else if (e.code === 'F5') {
        e.preventDefault();
        debug.showHitboxes = !debug.showHitboxes;
      } else if (e.code === 'Space' || e.code === 'Enter') {
        anyClickThisFrame = true;
      }
    },
    true
  );

  // —— Overlay ——
  function hideOverlay() {
    overlay.classList.add('hidden');
    overlayInner.innerHTML = '';
    overlayArmed = false;
  }

  function showOverlay(html, armDelay) {
    overlay.classList.remove('hidden');
    overlayInner.innerHTML = html;
    overlayArmed = false;
    setTimeout(() => {
      overlayArmed = true;
    }, armDelay != null ? armDelay : CFG.overlayInputArmDelayMilliseconds);
  }

  function showTitle() {
    state.mode = 'title';
    showOverlay(
      `<h1>かこい商店</h1>
       <p class="pitch">陣取りだけど、囲うのは土地じゃなくて<strong>客</strong>。<br/>枠で待って寄せて、短く切って ¥ にしろ。</p>
       <p class="cta">クリック / タップで開店</p>
       <p class="sub">長押し＝線を伸ばす　離すか枠に戻る＝囲う</p>`,
      120
    );
  }

  function showGameOver() {
    state.mode = 'gameover';
    AudioSys.gameOver();
    state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnGameOverPixels);
    if (state.day > state.bestDays) state.bestDays = state.day;
    if (state.totalSales > state.bestSales) state.bestSales = state.totalSales;
    const reason =
      state.lives <= 0
        ? '取立てに線を切られた…'
        : `売上 ¥${state.daySales} ＜ 家賃 ¥${state.rent}`;
    showOverlay(
      `<h1>閉店</h1>
       <p class="pitch">${reason}</p>
       <div class="stats">生き残った日数　<strong>${state.day}</strong> 日目<br/>合計売上　<strong>¥${state.totalSales}</strong><br/>ベスト　${state.bestDays}日 / ¥${state.bestSales}</div>
       <p class="cta">クリックで再開店</p>`,
      200
    );
  }

  function pickUpgradeChoices() {
    const pool = CFG.upgrades.filter((u) => (state.upgrades[u.id] || 0) < u.stackMax);
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    state.upgradeChoices = shuffled.slice(0, Math.min(CFG.upgradeOfferCount, shuffled.length));
  }

  function showUpgrade() {
    state.mode = 'upgrade';
    AudioSys.dayClear();
    state.hitstopRemaining = CFG.hitstopOnDayClearSeconds;
    pickUpgradeChoices();
    if (state.upgradeChoices.length === 0) {
      startDay(state.day + 1);
      return;
    }
    const buttons = state.upgradeChoices
      .map(
        (u, i) =>
          `<button type="button" class="upgrade-btn" data-upgrade-index="${i}"><span class="name">${u.nameJa}</span><span class="desc">${u.descJa}</span></button>`
      )
      .join('');
    showOverlay(
      `<h1>${state.day}日目　クリア</h1>
       <p class="pitch">売上 ¥${state.daySales} ／ 家賃 ¥${state.rent}<br/>強化を1つ選べ</p>
       <div class="upgrade-grid">${buttons}</div>`,
      100
    );
    overlayInner.querySelectorAll('.upgrade-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!overlayArmed) return;
        const i = Number(btn.getAttribute('data-upgrade-index'));
        applyUpgrade(state.upgradeChoices[i]);
      });
    });
  }

  function applyUpgrade(u) {
    if (!u) return;
    AudioSys.uiClick();
    state.upgrades[u.id] = (state.upgrades[u.id] || 0) + 1;
    if (u.id === 'life') state.lives += 1;
    startDay(state.day + 1);
  }

  // —— Claim / flood fill ——
  function markTrailCell(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
    if (claimed[idx(c, r)] === 1) return;
    if (trailMask[idx(c, r)] === 2) return;
    trailMask[idx(c, r)] = 2;
    state.trailCells.push({ c, r });
  }

  function floodFromCollectors(blocked) {
    // returns Uint8Array: 1 = reachable from a collector through open+non-blocked
    const reach = new Uint8Array(COLS * ROWS);
    const stack = [];
    for (const col of state.collectors) {
      const { c, r } = cellOf(col.x, col.y);
      if (claimed[idx(c, r)] === 1 || blocked[idx(c, r)]) continue;
      stack.push(c, r);
      reach[idx(c, r)] = 1;
    }
    // also seed from any open cell that might be "outside" if no collectors in open —
    // collectors always in open. If all collectors somehow on claimed, seed nothing (claim all open pockets).
    while (stack.length) {
      const r = stack.pop();
      const c = stack.pop();
      const n = [
        [c + 1, r],
        [c - 1, r],
        [c, r + 1],
        [c, r - 1],
      ];
      for (const [nc, nr] of n) {
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const i = idx(nc, nr);
        if (reach[i]) continue;
        if (claimed[i] === 1 || blocked[i]) continue;
        reach[i] = 1;
        stack.push(nc, nr);
      }
    }
    return reach;
  }

  function closeEnclosure() {
    if (state.trailCells.length < 2) {
      resetTrail();
      return;
    }

    const blocked = new Uint8Array(COLS * ROWS);
    for (const t of state.trailCells) blocked[idx(t.c, t.r)] = 1;

    const enemyReach = floodFromCollectors(blocked);

    const newly = [];
    const newlySet = new Uint8Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = idx(c, r);
        if (claimed[i] === 1) continue;
        if (blocked[i] || !enemyReach[i]) {
          claimed[i] = 1;
          newly.push({ c, r });
          newlySet[i] = 1;
        }
      }
    }

    const toSell = [];
    for (const cust of state.customers) {
      if (!cust.alive || cust._cashed) continue;
      const { c, r } = cellOf(cust.x, cust.y);
      let hit = newlySet[idx(c, r)] === 1;
      if (!hit) {
        for (let rr = r - 1; rr <= r + 1 && !hit; rr++) {
          for (let cc = c - 1; cc <= c + 1; cc++) {
            if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) continue;
            if (newlySet[idx(cc, rr)] === 1) {
              hit = true;
              break;
            }
          }
        }
      }
      if (hit) {
        cust.alive = false;
        cust._cashed = true;
        toSell.push(cust);
      }
    }

    applyCapture(toSell, newly);
    resetTrail();

    const snap = nearestBorderPoint(state.player.x, state.player.y);
    state.player.x = snap.x;
    state.player.y = snap.y;
  }

  function applyCapture(sold, newly) {
    const n = sold.length;
    state.fillFlashRemaining = CFG.fillFlashSeconds;
    if (n <= 0) {
      // empty claim still fills visually — small feedback
      spawnFillParticles(newly, 4);
      return;
    }

    let yen = 0;
    for (let i = 0; i < n; i++) {
      yen += CFG.customerValueYen + i * CFG.customerComboBonusYen;
    }
    state.daySales += yen;
    state.totalSales += yen;

    state.hitstopRemaining = CFG.hitstopOnCaptureSeconds;
    state.shakeAmount = Math.max(
      state.shakeAmount,
      n >= 4 ? CFG.shakeOnBigCapturePixels : CFG.shakeOnCapturePixels
    );
    state.screenFlashRemaining = CFG.screenFlashSeconds;
    AudioSys.capture(n);

    for (const cust of sold) {
      spawnYenBurst(cust.x, cust.y, CFG.customerValueYen);
    }
    spawnFillParticles(newly, CFG.captureParticleCountBase + n * CFG.captureParticleCountPerCustomer);
    // floating total
    state.effects.push({
      type: 'yenPopup',
      x: state.player.x,
      y: state.player.y - 20,
      text: `¥${yen}`,
      life: CFG.yenPopupLifeSeconds,
      maxLife: CFG.yenPopupLifeSeconds,
    });
    updateHud();
  }

  function spawnYenBurst(x, y, amount) {
    state.effects.push({
      type: 'yenPopup',
      x,
      y,
      text: '¥',
      life: CFG.yenPopupLifeSeconds,
      maxLife: CFG.yenPopupLifeSeconds,
    });
    const count = 8;
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const spd = CFG.captureParticleSpeedMin + Math.random() * CFG.captureParticleSpeedRange;
      state.effects.push({
        type: 'particle',
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: CFG.captureParticleLifeSeconds,
        maxLife: CFG.captureParticleLifeSeconds,
        color: CFG.colorCustomer,
      });
    }
  }

  function spawnFillParticles(newly, count) {
    if (!newly.length) return;
    for (let i = 0; i < count; i++) {
      const cell = newly[Math.floor(Math.random() * newly.length)];
      const p = cellCenter(cell.c, cell.r);
      const ang = Math.random() * Math.PI * 2;
      const spd = CFG.captureParticleSpeedMin + Math.random() * CFG.captureParticleSpeedRange;
      state.effects.push({
        type: 'particle',
        x: p.x,
        y: p.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        life: CFG.captureParticleLifeSeconds,
        maxLife: CFG.captureParticleLifeSeconds,
        color: CFG.colorClaimed,
      });
    }
  }

  function cancelLine(hit) {
    if (!state.drawing) return;
    resetTrail();
    const snap = nearestBorderPoint(state.player.x, state.player.y);
    state.player.x = snap.x;
    state.player.y = snap.y;
    if (hit && !debug.godMode) {
      state.lives -= 1;
      state.invincibleRemaining = CFG.hitInvincibleSeconds;
      state.hitstopRemaining = CFG.hitstopOnHitSeconds;
      state.shakeAmount = Math.max(state.shakeAmount, CFG.shakeOnHitPixels);
      state.screenFlashRemaining = CFG.screenFlashSeconds;
      AudioSys.hit();
      updateHud();
      if (state.lives <= 0) {
        showGameOver();
      }
    }
  }

  // —— Simulation ——
  function tryStartDraw() {
    if (state.drawing || !state.player) return;
    const { c, r } = cellOf(state.player.x, state.player.y);
    if (!isBorderCell(c, r) && !isClaimed(c, r)) {
      const snap = nearestBorderPoint(state.player.x, state.player.y);
      state.player.x = snap.x;
      state.player.y = snap.y;
    }
    // need pointer aiming into open
    const dx = pointer.x - state.player.x;
    const dy = pointer.y - state.player.y;
    if (Math.hypot(dx, dy) < CFG.pointerFollowDeadzonePixels) return;

    state.drawing = true;
    state.trail = [{ x: state.player.x, y: state.player.y }];
    state.trailCells = [];
    state.idleDrawSeconds = 0;
    state.fuseDist = 0;
    state.fuseActive = false;
    AudioSys.startDrawHum();
  }

  function movePlayer(dt) {
    const p = state.player;
    if (!p) return;
    const tx = pointer.x;
    const ty = pointer.y;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < CFG.pointerFollowDeadzonePixels) {
      if (state.drawing) state.idleDrawSeconds += dt;
      return;
    }

    if (state.drawing) {
      state.idleDrawSeconds = 0;
      const speed = drawSpeed();
      const step = Math.min(d, speed * dt);
      const nx = p.x + (dx / d) * step;
      const ny = p.y + (dy / d) * step;
      const { c, r } = cellOf(nx, ny);

      // hitting own trail (not the last few cells)
      if (trailMask[idx(c, r)] === 2) {
        const last = state.trailCells[state.trailCells.length - 1];
        const nearTail = last && Math.abs(last.c - c) + Math.abs(last.r - r) <= 2;
        if (!nearTail && state.trailCells.length > 6) {
          cancelLine(true);
          return;
        }
      }

      // closing onto claimed border after leaving
      if (isClaimed(c, r) && state.trailCells.length >= 3) {
        p.x = nx;
        p.y = ny;
        state.trail.push({ x: p.x, y: p.y });
        closeEnclosure();
        return;
      }

      // can't dig into claimed except to close
      if (isClaimed(c, r)) {
        // slide along border while holding — don't start trail into claimed
        p.x = nx;
        p.y = ny;
        return;
      }

      p.x = nx;
      p.y = ny;
      state.trail.push({ x: p.x, y: p.y });
      markTrailCell(c, r);
      // mark intermediates for fast moves
      const prev = state.trail[state.trail.length - 2];
      if (prev) {
        const steps = Math.ceil(dist(prev.x, prev.y, p.x, p.y) / (CELL * 0.5));
        for (let i = 1; i <= steps; i++) {
          const lx = prev.x + ((p.x - prev.x) * i) / steps;
          const ly = prev.y + ((p.y - prev.y) * i) / steps;
          const lc = cellOf(lx, ly);
          if (!isClaimed(lc.c, lc.r)) markTrailCell(lc.c, lc.r);
        }
      }
    } else {
      // border movement — project toward pointer but stay on border cells
      const speed = CFG.borderMoveSpeedPixelsPerSecond;
      const step = Math.min(d, speed * dt);
      const nx = p.x + (dx / d) * step;
      const ny = p.y + (dy / d) * step;
      const { c, r } = cellOf(nx, ny);
      if (isBorderCell(c, r) || isClaimed(c, r)) {
        // if claimed but not border, snap to nearest border
        if (isBorderCell(c, r)) {
          p.x = nx;
          p.y = ny;
        } else {
          const snap = nearestBorderPoint(nx, ny);
          // only move if snap is reasonably close to intent
          if (dist(snap.x, snap.y, p.x, p.y) < speed * dt * 3) {
            p.x = snap.x;
            p.y = snap.y;
          } else {
            // try step along ring
            const candidates = [];
            for (let rr = r - 2; rr <= r + 2; rr++) {
              for (let cc = c - 2; cc <= c + 2; cc++) {
                if (isBorderCell(cc, rr)) candidates.push(cellCenter(cc, rr));
              }
            }
            let best = null;
            let bestScore = Infinity;
            for (const cand of candidates) {
              const toPointer = dist(cand.x, cand.y, tx, ty);
              const fromHere = dist(cand.x, cand.y, p.x, p.y);
              if (fromHere > speed * dt * 2.5) continue;
              const score = toPointer + fromHere * 0.15;
              if (score < bestScore) {
                bestScore = score;
                best = cand;
              }
            }
            if (best) {
              p.x = best.x;
              p.y = best.y;
            }
          }
        }
      } else {
        // pointer into open while not drawing — stay put on border / edge toward open
        const snap = nearestBorderPoint(p.x, p.y);
        p.x = snap.x;
        p.y = snap.y;
      }
    }
  }

  function updateFuse(dt) {
    if (!state.drawing || state.trail.length < 2) return;
    if (state.idleDrawSeconds >= CFG.fuseStartIdleSeconds) {
      if (!state.fuseActive) {
        state.fuseActive = true;
        AudioSys.fuseWarn();
      }
      state.fuseDist += CFG.fuseSpeedPixelsPerSecond * dt;
      // compute trail length
      let len = 0;
      for (let i = 1; i < state.trail.length; i++) {
        len += dist(state.trail[i - 1].x, state.trail[i - 1].y, state.trail[i].x, state.trail[i].y);
      }
      if (state.fuseDist >= len) {
        cancelLine(true);
      }
    } else {
      state.fuseActive = false;
      state.fuseDist = Math.max(0, state.fuseDist - CFG.fuseSpeedPixelsPerSecond * dt * 0.5);
    }
  }

  function fusePosition() {
    if (!state.fuseActive || state.trail.length < 2) return null;
    let left = state.fuseDist;
    for (let i = 1; i < state.trail.length; i++) {
      const a = state.trail[i - 1];
      const b = state.trail[i];
      const seg = dist(a.x, a.y, b.x, b.y);
      if (left <= seg) {
        const t = seg < 1e-6 ? 0 : left / seg;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      left -= seg;
    }
    return state.trail[state.trail.length - 1];
  }

  function updateCustomers(dt) {
    const lureR = lureRadius();
    const waitingOnBorder = state.player && !state.drawing;
    for (const cust of state.customers) {
      if (!cust.alive) continue;
      cust.changeIn -= dt;
      if (cust.changeIn <= 0) {
        cust.changeIn =
          CFG.customerDriftChangeSecondsMin +
          Math.random() * (CFG.customerDriftChangeSecondsMax - CFG.customerDriftChangeSecondsMin);
        const ang = Math.random() * Math.PI * 2;
        cust.vx = Math.cos(ang) * CFG.customerWanderSpeedPixelsPerSecond;
        cust.vy = Math.sin(ang) * CFG.customerWanderSpeedPixelsPerSecond;
      }

      let vx = cust.vx;
      let vy = cust.vy;
      if (waitingOnBorder && state.player) {
        const d = dist(cust.x, cust.y, state.player.x, state.player.y);
        if (d < lureR && d > 1) {
          const pull = CFG.customerLureSpeedPixelsPerSecond * CFG.customerBorderApproachBias;
          vx += ((state.player.x - cust.x) / d) * pull;
          vy += ((state.player.y - cust.y) / d) * pull;
        }
      }

      let nx = cust.x + vx * dt;
      let ny = cust.y + vy * dt;
      let { c, r } = cellOf(nx, ny);
      if (!isOpen(c, r) || trailMask[idx(c, r)] === 2) {
        // bounce
        cust.vx *= -1;
        cust.vy *= -1;
        nx = cust.x + cust.vx * dt;
        ny = cust.y + cust.vy * dt;
        ({ c, r } = cellOf(nx, ny));
        if (!isOpen(c, r)) {
          nx = cust.x;
          ny = cust.y;
        }
      }
      cust.x = nx;
      cust.y = ny;
    }
  }

  function pointNearTrail(x, y, radius) {
    if (!state.drawing || state.trail.length < 2) return false;
    for (let i = 0; i < state.trail.length; i++) {
      const t = state.trail[i];
      if (dist(x, y, t.x, t.y) <= radius) return true;
    }
    // also check trail cells
    const { c, r } = cellOf(x, y);
    for (let rr = r - 1; rr <= r + 1; rr++) {
      for (let cc = c - 1; cc <= c + 1; cc++) {
        if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) continue;
        if (trailMask[idx(cc, rr)] === 2) {
          const p = cellCenter(cc, rr);
          if (dist(x, y, p.x, p.y) <= radius + CELL * 0.6) return true;
        }
      }
    }
    return false;
  }

  function updateCollectors(dt) {
    const baseSpd = collectorSpeed();
    for (const col of state.collectors) {
      col.changeIn -= dt;
      col.telegraph = false;

      // prefer chasing active trail
      let target = null;
      if (state.drawing && state.trail.length) {
        // chase nearest trail point
        let bestD = Infinity;
        for (let i = 0; i < state.trail.length; i += 2) {
          const t = state.trail[i];
          const d = dist(col.x, col.y, t.x, t.y);
          if (d < bestD) {
            bestD = d;
            target = t;
          }
        }
        // also chase player tip
        if (state.player) {
          const d = dist(col.x, col.y, state.player.x, state.player.y);
          if (d < bestD) {
            bestD = d;
            target = state.player;
          }
        }
        if (bestD < CFG.collectorTelegraphDistancePixels) col.telegraph = true;
      }

      let spd = baseSpd;
      if (target) {
        spd += CFG.collectorChaseLineBonusPixelsPerSecond;
        const d = dist(col.x, col.y, target.x, target.y);
        if (d > 1) {
          col.vx = ((target.x - col.x) / d) * spd;
          col.vy = ((target.y - col.y) / d) * spd;
        }
      } else if (col.changeIn <= 0) {
        col.changeIn = CFG.collectorWanderChangeSeconds;
        const ang = Math.random() * Math.PI * 2;
        col.vx = Math.cos(ang) * spd;
        col.vy = Math.sin(ang) * spd;
      }

      let nx = col.x + col.vx * dt;
      let ny = col.y + col.vy * dt;
      let { c, r } = cellOf(nx, ny);
      if (!isOpen(c, r)) {
        // slide / bounce off claimed
        col.vx *= -1;
        col.vy *= -1;
        col.changeIn = 0.2;
        nx = col.x + col.vx * dt;
        ny = col.y + col.vy * dt;
        ({ c, r } = cellOf(nx, ny));
        if (!isOpen(c, r)) {
          const p = randomOpenPoint(6);
          nx = p.x;
          ny = p.y;
        }
      }
      col.x = nx;
      col.y = ny;

      // hit trail?
      if (state.drawing && state.invincibleRemaining <= 0) {
        if (pointNearTrail(col.x, col.y, CFG.collectorHitPlayerRadiusPixels)) {
          cancelLine(true);
          return;
        }
      }
    }
  }

  function updateEffects(dt) {
    for (const e of state.effects) {
      e.life -= dt;
      if (e.type === 'particle') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vy += 180 * dt;
      } else if (e.type === 'yenPopup') {
        e.y -= 36 * dt;
      }
    }
    state.effects = state.effects.filter((e) => e.life > 0);
  }

  function endDayCheck() {
    if (state.daySales >= state.rent) {
      state.totalSales = state.totalSales; // already accumulated per capture
      showUpgrade();
    } else {
      showGameOver();
    }
  }

  function updateHud() {
    hudRent.textContent = `¥${state.rent}`;
    hudDay.textContent = `${state.day}日目`;
    hudSales.textContent = `¥${state.daySales}`;
    const t = Math.max(0, Math.ceil(state.dayTimeLeft));
    hudTimer.textContent = String(t);
    hudTimerCell.classList.toggle('warn', state.dayTimeLeft <= 8);
    hudLives.textContent = String(Math.max(0, state.lives));
  }

  // —— Draw ——
  function drawField() {
    // floor checker
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = idx(c, r);
        const x = c * CELL;
        const y = r * CELL;
        if (claimed[i] === 1) {
          ctx.fillStyle = CFG.colorClaimed;
          ctx.fillRect(x, y, CELL, CELL);
        } else {
          ctx.fillStyle = (c + r) % 2 === 0 ? CFG.colorFieldFloor : CFG.colorFieldFloorAlt;
          ctx.fillRect(x, y, CELL, CELL);
        }
      }
    }

    // claimed edge highlight
    ctx.strokeStyle = CFG.colorClaimedEdge;
    ctx.lineWidth = 1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (claimed[idx(c, r)] !== 1) continue;
        if (!isBorderCell(c, r)) continue;
        ctx.strokeRect(c * CELL + 0.5, r * CELL + 0.5, CELL - 1, CELL - 1);
      }
    }

    if (state.fillFlashRemaining > 0) {
      ctx.fillStyle = `rgba(255,255,240,${0.25 * (state.fillFlashRemaining / CFG.fillFlashSeconds)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawTrail() {
    if (!state.drawing || state.trail.length < 2) return;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = CFG.colorTrail;
    ctx.lineWidth = CFG.lineWidthPixels + 2;
    ctx.beginPath();
    ctx.moveTo(state.trail[0].x, state.trail[0].y);
    for (let i = 1; i < state.trail.length; i++) ctx.lineTo(state.trail[i].x, state.trail[i].y);
    ctx.stroke();
    ctx.strokeStyle = CFG.colorTrailCore;
    ctx.lineWidth = CFG.lineWidthPixels * 0.45;
    ctx.beginPath();
    ctx.moveTo(state.trail[0].x, state.trail[0].y);
    for (let i = 1; i < state.trail.length; i++) ctx.lineTo(state.trail[i].x, state.trail[i].y);
    ctx.stroke();

    const fuse = fusePosition();
    if (fuse) {
      ctx.fillStyle = CFG.colorFuse;
      ctx.beginPath();
      ctx.arc(fuse.x, fuse.y, CFG.fuseRadiusPixels, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a0606';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawEntities() {
    // customers
    for (const cust of state.customers) {
      if (!cust.alive) continue;
      ctx.beginPath();
      ctx.arc(cust.x, cust.y, CFG.customerRadiusPixels, 0, Math.PI * 2);
      ctx.fillStyle = CFG.colorCustomer;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = CFG.colorCustomerEdge;
      ctx.stroke();
      ctx.fillStyle = CFG.colorCustomerEdge;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('○', cust.x, cust.y + 0.5);
    }

    // collectors
    for (const col of state.collectors) {
      const rad = CFG.collectorRadiusPixels;
      if (col.telegraph) {
        ctx.beginPath();
        ctx.arc(col.x, col.y, rad + 6, 0, Math.PI * 2);
        ctx.strokeStyle = CFG.colorCollectorTelegraph;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(col.x, col.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = CFG.colorCollector;
      ctx.fill();
      ctx.strokeStyle = CFG.colorCollectorEdge;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = '#fff5f5';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(col.x - 5, col.y - 5);
      ctx.lineTo(col.x + 5, col.y + 5);
      ctx.moveTo(col.x + 5, col.y - 5);
      ctx.lineTo(col.x - 5, col.y + 5);
      ctx.stroke();
    }

    // player (shopkeeper)
    if (state.player) {
      const blink = state.invincibleRemaining > 0 && Math.floor(state.invincibleRemaining * 18) % 2 === 0;
      if (!blink) {
        ctx.beginPath();
        ctx.arc(state.player.x, state.player.y, CFG.playerRadiusPixels, 0, Math.PI * 2);
        ctx.fillStyle = CFG.colorPlayer;
        ctx.fill();
        ctx.strokeStyle = CFG.colorPlayerEdge;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // apron accent
        ctx.fillStyle = CFG.colorTrail;
        ctx.fillRect(state.player.x - 4, state.player.y - 1, 8, 6);
      }
      // lure ring when waiting
      if (!state.drawing && state.mode === 'playing') {
        ctx.beginPath();
        ctx.arc(state.player.x, state.player.y, lureRadius(), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(26,138,158,0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function drawEffects() {
    for (const e of state.effects) {
      const a = clamp(e.life / e.maxLife, 0, 1);
      if (e.type === 'particle') {
        ctx.globalAlpha = a;
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x - 2, e.y - 2, 4, 4);
        ctx.globalAlpha = 1;
      } else if (e.type === 'yenPopup') {
        ctx.globalAlpha = a;
        ctx.font = `900 ${e.text === '¥' ? 22 : 28}px 'Dela Gothic One', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#1a2420';
        ctx.strokeText(e.text, e.x, e.y);
        ctx.fillStyle = CFG.colorSales;
        ctx.fillText(e.text, e.x, e.y);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawDebug() {
    if (!debug.showHitboxes) return;
    ctx.strokeStyle = CFG.debugHitboxStrokeColor;
    ctx.lineWidth = CFG.debugHitboxLineWidthPixels;
    for (const cust of state.customers) {
      if (!cust.alive) continue;
      ctx.strokeRect(
        cust.x - CFG.customerRadiusPixels,
        cust.y - CFG.customerRadiusPixels,
        CFG.customerRadiusPixels * 2,
        CFG.customerRadiusPixels * 2
      );
    }
  }

  function render() {
    ctx.save();
    if (state.shakeAmount > 0.1) {
      const mag = state.shakeAmount;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }
    drawField();
    drawTrail();
    drawEntities();
    drawEffects();
    drawDebug();
    if (state.screenFlashRemaining > 0) {
      ctx.fillStyle = CFG.colorDangerFlash;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
  }

  // —— Main loop ——
  let lastTime = performance.now();
  let accum = 0;

  function frame(now) {
    const rawDt = Math.min(CFG.maxFrameDeltaSeconds, (now - lastTime) / 1000);
    lastTime = now;
    accum += rawDt;

    // overlay / mode input (not gated by hitstop)
    if (state.mode === 'title' && overlayArmed && anyClickThisFrame) {
      AudioSys.uiClick();
      beginRun();
    } else if (state.mode === 'gameover' && overlayArmed && anyClickThisFrame) {
      AudioSys.uiClick();
      beginRun();
    }

    // playing input edges
    if (state.mode === 'playing') {
      if (pointer.justDown) tryStartDraw();
      if (pointer.justUp && state.drawing) {
        // release to close if possible — only if trail long enough and near border
        const { c, r } = cellOf(state.player.x, state.player.y);
        if (isClaimed(c, r) && state.trailCells.length >= 3) {
          closeEnclosure();
        } else if (state.trailCells.length >= 3) {
          // try snap-close if near border
          const snap = nearestBorderPoint(state.player.x, state.player.y);
          if (dist(state.player.x, state.player.y, snap.x, snap.y) <= CFG.closeSnapDistancePixels) {
            state.player.x = snap.x;
            state.player.y = snap.y;
            closeEnclosure();
          } else {
            // release mid-field: keep drawing? Design: release OR reach border to close.
            // Mid-field release cancels without damage (escapable).
            resetTrail();
            const b = nearestBorderPoint(state.player.x, state.player.y);
            state.player.x = b.x;
            state.player.y = b.y;
          }
        } else {
          resetTrail();
        }
      }
    }

    const fixed = CFG.fixedTimestepSeconds;
    while (accum >= fixed) {
      accum -= fixed;
      tick(fixed);
    }

    render();
    pointer.justDown = false;
    pointer.justUp = false;
    anyClickThisFrame = false;
    requestAnimationFrame(frame);
  }

  function tick(dt) {
    // shake / flash always tick
    if (state.shakeAmount > 0) {
      state.shakeAmount = Math.max(0, state.shakeAmount - CFG.shakeDecayPerSecond * dt * state.shakeAmount);
      if (state.shakeAmount < CFG.shakeAmountCutoffPixels) state.shakeAmount = 0;
    }
    if (state.screenFlashRemaining > 0) state.screenFlashRemaining = Math.max(0, state.screenFlashRemaining - dt);
    if (state.fillFlashRemaining > 0) state.fillFlashRemaining = Math.max(0, state.fillFlashRemaining - dt);

    if (state.hitstopRemaining > 0) {
      state.hitstopRemaining = Math.max(0, state.hitstopRemaining - dt);
      updateEffects(dt);
      return;
    }

    if (state.mode !== 'playing') {
      updateEffects(dt);
      return;
    }

    if (state.invincibleRemaining > 0) state.invincibleRemaining = Math.max(0, state.invincibleRemaining - dt);

    state.dayTimeLeft -= dt;
    if (state.dayTimeLeft <= 0) {
      state.dayTimeLeft = 0;
      updateHud();
      endDayCheck();
      return;
    }

    movePlayer(dt);
    updateFuse(dt);
    updateCustomers(dt);
    updateCollectors(dt);
    updateEffects(dt);
    updateHud();
  }

  // —— Boot ——
  initClaimedBorder();
  showTitle();
  updateHud();
  requestAnimationFrame(frame);

  /** Bot helpers: cut a small bite from the current claimed border into open space. */
  function botEncloseCorner(side) {
    if (state.mode !== 'playing' || state.drawing) return false;

    // Find a border cell adjacent to open, biased by side
    let best = null;
    let bestScore = Infinity;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!isBorderCell(c, r)) continue;
        const openN = [
          [c + 1, r],
          [c - 1, r],
          [c, r + 1],
          [c, r - 1],
        ].filter(([nc, nr]) => isOpen(nc, nr));
        if (!openN.length) continue;
        const p = cellCenter(c, r);
        let score = Math.random();
        if (side === 'tl') score += p.x + p.y;
        else if (side === 'tr') score += canvas.width - p.x + p.y;
        else if (side === 'bl') score += p.x + (canvas.height - p.y);
        else score += canvas.width - p.x + (canvas.height - p.y);
        if (score < bestScore) {
          bestScore = score;
          best = { c, r, openN, p };
        }
      }
    }
    if (!best) return false;

    const [oc, or_] = best.openN[0];
    const depth = 8 + Math.floor(Math.random() * 6);
    const inward = { c: oc - best.c, r: or_ - best.r };
    // perpendicular for width
    const perp = { c: -inward.r, r: inward.c };
    const width = 6 + Math.floor(Math.random() * 5);

    function at(dc, dr) {
      return cellCenter(best.c + dc, best.r + dr);
    }

    const path = [
      best.p,
      at(inward.c * depth, inward.r * depth),
      at(inward.c * depth + perp.c * width, inward.r * depth + perp.r * width),
      at(perp.c * width, perp.r * width),
      best.p,
    ];

    // Ensure path points that land on claimed mid-path still mark only open cells
    state.player.x = path[0].x;
    state.player.y = path[0].y;
    state.drawing = true;
    state.trail = [{ x: path[0].x, y: path[0].y }];
    state.trailCells = [];
    trailMask.fill(0);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const steps = Math.ceil(dist(a.x, a.y, b.x, b.y) / (CELL * 0.35));
      for (let s = 1; s <= steps; s++) {
        const x = a.x + ((b.x - a.x) * s) / steps;
        const y = a.y + ((b.y - a.y) * s) / steps;
        state.player.x = x;
        state.player.y = y;
        state.trail.push({ x, y });
        const cell = cellOf(x, y);
        if (!isClaimed(cell.c, cell.r)) markTrailCell(cell.c, cell.r);
      }
    }
    if (state.trailCells.length < 3) {
      resetTrail();
      return false;
    }
    closeEnclosure();
    return true;
  }

  function botPickUpgrade(index) {
    if (state.mode !== 'upgrade') return false;
    const u = state.upgradeChoices[index];
    if (!u) return false;
    applyUpgrade(u);
    return true;
  }

  // Expose for headless tuning / tests
  window.KakoiGame = {
    getState: () => state,
    startDay,
    beginRun,
    rentForDay,
    botEncloseCorner,
    botPickUpgrade,
    CFG,
  };
})();
