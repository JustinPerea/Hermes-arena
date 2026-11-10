// Render animation sheets and lint animation definitions.
//
// Usage (run from the project root):
//   node tools/anim-sheet.cjs --out <dir> [--names a,b,c] [--group "Specials"]
//        [--frames 10] [--boxes] [--big name:frame,name:frame] [--zoom 2.5]
//        [--skin procedural|masked|classic] [--ink blue|sanguine|green|violet] [--face -1]
//
// --skin draws (and solves joints / hitboxes) with that skin from src/skins.js and
// src/skins/*.js (default procedural); the skin's images are awaited first.
// Lint also checks that the skin's draw returns { tip, top, J } with finite joints.
//
// For every selected animation it writes:
//   <out>/<name>.png       filmstrip of evenly spaced frames (plus every first
//                          active frame), frame number and phase under each
//   <out>/<name>-onion.png all frames overlaid faintly on one stage, so the
//                          arc of the motion is visible
//   <out>/big-<name>-<f>.png  zoomed single frames requested with --big
// and prints a lint report (exceptions, NaN pose channels, bad hitboxes,
// figure drifting out of frame) to stdout as JSON. Exit code 1 on lint errors.
//
// The engine is assembled from src/ in memory, so this never touches dist/.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  return v == null || v.startsWith('--') ? true : v;
};
const out = path.resolve(opt('out', 'sheets'));
fs.mkdirSync(out, { recursive: true });
const root = path.resolve(__dirname, '..');
const ORDER = ['core.js', 'art.js', 'figure.js', 'anim.js', 'skins.js'];
const animFiles = fs.existsSync(path.join(root, 'src/anims'))
  ? fs.readdirSync(path.join(root, 'src/anims')).filter((f) => f.endsWith('.js')).sort().map((f) => 'anims/' + f)
  : [];
const engine = ORDER.map((f) => `// ==== src/${f} ====\n` + fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
// each animation file loads in its own script tag, so one broken file does not hide the others
const animSources = animFiles.map((f) => [f, fs.readFileSync(path.join(root, 'src', f), 'utf8')]);
// skin modules load after the animations, each in its own tag too
const skinFiles = fs.existsSync(path.join(root, 'src/skins'))
  ? fs.readdirSync(path.join(root, 'src/skins')).filter((f) => f.endsWith('.js')).sort().map((f) => 'skins/' + f)
  : [];
const skinSources = skinFiles.map((f) => [f, fs.readFileSync(path.join(root, 'src', f), 'utf8')]);

const settings = {
  names: opt('names', '') ? String(opt('names')).split(',').filter(Boolean) : null,
  group: opt('group', null),
  nframes: Number(opt('frames', 10)),
  boxes: !!opt('boxes', false),
  big: opt('big', '') ? String(opt('big')).split(',').filter(Boolean) : [],
  zoom: Number(opt('zoom', 2.5)),
  skin: opt('skin', 'procedural'),
  ink: opt('ink', 'blue'),
  face: Number(opt('face', 1)) < 0 ? -1 : 1,
};

const runner = `
window.__render = (S) => {
  const ch = 'hermes';
  const book = ANIMS[ch] || {};
  const skin = S.skin;
  const ink = INK[S.ink] || INK.blue;
  const face = S.face;
  const lintSkin = {};
  if (!getSkin(skin, ch)) lintSkin.skin = ['unknown skin ' + skin + ' (have ' + skinList(ch).map((s) => s.id).join(', ') + ')'];
  else if (getSkin(skin, ch).failed) lintSkin.skin = ['skin ' + skin + ' failed to load its images'];
  let names = S.names || ANIM_ORDER[ch] || [];
  if (S.group) names = names.filter((n) => book[n] && book[n].group === S.group);
  const lint = Object.assign({}, lintSkin);
  const drawOpts = (o) => Object.assign({ skin, ink, face }, o);
  const images = {};
  const bounds = {};
  const CW = 250, CH = 290, GROUND = 250;
  const err = (n, m) => { (lint[n] = lint[n] || []).push(m); };
  const paper = (g, w, h) => {
    g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
  };
  for (const name of names) {
    const def = book[name];
    if (!def) { err(name, 'not defined'); continue; }
    if (!(def.frames > 0)) err(name, 'frames must be > 0');
    if (!ANIM_GROUPS.includes(def.group)) err(name, 'unknown group ' + def.group);
    // lint every frame
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let f = 0; f <= def.frames; f++) {
      try {
        const c = animContext(ch, def, f, { time: f / 60, skin });
        const p = animPose(def, f, c);
        for (const k in p) if (!Number.isFinite(p[k])) { err(name, 'frame ' + f + ': pose.' + k + ' = ' + p[k]); break; }
        for (const k in p) if (!(k in BASE_POSE)) { err(name, 'unknown pose channel ' + k); }
        const J = animJoints(ch, def, f, c);
        for (const k of ['hip', 'head', 'tip', 'footF', 'footB']) {
          minX = Math.min(minX, J[k][0]); maxX = Math.max(maxX, J[k][0]);
          minY = Math.min(minY, J[k][1]); maxY = Math.max(maxY, J[k][1]);
        }
        for (const b of liveHitboxes(def, f, J)) if (!Number.isFinite(b.x + b.y + b.r)) err(name, 'frame ' + f + ': hitbox NaN');
      } catch (e) { err(name, 'frame ' + f + ': ' + e.message); break; }
    }
    if (def.hit) for (const h of def.hit) {
      if (!h.f || h.f[0] > h.f[1] || h.f[1] > def.frames) err(name, 'hitbox frames out of range ' + JSON.stringify(h.f));
      if (typeof h.at === 'string' && !['hip','sh','head','top','center','handF','handB','elbowF','elbowB','footF','footB','kneeF','kneeB','tip','butt','mid','pivot'].includes(h.at)) err(name, 'unknown joint ' + h.at);
    }
    if (def.next && !book[def.next]) err(name, 'next animation missing: ' + def.next);
    lint[name] = lint[name] || [];
    // pick frames: evenly spaced + first active frame of each hitbox
    const N = Math.max(2, S.nframes);
    const set = new Set();
    for (let i = 0; i < N; i++) set.add(Math.round((i / (N - 1)) * (def.loop ? def.frames - 1 : def.frames)));
    if (def.hit) for (const h of def.hit) set.add(h.f[0]);
    if (def.charge) set.add(def.charge.f);
    const frames = [...set].sort((a, b) => a - b).slice(0, 16);
    const cols = Math.min(frames.length, 8);
    const rows = Math.ceil(frames.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * CW; cv.height = rows * CH + 34;
    const g = cv.getContext('2d');
    paper(g, cv.width, cv.height);
    g.fillStyle = INK.blueDeep; g.font = 'bold 16px Georgia, serif';
    g.fillText(name + ' — ' + def.label + ' · ' + def.frames + 'f' + (def.loop ? ' loop' : '') + ' · ' + def.group + (skin !== 'procedural' ? ' · skin ' + skin : ''), 10, 22);
    frames.forEach((f, i) => {
      const cx = (i % cols) * CW, cy = 34 + Math.floor(i / cols) * CH;
      g.save();
      g.beginPath(); g.rect(cx, cy, CW, CH); g.clip();
      g.strokeStyle = 'rgba(29,59,145,0.25)'; g.lineWidth = 1;
      g.strokeRect(cx + 0.5, cy + 0.5, CW - 1, CH - 1);
      g.beginPath(); g.moveTo(cx, cy + GROUND); g.lineTo(cx + CW, cy + GROUND); g.stroke();
      const ledge = def.group === 'Ledge';
      if (ledge) { g.fillStyle = 'rgba(29,59,145,0.18)'; g.fillRect(cx + CW * 0.55, cy + GROUND * 0.62, CW, CH); g.strokeStyle = INK.blueDeep; g.lineWidth = 2; g.strokeRect(cx + CW * 0.55, cy + GROUND * 0.62, CW, CH); }
      try {
        const r = drawAnimFrame(g, ch, def, f, ledge ? cx + CW * 0.55 : cx + CW * 0.45, ledge ? cy + GROUND * 0.62 : cy + GROUND, drawOpts({ time: f / 60, boxes: S.boxes, charge: def.charge ? 0.6 : 0 }));
        const o = r && r.out;
        if (!o || !o.J || !o.tip || !o.top || !Number.isFinite(o.tip[0] + o.tip[1] + o.top[0] + o.top[1])) err(name, 'draw frame ' + f + ': skin draw must return { tip, top, J }');
        else for (const k of ['hip', 'head', 'handF', 'footF', 'tip']) if (!o.J[k] || !Number.isFinite(o.J[k][0] + o.J[k][1])) { err(name, 'draw frame ' + f + ': J.' + k + ' not finite'); break; }
      } catch (e) { err(name, 'draw frame ' + f + ': ' + e.message); }
      g.restore();
      const ph = animPhase(def, f);
      g.fillStyle = ph === 'active' ? '#a0281c' : INK.blueDeep;
      g.font = '13px Georgia, serif';
      g.fillText('f' + f + '  ' + ph + (def.charge && f === def.charge.f ? ' (charge)' : ''), cx + 8, cy + CH - 12);
    });
    images[name] = cv.toDataURL('image/png');
    // onion: all frames faint, key frames darker
    const ow = 640, oh = 420, og = 330;
    const oc = document.createElement('canvas');
    oc.width = ow; oc.height = oh;
    const o = oc.getContext('2d');
    paper(o, ow, oh);
    o.strokeStyle = 'rgba(29,59,145,0.35)';
    o.beginPath(); o.moveTo(0, og); o.lineTo(ow, og); o.stroke();
    const step = Math.max(1, Math.round(def.frames / 14));
    for (let f = 0; f <= def.frames; f += step) {
      try { drawAnimFrame(o, ch, def, f, ow * 0.45, og, drawOpts({ time: f / 60, alpha: 0.18 + 0.5 * (f / def.frames) * 0 + 0.12, charge: 0.6 })); } catch (e) {}
    }
    o.fillStyle = INK.blueDeep; o.font = 'bold 15px Georgia, serif';
    o.fillText(name + ' onion (every ' + step + 'f)', 10, 22);
    images[name + '-onion'] = oc.toDataURL('image/png');
    bounds[name] = { minX: Math.round(minX), maxX: Math.round(maxX), minY: Math.round(minY), maxY: Math.round(maxY) };
  }
  for (const spec of S.big) {
    const [name, fs] = spec.split(':');
    const def = book[name];
    if (!def) continue;
    const f = Number(fs);
    const z = S.zoom;
    const W = 720, H = 720;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    paper(g, W, H);
    g.save();
    g.translate(W / 2, H * 0.78);
    g.scale(z, z);
    g.strokeStyle = 'rgba(29,59,145,0.35)'; g.lineWidth = 1 / z;
    g.beginPath(); g.moveTo(-W, 0); g.lineTo(W, 0); g.stroke();
    try { drawAnimFrame(g, ch, def, f, -10, 0, drawOpts({ time: f / 60, boxes: S.boxes, charge: 0.6 })); } catch (e) { err(name, 'big ' + f + ': ' + e.message); }
    g.restore();
    g.fillStyle = INK.blueDeep; g.font = 'bold 16px Georgia, serif';
    g.fillText(name + ' f' + f, 10, 22);
    images['big-' + name + '-' + f] = cv.toDataURL('image/png');
  }
  return { lint, images, names, bounds };
};
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.setContent('<!doctype html><html><body></body></html>');
  // top-level const/let in classic scripts share one global lexical scope across tags
  await page.addScriptTag({ content: engine + '\n' + runner }).catch((e) => errors.push('engine: ' + e.message));
  for (const [f, src] of animSources) {
    const before = errors.length;
    await page.addScriptTag({ content: src + `\n//# sourceURL=src/${f}` }).catch((e) => errors.push('src/' + f + ': ' + e.message));
    for (let i = before; i < errors.length; i++) if (!errors[i].includes('src/')) errors[i] = 'while loading src/' + f + ': ' + errors[i];
  }
  for (const [f, src] of skinSources) {
    const before = errors.length;
    await page.addScriptTag({ content: src + `\n//# sourceURL=src/${f}` }).catch((e) => errors.push('src/' + f + ': ' + e.message));
    for (let i = before; i < errors.length; i++) if (!errors[i].includes('src/')) errors[i] = 'while loading src/' + f + ': ' + errors[i];
  }
  // wait for the skin's images (decode + per-ink prints)
  if (!errors.length) {
    await page.evaluate((id) => Promise.race([skinsReady(SKINS[id] ? [id] : []), new Promise((r) => setTimeout(r, 20000))]), settings.skin).catch((e) => errors.push('skin ready: ' + e.message));
  }
  let res = { lint: {}, images: {}, names: [], bounds: {} };
  if (!errors.length) {
    try {
      res = await page.evaluate((S) => window.__render(S), settings);
    } catch (e) {
      errors.push('render: ' + e.message);
    }
  }
  for (const [k, url] of Object.entries(res.images)) {
    fs.writeFileSync(path.join(out, k + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close();
  const bad = Object.entries(res.lint).filter(([, v]) => v.length);
  console.log(JSON.stringify({ rendered: res.names, errors, lint: res.lint, bounds: res.bounds }));
  process.exit(errors.length || bad.length ? 1 : 0);
})();
