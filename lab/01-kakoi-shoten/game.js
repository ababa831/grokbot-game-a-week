/* かこい商店
   枠の上では安全。線を引いているあいだだけ危ない。
   閉じると、取立てのいない側が店になり、そこにいた客が ¥ になる。
   文字はキャンバスに描かない。 */
(function () {
  var C = KConfig;
  var GW = (C.FIELD_W / C.CELL) | 0;
  var GH = (C.FIELD_H / C.CELL) | 0;
  var DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  var HINT = "枠で待つと客が寄る。押したまま伸ばし、枠へ戻すと囲う。離すと中断。";

  var UPGRADES = [
    { id: "lure", name: "呼び込み", desc: "客がもっと寄る", max: 3 },
    { id: "swift", name: "早切り", desc: "線が速くなる", max: 3 },
    { id: "price", name: "値札", desc: "客の単価が上がる", max: 3 },
    { id: "fuse", name: "余裕", desc: "火花が遅くなる", max: 2 },
    { id: "crowd", name: "にぎわい", desc: "翌日から客が増える", max: 2 },
    { id: "bundle", name: "まとめ売り", desc: "まとめ囲いが割増", max: 2 },
  ];

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var hudRent = document.getElementById("v-rent");
  var hudSales = document.getElementById("v-sales");
  var hudTime = document.getElementById("v-time");
  var hudDay = document.getElementById("v-day");
  var statSales = document.getElementById("stat-sales");
  var statTime = document.getElementById("stat-time");
  var panel = document.getElementById("panel");
  var hint = document.getElementById("hint");
  var statusEl = document.getElementById("status");
  var pauseBtn = document.getElementById("pause");
  var muteBtn = document.getElementById("mute");
  var stage = document.getElementById("stage");
  var hud = document.getElementById("hud");

  var grid = new Uint8Array(GW * GH);
  var S = null;
  var halted = false;
  var cssScale = 1;

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function idx(x, y) {
    return y * GW + x;
  }
  function inb(x, y) {
    return x >= 0 && y >= 0 && x < GW && y < GH;
  }
  function cellAt(px, py) {
    var x = Math.floor(px / C.CELL);
    var y = Math.floor(py / C.CELL);
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x >= GW) x = GW - 1;
    if (y >= GH) y = GH - 1;
    return { x: x, y: y };
  }
  function center(x, y) {
    return { x: (x + 0.5) * C.CELL, y: (y + 0.5) * C.CELL };
  }
  function hypot(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  function freshState(seed) {
    return {
      mode: "title",
      day: 1,
      time: C.DAY_SEC,
      sales: 0,
      totalSales: 0,
      rent: C.rent(1),
      daysCleared: 0,
      upgrades: { lure: 0, swift: 0, price: 0, fuse: 0, crowd: 0, bundle: 0 },
      customers: [],
      collectors: [],
      player: { gx: (GW / 2) | 0, gy: GH - 1, x: 0, y: 0 },
      anchorGx: (GW / 2) | 0,
      anchorGy: GH - 1,
      still: 1,
      lureOn: false,
      drawing: false,
      origin: null,
      head: null,
      line: [],
      poly: [],
      lastDir: null,
      prevCell: null,
      drawAcc: 0,
      walkAcc: 0,
      stall: 0,
      fuse: null,
      fusePing: 0,
      stun: 0,
      shake: 0,
      flash: 0,
      hitStop: 0,
      pops: [],
      popHold: 0,
      particles: [],
      status: HINT,
      statusT: 0,
      defaultStatus: HINT,
      warnAge: -1,
      offer: [],
      pointer: { x: C.FIELD_W / 2, y: C.FIELD_H - 4, down: false, id: null },
      rng: mulberry32(seed || 1),
      runSeed: seed || 1,
      demoT: 0,
      hits: 0,
      captures: 0,
      cutCount: 0,
      attempts: [],
      frame: 0,
      targetCell: null,
    };
  }

  function buildBorder() {
    grid.fill(0);
    for (var x = 0; x < GW; x++) {
      grid[idx(x, 0)] = 1;
      grid[idx(x, GH - 1)] = 1;
    }
    for (var y = 0; y < GH; y++) {
      grid[idx(0, y)] = 1;
      grid[idx(GW - 1, y)] = 1;
    }
  }

  function isFrontier(x, y) {
    return touchesOpen(x, y, false);
  }

  function isWalkable(x, y) {
    return touchesOpen(x, y, true);
  }

  function touchesOpen(x, y, eight) {
    if (!inb(x, y) || grid[idx(x, y)] !== 1) return false;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (!eight && dx !== 0 && dy !== 0) continue;
        var nx = x + dx;
        var ny = y + dy;
        if (inb(nx, ny) && grid[idx(nx, ny)] === 0) return true;
      }
    }
    return false;
  }

  function inward(gx, gy) {
    for (var i = 0; i < 4; i++) {
      var nx = gx + DIRS[i][0];
      var ny = gy + DIRS[i][1];
      if (inb(nx, ny) && grid[idx(nx, ny)] === 0) return { dx: DIRS[i][0], dy: DIRS[i][1] };
    }
    return { dx: 0, dy: -1 };
  }

  function nearestOpen(sx, sy, maxd) {
    var q = [{ x: sx, y: sy, d: 0 }];
    var seen = new Uint8Array(GW * GH);
    if (inb(sx, sy)) seen[idx(sx, sy)] = 1;
    var head = 0;
    while (head < q.length) {
      var n = q[head++];
      if (n.d > 0 && inb(n.x, n.y) && grid[idx(n.x, n.y)] === 0) return n;
      if (n.d >= maxd) continue;
      for (var i = 0; i < 4; i++) {
        var nx = n.x + DIRS[i][0];
        var ny = n.y + DIRS[i][1];
        if (!inb(nx, ny) || seen[idx(nx, ny)]) continue;
        seen[idx(nx, ny)] = 1;
        q.push({ x: nx, y: ny, d: n.d + 1 });
      }
    }
    return null;
  }

  function placePlayer(gx, gy) {
    if (!isFrontier(gx, gy)) {
      var spot = null;
      var best = 1e9;
      for (var y = 0; y < GH; y++) {
        for (var x = 0; x < GW; x++) {
          if (!isFrontier(x, y)) continue;
          var d = (x - gx) * (x - gx) + (y - gy) * (y - gy);
          if (d < best) {
            best = d;
            spot = { x: x, y: y };
          }
        }
      }
      if (spot) {
        gx = spot.x;
        gy = spot.y;
      }
    }
    var p = center(gx, gy);
    S.player.gx = gx;
    S.player.gy = gy;
    S.player.x = p.x;
    S.player.y = p.y;
  }

  function spawnCustomers(n) {
    var list = [];
    var guard = 0;
    while (list.length < n && guard < 4000) {
      guard++;
      var gx;
      var gy;
      if (S.rng() < 0.45) {
        var edge = (S.rng() * 4) | 0;
        var depth = 3 + ((S.rng() * 6) | 0);
        if (edge === 0) {
          gx = depth;
          gy = 2 + ((S.rng() * (GH - 4)) | 0);
        } else if (edge === 1) {
          gx = GW - 1 - depth;
          gy = 2 + ((S.rng() * (GH - 4)) | 0);
        } else if (edge === 2) {
          gx = 2 + ((S.rng() * (GW - 4)) | 0);
          gy = depth;
        } else {
          gx = 2 + ((S.rng() * (GW - 4)) | 0);
          gy = GH - 1 - depth;
        }
      } else {
        gx = 6 + ((S.rng() * (GW - 12)) | 0);
        gy = 6 + ((S.rng() * (GH - 12)) | 0);
      }
      if (!inb(gx, gy) || grid[idx(gx, gy)] !== 0) continue;
      var p = center(gx, gy);
      var ok = true;
      for (var i = 0; i < list.length; i++) {
        if (hypot(list[i].x - p.x, list[i].y - p.y) < 22) ok = false;
      }
      if (!ok) continue;
      var ang = S.rng() * Math.PI * 2;
      var sp = C.WANDER_SPEED * (0.55 + S.rng() * 0.7);
      list.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        r: C.CUST_R,
        phase: S.rng() * 6.28,
        turnIn: 0.4 + S.rng() * 1.1,
      });
    }
    return list;
  }

  function spawnCollectors(n) {
    var anchors =
      n === 1
        ? [{ x: C.FIELD_W * 0.58, y: C.FIELD_H * 0.38 }]
        : [
            { x: C.FIELD_W * 0.34, y: C.FIELD_H * 0.32 },
            { x: C.FIELD_W * 0.68, y: C.FIELD_H * 0.6 },
          ];
    var list = [];
    for (var i = 0; i < anchors.length; i++) {
      var jitterX = (S.rng() * 36 - 18);
      var jitterY = (S.rng() * 28 - 14);
      var e = {
        x: anchors[i].x + jitterX,
        y: anchors[i].y + jitterY,
        vx: 0,
        vy: 0,
        r: C.COL_R,
        tele: 0,
        chase: false,
        turnIn: 0.2,
        phase: S.rng() * 6,
      };
      var ang = S.rng() * Math.PI * 2;
      var sp = collectorSpeed();
      e.vx = Math.cos(ang) * sp;
      e.vy = Math.sin(ang) * sp;
      shoveIntoOpen(e);
      list.push(e);
    }
    return list;
  }

  function collectorSpeed() {
    var v = C.COLLECTOR_SPEED + Math.max(0, S.day - 1) * C.COLLECTOR_SPEED_DAY;
    return Math.min(C.COLLECTOR_SPEED_CAP, v);
  }

  function lureRadius() {
    return C.LURE_RADIUS + S.upgrades.lure * C.LURE_RADIUS_ADD;
  }

  function drawSpeed() {
    return C.DRAW_SPEED + S.upgrades.swift * C.SWIFT_ADD;
  }

  function unitValue() {
    return C.VALUE + S.upgrades.price * C.PRICE_ADD;
  }

  function payout(count) {
    if (count <= 0) return 0;
    var bonus = S.upgrades.bundle * C.BUNDLE_ADD;
    return count * unitValue() + Math.max(0, count - 1) * bonus;
  }

  function stallNeed() {
    return C.STALL + S.upgrades.fuse * C.FUSE_ADD;
  }

  function shoveIntoOpen(e) {
    var c = cellAt(e.x, e.y);
    if (grid[idx(c.x, c.y)] === 0) return;
    var spot = nearestOpen(c.x, c.y, 10);
    if (!spot) return;
    var p = center(spot.x, spot.y);
    e.x = p.x;
    e.y = p.y;
  }

  function contain(e) {
    for (var pass = 0; pass < 2; pass++) {
      var probes = [
        [e.r, 0],
        [-e.r, 0],
        [0, e.r],
        [0, -e.r],
      ];
      for (var i = 0; i < 4; i++) {
        var c = cellAt(e.x + probes[i][0], e.y + probes[i][1]);
        if (!inb(c.x, c.y) || grid[idx(c.x, c.y)] !== 0) {
          e.x -= probes[i][0] * 0.45;
          e.y -= probes[i][1] * 0.45;
        }
      }
    }
    var c0 = cellAt(e.x, e.y);
    if (!inb(c0.x, c0.y) || grid[idx(c0.x, c0.y)] !== 0) shoveIntoOpen(e);
  }

  function moveBody(e, dt) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    var c = cellAt(e.x, e.y);
    if (!inb(c.x, c.y) || grid[idx(c.x, c.y)] !== 0) {
      e.x -= e.vx * dt;
      e.y -= e.vy * dt;
      var xOnly = { x: e.x + e.vx * dt, y: e.y };
      var cx = cellAt(xOnly.x, xOnly.y);
      if (inb(cx.x, cx.y) && grid[idx(cx.x, cx.y)] === 0) e.x = xOnly.x;
      else e.vx *= -1;
      var yOnly = { x: e.x, y: e.y + e.vy * dt };
      var cy = cellAt(yOnly.x, yOnly.y);
      if (inb(cy.x, cy.y) && grid[idx(cy.x, cy.y)] === 0) e.y = yOnly.y;
      else e.vy *= -1;
    }
    if (e.x < C.CELL) e.x = C.CELL;
    if (e.y < C.CELL) e.y = C.CELL;
    if (e.x > C.FIELD_W - C.CELL) e.x = C.FIELD_W - C.CELL;
    if (e.y > C.FIELD_H - C.CELL) e.y = C.FIELD_H - C.CELL;
    contain(e);
  }

  function clampSpeed(e, max) {
    var s = hypot(e.vx, e.vy);
    if (s > max && s > 0) {
      e.vx = (e.vx / s) * max;
      e.vy = (e.vy / s) * max;
    }
  }

  function lurePoint() {
    var inn = inward(S.player.gx, S.player.gy);
    return {
      x: S.player.x + inn.dx * 22,
      y: S.player.y + inn.dy * 22,
    };
  }

  function updateCustomers(dt, lureOn) {
    var lp = lurePoint();
    var radius = lureRadius();
    for (var i = 0; i < S.customers.length; i++) {
      var cu = S.customers[i];
      cu.phase += dt;
      cu.turnIn -= dt;
      if (cu.turnIn <= 0) {
        var ang = Math.atan2(cu.vy, cu.vx) + (S.rng() - 0.5) * 1.4;
        var sp = C.WANDER_SPEED * (0.7 + S.rng() * 0.5);
        cu.vx = Math.cos(ang) * sp;
        cu.vy = Math.sin(ang) * sp;
        cu.turnIn = 0.6 + S.rng() * 1.3;
      }
      if (lureOn) {
        var dx = lp.x - cu.x;
        var dy = lp.y - cu.y;
        var d = hypot(dx, dy);
        if (d < radius && d > 1) {
          var pull = C.LURE_SPEED * (0.55 + 0.45 * (1 - d / radius));
          cu.vx = cu.vx * 0.72 + (dx / d) * pull * 0.28;
          cu.vy = cu.vy * 0.72 + (dy / d) * pull * 0.28;
          clampSpeed(cu, C.LURE_SPEED);
        } else {
          clampSpeed(cu, C.WANDER_SPEED * 1.15);
        }
      } else {
        clampSpeed(cu, C.WANDER_SPEED * 1.15);
      }
      for (var j = 0; j < S.customers.length; j++) {
        if (i === j) continue;
        var o = S.customers[j];
        var sx = cu.x - o.x;
        var sy = cu.y - o.y;
        var sd = hypot(sx, sy);
        if (sd > 0 && sd < 18) {
          var push = ((18 - sd) / 18) * 0.35;
          cu.x += (sx / sd) * push;
          cu.y += (sy / sd) * push;
        }
      }
      moveBody(cu, dt);
    }
  }

  function nearestOnPoly(x, y) {
    var best = { x: S.poly[0].x, y: S.poly[0].y, d: 1e9 };
    for (var i = 1; i < S.poly.length; i++) {
      var a = S.poly[i - 1];
      var b = S.poly[i];
      var abx = b.x - a.x;
      var aby = b.y - a.y;
      var len2 = abx * abx + aby * aby || 1;
      var t = ((x - a.x) * abx + (y - a.y) * aby) / len2;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      var px = a.x + abx * t;
      var py = a.y + aby * t;
      var d = hypot(x - px, y - py);
      if (d < best.d) best = { x: px, y: py, d: d };
    }
    return best;
  }

  function updateCollectors(dt) {
    var speed = collectorSpeed();
    var lineHot = S.drawing && S.poly.length > 1;
    for (var i = 0; i < S.collectors.length; i++) {
      var col = S.collectors[i];
      if (!lineHot) {
        col.tele = 0;
        col.chase = false;
      } else if (!col.chase) {
        col.tele += dt;
        if (col.tele >= C.TELEGRAPH) {
          col.chase = true;
          KAudio.fuse();
        }
      }
      col.turnIn -= dt;
      if (!col.chase && col.turnIn <= 0) {
        var ang = S.rng() * Math.PI * 2;
        col.vx = Math.cos(ang) * speed;
        col.vy = Math.sin(ang) * speed;
        col.turnIn = 0.7 + S.rng() * 1.4;
      }
      if (col.chase && S.poly.length > 1) {
        var p = nearestOnPoly(col.x, col.y);
        var dx = p.x - col.x;
        var dy = p.y - col.y;
        var d = hypot(dx, dy) || 1;
        var chase = speed * C.CHASE_MULT;
        col.vx = col.vx * 0.45 + (dx / d) * chase * 0.55;
        col.vy = col.vy * 0.45 + (dy / d) * chase * 0.55;
        clampSpeed(col, chase);
      } else {
        clampSpeed(col, speed);
      }
      moveBody(col, dt);
    }
  }

  function distToSeg(px, py, a, b) {
    var abx = b.x - a.x;
    var aby = b.y - a.y;
    var len2 = abx * abx + aby * aby || 1;
    var t = ((px - a.x) * abx + (py - a.y) * aby) / len2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return hypot(px - (a.x + abx * t), py - (a.y + aby * t));
  }

  function collectorHitsLine() {
    if (S.poly.length < 2) return false;
    for (var c = 0; c < S.collectors.length; c++) {
      var col = S.collectors[c];
      var cell = cellAt(col.x, col.y);
      if (grid[idx(cell.x, cell.y)] === 2) return true;
      for (var i = 1; i < S.poly.length; i++) {
        if (distToSeg(col.x, col.y, S.poly[i - 1], S.poly[i]) < col.r + C.LINE_HALF) return true;
      }
    }
    return false;
  }

  function polyLength() {
    var n = 0;
    for (var i = 1; i < S.poly.length; i++) n += hypot(S.poly[i].x - S.poly[i - 1].x, S.poly[i].y - S.poly[i - 1].y);
    return n;
  }

  function clearLineCells() {
    for (var i = 0; i < grid.length; i++) if (grid[i] === 2) grid[i] = 0;
    S.line = [];
    S.poly = [];
    S.fuse = null;
    S.stall = 0;
    S.drawing = false;
    S.lastDir = null;
    S.prevCell = null;
    S.drawAcc = 0;
  }

  function onHit(reason) {
    var origin = S.origin || { gx: S.player.gx, gy: S.player.gy };
    clearLineCells();
    placePlayer(origin.gx, origin.gy);
    S.stun = C.HIT_STUN;
    S.shake = 7;
    S.hits += 1;
    S.attempts.push(reason || "hit");
    S.hitStop = 5;
    S.flash = 0;
    stage.classList.add("hit");
    setTimeout(function () {
      stage.classList.remove("hit");
    }, 180);
    setStatus(reason === "fuse" ? "火花に追いつかれた" : "取立てに触れた。線は消えた", 1.3);
    KAudio.hit();
  }

  function burst(points) {
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var bits = 7;
      for (var k = 0; k < bits; k++) {
        var ang = (Math.PI * 2 * k) / bits + S.rng() * 0.3;
        var sp = 50 + S.rng() * 90;
        S.particles.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - 20,
          life: 0.45 + S.rng() * 0.25,
          max: 0.7,
          r: 2.5 + (k % 2),
          color: k % 2 === 0 ? "#ffd15a" : "#fff6df",
        });
      }
    }
    if (S.particles.length > 120) S.particles.splice(0, S.particles.length - 120);
  }

  function resolveClaim() {
    var seen = new Uint8Array(GW * GH);
    var q = [];
    for (var c = 0; c < S.collectors.length; c++) {
      var cell = cellAt(S.collectors[c].x, S.collectors[c].y);
      var i0 = idx(cell.x, cell.y);
      if (grid[i0] === 0 && !seen[i0]) {
        seen[i0] = 1;
        q.push(i0);
      }
    }
    var head = 0;
    while (head < q.length) {
      var i = q[head++];
      var x = i % GW;
      var y = (i / GW) | 0;
      for (var d = 0; d < 4; d++) {
        var nx = x + DIRS[d][0];
        var ny = y + DIRS[d][1];
        if (!inb(nx, ny)) continue;
        var ni = idx(nx, ny);
        if (seen[ni] || grid[ni] !== 0) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    var openClaimed = 0;
    for (var n = 0; n < grid.length; n++) {
      if (grid[n] === 0 && !seen[n]) openClaimed++;
    }
    if (openClaimed === 0) {
      clearLineCells();
      return { count: 0, points: [], empty: true };
    }
    var points = [];
    var keep = [];
    for (var u = 0; u < S.customers.length; u++) {
      var cu = S.customers[u];
      var cc = cellAt(cu.x, cu.y);
      var ci = idx(cc.x, cc.y);
      var caught = grid[ci] === 2 || (grid[ci] === 0 && !seen[ci]);
      if (caught) points.push({ x: cu.x, y: cu.y });
      else keep.push(cu);
    }
    for (var g = 0; g < grid.length; g++) {
      if (grid[g] === 2 || (grid[g] === 0 && !seen[g])) grid[g] = 1;
    }
    S.customers = keep;
    S.line = [];
    S.poly = [];
    S.fuse = null;
    S.drawing = false;
    S.stall = 0;
    return { count: points.length, points: points, empty: false };
  }

  function finishAt(gx, gy) {
    if (collectorHitsLine()) {
      onHit("touch");
      return;
    }
    var result = resolveClaim();
    placePlayer(gx, gy);
    S.cutCount += 1;
    S.attempts.push(result.empty ? "fizzle" : "ok" + result.count);
    if (result.empty) {
      setStatus("両側に取立てがいる", 1.1);
      KAudio.fizzle();
      return;
    }
    for (var i = 0; i < S.collectors.length; i++) shoveIntoOpen(S.collectors[i]);
    if (result.count > 0) {
      var money = payout(result.count);
      S.sales += money;
      S.totalSales += money;
      S.captures += result.count;
      S.pops = result.points;
      S.popHold = result.count >= 6 ? 9 : result.count >= 3 ? 6 : 4;
      S.hitStop = result.count >= 3 ? 6 : 4;
      S.pendingBurst = { points: result.points };
      S.shake = result.count >= 5 ? 6 : 3.5;
      S.flash = 0.22;
      KAudio.capture(result.count);
      var msg = "+" + yen(money) + "（" + result.count + "人）";
      if (S.sales >= S.rent) msg += "　家賃は超えた";
      setStatus(msg, 1.35);
    } else {
      setStatus("誰もいなかった", 0.9);
      KAudio.fizzle();
      S.flash = 0.12;
    }
  }

  function shoveOffCell(gx, gy) {
    for (var i = 0; i < S.customers.length; i++) {
      var cu = S.customers[i];
      var c = cellAt(cu.x, cu.y);
      if (c.x !== gx || c.y !== gy) continue;
      var best = null;
      var bestD = 1e9;
      for (var d = 0; d < 4; d++) {
        var nx = gx + DIRS[d][0];
        var ny = gy + DIRS[d][1];
        if (!inb(nx, ny) || grid[idx(nx, ny)] !== 0) continue;
        var p = center(nx, ny);
        var dist = hypot(p.x - cu.x, p.y - cu.y);
        if (dist < bestD) {
          bestD = dist;
          best = p;
        }
      }
      if (best) {
        cu.x = best.x;
        cu.y = best.y;
      }
    }
  }

  function stepDraw() {
    var px = S.pointer.x;
    var py = S.pointer.y;
    var best = null;
    var bestScore = 1e18;
    for (var i = 0; i < 4; i++) {
      var nx = S.head.gx + DIRS[i][0];
      var ny = S.head.gy + DIRS[i][1];
      if (!inb(nx, ny)) continue;
      if (S.prevCell && nx === S.prevCell.gx && ny === S.prevCell.gy) continue;
      var st = grid[idx(nx, ny)];
      if (st === 2) continue;
      var cpt = center(nx, ny);
      var score = (cpt.x - px) * (cpt.x - px) + (cpt.y - py) * (cpt.y - py);
      if (S.lastDir && S.lastDir.dx === DIRS[i][0] && S.lastDir.dy === DIRS[i][1]) score -= 12 * 12;
      if (st === 0) {
        if (score < bestScore) {
          bestScore = score;
          best = { nx: nx, ny: ny, dx: DIRS[i][0], dy: DIRS[i][1], solid: false };
        }
      } else if (st === 1 && S.line.length >= C.MIN_LINE) {
        if (score < bestScore) {
          bestScore = score;
          best = { nx: nx, ny: ny, dx: DIRS[i][0], dy: DIRS[i][1], solid: true };
        }
      }
    }
    if (!best) return "stuck";
    if (best.solid) {
      finishAt(best.nx, best.ny);
      return "done";
    }
    S.prevCell = { gx: S.head.gx, gy: S.head.gy };
    grid[idx(best.nx, best.ny)] = 2;
    shoveOffCell(best.nx, best.ny);
    S.line.push({ gx: best.nx, gy: best.ny });
    S.poly.push(center(best.nx, best.ny));
    S.head.gx = best.nx;
    S.head.gy = best.ny;
    S.lastDir = { dx: best.dx, dy: best.dy };
    S.player.gx = best.nx;
    S.player.gy = best.ny;
    var hp = center(best.nx, best.ny);
    S.player.x = hp.x;
    S.player.y = hp.y;
    if (S.line.length % 4 === 0) KAudio.tick();
    return "move";
  }

  function beginDraw() {
    if (S.mode !== "play" || S.stun > 0 || S.drawing) return;
    if (!isFrontier(S.player.gx, S.player.gy)) return;
    S.drawing = true;
    S.origin = { gx: S.player.gx, gy: S.player.gy };
    S.head = { gx: S.player.gx, gy: S.player.gy };
    S.line = [];
    S.poly = [];
    S.lastDir = null;
    S.prevCell = null;
    S.drawAcc = 0;
    S.stall = 0;
    S.fuse = null;
    setStatus("枠へ戻せ。離すと中断", 8);
    KAudio.startLine();
  }

  function cancelDraw() {
    if (!S.drawing) return;
    var origin = S.origin || { gx: S.player.gx, gy: S.player.gy };
    var had = S.line.length > 0;
    clearLineCells();
    placePlayer(origin.gx, origin.gy);
    if (had) {
      setStatus("中断した", 0.7);
      KAudio.cancel();
    } else {
      setStatus(S.defaultStatus, 0);
    }
  }

  function updateDraw(dt) {
    var moved = false;
    S.drawAcc += drawSpeed() * dt;
    var guard = 0;
    while (S.drawAcc >= C.CELL && S.drawing && guard < 6) {
      guard++;
      S.drawAcc -= C.CELL;
      var r = stepDraw();
      if (r === "move") moved = true;
      if (r !== "move") {
        S.drawAcc = 0;
        break;
      }
      if (collectorHitsLine()) {
        onHit("touch");
        return;
      }
    }
    if (!S.drawing) return;
    if (moved) {
      S.stall = 0;
      if (!S.fuse) S.fusePing = 0;
    } else if (S.line.length > 0) {
      S.stall += dt;
      if (!S.fuse && S.stall >= stallNeed() + C.FUSE_WARN) {
        S.fuse = { dist: 0 };
        KAudio.fuse();
      }
    }
    if (S.fuse && S.drawing) {
      S.fuse.dist += C.FUSE_SPEED * dt;
      if (S.fuse.dist >= Math.max(8, polyLength() - 6)) onHit("fuse");
    }
  }

  function nearestFrontier(px, py) {
    var best = null;
    var bestD = 1e18;
    for (var y = 0; y < GH; y++) {
      for (var x = 0; x < GW; x++) {
        if (!isFrontier(x, y)) continue;
        var c = center(x, y);
        var d = (c.x - px) * (c.x - px) + (c.y - py) * (c.y - py);
        if (d < bestD) {
          bestD = d;
          best = { x: x, y: y, d: d };
        }
      }
    }
    return best;
  }

  function nextFrontierStep(from, to) {
    if (from.x === to.x && from.y === to.y) return null;
    var prev = new Int32Array(GW * GH);
    for (var i = 0; i < prev.length; i++) prev[i] = -1;
    var start = idx(from.x, from.y);
    var goal = idx(to.x, to.y);
    prev[start] = -2;
    var q = [start];
    var head = 0;
    var found = false;
    while (head < q.length) {
      var cur = q[head++];
      if (cur === goal) {
        found = true;
        break;
      }
      var x = cur % GW;
      var y = (cur / GW) | 0;
      for (var d = 0; d < 4; d++) {
        var nx = x + DIRS[d][0];
        var ny = y + DIRS[d][1];
        if (!isWalkable(nx, ny)) continue;
        var ni = idx(nx, ny);
        if (prev[ni] !== -1) continue;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    if (!found) return null;
    var walk = goal;
    var guard = 0;
    while (prev[walk] !== start && prev[walk] >= 0 && guard++ < GW * GH) walk = prev[walk];
    return { x: walk % GW, y: (walk / GW) | 0 };
  }

  function updateWalk(dt) {
    if (S.targetCell && !isFrontier(S.targetCell.x, S.targetCell.y)) S.targetCell = null;
    var near = nearestFrontier(S.pointer.x, S.pointer.y);
    if (!near) return;
    if (S.targetCell) {
      var cur = center(S.targetCell.x, S.targetCell.y);
      var alt = center(near.x, near.y);
      var curD = hypot(cur.x - S.pointer.x, cur.y - S.pointer.y);
      var altD = hypot(alt.x - S.pointer.x, alt.y - S.pointer.y);
      if (altD + 16 < curD) S.targetCell = { x: near.x, y: near.y };
    } else {
      S.targetCell = { x: near.x, y: near.y };
    }
    S.walkAcc += C.PLAYER_SPEED * dt;
    var guard = 0;
    while (S.walkAcc >= C.CELL && guard < 4) {
      guard++;
      var step = nextFrontierStep(
        { x: S.player.gx, y: S.player.gy },
        S.targetCell
      );
      if (!step) {
        S.walkAcc = 0;
        break;
      }
      S.walkAcc -= C.CELL;
      S.player.gx = step.x;
      S.player.gy = step.y;
    }
    var p = center(S.player.gx, S.player.gy);
    S.player.x = p.x;
    S.player.y = p.y;
  }

  function updateParticles(dt) {
    for (var i = S.particles.length - 1; i >= 0; i--) {
      var p = S.particles[i];
      p.life -= dt;
      p.vy += 80 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) S.particles.splice(i, 1);
    }
    if (S.flash > 0) S.flash -= dt;
    if (S.shake > 0) S.shake *= Math.pow(0.86, dt * 60);
    if (S.shake < 0.15) S.shake = 0;
  }

  function update(dt) {
    S.frame++;
    if (S.statusT > 0) {
      S.statusT -= dt;
      if (S.statusT <= 0 && S.mode === "play" && !S.drawing) S.status = S.defaultStatus;
    }
    if (S.mode === "pause") return;
    if (S.mode === "title") {
      updateTitle(dt);
      updateParticles(dt);
      return;
    }
    if (S.mode !== "play") {
      updateParticles(dt);
      return;
    }

    if (S.hitStop > 0) {
      S.hitStop -= 1;
      updateParticles(dt);
      return;
    }

    S.time -= dt;
    if (S.time < 0) S.time = 0;
    if (S.time <= C.WARN_UNDER && S.time > 0) {
      if (S.warnAge < 0) S.warnAge = 0;
      S.warnAge += dt;
    }

    if (S.popHold > 0) S.popHold -= 1;
    else if (S.pendingBurst) {
      burst(S.pendingBurst.points);
      S.pendingBurst = null;
      S.pops = [];
    }

    if (S.stun > 0) {
      S.stun -= dt;
      updateCustomers(dt, false);
      updateCollectors(dt);
      updateParticles(dt);
      if (S.time === 0) endDay();
      return;
    }

    if (S.drawing) updateDraw(dt);
    else updateWalk(dt);

    if (S.mode !== "play") return;

    if (S.player.gx === S.anchorGx && S.player.gy === S.anchorGy) S.still += dt;
    else {
      S.still = 0;
      S.anchorGx = S.player.gx;
      S.anchorGy = S.player.gy;
    }
    S.lureOn = !S.drawing && S.still >= 0.18;
    updateCustomers(dt, S.lureOn);
    updateCollectors(dt);
    if (S.drawing && collectorHitsLine()) onHit("touch");
    updateParticles(dt);
    if (S.time === 0 && S.mode === "play") endDay();
  }

  function updateTitle(dt) {
    S.demoT += dt;
    var edge = Math.sin(S.demoT * 0.45) * 0.5 + 0.5;
    S.pointer.x = 36 + edge * (C.FIELD_W - 72);
    S.pointer.y = C.FIELD_H - 6;
    S.pointer.down = false;
    updateWalk(dt);
    S.lureOn = true;
    updateCustomers(dt, true);
    updateCollectors(dt);
  }

  function endDay() {
    if (S.mode !== "play") return;
    if (S.drawing) {
      var origin = S.origin || { gx: S.player.gx, gy: S.player.gy };
      clearLineCells();
      placePlayer(origin.gx, origin.gy);
    }
    if (S.sales >= S.rent) {
      S.daysCleared += 1;
      S.mode = "upgrade";
      S.offer = rollOffer();
      KAudio.clear();
      showUpgrade();
    } else {
      S.mode = "over";
      KAudio.fail();
      showOver();
    }
  }

  function rollOffer() {
    var pool = [];
    for (var i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i];
      if (S.upgrades[u.id] < u.max) pool.push(u);
    }
    for (var j = pool.length - 1; j > 0; j--) {
      var k = (S.rng() * (j + 1)) | 0;
      var tmp = pool[j];
      pool[j] = pool[k];
      pool[k] = tmp;
    }
    return pool.slice(0, 3);
  }

  function beginDay() {
    buildBorder();
    S.mode = "play";
    S.sales = 0;
    S.time = C.DAY_SEC;
    S.rent = C.rent(S.day);
    S.warnAge = -1;
    S.drawing = false;
    S.fuse = null;
    S.stun = 0;
    S.pops = [];
    S.pendingBurst = null;
    S.popHold = 0;
    S.particles = [];
    S.flash = 0;
    var extra = S.upgrades.crowd * C.CROWD_ADD;
    S.customers = spawnCustomers(C.customerCount(S.day, extra));
    S.collectors = spawnCollectors(C.collectorCount(S.day));
    placePlayer((GW / 2) | 0, GH - 1);
    S.anchorGx = S.player.gx;
    S.anchorGy = S.player.gy;
    S.still = 0;
    S.lureOn = false;
    S.targetCell = null;
    S.walkAcc = 0;
    showPlay();
    var msg =
      S.collectors.length >= 2
        ? "取立てが2人。家賃は " + yen(S.rent)
        : "家賃は " + yen(S.rent) + "。短く切って払え";
    setStatus(msg, 2.2);
  }

  function startRun(seed) {
    var use = seed == null ? ((Math.random() * 1e9) | 0) : seed | 0;
    S = freshState(use);
    beginDay();
  }

  function pickUpgrade(index) {
    if (S.mode !== "upgrade") return;
    var u = S.offer[index];
    if (!u) {
      S.day += 1;
      beginDay();
      return;
    }
    S.upgrades[u.id] += 1;
    KAudio.ui();
    S.day += 1;
    beginDay();
  }

  function setStatus(text, sec) {
    S.status = text;
    S.statusT = sec || 0;
    if (!sec && S.mode === "play") S.defaultStatus = text;
  }

  function yen(n) {
    return "¥" + n;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function markScreen(name) {
    document.body.dataset.screen = name;
  }

  function showTitle() {
    markScreen("title");
    clearNode(panel);
    panel.hidden = false;
    hint.hidden = true;
    panel.appendChild(el("h1", null, "かこい商店"));
    panel.appendChild(el("p", "pitch", "陣取りだけど、囲うのは土地じゃなくて客。"));
    panel.appendChild(
      el(
        "p",
        null,
        "枠のそばで待つと客が寄る。押したまま線を伸ばし、別の枠まで届けると、取立てのいない側が店になる。"
      )
    );
    panel.appendChild(
      el(
        "p",
        null,
        "危ないのは線を引いているあいだだけ。取立てが線に触れるか、途中で止まって火花に追いつかれると失敗。離すと線は消える。"
      )
    );
    panel.appendChild(el("p", null, "1日は45秒。売上が家賃に届かないと、その日で店じまい。"));
    var btn = el("button", "primary", "クリック／タップで開店");
    btn.type = "button";
    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      KAudio.unlock();
      startRun(null);
    });
    panel.appendChild(btn);
  }

  function showPlay() {
    markScreen("play");
    panel.hidden = true;
    clearNode(panel);
    hint.hidden = false;
    pauseBtn.textContent = "一時停止";
  }

  function showUpgrade() {
    markScreen("upgrade");
    hint.hidden = true;
    panel.hidden = false;
    clearNode(panel);
    panel.appendChild(el("h2", null, S.day + "日目は黒字"));
    panel.appendChild(
      el("p", null, "売上 " + yen(S.sales) + "　家賃 " + yen(S.rent) + "。強化をひとつ選ぶ。")
    );
    if (S.offer.length === 0) {
      var go = el("button", "primary", "このまま翌朝へ");
      go.type = "button";
      go.addEventListener("click", function () {
        pickUpgrade(-1);
      });
      panel.appendChild(go);
      return;
    }
    var gridEl = el("div", "choices");
    for (var i = 0; i < S.offer.length; i++) {
      (function (index) {
        var u = S.offer[index];
        var btn = el("button", "choice");
        btn.type = "button";
        btn.appendChild(el("span", "name", u.name));
        btn.appendChild(el("span", "desc", u.desc));
        btn.appendChild(el("span", "lv", S.upgrades[u.id] + " / " + u.max));
        btn.addEventListener("click", function () {
          pickUpgrade(index);
        });
        gridEl.appendChild(btn);
      })(i);
    }
    panel.appendChild(gridEl);
  }

  function showOver() {
    markScreen("over");
    hint.hidden = true;
    panel.hidden = false;
    clearNode(panel);
    panel.appendChild(el("h2", null, "店じまい"));
    panel.appendChild(el("p", null, S.day + "日目、家賃が払えなかった。"));
    var dl = el("dl", "stats");
    function row(k, v) {
      var wrap = el("div");
      wrap.appendChild(el("dt", null, k));
      wrap.appendChild(el("dd", null, v));
      dl.appendChild(wrap);
    }
    row("払えた日数", S.daysCleared + "日");
    row("その日の売上", yen(S.sales) + " / 家賃 " + yen(S.rent));
    row("合計売上", yen(S.totalSales));
    panel.appendChild(dl);
    var btn = el("button", "primary", "もう一度開店する");
    btn.type = "button";
    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      KAudio.unlock();
      startRun(null);
    });
    panel.appendChild(btn);
  }

  function bootTitle() {
    S = freshState(7);
    buildBorder();
    S.customers = spawnCustomers(10);
    S.collectors = spawnCollectors(1);
    placePlayer((GW / 2) | 0, GH - 1);
    S.mode = "title";
    S.rent = C.rent(1);
    S.time = C.DAY_SEC;
    S.day = 1;
    S.sales = 0;
    showTitle();
  }

  function syncHud() {
    hudRent.textContent = yen(S.rent);
    hudSales.textContent = yen(S.sales);
    var shown = S.time <= 0 ? 0 : Math.ceil(S.time - 1e-6);
    hudTime.textContent = String(shown);
    hudDay.textContent = S.day + "日目";
    statSales.classList.toggle("met", S.mode === "play" && S.sales >= S.rent && S.rent > 0);
    var warn = S.mode === "play" && S.time <= C.WARN_UNDER && S.time > 0;
    statTime.classList.toggle("warn", warn);
    statTime.classList.toggle("blink", warn && S.warnAge >= 0 && S.warnAge < C.BLINK_FOR);
    statusEl.textContent = S.mode === "pause" ? "一時停止中" : S.status;
    pauseBtn.textContent = S.mode === "pause" ? "つづける" : "一時停止";
  }

  function layout() {
    var sw = stage.clientWidth;
    var sh = stage.clientHeight;
    if (sw < 8 || sh < 8) return;
    var aspect = C.FIELD_W / C.FIELD_H;
    var w = sw;
    var h = w / aspect;
    if (h > sh) {
      h = sh;
      w = h * aspect;
    }
    w = Math.max(160, Math.floor(w));
    h = Math.floor(w / aspect);
    if (h > sh) {
      h = Math.floor(sh);
      w = Math.floor(h * aspect);
    }
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = Math.max(1, Math.round(w * dpr));
    var bh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    cssScale = (w / C.FIELD_W) * dpr;
    hud.style.width = "";
    hint.style.width = "";
    panel.style.width = "";
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function render() {
    layout();
    syncHud();
    var sx = 0;
    var sy = 0;
    if (S.shake > 0) {
      sx = Math.sin(S.frame * 1.7) * S.shake;
      sy = Math.cos(S.frame * 2.1) * S.shake * 0.6;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(cssScale, 0, 0, cssScale, sx * cssScale, sy * cssScale);

    for (var y = 0; y < GH; y++) {
      for (var x = 0; x < GW; x++) {
        var st = grid[idx(x, y)];
        var border = x === 0 || y === 0 || x === GW - 1 || y === GH - 1;
        if (st === 1 && border) ctx.fillStyle = "#1a1e2c";
        else if (st === 1) ctx.fillStyle = S.flash > 0 ? "#ffe3a8" : "#f0d7a4";
        else ctx.fillStyle = "#2c3450";
        ctx.fillRect(x * C.CELL, y * C.CELL, C.CELL, C.CELL);
      }
    }

    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (var gy = 2; gy < GH - 1; gy += 2) {
      for (var gx = 2; gx < GW - 1; gx += 2) {
        if (grid[idx(gx, gy)] !== 0) continue;
        ctx.fillRect(gx * C.CELL + 3, gy * C.CELL + 3, 2, 2);
      }
    }

    if (S.lureOn && (S.mode === "play" || S.mode === "title")) {
      var lp = lurePoint();
      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 208, 120, 0.22)";
      ctx.arc(lp.x, lp.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    if (S.drawing && S.origin && S.poly.length > 0) {
      var anchor = center(S.origin.gx, S.origin.gy);
      ctx.strokeStyle = "#1a1408";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo(S.poly[0].x, S.poly[0].y);
      ctx.stroke();
      ctx.strokeStyle = "#ffd24a";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo(S.poly[0].x, S.poly[0].y);
      ctx.stroke();
    }
    if (S.poly.length > 1) {
      var warning = S.drawing && !S.fuse && S.stall >= stallNeed();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = "#1a1408";
      ctx.lineWidth = 10;
      strokePoly();
      ctx.strokeStyle = S.fuse ? "#ff8a1e" : warning ? "#ffb15a" : "#ffd24a";
      ctx.lineWidth = 6;
      strokePoly();
      if (S.fuse) {
        var pos = pointAlong(S.fuse.dist);
        ctx.beginPath();
        ctx.fillStyle = "#1a1408";
        ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "#ffcf70";
        ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (var i = 0; i < S.customers.length; i++) drawCustomer(S.customers[i], 1);
    for (var p = 0; p < S.pops.length; p++) {
      var scale = 1 + (1 - S.popHold / 9) * 0.45;
      drawCustomer({ x: S.pops[p].x, y: S.pops[p].y, r: C.CUST_R * scale, phase: 0 }, 1);
    }

    for (var k = 0; k < S.collectors.length; k++) drawCollector(S.collectors[k]);
    drawPlayer();

    for (var q = 0; q < S.particles.length; q++) {
      var bit = S.particles[q];
      ctx.beginPath();
      ctx.fillStyle = "#1a1408";
      ctx.arc(bit.x, bit.y, bit.r + 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = bit.color;
      ctx.arc(bit.x, bit.y, bit.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function strokePoly() {
    ctx.beginPath();
    ctx.moveTo(S.poly[0].x, S.poly[0].y);
    for (var i = 1; i < S.poly.length; i++) ctx.lineTo(S.poly[i].x, S.poly[i].y);
    ctx.stroke();
  }

  function pointAlong(dist) {
    var left = dist;
    for (var i = 1; i < S.poly.length; i++) {
      var a = S.poly[i - 1];
      var b = S.poly[i];
      var seg = hypot(b.x - a.x, b.y - a.y);
      if (left <= seg) {
        var t = seg === 0 ? 0 : left / seg;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      left -= seg;
    }
    return S.poly[S.poly.length - 1];
  }

  function drawCustomer(cu, alpha) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.fillStyle = "#2a1210";
    ctx.arc(cu.x, cu.y, cu.r + 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#ff8a5b";
    ctx.arc(cu.x, cu.y, cu.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#fff3ea";
    ctx.arc(cu.x, cu.y - 1, cu.r * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a1210";
    ctx.fillRect(cu.x - 3.2, cu.y - 2.4, 1.6, 1.6);
    ctx.fillRect(cu.x + 1.6, cu.y - 2.4, 1.6, 1.6);
    ctx.globalAlpha = 1;
  }

  function drawCollector(col) {
    var ring = col.chase ? "#ff3344" : col.tele > 0 ? "#ffb020" : "#ffd0a8";
    ctx.beginPath();
    ctx.lineWidth = col.tele > 0 || col.chase ? 3 : 2;
    ctx.strokeStyle = "#1a0a08";
    ctx.arc(col.x, col.y, col.r + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = ring;
    ctx.arc(col.x, col.y, col.r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = "#1a0a08";
    ctx.arc(col.x, col.y, col.r + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = col.chase ? "#ff4d3a" : "#ff2d3a";
    ctx.arc(col.x, col.y, col.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a0a08";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(col.x - 5, col.y - 5);
    ctx.lineTo(col.x + 5, col.y + 5);
    ctx.moveTo(col.x + 5, col.y - 5);
    ctx.lineTo(col.x - 5, col.y + 5);
    ctx.stroke();
    ctx.strokeStyle = "#fff6ea";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(col.x - 5, col.y - 5);
    ctx.lineTo(col.x + 5, col.y + 5);
    ctx.moveTo(col.x + 5, col.y - 5);
    ctx.lineTo(col.x - 5, col.y + 5);
    ctx.stroke();
    if (col.chase && S.poly.length > 1) {
      var p = nearestOnPoly(col.x, col.y);
      ctx.strokeStyle = "rgba(255, 176, 32, 0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(col.x, col.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawPlayer() {
    var inn = inward(S.player.gx, S.player.gy);
    var x = S.drawing ? S.player.x : S.player.x + inn.dx * 18;
    var y = S.drawing ? S.player.y : S.player.y + inn.dy * 18;
    ctx.fillStyle = "#1a1408";
    ctx.beginPath();
    ctx.arc(x, y + 1, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff8ee";
    ctx.beginPath();
    ctx.arc(x, y, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d4533a";
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 2);
    ctx.lineTo(x, y - 12);
    ctx.lineTo(x + 8, y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#1a1408";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = "#1a1408";
    ctx.fillRect(x - 3, y + 1, 1.5, 1.5);
    ctx.fillRect(x + 1.6, y + 1, 1.5, 1.5);
    if (!S.drawing) {
      ctx.fillStyle = "#ffd24a";
      ctx.fillRect(S.player.x - 2, S.player.y - 2, 4, 4);
    }
  }

  function canvasPoint(ev) {
    var r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * C.FIELD_W,
      y: ((ev.clientY - r.top) / r.height) * C.FIELD_H,
    };
  }

  canvas.addEventListener("pointerdown", function (ev) {
    if (ev.button != null && ev.button !== 0) return;
    KAudio.unlock();
    canvas.setPointerCapture(ev.pointerId);
    var p = canvasPoint(ev);
    S.pointer.x = p.x;
    S.pointer.y = p.y;
    S.pointer.id = ev.pointerId;
    if (S.mode === "title") {
      startRun(null);
      return;
    }
    if (S.mode === "over") {
      startRun(null);
      return;
    }
    if (S.mode !== "play") return;
    S.pointer.down = true;
    beginDraw();
  });

  canvas.addEventListener("pointermove", function (ev) {
    var p = canvasPoint(ev);
    S.pointer.x = p.x;
    S.pointer.y = p.y;
  });

  function endPointer(ev) {
    if (S.pointer.id != null && ev.pointerId !== S.pointer.id) return;
    S.pointer.down = false;
    S.pointer.id = null;
    if (S.mode === "play" && S.drawing) cancelDraw();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  panel.addEventListener("pointerdown", function () {
    KAudio.unlock();
  });

  pauseBtn.addEventListener("click", function () {
    KAudio.unlock();
    if (S.mode === "play") {
      S.mode = "pause";
      markScreen("pause");
      KAudio.ui();
    } else if (S.mode === "pause") {
      S.mode = "play";
      markScreen("play");
      if (!S.pointer.down && S.drawing) cancelDraw();
    }
  });

  muteBtn.addEventListener("click", function (ev) {
    ev.stopPropagation();
    KAudio.unlock();
    var on = KAudio.toggle();
    muteBtn.textContent = on ? "音声オン" : "音声オフ";
    muteBtn.setAttribute("aria-pressed", on ? "true" : "false");
  });

  window.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") {
      if (S.mode === "play" || S.mode === "pause") pauseBtn.click();
    } else if (ev.key === "Enter" || ev.key === " ") {
      if (S.mode === "title" || S.mode === "over") {
        ev.preventDefault();
        KAudio.unlock();
        startRun(null);
      }
    } else if (ev.key === "F2") {
      if (S.mode === "play") {
        S.sales = Math.max(S.sales, S.rent);
        S.time = 0.05;
      }
    } else if (ev.key === "F3") {
      if (S.mode === "play") S.time = 0.05;
    }
  });

  window.addEventListener("resize", layout);

  var acc = 0;
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!halted && S) {
      acc += dt;
      var steps = 0;
      while (acc >= 1 / 60 && steps < 5) {
        acc -= 1 / 60;
        update(1 / 60);
        steps++;
      }
    }
    if (S) render();
    requestAnimationFrame(frame);
  }

  bootTitle();
  layout();
  requestAnimationFrame(frame);

  window.KAKOI = {
    halt: function (v) {
      halted = !!v;
      if (halted) acc = 0;
    },
    previewHud: function (rent, sales, day) {
      S.rent = rent;
      S.sales = sales;
      S.day = day;
    },
    start: function (seed) {
      startRun(seed == null ? 1 : seed);
    },
    retry: function () {
      startRun(null);
    },
    choose: function (i) {
      pickUpgrade(i);
    },
    pointer: function (x, y, down) {
      var was = S.pointer.down;
      S.pointer.x = x;
      S.pointer.y = y;
      if (down && !was && S.mode === "play") {
        S.pointer.down = true;
        beginDraw();
      } else if (!down && was) {
        S.pointer.down = false;
        if (S.drawing) cancelDraw();
      } else {
        S.pointer.down = !!down;
      }
    },
    tick: function (n) {
      for (var i = 0; i < n; i++) update(1 / 60);
      render();
    },
    openAt: function (x, y) {
      var c = cellAt(x, y);
      return grid[idx(c.x, c.y)] === 0;
    },
    snapshot: function () {
      return {
        mode: S.mode,
        day: S.day,
        time: S.time,
        sales: S.sales,
        rent: S.rent,
        totalSales: S.totalSales,
        daysCleared: S.daysCleared,
        drawing: S.drawing,
        stun: S.stun,
        line: S.line.length,
        hits: S.hits,
        captures: S.captures,
        cuts: S.cutCount,
        attempts: S.attempts.slice(),
        customers: S.customers.map(function (c) {
          return { x: c.x, y: c.y };
        }),
        collectors: S.collectors.map(function (c) {
          return { x: c.x, y: c.y, chase: c.chase, tele: c.tele };
        }),
        player: { x: S.player.x, y: S.player.y, gx: S.player.gx, gy: S.player.gy },
        upgrades: {
          lure: S.upgrades.lure,
          swift: S.upgrades.swift,
          price: S.upgrades.price,
          fuse: S.upgrades.fuse,
          crowd: S.upgrades.crowd,
          bundle: S.upgrades.bundle,
        },
        offer: S.offer.map(function (u) {
          return u.id;
        }),
        status: S.status,
        field: { w: C.FIELD_W, h: C.FIELD_H, cell: C.CELL, gw: GW, gh: GH },
      };
    },
  };
})();
