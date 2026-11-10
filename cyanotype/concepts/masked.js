// ---------------------------------------------------------------------------
// Hermes Arena — concept "Masked Herald" (copperplate engraving)
// Kettle-hat helmet with a flared brim and white wings, eyes lost in the brim's
// shadow, a navy scarf over the face wound into a rolled cowl, domed pauldrons
// with rosette bosses, dark tunic with a light eagle, studded belt with a
// rosette buckle, tabard with the wheat motif, engraved bracers and greave-boots
// with ankle wings, a cloak of long layered feathers and a tall winged caduceus.
// Printed in one slate-navy ink on warm cream paper: contour hatching that swells
// in the shadows, crosshatch in the cores, stipple on skin, bare-paper highlights,
// light from the upper left.
//
// Rig: every part is traced once in REST-WORLD coordinates (the 'stand' pose,
// feet on y = 0, facing +x) and belongs to one bone. Its outline, its hatching
// (already clipped to the outline and toned by the light), its stipple and its
// engraved details are baked once into Path2D objects. Per frame solve() turns
// the pose object into joints (pelvis, torso, head, 2-bone IK arms and legs,
// staff, cloak rows) and each bone into a rest->current transform; draw() sets
// that transform and strokes the cached paths, back to front.
// ---------------------------------------------------------------------------
(function () {
  const OWN_INK = '#2e4865';
  const OWN_DEEP = '#16263a';
  const PAPER_C = '#fbead1';
  // away from the light. The mockup is lit from the front and above; mirrored to face +x
  // that is the upper right, so shadows fall on the back (-x) and lower sides.
  const AW = [-0.5, 0.85];

  // ---- vectors ------------------------------------------------------------------
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, s) => [a[0] * s, a[1] * s];
  const len = (a) => Math.hypot(a[0], a[1]);
  const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const vdeg = (d) => [Math.cos(d * D2R), Math.sin(d * D2R)];
  const angOf = (v) => Math.atan2(v[1], v[0]) / D2R;
  const rotv = (v, deg) => { const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // ---- curves -------------------------------------------------------------------
  // control points -> polyline: quadratic through midpoints, p[2] marks a corner
  function curve(pts, closed, step) {
    step = step || 0.6;
    const out = [];
    const n = pts.length;
    const q = (a, c, b) => {
      const L = len(sub(a, c)) + len(sub(c, b));
      const k = Math.max(1, Math.ceil(L / step));
      for (let i = 1; i <= k; i++) {
        const t = i / k, u = 1 - t;
        out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
      }
    };
    const ln = (a, b) => {
      const k = Math.max(1, Math.ceil(len(sub(a, b)) / step));
      for (let i = 1; i <= k; i++) out.push(mix(a, b, i / k));
    };
    if (!closed) {
      out.push(pts[0].slice(0, 2));
      if (n === 2) { ln(pts[0], pts[1]); return out; }
      let cur = pts[0];
      for (let i = 1; i < n - 1; i++) {
        const m = i === n - 2 ? pts[n - 1] : mix(pts[i], pts[i + 1], 0.5);
        if (pts[i][2]) { ln(cur, pts[i]); cur = pts[i]; continue; }
        q(cur, pts[i], m); cur = m;
      }
      if (cur !== pts[n - 1]) ln(cur, pts[n - 1]);
      return out;
    }
    let cur = pts[0][2] ? pts[0] : mix(pts[n - 1], pts[0], 0.5);
    const start = cur;
    out.push(cur.slice(0, 2));
    for (let i = 0; i < n; i++) {
      const p = pts[i], nx = pts[(i + 1) % n];
      if (p[2]) { if (cur !== p) ln(cur, p); cur = p; continue; }
      const m = nx[2] ? nx : mix(p, nx, 0.5);
      q(cur, p, m); cur = m;
    }
    if (len(sub(cur, start)) > 1e-6) ln(cur, start);
    return out;
  }
  function ell(c, rx, ry, deg, n, a0, a1) {
    const out = [];
    n = n || 24; a0 = a0 || 0; a1 = a1 == null ? Math.PI * 2 : a1;
    const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
    for (let i = 0; i < (full ? n : n + 1); i++) {
      const a = a0 + (a1 - a0) * i / n;
      out.push(add(c, rotv([Math.cos(a) * rx, Math.sin(a) * ry], deg || 0)));
    }
    return out;
  }
  function inside(poly, p) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function bbox(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return [x0, y0, x1, y1];
  }
  // the same curve as curve(), as quadratic segments (the canvas flattens them for the scale)
  function qPath(pts, closed, P) {
    P = P || new Path2D();
    const n = pts.length;
    if (!closed) {
      P.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) {
        const m = i === n - 2 ? pts[n - 1] : mix(pts[i], pts[i + 1], 0.5);
        if (pts[i][2]) P.lineTo(pts[i][0], pts[i][1]); else P.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
      }
      P.lineTo(pts[n - 1][0], pts[n - 1][1]);
      return P;
    }
    const st = pts[0][2] ? pts[0] : mix(pts[n - 1], pts[0], 0.5);
    P.moveTo(st[0], st[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      if (p[2]) { P.lineTo(p[0], p[1]); continue; }
      const m = q[2] ? q : mix(p, q, 0.5);
      P.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    P.closePath();
    return P;
  }
  function toPath(poly, closed, P) {
    P = P || new Path2D();
    P.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) P.lineTo(poly[i][0], poly[i][1]);
    if (closed) P.closePath();
    return P;
  }

  // ---- tone field and hatching ------------------------------------------------------
  // tone(p) in 0..1: a base value, a gradient away from the light, a core shadow band along
  // the edge away from the light, a paper band along the edge toward it, and muscle/fold blobs
  function toneFn(poly, t) {
    const b = bbox(poly);
    const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    const R = Math.max(2, Math.hypot(b[2] - b[0], b[3] - b[1]) / 2);
    const base = t.base || 0, grad = t.grad == null ? 0.5 : t.grad;
    const core = t.core, hl = t.hl, blobs = t.blobs || [];
    const dir = t.dir || AW;
    return (p) => {
      let v = base + grad * dot(sub(p, c), dir) / R;
      if (core && !inside(poly, add(p, mul(dir, core[0])))) v += core[1];
      if (hl && !inside(poly, sub(p, mul(dir, hl[0])))) v -= hl[1];
      for (const [x, y, rx, ry, a] of blobs) {
        const dx = (p[0] - x) / rx, dy = (p[1] - y) / ry, d2 = dx * dx + dy * dy;
        if (d2 < 1) v += a * (1 - d2);
      }
      return v < 0 ? 0 : v > 1 ? 1 : v;
    };
  }
  // one family of engraved lines across a shape, clipped to it, cut into runs where the tone
  // passes each threshold (lines start where the tone does and swell where it deepens)
  //  mode 'par': straight lines along ang, bowed by bow (a parabola across the shape)
  //  mode 'arc': concentric ellipses round c (aspect ry/rx), for domes
  function hatchRuns(poly, f, tone, sp, thrs) {
    const runs = thrs.map(() => []);
    const step = 0.35;
    const b = bbox(poly);
    const push = (lineFn, t0, t1) => {
      const cur = thrs.map(() => null);
      let k = 0;
      for (let t = t0; t <= t1 + 1e-6; t += step, k++) {
        const p = lineFn(t);
        const ins = inside(poly, p);
        const v = ins ? tone(p) : -1;
        thrs.forEach((th, i) => {
          if (v > th) {
            if (!cur[i]) { cur[i] = [p]; runs[i].push(cur[i]); }
            else if (k % 3 === 0 || f.bow || f.mode === 'arc') cur[i].push(p);
            else cur[i].last = p;
          } else if (cur[i]) { if (cur[i].last) cur[i].push(cur[i].last); cur[i] = null; }
        });
      }
      thrs.forEach((th, i) => { if (cur[i] && cur[i].last) cur[i].push(cur[i].last); });
    };
    if (f.mode === 'arc') {
      const c = f.c, asp = f.asp || 1, rot = f.rot || 0;
      let rmax = 0;
      for (const p of poly) { const q = rotv(sub(p, c), -rot); rmax = Math.max(rmax, Math.hypot(q[0], q[1] / asp)); }
      for (let r = sp * 0.5 + (f.off || 0); r < rmax; r += sp) {
        const n = Math.max(12, Math.ceil(2 * Math.PI * r / step));
        push((t) => { const a = t / n * Math.PI * 2; return add(c, rotv([Math.cos(a) * r, Math.sin(a) * r * asp], rot)); }, 0, n);
      }
      return runs;
    }
    const d = vdeg(f.ang), n = [-d[1], d[0]];
    let t0 = 1e9, t1 = -1e9, u0 = 1e9, u1 = -1e9;
    for (const p of poly) { const t = dot(p, d), u = dot(p, n); t0 = Math.min(t0, t); t1 = Math.max(t1, t); u0 = Math.min(u0, u); u1 = Math.max(u1, u); }
    const tc = (t0 + t1) / 2, th = Math.max(1, (t1 - t0) / 2);
    const bow = f.bow || 0;
    const ext = Math.abs(bow) + 1;
    for (let u = u0 - ext + ((f.off || 0.37) % 1) * sp; u < u1 + ext; u += sp) {
      push((t) => { const w = (t - tc) / th; return add(mul(d, t), mul(n, u + bow * w * w)); }, t0, t1);
    }
    void b;
    return runs;
  }
  function runsPath(runs) {
    const P = new Path2D();
    for (const r of runs) if (r.length > 1) toPath(r, false, P);
    return P;
  }
  function stipplePath(poly, tone, dens, r) {
    const b = bbox(poly);
    const P = new Path2D();
    const area = (b[2] - b[0]) * (b[3] - b[1]);
    const N = Math.round(area * dens);
    for (let i = 0; i < N; i++) {
      const p = [b[0] + rnd() * (b[2] - b[0]), b[1] + rnd() * (b[3] - b[1])];
      if (!inside(poly, p)) continue;
      const v = tone(p);
      if (rnd() > v * 1.15) continue;
      const s = r * (0.7 + 0.6 * rnd());
      P.rect(p[0] - s / 2, p[1] - s / 2, s, s);
    }
    return P;
  }

  // ---- part registry ------------------------------------------------------------------
  // A part: bone, outline (rest-world), fill, hatch families, stipple, details. Everything is
  // built once (both levels of detail) and only stroked per frame.
  let PARTS = null;
  const LOD = [{ sp: 1, w: 1, dens: 1 }, { sp: 1.75, w: 1.55, dens: 0.45 }];
  function mkPart(bone, ctrl, st) {
    st = st || {};
    const poly = st.raw ? ctrl : curve(ctrl, st.open ? false : true, 0.5);
    const part = { bone, st, outline: st.raw ? toPath(poly, !st.open) : qPath(ctrl, !st.open), poly, lod: [] };
    part.olPath = part.outline;
    if (st.olCut) {
      // leave the outline open where another part continues the form (e.g. the knee)
      const [x0, y0, x1, y1] = st.olCut;
      const cut = (q) => q[0] > x0 && q[0] < x1 && q[1] > y0 && q[1] < y1;
      const O = new Path2D();
      let pen = false;
      const n = poly.length;
      let s0 = 0;
      while (s0 < n && !cut(poly[s0])) s0++;
      for (let i = 0; i <= n; i++) {
        const q = poly[(s0 + i) % n];
        if (cut(q)) { pen = false; continue; }
        if (!pen) { O.moveTo(q[0], q[1]); pen = true; } else O.lineTo(q[0], q[1]);
      }
      part.olPath = O;
    }
    if (st.open) return part;
    const tone = toneFn(poly, st.tone || {});
    // mean tone (fills the shape at game scale)
    let acc = 0, cnt = 0;
    const b = bbox(poly);
    for (let i = 0; i < 60; i++) { const p = [b[0] + rnd() * (b[2] - b[0]), b[1] + rnd() * (b[3] - b[1])]; if (inside(poly, p)) { acc += tone(p); cnt++; } }
    part.mean = cnt ? acc / cnt : 0;
    for (const L of LOD) {
      const strokes = [];
      for (const f of st.h || []) {
        const thrs = f.thr || [0.2, 0.55];
        const ws = f.w || [0.2, 0.4];
        const runs = hatchRuns(poly, f, tone, f.sp * L.sp, thrs);
        runs.forEach((r, i) => strokes.push({ P: runsPath(r), w: ws[i] * L.w, c: f.c || 'ink' }));
      }
      const stip = st.stip ? stipplePath(poly, tone, st.stip * L.dens, (st.dot || 0.3) * (L.sp > 1 ? 1.5 : 1)) : null;
      part.lod.push({ strokes, stip });
    }
    // engraved details: {pts, w, c, closed, raw, dash}
    // details with the same colour, width and fill share one path
    const groups = new Map();
    for (const d of st.deco || []) {
      const key = (d.c || 'ink') + '|' + (d.w || 0.3) + '|' + !!d.fill;
      if (!groups.has(key)) groups.set(key, { P: new Path2D(), w: d.w || 0.3, c: d.c || 'ink', fill: d.fill });
      const G = groups.get(key);
      if (d.raw) toPath(d.pts, !!d.closed, G.P); else qPath(d.pts, !!d.closed, G.P);
    }
    part.deco = [...groups.values()];
    return part;
  }

  // ---- colours -------------------------------------------------------------------
  const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const COLS = {};
  function colours(ink) {
    if (COLS[ink]) return COLS[ink];
    const deep = ink === OWN_INK ? OWN_DEEP : deepInk(ink);
    const pi = hexRGB(PAPER_C), ii = hexRGB(ink);
    const tint = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      tint.push('rgb(' + pi.map((v, k) => Math.round(v + (ii[k] - v) * t)).join(',') + ')');
    }
    return (COLS[ink] = { ink, deep, paper: PAPER_C, tint });
  }
  function col(C, c) {
    if (typeof c === 'number') return C.tint[Math.round(clamp(c, 0, 1) * 20)];
    return c === 'paper' ? C.paper : c === 'deep' ? C.deep : C.ink;
  }

  // ---- materials ------------------------------------------------------------------
  // skin: stipple for the soft tone, cross-contour hatching that swells into the shadow,
  // crosshatch only in the core
  const SKIN = (ang, o) => Object.assign({
    fill: 'paper', ol: 0.26, sil: true, stip: 5, dot: 0.22,
    tone: { base: 0.46, grad: 0.6, core: [2.4, 0.3], hl: [2.2, 0.25] },
    h: [{ ang, sp: 0.6, bow: -1.2, thr: [0.26, 0.56], w: [0.12, 0.26] }, { ang: ang + 58, sp: 0.64, bow: -0.6, thr: [0.46, 0.72], w: [0.1, 0.2] }],
  }, o || {});
  // polished metal: contour lines, a dark core, a broad bare highlight
  const METAL = (ang, o) => Object.assign({
    fill: 'paper', ol: 0.26, sil: true, stip: 3.5, dot: 0.22,
    tone: { base: 0.45, grad: 0.75, core: [1.6, 0.3], hl: [1.6, 0.35] },
    h: [{ ang, sp: 0.6, bow: 0.6, thr: [0.3, 0.6], w: [0.14, 0.3] }, { ang: ang + 55, sp: 0.64, thr: [0.72], w: [0.16] }],
  }, o || {});
  // dark cloth: a mid tint under dense lines, crosshatched in the folds
  const CLOTH = (ang, o) => Object.assign({
    fill: 0.5, ol: 0.26, sil: true, stip: 1.2, dot: 0.22,
    tone: { base: 0.55, grad: 0.5, core: [2.2, 0.3] },
    h: [{ ang, sp: 0.56, bow: 0.5, thr: [0.05, 0.6], w: [0.16, 0.32] }, { ang: ang + 58, sp: 0.6, thr: [0.45], w: [0.16] }],
  }, o || {});

  // ---- feathers ---------------------------------------------------------------------
  // a feather from root to tip: lanceolate (pointed) or round-tipped (wing); its barbs
  // run from the rachis to the edge angled toward the tip; the half away from the light is
  // densely barbed and crosshatched near its edge, the lit half has sparse fine barbs
  function featherGeo(root, tip, W, o) {
    o = o || {};
    const L = len(sub(tip, root));
    const d = nrm(sub(tip, root)), n = [-d[1], d[0]];
    const curl = o.curl || 0;
    const round = o.round;
    const wid = round
      ? (t) => W * (t < 0.25 ? 0.45 + 0.55 * Math.sin(Math.PI / 2 * t / 0.25) : Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.25) / 0.75, 2.4))))
      : o.lance
        ? (t) => W * (t < 0.36 ? 0.42 + 0.58 * Math.sin(Math.PI / 2 * t / 0.36) : Math.pow(Math.max(0, (1 - t) / 0.64), 0.8))
        : o.leaf
        ? (t) => W * (t < 0.5 ? 0.4 + 0.6 * Math.sin(Math.PI / 2 * t / 0.5) : Math.pow(Math.max(0, 1 - Math.pow((t - 0.5) / 0.5, 1.7)), 0.8))
        : o.broad
        ? (t) => W * (t < 0.5 ? 0.45 + 0.55 * Math.sin(Math.PI / 2 * t / 0.5) : Math.pow(Math.max(0, 1 - Math.pow((t - 0.5) / 0.5, 2)), 0.7))
        : (t) => W * (t < 0.36 ? 0.38 + 0.62 * Math.sin(Math.PI / 2 * t / 0.36) : Math.pow(Math.sin(Math.PI / 2 * Math.max(0, 1 - t) / 0.64), 0.85));
    const rach = (t) => add(add(root, mul(d, L * t)), mul(n, curl * L * Math.sin(Math.PI * t) * 0.5));
    const tan = (t) => nrm(sub(rach(Math.min(1, t + 0.01)), rach(Math.max(0, t - 0.01))));
    const edge = (t, s) => { const tt = tan(t); return add(rach(t), mul([-tt[1], tt[0]], s * wid(t))); };
    const ts = [];
    for (let i = 0; i <= 16; i++) ts.push(i / 16);
    const outline = [];
    for (const t of ts) outline.push(edge(t, 1));
    for (let i = ts.length - 1; i >= 0; i--) outline.push(edge(ts[i], -1));
    const tc = [0, 0.12, 0.28, 0.45, 0.62, 0.78, 0.9];
    const coarse = [[...rach(0), 1]];
    for (const t of tc.slice(1)) coarse.push(edge(t, 1));
    coarse.push([...edge(1, 0), 1]);
    for (let i = tc.length - 1; i >= 1; i--) coarse.push(edge(tc[i], -1));
    const shadeSide = o.side || (dot(n, AW) > 0 ? 1 : -1);
    // barbs
    const bp = (o.bsp || 0.85) / L;
    const k = (o.lance || o.leaf ? 1.7 : o.round ? 1.1 : 0.9) / L; // cot(barb angle) / L
    const lit = [], shade = [], cross = [];
    for (let t = 0.05; t < 0.97; t += bp) {
      for (const s of [1, -1]) {
        const w = wid(t);
        if (w < 0.25) continue;
        const t2 = Math.min(0.995, t + w * k);
        const a = rach(t), e = edge(t2, s * 0.96);
        if (s === shadeSide) {
          shade.push([o.shFrom ? mix(a, e, o.shFrom) : a, e]);
          if (o.cross !== false && t > 0.12 && t < 0.86 && Math.round(t / bp) % 2 === 0) {
            const t3 = Math.max(0.02, t - w * k * 0.8);
            const e2 = edge(t3, s * 0.94);
            cross.push([mix(a, e2, 0.6), e2]);
          }
        } else if (Math.round(t / bp) % (o.litEvery || 1) === 0 && t > (o.litT || 0)) lit.push([mix(a, e, o.litFrom == null ? 0.12 : o.litFrom), mix(a, e, o.litTo || 0.9)]);
      }
    }
    const rpts = [];
    for (let i = 0; i <= 4; i++) rpts.push(rach(0.02 + 0.9 * i / 4));
    // a band of shade along the edge away from the light
    const band = [];
    for (const t of ts) band.push(edge(t, shadeSide));
    for (let i = ts.length - 1; i >= 0; i--) band.push(edge(ts[i], shadeSide * (o.bandIn == null ? 0.45 : o.bandIn)));
    return { outline, coarse, rach: rpts, lit, shade, cross, root, tip, L, band };
  }
  // a group of feathers drawn one after another (each one fills, then strokes)
  function featherPart(bone, geo, o) {
    o = o || {};
    const P = qPath(geo.coarse, true);
    const segs = (arr, every) => { const Q = new Path2D(); arr.forEach((s, i) => { if (i % every === 0) { Q.moveTo(s[0][0], s[0][1]); Q.lineTo(s[1][0], s[1][1]); } }); return Q; };
    const lod = [1, 2].map((every) => {
      const A = segs(geo.shade, every);
      const B = segs(geo.cross, every);
      const Cc = segs(geo.lit, every);
      return { shade: A, cross: B, lit: Cc };
    });
    // its shadow on whatever lies under it, down and right of it
    const so = o.shOff || mul(AW, 0.9);
    const sh = qPath(geo.coarse.map((q) => { const r = add(q, so); if (q[2]) r.push(1); return r; }), true);
    const ro = new Path2D(P);
    toPath(geo.rach, false, ro);
    return { bone, feather: true, outline: P, shadow: sh, band: toPath(geo.band, true), ro, rach: toPath(geo.rach, false), lod, o, poly: geo.outline };
  }

  // ---- rest skeleton (stand pose, traced off the three-quarter mockup, mirrored to face +x) ---
  const R = {
    pel: [4, -96], waist: [5, -114], neck: [3, -158],
    shN: [-18, -140], elbN: [-18.5, -116], wriN: [-14.6, -99],
    shF: [17, -137], elbF: [14, -117], wriF: [29, -119],
    hipN: [-9, -92], kneeN: [-10.8, -60], ankN: [-17, -17],
    hipF: [11, -92], kneeF: [12.6, -60], ankF: [11.5, -17],
    grip: [34.5, -122], staffTop: [34.5, -178.5],
    ckPivot: [-20, -142], ckPivotF: [18, -138],
    wingN: [-7.1, -174.7], wingF: [6, -175.5],
  };
  const BONE_REST = {
    world: [[0, 0], 0], pel: [R.pel, 0], torso: [R.waist, 0], head: [R.neck, 0],
    upN: [R.shN, angOf(sub(R.elbN, R.shN))], foN: [R.elbN, angOf(sub(R.wriN, R.elbN))],
    upF: [R.shF, angOf(sub(R.elbF, R.shF))], foF: [R.elbF, angOf(sub(R.wriF, R.elbF))],
    thN: [R.hipN, angOf(sub(R.kneeN, R.hipN))], shinN: [R.kneeN, angOf(sub(R.ankN, R.kneeN))], ftN: [R.ankN, 0],
    thF: [R.hipF, angOf(sub(R.kneeF, R.hipF))], shinF: [R.kneeF, angOf(sub(R.ankF, R.kneeF))], ftF: [R.ankF, 0],
    staff: [R.grip, -90], hand: [R.grip, -90],
    ck0: [R.ckPivot, 0], ck1: [R.ckPivot, 0], ck2: [R.ckPivot, 0], ck3: [R.ckPivot, 0], ck4: [R.ckPivot, 0], ck5: [R.ckPivot, 0],
    ckF: [R.ckPivotF, 0], ckIn: [[2, -96], 0], wingN: [R.wingN, 0], wingF: [R.wingF, 0],
  };
  const LEN = {
    upN: len(sub(R.elbN, R.shN)), foN: len(sub(R.wriN, R.elbN)), upF: len(sub(R.elbF, R.shF)), foF: len(sub(R.wriF, R.elbF)),
    thN: len(sub(R.kneeN, R.hipN)), shinN: len(sub(R.ankN, R.kneeN)), thF: len(sub(R.kneeF, R.hipF)), shinF: len(sub(R.ankF, R.kneeF)),
  };

  // a cloak feather from its visible tip back along its hanging angle
  const fromTip = (tip, ang, L) => [sub(tip, mul(vdeg(ang), L)), tip];
  const LANCE = { lance: true, bsp: 0.62, curl: -0.015 };
  // a broad cloak feather: lit half bare paper with a few fine barbs, the shadow third barbed densely
  const CLK = { leaf: true, bsp: 0.55, curl: -0.02, litEvery: 2, litFrom: 0.3, litTo: 0.8, litT: 0.3, bandIn: 0.4, shFrom: 0.3 };

  // ---- the figure, traced part by part, back to front ------------------------------------
  function build(part, feather) {
    seed = 9871;
    const DARKBACK = (ang) => CLOTH(ang, { fill: 0.58, gfill: 0.66, sil: false, ol: 0, stip: 0, tone: { base: 0.7, grad: 0.3 },
      h: [{ ang, sp: 0.48, thr: [0.05, 0.75], w: [0.22, 0.34] }, { ang: ang + 60, sp: 0.6, thr: [0.62], w: [0.16] }] });
    // ---- cloak lining and the shadowed feathers hanging behind and between the legs ----
    part('ckIn', [[-24, -90], [24, -90], [27, -62], [25, -46], [22, -40], [18, -42], [4, -32], [1.5, -28.5], [-1.5, -27.5], [-5, -25], [-8.5, -26],
      [-11, -30], [-21, -33], [-25, -32], [-28, -34], [-27, -60]], DARKBACK(95));
    const inner = [[-27.5, -80, -28.2, -33], [-24, -82, -24.6, -31.5], [-12, -74, -11.2, -31], [-9.5, -70, -8.6, -26], [-6.2, -72, -5.2, -25],
      [-3, -70, -2.2, -27.5], [0.4, -72, 1.2, -28.5], [3.4, -70, 3.2, -31.5], [19, -84, 20.6, -41], [22.4, -84, 23.6, -45.5]];
    for (const [x0, y0, x1, y1] of inner) feather('ckIn', [x0, y0], [x1, y1], 2.8, { dark: 0.72 }, Object.assign({ cross: false }, LANCE));

    // dark underside of the cloak behind its feather rows: a mid-dark lining with fine lines
    part('ckF', [[18, -140], [22.5, -134], [24.5, -118], [26, -98], [26, -76], [24.6, -58], [22, -46], [19.5, -43], [18, -60], [18, -100]], DARKBACK(100));
    part('ck0', [[-24, -144], [-31, -141], [-37, -133], [-42, -120], [-46, -104], [-48.5, -88], [-49, -74], [-47.5, -60], [-45, -50],
      [-41, -42], [-37, -37], [-32, -34], [-27, -35], [-21, -40], [-19, -70], [-19, -110], [-21, -135]], DARKBACK(98));

    // ---- cloak, far side (right of the body): broad light feathers hanging from under the far pauldron ----
    const far = [[[18.6, -84], [22.6, -44], 3.0], [[19.2, -100], [25.4, -62], 3.2], [[19.4, -116], [26.6, -82], 3.2], [[19.2, -132], [26, -102], 3.1], [[18.6, -142], [23.6, -120], 2.8]];
    for (const [r, t, w] of far) feather('ckF', r, t, w, { cloak: true, shOff: [0.3, 2.2] }, Object.assign({}, CLK, { side: 1 }));

    // ---- cloak, near side: five tiers of broad lanceolate feathers, the lowest tier first ----
    // [tip x, tip y, hanging angle]; inner feathers first so each outer one laps over its neighbour,
    // every tier hangs from under the one above and casts a band of shadow across it
    const rows = [
      { bone: 'ck0', L: 27, W: 3.2, tips: [[-28.5, -32, 92], [-33.4, -33.5, 94], [-38.4, -37, 96], [-43, -43, 99]] },
      { bone: 'ck1', L: 29, W: 3.4, tips: [[-30.6, -52, 93], [-35.8, -53.5, 95], [-41, -56, 98], [-46, -60, 101]] },
      { bone: 'ck2', L: 29, W: 3.4, tips: [[-31.4, -73, 95], [-36.8, -74.5, 98], [-42.2, -77, 101], [-47.4, -81, 104]] },
      { bone: 'ck3', L: 28, W: 3.4, tips: [[-30.8, -94, 98], [-36.2, -95.5, 101], [-41.6, -98, 104], [-46.6, -101.5, 107]] },
      { bone: 'ck4', L: 25, W: 3.3, tips: [[-29.4, -114, 102], [-34.6, -115, 105], [-39.6, -117, 108], [-44.2, -120, 112]] },
    ];
    rows.forEach((row) => {
      row.tips.forEach(([x, y, a], i) => {
        const [r, t] = fromTip([x, y], a, row.L * (1 - 0.02 * i));
        feather(row.bone, r, t, row.W * (1 + 0.03 * ((i * 7) % 3 - 1)), { cloak: true, shOff: [-0.3, 2.4] }, Object.assign({}, CLK, { side: -1, curl: -0.02 - 0.008 * i }));
      });
    });

    // ---- far leg, then near leg ----
    legParts(part, 'F');
    legParts(part, 'N');

    // ---- caduceus ----
    staffParts(part, part.raw);

    // ---- far arm: the upper arm lies behind the chest, the bracer points forward to the grip ----
    part('upF', [[14.6, -141], [20.6, -139], [21.8, -132], [20.4, -124], [17, -118.6], [12.6, -119.6], [12.4, -128], [13, -136]],
      SKIN(70, { tone: { base: 0.5, grad: 0.5, core: [2, 0.3] } }));
    farBracer(part);

    // ---- torso: the tunic tapering from the chest to the belt, straps and the eagle ----
    part('torso', [[-11, -143], [-3, -142.4], [3, -141.6], [10.6, -139.6], [16, -141.6], [20.2, -139.4], [21.4, -134], [21.4, -128], [20.6, -122.5], [19.6, -117],
      [-8.4, -117], [-9.6, -124], [-10.6, -133]],
      CLOTH(20, { sil: false, fill: 0.42, gfill: 0.56, stip: 1.4, tone: { base: 0.58, grad: 0.5, core: [2.6, 0.25], blobs: [[2, -131, 7, 4, -0.2], [18.5, -128, 3, 9, 0.2], [10, -121, 10, 2.4, 0.22]] },
        h: [{ ang: 32, sp: 0.6, bow: -1.2, thr: [0.1, 0.6], w: [0.13, 0.26] }, { ang: 148, sp: 0.6, bow: -0.8, thr: [0.3, 0.72], w: [0.12, 0.22] }],
        deco: [
          { pts: [[1.5, -143.6], [6.5, -141.6], [10.6, -139.4], [13.2, -142], [15.2, -144.6]], w: 1.1, c: 'paper' },
          { pts: [[1.5, -143.6], [6.5, -141.6], [10.6, -139.4], [13.2, -142], [15.2, -144.6]], w: 0.25 },
          { pts: [[-0.6, -142.4], [0.4, -135], [1.4, -127.5], [1, -123.4], [2, -119]], w: 1.5, c: 'paper' },
          { pts: [[-0.6, -142.4], [0.4, -135], [1.4, -127.5], [1, -123.4], [2, -119]], w: 0.22 },
          { pts: [[17.4, -141], [18.2, -134], [17.8, -126], [18.4, -119]], w: 1.3, c: 'paper' },
          { pts: [[17.4, -141], [18.2, -134], [17.8, -126], [18.4, -119]], w: 0.22 },
          // the chest's curve under the eagle
          { pts: [[3, -126.6], [9, -125], [15.6, -126.4]], w: 0.4, c: 'deep' },
        ] }));
    eagle(part);

    // ---- skirt, its near flap, tabard, belt ----
    // A-line skirt in bordered flaps, the hem sloping down toward the back; a diamond weave
    const hemY = (x) => -79.6 + (x < 0 ? -x * 0.16 : 0) + (x > 17 ? -(x - 17) * 0.05 : 0);
    const flaps = [-18.4, -12, -5.6, 0.6, 4.8, 17.6, 24.4];
    const sdeco = [];
    for (let i = 0; i < flaps.length - 1; i++) {
      if (i === 4) continue; // under the tabard
      const x0 = flaps[i], x1 = flaps[i + 1], st = (i % 2) * 0.7;
      const y0 = hemY(x0) + st, y1 = hemY(x1) + st;
      // the light border along each flap's hem and up its side
      sdeco.push({ pts: [[x0 + 0.3, y0 - 0.9], [x1 - 0.3, y1 - 0.9]], w: 1.3, c: 'paper', raw: true });
      sdeco.push({ pts: [[x0 + 0.2, y0 - 1.75], [x1 - 0.2, y1 - 1.75]], w: 0.26, raw: true });
      sdeco.push({ pts: [[x0, y0], [x1, y1]], w: 0.4, c: 'deep', raw: true });
      sdeco.push({ pts: [[x1 - 0.2, y1 - 0.2], [x1 + (x1 - x0) * -0.04, y1 - 14]], w: 0.36, c: 'deep', raw: true });
      sdeco.push({ pts: [[x1 - 0.9, y1 - 1.6], [x1 - 0.8, y1 - 12]], w: 0.5, c: 0.25, raw: true });
    }
    const hem = [];
    for (let i = flaps.length - 1; i >= 0; i--) hem.push([flaps[i], hemY(flaps[i]) + (i % 2 ? 0.7 : 0) * (i < flaps.length - 1 ? 1 : 0)]);
    part('pel', [[-9.8, -115.2], [18.6, -115.2], [20.4, -101], [22.6, -90], [24.4, -79.4, 1]].concat(hem.slice(1, -1).map((q) => [q[0], q[1], 1])).concat([[-18.4, hemY(-18.4), 1], [-15.6, -90], [-12.6, -101]]),
      CLOTH(90, { fill: 0.45, gfill: 0.58, stip: 1.4, tone: { base: 0.62, grad: 0.4, core: [2.4, 0.25], blobs: [[-6, -96, 2.4, 14, 0.2], [19.5, -94, 2, 12, 0.2]] },
        h: [{ ang: 62, sp: 0.62, thr: [0.1, 0.62], w: [0.14, 0.28] }, { ang: 118, sp: 0.62, thr: [0.3, 0.75], w: [0.12, 0.22] }],
        deco: sdeco }));
    tabard(part);
    beltParts(part);

    // ---- head under the helmet: face, the brim's shadow, mask, hair ----
    headParts(part);
    // ---- cowl: the scarf wound round the neck, bulk at the throat, a V over the sternum ----
    cowlParts(part);

    // ---- far pauldron, over the cowl: a smaller dome turned away from the light ----
    part('torso', [[10.4, -145.6], [12, -149.4], [15.6, -150.6], [19.4, -149], [21.8, -145.4], [22.8, -140.6], [22.4, -137.4, 1], [19, -138.4], [15.4, -140.2], [11.6, -142.2]],
      METAL(40, { tone: { base: 0.66, grad: 0.55, core: [1.4, 0.25], hl: [1, 0.3], blobs: [[14.6, -148.2, 3, 1.4, -0.35]] },
        h: [{ mode: 'arc', c: [17, -139], asp: 0.85, sp: 0.55, thr: [0.25, 0.55], w: [0.16, 0.3] }, { ang: 50, sp: 0.6, thr: [0.62], w: [0.18] }],
        deco: [{ pts: [[11.4, -143.4], [15.4, -141.2], [19.2, -139.6], [22.4, -138.8]], w: 0.4 }, { pts: [[12.6, -147.8], [15.6, -149.4], [18.6, -148.6]], w: 0.55, c: 'paper' }] }));
    rosette(part, 'torso', [14.2, -145], 2.2, 2.4, -15);

    // ---- near arm ----
    nearArm(part);

    // ---- top tier of the cloak: short broad feathers fanned out from under the pauldron's rim ----
    const top = [[-26, -129, 104], [-31, -129.5, 110], [-36, -131, 116], [-40.6, -133.5, 122]];
    for (const [x, y, a] of top) { const [r, t] = fromTip([x, y], a, 16); feather('ck5', r, t, 3.3, { cloak: true, shOff: [-0.3, 2.2] }, Object.assign({}, CLK, { side: -1, curl: -0.03 })); }

    // ---- near pauldron: a dome, two lames, the rosette boss, a scroll band on the rim ----
    nearPauldron(part);

    // ---- grip hand on the staff ----
    gripHand(part);

    // ---- helmet ----
    helmetParts(part, feather);
  }

  // ---- a scalloped light trim band along a hem -----------------------------------------
  function hemTrim(part, line) {
    const pl = curve(line, false, 0.6);
    const top = [], bot = [];
    pl.forEach((p, i) => {
      const q = pl[Math.min(pl.length - 1, i + 1)], r = pl[Math.max(0, i - 1)];
      const d = nrm(sub(q, r)), n = [-d[1], d[0]];
      top.push(add(p, mul(n, -0.9)));
      const sc = 0.95 + 0.45 * Math.abs(Math.sin(i * 0.6 * Math.PI / 2.4));
      bot.push(add(p, mul(n, sc)));
    });
    part('pel', top.concat(bot.reverse()), { raw: true, fill: 'paper', gfill: 0.08, ol: 0.3, sil: false, tone: { base: 0.15, grad: 0.4 },
      h: [{ ang: 80, sp: 0.6, thr: [0.3], w: [0.14] }],
      deco: [{ pts: line.map((p) => [p[0], p[1] - 0.15]), w: 0.22 }].concat(line.length > 2 ? [] : []) });
  }

  // ---- arms ----------------------------------------------------------------------------
  function nearArm(part) {
    // bare upper arm: deltoid cap under the pauldron, biceps forward, triceps behind
    part('upN', [[-25.4, -143], [-27, -137], [-27.8, -130], [-26.8, -123], [-24.6, -118], [-21, -114.2], [-16, -113.6], [-12.6, -115.4], [-11, -119],
      [-8.6, -123.6], [-7.8, -128.6], [-8.8, -134.4], [-11.4, -140], [-17, -143.6]],
      SKIN(-80, { stip: 5, dot: 0.22, tone: { dir: [-0.97, 0.25], base: 0.5, grad: 0.75, core: [2.4, 0.3], hl: [1.8, 0.25],
        blobs: [[-18.6, -127, 1.3, 7, 0.32], [-24, -126, 2, 6, 0.22], [-12, -118, 2, 2, 0.25], [-13, -130, 2.4, 4, -0.2]] },
        h: [{ ang: 6, sp: 0.62, bow: -1.4, thr: [0.12, 0.5], w: [0.12, 0.26] }, { ang: 64, sp: 0.64, bow: -0.6, thr: [0.34, 0.68], w: [0.1, 0.2] }],
        deco: [
          { pts: [[-12.6, -138], [-10.8, -131], [-11.2, -125], [-13.2, -120.6]], w: 0.26 }, // biceps
          { pts: [[-19.6, -135], [-18.4, -128], [-18.8, -121], [-20, -117]], w: 0.26 }, // biceps / triceps split
          { pts: [[-25.6, -137.6], [-21, -134.4], [-16, -135.2]], w: 0.24 }, // deltoid
          { pts: [[-24.8, -124], [-22.4, -120.6], [-21.6, -117]], w: 0.22 },
        ] }));
    // bracer: engraved metal from below the elbow to the wrist, flared rims at both ends,
    // wider at the elbow, three vertical panels with a scroll chain in the middle one
    const br = [[-25.8, -117.8], [-18.6, -118.4], [-11.4, -117.8], [-11.6, -115.2], [-11.2, -110], [-10.2, -104.6], [-9.2, -102.4], [-8.8, -99.8], [-14.8, -99.2], [-21.2, -100], [-21.2, -102.4],
      [-22.6, -108], [-24.4, -114.4], [-25.8, -115.4]];
    const bd = [
      { pts: [[-25.4, -115.6], [-18.6, -116.2], [-11.8, -115.6]], w: 0.4, c: 'deep' }, { pts: [[-25.2, -116.8], [-18.6, -117.4], [-11.8, -116.8]], w: 0.7, c: 'paper' },
      { pts: [[-21, -102.2], [-15, -101.6], [-9.4, -102.2]], w: 0.4, c: 'deep' }, { pts: [[-21, -100.9], [-15, -100.3], [-9.2, -100.8]], w: 0.7, c: 'paper' },
      { pts: [[-21.6, -114.8], [-19.4, -108], [-18.6, -102.8]], w: 0.3, c: 'deep' }, { pts: [[-15, -115.2], [-13.6, -108], [-13.2, -102.6]], w: 0.3, c: 'deep' },
      { pts: [[-12.4, -114.6], [-11.4, -108], [-10.4, -103.2]], w: 0.6, c: 'paper' },
    ];
    for (let k = 0; k < 4; k++) {
      const y = -113.6 + k * 2.9, x = -17.6 + k * 0.5, sg = k % 2 ? -1 : 1;
      bd.push({ pts: [[x, y], [x + sg * 1.3, y + 0.6], [x + sg * 1.1, y + 1.7], [x, y + 1.4], [x - sg * 0.3, y + 0.8]], w: 0.24 });
    }
    part('foN', br, METAL(-80, { stip: 2, tone: { dir: [-0.97, 0.25], base: 0.62, grad: 0.8, core: [1.8, 0.3], hl: [1, 0.3], blobs: [[-12.4, -108, 1.1, 7, -0.4]] },
      h: [{ ang: -76, sp: 0.55, bow: -1.2, thr: [0.3, 0.6], w: [0.14, 0.3] }, { ang: -20, sp: 0.62, thr: [0.7], w: [0.16] }], deco: bd }));
    // fist from the back of the hand: the wrist, the knuckle row forward, fingers curled under in
    // shadow, the thumb laid across the index finger
    // back of the hand and the heel of the palm
    part('foN', [[-20.4, -99.8], [-20.8, -95.6], [-20, -91.2], [-18.2, -87.6], [-15.4, -85.2], [-12, -84.4], [-9.6, -85], [-9.4, -97.6], [-9.6, -99.4]],
      SKIN(-10, { stip: 3, dot: 0.2, tone: { dir: [-0.9, 0.45], base: 0.45, grad: 0.75, core: [1.6, 0.3], hl: [1.2, 0.3], blobs: [[-17.6, -90, 2.4, 4.4, 0.22]] },
        h: [{ ang: -5, sp: 0.62, bow: -0.6, thr: [0.18, 0.55], w: [0.11, 0.22] }, { ang: 60, sp: 0.64, thr: [0.4, 0.72], w: [0.1, 0.18] }],
        deco: [{ pts: [[-17.4, -98.4], [-14.2, -95.4], [-11, -94.6]], w: 0.24 }, { pts: [[-17.8, -95.6], [-14.6, -92.4], [-11.2, -91.6]], w: 0.22 }, { pts: [[-17.6, -92.4], [-14.6, -89.4], [-11.4, -88.6]], w: 0.2 }] }));
    // four fingers curled under, stacked down the front, each a rounded knuckle; the pinky smallest
    const fy = [-95.4, -92.3, -89.3, -86.5];
    fy.forEach((y, i) => {
      const h = 3.2 - i * 0.2, x0 = -10.4, x1 = -4.6 - i * 0.5;
      part('foN', [[x0, y - h / 2], [x1 - 1.4, y - h / 2 - 0.1], [x1 - 0.2, y - h / 4], [x1, y + 0.2], [x1 - 0.5, y + h / 2], [x1 - 1.6, y + h / 2 + 0.2], [x0, y + h / 2 + 0.1]],
        SKIN(90, { stip: 2, dot: 0.2, tone: { dir: [-0.5, 0.86], base: 0.4, grad: 0.7, core: [0.8, 0.35], hl: [0.6, 0.3] },
          h: [{ ang: 90, sp: 0.5, bow: 0.5, thr: [0.25, 0.55], w: [0.12, 0.24] }],
          deco: [{ pts: [[x1 - 2.8, y - h / 2 + 0.3], [x1 - 2.4, y], [x1 - 2.8, y + h / 2 - 0.3]], w: 0.26 }] }));
    });
    // the thumb laid across the index finger
    part('foN', [[-14.6, -97.4], [-12, -98.6], [-8.4, -98.4], [-5.6, -97.4], [-5.2, -96], [-7.4, -95.6], [-10.6, -95.8], [-13.6, -96]],
      SKIN(0, { stip: 2, dot: 0.2, tone: { base: 0.3, grad: 0.6, core: [0.8, 0.3], hl: [0.8, 0.3] }, deco: [{ pts: [[-6.6, -97.8], [-6.2, -96.4]], w: 0.26 }] }));
  }
  function farBracer(part) {
    part('foF', [[16.6, -124.2], [22, -124.6], [26.4, -124.4], [28.4, -123.8], [29.4, -121], [29.6, -117], [28.8, -113.6], [26.4, -112.8], [22, -112.6], [16.6, -113]],
      METAL(-80, { stip: 1.2, tone: { dir: [-0.2, 0.98], base: 0.6, grad: 0.75, core: [1.6, 0.3], hl: [1, 0.3], blobs: [[22, -122.2, 5, 1.1, -0.35]] },
        h: [{ ang: -88, sp: 0.6, bow: 0.8, thr: [0.3, 0.6], w: [0.14, 0.3] }, { ang: -20, sp: 0.64, thr: [0.72], w: [0.16] }],
        deco: [
          { pts: [[18.4, -123.4], [19.6, -116], [18.6, -113.4]], w: 0.28 },
          { pts: [[19.6, -118.6], [21, -120.2], [22.4, -118.4], [23.8, -120], [25.2, -118.2]], w: 0.3 },
          { pts: [[19.6, -115.6], [21, -117], [22.4, -115.4], [23.8, -116.8], [25.2, -115.2]], w: 0.26 },
        ] }));
    // wrist ring by the hand
    part('foF', [[26.4, -125], [29.6, -124.6], [30.4, -119], [29.8, -112.6], [26.6, -112.2], [27.2, -118.4]],
      METAL(0, { tone: { base: 0.45, grad: 0.8, core: [0.8, 0.3], hl: [0.8, 0.4] }, h: [{ ang: 0, sp: 0.5, bow: 0.8, thr: [0.3, 0.62], w: [0.16, 0.3] }],
        deco: [{ pts: [[28.2, -124.4], [28.8, -118.6], [28.2, -112.8]], w: 0.7, c: 'paper' }] }));
  }
  function gripHand(part) {
    // back of the hand from the wrist to the knuckles
    part('hand', [[29.4, -126.6], [32.4, -128], [35.6, -127.6], [37, -126], [37.4, -120], [37, -114.6], [33.4, -113.6], [30, -114.4], [29.2, -120]],
      SKIN(0, { tone: { base: 0.42, grad: 0.75, core: [1.6, 0.35], hl: [1.2, 0.3] } }));
    // four fingers wrapped round the shaft, the pinky lowest
    const fy = [-126.2, -123.2, -120.2, -117.3];
    fy.forEach((y, i) => {
      const h = 2.9 - i * 0.15, x0 = 33, x1 = 39.8 - i * 0.5;
      part('hand', [[x0, y - h / 2], [x1 - 1.4, y - h / 2 - 0.2], [x1, y - 0.3], [x1 - 0.6, y + h / 2], [x0, y + h / 2 + 0.1]],
        SKIN(90, { sil: true, tone: { base: 0.38, grad: 0.7, core: [0.8, 0.35], hl: [0.6, 0.3] }, stip: 1.2,
          h: [{ ang: 90, sp: 0.55, bow: 0.5, thr: [0.25, 0.55], w: [0.12, 0.24] }],
          deco: [{ pts: [[x1 - 2.6, y - h / 2 + 0.2], [x1 - 2.2, y], [x1 - 2.6, y + h / 2 - 0.2]], w: 0.26 }] }));
    });
    // the thumb over the top of the fist
    part('hand', [[29.6, -127.2], [31.6, -129.4], [34.4, -129.6], [36.6, -128.6], [37.2, -127.2], [35.4, -126.4], [32.4, -126.2]],
      SKIN(10, { tone: { base: 0.25, grad: 0.6, core: [1, 0.3], hl: [0.8, 0.3] }, deco: [{ pts: [[35.6, -128.8], [36.2, -127.6]], w: 0.26 }] }));
  }

  // ---- legs: continuous bare legs, greave-boots, ankle straps and wings -----------------
  function legParts(part, side) {
    const N = side === 'N';
    const th = 'th' + side, sh = 'shin' + side, ft = 'ft' + side;
    const LEGH = (ang) => [{ ang, sp: 0.6, bow: -1.3, thr: [0.28, 0.58], w: [0.12, 0.26] }, { ang: ang + 58, sp: 0.64, bow: -0.6, thr: [0.48, 0.74], w: [0.1, 0.2] }];
    // calf and shin, under the thigh's knee so the leg reads as one form
    if (N) {
      part(sh, [[-12, -64], [-17.2, -61.5], [-17.9, -57.5], [-19, -54], [-21, -50.5], [-22.8, -47.2], [-23.4, -43.6], [-22.6, -38], [-10.6, -38], [-10.3, -43],
        [-9.6, -47.4], [-8.8, -51.4], [-7.7, -55.4], [-6.6, -59], [-6.2, -62.5]],
        SKIN(-25, { h: LEGH(-25), tone: { dir: [-0.97, 0.25], base: 0.42, grad: 0.65, core: [2.2, 0.32], hl: [1.6, 0.3], blobs: [[-19.4, -49, 1.8, 5, 0.22], [-14.8, -52.5, 1, 4, 0.16]] },
          deco: [{ pts: [[-15.6, -57.6], [-16.6, -52], [-16, -46]], w: 0.24 }, { pts: [[-9.4, -55], [-10, -50], [-10.4, -45]], w: 0.2 }] }));
    } else {
      part(sh, [[11, -64], [4.6, -62], [4.1, -58], [3.2, -54], [2.2, -50.4], [1.6, -46.6], [2.2, -38], [16.8, -38], [16.7, -43], [17, -47.6], [17.4, -51.6], [17.6, -55.6],
        [17.5, -59.4], [17, -62.6]],
        SKIN(-20, { h: LEGH(-20), tone: { dir: [-0.97, 0.25], base: 0.42, grad: 0.65, core: [2.2, 0.32], hl: [1.6, 0.3], blobs: [[4, -50, 1.8, 5, 0.22], [9.6, -52, 1, 4, 0.16]] },
          deco: [{ pts: [[8.2, -57.6], [8, -52], [8.6, -46]], w: 0.24 }, { pts: [[15.4, -55], [15.2, -50], [15.6, -45]], w: 0.2 }] }));
    }
    // greave-boot shaft: flared to a cuff at the top (taller at the front), tapering to the ankle strap,
    // a cuff band above a V seam and two engraved scroll panels down the shaft
    const G = N
      ? { poly: [[-27.4, -46, 1], [-21, -44.8], [-16, -44.6], [-11, -46.4, 1], [-11.2, -42.4], [-12.4, -38.4], [-12.8, -32], [-12.6, -24], [-12, -15], [-24.2, -15], [-24.6, -24], [-25, -32], [-25.4, -38.6], [-26.4, -42.6]],
        v: [[-26.2, -42.4], [-18.6, -37.6, 1], [-11.6, -42.6]], mid: -18.6, cuffTop: [[-27.2, -45.4], [-21, -44.2], [-16, -44], [-11.2, -45.8]] }
      : { poly: [[2.4, -45.6, 1], [8, -44.2], [13, -44.2], [18.8, -45.8, 1], [18.2, -41.6], [17.4, -38], [17.1, -30], [17.1, -22], [17.6, -15], [5, -15], [4.6, -22], [4.2, -30], [3.6, -38], [3, -41.8]],
        v: [[3.2, -41.8], [10.8, -37, 1], [18.2, -41.8]], mid: 10.8, cuffTop: [[2.6, -45], [8, -43.6], [13, -43.6], [18.6, -45.2]] };
    const m = G.mid;
    const scroll = (x, y0, y1, sg) => {
      const out = [];
      for (let y = y0; y > y1 + 2.4; y -= 3.4) {
        out.push({ pts: [[x, y], [x + sg * 1.3, y - 0.8], [x + sg * 1.1, y - 2], [x, y - 1.7], [x - sg * 0.2, y - 1]], w: 0.24 });
        out.push({ pts: [[x, y - 1.7], [x - sg * 1.1, y - 2.6], [x - sg * 0.6, y - 3.4]], w: 0.22 });
        sg = -sg;
      }
      return out;
    };
    part(sh, G.poly, METAL(-82, { stip: 1.2, tone: { dir: [-0.97, 0.25], base: 0.58, grad: 0.8, core: [2.2, 0.32], hl: [1.4, 0.3], blobs: [[m + 3, -28, 1.4, 9, -0.34]] },
      h: [{ ang: -84, sp: 0.55, bow: 0.8, thr: [0.28, 0.6], w: [0.14, 0.3] }, { ang: -20, sp: 0.62, thr: [0.66], w: [0.18] }],
      deco: [
        { pts: G.v, w: 1.1, c: 'paper' }, { pts: G.v.map((p) => [p[0], p[1] + 0.9, p[2]]), w: 0.36, c: 'deep' }, { pts: G.v.map((p) => [p[0], p[1] - 0.9, p[2]]), w: 0.3 },
        { pts: G.cuffTop, w: 0.9, c: 'paper' }, { pts: G.cuffTop.map((p) => [p[0], p[1] + 0.8]), w: 0.3 },
        { pts: [[m - 3.6, -36], [m - 3.8, -27], [m - 3.6, -19]], w: 0.3 }, { pts: [[m - 0.4, -35.4], [m - 0.4, -19]], w: 0.3 },
        { pts: [[m + 3.4, -36], [m + 3.6, -27], [m + 3.8, -19]], w: 0.3 },
      ].concat(scroll(m - 2, -34.6, -19, 1), scroll(m + 1.6, -34.4, -19, -1)).concat([{ pts: [[N ? -13.8 : 15.8, -38], [N ? -14 : 15.6, -20]], w: 0.6, c: 'paper' }]) }));
    // foot: heavy boot, a blunt rounded toe with a toe-cap seam, a welted sole with a lit edge,
    // a separate block heel
    const F = N
      ? { poly: [[-23.8, -15.6], [-25, -12.4], [-25.4, -8.4], [-25.4, -4.6], [-25.7, -3.1, 1], [-25.6, -0.3, 1], [-20.4, -0.3, 1], [-20.2, -1.7, 1], [-16.6, -1.2], [-12, -0.3], [-8.2, -0.4], [-6, -1.3], [-5.5, -3], [-6.3, -4.8], [-8.4, -6.6],
          [-10.4, -9], [-11.4, -12.2], [-11.8, -15.6]],
        sole: [[-25.6, -3.1], [-16, -3.2], [-5.6, -2.8]], cap: [[-11.4, -3], [-11, -6.2], [-8.6, -7.6]], instep: [[-25, -10], [-18, -11.4], [-11.4, -12.2]], heel: [[-25.6, -1.7], [-20.3, -1.7]], hl: [-8, -4.2] }
      : { poly: [[5.6, -15.6], [4.6, -12.4], [4.2, -8.4], [4.2, -4.6], [3.9, -3.1, 1], [4, -0.3, 1], [9.4, -0.3, 1], [9.6, -1.7, 1], [14, -1.2], [20, -0.3], [30, -0.4], [32.9, -1.2], [33.5, -2.9], [32.6, -4.5], [29.8, -5.9], [26, -7.5],
          [22.4, -9.6], [19.8, -12.4], [18.6, -15.6]],
        sole: [[4, -3.1], [16, -3.2], [33.4, -3]], cap: [[24.4, -3], [24.4, -6.2], [22.4, -8.8]], instep: [[4.6, -10], [12, -11.6], [19.6, -12.4]], heel: [[4, -1.7], [9.5, -1.7]], hl: [29, -4.6] };
    part(ft, F.poly, METAL(-15, { stip: 1.4, tone: { base: 0.6, grad: 0.8, core: [1.8, 0.35], hl: [1.4, 0.4], blobs: [[F.hl[0], F.hl[1], 3, 1.6, -0.35]] },
      h: [{ ang: -25, sp: 0.56, bow: 0.8, thr: [0.3, 0.6], w: [0.14, 0.3] }, { ang: 40, sp: 0.62, thr: [0.68], w: [0.16] }],
      deco: [
        { pts: F.sole, w: 0.45, c: 'deep' }, { pts: F.sole.map((q) => [q[0], q[1] + 0.7]), w: 0.6, c: 'paper' }, { pts: F.sole.map((q) => [q[0], q[1] + 1.35]), w: 0.3 },
        { pts: F.heel, w: 0.4, c: 'deep' }, { pts: [[F.heel[1][0], -0.4], [F.heel[1][0], -3]], w: 0.4, c: 'deep' },
        { pts: F.cap, w: 0.45 }, { pts: F.cap.map((q) => [q[0] + 0.5, q[1]]), w: 0.5, c: 'paper' },
        { pts: F.instep, w: 0.35 },
      ] }));
    // ankle strap with its boss, an ankle wing rising up and back
    const strap = N ? [[-23.8, -17.8], [-11.4, -19.8], [-11.2, -16.2], [-23.8, -14.2]] : [[4.8, -19.2], [18, -20.8], [18.2, -17.2], [4.8, -15.6]];
    part(sh, strap, METAL(0, { raw: true, tone: { base: 0.45, grad: 0.5, core: [0.8, 0.3] }, h: [{ ang: 0, sp: 0.55, thr: [0.3, 0.62], w: [0.16, 0.3] }],
      deco: [{ pts: [strap[0], strap[1]].map((p) => [p[0], p[1] + 0.9]), w: 0.6, c: 'paper' }] }));
    const boss = N ? [-21.5, -16.3] : [11.8, -17.8];
    ankleWing(part, sh, boss, N ? 1.2 : 1.12);
    part(sh, ell(boss, 2.1, 2.2, 0, 16), METAL(0, { raw: true, tone: { base: 0.3, grad: 0.7, core: [0.8, 0.3], hl: [0.8, 0.4] },
      h: [{ mode: 'arc', c: boss, sp: 0.5, thr: [0.3, 0.6], w: [0.18, 0.3] }], deco: [{ pts: ell(boss, 1.2, 1.25, 0, 12), closed: true, w: 0.3 }] }));
    // thigh last: one continuous outline down over the knee into the calf (open where it joins)
    if (N) {
      part(th, [[-19.2, -92], [-20.6, -84], [-21.4, -77], [-21, -71], [-19.6, -66], [-18.4, -62.5], [-17.7, -58.5], [-16.4, -55.6], [-13.4, -54.4], [-10, -54.6], [-7.4, -56],
        [-6.1, -58.3], [-4.6, -60.6], [-2.6, -63.2], [-1.4, -65.8], [-0.9, -69], [-0.6, -73.5], [-0.4, -80], [-0.6, -92]],
        SKIN(-15, { h: LEGH(-15), olCut: [-17.3, -57.2, -6.7, -50],
          tone: { dir: [-0.97, 0.25], base: 0.42, grad: 0.65, core: [2.4, 0.32], hl: [2, 0.3],
            blobs: [[-18.4, -74, 2, 9, 0.22], [-14.2, -72, 0.9, 10, 0.3], [-8.6, -62.8, 2.2, 1.3, 0.3], [-10.6, -55.2, 2.6, 1.3, 0.38], [-15.6, -60, 1.4, 3, 0.25], [-4.4, -66.4, 1, 3.4, 0.24], [-9, -76, 3, 8, -0.2]] },
          deco: [
            { pts: [[-11.6, -88], [-13, -78], [-14.4, -68], [-15.2, -62.5]], w: 0.34, c: 'deep' }, // vastus lateralis / rectus
            { pts: [[-4.6, -80], [-5.2, -74], [-6.4, -70]], w: 0.26 }, // rectus / vastus medialis
            { pts: [[-6.2, -72.5], [-8.2, -66.5], [-7.6, -62.4], [-5, -60.6]], w: 0.34, c: 'deep' }, // teardrop
            { pts: ell([-10.6, -58.6], 2.4, 2.2, -10, 8, 0.55 * Math.PI, 1.25 * Math.PI), w: 0.36, c: 'deep' }, // kneecap and the shadow under it
            { pts: ell([-10.6, -58.6], 2.4, 2.2, -10, 8, -0.3 * Math.PI, 0.35 * Math.PI), w: 0.26 },
            { pts: [[-17, -57], [-15.6, -54.8], [-12.4, -54.2]], w: 0.3, c: 'deep' },
          ] }));
    } else {
      part(th, [[5, -92], [4.2, -84], [3.2, -76], [2.9, -70], [3.3, -66], [4.1, -62.5], [4.5, -58.5], [6.2, -55.8], [9.5, -54.6], [13, -54.8], [15.6, -56], [17.2, -58.5],
        [17.8, -61.5], [19, -64.8], [19.7, -69], [19.8, -75], [19.4, -82], [18.6, -92]],
        SKIN(-12, { h: LEGH(-12), olCut: [4.9, -57.2, 16.9, -50],
          tone: { dir: [-0.97, 0.25], base: 0.42, grad: 0.65, core: [2.4, 0.32], hl: [1.8, 0.3],
            blobs: [[4.6, -72, 1.8, 8, 0.24], [9.6, -73, 0.9, 10, 0.26], [11.6, -62.8, 2.2, 1.3, 0.3], [11.6, -55.2, 2.6, 1.3, 0.38], [16.4, -60, 1.2, 3, 0.22], [6, -63, 1.4, 3, 0.22], [14, -77, 3, 8, -0.2]] },
          deco: [
            { pts: [[14, -84], [15.2, -75], [16.2, -67], [16.6, -62.6]], w: 0.3 },
            { pts: [[9, -86], [9.6, -77], [10.2, -68]], w: 0.3, c: 'deep' },
            { pts: [[7.4, -72], [5.4, -66.4], [6, -62.6], [8.4, -61]], w: 0.34, c: 'deep' },
            { pts: ell([11.6, -58.6], 2.4, 2.2, 0, 8, 0.55 * Math.PI, 1.25 * Math.PI), w: 0.36, c: 'deep' },
            { pts: ell([11.6, -58.6], 2.4, 2.2, 0, 8, -0.3 * Math.PI, 0.35 * Math.PI), w: 0.26 },
          ] }));
    }
  }

  // ---- ankle wing: an arched leading edge over short round-tipped feathers sweeping back ----
  function ankleWing(part, bone, b, k) {
    const P = (q) => [b[0] + q[0] * k, b[1] + q[1] * k].concat(q[2] ? [1] : []);
    const tips = [[-8.5, -12.1], [-9.1, -9.7], [-8.7, -7.3], [-7.3, -5.1], [-5.1, -3.3]];
    const roots = [[-3.1, -8.3], [-2.5, -6.9], [-2.1, -5.5], [-1.7, -4.1], [-1.3, -2.9]];
    for (let i = tips.length - 1; i >= 0; i--) part.feather(bone, P(roots[i]), P(tips[i]), 1.5 * k, { bsp: 0.45, curl: 0.06 });
    part(bone, [[0, -1.2, 1], [0.3, -3.7], [-0.5, -6.2], [-2.3, -8.5], [-4.5, -10.1], [-6.9, -11.5], [-4.1, -8.9], [-3.9, -7.3], [-3.7, -6.1, 1], [-3.1, -4.9], [-2.7, -3.9, 1], [-1.9, -2.9], [-0.8, -1.6]].map(P),
      { fill: 'paper', gfill: 0.06, ol: 0.3, sil: false, tone: { base: 0.15, grad: 0.55, core: [0.5, 0.2] }, h: [{ ang: -40, sp: 0.5, thr: [0.3, 0.6], w: [0.12, 0.2] }],
        deco: [{ pts: [[-0.6, -3.6], [-1.6, -4.8], [-1.6, -6.4]].map(P), w: 0.22 }, { pts: [[-1.6, -6.4], [-2.8, -7.4], [-3.2, -8.8]].map(P), w: 0.22 }] });
  }

  // ---- a wing: primaries fanned from a root, rounded tips, coverts with an arched leading edge ---
  // angs/lens: each primary's angle and length from the root, the leading one first
  function wingFan(part, bone, root, angs, lens, W, o) {
    o = o || {};
    const n = angs.length;
    const sg = Math.sign(angs[1] - angs[0]);
    const D = angs.map(vdeg);
    for (let i = n - 1; i >= 0; i--) {
      const u = i / (n - 1);
      part.feather(bone, add(root, mul(D[i], lens[i] * 0.14)), add(root, mul(D[i], lens[i])), W * (1 - 0.3 * u), o.fo);
    }
    const out = vdeg(angs[0] - sg * 90);
    const cr = o.cov || 0.42;
    const Lat = (u) => { const f = u * (n - 1), i = Math.min(n - 2, Math.floor(f)); return lerp(lens[i], lens[i + 1], f - i); };
    const Aat = (u) => { const f = u * (n - 1), i = Math.min(n - 2, Math.floor(f)); return lerp(angs[i], angs[i + 1], f - i); };
    const cov = [[root[0], root[1], 1], add(add(root, mul(D[0], lens[0] * 0.2)), mul(out, W * 1.1)), add(add(root, mul(D[0], lens[0] * cr * 0.85)), mul(out, W * 0.7))];
    const lobes = o.lobes || Math.max(3, n - 2);
    const row2 = [];
    for (let j = 0; j <= lobes; j++) {
      const u = j / lobes;
      const r = Lat(u * 0.92) * cr * (1 + 0.1 * (1 - u));
      cov.push(add(root, mul(vdeg(Aat(u * 0.92)), r)));
      if (j < lobes) {
        const u2 = (j + 0.5) / lobes;
        const p = add(root, mul(vdeg(Aat(u2 * 0.92)), Lat(u2 * 0.92) * cr * 0.84));
        cov.push([p[0], p[1], 1]);
      }
      row2.push(add(root, mul(vdeg(Aat(u * 0.9)), Lat(u * 0.9) * cr * 0.55)));
    }
    const deco = [];
    for (let j = 0; j < row2.length - 1; j++) {
      const a = row2[j], b = row2[j + 1], c = add(mix(a, b, 0.5), mul(nrm(sub(mix(a, b, 0.5), root)), 0.7));
      deco.push({ pts: [a, c, b], w: 0.22 });
    }
    part(bone, cov, { fill: 'paper', gfill: 0.06, ol: 0.3, sil: false, tone: { base: 0.12, grad: 0.55, core: [0.6, 0.2] },
      h: [{ ang: angs[0] + sg * 70, sp: 0.55, thr: [0.32, 0.62], w: [0.12, 0.22] }], deco });
  }

  // ---- caduceus -------------------------------------------------------------------------
  function snakePath(sgn) {
    // centre line of one snake: head under the wings facing the shaft, three crossings
    const X = (x) => 34.5 + sgn * (x - 34.5);
    const pts = [[32.6, -160.2], [29.6, -160.6], [26.6, -159.2], [25.4, -157], [26.4, -154.4], [29.8, -152], [34.5, -150], [39.2, -148.6], [40.4, -146.2],
      [38.6, -143.6], [34.5, -141.4], [31.2, -139.8], [31, -137.2], [32.6, -135], [34.5, -133.6], [36.8, -132.4], [36.2, -131], [35, -130.6]];
    return curve(pts.map((p) => [X(p[0]), p[1]]), false, 0.35);
  }
  function staffParts(part, add_) {
    const sx = 34.5;
    // snakes behind the shaft (the whole body); the front crossings are drawn again over it
    const bodies = [1, -1].map((s) => snakePath(s));
    const snakeDeco = (pl, from, to) => {
      const seg = pl.filter((p) => p[1] >= from && p[1] <= to);
      const ticks = [];
      for (let i = 1; i < pl.length - 1; i += 2) {
        const p = pl[i];
        if (p[1] < from || p[1] > to) continue;
        const d = nrm(sub(pl[i + 1], pl[i - 1])), n = [-d[1], d[0]];
        ticks.push([add(p, mul(n, 1.1)), add(p, mul(n, -1.1))]);
      }
      return { seg, ticks };
    };
    const snake = (pl, from, to) => {
      const { seg, ticks } = snakeDeco(pl, from, to);
      if (seg.length < 2) return;
      const T = new Path2D();
      for (const [a, b] of ticks) { T.moveTo(a[0], a[1]); T.lineTo(b[0], b[1]); }
      const shade = seg.map((p, i) => { const q = seg[Math.min(seg.length - 1, i + 1)], r = seg[Math.max(0, i - 1)]; const d = nrm(sub(q, r)); const n = [-d[1], d[0]]; return add(p, mul(n, dot(n, AW) > 0 ? 0.8 : -0.8)); });
      add_({ bone: 'staff', snake: true, P: toPath(seg, false), T, S: toPath(shade, false) });
    };
    for (const pl of bodies) snake(pl, -170, -120);
    // shaft
    part('staff', [[sx - 1.2, -166, 1], [sx + 1.2, -166, 1], [sx + 1.2, -49, 1], [sx - 1.2, -49, 1]], METAL(0, { sil: true,
      tone: { base: 0.35, grad: 0.0, dir: [-1, 0], core: [0.9, 0.4], hl: [0.6, 0.35] }, stip: 1.5,
      h: [{ ang: 0, sp: 0.75, thr: [0.3, 0.65], w: [0.2, 0.35] }] }));
    // ring knops along the shaft
    for (const y of [-131, -104, -77]) {
      part('staff', [[sx - 2, y - 1, 1], [sx + 2, y - 1, 1], [sx + 2.1, y + 1, 1], [sx - 2.1, y + 1, 1]], METAL(0, { tone: { base: 0.35, grad: 0, dir: [-1, 0], core: [1, 0.4], hl: [0.8, 0.35] },
        h: [{ ang: 90, sp: 0.6, thr: [0.3, 0.65], w: [0.18, 0.3] }], deco: [{ pts: [[sx - 2, y], [sx + 2, y]], w: 0.25 }] }));
    }
    // butt: a knop and a tapering point
    part('staff', [[sx - 2.1, -51, 1], [sx + 2.1, -51, 1], [sx + 2, -47.6], [sx + 1, -46.6], [sx + 1.9, -44.6], [sx + 0.2, -41, 1], [sx - 0.2, -41, 1], [sx - 1.9, -44.6], [sx - 1, -46.6], [sx - 2, -47.6]],
      METAL(0, { tone: { base: 0.38, grad: 0, dir: [-1, 0], core: [1, 0.4], hl: [0.8, 0.35] }, h: [{ ang: 90, sp: 0.6, thr: [0.3, 0.65], w: [0.18, 0.3] }],
        deco: [{ pts: [[sx - 2, -49], [sx + 2, -49]], w: 0.3 }, { pts: [[sx - 1.6, -46.6], [sx + 1.6, -46.6]], w: 0.3 }] }));
    // front crossings over the shaft
    for (const [i, pl] of bodies.entries()) {
      if (i === 0) { snake(pl, -151.6, -148.4); snake(pl, -135.4, -131.8); } else snake(pl, -143, -139.8);
    }
    // heads facing each other
    for (const s of [1, -1]) {
      const X = (x) => sx + s * (x - sx);
      const hc = [30.4, -160.2];
      const hd = [[32.8, -160.1], [31.8, -161.2], [29.4, -161.6], [27.8, -160.6], [28.2, -159.2], [30.4, -158.9], [32.4, -159.4]].map(([x, y]) => [X(hc[0] + (x - hc[0]) * 1.5), hc[1] + (y - hc[1]) * 1.5]);
      part('staff', hd, METAL(0, { tone: { base: 0.3, grad: 0.5, core: [0.6, 0.3] }, h: [{ ang: 10, sp: 0.55, thr: [0.3], w: [0.18] }],
        deco: [{ pts: ell([X(30.2), -160.6], 0.4, 0.35, 0, 8), closed: true, w: 0.3, fill: true }, { pts: [[X(32.6), -159.8], [X(30.4), -159.6]], w: 0.25 }] }));
    }
    // wings: swept up and out in a V, the primary tips above the root, a scalloped covert row
    for (const s of [1, -1]) {
      const X = (x) => sx + s * (x - sx);
      const tips = [[17.4, -177.6], [18, -175], [19.2, -172.6], [20.8, -170.6], [22.8, -169], [25.2, -167.8], [27.8, -167.1], [30.4, -166.9]];
      tips.forEach(([tx, ty], i) => {
        const u = i / (tips.length - 1);
        const r = [X(lerp(27, 32.6, u)), lerp(-173, -168, u)];
        part.feather('staff', r, [X(tx), ty], 1.05 - i * 0.04, { curl: 0.04 });
      });
      const cov = [[X(33.6), -167.6, 1], [X(32.6), -170.8], [X(30), -173.6], [X(26.6), -175.8], [X(22.8), -177.4], [X(19.4), -178.4, 1]];
      // scalloped lower edge of the coverts, back toward the root
      const sc = [[20.6, -176.2], [23.2, -174.6], [25.8, -173], [28.4, -171.2], [31, -169.4]];
      for (const [x, y] of sc) { cov.push([X(x - 0.9), y + 1.3]); cov.push([X(x), y, 1]); }
      part('staff', cov, { fill: 'paper', ol: 0.32, sil: false, tone: { base: 0.15, grad: 0.5, core: [0.8, 0.3] },
        h: [{ ang: s > 0 ? -30 : 210, sp: 0.55, thr: [0.25, 0.6], w: [0.15, 0.28] }],
        deco: [{ pts: [[X(31.4), -170.8], [X(28), -173], [X(24.4), -174.8], [X(21), -176.4]], w: 0.24 }] });
    }
    // collar and sphere
    part('staff', [[sx - 1.9, -170, 1], [sx + 1.9, -170, 1], [sx + 1.6, -165.6, 1], [sx - 1.6, -165.6, 1]], METAL(0, { tone: { base: 0.35, grad: 0, dir: [-1, 0], core: [0.9, 0.4], hl: [0.7, 0.35] },
      h: [{ ang: 90, sp: 0.55, thr: [0.3, 0.65], w: [0.18, 0.3] }], deco: [{ pts: [[sx - 1.9, -168.6], [sx + 1.9, -168.6]], w: 0.3 }, { pts: [[sx - 1.8, -166.8], [sx + 1.8, -166.8]], w: 0.3 }] }));
    const sc = [sx + 0.1, -174.2];
    part('staff', ell(sc, 4.1, 4.1, 0, 28), { raw: true, fill: 0.3, ol: 0.55, sil: true, stip: 2,
      tone: { base: 0.62, grad: 0.55, core: [1.4, 0.3], hl: [0.6, 0.2], blobs: [[sc[0] - 1.4, sc[1] - 1.6, 1.6, 1.4, -0.7]] },
      h: [{ mode: 'arc', c: sc, sp: 0.5, thr: [0.4, 0.7], w: [0.2, 0.32] }, { ang: 40, sp: 0.6, thr: [0.75], w: [0.2] }] });
  }

  // ---- torso ornaments -----------------------------------------------------------------
  function eagle(part) {
    // a heraldic eagle: wings raised up and out in a V with notched primaries, the head turned
    // to the side, a fanned tail
    const cx = 8.8;
    const st = (deco) => ({ fill: 'paper', gfill: 0.04, ol: 0.32, sil: false, tone: { base: 0.1, grad: 0.4 }, h: [{ ang: 30, sp: 0.6, thr: [0.35], w: [0.15] }], deco });
    for (const s of [1, -1]) {
      const X = (x) => cx + s * x;
      const pts = [[X(0.6), -134.6], [X(2.4), -136], [X(4.4), -138.2], [X(6.6), -140.6, 1], [X(6.8), -138.8], [X(5.6), -138.4, 1], [X(6.2), -136.8], [X(4.8), -136.4, 1],
        [X(5.2), -134.8], [X(3.8), -134.6, 1], [X(3.8), -133], [X(1.2), -132.4]];
      const deco = [{ pts: [[X(1.4), -134.4], [X(3.2), -135.8], [X(5.2), -138.6]], w: 0.2 }, { pts: [[X(1.6), -133.4], [X(3.2), -134.4], [X(4.6), -136.2]], w: 0.2 }];
      part('torso', s > 0 ? pts : pts.slice().reverse(), st(deco));
    }
    // body and fanned tail
    part('torso', [[cx - 1, -135.4], [cx + 1, -135.4], [cx + 1.3, -132], [cx + 0.9, -129], [cx + 2, -126, 1], [cx + 0.9, -126.6], [cx + 0.4, -125.4, 1], [cx - 0.3, -126.4], [cx - 0.9, -125.4, 1],
      [cx - 1.3, -126.6], [cx - 2.2, -126, 1], [cx - 1, -129], [cx - 1.4, -132]],
      st([{ pts: [[cx, -129], [cx, -126.4]], w: 0.2 }, { pts: [[cx - 0.7, -130.4], [cx, -129.4], [cx + 0.7, -130.4]], w: 0.18 }]));
    // head turned to the side, the hooked beak forward
    part('torso', [[cx - 0.9, -135.2], [cx - 1, -136.8], [cx, -137.8], [cx + 1.2, -137.6], [cx + 2.2, -137, 1], [cx + 1.3, -136.4], [cx + 0.9, -135.2]],
      st([{ pts: ell([cx + 0.3, -136.9], 0.28, 0.28, 0, 6), closed: true, w: 0.25, fill: true }]));
  }
  function tabard(part) {
    // panel to above the knee with a pointed end, a light border and the wheat stalk
    const outer = [[4.8, -115, 1], [15.8, -115, 1], [17.8, -80.4, 1], [12, -67.2, 1], [4.6, -80.4, 1]];
    part('pel', outer, { fill: 'paper', gfill: 0.1, ol: 0.4, sil: false, tone: { base: 0.2, grad: 0.4 }, h: [{ ang: 90, sp: 0.6, thr: [0.3], w: [0.18] }],
      deco: [{ pts: [[5.5, -113.4], [5.4, -82]], w: 0.25 }, { pts: [[15.2, -113.4], [17, -82]], w: 0.25 }] });
    const inner = [[6.6, -113.2, 1], [14.4, -113.2, 1], [16, -81, 1], [12, -71.6, 1], [6.4, -81, 1]];
    const deco = [{ pts: [[11.2, -108], [11.4, -78]], w: 0.55, c: 'paper' }];
    for (let i = 0; i < 6; i++) {
      const y = -81 - i * 4.4;
      for (const s of [-1, 1]) {
        const b = [11.3 + s * 0.3, y], t = [11.3 + s * 2.4, y - 3.2], m = mix(b, t, 0.5);
        const nn = mul(nrm([-(t[1] - b[1]), t[0] - b[0]]), 0.8);
        deco.push({ pts: [[b[0], b[1], 1], add(m, nn), [t[0], t[1], 1], sub(m, nn)], closed: true, w: 0.1, c: 'paper', fill: true });
      }
    }
    deco.push({ pts: [[11.3, -105], [10.3, -108], [11.3, -111], [12.3, -108]], closed: true, w: 0.1, c: 'paper', fill: true });
    part('pel', inner, CLOTH(90, { sil: false, ol: 0.35, fill: 0.62, tone: { base: 0.7, grad: 0.3, core: [1.4, 0.25] }, stip: 1, deco,
      h: [{ ang: 90, sp: 0.62, thr: [0.1, 0.65], w: [0.2, 0.36] }, { ang: 30, sp: 0.7, thr: [0.5], w: [0.18] }] }));
  }
  function beltParts(part) {
    // a thick rounded leather band dipping a little at the front, separate studs
    const yb = (x) => 1.4 * Math.exp(-Math.pow((x - 11) / 9, 2));
    const top = [], bot = [];
    for (let x = -9.8; x <= 19.01; x += 1.2) { top.push([x, -121.8 + yb(x) - (x > 15 ? (x - 15) * 0.12 : 0)]); bot.push([x, -114.4 + yb(x) - (x > 15 ? (x - 15) * 0.1 : 0)]); }
    const poly = top.concat(bot.slice().reverse());
    const deco = [
      { pts: top.map((p) => [p[0], p[1] + 1.2]), w: 0.35, c: 'deep', raw: true }, { pts: bot.map((p) => [p[0], p[1] - 1.1]), w: 0.35, c: 'deep', raw: true },
      { pts: top.map((p) => [p[0], p[1] + 3.6]), w: 1.1, c: 'paper', raw: true },
    ];
    for (let x = -7.6; x <= 18.5; x += 2.6) {
      if (Math.abs(x - 11) < 5.4) continue;
      const c = [x, -118 + yb(x)];
      deco.push({ pts: ell(c, 0.85, 0.85, 0, 8), closed: true, w: 0.2, c: 'deep', fill: true, raw: true });
      deco.push({ pts: ell(add(c, [-0.2, -0.25]), 0.35, 0.35, 0, 6), closed: true, w: 0.1, c: 'paper', fill: true, raw: true });
    }
    part('pel', poly, METAL(90, { raw: true, sil: false, fill: 0.35, gfill: 0.55, tone: { base: 0.6, grad: 0.3, core: [1.6, 0.35] },
      h: [{ ang: 92, sp: 0.55, thr: [0.25, 0.62], w: [0.18, 0.34] }], deco }));
    rosette(part, 'pel', [11, -116.8], 4.6, 5.2, 0);
  }
  function rosette(part, bone, c, rx, ry, deg) {
    const deco = [{ pts: ell(c, rx * 0.78, ry * 0.78, deg, 20), closed: true, w: 0.3 }];
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5;
      const p = add(c, rotv([Math.cos(a) * rx * 0.3, Math.sin(a) * ry * 0.3], deg)), q = add(c, rotv([Math.cos(a) * rx * 0.7, Math.sin(a) * ry * 0.7], deg));
      deco.push({ pts: [p, q], w: 0.22 });
    }
    deco.push({ pts: ell(c, rx * 0.22, ry * 0.22, deg, 8), closed: true, w: 0.25, fill: true });
    part(bone, ell(c, rx, ry, deg, 24), METAL(0, { raw: true, sil: false, gfill: 0.25, tone: { base: 0.25, grad: 0.7, core: [0.9, 0.3], hl: [0.9, 0.4] },
      h: [{ mode: 'arc', c, asp: ry / rx, rot: deg, sp: 0.55, thr: [0.35, 0.65], w: [0.18, 0.3] }], deco }));
  }
  function nearPauldron(part) {
    // the lame under the rim, then the shell: a dome over the deltoid, crown left of centre,
    // its outer side curving down; lit at the top toward the front, crosshatched round the outer side
    part('torso', [[-34.4, -140.6], [-25, -141.4], [-16, -142.2], [-8, -143], [-2.2, -143.4], [-2.6, -140.6], [-8, -140], [-16, -139], [-25, -137.8], [-33.6, -136.8]],
      METAL(4, { tone: { base: 0.62, grad: 0.5, core: [0.9, 0.25], hl: [0.6, 0.25] }, h: [{ ang: 4, sp: 0.5, bow: 0.6, thr: [0.25, 0.6], w: [0.16, 0.3] }],
        deco: [{ pts: [[-33.6, -139.4], [-24, -140.2], [-14, -141], [-3, -141.8]], w: 0.55, c: 'paper' }] }));
    const dome = [[-34.4, -140.4, 1], [-33.6, -144], [-31, -147.6], [-26.6, -150.4], [-20.6, -152], [-14.4, -152], [-9, -150.6], [-5, -148.2], [-2.6, -145.4], [-1.8, -142.6, 1],
      [-8, -142.6], [-16, -141.8], [-25, -141]];
    // engraved scrolls on the dome: an S-band of linked spirals and a bead line along the rim
    const deco = [
      { pts: [[-32.6, -142.4], [-24, -143.2], [-14, -143.8], [-4.4, -144.2]], w: 0.26 },
      { pts: [[-33, -143.6], [-24, -144.4], [-14, -145], [-4.6, -145.4]], w: 0.22 },
      { pts: [[-26.4, -149.2], [-20, -150.6], [-13.4, -150.4], [-8.4, -148.8]], w: 1.2, c: 'paper' },
    ];
    for (const [x, y, sg] of [[-27.4, -146.6, 1], [-22.6, -147.6, -1], [-17.6, -148, 1], [-12.6, -147.4, -1]]) {
      deco.push({ pts: spiral([x, y], 1.5, sg > 0 ? 0 : Math.PI, 1.2, sg), w: 0.24, raw: true });
    }
    deco.push({ pts: [[-29.4, -145.4], [-25, -148.6], [-20, -146.2], [-15, -149], [-10.4, -146.6]], w: 0.22 });
    part('torso', dome, METAL(-10, { tone: { dir: [-0.6, 0.8], base: 0.42, grad: 0.85, core: [1.8, 0.32], hl: [1.4, 0.35], blobs: [[-13, -149.4, 6, 2, -0.4]] },
      h: [{ mode: 'arc', c: [-14, -140], asp: 0.62, sp: 0.55, thr: [0.28, 0.58], w: [0.16, 0.34] }, { ang: 48, sp: 0.62, thr: [0.66], w: [0.2] }],
      deco }));
    rosette(part, 'torso', [-4.6, -145.6], 2.9, 3, 0);
  }

  // ---- head ------------------------------------------------------------------------
  function spiral(c, r, a0, turns, sgn) {
    const out = [];
    const n = Math.ceil(turns * 14);
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a0 + sgn * t * turns * Math.PI * 2, rr = r * (1 - 0.68 * t);
      out.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
    }
    return out;
  }
  // the outline of a cluster of round lobes (curls), cast from their centroid
  function lobes(circ, n) {
    const c = [circ.reduce((s, q) => s + q[0], 0) / circ.length, circ.reduce((s, q) => s + q[1], 0) / circ.length];
    const out = [];
    for (let i = 0; i < (n || 40); i++) {
      const a = i / (n || 40) * Math.PI * 2, d = [Math.cos(a), Math.sin(a)];
      let best = 0.5;
      for (const [x, y, r] of circ) {
        const o = sub(c, [x, y]), b = dot(o, d), cc = dot(o, o) - r * r, disc = b * b - cc;
        if (disc >= 0) best = Math.max(best, -b + Math.sqrt(disc));
      }
      out.push(add(c, mul(d, best)));
    }
    return out;
  }
  function headParts(part) {
    // cheek and ear under the back of the brim (mostly hidden by the curls)
    part('head', [[-7.6, -166.4], [-3, -166.8], [-2.6, -160], [-7.2, -159.6]],
      SKIN(10, { sil: false, ol: 0, tone: { base: 0.5, grad: 0.6, dir: [0.4, -0.9] } }));
    // the eyes lost in the brim's shadow: a very dark crosshatched band
    part('head', [[-4.8, -166.4], [1, -166.8], [7, -167.2], [12.6, -167.8], [10.6, -165.6], [9.8, -164], [4, -163.8], [-1, -163.8], [-4.8, -164]],
      { fill: 0.8, gfill: 0.92, ol: 0, sil: false, tone: { base: 0.9, grad: 0.2, dir: [0, -1] },
        h: [{ ang: 4, sp: 0.36, thr: [0.1], w: [0.34] }, { ang: 58, sp: 0.4, thr: [0.3], w: [0.3] }, { ang: -48, sp: 0.44, thr: [0.5], w: [0.26] }] });
    // the mask: scarf over the nose and lower face, a lit folded edge across the bridge,
    // soft folds back to the ear; a mid-dark weave, lighter on the lit front plane
    const deco = [
      { pts: [[-4.8, -163.4], [2, -163.5], [9.6, -163.5]], w: 1.25, c: 'paper' },
      { pts: [[-4.8, -162.6], [2, -162.6], [9.8, -162.6]], w: 0.32, c: 'deep' },
      { pts: [[-4.8, -164.1], [2, -164.2], [9.6, -164.2]], w: 0.28, c: 'deep' },
    ];
    for (const [y0, y1, w] of [[-161.2, -159.2, 0.36], [-160, -157.8, 0.3], [-158.6, -157, 0.26]]) {
      deco.push({ pts: [[8.8, y0 + 0.4], [5, y0], [1, y0 + 0.2], [-2, y1 + 0.4], [-4.4, y1]], w, c: 'deep' });
      deco.push({ pts: [[8.6, y0 - 0.4], [5, y0 - 0.7], [1, y0 - 0.5], [-2, y1 - 0.3], [-4.2, y1 - 0.8]], w: 0.4, c: 0.3 });
    }
    part('head', [[-4.8, -164.2], [2, -164.2], [8.6, -164.2], [9.6, -162.6], [9.8, -161], [9, -159.6], [8.8, -158.2], [7.8, -156.8], [5.4, -156], [1, -156], [-3, -156.8], [-5, -159.4], [-5.4, -162]],
      CLOTH(-8, { fill: 0.55, gfill: 0.62, stip: 2.4, dot: 0.2, tone: { base: 0.6, grad: 0.55, dir: [-0.8, 0.6], core: [1.4, 0.2], hl: [1, 0.2] },
        h: [{ ang: -6, sp: 0.46, bow: 0.5, thr: [0.25, 0.62], w: [0.16, 0.3] }, { ang: 52, sp: 0.5, thr: [0.55], w: [0.16] }], deco }));
    // loose curls spilling from under the back of the brim onto the nape: ink ringlets, no box
    const rings = [[-12.4, -165, 1.7], [-14.4, -162.2, 1.6], [-10.6, -162, 1.6], [-12.8, -159.4, 1.5], [-8.2, -164.6, 1.4], [-8.6, -161.2, 1.4], [-6, -162.8, 1.1]];
    const hd = [];
    rings.forEach(([x, y, r], i) => {
      const a0 = 0.6 + i * 0.9;
      hd.push({ pts: ell([x, y], r * 0.92, r * 0.86, 0, 12, a0, a0 + Math.PI * 1.45), w: 0.32, c: 'deep', raw: true });
      hd.push({ pts: ell([x + 0.2, y + 0.3], r * 0.5, r * 0.45, 0, 8, a0 + 0.6, a0 + Math.PI * 1.3), w: 0.42, c: 'deep', raw: true });
      hd.push({ pts: ell([x - 0.3, y - 0.3], r * 0.62, r * 0.55, 0, 8, a0 + 3.4, a0 + 4.6), w: 0.4, c: 'paper', raw: true });
    });
    part('head', lobes(rings), { raw: true, fill: 0.18, gfill: 0.3, ol: 0, sil: false, stip: 1.6, dot: 0.2, tone: { base: 0.35, grad: 0.8, dir: [0.2, 1] },
      h: [{ ang: 70, sp: 0.5, bow: 0.6, thr: [0.4, 0.7], w: [0.13, 0.24] }], deco: hd });
  }
  function cowlParts(part) {
    // a thick bunched cowl from the chin round the neck, spilling onto both shoulders under the
    // pauldrons and dipping to a soft V over the sternum: a mid-tone roll of short twisted folds
    const cowl = [[-25, -147.6], [-25.6, -151], [-23.4, -154.2], [-19, -156.8], [-13.4, -158.6], [-7, -159.6], [0, -158.8], [5, -158.6], [9.2, -157.8], [12, -156], [13.8, -152.8],
      [14.6, -149.2], [13.6, -146], [11, -143.8], [7, -140.6, 1], [3.6, -143.4], [-1, -145.8], [-8, -147.6], [-16, -148.6], [-23, -148.6]];
    // the scarf's turns: tubes sweeping down from behind the neck across to the far shoulder
    const ropes = [
      [[-24, -152.4], [-19, -155.6], [-12, -157.8], [-4, -158.4], [3, -157.2], [9, -155], [13, -151.4]],
      [[-25, -149.6], [-18, -153.2], [-8, -155.2], [2, -154.6], [9, -151.8], [13.4, -147.8]],
      [[-20, -150.6], [-10, -152.8], [0, -152], [7.6, -149.4], [12.6, -145.2]],
      [[-11, -149.8], [-2, -149.6], [5.4, -147.4], [10.4, -143.4]],
      [[-4, -147.6], [1.6, -146.6], [6.4, -143.6]],
    ];
    const deco = [];
    // each turn is laid as overlapping lengths: a lit crest along the tube, a dark trough under it,
    // the lengths staggered so the roll looks bunched rather than banded
    ropes.forEach((rp, k) => {
      const pl = curve(rp, false, 0.4);
      let i = (k * 5) % 7;
      let j = 0;
      while (i < pl.length - 6) {
        const n0 = 16 + ((j * 5 + k * 3) % 4) * 4;
        const seg = pl.slice(i, Math.min(pl.length, i + n0));
        if (seg.length < 8) break;
        const off = ((j + k) % 3 - 1) * 0.35;
        const tr = seg.map((q, m) => [q[0], q[1] + off - 0.45 * Math.sin(Math.PI * m / (seg.length - 1))]);
        deco.push({ pts: tr.map((q) => [q[0], q[1] + 0.95]), w: 0.45, c: 'deep', raw: true });
        deco.push({ pts: tr.slice(2, -2), w: 0.6, c: j % 2 ? 0.12 : 0.25, raw: true });
        i += n0 - 5; j++;
      }
    });
    part('torso', cowl, CLOTH(18, { fill: 0.48, gfill: 0.55, stip: 1.6, tone: { base: 0.55, grad: 0.5, core: [1.6, 0.25], hl: [1.2, 0.2] },
      h: [{ ang: 16, sp: 0.46, bow: -1, thr: [0.15, 0.6], w: [0.14, 0.28] }, { ang: 70, sp: 0.55, thr: [0.62], w: [0.14] }], deco }));
  }
  function helmetParts(part) {
    // far wing behind the dome, rising from its far side, feathers fanned toward the front
    wingFan(part, 'wingF', R.wingF, [-99, -89, -78, -62, -40], [16, 13.6, 10.6, 7.6, 5.4], 2.2, { cov: 0.46, lobes: 3 });
    // brim: one bell flare from the dome's base, lit on top toward the front and shading to
    // mid tone round the back; under its front lip a thin dark crescent of underside
    const brim = [[-16.8, -163.6, 1], [-15.4, -166.6], [-13.6, -170], [-12.2, -172.2], [-4, -173.6], [4, -173.6], [9.6, -173.2], [11.8, -171.4], [13.8, -169.4], [15.4, -168, 1],
      [12.6, -167.4], [7, -166.9], [1, -166.5], [-5, -166], [-11, -165]];
    part('head', brim, METAL(-8, { stip: 3, tone: { dir: [-0.8, 0.6], base: 0.32, grad: 0.55, core: [0.9, 0.25], hl: [1, 0.3] },
      h: [{ mode: 'arc', c: [-1, -172.4], asp: 0.32, rot: -6, sp: 0.5, thr: [0.3, 0.6], w: [0.15, 0.3] }, { ang: 60, sp: 0.6, thr: [0.68], w: [0.18] }],
      deco: [{ pts: [[9.8, -172.4], [12.4, -170.4], [14.6, -168.4]], w: 0.8, c: 'paper' }, { pts: [[-15.6, -164.8], [-8, -165.9], [1, -166.9], [8, -167.4], [14.8, -168.2]], w: 0.4, c: 'deep' }] }));
    part('head', [[15.4, -168, 1], [12.6, -167.4], [7, -166.9], [2, -166.6, 1], [7, -166.2], [12.4, -166.6]],
      { fill: 0.85, gfill: 0.92, ol: 0.25, sil: false, tone: { base: 0.9 }, h: [{ ang: 2, sp: 0.4, thr: [0.1], w: [0.3] }] });
    // dome: a rounded skullcap with a raised ridge from front to back
    const dome = [[-12.6, -171.2, 1], [-12.2, -175], [-9.2, -179], [-4.4, -181.4], [0.8, -181.8], [5.6, -179.6], [8.6, -175.6], [9.4, -171.6, 1]];
    part('head', dome, METAL(0, { stip: 2.4, tone: { base: 0.5, grad: 0.7, core: [1.6, 0.3], hl: [1.2, 0.3], blobs: [[2.6, -178.6, 2.6, 1.6, -0.45]] },
      h: [{ mode: 'arc', c: [-1.4, -171.4], asp: 0.95, sp: 0.6, thr: [0.3, 0.6], w: [0.18, 0.34] }, { ang: 55, sp: 0.7, thr: [0.72], w: [0.2] }],
      deco: [
        { pts: [[-10.4, -175.2], [-6.4, -179.6], [-0.4, -181.4], [4.6, -179.6], [7.6, -175.4]], w: 1.4, c: 'paper' },
        { pts: [[-10.6, -174.4], [-6.6, -178.8], [-0.6, -180.6], [4.4, -178.8], [7.4, -174.8]], w: 0.3 },
        { pts: [[-10.2, -176], [-6.2, -180.4], [-0.2, -182.2], [4.8, -180.4], [7.8, -176]], w: 0.24 },
      ] }));
    // riveted band above the brim
    const band = [[-12.8, -173.2], [-2, -174], [9.4, -173.4], [9.6, -171], [-2, -171.6], [-12.8, -170.8]];
    const rv = [];
    for (let i = 0; i < 7; i++) { const x = -11 + i * 3.3; rv.push({ pts: ell([x, -172.4 - 0.25 * Math.cos((x + 2) / 7)], 0.42, 0.42, 0, 6), closed: true, w: 0.15, fill: true }); }
    part('head', band, METAL(90, { fill: 'paper', tone: { base: 0.4, grad: 0.5, core: [0.8, 0.3] }, h: [{ ang: 90, sp: 0.55, thr: [0.3, 0.65], w: [0.18, 0.3] }],
      deco: rv.concat([{ pts: [[-12.6, -172.9], [-2, -173.6], [9.4, -173]], w: 0.4, c: 'paper' }]) }));
    // near wing: arched leading edge, a covert row, long primaries with rounded tips, up and back
    const pT = [[-25.8, -194.2], [-26.4, -189.6], [-25, -185.2], [-22.6, -181.8], [-20.2, -179], [-17.4, -176.6], [-15, -174.8], [-12.6, -173.4]];
    const pR = [[-11.4, -186.6], [-10.8, -184.6], [-10.2, -182.6], [-9.6, -180.8], [-9, -179], [-8.4, -177.4], [-7.8, -176], [-7.2, -174.8]];
    for (let i = pT.length - 1; i >= 0; i--) part.feather('wingN', pR[i], pT[i], 2.3 - i * 0.1, { bsp: 0.5 });
    part('wingN', [[-7.1, -174.7, 1], [-6.2, -178], [-6.6, -182], [-8.4, -185.6], [-11.4, -188.2], [-15.2, -189.8], [-18.6, -190.8], [-22.4, -192.6],
      [-19.2, -189], [-17.6, -187.6, 1], [-16.6, -185.2], [-14.6, -184.6, 1], [-14, -182.2], [-12.4, -181.6, 1], [-12, -179.2], [-10.6, -178.6, 1], [-10.4, -176.4], [-9, -175.6, 1]],
      { fill: 'paper', gfill: 0.06, ol: 0.3, sil: false, tone: { base: 0.12, grad: 0.55, core: [0.6, 0.2] },
        h: [{ ang: -60, sp: 0.55, thr: [0.32, 0.62], w: [0.12, 0.22] }],
        deco: [
          { pts: [[-7.6, -180.4], [-9.4, -181.2], [-9.8, -183.4]], w: 0.24 }, { pts: [[-9.8, -183.4], [-11.6, -184.4], [-12.2, -186.4]], w: 0.24 },
          { pts: [[-12.2, -186.4], [-14.4, -187.2], [-15.4, -188.8]], w: 0.24 },
          { pts: [[-8, -177.6], [-9.2, -178.6], [-9.2, -180.4]], w: 0.22 },
        ] });
    const B = R.wingN;
    part('wingN', ell(B, 2.2, 2.3, 0, 18), METAL(0, { raw: true, tone: { base: 0.3, grad: 0.7, core: [0.8, 0.3], hl: [0.8, 0.4] },
      h: [{ mode: 'arc', c: B, sp: 0.5, thr: [0.3, 0.6], w: [0.18, 0.3] }], deco: [{ pts: ell(B, 1.3, 1.4, 0, 12), closed: true, w: 0.3 }] }));
  }

  // ---- poses ---------------------------------------------------------------------------
  // All positions in world units, feet on the ground at y = 0, facing +x.
  //  pel pelvis centre, tilt pelvis rotation (deg), lean torso lean (deg, + forward), head head nod
  //  ankN/ankF ankle targets, footN/footF foot pitch (deg)
  //  fistN near wrist target, elbN near elbow side preference
  //  grip far hand on the staff, staffAng staff tilt (deg, + top forward)
  //  cloak cloak swing (deg, + trails back), breath breathing amplitude
  const POSES = {
    stand: {
      pel: R.pel, tilt: 0, lean: 0, head: 0,
      ankN: R.ankN, footN: 0, ankF: R.ankF, footF: 0,
      fistN: R.wriN, elbN: [-1, 0],
      grip: R.grip, staffAng: 0, cloak: 0, breath: 1,
    },
  };

  function ik(A, T, L1, L2, pref) {
    let d = sub(T, A);
    let D = len(d);
    const maxD = L1 + L2 - 0.001;
    if (D > maxD) { d = mul(d, maxD / D); D = maxD; }
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const M = add(A, mul(d, a / D));
    const p = [-d[1] / D, d[0] / D];
    const k1 = add(M, mul(p, h)), k2 = sub(M, mul(p, h));
    return { mid: dot(sub(k1, M), pref) >= 0 ? k1 : k2, end: add(A, d) };
  }
  // rigid frame through a point and an angle
  const frame = (o, a) => ({ o, a });
  const apply = (F, rest, p) => add(F.o, rotv(sub(p, rest[0]), F.a - rest[1]));

  function solve(p, t) {
    const br = Math.sin(t * Math.PI * 2 / 3.4) * p.breath;
    const B = {};
    B.world = frame([0, 0], 0);
    // the pelvis only ever settles (knees soften), so the near-straight legs never overreach
    B.pel = frame(p.pel, p.tilt); // the hips hold still in the idle so the planted legs never swing
    const waist = apply(B.pel, BONE_REST.pel, R.waist);
    B.torso = frame(add(waist, [0, -0.45 * br]), p.tilt + p.lean);
    const T = (q) => apply(B.torso, BONE_REST.torso, q);
    B.head = frame(add(T(R.neck), [0, -0.1 * br]), p.tilt + p.lean * 1.2 + p.head + 0.3 * br);
    // near arm: shoulder rides the chest, the fist follows it a little
    const shN = T(R.shN);
    const armN = ik(shN, add(p.fistN, mul(sub(shN, R.shN), 0.8)), LEN.upN, LEN.foN, p.elbN);
    B.upN = frame(shN, angOf(sub(armN.mid, shN)));
    B.foN = frame(armN.mid, angOf(sub(armN.end, armN.mid)));
    // staff and the far arm holding it
    const grip = add(p.grip, [0, -0.25 * br]);
    B.staff = frame(grip, -90 + p.staffAng);
    B.hand = B.staff;
    const wriF = apply(B.staff, BONE_REST.staff, R.wriF);
    const shF = T(R.shF);
    const armF = ik(shF, wriF, LEN.upF, LEN.foF, [-1, 0.6]);
    B.upF = frame(shF, angOf(sub(armF.mid, shF)));
    B.foF = frame(armF.mid, angOf(sub(armF.end, armF.mid)));
    // legs: hips on the pelvis, feet planted
    const P = (q) => apply(B.pel, BONE_REST.pel, q);
    for (const s of ['N', 'F']) {
      const hip = P(R['hip' + s]);
      const leg = ik(hip, p['ank' + s], LEN['th' + s], LEN['shin' + s], [1, 0]);
      B['th' + s] = frame(hip, angOf(sub(leg.mid, hip)));
      B['shin' + s] = frame(leg.mid, angOf(sub(leg.end, leg.mid)));
      B['ft' + s] = frame(leg.end, p['foot' + s]);
    }
    // cloak rows hang from the shoulders and sway a little, lower rows lagging
    const sw = p.cloak;
    for (let i = 0; i <= 5; i++) {
      const ph = Math.sin(t * Math.PI * 2 / 3.4 - 0.9 - i * 0.25);
      B['ck' + i] = frame(T(R.ckPivot), p.tilt + p.lean + sw + (0.5 - i * 0.04) * ph * p.breath);
    }
    B.ckF = frame(T(R.ckPivotF), p.tilt + p.lean + sw * 0.6 + 0.35 * Math.sin(t * Math.PI * 2 / 3.4 - 1.2) * p.breath);
    B.ckIn = frame(P([2, -96]), p.tilt + sw * 0.5 + 0.3 * Math.sin(t * Math.PI * 2 / 3.4 - 1.6) * p.breath);
    const H = (q) => apply(B.head, BONE_REST.head, q);
    const flap = Math.sin(t * 2.2);
    B.wingN = frame(H(R.wingN), B.head.a - 1.2 * flap);
    B.wingF = frame(H(R.wingF), B.head.a + 1 * flap);
    return B;
  }

  // ---- drawing -----------------------------------------------------------------------
  function getParts() {
    if (PARTS) return PARTS;
    const list = [];
    const part = (bone, pts, st, geo) => {
      const p = geo ? featherPart(bone, geo, {}) : mkPart(bone, pts, st);
      list.push(p); return p;
    };
    part.feather = (bone, root, tip, W, fo) => { const p = part(bone, null, null, featherGeo(root, tip, W, Object.assign({ round: true, bsp: 0.6, cross: false }, fo || {}))); p.wing = true; return p; };
    part.raw = (obj) => { list.push(obj); return obj; };
    const feather = (bone, root, tip, W, o, fo) => {
      o = o || {};
      const p = o.shOff ? featherPart(bone, featherGeo(root, tip, W, fo), { shOff: o.shOff }) : part(bone, null, null, featherGeo(root, tip, W, fo));
      if (o.shOff) list.push(p);
      p.o = o; return p;
    };
    build(part, feather);
    // silhouette pass: consecutive parts on one bone share one path
    const sil = [];
    for (const pt of list) {
      if (pt.snake || pt.wing || !(pt.feather ? !(pt.o && pt.o.dark > 0.4) : pt.st.sil)) continue;
      const w = pt.feather ? 0.55 : 1;
      let G = sil[sil.length - 1];
      if (!G || G.bone !== pt.bone || G.w !== w) { G = { bone: pt.bone, P: new Path2D(), w }; sil.push(G); }
      G.P.addPath(pt.olPath || pt.outline);
    }
    list.sil = sil;
    return (PARTS = list);
  }

  function setT(g, base, B, bone) {
    const F = B[bone], r = BONE_REST[bone];
    const a = (F.a - r[1]) * D2R, c = Math.cos(a), s = Math.sin(a);
    const ex = F.o[0] - (c * r[0][0] - s * r[0][1]), ey = F.o[1] - (s * r[0][0] + c * r[0][1]);
    g.setTransform(base.a * c + base.c * s, base.b * c + base.d * s, -base.a * s + base.c * c, -base.b * s + base.d * c,
      base.a * ex + base.c * ey + base.e, base.b * ex + base.d * ey + base.f);
  }

  function draw(g, poseName, opts) {
    opts = opts || {};
    const ink = !opts.ink || opts.ink === INK.blue ? OWN_INK : opts.ink;
    const C = colours(ink);
    const p = POSES[poseName] || POSES.stand;
    const parts = getParts();
    const base = g.getTransform();
    const k = Math.hypot(base.a, base.b);
    const lod = k < 1.6 ? 2 : k < 2.6 ? 1 : 0;
    const B = solve(p, opts.time || 0);
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    // ground: a few engraved strokes under the boots
    g.strokeStyle = C.ink; g.lineWidth = 0.3; g.globalAlpha = 0.6;
    g.beginPath();
    for (let i = 0; i < 16; i++) { const x0 = -30 + i * 4.4 + (i % 2) * 1.2, y = 0.3 + (i % 3) * 0.5; g.moveTo(x0, y); g.lineTo(x0 + 2.6 + (i % 3), y); }
    g.stroke();
    g.globalAlpha = 1;
    // heavy silhouette: outer edges of the parts that can form it, under everything
    g.strokeStyle = C.deep; g.lineWidth = lod ? 1.25 : 0.8;
    let cur = null;
    const sw = lod ? 1.2 : 0.6;
    for (const G of parts.sil) {
      if (G.bone !== cur) { setT(g, base, B, G.bone); cur = G.bone; }
      g.lineWidth = sw * G.w;
      g.stroke(G.P);
    }
    for (const pt of parts) {
      if (pt.bone !== cur) { setT(g, base, B, pt.bone); cur = pt.bone; }
      if (pt.snake) { paintSnake(g, C, pt, lod); continue; }
      if (pt.feather) { paintFeather(g, C, pt, lod); continue; }
      paintPart(g, C, pt, lod);
    }
    g.restore();
  }
  function paintPart(g, C, pt, lod) {
    const st = pt.st;
    if (lod === 2) {
      // game scale: the engraving's tone as a flat tint, its darkest lines, the details
      if (st.gfill != null) { g.fillStyle = col(C, st.gfill); g.fill(pt.outline); } else if (st.fill != null) {
        const f = st.fill === 'paper' ? pt.mean * 0.5 : typeof st.fill === 'number' ? Math.min(1, st.fill + 0.12) : st.fill;
        g.fillStyle = col(C, f); g.fill(pt.outline);
      }
      const L = pt.lod && pt.lod[1];
      if (L && L.strokes.length > 1) { const s = L.strokes[1]; g.strokeStyle = col(C, s.c); g.lineWidth = s.w * 1.1; g.stroke(s.P); }
      for (const d of pt.deco) {
        if (d.fill) { g.fillStyle = col(C, d.c); g.fill(d.P); }
        if (d.w >= 0.3 || d.c === 'paper') { g.strokeStyle = col(C, d.c); g.lineWidth = Math.max(0.45, d.w); g.stroke(d.P); }
      }
      if (st.ol) { g.strokeStyle = C.deep; g.lineWidth = 0.45; g.stroke(pt.olPath); }
      return;
    }
    if (st.fill != null) {
      let f = st.fill;
      if (lod && f === 'paper') f = pt.mean * 0.32;
      g.fillStyle = col(C, f);
      g.fill(pt.outline);
    }
    const L = pt.lod && pt.lod[lod];
    if (L) {
      if (L.stip) { g.fillStyle = C.ink; g.fill(L.stip); }
      for (const s of L.strokes) { g.strokeStyle = col(C, s.c); g.lineWidth = s.w; g.stroke(s.P); }
    }
    for (const d of pt.deco) {
      if (d.fill) { g.fillStyle = col(C, d.c); g.fill(d.P); }
      if (d.w) { g.strokeStyle = col(C, d.c); g.lineWidth = d.w * (lod && d.c !== 'paper' ? 1.2 : 1); g.stroke(d.P); }
    }
    if (st.ol) { g.strokeStyle = C.deep; g.lineWidth = st.ol * (lod ? 1.25 : 1); g.stroke(pt.olPath); }
  }
  const L0 = (pt, lod) => pt.lod[Math.min(1, lod)];
  function paintFeather(g, C, pt, lod) {
    const dk = pt.o.dark || 0;
    if (pt.o.cloak) {
      // broad cloak feather: its cast shadow on the tier below, bare paper, a shaded band on one edge
      g.fillStyle = C.tint[12]; g.fill(pt.shadow);
      g.fillStyle = lod === 2 ? C.tint[1] : C.paper; g.fill(pt.outline);
      g.fillStyle = C.tint[lod === 2 ? 6 : 4]; g.fill(pt.band);
      if (lod < 2) {
        const L = pt.lod[lod];
        g.strokeStyle = C.ink;
        g.lineWidth = lod ? 0.14 : 0.08; g.stroke(L.lit);
        g.lineWidth = lod ? 0.22 : 0.13; g.stroke(L.shade);
        g.lineWidth = lod ? 0.18 : 0.1; g.stroke(L.cross);
        g.strokeStyle = C.deep; g.lineWidth = lod ? 0.26 : 0.18; g.stroke(pt.rach);
        g.lineWidth = lod ? 0.38 : 0.26; g.stroke(pt.outline);
      } else {
        g.strokeStyle = C.deep; g.lineWidth = 0.4; g.stroke(pt.ro);
      }
      return;
    }
    if (lod === 2) {
      g.fillStyle = dk ? col(C, Math.min(1, dk + 0.1)) : C.tint[2]; g.fill(pt.outline);
      if (!dk) { g.fillStyle = C.tint[7]; g.fill(pt.band); }
      g.strokeStyle = C.deep; g.lineWidth = 0.4; g.stroke(pt.ro);
      return;
    }
    if (pt.wing && lod < 2) {
      g.fillStyle = C.paper; g.fill(pt.outline);
      g.fillStyle = C.tint[2]; g.fill(pt.band);
      g.strokeStyle = C.ink; g.lineWidth = lod ? 0.16 : 0.07; g.stroke(L0(pt, lod).lit); g.lineWidth = lod ? 0.2 : 0.1; g.stroke(L0(pt, lod).shade);
      g.strokeStyle = C.deep; g.lineWidth = lod ? 0.36 : 0.24; g.stroke(pt.ro);
      return;
    }
    if (!dk && !lod && pt.o.shadow !== false) { g.fillStyle = C.tint[11]; g.fill(pt.shadow); }
    g.fillStyle = dk ? col(C, dk) : (lod ? C.tint[2] : C.paper);
    g.fill(pt.outline);
    const L = pt.lod[Math.min(1, lod)];
    if (dk > 0.4) {
      // shadowed underside: dark vane, its barbs picked out in paper
      g.strokeStyle = C.deep; g.lineWidth = 0.3; g.stroke(L.cross);
      g.strokeStyle = C.paper; g.globalAlpha = 0.35; g.lineWidth = 0.12; g.stroke(L.shade); g.stroke(L.lit); g.globalAlpha = 1;
    } else {
      g.fillStyle = C.tint[lod ? 6 : 5]; g.fill(pt.band);
      g.strokeStyle = C.ink;
      g.lineWidth = lod ? 0.2 : 0.09; g.stroke(L.lit);
      g.lineWidth = lod ? 0.28 : 0.15; g.stroke(L.shade);
      g.lineWidth = lod ? 0.2 : 0.12; g.stroke(L.cross);
    }
    g.strokeStyle = dk > 0.4 ? C.paper : C.ink;
    g.lineWidth = lod ? 0.3 : 0.24; g.stroke(pt.rach);
    g.strokeStyle = C.deep; g.lineWidth = lod ? 0.42 : 0.26; g.stroke(pt.outline);
  }
  function paintSnake(g, C, pt, lod) {
    g.strokeStyle = C.deep; g.lineWidth = 3.1; g.stroke(pt.P);
    g.strokeStyle = lod === 2 ? C.tint[4] : C.paper; g.lineWidth = 2.2; g.stroke(pt.P);
    if (lod === 2) return;
    g.strokeStyle = C.ink; g.lineWidth = 0.18; g.stroke(pt.T);
    g.lineWidth = 0.5; g.stroke(pt.S);
  }

  window.CONCEPT = {
    name: 'Masked Herald',
    tagline: 'copperplate engraving in slate-navy ink on cream: kettle helm, masked cowl, feather cloak, winged caduceus',
    height: 182,
    print: { paper: PAPER_C, ink: OWN_INK, grain: 0.4 },
    poses: POSES,
    draw,
  };
})();
