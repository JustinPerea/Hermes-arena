// ---------------------------------------------------------------------------
// Hermes Arena — animation book. Browse, play and scrub every animation of a
// character, with hitboxes, onion skin and frame data. Pure DOM + canvas.
// ---------------------------------------------------------------------------

function createAnimBook(root, options) {
  const opts = Object.assign({ char: 'hermes' }, options || {});
  const charId = opts.char;
  const ch = CHARACTERS[charId];
  const book = ANIMS[charId] || {};
  const names = (ANIM_ORDER[charId] || []).filter((n) => book[n]);
  // skin: ?skin=<id> in the URL, else the last one picked (localStorage), else P1's
  const skins = typeof skinList === 'function' ? skinList(charId) : [];
  const SKIN_KEY = 'hermes-anim-book-skin';
  const pickSkin = () => {
    let want = null;
    try {
      want = new URLSearchParams(location.search).get('skin');
    } catch (e) { /* no URL */ }
    if (!want) {
      try {
        want = localStorage.getItem(SKIN_KEY);
      } catch (e) { /* storage blocked */ }
    }
    if (!skins.some((s) => s.id === want)) want = typeof slotSkin === 'function' ? slotSkin(0, charId) : null;
    return skins.some((s) => s.id === want) ? want : skins.length ? skins[0].id : null;
  };
  const toHash = (n) => n.replace(/_/g, '-');
  const fromHash = (h) => h.replace(/^#/, '').replace(/-/g, '_');

  const st = {
    name: names.includes(fromHash(location.hash || '')) ? fromHash(location.hash) : names[0],
    f: 0,
    playing: true,
    speed: 1,
    boxes: false,
    onion: false,
    face: 1,
    ink: INK.blue,
    charge: 0.6,
    dist: 0, // ground scroll distance for moves with horizontal motion
    time: 0,
    skin: pickSkin(),
  };

  root.innerHTML = `
  <div class="ab">
    <header class="ab-head">
      <div class="ab-title"><span class="ab-name">${ch.name}</span><span class="ab-sub">Animation book · ${names.length} moves</span></div>
      <label class="ab-pick"><span>Move</span><select id="ab-select"></select></label>
    </header>
    <div class="ab-body">
      <nav class="ab-list" id="ab-list" aria-label="Animations"></nav>
      <main class="ab-main">
        <div class="ab-stage-wrap"><canvas id="ab-stage" aria-label="Animation preview"></canvas></div>
        <div class="ab-scrub">
          <canvas id="ab-track" aria-hidden="true"></canvas>
          <input id="ab-frame" type="range" min="0" max="30" step="1" value="0" aria-label="Frame">
        </div>
        <div class="ab-transport">
          <button id="ab-prev" title="Previous frame (Left arrow)" aria-label="Previous frame">◀︎</button>
          <button id="ab-play" class="ab-primary" title="Play or pause (Space)">Pause</button>
          <button id="ab-next" title="Next frame (Right arrow)" aria-label="Next frame">▶︎</button>
          <span class="ab-fc" id="ab-fc">f 0 / 30</span>
          <div class="ab-seg" role="group" aria-label="Speed">
            <button data-speed="0.25">¼×</button><button data-speed="0.5">½×</button><button data-speed="1">1×</button>
          </div>
        </div>
        <div class="ab-toggles">
          <label><input type="checkbox" id="ab-boxes"> Hitboxes</label>
          <label><input type="checkbox" id="ab-onion"> Onion skin</label>
          <label><input type="checkbox" id="ab-flip"> Face left</label>
          <label><input type="checkbox" id="ab-red"> Player 2 ink</label>
          <label class="ab-skin"${skins.length ? '' : ' hidden'}><span>Skin</span><select id="ab-skin">${skins.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}</select></label>
          <label class="ab-charge" id="ab-charge-wrap"><span>Charge</span><input type="range" id="ab-charge" min="0" max="1" step="0.05" value="0.6"></label>
        </div>
      </main>
      <aside class="ab-info" id="ab-info" aria-live="polite"></aside>
    </div>
  </div>`;

  const $ = (id) => root.querySelector('#' + id);
  const stage = $('ab-stage');
  const track = $('ab-track');
  const slider = $('ab-frame');
  const list = $('ab-list');
  const select = $('ab-select');

  // ---- list ------------------------------------------------------------------
  const groups = ANIM_GROUPS.map((g) => [g, names.filter((n) => book[n].group === g)]).filter(([, l]) => l.length);
  list.innerHTML = groups
    .map(
      ([g, l]) =>
        `<section><h3>${g}</h3><ul>${l
          .map((n) => `<li><button data-name="${n}" id="ab-item-${n}"><span>${book[n].label}</span><em>${book[n].frames}f</em></button></li>`)
          .join('')}</ul></section>`,
    )
    .join('');
  select.innerHTML = groups
    .map(([g, l]) => `<optgroup label="${g}">${l.map((n) => `<option value="${n}">${book[n].label}</option>`).join('')}</optgroup>`)
    .join('');

  const def = () => book[st.name];

  function select_(name, fromHashChange) {
    if (!book[name]) return;
    st.name = name;
    st.f = 0;
    st.dist = 0;
    st.playing = true;
    for (const b of list.querySelectorAll('button[data-name]')) b.classList.toggle('on', b.dataset.name === name);
    const cur = list.querySelector(`button[data-name="${name}"]`);
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    select.value = name;
    slider.max = String(def().frames);
    $('ab-charge-wrap').hidden = !def().charge;
    if (!fromHashChange) {
      try {
        history.replaceState(null, '', '#' + toHash(name));
      } catch (e) {
        /* hash optional */
      }
    }
    renderInfo();
    drawTrack();
    syncControls();
  }

  // ---- info panel ---------------------------------------------------------------
  function ranges(r) {
    return r && r.length ? r.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ') : '';
  }
  function renderInfo() {
    const d = def();
    const rows = [];
    const add = (k, v) => v !== '' && v != null && rows.push(`<div class="ab-row"><dt>${k}</dt><dd>${v}</dd></div>`);
    add('Input', d.input);
    add('Length', `${d.frames} frames${d.loop ? ' · loops' : ''} · ${(d.frames / 60).toFixed(2)} s`);
    if (d.hit && d.hit.length) {
      const atk = d.hit.filter((h) => !h.grab);
      const first = Math.min(...d.hit.map((h) => h.f[0]));
      const last = Math.max(...d.hit.map((h) => h.f[1]));
      add('Startup', `${first} frames`);
      add('Active', ranges(d.hit.map((h) => h.f).filter((v, i, a) => a.findIndex((w) => w[0] === v[0] && w[1] === v[1]) === i)));
      add('Recovery', `${d.frames - last} frames`);
      if (atk.length) {
        const dmg = atk.map((h) => h.dmg).filter((v) => v != null);
        if (dmg.length) add('Damage', [...new Set(dmg)].map((v) => v + '%').join(' / '));
        const kb = atk.map((h) => h.kb).filter((v) => v != null);
        if (kb.length) add('Knockback', [...new Set(kb)].join(' / '));
        const ang = atk.map((h) => h.ang).filter((v) => v != null);
        if (ang.length) add('Launch angle', [...new Set(ang)].map((v) => v + '°').join(' / '));
      }
      if (d.hit.some((h) => h.grab)) add('Grab', ranges(d.hit.filter((h) => h.grab).map((h) => h.f)));
    }
    if (d.charge) add('Charge hold', `frame ${d.charge.f}`);
    if (d.intan) add('Intangible', ranges(d.intan));
    if (d.counter) add('Counter window', ranges(d.counter));
    if (d.armor) add('Armor', ranges(d.armor));
    if (d.landLag) add('Landing lag', `${d.landLag} frames`);
    if (d.cancel) add('Can act from', `frame ${d.cancel}`);
    if (d.next) add('Leads into', book[d.next] ? book[d.next].label : d.next);
    if (d.spawn) add('Spawns', book[d.spawn.anim] ? book[d.spawn.anim].label + ` at frame ${d.spawn.f}` : d.spawn.anim);
    $('ab-info').innerHTML = `<p class="ab-group">${d.group}</p><h2>${d.label}</h2>${d.notes ? `<p class="ab-notes">${d.notes}</p>` : ''}<dl>${rows.join('')}</dl>
      <p class="ab-keys">Space play · ← → step · ↑ ↓ change move</p>`;
  }

  // ---- canvas sizing ------------------------------------------------------------
  const ctxS = stage.getContext('2d');
  const ctxT = track.getContext('2d');
  let SW = 0;
  let SH = 0;
  let TW = 0;
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const wrap = stage.parentElement;
    SW = Math.max(200, Math.floor(wrap.clientWidth));
    SH = Math.max(220, Math.floor(wrap.clientHeight));
    stage.width = SW * dpr;
    stage.height = SH * dpr;
    stage.style.width = SW + 'px';
    stage.style.height = SH + 'px';
    ctxS.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tr = track.getBoundingClientRect();
    TW = Math.max(100, Math.floor(tr.width));
    track.width = TW * dpr;
    track.height = 14 * dpr;
    ctxT.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTrack();
  }

  // ---- timeline track: phase colours, intangible and counter frames -----------
  function drawTrack() {
    if (!TW) return;
    const d = def();
    const g = ctxT;
    g.clearRect(0, 0, TW, 14);
    const pad = 8;
    const w = TW - pad * 2;
    const N = d.frames;
    for (let f = 0; f < N; f++) {
      const ph = animPhase(d, f);
      const x0 = pad + (f / N) * w;
      const x1 = pad + ((f + 1) / N) * w;
      g.fillStyle = ph === 'active' ? '#b2392a' : ph === 'startup' ? '#7f93c6' : ph === 'endlag' ? '#c9d2e6' : '#cfd6e4';
      g.fillRect(x0, 3, Math.max(1, x1 - x0 - 0.5), 8);
      if (inRanges(d.intan, f)) {
        g.fillStyle = '#2b78d0';
        g.fillRect(x0, 0, Math.max(1, x1 - x0 - 0.5), 2);
      }
      if (inRanges(d.counter, f) || inRanges(d.armor, f)) {
        g.fillStyle = '#c99a17';
        g.fillRect(x0, 12, Math.max(1, x1 - x0 - 0.5), 2);
      }
    }
    if (d.charge) {
      const x = pad + (d.charge.f / N) * w;
      g.fillStyle = '#0e2566';
      g.fillRect(x - 1, 0, 2, 14);
    }
  }

  // ---- stage --------------------------------------------------------------------
  function drawStage() {
    const d = def();
    const g = ctxS;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, SW, SH);
    const zoom = clamp(Math.min(SW / 520, SH / 360), 0.7, 2.6);
    const ledge = d.group === 'Ledge';
    const proj = d.name.startsWith('proj_');
    const ox = SW * (ledge ? 0.56 : 0.47);
    const groundY = SH * (ledge ? 0.52 : 0.8);
    // blueprint grid, scrolled by distance travelled
    g.save();
    g.strokeStyle = 'rgba(29,59,145,0.08)';
    g.lineWidth = 1;
    const cell = 40 * zoom;
    const shift = ((st.dist * zoom) % cell + cell) % cell;
    for (let x = -cell - shift * st.face; x < SW + cell; x += cell) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, SH);
      g.stroke();
    }
    for (let y = groundY % cell; y < SH; y += cell) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(SW, y);
      g.stroke();
    }
    g.restore();
    // floor or ledge
    g.save();
    g.strokeStyle = INK.blueDeep;
    g.fillStyle = inkPatterns(g, INK.blue).horiz;
    if (ledge) {
      const lx = st.face > 0 ? ox : 0;
      const lw = st.face > 0 ? SW - ox : ox;
      g.globalAlpha = 0.5;
      g.fillRect(lx, groundY, lw, SH - groundY);
      g.globalAlpha = 1;
      g.lineWidth = 2.5;
      g.beginPath();
      if (st.face > 0) {
        g.moveTo(SW, groundY);
        g.lineTo(ox, groundY);
        g.lineTo(ox, SH);
      } else {
        g.moveTo(0, groundY);
        g.lineTo(ox, groundY);
        g.lineTo(ox, SH);
      }
      g.stroke();
    } else if (!proj) {
      g.globalAlpha = 0.35;
      g.fillRect(0, groundY, SW, SH - groundY);
      g.globalAlpha = 1;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, groundY);
      g.lineTo(SW, groundY);
      g.stroke();
      // distance ticks along the floor
      g.lineWidth = 1;
      const tick = 60 * zoom;
      const sh = ((st.dist * zoom) % tick + tick) % tick;
      for (let x = -tick - sh * st.face; x < SW + tick; x += tick) {
        g.beginPath();
        g.moveTo(x, groundY);
        g.lineTo(x - 10 * zoom, groundY + 12 * zoom);
        g.stroke();
      }
    }
    g.restore();
    // onion skin: a few earlier frames
    g.save();
    g.translate(ox, groundY);
    g.scale(zoom, zoom);
    const common = { face: st.face, ink: st.ink, charge: st.charge, time: st.time, skin: st.skin };
    if (st.onion) {
      const n = 4;
      for (let i = n; i >= 1; i--) {
        let fr = st.f - i * Math.max(2, Math.round(d.frames / 16));
        if (d.loop) fr = ((fr % d.frames) + d.frames) % d.frames;
        if (fr < 0) continue;
        drawAnimFrame(g, charId, d, fr, 0, 0, Object.assign({}, common, { alpha: 0.12 + 0.05 * (n - i), time: fr / 60 }));
      }
    }
    const mo = d.motion ? d.motion(Math.floor(st.f), {}) || {} : {};
    drawAnimFrame(g, charId, d, st.f, 0, 0, Object.assign({}, common, { boxes: st.boxes, vx: (mo.vx || 0) * st.face, vy: mo.vy || 0 }));
    g.restore();
    // frame label in the corner
    g.save();
    g.fillStyle = INK.blueDeep;
    g.font = '600 13px "IBM Plex Mono", ui-monospace, monospace';
    const ph = animPhase(d, Math.floor(st.f));
    g.fillText(`${d.name}  f${Math.floor(st.f)}${ph === 'move' ? '' : '  ' + ph}`, 14, 22);
    g.restore();
  }

  function syncControls() {
    const d = def();
    slider.value = String(Math.floor(st.f));
    $('ab-fc').textContent = `f ${Math.floor(st.f)} / ${d.frames}`;
    $('ab-play').textContent = st.playing ? 'Pause' : 'Play';
    for (const b of root.querySelectorAll('[data-speed]')) b.classList.toggle('on', Number(b.dataset.speed) === st.speed);
  }

  // ---- loop -------------------------------------------------------------------------
  let last = 0;
  let acc = 0;
  let raf = 0;
  let hold = 0; // frames to rest on the last frame before replaying a one-shot
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    const dt = last ? Math.min(100, now - last) : 16;
    last = now;
    st.time += dt / 1000;
    if (st.playing) {
      acc += (dt / (1000 / 60)) * st.speed;
      while (acc >= 1) {
        acc -= 1;
        stepFrame(1);
      }
    }
    drawStage();
    syncControls();
  }
  function stepFrame(n) {
    const d = def();
    if (n > 0 && d.motion && st.f < d.frames) {
      const mo = d.motion(Math.floor(st.f), {}) || {};
      if (mo.vx) st.dist += mo.vx;
    }
    if (d.loop) {
      st.f = (((st.f + n) % d.frames) + d.frames) % d.frames;
      return;
    }
    if (n > 0 && st.f >= d.frames) {
      if (++hold > 30) {
        hold = 0;
        st.f = 0;
        st.dist = 0;
      }
      return;
    }
    st.f = clamp(st.f + n, 0, d.frames);
  }

  // ---- events -----------------------------------------------------------------------
  const on = (el, ev, fn) => el.addEventListener(ev, fn);
  on(list, 'click', (e) => {
    const b = e.target.closest('button[data-name]');
    if (b) select_(b.dataset.name);
  });
  on(select, 'change', () => select_(select.value));
  on(slider, 'input', () => {
    st.playing = false;
    st.f = Number(slider.value);
  });
  on($('ab-play'), 'click', () => {
    st.playing = !st.playing;
  });
  on($('ab-prev'), 'click', () => {
    st.playing = false;
    stepFrame(-1);
  });
  on($('ab-next'), 'click', () => {
    st.playing = false;
    stepFrame(1);
  });
  for (const b of root.querySelectorAll('[data-speed]')) on(b, 'click', () => (st.speed = Number(b.dataset.speed)));
  on($('ab-boxes'), 'change', (e) => (st.boxes = e.target.checked));
  on($('ab-onion'), 'change', (e) => (st.onion = e.target.checked));
  on($('ab-flip'), 'change', (e) => (st.face = e.target.checked ? -1 : 1));
  on($('ab-red'), 'change', (e) => (st.ink = e.target.checked ? INK.sanguine : INK.blue));
  on($('ab-charge'), 'input', (e) => (st.charge = Number(e.target.value)));
  if (st.skin) $('ab-skin').value = st.skin;
  on($('ab-skin'), 'change', (e) => {
    st.skin = e.target.value;
    try {
      localStorage.setItem(SKIN_KEY, st.skin);
    } catch (e2) { /* storage blocked */ }
  });
  const onKey = (e) => {
    if (e.target && /input|select|textarea/i.test(e.target.tagName) && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
    const i = names.indexOf(st.name);
    if (e.key === ' ') {
      st.playing = !st.playing;
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      st.playing = false;
      stepFrame(1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      st.playing = false;
      stepFrame(-1);
      e.preventDefault();
    } else if (e.key === 'ArrowDown' && i < names.length - 1) {
      select_(names[i + 1]);
      e.preventDefault();
    } else if (e.key === 'ArrowUp' && i > 0) {
      select_(names[i - 1]);
      e.preventDefault();
    }
  };
  on(window, 'keydown', onKey);
  const onHash = () => {
    const n = fromHash(location.hash || '');
    if (book[n] && n !== st.name) select_(n, true);
  };
  on(window, 'hashchange', onHash);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(stage.parentElement);
  else on(window, 'resize', fit);

  fit();
  select_(st.name, true);
  raf = requestAnimationFrame(tick);
  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHash);
      if (ro) ro.disconnect();
      root.innerHTML = '';
    },
    state: st,
    select: select_,
  };
}

const ANIM_BOOK_CSS = `
.ab { --paper: #e6e9e6; --paper-hi: #f1f2ed; --ink: #1d3b91; --ink-deep: #0e2566; --rule: rgba(29,59,145,.22); --red: #a0281c;
  --display: "Marcellus SC", "Cormorant SC", Georgia, serif; --body: "EB Garamond", Georgia, serif; --mono: "IBM Plex Mono", ui-monospace, monospace;
  color: var(--ink-deep); background: var(--paper); font-family: var(--body); font-size: 16px; height: 100%; display: flex; flex-direction: column; }
.ab * { box-sizing: border-box; }
.ab [hidden] { display: none !important; }
.ab-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px max(16px, env(safe-area-inset-right, 0px)) 10px max(16px, env(safe-area-inset-left, 0px)); border-bottom: 1.5px solid var(--ink-deep); }
.ab-title { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; min-width: 0; }
.ab-name { font-family: var(--display); font-size: 30px; letter-spacing: .14em; color: var(--ink-deep); line-height: 1; }
.ab-sub { font-family: var(--mono); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink); }
.ab-pick { display: none; align-items: center; gap: 8px; font-family: var(--mono); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.ab-pick select { font: inherit; font-family: var(--body); font-size: 15px; text-transform: none; letter-spacing: 0; color: var(--ink-deep); background: var(--paper-hi); border: 1px solid var(--rule); border-radius: 3px; padding: 6px 8px; max-width: 60vw; }
.ab-body { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 230px minmax(0, 1fr) 260px; }
.ab-list { overflow-y: auto; border-right: 1px solid var(--rule); padding: 8px 0 24px; }
.ab-list section + section { margin-top: 6px; }
.ab-list h3 { font-family: var(--mono); font-weight: 500; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink); margin: 10px 16px 4px; }
.ab-list ul { list-style: none; margin: 0; padding: 0; }
.ab-list button { width: 100%; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; border: 0; background: none; text-align: left; padding: 4px 16px; font: inherit; font-size: 15.5px; color: var(--ink-deep); cursor: pointer; }
.ab-list button em { font-style: normal; font-family: var(--mono); font-size: 11px; color: var(--ink); opacity: .7; }
.ab-list button:hover { background: rgba(29,59,145,.07); }
.ab-list button.on { background: var(--ink-deep); color: var(--paper-hi); }
.ab-list button.on em { color: var(--paper-hi); }
.ab-list button:focus-visible, .ab button:focus-visible, .ab input:focus-visible, .ab select:focus-visible { outline: 2px solid var(--red); outline-offset: 1px; }
.ab-main { min-width: 0; display: flex; flex-direction: column; padding: 12px 16px 14px; gap: 10px; }
.ab-stage-wrap { flex: 1 1 auto; min-height: 240px; position: relative; border: 1.5px solid var(--ink-deep); background: var(--paper); }
.ab-stage-wrap canvas { position: absolute; inset: 0; display: block; }
.ab-scrub { position: relative; }
.ab-scrub canvas { display: block; width: 100%; height: 14px; }
.ab-scrub input { width: 100%; margin: 4px 0 0; accent-color: var(--ink-deep); }
.ab-transport, .ab-toggles { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; }
.ab-transport button, .ab-seg button { font: inherit; font-family: var(--mono); font-size: 13px; color: var(--ink-deep); background: var(--paper-hi); border: 1px solid var(--rule); border-radius: 3px; padding: 6px 12px; cursor: pointer; min-width: 40px; }
.ab-transport .ab-primary { background: var(--ink-deep); color: var(--paper-hi); border-color: var(--ink-deep); min-width: 76px; }
.ab-seg { display: inline-flex; }
.ab-seg button { border-radius: 0; margin-left: -1px; }
.ab-seg button:first-child { border-radius: 3px 0 0 3px; }
.ab-seg button:last-child { border-radius: 0 3px 3px 0; }
.ab-seg button.on { background: var(--ink); color: var(--paper-hi); border-color: var(--ink); }
.ab-fc { font-family: var(--mono); font-size: 13px; font-variant-numeric: tabular-nums; min-width: 92px; }
.ab-toggles label { display: inline-flex; align-items: center; gap: 6px; font-size: 15px; cursor: pointer; }
.ab-toggles input[type=checkbox] { accent-color: var(--ink-deep); width: 16px; height: 16px; }
.ab-charge input { width: 110px; accent-color: var(--red); }
.ab-skin { gap: 8px !important; }
.ab-skin span { font-family: var(--mono); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.ab-skin select { font: inherit; font-family: var(--body); font-size: 15px; color: var(--ink-deep); background: var(--paper-hi); border: 1px solid var(--rule); border-radius: 3px; padding: 4px 6px; }
.ab-info { border-left: 1px solid var(--rule); padding: 16px 18px 24px; overflow-y: auto; }
.ab-group { font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink); margin: 0; }
.ab-info h2 { font-family: var(--display); font-weight: 400; font-size: 26px; letter-spacing: .04em; margin: 4px 0 8px; line-height: 1.1; text-wrap: balance; }
.ab-notes { margin: 0 0 14px; line-height: 1.4; font-size: 16px; }
.ab-info dl { margin: 0; border-top: 1px solid var(--rule); }
.ab-row { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--rule); }
.ab-row dt { font-family: var(--mono); font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--ink); padding-top: 2px; }
.ab-row dd { margin: 0; font-variant-numeric: tabular-nums; font-size: 15.5px; }
.ab-keys { font-family: var(--mono); font-size: 11.5px; color: var(--ink); margin-top: 16px; opacity: .8; }
@media (max-width: 1080px) {
  .ab-body { grid-template-columns: 210px minmax(0, 1fr); }
  .ab-info { grid-column: 1 / -1; border-left: 0; border-top: 1px solid var(--rule); }
}
@media (max-width: 720px) {
  .ab { height: auto; min-height: 100%; }
  .ab-pick { display: flex; }
  .ab-body { display: flex; flex-direction: column; }
  .ab-list { display: none; }
  .ab-main { padding: 12px max(16px, env(safe-area-inset-right, 0px)) 12px max(16px, env(safe-area-inset-left, 0px)); }
  .ab-stage-wrap { min-height: 0; height: 62vw; max-height: 420px; flex: none; }
  .ab-info { padding: 14px max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px)); }
  .ab-name { font-size: 24px; }
}
`;
