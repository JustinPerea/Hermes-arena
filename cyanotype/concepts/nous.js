// ---------------------------------------------------------------------------
// Hermes Arena — concept "Nous Hermes" (cyanotype)
// The Hermes Desktop mascot redrawn as a fighter: rounded steel helmet with
// feathered wings and a shadowed visor, blue scarf over the face, gold domed
// pauldrons and bracers, blue tunic with gold trim and the winged sigil,
// leather belt and tabard, gold greave-boots, a layered feather mantle (long
// blue flight feathers under a short cream cape) and the gold winged caduceus
// with its blue orb.
// Rendered as a cyanotype: tones are painted in engraving hatching, then the
// whole figure is thresholded through a grain field so every tone becomes
// blue stipple on cream paper, like the Hermes Desktop backdrop print.
// Proportions come from window.NOUS_BUILD (see the two variant headers).
// Rig: same 2-bone IK rig as the Herald concept (pelvis, torso, head, limbs).
// ---------------------------------------------------------------------------
(function () {
  const BUILD = window.NOUS_BUILD || { name: 'Nous Hermes', tagline: '', leg: 1, torso: 1, head: 1.1, staff: 1, mantle: 1 };
  const CY = '#2c69ad';        // cyanotype blue (Hermes Desktop backdrop)
  const CY_DEEP = '#173f78';
  const PAPER_LIGHT = '#fbf8e3'; // cream paper
  const deepInk = (ink) => (ink === CY ? CY_DEEP : DEEP[ink] || ink);
  const LT = [-0.55, -0.83]; // unit vector toward the light
  const R2D = 180 / Math.PI;
  const TONE = 1.18; // global line-weight multiplier for the tonal hatching

  // ---- vector + frame helpers ----------------------------------------------
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, s) => [a[0] * s, a[1] * s];
  const len = (a) => Math.hypot(a[0], a[1]);
  const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
  const angOf = (a) => Math.atan2(a[1], a[0]) * R2D;
  const vdeg = (d) => [Math.cos(d * D2R), Math.sin(d * D2R)];
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

  // frame: origin o, rotation deg (screen, clockwise positive), scale s, flipY
  function frame(o, deg, s, flip) {
    const c = Math.cos(deg * D2R), sn = Math.sin(deg * D2R);
    const k = s || 1, f = flip ? -1 : 1;
    const F = (x, y) => {
      const yy = y * f;
      return [o[0] + (x * c - yy * sn) * k, o[1] + (x * sn + yy * c) * k];
    };
    F.deg = deg; F.k = k; F.flip = f;
    F.pts = (arr) => arr.map((p) => { const q = F(p[0], p[1]); if (p[2]) q.push(p[2]); return q; });
    return F;
  }

  // smooth closed (or open) path through points; p[2] === 1 marks a sharp corner
  function pathOf(pts, closed, P) {
    P = P || new Path2D();
    const n = pts.length;
    if (n < 2) return P;
    if (closed === false) {
      P.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) {
        const m = mix(pts[i], pts[i + 1], 0.5);
        P.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
      }
      P.lineTo(pts[n - 1][0], pts[n - 1][1]);
      return P;
    }
    const start = pts[0][2] ? pts[0] : mix(pts[n - 1], pts[0], 0.5);
    P.moveTo(start[0], start[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      if (p[2]) { P.lineTo(p[0], p[1]); continue; }
      const m = q[2] ? q : mix(p, q, 0.5);
      P.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    P.closePath();
    return P;
  }
  const shift = (pts, d) => pts.map((p) => { const q = [p[0] + d[0], p[1] + d[1]]; if (p[2]) q.push(p[2]); return q; });
  function bbox(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return [x0, y0, x1, y1];
  }

  // ---- engraving primitives --------------------------------------------------
  // parallel (optionally bowed) lines inside the current clip
  function lines(g, ink, box, ang, sp, w, alpha, bow, phase) {
    const a = ang * D2R, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    const R = Math.hypot(box[2] - box[0], box[3] - box[1]) / 2 + 2;
    g.strokeStyle = ink; g.lineWidth = w; g.lineCap = 'butt';
    g.globalAlpha = alpha;
    g.beginPath();
    for (let o = -R + (phase || 0) * sp; o <= R; o += sp) {
      const px = cx + nx * o, py = cy + ny * o;
      g.moveTo(px - dx * R, py - dy * R);
      if (bow) g.quadraticCurveTo(px + nx * bow * R * 0.12, py + ny * bow * R * 0.12, px + dx * R, py + dy * R);
      else g.lineTo(px + dx * R, py + dy * R);
    }
    g.stroke();
  }
  // clip to band of the shape: inside P, inside shape shifted by a*LT, outside shape shifted by b*LT
  function bandClip(g, pts, P, a, b) {
    g.clip(P);
    if (a) g.clip(pathOf(shift(pts, mul(LT, a))));
    if (b != null) {
      const Q = new Path2D();
      Q.rect(-1e4, -1e4, 2e4, 2e4);
      pathOf(shift(pts, mul(LT, b)), true, Q);
      g.clip(Q, 'evenodd');
    }
  }
  // Tonal engraved surface.
  //  o.ang hatch angle, o.sp spacing, o.w line width, o.base alpha of the base tone,
  //  o.sh shadow depth (doubles the line density there), o.cross cross-hatch angle in shadow,
  //  o.core deep-shadow depth (solid-ish), o.hl reserved highlight band [from,to],
  //  o.lw outline width, o.bow line bow, o.dark extra flat tint.
  function tone(g, ink, pts, o) {
    const P = pathOf(pts);
    const box = bbox(pts);
    const ga = g.globalAlpha;
    g.save();
    g.fillStyle = o.fill || PAPER_LIGHT;
    g.fill(P);
    g.clip(P);
    if (o.dark) { g.globalAlpha = o.dark; g.fillStyle = ink; g.fill(P); }
    const sp = o.sp || 1.5, w = (o.w || 0.42) * TONE;
    if (o.base) lines(g, ink, box, o.ang || 0, sp, w, ga * Math.min(1, o.base * 1.12), o.bow || 0, 0);
    g.restore();
    if (o.sh) {
      g.save();
      bandClip(g, pts, P, 0, o.sh);
      lines(g, ink, box, o.ang || 0, sp, w * 1.15, ga * 0.95, o.bow || 0, 0.5);
      if (o.cross != null) lines(g, ink, box, o.cross, sp * 1.1, w, ga * 0.85, 0, 0);
      g.restore();
    }
    if (o.core) {
      g.save();
      bandClip(g, pts, P, o.rim || 0, o.core);
      g.globalAlpha = ga * 0.78;
      g.fillStyle = deepInk(ink);
      g.fillRect(box[0] - 2, box[1] - 2, box[2] - box[0] + 4, box[3] - box[1] + 4);
      g.restore();
    }
    if (o.hl) {
      g.save();
      bandClip(g, pts, P, -o.hl[0], -o.hl[1]);
      g.globalAlpha = ga * 0.92;
      g.fillStyle = PAPER_LIGHT;
      g.fillRect(box[0] - 2, box[1] - 2, box[2] - box[0] + 4, box[3] - box[1] + 4);
      g.restore();
    }
    if (o.lw !== 0) {
      g.save();
      g.globalAlpha = ga;
      g.strokeStyle = o.stroke || ink;
      g.lineWidth = o.lw || 0.9;
      g.lineJoin = 'round';
      g.stroke(P);
      g.restore();
    }
    return P;
  }
  function stroke(g, ink, pts, w, alpha, closed) {
    g.save();
    g.globalAlpha *= alpha == null ? 1 : alpha;
    g.strokeStyle = ink; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    g.stroke(pathOf(pts, closed === true));
    g.restore();
  }

  // ---- display list: every solid part is stroked heavy first (silhouette pass),
  // then painted in order, so only the outer contour keeps the heavy line --------
  function List() {
    const items = [];
    return {
      part(pts, paint, opt) { items.push({ pts, paint, sil: !(opt && opt.noSil), cast: opt && opt.cast != null ? opt.cast : 0.42 }); },
      extra(paint) { items.push({ paint, sil: false, cast: 0 }); },
      render(g, ink) {
        g.save();
        g.strokeStyle = deepInk(ink);
        g.lineJoin = 'round';
        g.lineWidth = 2.5;
        for (const it of items) if (it.sil && it.pts) g.stroke(pathOf(it.pts));
        g.restore();
        for (const it of items) {
          if (it.cast && it.pts) {
            // cast shadow of this part onto whatever is already drawn underneath
            g.save();
            g.globalCompositeOperation = 'source-atop';
            g.globalAlpha = it.cast;
            g.fillStyle = deepInk(ink);
            g.fill(pathOf(shift(it.pts, [1.5, 2.1])));
            g.restore();
          }
          g.save(); it.paint(g); g.restore();
        }
      },
    };
  }

  // ---- IK -----------------------------------------------------------------------
  function ik(A, T, L1, L2, pref) {
    let d = sub(T, A);
    let D = len(d);
    const maxD = L1 + L2 - 0.01;
    if (D > maxD) { d = mul(d, maxD / D); D = maxD; }
    const T2 = add(A, d);
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const M = add(A, mul(d, a / D));
    const p = [-d[1] / D, d[0] / D];
    const k1 = add(M, mul(p, h)), k2 = sub(M, mul(p, h));
    const s1 = (k1[0] - M[0]) * pref[0] + (k1[1] - M[1]) * pref[1];
    return { mid: s1 >= 0 ? k1 : k2, end: T2 };
  }

  // limb outline from a to b. prof rows: [t, wPlus, wMinus], plus side = n = (-dy, dx)
  function limbPts(a, b, prof) {
    const d = nrm(sub(b, a)), L = len(sub(b, a));
    const n = [-d[1], d[0]];
    const P = [], M = [];
    for (const [t, wp, wm] of prof) {
      const c = add(a, mul(d, t * L));
      P.push(add(c, mul(n, wp)));
      M.push(sub(c, mul(n, wm)));
    }
    const endCap = add(b, mul(d, prof[prof.length - 1][1] * 0.55));
    const startCap = sub(a, mul(d, prof[0][1] * 0.45));
    return [startCap, ...P, endCap, ...M.reverse()];
  }


  // ---- materials ---------------------------------------------------------------
  // Cyanotype has one ink, so materials are told apart by value and texture:
  // blue cloth is dark and matte, gold is light with hard highlights and deep
  // cores, steel is light with a broad sheen, cream feathers are nearly paper.
  const MATS = {
    cloth: { base: 1, dark: 0.5, sh: 6, core: 3, rim: 0.8 },
    leather: { base: 1, dark: 0.5, sh: 2.4, core: 1.4 },
    gold: { base: 0.55, sh: 3.6, core: 2.2, rim: 0.6, hl: [0.7, 2.4] },
    steel: { base: 0.45, sh: 6, core: 3, rim: 1, hl: [1.2, 5.5] },
    cream: { base: 0.22, sh: 1.6, core: 0.6 },
    skin: { base: 0.42, sh: 2.4, core: 1.3 },
    orb: { base: 1, dark: 0.55, sh: 2.4, core: 1.6, hl: [0.9, 2.2] },
  };
  function mat(name, far, extra) {
    const m = Object.assign({}, MATS[name]);
    if (far) {
      m.dark = (m.dark || 0) + 0.18;
      m.base = Math.min(1, (m.base || 0.5) + 0.25);
      m.sh = (m.sh || 2) * 1.4;
      m.core = (m.core || 1) * 1.4;
      m.hl = null;
    }
    return Object.assign(m, extra || {});
  }

  // ---- poses -----------------------------------------------------------------
  // staff in the FAR (lead) hand so the chest and sigil stay open to view
  const POSES = {
    stand: {
      pel: [2, -73], lean: 6, tilt: 4, head: -2,
      ankleN: [-27, -7], footN: -5, ankleF: [29, -7], footF: 3,
      grip: [40, -110], staffAng: -84, gripU: 50, handN: [-10, -90],
      cloak: 0.15,
    },
    action: {
      pel: [-14, -66], lean: 24, tilt: 10, head: -12,
      ankleN: [-62, -6], footN: -16, ankleF: [28, -7], footF: 0,
      grip: [60, -104], staffAng: -10, gripU: 50, handN: [-40, -100],
      cloak: 1,
    },
    run: {
      pel: [0, -82], lean: 20, tilt: 6, head: -10,
      ankleN: [-38, -28], footN: 38, ankleF: [30, -11], footF: 10,
      grip: [34, -112], staffAng: -24, gripU: 50, handN: [-28, -102],
      cloak: 0.85,
    },
  };

  const LEN = { thigh: 40, shin: 39, upper: 27, fore: 24, staff: 112 };

  function solve(p) {
    const pel = [p.pel[0], p.pel[1] * BUILD.leg];
    const up = (q) => [q[0], pel[1] + (q[1] - p.pel[1]) * BUILD.torso + (pel[1] - p.pel[1]) * 0];
    const TF = frame(pel, p.lean, BUILD.torso);
    const PF = frame(pel, p.tilt, BUILD.torso);
    const S = { TF, PF, pel };
    S.neck = TF(3, -54);
    S.shN = TF(-11, -48);
    S.shF = TF(15, -50);
    S.hipN = PF(-5, 2);
    S.hipF = PF(8, 0);
    S.headO = TF(4, -55);
    S.headAng = p.lean * 0.4 + p.head;
    const aN = [p.ankleN[0], p.ankleN[1] * BUILD.leg], aF = [p.ankleF[0], p.ankleF[1] * BUILD.leg];
    const legN = ik(S.hipN, aN, LEN.thigh * BUILD.leg, LEN.shin * BUILD.leg, [1, -0.1]);
    const legF = ik(S.hipF, aF, LEN.thigh * BUILD.leg, LEN.shin * BUILD.leg, [1, -0.1]);
    S.kneeN = legN.mid; S.ankN = legN.end; S.kneeF = legF.mid; S.ankF = legF.end;
    const grip = up(p.grip), handN = up(p.handN);
    const sd = vdeg(p.staffAng);
    S.staffDir = sd;
    S.staffLen = LEN.staff * BUILD.staff;
    S.staffBase = sub(grip, mul(sd, p.gripU * BUILD.staff));
    const armF = ik(S.shF, grip, LEN.upper * BUILD.torso, LEN.fore * BUILD.torso, [-0.35, 1]);
    S.elbF = armF.mid; S.wriF = armF.end;
    const armN = ik(S.shN, handN, LEN.upper * BUILD.torso, LEN.fore * BUILD.torso, [-1, 0.15]);
    S.elbN = armN.mid; S.wriN = armN.end;
    return S;
  }

  // ---- feathers and wings --------------------------------------------------------
  function featherPts(b, ang, L, W, curl) {
    const d = vdeg(ang), n = [-d[1], d[0]];
    const at = (t, side) => {
      const bend = curl * L * t * t;
      const wv = W * Math.min(1, Math.sin(Math.PI * Math.min(1, t * 0.95)) * 1.25) * (t < 0.15 ? 0.7 + t * 2 : 1);
      return add(add(b, mul(d, L * t)), mul(n, bend + side * wv));
    };
    const pts = [];
    for (const t of [0.04, 0.25, 0.55, 0.82]) pts.push(at(t, 1));
    pts.push([...at(1, 0.35), 1]);
    pts.push([...at(0.97, -0.2), 1]);
    for (const t of [0.82, 0.55, 0.25, 0.04]) pts.push(at(t, -1.0));
    return { pts, shaft: [b, at(0.45, 0), at(0.92, 0)] };
  }
  function feather(L, ink, b, ang, Lf, W, curl, m, opt) {
    const f = featherPts(b, ang, Lf, W, curl);
    L.part(f.pts, (g) => {
      tone(g, ink, f.pts, Object.assign({ ang: ang + 28, sp: 1.25, w: 0.38, lw: 0.75 }, m));
      stroke(g, ink, f.shaft, 0.55, 0.9);
      if (opt && opt.barbs) {
        // a few barb lines toward the tip, so long feathers read as feathers
        const d = vdeg(ang), n = [-d[1], d[0]];
        for (const t of [0.35, 0.5, 0.65, 0.8]) {
          const c = add(b, mul(d, Lf * t));
          for (const s of [-1, 1]) stroke(g, ink, [c, add(add(c, mul(n, s * W * 0.8)), mul(d, Lf * 0.06))], 0.4, 0.55);
        }
      }
    }, opt && opt.cast != null ? { cast: opt.cast } : undefined);
  }

  // wing on helmet or staff: material name decides the value of the feathers
  function wing(L, ink, root, ang, size, spread, matName, mir, far) {
    const m = mir ? -1 : 1;
    const u = vdeg(ang);
    const v = [m * u[1], -m * u[0]];
    const W = (a, b) => add(root, add(mul(u, a * size), mul(v, b * size)));
    const lang = (deg) => ang - m * deg;
    const edgeAt = (t) => [t, -0.13 * Math.sin(Math.PI * Math.min(1, t * 1.1))];
    const fm = mat(matName, far);
    const nF = 9;
    for (let i = 0; i < nF; i++) {
      const t = lerp(0.03, 0.98, i / (nF - 1));
      const e = edgeAt(t);
      const b = W(e[0] - 0.02, e[1] + 0.05);
      const la = lerp(112, 14, Math.pow(t, 1.25)) * (0.75 + 0.25 * spread) + (spread - 1) * 10 * t;
      const Lf = size * (t < 0.62 ? lerp(0.5, 0.6, t / 0.62) : lerp(0.66, 0.42, (t - 0.62) / 0.36));
      feather(L, ink, b, lang(la), Lf, size * 0.09, -0.05 * m, fm);
    }
    const nC = 6;
    for (let i = 0; i < nC; i++) {
      const t = lerp(0.03, 0.75, i / (nC - 1));
      const e = edgeAt(t);
      const la = lerp(108, 30, Math.pow(t, 1.2)) * (0.8 + 0.2 * spread);
      feather(L, ink, W(e[0] - 0.01, e[1] + 0.03), lang(la), size * lerp(0.26, 0.2, t), size * 0.08, -0.04 * m, mat(matName, far, { sh: 2 }));
    }
    const top = [], bot = [];
    for (let i = 0; i <= 8; i++) {
      const t = lerp(-0.02, 0.86, i / 8);
      const e = edgeAt(t);
      const th = 0.07 * (1 - t * 0.6);
      top.push(W(e[0], e[1] - th * 0.5));
      bot.push(W(e[0], e[1] + th * 0.9));
    }
    const edge = [...top, ...bot.reverse()];
    L.part(edge, (g) => tone(g, ink, edge, Object.assign({ ang: ang + 80, sp: 1.1, w: 0.45, lw: 0.9 }, mat(matName, far, { hl: far ? null : [0.3, 1.0] }))));
  }

  // ---- the feather mantle ------------------------------------------------------
  // 'back': long blue flight feathers and a middle row, hanging from the shoulders
  // to the knees and flaring back with motion. 'cape': short cream feathers over
  // the shoulders, drawn over the back of the tunic.
  function mantle(L, ink, S, p, layer, time) {
    const TF = S.TF;
    const sw = p.cloak;
    const K = BUILD.mantle;
    const curve = (t) => {
      // far shoulder -> nape -> near shoulder blade -> lower back
      const P0 = [15, -47], P1 = [-2, -55], P2 = [-19, -47], P3 = [-21, -30];
      const a = t * 3, i = Math.min(2, Math.floor(a)), f = a - i;
      const Q = [P0, P1, P2, P3];
      return TF(lerp(Q[i][0], Q[i + 1][0], f), lerp(Q[i][1], Q[i + 1][1], f));
    };
    const flut = (i) => Math.sin(time * 7 + i * 1.7) * 3 * (0.3 + sw);
    if (layer === 'back') {
      const N = 11;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const b = curve(lerp(0.02, 1, t));
        const ang = lerp(86, 112, t) + sw * lerp(12, 44, t) + p.lean * 0.5 + flut(i);
        const Lf = lerp(80, 92, Math.sin(t * Math.PI * 0.8)) * K * (1 - sw * 0.1);
        feather(L, ink, b, ang, Lf, 7.2, 0.04, mat('cloth', t < 0.3, { dark: t < 0.3 ? 0.55 : 0.42, ang: ang + 20 }), { barbs: true, cast: 0.3 });
      }
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const b = curve(lerp(0.08, 0.95, t));
        const ang = lerp(88, 112, t) + sw * lerp(10, 36, t) + p.lean * 0.5 + flut(i + 3) * 0.7;
        const Lf = lerp(50, 60, t) * K;
        feather(L, ink, b, ang, Lf, 6.6, 0.03, mat('cloth', false, { dark: 0.2, base: 0.85, hl: [0.4, 1.2] }), { barbs: true, cast: 0.35 });
      }
      return;
    }
    // cape row: short cream feathers, over the near shoulder and across the back
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const b = curve(lerp(0.28, 0.98, t));
      const ang = lerp(98, 126, t) + sw * lerp(6, 22, t) + p.lean * 0.5 + flut(i + 7) * 0.4;
      feather(L, ink, b, ang, lerp(22, 27, t) * K, 5.6, 0.03, mat('cream'), { cast: 0.4 });
    }
  }

  // scarf tail streaming from the back of the neck
  function scarfTail(L, ink, S, p, time) {
    const HF = frame(S.headO, S.headAng, BUILD.head);
    const sw = p.cloak;
    const root = HF(-8, -3);
    const pts = [], pts2 = [];
    const N = 7;
    const Lt = 30 + sw * 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const dir = vdeg(lerp(150, 175 - sw * 25, t) + Math.sin(time * 6 + t * 4) * 6 * t);
      const c = add(root, add(mul(dir, Lt * t), [0, t * t * (18 - sw * 14)]));
      const w = lerp(4.2, 3.2, t);
      pts.push(add(c, [0, -w])); pts2.push(add(c, [0, w]));
    }
    const tip = add(pts[N], [-(3 + sw * 3), 3]);
    const all = [...pts, [...tip, 1], ...pts2.reverse()];
    L.part(all, (g) => {
      tone(g, ink, all, Object.assign({ ang: 70, sp: 1.15, w: 0.42, lw: 0.85 }, mat('cloth', true)));
      // fringe at the end
      for (let k = 0; k < 4; k++) stroke(g, PAPER_LIGHT, [mix(pts[N - 1], pts2[1], k / 3), add(mix(pts[N - 1], pts2[1], k / 3), [-2.5, 0.8])], 0.5, 0.7);
    });
  }

  // ---- staff: gold winged caduceus with the blue orb -------------------------------
  function staff(L, ink, base, dir, Ls) {
    const n = [-dir[1], dir[0]];
    const P = (u, v) => add(base, add(mul(dir, u), mul(n, v)));
    const ang = angOf(dir);
    const shaft = [P(2, -1.7), P(Ls - 14, -1.7), P(Ls - 14, 1.7), P(2, 1.7)];
    L.part(shaft, (g) => tone(g, ink, shaft, Object.assign({ ang: ang + 90, sp: 1.0, w: 0.45, lw: 0.8 }, mat('gold'))), { cast: 0.3 });
    const butt = [[...P(-6, 0), 1], P(-1, -2.6), P(4, -2.4), P(4, 2.4), P(-1, 2.6)];
    L.part(butt, (g) => tone(g, ink, butt, Object.assign({ ang, sp: 1.0, w: 0.4, lw: 0.8 }, mat('gold'))));
    for (const uu of [6, 38, 58]) {
      const r = [P(uu, -2.7), P(uu + 2.8, -2.7), P(uu + 2.8, 2.7), P(uu, 2.7)];
      L.part(r, (g) => tone(g, ink, r, Object.assign({ ang, sp: 1, w: 0.4, lw: 0.7 }, mat('gold', false, { base: 0.75 }))));
    }
    // two snakes winding up to the wings
    const snake = (side) => {
      const A = [], Bv = [];
      const u0 = 60, u1 = Ls - 15;
      const N = 30;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const u = lerp(u0, u1, t);
        const amp = 7.6 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.95));
        const v = side * amp * Math.sin(t * Math.PI * 2.0);
        const w = lerp(0.8, 2.0, Math.min(1, t * 1.6));
        A.push(P(u, v - w)); Bv.push(P(u, v + w));
      }
      const hb = P(u1, 0);
      const hd = add(hb, add(mul(dir, 3), mul(n, side * 5.5)));
      return [...A, add(hd, mul(n, -2)), [...add(hd, mul(n, side * 2.6)), 1], add(hd, add(mul(n, 0.6), mul(dir, 2.2))), ...Bv.reverse()];
    };
    const sA = snake(1), sB = snake(-1);
    L.part(sB, (g) => tone(g, ink, sB, Object.assign({ ang: ang + 70, sp: 0.95, w: 0.42, lw: 0.75 }, mat('gold', true))), { cast: 0.5 });
    L.part(sA, (g) => tone(g, ink, sA, Object.assign({ ang: ang + 70, sp: 0.95, w: 0.42, lw: 0.75 }, mat('gold'))), { cast: 0.5 });
    // spread gold wings, then the orb sitting between them
    wing(L, ink, P(Ls - 11, -1.4), ang - 36, 24, 1.15, 'gold', false, true);
    wing(L, ink, P(Ls - 11, 1.4), ang + 36, 24, 1.15, 'gold', true, false);
    const cup = [P(Ls - 14, -3.2), P(Ls - 8, -4.8), P(Ls - 8, 4.8), P(Ls - 14, 3.2)];
    L.part(cup, (g) => tone(g, ink, cup, Object.assign({ ang, sp: 1, w: 0.42, lw: 0.8 }, mat('gold'))));
    const orb = [];
    const kc = P(Ls - 2, 0);
    for (let i = 0; i < 14; i++) orb.push(add(kc, mul(vdeg(i * 360 / 14), 6)));
    L.part(orb, (g) => {
      tone(g, ink, orb, Object.assign({ ang: ang + 60, sp: 0.95, w: 0.42, lw: 0.95 }, mat('orb')));
      const s = add(kc, [-1.8, -2]);
      g.fillStyle = PAPER_LIGHT; g.beginPath(); g.arc(s[0], s[1], 1.2, 0, 7); g.fill();
    });
  }

  // fist at wrist w, pointing along dir
  function fist(L, ink, w, dir, far, mirror) {
    const F = frame(w, angOf(dir), 1.05, mirror);
    const pts = F.pts([[-1, -4.2], [4, -5.4], [9, -4.8], [11.6, -2], [11.4, 2.6], [8.5, 5.2], [3, 5.2], [-1, 3.8]]);
    L.part(pts, (g) => {
      tone(g, ink, pts, Object.assign({ ang: angOf(dir) + 80, sp: 1.2, w: 0.4, lw: 0.85 }, mat('skin', far)));
      for (const x of [5.4, 7.6, 9.6]) stroke(g, ink, [F(x, -4.6), F(x - 0.3, 0.2)], 0.55, 0.85);
      stroke(g, ink, [F(1.5, -3.2), F(5.5, -1.2), F(9.5, -0.4)], 0.7);
    });
  }

  // ---- legs: dark cloth trousers, gold knee cops and chunky gold greave-boots ------
  function boot(L, ink, a, deg, far) {
    const F = frame(a, deg, 1.08);
    const pts = F.pts([[-7, -6], [-7.6, 3], [-6, 7.4, 1], [18, 7.4, 1], [19.6, 5], [17, 1.6], [10, -0.6], [4, -5.5]]);
    L.part(pts, (g) => {
      tone(g, ink, pts, Object.assign({ ang: deg + 70, sp: 1.15, w: 0.42, lw: 0.95 }, mat('gold', far)));
      stroke(g, deepInk(ink), [F(-6, 7), F(18, 7)], 1.8);
      stroke(g, ink, [F(3, -4.6), F(5, 2), F(14, 3.6)], 0.7, 0.8); // toe cap seam
      stroke(g, ink, [F(-6.6, 1), F(3.6, -1.6)], 0.6, 0.7);
    });
  }
  function leg(L, ink, hip, knee, ank, footDeg, far) {
    const d = nrm(sub(ank, knee)), n = [-d[1], d[0]];
    const ga = angOf(sub(ank, knee));
    boot(L, ink, ank, footDeg, far);
    // greave: wide flared cuff below the knee, tapering to the ankle
    const shinPts = limbPts(knee, ank, [[0.08, 7.6, 7.0], [0.22, 7.4, 6.4], [0.55, 6.2, 5.4], [0.85, 5.6, 5.0], [1, 6, 5.4]]);
    L.part(shinPts, (g) => {
      tone(g, ink, shinPts, Object.assign({ ang: ga + 90, sp: 1.1, w: 0.45, cross: ga + 30, lw: 0.95, bow: 1.4 }, mat('gold', far)));
      const at = (t, s2) => add(add(knee, mul(sub(ank, knee), t)), mul(n, s2));
      stroke(g, ink, [at(0.2, 7.2), at(0.25, 0.5), at(0.2, -6.2)], 0.9);
      stroke(g, ink, [at(0.27, 3.4), at(0.55, 2.8), at(0.84, 1.6)], 0.6, 0.75);
      stroke(g, ink, [at(0.86, 5.4), at(0.9, 0), at(0.86, -4.8)], 0.75, 0.9);
    });
    const kp = [];
    for (let i = 0; i < 10; i++) kp.push(add(add(knee, mul(d, 1)), mul(vdeg(i * 36), 5.8)));
    L.part(kp, (g) => tone(g, ink, kp, Object.assign({ ang: ga + 90, sp: 1.1, w: 0.45, lw: 0.85, bow: 1 }, mat('gold', far))));
    const thighPts = limbPts(hip, knee, [[0, 9.6, 10], [0.22, 9.4, 11], [0.5, 8.4, 9.6], [0.8, 6.6, 7.0], [1, 5.6, 5.8]]);
    const ta = angOf(sub(knee, hip));
    L.part(thighPts, (g) => {
      tone(g, ink, thighPts, Object.assign({ ang: ta + 90, sp: 1.2, w: 0.45, cross: ta + 35, lw: 0.95, bow: 1.5 }, mat('cloth', far, { sh: far ? 9 : 6, core: far ? 5.5 : 3.4 })));
      const dd = nrm(sub(knee, hip)), nn = [-dd[1], dd[0]];
      const at = (t, s2) => add(add(hip, mul(sub(knee, hip), t)), mul(nn, s2));
      stroke(g, ink, [at(0.2, -4), at(0.5, -2.5), at(0.85, -1)], 0.6, 0.6); // cloth fold
    });
  }

  // ---- arms: blue sleeve, gold bracer, gold domed pauldron -----------------------
  function arm(L, ink, sh, el, wr, far) {
    const fa = angOf(sub(wr, el));
    const fd = nrm(sub(wr, el)), fn = [-fd[1], fd[0]];
    const fat = (t, s2) => add(add(el, mul(sub(wr, el), t)), mul(fn, s2));
    const forePts = limbPts(el, wr, [[0, 5, 5.2], [0.28, 5.6, 5.8], [0.7, 4.4, 4.6], [1, 3.8, 3.9]]);
    L.part(forePts, (g) => {
      tone(g, ink, forePts, Object.assign({ ang: fa + 90, sp: 1.15, w: 0.45, lw: 0.9, bow: 1.3 }, mat('cloth', far)));
      // gold bracer with a raised rim at each end
      const br = [fat(0.3, 6.2), [...fat(1.02, 4.6), 1], [...fat(1.02, -4.6), 1], fat(0.3, -6.3)];
      tone(g, ink, br, Object.assign({ ang: fa + 90, sp: 0.95, w: 0.45, lw: 0.85 }, mat('gold', far)));
      stroke(g, ink, [fat(0.4, 6), fat(0.42, -6)], 0.7, 0.9);
      stroke(g, ink, [fat(0.9, 4.8), fat(0.92, -4.8)], 0.7, 0.9);
      stroke(g, ink, [fat(0.55, 0.5), fat(0.8, 0.2)], 0.6, 0.6);
    });
    const ua = angOf(sub(el, sh));
    const upPts = limbPts(sh, el, [[0, 8, 8], [0.22, 8.2, 7.8], [0.6, 6.4, 6.2], [1, 5.2, 5]]);
    L.part(upPts, (g) => tone(g, ink, upPts, Object.assign({ ang: ua + 90, sp: 1.15, w: 0.45, cross: ua + 35, lw: 0.9, bow: 1.4 }, mat('cloth', far))));
    // pauldron: big gold dome with a lame below and a rolled rim
    const d = nrm(sub(el, sh)), n = [-d[1], d[0]];
    const at = (t, s2) => add(add(sh, mul(sub(el, sh), t)), mul(n, s2));
    const lame = [at(0.26, 10.6), [...at(0.52, 10), 1], at(0.56, 4), at(0.57, -3), [...at(0.52, -9.6), 1], at(0.26, -10)];
    const dome = [at(-0.26, 0), at(-0.2, 8.4), at(0.02, 12), [...at(0.38, 12.6), 1], at(0.41, 3), at(0.42, -4), [...at(0.38, -12), 1], at(0.0, -11.4), at(-0.22, -7)];
    L.part(lame, (g) => tone(g, ink, lame, Object.assign({ ang: ua + 90, sp: 1.05, w: 0.45, lw: 0.85, bow: 1 }, mat('gold', far))));
    L.part(dome, (g) => {
      tone(g, ink, dome, Object.assign({ ang: ua + 90, sp: 1.05, w: 0.45, cross: ua + 30, lw: 1.0, bow: 1.3 }, mat('gold', far, { sh: 5, core: 3 })));
      stroke(g, ink, [at(0.31, 11), at(0.35, 0), at(0.31, -10.6)], 0.7, 0.9);
      stroke(g, ink, [at(0.27, 10.8), at(0.31, 0), at(0.27, -10.4)], 0.5, 0.8);
    });
  }

  // ---- torso: blue tunic, gold trim, winged sigil, leather belt ----------------------
  function sigil(g, ink, F, cx, cy, s) {
    // the winged mark from the mascot's chest: a central spire with two
    // upswept wings and a short base, in gold on the blue cloth
    const P = (x, y) => F(cx + x * s, cy + y * s);
    const shape = [
      P(0, -5.2), P(0.9, -2.2), P(1.2, -0.6), P(3.4, -3.2), P(5.6, -4.4), P(4.8, -1.8), P(2.6, 0.8), P(1.3, 1.8),
      P(1.6, 3.8), [...P(0, 5.2), 1], P(-1.6, 3.8), P(-1.3, 1.8), P(-2.6, 0.8), P(-4.8, -1.8), P(-5.6, -4.4), P(-3.4, -3.2),
      P(-1.2, -0.6), P(-0.9, -2.2),
    ];
    g.save();
    g.fillStyle = PAPER_LIGHT; g.strokeStyle = deepInk(ink); g.lineWidth = 0.7;
    const Pth = pathOf(shape);
    g.fill(Pth); g.stroke(Pth);
    g.globalAlpha = 0.5;
    g.beginPath(); const a = P(0, -3.5), b = P(0, 3.6); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.strokeStyle = ink; g.lineWidth = 0.45; g.stroke();
    g.restore();
  }
  function torso(L, ink, S, p) {
    const TF = S.TF;
    const cu = TF.pts([
      [-5, -57], [7, -56.5], [15, -52.5], [20, -45], [22, -37], [20.6, -29], [18, -22], [15.6, -14], [15.4, -8],
      [16.6, -2], [16, 3, 1], [6, 6.5], [-4, 4.5], [-14, 1, 1], [-13.6, -8], [-13.6, -15], [-16.4, -24], [-18.6, -34],
      [-19, -44], [-15, -53],
    ]);
    L.part(cu, (g) => {
      tone(g, ink, cu, Object.assign({ ang: p.lean + 4, sp: 1.2, w: 0.45, cross: p.lean - 62, lw: 1.0, bow: 1.4 }, mat('cloth', false, { sh: 11, core: 6, rim: 1.4, hl: [1.6, 3.6] })));
      // gold piping: a chest plate outline and the front placket
      const trim = (pts, w) => {
        stroke(g, deepInk(ink), TF.pts(pts), w + 1.1, 0.9);
        stroke(g, PAPER_LIGHT, TF.pts(pts), w, 1);
      };
      trim([[-6, -51], [-3, -40], [1, -30], [4.6, -21], [6.6, -9]], 1.2);
      trim([[17.6, -48], [17, -38], [14.4, -27], [12.2, -17], [11.4, -9]], 1.2);
      trim([[-6, -51], [4, -49.4], [12, -49.6], [17.6, -48]], 1.3);
      // cloth folds under the chest
      stroke(g, ink, TF.pts([[-10, -22], [-7, -16], [-6, -10]]), 0.6, 0.7);
      stroke(g, ink, TF.pts([[14.6, -26], [13.2, -19]]), 0.55, 0.6);
      sigil(g, ink, TF, 7.8, -36.5, 1.15);
    });
    const belt = TF.pts([[-14.2, -7.5], [-4, -5.6], [6, -4.8], [16, -7.2], [16.8, 0.4, 1], [6, 3], [-4, 2.2], [-14.6, 0, 1]]);
    L.part(belt, (g) => {
      tone(g, ink, belt, Object.assign({ ang: p.lean + 90, sp: 1.05, w: 0.45, lw: 0.95 }, mat('leather')));
      for (const x of [-10, -4, 13.6]) {
        const c = TF(x, -2.4);
        g.fillStyle = PAPER_LIGHT; g.strokeStyle = deepInk(ink); g.lineWidth = 0.5;
        g.beginPath(); g.arc(c[0], c[1], 1.0, 0, 7); g.fill(); g.stroke();
      }
      const bk = TF.pts([[3.4, -7.4, 1], [10.6, -7.4, 1], [10.6, 2.6, 1], [3.4, 2.6, 1]]);
      tone(g, ink, bk, Object.assign({ ang: 40, sp: 1, w: 0.42, lw: 0.9 }, mat('gold')));
      const bi = TF.pts([[5.2, -5.4, 1], [8.8, -5.4, 1], [8.8, 0.6, 1], [5.2, 0.6, 1]]);
      g.strokeStyle = deepInk(ink); g.lineWidth = 0.8; g.stroke(pathOf(bi));
    });
  }

  // tunic skirt, then the tabard panel that hangs in front
  function skirt(L, ink, S, p, layer) {
    const PF = S.PF;
    const legSpread = clamp((S.kneeF[0] - S.kneeN[0]) / 40, 0.4, 1.6);
    if (layer === 'skirt') {
      const ch = PF.pts([[-15, 0], [17, 0], [19 + 4 * legSpread, 16], [16 + 6 * legSpread, 23], [8, 25], [0, 24], [-8, 25], [-15 - 5 * legSpread, 22], [-18 - 3 * legSpread, 15]]);
      L.part(ch, (g) => {
        tone(g, ink, ch, Object.assign({ ang: p.tilt + 92, sp: 1.3, w: 0.42, lw: 0.9 }, mat('cloth', false, { sh: 7, core: 3 })));
        for (let i = 0; i < 6; i++) {
          const x = lerp(-13, 16, i / 5);
          stroke(g, ink, PF.pts([[x * 0.85, 6], [x * (1 + 0.25 * legSpread), 23]]), 0.55, 0.7);
        }
        // gold hem
        const hem = PF.pts([[-15 - 5 * legSpread, 21.4], [-8, 24], [0, 23], [8, 24], [16 + 6 * legSpread, 22]]);
        stroke(g, deepInk(ink), hem, 2.4, 0.9);
        stroke(g, PAPER_LIGHT, hem, 1.2, 1);
      });
      return;
    }
    // tabard: hangs from the belt buckle, swings back a little with motion
    const sw = p.cloak;
    const F = frame(PF(7, 2), p.tilt - sw * 12, BUILD.torso);
    const Lh = 30 + (BUILD.leg - 1) * 12;
    const tb = F.pts([[-6.4, 0, 1], [6.4, 0, 1], [6.8, Lh - 6], [0, Lh, 1], [-6.8, Lh - 6]]);
    L.part(tb, (g) => {
      tone(g, ink, tb, Object.assign({ ang: F.deg + 90, sp: 1.1, w: 0.45, lw: 0.95 }, mat('cloth', false, { dark: 0.38, sh: 3, core: 1.6 })));
      const inner = F.pts([[-4.6, 1.5], [-4.9, Lh - 6.6], [0, Lh - 2.2], [4.9, Lh - 6.6], [4.6, 1.5]]);
      stroke(g, deepInk(ink), inner, 2.2, 0.9);
      stroke(g, PAPER_LIGHT, inner, 1.0, 1);
      // small chevron mark near the point
      const c1 = F.pts([[-2.6, Lh - 13], [0, Lh - 10], [2.6, Lh - 13]]);
      const c2 = F.pts([[-2.6, Lh - 16.5], [0, Lh - 13.5], [2.6, Lh - 16.5]]);
      stroke(g, PAPER_LIGHT, c1, 1.1, 1); stroke(g, PAPER_LIGHT, c2, 1.1, 1);
    });
  }

  // ---- head: cowl, scarf mask, shadowed visor, winged steel helmet -----------------
  function head(L, ink, S, p) {
    const HF = frame(S.headO, S.headAng, BUILD.head);
    const ha = S.headAng;
    // cowl: the scarf wrapped round the neck, tucked into the tunic collar
    const cowl = [S.TF(-12, -51), HF(-10, -7), HF(-2, -3), HF(12, -1), S.TF(17, -50), S.TF(8, -48), S.TF(-2, -49)];
    L.part(cowl, (g) => {
      tone(g, ink, cowl, Object.assign({ ang: ha + 10, sp: 1.15, w: 0.45, lw: 0.95, bow: 1 }, mat('cloth')));
      stroke(g, ink, [HF(-6, -2), HF(3, 2), S.TF(10, -51)], 0.6, 0.75);
      stroke(g, ink, [S.TF(-8, -51), S.TF(2, -50), S.TF(13, -51)], 0.6, 0.65);
    });
    // far helmet wing, peeking behind the dome
    wing(L, ink, HF(6, -28), ha - 78, 25, 0.85, 'cream', false, true);
    // scarf over the lower face
    const mask = HF.pts([[-11, -13], [-2, -14.5], [8, -14], [13.6, -12.6], [15.2, -9], [14.8, -5], [12.6, -1.4], [7, 1.4], [0, 2], [-7, 0.5], [-11.4, -5]]);
    L.part(mask, (g) => {
      tone(g, ink, mask, Object.assign({ ang: ha + 6, sp: 1.1, w: 0.45, lw: 1.0, bow: 1.2 }, mat('cloth', false, { sh: 4, core: 2.4, hl: [0.8, 2] })));
      // folds pulled from the nose bridge round the cheek
      for (const k of [0, 1, 2]) stroke(g, ink, HF.pts([[14 - k * 0.6, -10 + k * 3.4], [8, -9 + k * 3.6], [0, -9.5 + k * 3.4], [-8, -10 + k * 3]]), 0.6, 0.75);
    });
    // visor shadow: the eyes sit in a dark band under the brim
    const vis = HF.pts([[1, -19], [16.4, -19], [15.6, -13.6], [8, -14], [1, -14.4]]);
    L.part(vis, (g) => {
      g.fillStyle = deepInk(ink); g.fill(pathOf(vis));
      // the faintest glint of an eye
      const e = HF(12.6, -16.2); g.globalAlpha = 0.7; g.fillStyle = PAPER_LIGHT;
      g.beginPath(); g.ellipse(e[0], e[1], 1.3, 0.5, ha * D2R, 0, 7); g.fill();
    }, { noSil: false });
    // helmet dome
    const helm = HF.pts([
      [16.6, -18.6, 1], [15.8, -24], [13, -31], [6, -36.6], [-3, -38.6], [-11.6, -35.6], [-16.6, -28.4], [-18, -20],
      [-17.6, -12], [-16, -6.6, 1], [-11.6, -7], [-10, -13], [-6.4, -17.2], [1, -18.8],
    ]);
    L.part(helm, (g) => {
      tone(g, ink, helm, Object.assign({ ang: ha + 6, sp: 1.1, w: 0.45, cross: ha - 55, lw: 1.05, bow: 1.2 }, mat('steel')));
      // a raised ridge over the crown
      stroke(g, ink, HF.pts([[12, -31.6], [4, -37], [-6, -38], [-14, -33]]), 0.7, 0.8);
    });
    // gold brim band around the lower edge of the dome
    const brim = HF.pts([
      [17.6, -21.6], [8, -23.6], [-4, -23.4], [-13, -21], [-17.6, -17.4, 1],
      [-17.2, -13.4], [-12.6, -16.6], [-4, -18.8], [8, -18.8], [17.8, -17.2, 1],
    ]);
    L.part(brim, (g) => {
      tone(g, ink, brim, Object.assign({ ang: ha + 90, sp: 1, w: 0.42, lw: 0.95 }, mat('gold')));
      for (const x of [13, 5, -3, -10]) {
        const c = HF(x, x > 0 ? -20.8 : -20.2);
        g.fillStyle = PAPER_LIGHT; g.strokeStyle = deepInk(ink); g.lineWidth = 0.45;
        g.beginPath(); g.arc(c[0], c[1], 0.9 * BUILD.head, 0, 7); g.fill(); g.stroke();
      }
    });
    // near helmet wing: rises from the temple, sweeps up and back
    wing(L, ink, HF(-6, -25), ha - 100, 31, 0.9, 'cream', false, false);
  }

  function slash(g, ink, S) {
    const d = S.staffDir, n = [-d[1], d[0]];
    const tip = add(S.staffBase, mul(d, S.staffLen));
    g.save();
    g.strokeStyle = ink; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const o = (i - 2) * 4.2;
      const a = add(add(tip, mul(d, -10 - Math.abs(i - 2) * 6)), mul(n, o));
      const b = add(a, mul(d, -46 + Math.abs(i - 2) * 10));
      g.globalAlpha = 0.75 - Math.abs(i - 2) * 0.15;
      g.lineWidth = 1.4 - Math.abs(i - 2) * 0.3;
      g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(a[0], a[1]); g.stroke();
    }
    g.globalAlpha = 0.9; g.lineWidth = 0.9;
    for (let i = 0; i < 8; i++) {
      const v = vdeg(i * 45 + 20);
      const r0 = 9, r1 = i % 2 ? 14 : 19;
      const a = add(add(tip, mul(d, 6)), mul(v, r0)), b = add(add(tip, mul(d, 6)), mul(v, r1));
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    g.restore();
  }

  function groundShadow(g, ink, S) {
    g.save();
    g.beginPath();
    g.ellipse((S.ankN[0] + S.ankF[0]) / 2 + 2, 0.6, Math.abs(S.ankF[0] - S.ankN[0]) / 2 + 24, 3, 0, 0, 7);
    g.clip();
    lines(g, ink, [-90, -4, 90, 4], 0, 0.9, 0.5, 0.65, 0, 0);
    g.restore();
  }

  // ---- cyanotype grain -------------------------------------------------------------
  // A 256px tile of grain, rank-equalised so its values are uniform in [0, 1):
  // white noise mixed with two octaves of value noise, so the stipple clumps
  // a little the way the print does.
  let NOISE = null;
  function noiseTile() {
    if (NOISE) return NOISE;
    const N = 256;
    const h = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
    const vn = (x, y, c) => {
      const n = N / c, X = Math.floor(x / c), Y = Math.floor(y / c), fx = x / c - X, fy = y / c - Y;
      const q = (i, j) => h(((i % n) + n) % n, ((j % n) + n) % n);
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      return lerp(lerp(q(X, Y), q(X + 1, Y), sx), lerp(q(X, Y + 1), q(X + 1, Y + 1), sx), sy);
    };
    const raw = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) raw[y * N + x] = 0.8 * h(x + 0.5, y + 0.5) + 0.2 * vn(x, y, 3);
    const idx = Array.from(raw.keys()).sort((a, b) => raw[a] - raw[b]);
    NOISE = new Float32Array(N * N);
    idx.forEach((k, r) => { NOISE[k] = r / (N * N); });
    return NOISE;
  }
  const rgbOf = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const lumOf = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  // threshold every pixel of the figure through the grain: the value of each
  // pixel becomes the chance that it prints as ink
  function cyanotype(cv, ink, box, anchor, gscale) {
    const x0 = Math.max(0, Math.floor(box[0])), y0 = Math.max(0, Math.floor(box[1]));
    const x1 = Math.min(cv.width, Math.ceil(box[2])), y1 = Math.min(cv.height, Math.ceil(box[3]));
    if (x1 <= x0 || y1 <= y0) return;
    const c = cv.getContext('2d');
    const img = c.getImageData(x0, y0, x1 - x0, y1 - y0);
    const D = img.data, W = x1 - x0, H = y1 - y0;
    const N = noiseTile();
    const pc = rgbOf(PAPER_LIGHT), ic = rgbOf(ink), dc = rgbOf(deepInk(ink));
    const Lp = lumOf(pc), Ld = lumOf(dc);
    const ax = Math.round(anchor[0]), ay = Math.round(anchor[1]);
    const gs = 1; // grain cell size in device px
    // value of each pixel (0 paper .. 1 deep ink), then a box blur so the
    // hatching reads as tone; the print uses a mix of the two
    const dv = new Float32Array(W * H);
    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      if (D[j + 3] === 0) continue;
      const lum = 0.3 * D[j] + 0.59 * D[j + 1] + 0.11 * D[j + 2];
      dv[i] = clamp((Lp - lum) / (Lp - Ld), 0, 1);
    }
    const r = Math.max(1, Math.round(1.2 * gscale));
    const tmp = new Float32Array(W * H), bl = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += dv[y * W + clamp(x, 0, W - 1)];
      for (let x = 0; x < W; x++) {
        tmp[y * W + x] = acc / (2 * r + 1);
        acc += dv[y * W + Math.min(W - 1, x + r + 1)] - dv[y * W + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        bl[y * W + x] = acc / (2 * r + 1);
        acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      if (D[j + 3] === 0) continue;
      const px = x0 + (i % W), py = y0 + ((i / W) | 0);
      const tb = clamp((bl[i] - 0.22) / 0.6, 0, 1);
      const d = Math.max(dv[i] * 0.95, 0.62 * tb * tb * (3 - 2 * tb));
      const nx = (((px - ax) / gs) | 0) & 255, ny = (((py - ay) / gs) | 0) & 255;
      const t = 0.08 + 0.84 * N[ny * 256 + nx];
      const v = clamp((d - t) * 7 + 0.5, 0, 1);
      const deep = 0.5 * clamp((dv[i] - 0.85) * 6, 0, 1);
      for (let k = 0; k < 3; k++) {
        const inkK = lerp(ic[k], dc[k], deep);
        D[j + k] = lerp(pc[k], inkK, v);
      }
    }
    c.putImageData(img, x0, y0);
  }

  function draw(g, poseName, opts) {
    const ink = !opts.ink || opts.ink === INK.blue ? CY : opts.ink;
    const time = opts.time || 0;
    const p = POSES[poseName] || POSES.stand;
    const S = solve(p);
    const Ld = List();
    // back to front
    scarfTail(Ld, ink, S, p, time);
    mantle(Ld, ink, S, p, 'back', time);
    arm(Ld, ink, S.shF, S.elbF, S.wriF, true);
    leg(Ld, ink, S.hipF, S.kneeF, S.ankF, p.footF, true);
    skirt(Ld, ink, S, p, 'skirt');
    leg(Ld, ink, S.hipN, S.kneeN, S.ankN, p.footN, false);
    torso(Ld, ink, S, p);
    skirt(Ld, ink, S, p, 'tabard');
    mantle(Ld, ink, S, p, 'cape', time);
    head(Ld, ink, S, p);
    staff(Ld, ink, S.staffBase, S.staffDir, S.staffLen);
    fist(Ld, ink, S.wriF, nrm(sub(S.wriF, S.elbF)), true, true);
    arm(Ld, ink, S.shN, S.elbN, S.wriN, false);
    fist(Ld, ink, S.wriN, nrm(sub(S.wriN, S.elbN)), false);
    const cv = g.canvas;
    const off = document.createElement('canvas');
    off.width = cv.width; off.height = cv.height;
    const o = off.getContext('2d');
    const T = g.getTransform();
    o.setTransform(T);
    if (poseName !== 'run') groundShadow(o, ink, S);
    Ld.render(o, ink);
    // device-space box around the figure, then print it as a cyanotype
    const corners = [[-150, -300], [200, -300], [-150, 30], [200, 30]].map(([x, y]) => [T.a * x + T.c * y + T.e, T.b * x + T.d * y + T.f]);
    const xs = corners.map((q) => q[0]), ys = corners.map((q) => q[1]);
    cyanotype(off, ink, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], [T.e, T.f], Math.hypot(T.a, T.b));
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(off, 0, 0);
    g.restore();
    if (poseName === 'action') slash(g, ink, S);
  }

  window.CONCEPT = {
    name: BUILD.name,
    tagline: BUILD.tagline,
    height: 190,
    cyanotype: true,
    draw,
  };
})();
