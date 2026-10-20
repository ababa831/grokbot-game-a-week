/**
 * Headless Chrome playtest: title → several days of corner cuts → tune report.
 * Usage: node playtest.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 8765;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
      let path = url.pathname === '/' ? '/index.html' : url.pathname;
      try {
        const body = await readFile(join(__dirname, path));
        res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('missing');
      }
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  // Prefer puppeteer-core if available; otherwise install locally for this run.
  let puppeteer;
  try {
    puppeteer = await import('puppeteer-core');
  } catch {
    console.log('Installing puppeteer-core…');
    await new Promise((resolve, reject) => {
      const p = spawn('npm', ['install', '--no-save', 'puppeteer-core@23'], {
        cwd: __dirname,
        stdio: 'inherit',
      });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('npm install failed'))));
    });
    puppeteer = await import('puppeteer-core');
  }

  const server = await startServer();
  const browser = await puppeteer.default.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=900,800'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 800 });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle0' });

  // Title → start
  await page.waitForFunction(() => window.KakoiGame && window.KakoiGame.getState().mode === 'title');
  await page.click('#game');
  await page.waitForFunction(() => window.KakoiGame.getState().mode === 'playing');

  const artifactsDir = '/opt/cursor/artifacts/kakoi-shoten';
  mkdirSync(artifactsDir, { recursive: true });
  await page.screenshot({ path: join(artifactsDir, '01-day1-open.png') });

  const log = [];
  const sides = ['bl', 'br', 'tl', 'tr'];

  for (let dayTarget = 1; dayTarget <= 5; dayTarget++) {
    // keep cutting until day ends or game over
    let cuts = 0;
    while (true) {
      const snap = await page.evaluate(() => {
        const s = window.KakoiGame.getState();
        return {
          mode: s.mode,
          day: s.day,
          daySales: s.daySales,
          rent: s.rent,
          time: s.dayTimeLeft,
          lives: s.lives,
          customers: s.customers.filter((c) => c.alive).length,
        };
      });
      log.push({ ...snap, cuts });
      if (snap.mode === 'gameover') break;
      if (snap.mode === 'upgrade') {
        await page.screenshot({
          path: join(artifactsDir, `0${dayTarget + 1}-upgrade-day${snap.day}.png`),
        });
        await page.evaluate(() => window.KakoiGame.botPickUpgrade(0));
        await page.waitForFunction(() => window.KakoiGame.getState().mode === 'playing');
        continue;
      }
      if (snap.mode !== 'playing') break;

      // Prefer short cuts when sales near rent (push-your-luck less); otherwise keep cutting
      const side = sides[cuts % sides.length];
      await page.evaluate((s) => window.KakoiGame.botEncloseCorner(s), side);
      cuts++;
      // allow effects
      await new Promise((r) => setTimeout(r, 80));

      // advance time artificially if too slow: jump day clock near end after enough sales
      await page.evaluate(() => {
        const s = window.KakoiGame.getState();
        if (s.mode === 'playing' && s.daySales >= s.rent && s.dayTimeLeft > 1) {
          s.dayTimeLeft = 0.05;
        }
      });
      await new Promise((r) => setTimeout(r, 120));

      if (cuts > 40) break;
    }

    const after = await page.evaluate(() => {
      const s = window.KakoiGame.getState();
      return { mode: s.mode, day: s.day, totalSales: s.totalSales, lives: s.lives };
    });
    if (after.mode === 'gameover') {
      await page.screenshot({ path: join(artifactsDir, '99-gameover.png') });
      break;
    }
  }

  await page.screenshot({ path: join(artifactsDir, 'final.png') });

  const summary = await page.evaluate(() => {
    const s = window.KakoiGame.getState();
    return {
      mode: s.mode,
      day: s.day,
      daySales: s.daySales,
      totalSales: s.totalSales,
      rent: s.rent,
      lives: s.lives,
      upgrades: { ...s.upgrades },
      bestDays: s.bestDays,
      bestSales: s.bestSales,
    };
  });

  writeFileSync(join(artifactsDir, 'playtest-log.json'), JSON.stringify({ summary, log }, null, 2));
  console.log('PLAYTEST_SUMMARY', JSON.stringify(summary, null, 2));
  console.log('Artifacts:', artifactsDir);

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
