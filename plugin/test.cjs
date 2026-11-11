// Checks the built plugin in a real browser (installed Chrome when there is one).
//
//   node plugin/build.mjs && NODE_PATH=$(npm root -g) node plugin/test.cjs [--shot file.png] [--hermes <hermes-agent checkout>]
//
// Part A drives plugin/dist/mount-test.html, a stand-in for the app shell: mount, play, type in a text box
// outside the game, unmount, mount again, and count what is left behind.
// Part B loads plugin/dist/hermes-arena/plugin.js the way Hermes Desktop does: its import scan and rewrite
// (copied at run time from the hermes-agent checkout, default ~/.hermes/hermes-agent), blob-URL import with
// shim modules, then register(ctx) and a mount through a small stand-in for React.
// What this cannot show is the real app's layout and focus handling; that needs the plugin installed.
const fs = require('fs'), path = require('path'), os = require('os');
const { launch } = require('../feel-lab/page.cjs');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const DIST = path.join(__dirname, 'dist');
const HERMES = opt('hermes', path.join(os.homedir(), '.hermes/hermes-agent'));
const SHOT = opt('shot', '');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log((ok ? '  ok    ' : '  FAIL  ') + name + (detail ? '  (' + detail + ')' : '')); };
const note = msg => console.log('  note  ' + msg);

// Counters the page keeps for us: frames run, window listeners added minus removed, audio contexts made.
const INSTRUMENT = () => {
  window.__raf = { n: 0, ms: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(t => { const t0 = performance.now(); try { cb(t); } finally { window.__raf.n++; window.__raf.ms += performance.now() - t0; } });
  window.__wl = 0;
  const add = window.addEventListener, rem = window.removeEventListener;
  window.addEventListener = function (t, f, o) { window.__wl++; return add.call(this, t, f, o); };
  window.removeEventListener = function (t, f, o) { window.__wl--; return rem.call(this, t, f, o); };
  window.__acs = [];
  const AC = window.AudioContext;
  if (AC) window.AudioContext = function (...a) { const c = new AC(...a); window.__acs.push(c); return c; };
  // online play: a stand-in signaling socket that opens at once, and a count of the interval timers still running
  window.__ws = [];
  window.WebSocket = function (url) { const w = this; w.url = url; w.readyState = 0; w.send = () => {}; w.close = () => { w.closed = true; w.readyState = 3; }; window.__ws.push(w);
    Promise.resolve().then(() => { w.readyState = 1; if (w.onmessage) w.onmessage({ data: '{"type":"OPEN"}' }); }); };
  window.__iv = new Set();
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = function (f, ms) { const id = si.call(window, f, ms); window.__iv.add(id); return id; };
  window.clearInterval = function (id) { window.__iv.delete(id); return ci.call(window, id); };
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fps = async (page, ms = 1000) => {
  const a = await page.evaluate(() => ({ ...window.__raf })); await sleep(ms);
  const b = await page.evaluate(() => ({ ...window.__raf }));
  return { perSec: (b.n - a.n) * 1000 / ms, msPerFrame: b.n > a.n ? (b.ms - a.ms) / (b.n - a.n) : 0 };
};
const inGame = (page, fn, arg) => page.evaluate(([src, a]) => { const root = document.querySelector('.pxh-mount').shadowRoot; return (0, eval)('(' + src + ')')(root, a); }, [fn.toString(), arg]);
const untilState = async (page, want, key, tries = 40) => {
  for (let i = 0; i < tries; i++) { const s = await page.evaluate(() => arena.state()); if (s === want) return true; if (key) await page.keyboard.press(key); await sleep(150); }
  return false;
};

async function partA(browser) {
  console.log('A. mount test page');
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.stack || e).split('\n').slice(0, 2).join(' | ')));
  await page.addInitScript(INSTRUMENT);
  await page.goto('file://' + path.join(DIST, 'mount-test.html') + '?nomount');
  const baseListeners = await page.evaluate(() => window.__wl);
  const baseFps = await fps(page, 300);
  check('nothing runs before the game is mounted', baseFps.perSec === 0, baseFps.perSec.toFixed(0) + ' frames/s');

  await page.evaluate(() => { mountArena(); });
  await sleep(600);
  check('mounts without errors', errors.length === 0 && await page.evaluate(() => !!document.querySelector('.pxh-mount').shadowRoot.getElementById('stage')), errors[0] || '');
  check('starts on the title screen', await page.evaluate(() => arena.state()) === 'title');
  const fit = await inGame(page, root => {
    const pane = document.getElementById('pane').getBoundingClientRect(), f = root.getElementById('stageFrame'), r = f.getBoundingClientRect(), c = root.getElementById('stage');
    return { paneW: pane.width, paneH: pane.height, h: r.height, top: r.top - pane.top, bottom: pane.bottom - r.bottom, left: r.left - pane.left, right: pane.right - r.right, w: f.clientWidth, cw: c.width, cssW: parseFloat(c.style.width), dpr: devicePixelRatio };
  });
  // the full layout starts with the page header, so there the stage is judged by size, not by where it sits
  const playLayout = await page.evaluate(() => PXH_PLAY_LAYOUT);
  check('the whole stage fits in the pane', fit.left >= 0 && fit.right >= 0 && fit.h <= fit.paneH && (!playLayout || fit.top >= 0 && fit.bottom >= 0), `stage ${fit.w.toFixed(0)} px wide in a ${fit.paneW}x${fit.paneH} pane, ${fit.bottom.toFixed(0)} px spare below`);
  check('canvas is sized to its frame at the screen density', Math.abs(fit.cssW - fit.w) <= 1 && Math.abs(fit.cw - Math.round(fit.w * Math.min(3, fit.dpr))) <= 1, `${fit.cw} px backing store`);
  check('the game takes keyboard focus on mount', await inGame(page, root => root.activeElement && root.activeElement.id) === 'stage' && !(await inGame(page, root => root.querySelector('.pxh-page').classList.contains('pxh-idle'))));
  const hidden = await inGame(page, root => ['header', 'section[aria-label="Animation sheet"]', 'section[aria-label="Design notes"]'].map(s => getComputedStyle(root.querySelector(s)).display));
  check(playLayout ? 'play layout hides the study sections' : 'full layout shows the study sections', hidden.every(d => (d === 'none') === playLayout), hidden.join(','));
  const leak = await inGame(page, root => { const c = getComputedStyle(root.querySelector('.keys span')), k = getComputedStyle(root.querySelector('kbd')), g = getComputedStyle(root.getElementById('stage'));
    return [c.letterSpacing, c.textTransform, c.fontStyle, c.fontWeight, c.textAlign, c.wordSpacing, c.lineHeight, k.fontSize, g.outlineStyle].join(' '); });
  check('the app\'s styles do not leak into the game', leak === 'normal none normal 400 start 0px 21px 11px none', leak);
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return ['700 16px "Pixelify Sans"', '16px "Silkscreen"', '16px "Atkinson Hyperlegible"'].map(f => document.fonts.check(f)); });
  if (fonts.every(Boolean)) check('web fonts load for text inside the shadow tree', true); else note('web fonts not loaded here (offline?): the page falls back to system fonts');
  const f1 = await fps(page, 1000);
  check('one render loop', f1.perSec > 40 && f1.perSec < 75, `${f1.perSec.toFixed(0)} frames/s, ${f1.msPerFrame.toFixed(2)} ms each`);

  // play: title -> select -> ready -> play, all with the keyboard, and the host must not hear those keys
  const hostKeys = () => page.evaluate(() => hostKeys);
  const k0 = await hostKeys();
  check('keyboard starts a match', await untilState(page, 'select', 'j') && await untilState(page, 'ready', 'Enter') && await untilState(page, 'play', null, 40), await page.evaluate(() => arena.state()));
  for (const k of ['d', 'd', 'Space', 'j', 'k', 'ArrowLeft', 'Shift']) await page.keyboard.press(k);
  check('game keys do not reach the host app', await hostKeys() === k0, (await hostKeys() - k0) + ' leaked');
  const k1 = await hostKeys();
  await page.keyboard.press('Meta+k');
  check('shortcuts with Cmd pass through to the host', await hostKeys() - k1 === 2 && await page.evaluate(() => arena.state()) === 'play');
  await page.keyboard.press('m');
  check('settings are saved through the plugin storage', await page.evaluate(() => { const v = saved.get('pxh-sfx'); return typeof v === 'string' && JSON.parse(v).on === false; }));
  check('audio starts on the first key', await page.evaluate(() => window.__acs.length) === 1);

  // typing somewhere else in the app
  await page.click('#chat'); await page.keyboard.type('jk d');
  check('typing outside the game goes to the text box', await page.evaluate(() => document.getElementById('chat').value) === 'jk d');
  check('the match pauses when focus leaves the game', await page.evaluate(() => arena.state()) === 'pause' && await inGame(page, root => root.querySelector('.pxh-page').classList.contains('pxh-idle')));
  if (SHOT) await page.screenshot({ path: SHOT.replace(/\.png$/, '-idle.png') });
  const box = await inGame(page, root => { const r = root.getElementById('stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.click(box.x + 12, box.y + 12);
  check('a click on the stage gives the keys back', await inGame(page, root => root.activeElement && root.activeElement.id) === 'stage' && await page.evaluate(() => arena.state()) === 'pause');
  await sleep(200); await page.keyboard.press('Enter'); await sleep(100);
  check('Enter resumes the match', await page.evaluate(() => arena.state()) === 'play');
  await inGame(page, root => root.querySelector('.keys span').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })));
  check('a click on plain text keeps the keys on the game', await inGame(page, root => root.activeElement && root.activeElement.id) === 'stage');
  await sleep(1200);
  if (SHOT) await page.screenshot({ path: SHOT });

  // full screen: the button puts the stage frame in full screen and the canvas fills it at 16:9; F11 leaves; an unmount leaves too
  const fsBox = await inGame(page, root => { const r = root.getElementById('fsBtn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(fsBox.x, fsBox.y); await sleep(500);
  const fs = await inGame(page, root => { const c = root.getElementById('stage'), r = c.getBoundingClientRect(); return { el: root.fullscreenElement && root.fullscreenElement.id, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, cw: c.width, focus: root.activeElement && root.activeElement.id }; });
  check('the full-screen button fills the screen with the stage', fs.el === 'stageFrame' && Math.abs(fs.w - Math.min(fs.vw, fs.vh * 416 / 234)) <= 2 && Math.abs(fs.h - fs.w * 234 / 416) <= 2 && fs.cw >= Math.round(fs.w * Math.min(3, await page.evaluate(() => devicePixelRatio))) - 2, JSON.stringify(fs));
  check('the game keeps the keys in full screen', fs.focus === 'stage' && await page.evaluate(() => arena.state()) === 'play');
  await page.keyboard.press('F11'); await sleep(500);
  check('F11 leaves full screen and the stage fits the pane again', await inGame(page, root => !root.fullscreenElement && Math.abs(root.getElementById('stage').getBoundingClientRect().width - root.getElementById('stageFrame').clientWidth) <= 1) && await page.evaluate(() => !document.fullscreenElement));
  await page.mouse.click(fsBox.x, fsBox.y); await sleep(500);
  const fsAgain = await page.evaluate(() => !!document.fullscreenElement);

  // unmount: nothing may be left behind
  await page.evaluate(() => { unmountArena(); });
  await sleep(400);
  const after = await fps(page, 400);
  const left = await page.evaluate(() => ({ mounts: document.querySelectorAll('.pxh-mount').length, kids: document.getElementById('pane').childElementCount, fonts: !!document.getElementById('pxh-fonts'), wl: window.__wl, ac: window.__acs.map(c => c.state) }));
  check('unmount removes the game from the page', left.mounts === 0 && left.kids === 0 && !left.fonts);
  check('unmount in full screen leaves full screen', fsAgain && await page.evaluate(() => !document.fullscreenElement), fsAgain ? '' : 'did not enter full screen the second time');
  check('unmount stops the render loop', after.perSec === 0, after.perSec.toFixed(0) + ' frames/s');
  check('unmount removes every window listener', left.wl === baseListeners, `${left.wl} now, ${baseListeners} before mounting`);
  check('unmount closes the audio context', left.ac.every(s => s === 'closed'), left.ac.join(','));

  // mount again, several times: one game, one loop, saved settings read back
  for (let i = 0; i < 3; i++) { await page.evaluate(() => { mountArena(); }); await sleep(250); await page.evaluate(() => { unmountArena(); }); }
  await page.evaluate(() => { mountArena(); }); await sleep(600);
  const f2 = await fps(page, 1000);
  const again = await page.evaluate(() => ({ mounts: document.querySelectorAll('.pxh-mount').length, state: arena.state(), wl: window.__wl }));
  check('remounting leaves one game and one loop', again.mounts === 1 && again.state === 'title' && f2.perSec > 40 && f2.perSec < 75, `${f2.perSec.toFixed(0)} frames/s`);
  check('saved settings are read back after a remount', await inGame(page, root => root.getElementById('sOn').checked) === false);
  await page.evaluate(() => { unmountArena(); });
  check('listener count is back to the start after four mounts', await page.evaluate(() => window.__wl) === baseListeners);
  // online: hosting opens a signaling socket and a heartbeat timer; an unmount has to close both
  await page.evaluate(() => { window.__ws.length = 0; mountArena(); }); await sleep(500);
  await page.evaluate(() => { arena.root.getElementById('stage').focus(); });
  const press = async k => { await page.keyboard.down(k); await sleep(60); await page.keyboard.up(k); await sleep(70); };
  await press('j'); for (let i = 0; i < 4; i++) await press('ArrowUp'); for (let i = 0; i < 4; i++) await press('ArrowRight'); await press('Enter');
  check('ONLINE opens the online screen in the plugin', await page.evaluate(() => arena.state()) === 'online', await page.evaluate(() => arena.state()));
  await press('ArrowDown'); await press('Enter'); await sleep(300);
  const host = await page.evaluate(() => ({ ws: window.__ws.length, open: window.__ws.filter(w => !w.closed).length, iv: window.__iv.size, url: window.__ws[0] ? window.__ws[0].url.split('?')[0] : '' }));
  check('hosting opens one signaling socket and one heartbeat timer', host.ws === 1 && host.open === 1 && host.iv === 1, `${host.ws} socket(s) to ${host.url}, ${host.iv} timer(s)`);
  await page.evaluate(() => { unmountArena(); });
  const gone = await page.evaluate(() => ({ open: window.__ws.filter(w => !w.closed).length, iv: window.__iv.size }));
  check('unmount closes the socket and stops the timer', gone.open === 0 && gone.iv === 0, `${gone.open} open, ${gone.iv} timer(s)`);
  check('no page errors', errors.length === 0, errors.join(' || '));
  await ctx.close();

  // short wide pane and a big pane: the stage must still fit, and a frame must stay cheap
  for (const [w, h] of [[1500, 520], [1920, 1200]]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const p2 = await c2.newPage(); await p2.addInitScript(INSTRUMENT);
    await p2.goto('file://' + path.join(DIST, 'mount-test.html')); await sleep(800);
    const g = await inGame(p2, root => { const pane = document.getElementById('pane').getBoundingClientRect(), f = root.getElementById('stageFrame'), r = f.getBoundingClientRect(); return { play: PXH_PLAY_LAYOUT, fits: r.height <= pane.height, bottom: pane.bottom - r.bottom, right: pane.right - r.right, top: r.top - pane.top, w: f.clientWidth, cw: root.getElementById('stage').width }; });
    const f = await fps(p2, 1500);
    check(`stage fits a ${w}x${h} window`, g.right >= 0 && g.fits && (!g.play || g.bottom >= 0 && g.top >= 0), `stage ${g.w.toFixed(0)} px wide, canvas ${g.cw} px, ${f.msPerFrame.toFixed(2)} ms per frame, ${f.perSec.toFixed(0)} frames/s`);
    check(`a frame stays under 8 ms at ${w}x${h}`, f.msPerFrame < 8, f.msPerFrame.toFixed(2) + ' ms');
    await c2.close();
  }
}

// The import scan and rewrite Hermes Desktop runs on a plugin's source, lifted from its loader.
function loaderScan() {
  const file = path.join(HERMES, 'apps/desktop/src/contrib/runtime-loader.ts');
  if (!fs.existsSync(file)) return null;
  const ts = fs.readFileSync(file, 'utf8');
  const a = ts.indexOf('const importSpecifierRe'), stop = ts.indexOf('export function unloadRuntimePlugin');
  if (a < 0 || stop < 0) return null;
  const b = ts.lastIndexOf('\n}\n', stop) + 3;
  const { stripTypeScriptTypes } = require('node:module');
  if (typeof stripTypeScriptTypes !== 'function') return null;
  return stripTypeScriptTypes(ts.slice(a, b));
}

// A stand-in for React with just what the plugin page uses: jsx, useRef, useEffect, mount and unmount.
const REACT_STUB = () => {
  const hooks = { cur: null };
  window.__HERMES_REACT__ = {
    useRef(v) { const c = hooks.cur, i = c.i++; return c.slots[i] || (c.slots[i] = { current: v }); },
    useEffect(fn) { hooks.cur.effects.push(fn); },
  };
  window.__HERMES_REACT_JSX__ = { jsx: (type, props) => ({ type, props: props || {} }), jsxs: (type, props) => ({ type, props: props || {} }) };
  window.__HERMES_REACT_JSX_DEV__ = { jsxDEV: (type, props) => ({ type, props: props || {} }) };
  window.__HERMES_PLUGIN_SDK__ = { ROUTES_AREA: 'routes', SIDEBAR_NAV_AREA: 'sidebar.nav' };
  // strict: run effect, cleanup, effect, as React's StrictMode does in development
  window.__mount = function mount(el, parent, strict) {
    if (typeof el.type === 'function') {
      const c = { i: 0, slots: [], effects: [] }; hooks.cur = c; const out = el.type(el.props); hooks.cur = null;
      const un = mount(out, parent, strict);
      let cleanups = c.effects.map(f => f());
      if (strict) { cleanups.forEach(f => f && f()); cleanups = c.effects.map(f => f()); }
      return () => { cleanups.forEach(f => f && f()); un(); };
    }
    const n = document.createElement(el.type);
    for (const [k, v] of Object.entries(el.props)) { if (k === 'style') Object.assign(n.style, v); else if (k === 'ref') v.current = n; else if (k !== 'children') n.setAttribute(k, v); }
    parent.appendChild(n);
    const kids = [].concat(el.props.children || []).map(k => mount(k, n, strict));
    return () => { kids.forEach(f => f()); n.remove(); };
  };
  // the loader's shim modules: same source text as apps/desktop/src/sdk/runtime.ts shimUrl()
  const shim = key => {
    const names = Object.keys(window[key]).filter(n => n !== 'default' && /^[A-Za-z_$][\w$]*$/.test(n));
    return URL.createObjectURL(new Blob([`const m = globalThis.${key};\nexport default m.default ?? m;\n` + (names.length ? `export const { ${names.join(', ')} } = m;\n` : '')], { type: 'text/javascript' }));
  };
  window.__shims = { '@hermes/plugin-sdk': shim('__HERMES_PLUGIN_SDK__'), 'react/jsx-dev-runtime': shim('__HERMES_REACT_JSX_DEV__'), 'react/jsx-runtime': shim('__HERMES_REACT_JSX__'), react: shim('__HERMES_REACT__') };
};

async function partB(browser) {
  console.log('B. plugin.js through the Hermes Desktop loader steps');
  const source = fs.readFileSync(path.join(DIST, 'hermes-arena/plugin.js'), 'utf8');
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.stack || e).split('\n').slice(0, 2).join(' | ')));
  await page.route('http://pxh.test/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><div id="pane" style="position:fixed;inset:0;display:flex"></div></body></html>' }));
  await page.addInitScript(INSTRUMENT);
  await page.goto('http://pxh.test/');
  await page.evaluate(REACT_STUB);

  const scan = loaderScan();
  if (scan) {
    await page.evaluate(code => { (0, eval)('(function(){ const sdkImportMap=()=>window.__shims;\n' + code + '\nwindow.__loader={unsupportedImports,rewriteSpecifiers}; })()'); }, scan);
    const control = await page.evaluate(() => window.__loader.unsupportedImports("import a from 'lodash'\nconst s = \"import b from 'left-pad'\"\n"));
    check('loader scan flags a foreign import (control)', control.length === 1 && control[0] === 'lodash', control.join(','));
  } else {
    note('hermes-agent checkout not found at ' + HERMES + ': using the documented import pattern instead of the real loader code');
    await page.evaluate(() => {
      const re = () => /(from\s*|import\s*\(\s*|import\s+)(['"])([^'"]+)\2/g;
      window.__loader = {
        unsupportedImports: src => [...new Set([...src.matchAll(re())].map(m => m[3]).filter(s => !window.__shims[s]))],
        rewriteSpecifiers: src => src.replace(re(), (whole, pre, q, spec) => window.__shims[spec] ? pre + q + window.__shims[spec] + q : whole),
      };
    });
  }
  const res = await page.evaluate(async src => {
    const bad = window.__loader.unsupportedImports(src);
    const out = window.__loader.rewriteSpecifiers(src);
    const rewritten = out.split('blob:').length - 1;
    const url = URL.createObjectURL(new Blob([out], { type: 'text/javascript' }));
    const t0 = performance.now();
    let mod, err = '';
    try { mod = await import(url); } catch (e) { err = String(e); }
    const ms = performance.now() - t0;
    window.__plugin = mod && mod.default;
    return { bad, rewritten, err, ms, id: mod && mod.default && mod.default.id, name: mod && mod.default && mod.default.name, reg: typeof (mod && mod.default && mod.default.register), exports: mod ? Object.keys(mod) : [] };
  }, source);
  check('the loader finds no unsupported imports', res.bad.length === 0, res.bad.join(', '));
  check('exactly the two real imports are rewritten', res.rewritten === 2, res.rewritten + ' rewritten');
  check('the module evaluates', !res.err && res.id === 'hermes-arena' && res.reg === 'function', res.err || `${res.ms.toFixed(0)} ms (the loader allows 10,000)`);

  const reg = await page.evaluate(() => {
    const items = [], disposers = [], store = new Map();
    window.__ctx = {
      storage: { get: (k, d) => store.has(k) ? store.get(k) : d, set: (k, v) => store.set(k, v), remove: k => store.delete(k) },
      registerMany: list => { items.push(...list); return () => {}; }, register: item => { items.push(item); return () => {}; },
      onDispose: fn => disposers.push(fn),
    };
    window.__plugin.register(window.__ctx);
    window.__items = items; window.__disposers = disposers;
    return items.map(i => ({ id: i.id, area: i.area, data: i.data, render: typeof i.render }));
  });
  const route = reg.find(i => i.area === 'routes'), nav = reg.find(i => i.area === 'sidebar.nav');
  check('registers a page route and a sidebar entry', route && route.render === 'function' && route.data.path === '/hermes-arena' && nav && nav.data.path === '/hermes-arena' && nav.data.label === 'Hermes Arena' && nav.render === 'undefined', JSON.stringify(reg.map(i => i.area)));

  const mounted = await page.evaluate(async () => {
    const pane = document.getElementById('pane');
    window.__un = window.__mount(window.__items.find(i => i.area === 'routes').render(), pane, true);
    await new Promise(r => setTimeout(r, 500));
    const m = document.querySelectorAll('.pxh-mount');
    return { n: m.length, stage: m.length && !!m[0].shadowRoot.getElementById('stage'), h: m.length ? m[0].getBoundingClientRect().height : 0 };
  });
  check('the page mounts one game, also under StrictMode\'s double effect', mounted.n === 1 && mounted.stage && mounted.h > 600, JSON.stringify(mounted));
  const f = await fps(page, 800);
  check('one render loop after the double effect', f.perSec > 40 && f.perSec < 75, f.perSec.toFixed(0) + ' frames/s');
  await page.keyboard.press('m'); await sleep(50);
  check('settings go to ctx.storage', await page.evaluate(() => typeof window.__ctx.storage.get('pxh-sfx', null) === 'string'));
  await page.evaluate(() => { window.__disposers.forEach(fn => fn()); });
  await sleep(300);
  const gone = await fps(page, 300);
  check('disposing the plugin takes a live game down', await page.evaluate(() => document.querySelectorAll('.pxh-mount').length) === 0 && gone.perSec === 0);
  await page.evaluate(() => { window.__un(); });
  check('unmounting after a dispose is harmless', await page.evaluate(() => document.getElementById('pane').childElementCount) === 0);
  check('no page errors', errors.length === 0, errors.join(' || '));
  await ctx.close();
}

(async () => {
  for (const f of ['mount-test.html', 'engine.js', 'hermes-arena/plugin.js']) if (!fs.existsSync(path.join(DIST, f))) { console.error('missing plugin/dist/' + f + ': run node plugin/build.mjs first'); process.exit(2); }
  const browser = await launch();
  try { await partA(browser); await partB(browser); } finally { await browser.close(); }
  const bad = results.filter(r => !r.ok);
  console.log(bad.length ? `\n${bad.length} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
