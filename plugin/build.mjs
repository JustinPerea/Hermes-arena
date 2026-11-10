// Builds the Hermes Desktop plugin from the pixel game.
//
//   node plugin/build.mjs            writes plugin/dist/hermes-arena/plugin.js and plugin/dist/mount-test.html
//   node plugin/build.mjs --full     keeps the page header, animation sheet and design notes (default: play layout)
//   node plugin/build.mjs --html f   builds from another copy of the game
//
// The game file is not changed. Its one <script> is wrapped in a function whose
// `document`, `addEventListener`, `requestAnimationFrame`, `localStorage` and `location`
// are local stand-ins, so the game runs inside a Shadow DOM and can be removed again:
// a plugin page is mounted and unmounted many times, and an ES module cannot be unloaded.
// How the pieces fit, and what the checks in test.cjs cover, is in plugin/README.md.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const FULL = args.includes('--full');
const SRC = resolve(opt('html', join(HERE, '../game/pixel-hermes.html')));
const OUT = resolve(opt('out', join(HERE, 'dist')));

const fail = msg => { console.error('plugin build: ' + msg); process.exit(1); };
const once = (text, needle, what) => {
  const n = text.split(needle).length - 1;
  if (n !== 1) fail(`expected exactly one ${what} in the game file, found ${n}`);
  return text.indexOf(needle);
};

// ---- split the game file ------------------------------------------------------
const html = readFileSync(SRC, 'utf8');
const styleAt = once(html, '<style>', '<style>'), styleEnd = once(html, '</style>', '</style>');
const scriptAt = once(html, '<script>', '<script>'), scriptEnd = once(html, '</script>', '</script>');
if (!(styleAt < styleEnd && styleEnd < scriptAt && scriptAt < scriptEnd)) fail('unexpected order of <style> and <script>');
const head = html.slice(0, styleAt);
let css = html.slice(styleAt + 7, styleEnd);
const markup = html.slice(styleEnd + 8, scriptAt).trim();
const script = html.slice(scriptAt + 8, scriptEnd);
// The game file carries no version; the feel-lab log's newest heading does ("## v31 (date) ...").
const LOG = join(HERE, '../feel-lab/LOG.md');
const version = existsSync(LOG) ? 'v' + Math.max(0, ...[...readFileSync(LOG, 'utf8').matchAll(/^## v(\d+)\b/gm)].map(m => +m[1])) : 'dev';

const fontHref = (head.match(/<link href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)" rel="stylesheet">/) || [])[1];
if (!fontHref) fail('font stylesheet link not found in the game file');

// ---- CSS: page selectors become shadow-tree selectors --------------------------
const swap = (from, to) => { once(css, from, 'CSS rule "' + from.trim() + '"'); css = css.replace(from, to); };
swap(':root{', ':host{');
swap('\nhtml,body{', '\n.pxh-page{');
swap('\nbody{', '\n.pxh-page{');
const stray = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/(^|[},])\s*(html|body|:root)\s*[,{.:#\[ >]/);
if (stray) fail('the game CSS has a page-level selector the build does not map: ' + stray[0].trim());

// Plugin layout. The stage is sized to fit the pane (width and height), the page scrolls for the rest.
css += `
/* ---- added by plugin/build.mjs ---- */
/* all:initial stops the app's inherited text styles (spacing, case, weight, line height) at the door; custom properties are not affected */
:host{all:initial;display:block;width:100%;height:100%;overflow:auto;container-type:size;background:var(--paper);color:var(--ink);color-scheme:light}
.pxh-page{box-sizing:border-box;min-height:100%;padding-block:20px 40px}
.wrap{max-width:1200px}
.stage-frame{position:relative;box-sizing:border-box;align-self:center;width:min(100%,calc((100cqh - 52px)*416/234));min-width:min(100%,416px)}
#stage:focus-visible{outline:none}
.pxh-idle .stage-frame::after{content:'Click to play';position:absolute;left:50%;top:8px;transform:translateX(-50%);
  font-family:var(--label);font-size:12px;line-height:1;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;
  padding:7px 10px;background:var(--paper);color:var(--ink);border:2px solid var(--ink);box-shadow:3px 3px 0 var(--ink);pointer-events:none}
`;
if (!FULL) css += `.pxh-page header,.pxh-page section[aria-label="Animation sheet"],.pxh-page section[aria-label="Design notes"]{display:none}
`;
for (const sel of ['header', 'section aria-label="Animation sheet"', 'section aria-label="Design notes"', 'id="stageFrame"', 'id="stage"', 'id="playBtn"'])
  if (!markup.includes('<' + sel) && !markup.includes(sel)) fail('markup the plugin layout relies on is missing: ' + sel);

// ---- script: names the wrapper reaches for must exist ---------------------------
for (const [re, what] of [[/\bconst SFX=\{/, 'const SFX'], [/\bconst flow=\{/, 'const flow'], [/\bfunction go\(s\)/, 'function go(s)'], [/flow\.s==='pause'|s==='pause'/, "the 'pause' screen"]])
  if (!re.test(script)) fail('the game script no longer has ' + what + ' (the plugin pauses the match through it)');
// Every browser global the game uses must be one the wrapper provides or passes through on purpose.
const KNOWN_DOC = new Set(['getElementById', 'querySelectorAll', 'querySelector', 'createElement']);
for (const m of script.matchAll(/\bdocument\.([A-Za-z]+)/g)) if (!KNOWN_DOC.has(m[1])) fail('the game uses document.' + m[1] + ', which the plugin wrapper does not provide');
const KNOWN_WIN = new Set(['devicePixelRatio', 'AudioContext', 'webkitAudioContext']);
for (const m of script.matchAll(/\bwindow\.([A-Za-z]+)/g)) if (!KNOWN_WIN.has(m[1])) fail('the game uses window.' + m[1] + ', which the plugin wrapper has not been checked against');
for (const name of ['setTimeout', 'setInterval', 'cancelAnimationFrame', 'removeEventListener', 'sessionStorage', 'history.', 'fetch(', 'import(', 'new Worker'])
  if (script.includes(name)) fail('the game uses ' + name + ', which the plugin wrapper does not clean up or provide');
const KNOWN_EVENTS = new Set(['resize', 'keydown', 'keyup', 'pointerdown', 'pointerup', 'blur', 'gamepadconnected', 'gamepaddisconnected']);
for (const m of script.matchAll(/(^|[\s;{(])addEventListener\('([a-z]+)'/g)) if (!KNOWN_EVENTS.has(m[2])) fail('the game listens for window "' + m[2] + '", which the plugin wrapper does not route');

// ---- the wrapper ------------------------------------------------------------------
// Plain script text (no imports): the plugin embeds it, and the mount test page loads it as a classic script.
const engine = `const PXH_VERSION = ${JSON.stringify(version)};
const PXH_FONTS = ${JSON.stringify(fontHref)};
const PXH_CSS = ${JSON.stringify(css)};
const PXH_HTML = ${JSON.stringify(markup)};
const PXH_PLAY_LAYOUT = ${JSON.stringify(!FULL)};
const PXH_LIVE = new Set();

function pxhGame(document, addEventListener, requestAnimationFrame, localStorage, location) {
${script}
  return { audio: () => SFX.ctx, pause() { if (flow.s === 'play') go('pause'); }, state: () => flow.s };
}

// Mount the game in \`host\` (any element with a size). Returns { destroy(), pause(), state() }.
// env.storage: the plugin's ctx.storage (get/set/remove); without it, settings last until the page unmounts.
function createPixelArena(host, env) {
  env = env || {};
  const D = host.ownerDocument, W = D.defaultView;
  const mount = D.createElement('div');
  mount.className = 'pxh-mount';
  host.appendChild(mount);
  const root = mount.attachShadow({ mode: 'open' });
  const style = D.createElement('style');
  style.textContent = PXH_CSS;
  const page = D.createElement('div');
  page.className = 'pxh-page pxh-idle';
  page.innerHTML = PXH_HTML;
  root.append(style, page);

  // Web fonts only register from the document, not from inside a shadow tree.
  let fonts = D.getElementById('pxh-fonts');
  if (!fonts) {
    fonts = D.createElement('link');
    fonts.id = 'pxh-fonts'; fonts.rel = 'stylesheet'; fonts.href = PXH_FONTS;
    D.head.appendChild(fonts);
  }

  let dead = false;
  const undo = [];
  const listen = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); undo.push(() => target.removeEventListener(type, fn, opts)); };
  const fns = { keydown: [], keyup: [], blur: [], resize: [] };

  const doc = {
    getElementById: id => root.getElementById(id),
    querySelector: sel => root.querySelector(sel),
    querySelectorAll: sel => root.querySelectorAll(sel),
    createElement: tag => D.createElement(tag),
  };
  // The game's window-level listeners. Keys are heard only while focus is inside the game.
  const on = (type, fn) => {
    if (fns[type]) fns[type].push(fn);
    else if (type === 'pointerdown') listen(page, type, fn);
    else listen(W, type, fn);
  };
  const raf = fn => W.requestAnimationFrame(t => { if (!dead) fn(t); });
  const mem = new Map();
  const store = {
    getItem(k) {
      if (env.storage) { const v = env.storage.get(k, null); return v == null ? null : typeof v === 'string' ? v : JSON.stringify(v); }
      return mem.has(k) ? mem.get(k) : null;
    },
    setItem(k, v) { if (env.storage) env.storage.set(k, String(v)); else mem.set(k, String(v)); },
    removeItem(k) { if (env.storage) env.storage.remove(k); else mem.delete(k); },
  };

  let game;
  try { game = pxhGame(doc, on, raf, store, { search: env.search || '' }); }
  catch (err) { mount.remove(); throw err; }

  const stage = root.getElementById('stage');
  const release = () => { for (const fn of fns.blur) fn(); };
  const held = new Set();
  listen(page, 'keydown', e => {
    // Leave shortcuts to the host app. macOS sends no keyup for keys let go while Cmd is down, so drop them all.
    if (e.metaKey || e.ctrlKey || e.altKey) { release(); return; }
    for (const fn of fns.keydown) fn(e);
    if (e.defaultPrevented) { held.add(e.code); e.stopPropagation(); }
  });
  listen(page, 'keyup', e => {
    for (const fn of fns.keyup) fn(e);
    if (held.delete(e.code)) e.stopPropagation();
  });
  const idle = () => { release(); held.clear(); game.pause(); page.classList.add('pxh-idle'); };
  listen(page, 'focusin', () => page.classList.remove('pxh-idle'));
  listen(page, 'focusout', e => { if (!e.relatedTarget || !page.contains(e.relatedTarget)) idle(); });
  listen(W, 'blur', idle);
  listen(W, 'focus', () => { if (root.activeElement) page.classList.remove('pxh-idle'); });
  // A click on plain text would move focus to the document and the keys would go dead.
  listen(page, 'click', () => { if (!root.activeElement) stage.focus({ preventScroll: true }); });
  listen(W, 'resize', () => { for (const fn of fns.resize) fn(); });
  let ro = null;
  if (W.ResizeObserver) { ro = new W.ResizeObserver(() => { if (!dead) for (const fn of fns.resize) fn(); }); ro.observe(mount); ro.observe(root.getElementById('stageFrame')); }

  // Play layout: the animation sheet is hidden, so stop redrawing its tiles.
  if (PXH_PLAY_LAYOUT) root.getElementById('playBtn').click();
  if (env.autofocus !== false) W.setTimeout(() => { if (!dead) stage.focus({ preventScroll: true }); }, 0);

  const arena = {
    version: PXH_VERSION, root,
    pause: () => game.pause(),
    state: () => game.state(),
    destroy() {
      if (dead) return;
      dead = true;
      PXH_LIVE.delete(arena);
      for (const f of undo) f();
      if (ro) ro.disconnect();
      const ac = game.audio();
      if (ac && ac.state !== 'closed') ac.close().catch(() => {});
      mount.remove();
      if (!PXH_LIVE.size && fonts.isConnected) fonts.remove();
    },
  };
  PXH_LIVE.add(arena);
  return arena;
}
`;

const banner = `// Hermes Arena (pixel game ${version}) for Hermes Desktop. Generated by plugin/build.mjs from game/pixel-hermes.html: do not edit.
`;

// ---- Hermes Desktop plugin --------------------------------------------------------
const plugin = `${banner}// Install: copy this folder to ~/.hermes/desktop-plugins/hermes-arena/ and reload desktop plugins.
import { useEffect, useRef } from 'react';
import { jsx } from 'react/jsx-runtime';

${engine}
let PLUGIN_STORAGE = null;

function ArenaPage() {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const arena = createPixelArena(ref.current, { storage: PLUGIN_STORAGE });
    return () => arena.destroy();
  }, []);
  return jsx('div', {
    style: { position: 'relative', flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0 },
    children: jsx('div', {
      ref,
      role: 'application',
      'aria-label': 'Hermes Arena game. Click to play, then use the keyboard.',
      style: { position: 'absolute', inset: 0, overflow: 'hidden', background: '#f7f3de' },
    }),
  });
}

export default {
  id: 'hermes-arena',
  name: 'Hermes Arena',
  register(ctx) {
    PLUGIN_STORAGE = ctx.storage || null;
    ctx.registerMany([
      { id: 'page', area: 'routes', data: { path: '/hermes-arena' }, render: () => jsx(ArenaPage, {}) },
      { id: 'nav', area: 'sidebar.nav', data: { path: '/hermes-arena', label: 'Hermes Arena', codicon: 'game' } },
    ]);
    // A reload evaluates a fresh copy of this module: take the old copy's games down with it.
    if (ctx.onDispose) ctx.onDispose(() => { for (const a of [...PXH_LIVE]) a.destroy(); });
  },
};
`;
mkdirSync(join(OUT, 'hermes-arena'), { recursive: true });
writeFileSync(join(OUT, 'hermes-arena/plugin.js'), plugin);

// ---- mount test page: a stand-in for the app shell (sidebar, a text box, a pane) ----
writeFileSync(join(OUT, 'engine.js'), banner + engine);
writeFileSync(join(OUT, 'mount-test.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hermes Arena plugin: mount test</title>
<style>
  html,body{height:100%;margin:0;font:14px system-ui,sans-serif;background:#1c1d22;color:#d8d9de}
  .shell{display:grid;grid-template-columns:220px 1fr;height:100%}
  .side{padding:14px;border-right:1px solid #33353d;display:flex;flex-direction:column;gap:10px}
  .side button,.side textarea{font:inherit}
  .side textarea{height:70px;background:#26272e;color:inherit;border:1px solid #444}
  .main{position:relative;min-width:0;min-height:0}
  /* text styles an app might set on its panes: none of these may show inside the game */
  #pane{position:absolute;inset:0;overflow:hidden;letter-spacing:.3em;text-transform:uppercase;font-style:italic;font-weight:900;line-height:3;text-align:right;word-spacing:1em}
  canvas{outline:9px solid red} kbd{font-size:40px} section{display:none}
</style></head>
<body>
<div class="shell">
  <div class="side">
    <b>Host stand-in</b>
    <button id="mountBtn">Mount</button>
    <button id="unmountBtn">Unmount</button>
    <textarea id="chat" placeholder="A text box outside the game"></textarea>
    <span id="hostKeys">host keydowns: 0</span>
  </div>
  <div class="main"><div id="pane"></div></div>
</div>
<script src="engine.js"></script>
<script>
  // A minimal ctx.storage, so the test can see what the game saves.
  const saved = new Map();
  const storage = { get: (k, d) => saved.has(k) ? saved.get(k) : d, set: (k, v) => saved.set(k, v), remove: k => saved.delete(k) };
  let arena = null, hostKeys = 0;
  const mountArena = () => { if (!arena) arena = createPixelArena(document.getElementById('pane'), { storage }); return arena; };
  const unmountArena = () => { if (arena) { arena.destroy(); arena = null; } };
  document.getElementById('mountBtn').onclick = mountArena;
  document.getElementById('unmountBtn').onclick = unmountArena;
  addEventListener('keydown', () => { hostKeys++; document.getElementById('hostKeys').textContent = 'host keydowns: ' + hostKeys; });
  if (!new URLSearchParams(location.search).has('nomount')) mountArena();
</script>
</body></html>
`);

console.log(`built plugin/dist/hermes-arena/plugin.js (${(plugin.length / 1024).toFixed(0)} KB, game ${version}, ${FULL ? 'full page' : 'play layout'})`);
