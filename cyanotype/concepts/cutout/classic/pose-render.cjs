// Render the cutout concept in any pose, for seam checks.
//
//   node concepts/cutout/classic/pose-render.cjs <out.png> [--pose action] [--time 0.4] [--scale 4]
//        [--bg #f4eee9] [--only name,name] [--ink #8a3324] [--frames 0,0.85,1.7] [--test '{"armF_up":25}']
//
// Draws the figure (feet at the bottom centre) on a flat background, one panel per frame/pose
// listed (comma separated --pose and/or --frames), side by side.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const out = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(__dirname, '..', '..', '..');
const engine = ['core.js', 'art.js', 'stage.js', 'figure.js']
  .map((f) => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
const concept = fs.readFileSync(path.join(root, 'concepts/cutout-classic.js'), 'utf8');
const cfg = {
  poses: opt('--pose', 'stand').split(','),
  frames: opt('--frames', opt('--time', '0.4')).split(',').map(Number),
  scale: parseFloat(opt('--scale', '4')),
  bg: opt('--bg', '#f4eee9'),
  only: opt('--only', ''),
  ink: opt('--ink', ''),
  test: opt('--test', ''), // JSON merged over stand as pose 'test', e.g. '{"armF_up":25}'
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setContent('<!doctype html><body></body>');
  await page.addScriptTag({ content: engine });
  await page.addScriptTag({ content: concept });
  const url = await page.evaluate(async (cfg) => {
    const C = window.CONCEPT;
    await C.ready;
    const S = cfg.scale, H = C.height;
    const pw = Math.round(H * S * 1.25), ph = Math.round(H * S * 1.2);
    const panels = [];
    for (const p of cfg.poses) for (const t of cfg.frames) panels.push([p, t]);
    const cv = document.createElement('canvas');
    cv.width = pw * panels.length; cv.height = ph;
    const g = cv.getContext('2d');
    g.fillStyle = cfg.bg; g.fillRect(0, 0, cv.width, cv.height);
    if (cfg.only) C.only = cfg.only.split(',');
    if (cfg.test) C.poses.test = Object.assign({}, C.poses.stand, JSON.parse(cfg.test));
    panels.forEach(([pose, t], i) => {
      g.save();
      g.translate(pw * i + pw * 0.5, ph - 24);
      g.scale(S, S);
      C.draw(g, pose, { ink: cfg.ink || INK.blue, time: t });
      g.restore();
      g.fillStyle = '#000'; g.font = '14px sans-serif';
      g.fillText(pose + ' t=' + t, pw * i + 8, 18);
    });
    return cv.toDataURL('image/png');
  }, cfg);
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  await browser.close();
  console.log(JSON.stringify({ errors }));
})();
