(() => {
  "use strict";

  const STORAGE_KEY = "hold-orbit-best-2026-w35";
  const TAU = Math.PI * 2;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const titlePanel = document.getElementById("title-panel");
  const overPanel = document.getElementById("over-panel");
  const hud = document.getElementById("hud");
  const timeEl = document.getElementById("time");
  const bestEl = document.getElementById("best");
  const overTime = document.getElementById("over-time");
  const overBest = document.getElementById("over-best");
  const startBtn = document.getElementById("start-btn");
  const restartBtn = document.getElementById("restart-btn");

  let W = 0;
  let H = 0;
  let dpr = 1;
  let state = "title"; // title | play | over
  let holding = false;
  let time = 0;
  let best = Number(localStorage.getItem(STORAGE_KEY) || 0);
  let shake = 0;
  let flash = 0;
  let lastTs = 0;
  let spawnTimer = 0;
  let difficulty = 0;
  let orbitBody = null;
  let orbitAngle = 0;
  let orbitRadius = 0;
  let orbitDir = 1;

  const player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 7,
    trail: [],
  };

  /** @type {Body[]} */
  let bodies = [];
  /** @type {Particle[]} */
  let particles = [];
  /** @type {Star[]} */
  let stars = [];

  /**
   * @typedef {{
   *   id: number,
   *   kind: 'planet' | 'debris' | 'star',
   *   x: number, y: number, vx: number, vy: number,
   *   r: number, mass: number,
   *   hue: number, spin: number, angle: number,
   *   life?: number, maxLife?: number, pulse?: number,
   *   collapse?: boolean
   * }} Body
   */

  /**
   * @typedef {{
   *   x: number, y: number, vx: number, vy: number,
   *   life: number, max: number, size: number, color: string
   * }} Particle
   */

  /**
   * @typedef {{ x: number, y: number, s: number, a: number }} Star
   */

  let nextId = 1;

  // —— Audio (WebAudio tones, no files) ——
  let audioCtx = null;
  let masterGain = null;

  function ensureAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.18;
    masterGain.connect(audioCtx.destination);
  }

  function tone(freq, dur, type = "sine", gain = 0.4, slide = 0) {
    if (!audioCtx || !masterGain) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sfxOrbitLock() {
    tone(220, 0.12, "triangle", 0.35, 180);
    tone(440, 0.18, "sine", 0.2, 80);
  }

  function sfxRelease() {
    tone(180, 0.2, "sawtooth", 0.18, 320);
  }

  function sfxTick() {
    tone(880 + Math.random() * 200, 0.04, "square", 0.06);
  }

  function sfxDie() {
    tone(160, 0.35, "sawtooth", 0.35, -120);
    tone(90, 0.5, "triangle", 0.28, -60);
  }

  function sfxStart() {
    tone(330, 0.1, "sine", 0.25, 120);
    setTimeout(() => tone(440, 0.12, "sine", 0.22, 80), 80);
  }

  // —— Layout ——
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedStars() {
    stars = [];
    const n = Math.floor((W * H) / 9000);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        s: Math.random() * 1.6 + 0.3,
        a: Math.random() * 0.7 + 0.2,
      });
    }
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.hypot(dx, dy);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function formatTime(t) {
    return t.toFixed(1);
  }

  function updateBestHud() {
    bestEl.textContent = formatTime(best);
  }

  // —— World ——
  function resetWorld() {
    time = 0;
    difficulty = 0;
    spawnTimer = 0.6;
    shake = 0;
    flash = 0;
    orbitBody = null;
    holding = false;
    particles = [];
    bodies = [];
    nextId = 1;

    player.x = W * 0.5;
    player.y = H * 0.55;
    player.vx = 90;
    player.vy = -20;
    player.r = 7;
    player.trail = [];

    // Starter planets so orbit is immediately available
    spawnBody("planet", W * 0.35, H * 0.4, 38, 0.2, -0.05);
    spawnBody("planet", W * 0.68, H * 0.58, 28, -0.15, 0.1);
    spawnBody("debris", W * 0.2, H * 0.75, 8, 0.3, -0.2);
  }

  function spawnBody(kind, x, y, r, vx, vy) {
    const hues = {
      planet: rand(18, 48),
      debris: rand(200, 230),
      star: rand(0, 20),
    };
    /** @type {Body} */
    const b = {
      id: nextId++,
      kind,
      x: x ?? 0,
      y: y ?? 0,
      vx: vx ?? 0,
      vy: vy ?? 0,
      r: r ?? 20,
      mass: (r ?? 20) * (r ?? 20),
      hue: hues[kind],
      spin: rand(-1.5, 1.5),
      angle: rand(0, TAU),
      pulse: rand(0, TAU),
    };
    if (kind === "star") {
      b.life = rand(8, 14);
      b.maxLife = b.life;
      b.collapse = false;
    }
    bodies.push(b);
    return b;
  }

  function edgeSpawn() {
    const margin = 40;
    const side = Math.floor(Math.random() * 4);
    let x, y, vx, vy;
    if (side === 0) {
      x = -margin;
      y = rand(0, H);
      vx = rand(20, 70);
      vy = rand(-30, 30);
    } else if (side === 1) {
      x = W + margin;
      y = rand(0, H);
      vx = -rand(20, 70);
      vy = rand(-30, 30);
    } else if (side === 2) {
      x = rand(0, W);
      y = -margin;
      vx = rand(-30, 30);
      vy = rand(20, 70);
    } else {
      x = rand(0, W);
      y = H + margin;
      vx = rand(-30, 30);
      vy = -rand(20, 70);
    }

    const roll = Math.random();
    const dens = difficulty;
    if (roll < 0.12 + dens * 0.04) {
      // collapsing star
      const r = rand(22, 34);
      spawnBody("star", x, y, r, vx * 0.4, vy * 0.4);
    } else if (roll < 0.45 + dens * 0.08) {
      const r = rand(6, 12);
      spawnBody("debris", x, y, r, vx * 1.2, vy * 1.2);
    } else {
      const r = rand(18, 42);
      spawnBody("planet", x, y, r, vx * 0.7, vy * 0.7);
    }
  }

  function burst(x, y, color, n = 18, speed = 160) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * 0.3, speed);
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.3, 0.9),
        max: 0.9,
        size: rand(1.5, 3.5),
        color,
      });
    }
  }

  function nearestOrbitable(px, py) {
    let bestB = null;
    let bestD = Infinity;
    for (const b of bodies) {
      if (b.kind === "debris") continue;
      if (b.kind === "star" && b.collapse) continue;
      const d = dist(px, py, b.x, b.y);
      const catchR = b.r + 110 + Math.min(50, b.r * 0.9);
      if (d < catchR && d < bestD) {
        bestD = d;
        bestB = b;
      }
    }
    return bestB;
  }

  function beginOrbit(b) {
    orbitBody = b;
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    orbitAngle = Math.atan2(dy, dx);
    orbitRadius = Math.max(b.r + 18, Math.hypot(dx, dy));
    // Choose orbit direction from current tangential preference
    const tx = -Math.sin(orbitAngle);
    const ty = Math.cos(orbitAngle);
    const spd = player.vx * tx + player.vy * ty;
    orbitDir = spd >= 0 ? 1 : -1;
    sfxOrbitLock();
    burst(player.x, player.y, "rgba(108,240,255,0.9)", 10, 90);
  }

  function endOrbit(sling) {
    if (!orbitBody) return;
    if (sling) {
      const angSpeed = 2.2 + 40 / Math.max(orbitRadius, 20);
      const spd = angSpeed * orbitRadius * 1.15 + 60;
      const tAng = orbitAngle + (orbitDir > 0 ? Math.PI / 2 : -Math.PI / 2);
      player.vx = Math.cos(tAng) * spd + orbitBody.vx;
      player.vy = Math.sin(tAng) * spd + orbitBody.vy;
      sfxRelease();
      burst(player.x, player.y, "rgba(61,224,197,0.85)", 14, 200);
      shake = Math.max(shake, 4);
    }
    orbitBody = null;
  }

  function killPlayer(reasonColor) {
    if (state !== "play") return;
    state = "over";
    holding = false;
    orbitBody = null;
    shake = 14;
    flash = 0.55;
    sfxDie();
    burst(player.x, player.y, reasonColor || "rgba(255,92,106,0.95)", 40, 280);
    burst(player.x, player.y, "rgba(255,200,120,0.8)", 20, 180);

    if (time > best) {
      best = time;
      localStorage.setItem(STORAGE_KEY, String(best));
    }
    updateBestHud();
    overTime.textContent = formatTime(time);
    overBest.textContent = formatTime(best);
    titlePanel.classList.add("hidden");
    overPanel.classList.remove("hidden");
    overlay.classList.remove("hidden");
    hud.classList.remove("visible");
  }

  // —— Input ——
  function setHolding(v) {
    if (state !== "play") return;
    if (v === holding) return;
    holding = v;
    if (holding) {
      const b = nearestOrbitable(player.x, player.y);
      if (b) beginOrbit(b);
    } else {
      endOrbit(true);
    }
  }

  function startGame() {
    ensureAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    sfxStart();
    resetWorld();
    state = "play";
    overlay.classList.add("hidden");
    titlePanel.classList.add("hidden");
    overPanel.classList.add("hidden");
    hud.classList.add("visible");
    updateBestHud();
    timeEl.textContent = "0.0";
  }

  function onPointerDown(e) {
    e.preventDefault();
    ensureAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    if (state === "title" || state === "over") {
      startGame();
      return;
    }
    setHolding(true);
  }

  function onPointerUp(e) {
    e.preventDefault();
    setHolding(false);
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    if (e.code === "Space") {
      e.preventDefault();
      ensureAudio();
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      if (state === "title" || state === "over") {
        startGame();
        return;
      }
      setHolding(true);
    }
    if ((e.code === "KeyR" || e.key === "r" || e.key === "R") && state === "over") {
      startGame();
    }
  }

  function onKeyUp(e) {
    if (e.code === "Space") {
      e.preventDefault();
      setHolding(false);
    }
  }

  // —— Update ——
  function update(dt) {
    if (state !== "play") {
      // still animate ambient particles lightly on title
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.98;
        p.vy *= 0.98;
        if (p.life <= 0) particles.splice(i, 1);
      }
      shake *= Math.pow(0.9, dt * 60);
      flash = Math.max(0, flash - dt);
      return;
    }

    time += dt;
    difficulty = Math.min(1, time / 75);
    timeEl.textContent = formatTime(time);

    spawnTimer -= dt;
    const spawnEvery = Math.max(0.55, 1.6 - difficulty * 0.9);
    if (spawnTimer <= 0) {
      edgeSpawn();
      spawnTimer = spawnEvery * rand(0.75, 1.15);
      if (Math.random() < 0.25 + difficulty * 0.2) edgeSpawn();
    }

    // Bodies
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.spin * dt;
      b.pulse += dt * 3;

      if (b.kind === "star") {
        b.life -= dt;
        // Soft gravity tug
        const d = dist(player.x, player.y, b.x, b.y);
        if (d < b.r * 5 && d > 1) {
          const pull = (b.collapse ? 2200 : 420) * dt / (d * d);
          player.vx += ((b.x - player.x) / d) * pull * b.r;
          player.vy += ((b.y - player.y) / d) * pull * b.r;
        }
        if (!b.collapse && b.life < 3.2) {
          b.collapse = true;
          shake = Math.max(shake, 3);
          tone(60, 0.4, "sine", 0.15, -30);
        }
        if (b.collapse) {
          b.r = Math.max(4, b.r - dt * 8);
          if (Math.random() < dt * 12) {
            burst(b.x, b.y, "rgba(255,100,80,0.7)", 2, 40);
          }
        }
        if (b.life <= 0) {
          burst(b.x, b.y, "rgba(255,80,60,0.9)", 28, 220);
          shake = Math.max(shake, 8);
          if (orbitBody === b) {
            orbitBody = null;
            holding = false;
          }
          bodies.splice(i, 1);
          continue;
        }
      }

      // Cull far off-screen
      const pad = 120;
      if (b.x < -pad || b.x > W + pad || b.y < -pad || b.y > H + pad) {
        if (orbitBody === b) {
          endOrbit(false);
          holding = false;
        }
        bodies.splice(i, 1);
      }
    }

    // Holding: maintain / acquire orbit
    if (holding) {
      if (!orbitBody || !bodies.includes(orbitBody)) {
        const b = nearestOrbitable(player.x, player.y);
        if (b) beginOrbit(b);
        else orbitBody = null;
      }
      if (orbitBody) {
        // Softly settle radius
        const targetR = orbitBody.r + 22 + Math.min(28, orbitBody.r * 0.35);
        orbitRadius += (targetR - orbitRadius) * Math.min(1, dt * 4);
        const angSpeed = (2.2 + 40 / orbitRadius) * orbitDir;
        orbitAngle += angSpeed * dt;
        player.x = orbitBody.x + Math.cos(orbitAngle) * orbitRadius;
        player.y = orbitBody.y + Math.sin(orbitAngle) * orbitRadius;
        // Match body drift so release feels clean
        const tAng = orbitAngle + (orbitDir > 0 ? Math.PI / 2 : -Math.PI / 2);
        const spd = Math.abs(angSpeed) * orbitRadius;
        player.vx = Math.cos(tAng) * spd + orbitBody.vx;
        player.vy = Math.sin(tAng) * spd + orbitBody.vy;

        if (Math.random() < dt * 18) {
          particles.push({
            x: player.x,
            y: player.y,
            vx: rand(-20, 20),
            vy: rand(-20, 20),
            life: 0.35,
            max: 0.35,
            size: 2,
            color: "rgba(108,240,255,0.7)",
          });
        }
      }
    } else {
      // Free flight
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      // Light drag so slingshots read clearly without eternal drift
      player.vx *= Math.pow(0.995, dt * 60);
      player.vy *= Math.pow(0.995, dt * 60);
    }

    // Trail
    player.trail.push({ x: player.x, y: player.y, a: 1 });
    if (player.trail.length > 22) player.trail.shift();
    for (const t of player.trail) t.a *= 0.92;

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
      p.vy *= 0.97;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Collisions — while locked, other planets are ghosted (debris/stars still kill)
    for (const b of bodies) {
      const d = dist(player.x, player.y, b.x, b.y);
      if (orbitBody === b) {
        if (b.kind === "star" && b.collapse && d < b.r + player.r) {
          killPlayer("rgba(255,80,50,0.95)");
          return;
        }
        continue;
      }
      if (orbitBody && b.kind === "planet") continue;
      const hitR = b.r + player.r - (b.kind === "planet" ? 2 : 0);
      if (d < hitR) {
        if (b.kind === "debris") killPlayer("rgba(160,200,255,0.9)");
        else if (b.kind === "star") killPlayer("rgba(255,90,60,0.95)");
        else killPlayer("rgba(255,180,80,0.9)");
        return;
      }
    }

    // Soft wrap warning: die if far outside
    const out = 80;
    if (player.x < -out || player.x > W + out || player.y < -out || player.y > H + out) {
      killPlayer("rgba(100,140,200,0.8)");
      return;
    }

    shake *= Math.pow(0.88, dt * 60);
    flash = Math.max(0, flash - dt);

    // Occasional orbit tick while locked long
    if (orbitBody && Math.random() < dt * 0.8) sfxTick();
  }

  // —— Draw ——
  function draw() {
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;

    ctx.save();
    ctx.translate(sx, sy);

    // Background
    ctx.fillStyle = "#070b14";
    ctx.fillRect(-20, -20, W + 40, H + 40);

    // Soft nebula
    const g = ctx.createRadialGradient(W * 0.3, H * 0.25, 0, W * 0.3, H * 0.25, W * 0.55);
    g.addColorStop(0, "rgba(40, 70, 110, 0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const g2 = ctx.createRadialGradient(W * 0.75, H * 0.7, 0, W * 0.75, H * 0.7, W * 0.45);
    g2.addColorStop(0, "rgba(30, 90, 90, 0.12)");
    g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);

    // Stars
    for (const s of stars) {
      ctx.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(time * 2 + s.x));
      ctx.fillStyle = "#cfe0ff";
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // Orbit guide when holding near a body (before lock or while locked)
    if (state === "play" && holding) {
      const guide = orbitBody || nearestOrbitable(player.x, player.y);
      if (guide) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(108,240,255,0.28)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 6]);
        const rr = guide.r + 22 + Math.min(28, guide.r * 0.35);
        ctx.arc(guide.x, guide.y, rr, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Bodies
    for (const b of bodies) {
      drawBody(b);
    }

    // Particles
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Trail
    if (state === "play" || state === "over") {
      for (let i = 0; i < player.trail.length; i++) {
        const t = player.trail[i];
        ctx.globalAlpha = t.a * 0.55;
        ctx.fillStyle = "#3de0c5";
        ctx.beginPath();
        ctx.arc(t.x, t.y, 2.2, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Player
    if (state === "play" || (state === "over" && flash > 0.05)) {
      drawPlayer();
    }

    // Edge vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,120,100,${flash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Holding hint ring on player
    if (state === "play" && holding && orbitBody) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(108,240,255,0.55)";
      ctx.lineWidth = 2;
      ctx.arc(player.x, player.y, player.r + 6 + Math.sin(time * 10) * 1.5, 0, TAU);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBody(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);

    if (b.kind === "planet") {
      const grd = ctx.createRadialGradient(-b.r * 0.3, -b.r * 0.3, b.r * 0.1, 0, 0, b.r);
      grd.addColorStop(0, `hsl(${b.hue}, 70%, 62%)`);
      grd.addColorStop(0.55, `hsl(${b.hue + 12}, 55%, 42%)`);
      grd.addColorStop(1, `hsl(${b.hue + 20}, 50%, 22%)`);
      ctx.beginPath();
      ctx.fillStyle = grd;
      ctx.arc(0, 0, b.r, 0, TAU);
      ctx.fill();
      // Band
      ctx.beginPath();
      ctx.strokeStyle = `hsla(${b.hue}, 40%, 70%, 0.25)`;
      ctx.lineWidth = Math.max(2, b.r * 0.12);
      ctx.ellipse(0, 0, b.r * 0.9, b.r * 0.28, 0.4, 0, TAU);
      ctx.stroke();
      // Soft atmosphere
      ctx.beginPath();
      ctx.strokeStyle = `hsla(${b.hue}, 60%, 70%, 0.18)`;
      ctx.lineWidth = 3;
      ctx.arc(0, 0, b.r + 3, 0, TAU);
      ctx.stroke();
    } else if (b.kind === "debris") {
      ctx.fillStyle = `hsl(${b.hue}, 25%, 70%)`;
      ctx.strokeStyle = `hsl(${b.hue}, 20%, 40%)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const rr = b.r * (0.65 + ((i * 37) % 10) / 25);
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // star / collapsing
      const pulse = 1 + Math.sin(b.pulse) * (b.collapse ? 0.18 : 0.06);
      const R = b.r * pulse;
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.8);
      if (b.collapse) {
        core.addColorStop(0, "rgba(255,240,200,1)");
        core.addColorStop(0.25, "rgba(255,120,60,0.85)");
        core.addColorStop(0.55, "rgba(180,30,60,0.35)");
        core.addColorStop(1, "rgba(0,0,0,0)");
      } else {
        core.addColorStop(0, "rgba(255,250,220,1)");
        core.addColorStop(0.3, "rgba(255,200,100,0.8)");
        core.addColorStop(0.65, "rgba(255,140,60,0.25)");
        core.addColorStop(1, "rgba(0,0,0,0)");
      }
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = b.collapse ? "#1a0508" : "#fff6d0";
      ctx.beginPath();
      ctx.arc(0, 0, R * (b.collapse ? 0.45 : 0.35), 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawPlayer() {
    const ang = Math.atan2(player.vy, player.vx);
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(ang);

    // Glow
    ctx.beginPath();
    ctx.fillStyle = "rgba(61,224,197,0.25)";
    ctx.arc(0, 0, player.r + 5, 0, TAU);
    ctx.fill();

    // Craft diamond
    ctx.beginPath();
    ctx.moveTo(player.r + 2, 0);
    ctx.lineTo(-player.r * 0.7, player.r * 0.75);
    ctx.lineTo(-player.r * 0.35, 0);
    ctx.lineTo(-player.r * 0.7, -player.r * 0.75);
    ctx.closePath();
    ctx.fillStyle = "#e8fff8";
    ctx.fill();
    ctx.strokeStyle = "#3de0c5";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Engine flicker when free
    if (!orbitBody && state === "play") {
      const flick = 0.5 + Math.random() * 0.5;
      ctx.beginPath();
      ctx.moveTo(-player.r * 0.35, 0);
      ctx.lineTo(-player.r * (1.2 + flick * 0.6), player.r * 0.35);
      ctx.lineTo(-player.r * (1.2 + flick * 0.6), -player.r * 0.35);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,180,80,${0.55 * flick})`;
      ctx.fill();
    }

    ctx.restore();
  }

  // —— Loop ——
  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = Math.min(dt, 0.033);
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // —— Wire up ——
  window.addEventListener("resize", () => {
    resize();
    seedStars();
  });
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("blur", () => setHolding(false));
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  startBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    startGame();
  });
  restartBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    startGame();
  });
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".cta")) return;
    e.preventDefault();
    if (state === "title" || state === "over") startGame();
  });

  resize();
  seedStars();
  updateBestHud();
  // Idle drift craft for title backdrop
  player.x = W * 0.5;
  player.y = H * 0.48;
  player.vx = 40;
  player.vy = -10;
  spawnBody("planet", W * 0.32, H * 0.42, 36, 8, 4);
  spawnBody("planet", W * 0.7, H * 0.6, 24, -6, -3);
  spawnBody("star", W * 0.55, H * 0.28, 20, 2, 1);
  requestAnimationFrame(frame);
})();
