// Usage: node tools/shoot.cjs <outdir>  — screenshots + scripted input + error check
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || 'shots';
  require('fs').mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve('dist/web/index.html') + '?debug');
  await page.waitForTimeout(800);
  await page.mouse.click(640, 360);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/01-idle.png` });
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  // run right
  await page.keyboard.down('KeyD'); await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/02-run.png` });
  await page.waitForTimeout(300); await page.keyboard.up('KeyD');
  // jump
  await page.keyboard.press('Space'); await page.waitForTimeout(220);
  await page.screenshot({ path: `${out}/03-jump.png` });
  await page.keyboard.press('Space'); await page.waitForTimeout(120);
  await page.screenshot({ path: `${out}/04-flip.png` });
  await page.waitForTimeout(900);
  await page.keyboard.press('KeyJ'); await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/05-swing.png` });
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyK'); await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/06-taunt.png` });
  // walk off left edge to test falling / respawn
  await hold('KeyA', 2600);
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => window.__arena._game.debugState);
  await page.screenshot({ path: `${out}/07-after-fall.png` });
  // zoomed close-up
  await page.evaluate(() => { const g = window.__arena._game; g.cam.zoom = 2.2; g.updateCamera = () => { g.cam.x = g.fighters[0].x; g.cam.y = g.fighters[0].y - 50; }; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/08-closeup.png` });
  console.log(JSON.stringify(st));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
