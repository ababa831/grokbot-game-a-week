/* ヘッドレス Chrome で、文字の重なりと数日分の収支を見る。
   node lab/01-kakoi-shoten/playtest.mjs
   システムの google-chrome だけで動く。 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = process.env.CHROME || "/usr/local/bin/google-chrome";
const PORT = Number(process.env.KAKOI_PORT || 9333);
const PAGE = "file://" + new URL("./index.html", import.meta.url).pathname;
const OUT = process.env.SHOT_DIR || "/tmp/kakoi-shots";

const proc = spawn(
  CHROME,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/kakoi-chrome-${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

function die(err) {
  proc.kill("SIGKILL");
  console.error(err);
  process.exit(1);
}

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(url + " " + res.status);
  return res.json();
}

async function waitVersion() {
  for (let i = 0; i < 50; i++) {
    try {
      return await getJson(`http://127.0.0.1:${PORT}/json/version`);
    } catch {
      await sleep(100);
    }
  }
  throw new Error("chrome が立ち上がらない");
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => {
      resolve({
        ws,
        events,
        send(method, params = {}) {
          const msgId = ++id;
          return new Promise((res, rej) => {
            pending.set(msgId, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id: msgId, method, params }));
          });
        },
      });
    });
    ws.addEventListener("error", () => reject(new Error("ws error")));
  });
}

const overlapFn = `(() => {
  const nodes = [...document.querySelectorAll("h1,h2,p,button,dt,dd,.k,.v,.name,.desc,.lv,#status")].filter((el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  });
  const textOf = (el) => (el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 48);
  const hits = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const x = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
      const y = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
      if (x > 1 && y > 1) hits.push({ a: textOf(a), b: textOf(b), x: Math.round(x), y: Math.round(y) });
    }
  }
  const clipped = [];
  for (const el of nodes) {
    if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) clipped.push(textOf(el));
  }
  const off = [];
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) off.push(textOf(el));
  }
  const sample = getComputedStyle(document.querySelector("h1, h2, .v") || document.body).fontFamily;
  return { hits, clipped, off, font: sample, mode: window.KAKOI ? window.KAKOI.snapshot().mode : "missing" };
})()`;

const botFn = `(seeds) => {
  const H = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function moveNear(x, y) {
    KAKOI.pointer(x, y, false);
    for (let i = 0; i < 100; i++) {
      KAKOI.tick(3);
      const s = KAKOI.snapshot();
      if (H(s.player, { x, y }) < 12 || s.mode !== "play") return s;
    }
    return KAKOI.snapshot();
  }
  function drawPath(points, plan) {
    KAKOI.pointer(points[0].x, points[0].y, true);
    const stepTo = (x, y) => {
      KAKOI.pointer(x, y, true);
      KAKOI.tick(2);
      const st = KAKOI.snapshot();
      if (!st.drawing || st.mode !== "play") return st;
      if (clearance(st, plan) < 36) {
        KAKOI.pointer(x, y, false);
        KAKOI.tick(2);
        const cancelled = KAKOI.snapshot();
        cancelled.cancelled = true;
        return cancelled;
      }
      return null;
    };
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(dist / 10));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const stopped = stepTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        if (stopped) return stopped;
      }
    }
    const last = points[points.length - 1];
    for (let i = 0; i < 40; i++) {
      const stopped = stepTo(last.x, last.y);
      if (stopped) return stopped;
    }
    KAKOI.pointer(last.x, last.y, false);
    return KAKOI.snapshot();
  }
  function segDist(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1;
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
  }
  function plan(name, field) {
    const W = field.w, Hh = field.h;
    const span = 112, depth = 60, inset = 16;
    if (name === "bl") return { name, wait: { x: 70, y: Hh - 4 }, start: { x: span, y: Hh - 4 }, path: [{ x: span, y: Hh - 4 }, { x: span, y: Hh - depth }, { x: -24, y: Hh - depth }], pocket: { x: 64, y: Hh - 36 }, box: { x0: inset, x1: span - 18, y0: Hh - depth + 14, y1: Hh - inset } };
    if (name === "br") return { name, wait: { x: W - 70, y: Hh - 4 }, start: { x: W - span, y: Hh - 4 }, path: [{ x: W - span, y: Hh - 4 }, { x: W - span, y: Hh - depth }, { x: W + 24, y: Hh - depth }], pocket: { x: W - 64, y: Hh - 36 }, box: { x0: W - span + 18, x1: W - inset, y0: Hh - depth + 14, y1: Hh - inset } };
    if (name === "tl") return { name, wait: { x: 70, y: 4 }, start: { x: span, y: 4 }, path: [{ x: span, y: 4 }, { x: span, y: depth }, { x: -24, y: depth }], pocket: { x: 64, y: 36 }, box: { x0: inset, x1: span - 18, y0: inset, y1: depth - 14 } };
    return { name, wait: { x: W - 70, y: 4 }, start: { x: W - span, y: 4 }, path: [{ x: W - span, y: 4 }, { x: W - span, y: depth }, { x: W + 24, y: depth }], pocket: { x: W - 64, y: 36 }, box: { x0: W - span + 18, x1: W - inset, y0: inset, y1: depth - 14 } };
  }
  function clearance(snap, p) {
    let near = 1e9;
    for (const c of snap.collectors) {
      for (let i = 1; i < p.path.length; i++) near = Math.min(near, segDist(c, p.path[i - 1], p.path[i]));
    }
    return near;
  }
  function pocketCount(snap, p) {
    let n = 0;
    for (const c of snap.customers) {
      if (c.x >= p.box.x0 && c.x <= p.box.x1 && c.y >= p.box.y0 && c.y <= p.box.y1) n++;
    }
    return n;
  }
  function crowd(snap, p) {
    let n = 0;
    for (const c of snap.customers) if (H(c, p.wait) < 170) n++;
    return n;
  }
  function bestCorner(snap) {
    let best = null, bestScore = -1;
    for (const name of ["bl", "br", "tl", "tr"]) {
      const p = plan(name, snap.field);
      if (!KAKOI.openAt(p.pocket.x, p.pocket.y)) continue;
      const danger = clearance(snap, p);
      if (danger < 86) continue;
      const inside = pocketCount(snap, p);
      const near = crowd(snap, p);
      const score = (inside + near > 0 ? 500 : 0) + inside * 140 + near * 28 + Math.min(danger, 220);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }
  function pickUpgrade(snap) {
    const rank = { price: 0, crowd: 1, bundle: 2, swift: 3, lure: 4, fuse: 5 };
    let best = 0, bestR = 99;
    snap.offer.forEach((id, i) => {
      const r = rank[id] == null ? 9 : rank[id];
      if (r < bestR) { bestR = r; best = i; }
    });
    return best;
  }
  const out = [];
  for (const seed of seeds) {
    KAKOI.start(seed);
    const days = [];
    for (let d = 0; d < 8; d++) {
      const hits0 = KAKOI.snapshot().hits;
      const cap0 = KAKOI.snapshot().captures;
      const att0 = KAKOI.snapshot().attempts.length;
      let cancels = 0;
      const why = { noCorner: 0, flee: 0, few: 0, far: 0, cut: 0 };
      let spins = 0;
      while (spins++ < 140) {
        const snap = KAKOI.snapshot();
        if (snap.mode !== "play" || snap.time < 1.15) break;
        const p = bestCorner(snap);
        if (!p) { why.noCorner++; KAKOI.tick(12); continue; }
        const arrived = moveNear(p.wait.x, p.wait.y);
        if (arrived.mode !== "play") break;
        let flee = false;
        for (let w = 0; w < 14; w++) {
          KAKOI.tick(10);
          const mid = KAKOI.snapshot();
          if (mid.mode !== "play") { flee = true; break; }
          const gap = clearance(mid, p);
          const insideNow = pocketCount(mid, p);
          if (gap < 64) { flee = true; break; }
          if (insideNow >= 3 && w >= 4) break;
          if (insideNow >= 2 && w >= 8) break;
        }
        if (flee || KAKOI.snapshot().mode !== "play") { why.flee++; continue; }
        const ready = KAKOI.snapshot();
        const need = ready.time < 10 ? 1 : 2;
        const inside = pocketCount(ready, p);
        if (inside < need || clearance(ready, p) < 72) {
          why.few++;
          if (!why.fewSample) why.fewSample = { name: p.name, inside, near: crowd(ready, p), gap: Math.round(clearance(ready, p)), t: Math.round(ready.time), px: Math.round(ready.player.x), py: Math.round(ready.player.y) };
          continue;
        }
        const at = moveNear(p.start.x, p.start.y);
        if (at.mode !== "play") break;
        if (H(at.player, p.start) > 18) {
          why.far++;
          if (!why.farSample) why.farSample = { name: p.name, px: Math.round(at.player.x), py: Math.round(at.player.y), gx: at.player.gx, gy: at.player.gy, sx: p.start.x, sy: p.start.y, t: Math.round(at.time) };
          continue;
        }
        if (clearance(KAKOI.snapshot(), p) < 74 || pocketCount(KAKOI.snapshot(), p) < 1) { why.few++; continue; }
        const after = drawPath(p.path, p);
        if (after.cancelled) { cancels++; continue; }
        why.cut++;
        if (after.stun > 0) KAKOI.tick(40);
        if (after.mode !== "play") break;
      }
      let snap = KAKOI.snapshot();
      if (snap.mode === "play") {
        KAKOI.tick(Math.ceil(snap.time * 60) + 8);
        snap = KAKOI.snapshot();
      }
      days.push({
        mode: snap.mode,
        day: snap.day,
        sales: snap.sales,
        rent: snap.rent,
        cleared: snap.daysCleared,
        hits: snap.hits - hits0,
        caught: snap.captures - cap0,
        cancels,
        why,
        attempts: snap.attempts.slice(att0),
        total: snap.totalSales,
        left: snap.customers.length,
        time: Math.round(snap.time * 10) / 10,
        offer: snap.offer,
      });
      if (snap.mode === "upgrade") KAKOI.choose(pickUpgrade(snap));
      else break;
    }
    out.push({ seed, days });
  }
  return out;
}`;

async function evalJson(sess, expression) {
  const result = await sess.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    const d = result.exceptionDetails;
    throw new Error((d.text || "error") + " " + (d.exception && d.exception.description ? d.exception.description : ""));
  }
  return result.result.value;
}

async function shot(sess, name) {
  const { data } = await sess.send("Page.captureScreenshot", { format: "png" });
  const path = `${OUT}/${name}.png`;
  await writeFile(path, Buffer.from(data, "base64"));
  return path;
}

async function prepare(sess, w, h) {
  await sess.send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: w < 500,
  });
  await sess.send("Page.navigate", { url: PAGE });
  await sleep(200);
  for (let i = 0; i < 30; i++) {
    const ok = await evalJson(sess, "!!(window.KAKOI && document.fonts)");
    if (ok) break;
    await sleep(50);
  }
  await evalJson(sess, "document.fonts.ready");
  await evalJson(sess, "window.KAKOI.halt(true)");
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await waitVersion();
  const list = await getJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("page target がない");
  const sess = await connect(page.webSocketDebuggerUrl);
  await sess.send("Page.enable");
  await sess.send("Runtime.enable");
  await prepare(sess, 1280, 720);
  console.log("boot", await evalJson(sess, "({title:document.title, mode:KAKOI.snapshot().mode})"));

  const sizes = [
    [1280, 720],
    [1920, 1080],
    [1024, 768],
    [390, 844],
  ];
  const overlap = [];
  if (process.env.SKIP_SHOTS !== "1") {
  for (const [w, h] of sizes) {
    await prepare(sess, w, h);
    await evalJson(sess, "window.KAKOI.tick(40)");
    const title = await evalJson(sess, overlapFn);
    await shot(sess, `title-${w}x${h}`);

    await evalJson(sess, "window.KAKOI.start(3); window.KAKOI.tick(30)");
    const play = await evalJson(sess, overlapFn);
    await shot(sess, `play-${w}x${h}`);

    await evalJson(sess, "window.KAKOI.halt(true); window.KAKOI.previewHud(1324, 10880, 12)");
    await sleep(80);
    const fat = await evalJson(sess, overlapFn);
    await shot(sess, `hudfat-${w}x${h}`);
    if (fat.hits.length || fat.clipped.length || fat.off.length) {
      console.log("hudfat", w, h, JSON.stringify({ hits: fat.hits, clipped: fat.clipped, off: fat.off }));
    }

    await evalJson(sess, "window.dispatchEvent(new KeyboardEvent('keydown', {key:'F2'})); window.KAKOI.tick(12)");
    const upgrade = await evalJson(sess, overlapFn);
    await shot(sess, `upgrade-${w}x${h}`);

    await evalJson(sess, "window.KAKOI.start(4); window.dispatchEvent(new KeyboardEvent('keydown', {key:'F3'})); window.KAKOI.tick(12)");
    const over = await evalJson(sess, overlapFn);
    await shot(sess, `over-${w}x${h}`);

    overlap.push({ size: `${w}x${h}`, title, play, upgrade, over });
    console.log(w, h, "title", title.hits.length, title.mode, "play", play.mode, "up", upgrade.mode, "over", over.mode);
    if (title.hits.length || play.hits.length || upgrade.hits.length || over.hits.length) {
      console.log(JSON.stringify({ title: title.hits, play: play.hits, upgrade: upgrade.hits, over: over.hits }));
    }
    if (title.clipped.length || play.clipped.length || upgrade.clipped.length || over.clipped.length) {
      console.log("clipped", JSON.stringify({ title: title.clipped, play: play.clipped, upgrade: upgrade.clipped, over: over.clipped }));
    }
    if (title.off.length || play.off.length || upgrade.off.length || over.off.length) {
      console.log("off", JSON.stringify({ title: title.off, play: play.off, upgrade: upgrade.off, over: over.off }));
    }
    }
  }

  await prepare(sess, 1280, 720);
  if (process.env.SKIP_BALANCE !== "1") {
  console.log("balance start");
  const balance = await evalJson(sess, `(${botFn})([1,2,3,7,11,13,21,42])`);
  console.log(JSON.stringify(balance, null, 2));
  await writeFile(`${OUT}/report.json`, JSON.stringify({ overlap, balance }, null, 2));
  } else {
  await writeFile(`${OUT}/report.json`, JSON.stringify({ overlap }, null, 2));
  }
  sess.ws.close();
  proc.kill("SIGKILL");
}

main().catch(die);
