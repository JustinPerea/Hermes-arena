// Render a character design concept to a review sheet.
//
// Usage: node tools/concept-render.cjs <concepts/file.js> <out.png> [--game out-game.png]
//
// The concept file is a classic script that may use everything in src/core.js,
// src/art.js, src/figure.js and src/stage.js, and must set:
//   window.CONCEPT = {
//     name: 'Short name', tagline: 'one line',
//     height: 180,                      // figure height in px at game scale
//     draw(g, pose, opts) { ... }       // draw with the feet point at (0, 0), facing +x,
//                                       // y down, at game scale (1 unit = 1 world px).
//                                       // pose: 'stand' | 'action' | 'run'
//                                       // opts: { ink, time }
//   };
// Sheet: three large poses at 2.4x zoom on parchment, then a game-scale strip
// where blue (P1) and red (P2) copies stand on the real altar, so readability at
// play size can be judged. Prints JSON { errors } and exits 1 on any error.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [conceptFile, outPng] = process.argv.slice(2);
if (!conceptFile || !outPng) {
  console.error('usage: node tools/concept-render.cjs <concept.js> <out.png>');
  process.exit(2);
}
const root = path.resolve(__dirname, '..');
const engine = ['core.js', 'art.js', 'stage.js', 'figure.js']
  .map((f) => fs.readFileSync(path.join(root, 'src', f), 'utf8'))
  .join('\n');
const concept = fs.readFileSync(path.resolve(conceptFile), 'utf8');

const runner = `
window.__sheet = () => {
  const C = window.CONCEPT;
  const W = 1800, H = 1500;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // game-scale strip on the real altar: P1 standing, P1 action, P2 mirrored
  const altar = renderAltar(STAGES_FOR_SHEET, 1.5);
  const TX = 260, TY = 628;
  g.drawImage(altar, TX + 230, TY + 410, 820, 290);
  if (C.cyanotype) {
    // reprint the sheet and altar as a cyanotype: navy ink -> cyanotype blue
    // stipple, grey paper -> cream
    const img = g.getImageData(0, 0, W, H), D = img.data;
    const cream = [251, 248, 227], cy = [44, 105, 173], cyd = [23, 63, 120];
    const Lp = 231, Ld = 40;
    let seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let j = 0; j < D.length; j += 4) {
      const lum = 0.3 * D[j] + 0.59 * D[j + 1] + 0.11 * D[j + 2];
      const d = Math.max(0, Math.min(1, (Lp - lum) / (Lp - Ld)));
      const v = Math.max(0, Math.min(1, (d - (0.12 + 0.82 * rnd())) * 6 + 0.5));
      const deep = Math.max(0, Math.min(1, (d - 0.72) * 3.5));
      for (let k = 0; k < 3; k++) D[j + k] = cream[k] + ((cy[k] + (cyd[k] - cy[k]) * deep) - cream[k]) * v;
    }
    g.putImageData(img, 0, 0);
  }
  g.fillStyle = C.cyanotype ? '#173f78' : INK.blueDeep;
  g.font = 'bold 30px Georgia, serif';
  g.fillText(C.name || 'Concept', 30, 46);
  g.font = 'italic 18px Georgia, serif';
  g.fillText(C.tagline || '', 30, 74);
  const Z = 2.4;
  const poses = ['stand', 'action', 'run'];
  poses.forEach((p, i) => {
    const cx = 300 + i * 600, gy = 760;
    g.save();
    g.strokeStyle = 'rgba(29,59,145,0.3)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - 280, gy); g.lineTo(cx + 280, gy); g.stroke();
    g.translate(cx - 20, gy);
    g.scale(Z, Z);
    C.draw(g, p, { ink: INK.blue, time: 0.4 });
    g.restore();
    g.fillStyle = INK.blueDeep; g.font = '16px Georgia, serif';
    g.fillText(p, cx - 270, gy + 26);
  });
  const put = (x, pose, ink, flip, t) => {
    g.save();
    g.translate(TX + x, TY + 452);
    if (flip) g.scale(-1, 1);
    C.draw(g, pose, { ink, time: t });
    g.restore();
  };
  put(430, 'stand', INK.blue, false, 0.2);
  put(640, 'run', INK.blue, false, 0.3);
  put(850, 'action', INK.sanguine, true, 0.7);
  g.fillStyle = INK.blueDeep; g.font = '16px Georgia, serif';
  g.fillText('game scale on the altar (P1 stand, P1 run, P2 action)', 30, 1400);
  const stage = null;
  void stage;
  return cv.toDataURL('image/png');
};
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.setContent('<!doctype html><html><body></body></html>');
  const stageData = `const STAGES_FOR_SHEET = { art: { x0: 230, y0: 410, x1: 1050, y1: 700 }, solids: [{ l: 300, r: 980, t: 470, b: 600 }, { l: 300, r: 560, t: 452, b: 470 }, { l: 720, r: 980, t: 452, b: 470 }], plats: [] };`;
  await page.addScriptTag({ content: engine + '\n' + stageData + '\n' + runner }).catch((e) => errors.push('engine: ' + e.message));
  await page.addScriptTag({ content: concept + '\n//# sourceURL=' + path.basename(conceptFile) }).catch((e) => errors.push('concept: ' + e.message));
  let url = null;
  if (!errors.length) {
    try {
      url = await page.evaluate(() => window.__sheet());
    } catch (e) {
      errors.push('render: ' + e.message);
    }
  }
  if (url) fs.writeFileSync(outPng, Buffer.from(url.split(',')[1], 'base64'));
  await browser.close();
  console.log(JSON.stringify({ errors }));
  process.exit(errors.length ? 1 : 0);
})();
