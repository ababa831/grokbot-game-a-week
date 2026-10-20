/**
 * Pointer-driven headless play: title → lure wait → short cut → days → artifacts.
 * Installs puppeteer-core into /tmp so the game folder stays clean.
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 8766;
const ART = '/opt/cursor/artifacts/kakoi-shoten';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

async function ensurePuppeteer() {
  const base = '/tmp/kakoi-playtest-npm';
  if (!existsSync(join(base, 'node_modules/puppeteer-core'))) {
    await mkdir(base, { recursive: true });
    await new Promise((resolve, reject) => {
      const p = spawn('npm', ['install', '--prefix', base, 'puppeteer-core@23'], { stdio: 'inherit' });
      p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('npm failed'))));
    });
  }
  return import(join(base, 'node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'));
}

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      try {
        const body = await readFile(join(__dirname, path));
        res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('x');
      }
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function canvasClick(page, nx, ny) {
  const box = await page.$eval('#game', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  await page.mouse.click(box.x + box.w * nx, box.y + box.h * ny);
}

async function drawBite(page, start, mid, end) {
  const box = await page.$eval('#game', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const pt = (p) => ({ x: box.x + box.w * p[0], y: box.y + box.h * p[1] });
  const a = pt(start);
  const b = pt(mid);
  const c = pt(end);
  // Park on border first so draw starts from a known edge cell
  await page.mouse.move(a.x, a.y);
  await new Promise((r) => setTimeout(r, 200));
  await page.mouse.down();
  // Player chases pointer at ~245px/s — move slowly enough to complete the loop
  await page.mouse.move(b.x, b.y, { steps: 28 });
  await new Promise((r) => setTimeout(r, 280));
  await page.mouse.move(c.x, c.y, { steps: 24 });
  await new Promise((r) => setTimeout(r, 280));
  await page.mouse.move(a.x, a.y, { steps: 24 });
  await new Promise((r) => setTimeout(r, 350));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 250));
}

async function main() {
  const puppeteer = await ensurePuppeteer();
  await mkdir(ART, { recursive: true });
  const server = await startServer();
  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=900,800'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 800 });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.KakoiGame);

  await page.screenshot({ path: join(ART, '10-title.png') });

  await canvasClick(page, 0.5, 0.5);
  await page.waitForFunction(() => window.KakoiGame.getState().mode === 'playing');
  await page.screenshot({ path: join(ART, '11-playing-start.png') });

  // Push collector away and nudge customers toward bottom-left for a readable first cut
  await page.evaluate(() => {
    const st = window.KakoiGame.getState();
    for (const col of st.collectors) {
      col.x = 620;
      col.y = 80;
    }
    let i = 0;
    for (const c of st.customers) {
      if (!c.alive) continue;
      if (i++ < 4) {
        c.x = 70 + Math.random() * 50;
        c.y = 380 + Math.random() * 40;
      }
    }
  });

  const box = await page.$eval('#game', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  await page.mouse.move(box.x + box.w * 0.1, box.y + box.h * 0.92);
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: join(ART, '12-luring.png') });

  // Compact short cut from the actual border (~2 cells ≈ 0.02–0.03)
  await drawBite(page, [0.02, 0.95], [0.18, 0.78], [0.02, 0.78]);
  await page.screenshot({ path: join(ART, '13-after-cut.png') });
  const afterCut = await page.evaluate(() => {
    const st = window.KakoiGame.getState();
    return { daySales: st.daySales, mode: st.mode, lives: st.lives, customers: st.customers.filter((c) => c.alive).length };
  });
  console.log('AFTER_CUT', afterCut);

  // More cuts with bot assist for multi-day, but mix pointer
  const notes = [];
  for (let wave = 0; wave < 60; wave++) {
    const s = await page.evaluate(() => {
      const st = window.KakoiGame.getState();
      return {
        mode: st.mode,
        day: st.day,
        daySales: st.daySales,
        rent: st.rent,
        time: st.dayTimeLeft,
        lives: st.lives,
        totalSales: st.totalSales,
        customers: st.customers.filter((c) => c.alive).length,
      };
    });
    notes.push(s);
    if (s.mode === 'gameover') break;
    if (s.mode === 'upgrade') {
      await page.screenshot({ path: join(ART, `14-upgrade-d${s.day}.png`) });
      await page.evaluate(() => {
        const st = window.KakoiGame.getState();
        // prefer lure early, then life, then line speed
        const order = ['lure', 'life', 'line_speed', 'slow_debt'];
        let idx = 0;
        for (const id of order) {
          const i = st.upgradeChoices.findIndex((u) => u.id === id);
          if (i >= 0) {
            idx = i;
            break;
          }
        }
        window.KakoiGame.botPickUpgrade(idx);
      });
      await page.waitForFunction(() => window.KakoiGame.getState().mode === 'playing');
      continue;
    }
    if (s.mode !== 'playing') break;

    if (s.daySales < s.rent) {
      await page.evaluate((side) => window.KakoiGame.botEncloseCorner(side), ['bl', 'br', 'tl', 'tr'][wave % 4]);
      await new Promise((r) => setTimeout(r, 60));
    } else {
      await page.evaluate(() => {
        const st = window.KakoiGame.getState();
        st.dayTimeLeft = 0.05;
      });
      await new Promise((r) => setTimeout(r, 150));
    }
    if (s.day >= 6 && s.daySales >= s.rent) {
      // push into day 6+ then maybe fail for gameover shot
    }
    if (wave > 50 && s.day >= 5) {
      // force a losing day for gameover screen once we have depth
      await page.evaluate(() => {
        const st = window.KakoiGame.getState();
        if (st.mode === 'playing') {
          st.daySales = 0;
          st.dayTimeLeft = 0.05;
        }
      });
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const final = await page.evaluate(() => {
    const st = window.KakoiGame.getState();
    return {
      mode: st.mode,
      day: st.day,
      daySales: st.daySales,
      totalSales: st.totalSales,
      rent: st.rent,
      lives: st.lives,
      upgrades: { ...st.upgrades },
    };
  });
  if (final.mode === 'gameover') {
    await page.screenshot({ path: join(ART, '15-gameover.png') });
  } else {
    await page.screenshot({ path: join(ART, '15-final.png') });
  }

  await writeFile(join(ART, 'pointer-playtest.json'), JSON.stringify({ final, notes: notes.slice(-40) }, null, 2));
  console.log('POINTER_SUMMARY', JSON.stringify(final, null, 2));

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
