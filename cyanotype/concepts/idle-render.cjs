// Render one character concept's idle pose next to a reference image.
//
// Usage: node tools/idle-render.cjs <concepts/file.js> <out.png> [--ref ref.png] [--time t]
//
// The concept file is a classic script that may use everything in src/core.js,
// src/art.js, src/stage.js and src/figure.js, and must set:
//   window.CONCEPT = {
//     name, tagline,
//     height: 182,                    // feet-to-top height in world px at game scale
//     print: { paper: '#rrggbb', ink: '#rrggbb', grain: 0..1 },  // the sheet's paper and ink
//     draw(g, pose, opts) { ... }     // feet at (0,0), facing +x, y down, game scale.
//                                     // pose: 'stand' (idle). opts: { ink, time }
//                                     // opts.ink === INK.blue means "your own ink";
//                                     // any other ink (INK.sanguine = player 2) must be honoured.
//   };
// Sheet (2000 x 1720):
//   left   the idle pose large (scaled so the figure is about 1000 px tall)
//   right  the reference image at the same height, for side-by-side comparison
//   bottom game scale on the altar, recoloured to the concept's print:
//          P1 idle, P2 idle (player-2 ink, mirrored), and a 2x close-up of P1
// Also writes <out>-zoom.png: the idle pose alone at 4x on paper, for detail checks.
// Prints JSON { errors } and exits 1 on any error.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const conceptFile = args[0], outPng = args[1];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (!conceptFile || !outPng) {
  console.error('usage: node tools/idle-render.cjs <concept.js> <out.png> [--ref ref.png] [--time t]');
  process.exit(2);
}
const refPath = opt('--ref', null);
const time = parseFloat(opt('--time', '0.4'));
const root = path.resolve(__dirname, '..');
const engine = ['core.js', 'art.js', 'stage.js', 'figure.js']
  .map((f) => fs.readFileSync(path.join(root, 'src', f), 'utf8'))
  .join('\n');
const concept = fs.readFileSync(path.resolve(conceptFile), 'utf8');
const refData = refPath ? 'data:image/png;base64,' + fs.readFileSync(path.resolve(refPath)).toString('base64') : null;

const runner = `
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function reprint(g, x, y, w, h, P) {
  // map the engine's navy-on-grey drawing to the concept's paper and ink
  const img = g.getImageData(x, y, w, h), D = img.data;
  const pc = hexRGB(P.paper), ic = hexRGB(P.ink);
  const Lp = 231, Ld = 40, gr = P.grain || 0;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let j = 0; j < D.length; j += 4) {
    const lum = 0.3 * D[j] + 0.59 * D[j + 1] + 0.11 * D[j + 2];
    let d = Math.max(0, Math.min(1, (Lp - lum) / (Lp - Ld)));
    if (gr) d = Math.max(0, Math.min(1, d + (rnd() - 0.5) * gr * 0.6 * Math.sqrt(d * (1 - d) + 0.02)));
    for (let k = 0; k < 3; k++) D[j + k] = pc[k] + (ic[k] - pc[k]) * d;
  }
  g.putImageData(img, x, y);
}
window.__sheet = async (refData, time) => {
  const C = window.CONCEPT;
  const P = C.print || { paper: PAPER, ink: INK.blue };
  const W = 2000, H = 1720;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // altar strip, reprinted in the concept's colours
  const altar = renderAltar(STAGES_FOR_SHEET, 1.5);
  const AX = 120, AY = 1330, AW = 820, AH = 290;
  g.drawImage(altar, AX, AY, AW, AH);
  reprint(g, 0, 0, W, H, P);
  const deep = P.ink;
  g.fillStyle = deep;
  g.font = 'bold 30px Georgia, serif';
  g.fillText(C.name || 'Concept', 30, 46);
  g.font = 'italic 18px Georgia, serif';
  g.fillText(C.tagline || '', 30, 74);
  // large idle
  const hgt = C.height || 182;
  const Z = 860 / hgt;
  const gy = 1000;
  g.save();
  g.translate(470, gy);
  g.scale(Z, Z);
  C.draw(g, 'stand', { ink: INK.blue, time });
  g.restore();
  g.font = '16px Georgia, serif';
  g.fillText('idle, ' + Z.toFixed(2) + 'x', 40, gy + 30);
  // reference
  if (refData) {
    const im = new Image();
    await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = refData; });
    const rh = 960, rw = im.width * rh / im.height;
    const rx = Math.min(1960 - rw, 1000);
    g.drawImage(im, rx, 70, rw, rh);
    g.fillText('reference', rx, gy + 30);
  }
  // game scale: P1, P2 mirrored in player-2 ink, then a 2x close-up of P1
  const top = AY + 42 * (AH / 290) / 1; // walkway top in sheet px (stage solid t=452 -> 42 px below art top)
  const put = (x, ink, flip, s, t) => {
    g.save();
    g.translate(x, top);
    g.scale(flip ? -s : s, s);
    C.draw(g, 'stand', { ink, time: t });
    g.restore();
  };
  put(AX + 260, INK.blue, false, 1, time);
  put(AX + 560, INK.sanguine, true, 1, time + 0.37);
  g.fillText('game scale on the altar (P1 idle, P2 idle)', 40, 1700);
  g.save();
  g.translate(1500, 1660);
  g.scale(2, 2);
  C.draw(g, 'stand', { ink: INK.blue, time });
  g.restore();
  g.fillText('2x game scale', 1250, 1700);
  // zoom sheet
  const zc = document.createElement('canvas');
  const ZZ = 4;
  zc.width = Math.round(hgt * ZZ * 0.95); zc.height = Math.round(hgt * ZZ * 1.12);
  const z = zc.getContext('2d');
  z.fillStyle = P.paper; z.fillRect(0, 0, zc.width, zc.height);
  z.save();
  z.translate(zc.width * 0.45, zc.height - 30);
  z.scale(ZZ, ZZ);
  C.draw(z, 'stand', { ink: INK.blue, time });
  z.restore();
  return [cv.toDataURL('image/png'), zc.toDataURL('image/png')];
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
  let urls = null;
  if (!errors.length) {
    try {
      urls = await page.evaluate(([r, t]) => window.__sheet(r, t), [refData, time]);
    } catch (e) {
      errors.push('render: ' + e.message);
    }
  }
  if (urls) {
    fs.writeFileSync(outPng, Buffer.from(urls[0].split(',')[1], 'base64'));
    fs.writeFileSync(outPng.replace(/\.png$/, '') + '-zoom.png', Buffer.from(urls[1].split(',')[1], 'base64'));
  }
  await browser.close();
  console.log(JSON.stringify({ errors }));
  process.exit(errors.length ? 1 : 0);
})();
