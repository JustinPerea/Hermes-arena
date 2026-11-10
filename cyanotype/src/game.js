// ---------------------------------------------------------------------------
// Hermes Arena — game: screens (fighter select, fight, results), input,
// camera and the render loop. The rules of the fight are in src/match.js,
// which this class extends; fighters live in src/fighter.js.
// ---------------------------------------------------------------------------

const READY_FRAMES = 60; // READY ... GO before a fight

class Game extends Match {
  constructor(container, options) {
    options = options || {};
    // debug builds (play tests) skip straight into an endless training fight
    const quick = options.quickStart != null ? !!options.quickStart : !!options.debug;
    super(Object.assign({ stocks: quick ? Infinity : RULES.stocks }, options));
    this.container = container;
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Hermes Arena game canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:none;background:' + PAPER;
    container.appendChild(canvas);
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.kb = new Keyboard(canvas);
    this.sfx = new Sfx();
    this.bake = { bg: 0, altar: 0 };
    this.showBoxes = false;
    this.rafCount = 0;
    this.p2Joined = false;
    this.p2JoinHold = 0;
    this.p2LeaveHold = 0;
    // screens: 'select' (fighter select), 'fight', 'over' (results)
    this.scene = quick ? 'fight' : 'select';
    this.menu = [new Controller(), new Controller()];
    this.sel = {
      cursor: [0, 0],
      locked: [false, false],
      stockChoices: [1, 2, 3, 4, 5, Infinity],
      stockIdx: 2,
    };
    this.readyT = quick ? 999 : 0;
    this.overT = 0;
    this.cam = { x: 640, y: 400, zoom: 1.1 };
    this.pcam = Object.assign({}, this.cam);
    this.focused = false;
    this.hidden = false;
    this.destroyed = false;
    this.armSprite = null;
    this.helpT = 0;

    const st = this.options.storage;
    try {
      if (st && st.get) {
        const m = st.get('muted');
        if (m && typeof m.then === 'function') m.then((v) => (this.sfx.muted = !!v)).catch(() => {});
        else this.sfx.muted = !!m;
      }
    } catch (e) { /* storage optional */ }

    this.kb.listener = (code) => {
      this.sfx.ensure();
      this.helpT = 0;
      if (code === 'KeyH') {
        this.showBoxes = !this.showBoxes;
        for (const f of this.fighters) f.showBoxes = this.showBoxes;
      }
      const si = SKIN_KEYS.indexOf(code);
      if (si >= 0 && this.fighters && this.fighters[si]) {
        this.fighters[si].cycleSkin(this.kb.is('ShiftLeft') ? -1 : 1);
        this.sfx.play('select');
      }
      if (code === 'KeyM') {
        this.sfx.muted = !this.sfx.muted;
        try {
          if (st && st.set) st.set('muted', this.sfx.muted);
        } catch (e) { /* ignore */ }
      }
    };
    this.onPointer = () => {
      canvas.focus();
      this.sfx.ensure();
    };
    this.onFocus = () => (this.focused = true);
    this.onBlur = () => (this.focused = false);
    canvas.addEventListener('pointerdown', this.onPointer);
    canvas.addEventListener('focus', this.onFocus);
    canvas.addEventListener('blur', this.onBlur);

    this.resize = this.resize.bind(this);
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.resize) : null;
    if (this.ro) this.ro.observe(container);
    else window.addEventListener('resize', this.resize);
    this.resize();

    this.acc = 0;
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    if (this.options.autofocus !== false) this.focusTimer = setTimeout(() => !this.destroyed && canvas.focus(), 0);
  }
  resize() {
    const r = this.container.getBoundingClientRect();
    this.hidden = r.width < 2 || r.height < 2;
    if (this.hidden) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = r.width;
    this.ch = r.height;
    this.canvas.width = Math.round(this.cw * dpr);
    this.canvas.height = Math.round(this.ch * dpr);
    this.dpr = dpr;
    // re-bake the static layers at a resolution that matches the screen
    const need = Math.max(this.cw / VW, this.ch / VH) * dpr * 1.15;
    const bgScale = clamp(need * 0.75, 1, 1.8);
    if (!this.backdrop || bgScale > this.bake.bg * 1.15) {
      if (this.backdrop) this.backdrop.width = 0;
      this.backdrop = renderBackdrop(bgScale);
      this.bake.bg = bgScale;
    }
    const alScale = clamp(need * 1.3, 1.5, 3);
    if (!this.altar || alScale > this.bake.altar * 1.15) {
      if (this.altar) this.altar.width = 0;
      this.altar = renderAltar(this.stage, alScale);
      this.floor = renderFloor(this.stage, clamp(need, 1, 2));
      this.bake.altar = alScale;
    }
    // vignette baked once per size
    const vc = makeCanvas(this.canvas.width, this.canvas.height);
    const vg = vc.getContext('2d');
    const w = vc.width;
    const h = vc.height;
    const grd = vg.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.38, w / 2, h / 2, Math.max(w, h) * 0.78);
    grd.addColorStop(0, 'rgba(14,37,102,0)');
    grd.addColorStop(1, 'rgba(14,37,102,0.13)');
    vg.fillStyle = grd;
    vg.fillRect(0, 0, w, h);
    if (this.vignette) this.vignette.width = 0;
    this.vignette = vc;
  }
  loop(now) {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.rafCount++;
    if ((window.devicePixelRatio || 1) !== this.dprSeen) {
      this.dprSeen = window.devicePixelRatio || 1;
      this.resize();
    }
    let dt = now - this.last;
    this.last = now;
    if (this.hidden || (typeof document !== 'undefined' && document.hidden)) return;
    const idle = !this.focused && listGamepads().length === 0 && !this.options.alwaysRun;
    if (idle) {
      // unfocused: keep the scene alive at a low frame rate, don't simulate input
      this.acc = 0;
      if (this.rafCount % 6 === 0) {
        this.ambient();
        this.render(1);
      }
      return;
    }
    if (dt > 250) dt = 250;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.step();
      this.acc -= STEP;
      steps++;
    }
    if (this.acc >= STEP) this.acc = this.acc % STEP;
    this.render(this.acc / STEP);
  }
  ambient() {
    this.time += 0.1;
    if (this.rafCount % 24 === 0) this.bakeArmillary();
    for (const f of this.fighters) {
      f.time += 0.1;
      f.px = f.x;
      f.py = f.y;
    }
  }
  readInputs() {
    const pads = listGamepads();
    const pad1 = readGamepad(pads[0]);
    const pad2 = readGamepad(pads[1]);
    // P2 joins by holding Right Shift (or Numpad Enter / a second gamepad's face button)
    const k2 = this.kb.read('p2');
    if (!this.p2Joined) {
      this.p2JoinHold = this.kb.is('ShiftRight') ? this.p2JoinHold + 1 : 0;
      const padJoin = pad2 && (pad2.attack || pad2.special || pad2.jump);
      if (this.p2JoinHold > 20 || k2.start || padJoin) {
        this.p2Joined = true;
        this.fighters[1].ctrl.clear();
        this.sfx.play('confirm');
        return null;
      }
    } else {
      this.p2LeaveHold = k2.back ? this.p2LeaveHold + 1 : 0;
      if (this.p2LeaveHold > 60) {
        this.p2Joined = false;
        this.p2LeaveHold = 0;
      }
    }
    const k1 = this.kb.read('p1');
    const k1alt = this.p2Joined ? null : this.kb.read('p1alt');
    return {
      p1: mergeRaw(mergeRaw(k1, k1alt), pad1),
      p2: this.p2Joined ? mergeRaw(k2, pad2) : null,
    };
  }
  step() {
    this.frame++;
    this.time += 1 / 60;
    this.helpT++;
    const inp = this.readInputs();
    this.menu[0].feed(inp ? inp.p1 : null);
    this.menu[1].feed(inp ? inp.p2 : null);
    this.kb.endFrame();
    if (this.scene === 'select') this.selectStep();
    else {
      // inputs are locked during READY and after the last stock falls
      const live = this.scene === 'fight' && this.readyT >= READY_FRAMES;
      this.fighters.forEach((f, i) => f.ctrl.feed(live && inp ? (i === 0 ? inp.p1 : i === 1 ? inp.p2 : null) : null));
      this.readyT++;
      this.simulate();
      if (this.scene === 'fight' && this.result) {
        this.scene = 'over';
        this.overT = 0;
        this.sfx.play('ko');
      }
      if (this.scene === 'over') this.overStep();
      // hold Enter (or a pad's Start) to leave the fight for fighter select
      this.quitHold = this.menu[0].held.start ? (this.quitHold || 0) + 1 : 0;
      if (this.quitHold > 45) this.toSelect();
    }
    this.pcam = Object.assign({}, this.cam);
    this.updateCamera();
    if (this.frame % 4 === 0 || !this.armSprite) this.bakeArmillary();
    if (this.options.debug) this.debugState = { frame: this.frame, scene: this.scene, fighters: this.fighters.map((f) => ({ x: f.x, y: f.y, vx: f.vx, vy: f.vy, state: f.state, anim: f.anim, f: Math.floor(f.animF), damage: f.damage, stocks: f.stocks, ground: !!f.ground })) };
  }
  inPlay(f) {
    // the dummy can be hit unless the host hides it
    return f.slot === 0 || this.p2Joined || this.options.showP2 !== false;
  }
  // ---- fighter select -------------------------------------------------------------
  selectStep() {
    const S = this.sel;
    const n = FIGHTER_ROSTER.length;
    const players = this.p2Joined ? 2 : 1;
    for (let i = 0; i < players; i++) {
      const c = this.menu[i];
      if (!S.locked[i]) {
        if (c.take('left', 8)) (S.cursor[i] = (S.cursor[i] + n - 1) % n), this.sfx.play('step');
        if (c.take('right', 8)) (S.cursor[i] = (S.cursor[i] + 1) % n), this.sfx.play('step');
        if (c.take('attack') || c.take('jump')) {
          if (fighterPlayable(FIGHTER_ROSTER[S.cursor[i]].id)) {
            S.locked[i] = true;
            this.sfx.play('confirm');
          } else this.sfx.play('hit', 0.3);
        }
      } else if (c.take('special') || c.take('back')) {
        S.locked[i] = false;
      }
    }
    if (!this.p2Joined) {
      S.locked[1] = false;
      S.cursor[1] = S.cursor[0]; // the training dummy mirrors P1's pick
    }
    // stock count: P1 up and down
    const c1 = this.menu[0];
    const m = S.stockChoices.length;
    if (c1.take('up', 8)) S.stockIdx = (S.stockIdx + 1) % m;
    if (c1.take('down', 8)) S.stockIdx = (S.stockIdx + m - 1) % m;
    const ready = S.locked[0] && (!this.p2Joined || S.locked[1]);
    if (ready && (c1.take('start') || c1.take('attack') || c1.take('jump') || this.menu[1].take('start'))) this.startFight();
  }
  startFight() {
    const S = this.sel;
    const ids = [0, 1].map((i) => FIGHTER_ROSTER[S.cursor[i]].id).map((id) => (fighterPlayable(id) ? id : 'hermes'));
    this.setupMatch(ids, S.stockChoices[S.stockIdx]);
    for (const f of this.fighters) f.showBoxes = this.showBoxes;
    this.scene = 'fight';
    this.readyT = 0;
    this.helpT = 0;
    this.sfx.play('confirm');
  }
  rematch() {
    this.setupMatch(this.fighters.map((f) => f.def.id), this.stocks);
    for (const f of this.fighters) f.showBoxes = this.showBoxes;
    this.scene = 'fight';
    this.readyT = 0;
  }
  toSelect() {
    this.scene = 'select';
    this.sel.locked = [false, false];
    this.menu.forEach((c) => c.clear());
  }
  // ---- results ----------------------------------------------------------------------
  overStep() {
    this.overT++;
    const w = this.result.winner;
    if (w && this.overT === 70 && w.ground && w.state !== 'move') {
      const pick = ['win1', 'win2', 'win3'].filter((n) => w.has(n));
      if (pick.length) w.startMove(pick[this.matchFrame % pick.length], this);
    }
    if (w && w.move && /^win/.test(w.move.name) && w.move.f >= w.moveDef().frames - 1) w.move.f = w.moveDef().frames - 1; // hold the last pose
    if (this.overT < 70) return;
    const c = this.menu[0];
    if (c.take('attack') || c.take('jump') || c.take('start')) return this.rematch();
    if (c.take('special') || c.take('back') || this.menu[1].take('special')) return this.toSelect();
  }
  updateCamera() {
    const B = this.stage.camBounds;
    let minX = 420;
    let maxX = 860;
    let minY = 452 - 60;
    let maxY = 452;
    for (const f of this.fighters) {
      if (this.scene === 'select' || f.out || !this.inPlay(f)) continue;
      const x = clamp(f.x, B.l + 150, B.r - 150);
      const y = clamp(f.y - 60, B.t + 120, B.b - 200);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const w = maxX - minX + 2 * 190;
    const h = maxY - minY + 2 * 200;
    const zoom = clamp(Math.min(VW / w, VH / h), 0.8, 1.25);
    let tx = (minX + maxX) / 2;
    let ty = (minY + maxY) / 2 + 10;
    const hwv = VW / 2 / zoom;
    const hhv = VH / 2 / zoom;
    tx = B.r - B.l < hwv * 2 ? (B.l + B.r) / 2 : clamp(tx, B.l + hwv, B.r - hwv);
    ty = B.b - B.t < hhv * 2 ? (B.t + B.b) / 2 : clamp(ty, B.t + hhv, B.b - hhv);
    this.cam.zoom = lerp(this.cam.zoom, zoom, 0.06);
    this.cam.x = lerp(this.cam.x, tx, 0.08);
    this.cam.y = lerp(this.cam.y, ty, 0.08);
  }
  bakeArmillary() {
    const R = 190;
    const sc = Math.min(2, Math.max(1, this.bake.bg));
    const w = (R + 60) * 2;
    const h = R * 2 + 230;
    if (!this.armSprite || this.armSprite.scaleUsed !== sc) {
      this.armSprite = makeCanvas(w * sc, h * sc);
      this.armSprite.scaleUsed = sc;
    }
    const g = this.armSprite.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.armSprite.width, this.armSprite.height);
    g.scale(sc, sc);
    drawArmillary(g, w / 2, R + 120, R, this.time, 1);
    this.armSprite.ox = 640 - w / 2;
    this.armSprite.oy = 200 - (R + 120);
    this.armSprite.w = w;
    this.armSprite.h = h;
  }
  // world -> screen transform for a parallax depth (1 = world plane). Background
  // layers use a cover fit so odd pane shapes never show their edges.
  applyView(depth, cam) {
    const g = this.g;
    const fit = depth < 1 ? Math.max(this.cw / VW, this.ch / VH) : Math.min(this.cw / VW, this.ch / VH);
    const s = fit * this.dpr;
    const z = 1 + (cam.zoom - 1) * depth;
    const cx = lerp(640, cam.x, depth);
    const cy = lerp(400, cam.y, depth);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(this.canvas.width / 2, this.canvas.height / 2);
    g.scale(s * z, s * z);
    g.translate(-cx, -cy);
  }
  render(a) {
    const g = this.g;
    const sh = this.shake > 0 ? this.shake * 0.6 : 0;
    const cam = {
      x: lerp(this.pcam.x, this.cam.x, a) + (sh ? Math.sin(this.frame * 2.7) * sh : 0),
      y: lerp(this.pcam.y, this.cam.y, a) + (sh ? Math.cos(this.frame * 3.1) * sh : 0),
      zoom: lerp(this.pcam.zoom, this.cam.zoom, a),
    };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.imageSmoothingEnabled = true;

    // background (parallax)
    this.applyView(0.35, cam);
    g.drawImage(this.backdrop, BG_X0, BG_Y0, BG_W, BG_H);
    if (!this.armSprite) this.bakeArmillary();
    g.save();
    g.globalAlpha = 0.42;
    g.drawImage(this.armSprite, this.armSprite.ox, this.armSprite.oy, this.armSprite.w, this.armSprite.h);
    g.restore();

    // world
    this.applyView(1, cam);
    const F = this.floor;
    g.drawImage(F, F.x0, F.y0, F.w, F.h);
    const A = this.stage.art;
    g.drawImage(this.altar, A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
    for (const p of this.stage.plats) drawLintel(g, INK.blue, p);
    for (const fx of this.fx) {
      if (fx.type === 'dust') drawDust(g, fx.ink, fx);
      else if (fx.type === 'ring') drawRing(g, fx.ink, fx);
      else if (fx.type === 'spark') fxSpark(g, fx.ink, fx.x, fx.y, fx.r, fx.t / fx.life, 1);
      else if (fx.type === 'proj' || fx.type === 'anim') {
        const book = ANIMS[fx.char] || {};
        const def = book[fx.anim];
        if (!def) continue;
        const f = def.loop ? fx.f % def.frames : Math.min(fx.f, def.frames);
        const px = fx.type === 'proj' ? fx.x - fx.vx * (1 - a) : fx.x;
        drawAnimFrame(g, fx.char, def, f, px, fx.y, { face: fx.face, ink: fx.ink, time: this.time, scale: FIGHTER_DEFS.hermes.scale, boxes: this.showBoxes, skin: fx.owner && fx.owner.skin });
      }
    }
    // P1 drawn last so it sits on top
    const shown = this.scene === 'select' ? [] : this.fighters.filter((f) => !f.out && this.inPlay(f));
    for (let i = shown.length - 1; i >= 0; i--) shown[i].draw(g, a);
    for (const f of shown) this.drawTag(g, f);

    // screen-space overlay
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.vignette, 0, 0);
    const s = Math.min(this.cw / VW, this.ch / VH) * this.dpr;
    g.translate((this.canvas.width - VW * s) / 2, (this.canvas.height - VH * s) / 2);
    g.scale(s, s);
    if (this.scene === 'select') this.drawSelect(g);
    else {
      this.drawHud(g);
      this.drawStatus(g);
      if (this.readyT < READY_FRAMES + 40) this.drawBanner(g, this.readyT < READY_FRAMES ? 'READY' : 'GO', this.readyT < READY_FRAMES ? 1 : 1 - (this.readyT - READY_FRAMES) / 40);
      if (this.scene === 'over') this.drawResults(g);
    }
  }
  playerLabel(f) {
    return f.slot === 0 ? 'P1' : f.slot === 1 && !this.p2Joined ? 'DUMMY' : 'P' + (f.slot + 1);
  }
  drawTag(g, f) {
    const who = this.playerLabel(f);
    let label = f.damage > 0 ? `${who} · ${Math.round(f.damage)}%` : who;
    if (f.skinFlash > 0) {
      const s = getSkin(f.skin, f.def.anim);
      label = `${who} · ${(s ? s.name : f.skin).toUpperCase()}`;
    }
    const x = f.headTop ? f.headTop[0] : f.x;
    const y = (f.headTop ? Math.min(f.headTop[1], f.y - f.def.h) : f.y - f.def.h) - 18;
    g.save();
    g.fillStyle = f.ink;
    g.beginPath();
    g.moveTo(x - 5, y + 4);
    g.lineTo(x + 5, y + 4);
    g.lineTo(x, y + 10);
    g.closePath();
    g.fill();
    inkText(g, label, x, y, 13, f.ink, { weight: 700, spacing: 1 });
    g.restore();
  }
  drawHud(g) {
    inkText(g, 'HERMES ARENA', 28, 44, 26, INK.blue, { hatch: 'cross', spacing: 5, align: 'left' });
    const names = [...new Set(this.fighters.map((f) => f.def.name.toUpperCase()))].join(' VS ');
    const mode = isFinite(this.stocks) ? `${this.stocks} STOCK${this.stocks > 1 ? 'S' : ''}` : 'TRAINING';
    inkText(g, `${names} · ${mode} · ${this.stage.name.toUpperCase()}`, 30, 64, 11, INK.blue, { weight: 400, spacing: 3, align: 'left', color: rgba(INK.blue, 0.85) });
    // controls help: bottom-left, fades after a while without input
    const alpha = clamp(1 - (this.helpT - 600) / 120, 0.18, 1);
    const lines = this.p2Joined
      ? ['P1  WASD · Space jump · J attack · K special · I smash · L shield · U grab · T taunt',
        'P2  Arrows · R-Shift jump · , attack · . special · ; smash · / shield · \' grab · ] taunt · hold \\ to leave', 'H hitboxes · M mute · 1 / 2 change P1 / P2 look · hold Enter: fighter select']
      : ['WASD or arrows move · Space jump · J attack · K special · I smash (hold to charge)',
        'L shield (+ direction to dodge, in air to air-dodge) · U grab · T taunt · S fast-fall or drop',
        'Attack and special change with direction · H hitboxes · M mute · 1 / 2 change P1 / P2 look · hold Enter: fighter select'];
    g.save();
    g.globalAlpha = alpha;
    lines.forEach((t, i) => inkText(g, t, 30, 668 + i * 16, 12, INK.blue, { weight: 400, spacing: 0.5, align: 'left', color: rgba(INK.blueDeep, 0.9) }));
    g.restore();
    if (!this.focused) {
      g.save();
      g.fillStyle = 'rgba(230,233,230,0.88)';
      g.fillRect(450, 316, 380, 66);
      g.strokeStyle = INK.blueDeep;
      g.lineWidth = 1.6;
      g.strokeRect(450, 316, 380, 66);
      g.lineWidth = 0.8;
      g.strokeRect(455, 321, 370, 56);
      inkText(g, 'CLICK TO PLAY', 640, 357, 22, INK.blueDeep, { spacing: 5 });
      g.restore();
    }
  }
  // damage and stocks for each fighter along the bottom
  drawStatus(g) {
    const list = this.fighters.filter((f) => this.inPlay(f));
    const w = 200;
    const x0 = VW / 2 - (list.length * w) / 2 + w / 2;
    list.forEach((f, i) => {
      const x = x0 + i * w + 260;
      const y = 650;
      this.drawPanel(g, x - w / 2 + 12, y - 52, w - 24, 84);
      g.save();
      g.globalAlpha = f.out ? 0.35 : 1;
      inkText(g, `${this.playerLabel(f)} · ${f.def.name.toUpperCase()}`, x, y - 34, 11, f.ink, { weight: 700, spacing: 2 });
      inkText(g, `${Math.round(f.damage)}%`, x, y, 30, f.ink, { spacing: 1 });
      if (isFinite(f.stocks)) {
        for (let k = 0; k < Math.max(f.stocks, 0); k++) {
          g.fillStyle = f.ink;
          g.beginPath();
          g.arc(x - (f.stocks - 1) * 9 + k * 18, y + 16, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    });
  }
  drawBanner(g, text, alpha) {
    g.save();
    g.globalAlpha = clamp(alpha, 0, 1);
    inkText(g, text, VW / 2, VH / 2 - 60, 64, INK.blueDeep, { hatch: 'cross', spacing: 12 });
    g.restore();
  }
  drawPanel(g, x, y, w, h) {
    g.save();
    g.fillStyle = 'rgba(230,233,230,0.92)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = INK.blueDeep;
    g.lineWidth = 1.6;
    g.strokeRect(x, y, w, h);
    g.lineWidth = 0.8;
    g.strokeRect(x + 5, y + 5, w - 10, h - 10);
    g.restore();
  }
  drawResults(g) {
    const w = this.result.winner;
    const a = clamp(this.overT / 30, 0, 1);
    g.save();
    g.globalAlpha = a;
    this.drawPanel(g, 400, 92, 480, 140);
    inkText(g, 'GAME', VW / 2, 140, 34, INK.blueDeep, { hatch: 'cross', spacing: 10 });
    const who = w ? `${this.playerLabel(w)} · ${w.def.name.toUpperCase()} WINS` : 'NO CONTEST';
    inkText(g, who, VW / 2, 176, 18, w ? w.ink : INK.blueDeep, { spacing: 3 });
    if (this.overT >= 70) inkText(g, 'J or Space: rematch  ·  K: fighter select', VW / 2, 210, 12, INK.blueDeep, { weight: 400, spacing: 1 });
    g.restore();
  }
  drawSelect(g) {
    const S = this.sel;
    const n = FIGHTER_ROSTER.length;
    const cw = 210;
    const ch = 270;
    const gap = 22;
    const x0 = VW / 2 - (n * cw + (n - 1) * gap) / 2;
    const y0 = 150;
    // wash the stage out behind the menu
    g.save();
    g.fillStyle = 'rgba(230,233,230,0.78)';
    g.fillRect(-VW, -VH, VW * 3, VH * 3);
    g.restore();
    inkText(g, 'HERMES ARENA', VW / 2, 70, 40, INK.blue, { hatch: 'cross', spacing: 8 });
    inkText(g, 'CHOOSE YOUR FIGHTER', VW / 2, 108, 14, INK.blueDeep, { spacing: 5 });
    FIGHTER_ROSTER.forEach((r, i) => {
      const x = x0 + i * (cw + gap);
      const ok = fighterPlayable(r.id);
      this.drawPanel(g, x, y0, cw, ch);
      if (ok) {
        const def = FIGHTER_DEFS[r.id];
        const book = ANIMS[def.anim];
        const idle = book.idle;
        drawAnimFrame(g, def.anim, idle, (this.frame * 0.5) % idle.frames, x + cw / 2, y0 + 190, { face: 1, ink: INK.blue, time: this.time, scale: def.scale * 0.72 });
      } else {
        inkText(g, '?', x + cw / 2, y0 + 140, 72, rgba(INK.blue, 0.35), { hatch: 'cross' });
        inkText(g, 'COMING SOON', x + cw / 2, y0 + 180, 11, rgba(INK.blueDeep, 0.7), { weight: 400, spacing: 3 });
      }
      inkText(g, r.name.toUpperCase(), x + cw / 2, y0 + 222, 20, INK.blueDeep, { spacing: 4 });
      inkText(g, r.role, x + cw / 2, y0 + 244, 11, INK.blueDeep, { weight: 400, spacing: 1 });
    });
    // player cursors
    const players = this.p2Joined ? 2 : 1;
    for (let p = 0; p < 2; p++) {
      const i = S.cursor[p];
      const x = x0 + i * (cw + gap) + (p === 0 ? 30 : cw - 30);
      const y = y0 - 14;
      const ink = SLOT_INKS[p];
      const label = p === 0 ? 'P1' : players > 1 ? 'P2' : 'DUMMY';
      g.save();
      g.globalAlpha = p === 1 && players < 2 ? 0.55 : 1;
      inkText(g, label + (S.locked[p] ? ' ✓' : ''), x, y, 14, ink, { weight: 700, spacing: 1 });
      g.fillStyle = ink;
      g.beginPath();
      g.moveTo(x - 6, y + 5);
      g.lineTo(x + 6, y + 5);
      g.lineTo(x, y + 12);
      g.closePath();
      g.fill();
      if (S.locked[p]) {
        g.strokeStyle = ink;
        g.lineWidth = 3;
        g.strokeRect(x0 + i * (cw + gap) - 4 - p * 4, y0 - 4 - p * 4, cw + 8 + p * 8, ch + 8 + p * 8);
      }
      g.restore();
    }
    // rules and help
    const st = S.stockChoices[S.stockIdx];
    this.drawPanel(g, VW / 2 - 330, y0 + ch + 22, 660, 112);
    inkText(g, `STOCKS  ◂ ${isFinite(st) ? st : '∞  TRAINING'} ▸`, VW / 2, y0 + ch + 50, 16, INK.blueDeep, { spacing: 3 });
    const ready = S.locked[0] && (!this.p2Joined || S.locked[1]);
    const lines = ready
      ? ['Press J, Space or Enter to fight', 'K to change fighter']
      : ['A / D choose · J or Space confirm · K back · W / S change stocks',
        this.p2Joined ? 'P2: arrows choose · , confirm · . back · hold \\ to leave' : 'Player 2: hold Right Shift to join (otherwise you fight a training dummy)'];
    lines.forEach((t, i) => inkText(g, t, VW / 2, y0 + ch + 84 + i * 20, 12, INK.blueDeep, { weight: 400, spacing: 0.5 }));
    if (!this.focused) {
      this.drawPanel(g, 450, 316, 380, 66);
      inkText(g, 'CLICK TO PLAY', 640, 357, 22, INK.blueDeep, { spacing: 5 });
    }
  }
  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.focusTimer);
    this.kb.destroy();
    this.sfx.close();
    this.canvas.removeEventListener('pointerdown', this.onPointer);
    this.canvas.removeEventListener('focus', this.onFocus);
    this.canvas.removeEventListener('blur', this.onBlur);
    if (this.ro) this.ro.disconnect();
    else window.removeEventListener('resize', this.resize);
    for (const c of [this.backdrop, this.altar, this.floor, this.vignette, this.armSprite]) if (c) c.width = 0;
    this.canvas.width = 0;
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}

function createArena(container, options) {
  const game = new Game(container, options);
  return {
    destroy: () => game.destroy(),
    get state() {
      return game.debugState;
    },
    _game: options && options.debug ? game : undefined,
  };
}
