// ---------------------------------------------------------------------------
// Hermes Arena — concept "Classical Messenger"
// A crisp cobalt ink print on warm paper: confident contour lines (a heavy
// outer silhouette under thinner inner lines), halftone dot screens whose
// dots grow into the shadows, and fine parallel hatching on muscles and
// folds. Petasos with big feathered wings, short belted chiton with a Greek
// key hem, chlamys pinned with a round brooch and falling behind to the knee,
// satchel on a cross-body strap, wristbands, winged laced sandals, and the
// winged caduceus held upright in the back hand.
//
// Rig: POSES[name] -> solve() gives joints (pelvis frame, torso frame with
// breathing, head frame, 2-bone IK arms and legs, foot frames, staff frame,
// cloak sway). Every part below is drawn from those joints, back to front.
// Shapes are authored in the stand pose's world coordinates and mapped
// through the bone frame that carries them (T = torso, Pv = pelvis, H = head).
// ---------------------------------------------------------------------------
(function () {
  const OWN = '#1f4fa4';
  const PAPER_C = '#f7f1ea';
  const R2D = 180 / Math.PI;
  const LT = [0.42, -0.91]; // toward the light (upper right, in front)
  const SIL = 1.55; // silhouette under-stroke (half of it shows outside)
  const LF = 0.55;  // form line
  const LD = 0.4;   // detail line
  const LH = 0.25;  // hatch line

  // ---- vectors / frames --------------------------------------------------------
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, s) => [a[0] * s, a[1] * s];
  const len = (a) => Math.hypot(a[0], a[1]);
  const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const vdeg = (d) => [Math.cos(d * D2R), Math.sin(d * D2R)];
  const angOf = (a) => Math.atan2(a[1], a[0]) * R2D;
  const lerp2 = (a, b, t, dx) => [lerp(a[0], b[0], t) + (dx || 0), lerp(a[1], b[1], t)];

  // frame: origin o, rotation deg (clockwise on screen), scale s, flip mirrors local y
  function frame(o, deg, s, flip) {
    const c = Math.cos(deg * D2R), sn = Math.sin(deg * D2R), k = s || 1, f = flip ? -1 : 1;
    const F = (x, y) => { const yy = y * f; return [o[0] + (x * c - yy * sn) * k, o[1] + (x * sn + yy * c) * k]; };
    F.o = o; F.deg = deg; F.k = k; F.f = f;
    return F;
  }
  // map authored points (with optional corner flag) through a point function
  const M = (F, pts) => pts.map((p) => { const q = F(p[0], p[1]); if (p[2]) q.push(1); return q; });

  // smooth path through points; p[2] marks a sharp corner
  function pathOf(pts, closed, P) {
    P = P || new Path2D();
    const n = pts.length;
    if (n < 2) return P;
    if (closed === false) {
      P.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) {
        if (pts[i][2]) { P.lineTo(pts[i][0], pts[i][1]); continue; }
        const m = pts[i + 1][2] ? pts[i + 1] : mix(pts[i], pts[i + 1], 0.5);
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
  const shift = (pts, d) => pts.map((p) => { const q = [p[0] + d[0], p[1] + d[1]]; if (p[2]) q.push(1); return q; });
  function bbox(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return [x0, y0, x1, y1];
  }
  function ellPts(c, rx, ry, rot, n) {
    const out = [], a = rot * D2R;
    for (let i = 0; i < (n || 12); i++) {
      const t = (i / (n || 12)) * Math.PI * 2, x = Math.cos(t) * rx, y = Math.sin(t) * ry;
      out.push([c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]);
    }
    return out;
  }

  // ---- print state: ink, device scale, cached halftone screens -----------------------
  let INKC = OWN, SC = 1, GX = null;
  const PATS = new Map();
  const CELL = 1.45; // halftone cell (world units); two dots per cell on a 45 degree screen
  const DOT = [0, 0.11, 0.16, 0.215, 0.275, 0.34, 0.43];
  function pat(l) {
    // fine screen (CELL world units) when its cells are at least 6 device px; below that a coarser
    // screen of at least 4 device px per cell, so game scale still prints as pure ink dots on paper
    const Nf = CELL * SC;
    const fine = Nf >= 5;
    const N = fine ? Math.round(Nf) : Math.max(6, Math.round(Nf * 2));
    const cw = fine ? CELL : N / SC;
    const key = INKC + '|' + l + '|' + N + '|' + cw.toFixed(3);
    let p = PATS.get(key);
    if (!p) {
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const x = c.getContext('2d');
      const r = DOT[l] * N * (fine ? 1 : 1.08);
      x.fillStyle = INKC;
      x.beginPath();
      for (const [cx, cy] of [[0, 0], [N, 0], [0, N], [N, N], [N / 2, N / 2]]) { x.moveTo(cx + r, cy); x.arc(cx, cy, r, 0, Math.PI * 2); }
      x.fill();
      p = GX.createPattern(c, 'repeat');
      p.setTransform(new DOMMatrix([cw / N, 0, 0, cw / N, 0, 0]));
      PATS.set(key, p);
    }
    return p;
  }

  // woven crosshatch screen (two crossing line sets), for the cloak's cloth: levels 1..4 thicken the lines
  const WV = [0, 0.09, 0.14, 0.2, 0.28, 0.38];
  const WCELL = 1.3;
  function wpat(l) {
    const Nf = WCELL * SC;
    const fine = Nf >= 4;
    const N = fine ? Math.round(Nf * 2) : 6; // tile holds 2x2 cells
    const cw = fine ? WCELL * 2 : (N / SC);
    const key = 'w' + INKC + '|' + l + '|' + N + '|' + cw.toFixed(3);
    let p = PATS.get(key);
    if (!p) {
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const x = c.getContext('2d');
      x.strokeStyle = INKC;
      x.lineWidth = Math.max(fine ? 0.6 : 0.5, WV[l] * N / 2 * (fine ? 1 : 1.25));
      x.beginPath();
      for (let k = -1; k <= 1; k++) {
        for (const o of [0, N / 2]) {
          x.moveTo(k * N + o, 0); x.lineTo(k * N + o + N, N);
          x.moveTo(k * N + o + N, 0); x.lineTo(k * N + o, N);
        }
      }
      x.stroke();
      p = GX.createPattern(c, 'repeat');
      const a = 8 * D2R, k = cw / N;
      p.setTransform(new DOMMatrix([Math.cos(a) * k, Math.sin(a) * k, -Math.sin(a) * k, Math.cos(a) * k, 0, 0]));
      PATS.set(key, p);
    }
    return p;
  }

  // ---- drawing primitives ------------------------------------------------------------------
  // line strokes are batched per width inside a part and stroked together (fewer draw calls)
  let BATCH = null;
  function ln(g, pts, w, closed) {
    if (BATCH) {
      const k = Math.round(w * 100);
      let P = BATCH.get(k);
      if (!P) { P = new Path2D(); BATCH.set(k, P); }
      pathOf(pts, closed || false, P);
      return;
    }
    g.lineWidth = w;
    g.strokeStyle = INKC;
    g.stroke(pathOf(pts, closed || false));
  }
  function batched(g, fn) {
    const outer = BATCH;
    BATCH = new Map();
    fn();
    const B = BATCH;
    BATCH = outer;
    if (B.size) {
      g.strokeStyle = INKC;
      for (const [k, P] of B) { g.lineWidth = k / 100; g.stroke(P); }
    }
  }
  // halftone fill of a region, clipped to the part
  function shade(g, P, region, l) {
    g.save();
    g.clip(P);
    g.fillStyle = pat(l);
    g.fill(Array.isArray(region) ? pathOf(region) : region);
    g.restore();
  }
  // halftone band on the side away from the light: inside P, outside P shifted toward the light by d
  function band(g, P, pts, d, l, dir) {
    g.save();
    const Q = new Path2D(P);
    pathOf(shift(pts, mul(dir || LT, d)), true, Q);
    g.clip(Q, 'evenodd');
    g.fillStyle = pat(l);
    g.fill(P);
    g.restore();
  }
  // parallel hatching across a box (call inside a clip)
  function hatch(g, box, ang, sp, w, alpha) {
    const a = ang * D2R, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    const R = Math.hypot(box[2] - box[0], box[3] - box[1]) / 2 + 1;
    g.strokeStyle = INKC; g.lineWidth = w; g.globalAlpha = alpha == null ? 1 : alpha;
    g.beginPath();
    for (let o = -R; o <= R; o += sp) {
      g.moveTo(cx + nx * o - dx * R, cy + ny * o - dy * R);
      g.lineTo(cx + nx * o + dx * R, cy + ny * o + dy * R);
    }
    g.stroke();
    g.globalAlpha = 1;
  }
  // two crossing hatch sets at +/-45 degrees inside a clip path (a woven crosshatch)
  function xhatch(g, P, box, sp, w) {
    // below about 1.6 device px per unit the hatch lines would print as a faint grey: deepen the dots instead
    if (SC < 1.6) { g.fillStyle = pat(6); g.fill(P); return; }
    g.save();
    g.clip(P);
    hatch(g, box, 45, sp, w);
    hatch(g, box, -45, sp, w);
    g.restore();
  }
  // a tapered stroke: a filled sliver along a polyline, widest at its middle and pointed at both ends
  function taper(g, pts, w, endW) {
    const L = [], R = [], n = pts.length, e = endW || 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const d = nrm(sub(b, a)), nn = [-d[1], d[0]], t = i / (n - 1);
      const hw = (e + (w - e) * Math.sin(Math.PI * Math.min(1, t * 1.25))) * 0.5;
      L.push(add(pts[i], mul(nn, hw))); R.push(sub(pts[i], mul(nn, hw)));
    }
    g.fillStyle = INKC;
    g.fill(pathOf([...L, ...R.reverse()].map((q, i) => (i === 0 || i === n - 1 || i === n || i === 2 * n - 1 ? [...q, 1] : q))));
  }
  function hatchIn(g, P, region, ang, sp, w) {
    g.save();
    g.clip(P);
    if (region) g.clip(pathOf(region));
    hatch(g, bbox(region || [[-200, -300], [200, 50]]), ang, sp, w);
    g.restore();
  }
  // a paper-filled surface with halftone tone, shadow bands, extra inner work, outline
  function surf(g, P, pts, o) {
    g.fillStyle = PAPER_C;
    g.fill(P);
    if (o.base) { g.fillStyle = pat(o.base); g.fill(P); }
    if (o.sh) for (const s of o.sh) band(g, P, pts, s[0], s[1], s[2]);
    if (o.inner) {
      // parts whose inner work stays inside the outline skip the clip (cheaper)
      if (o.clip === false) batched(g, () => o.inner(g));
      else { g.save(); g.clip(P); batched(g, () => o.inner(g)); g.restore(); }
    }
    if (o.lw !== 0) { g.strokeStyle = INKC; g.lineWidth = o.lw || LF; g.lineJoin = 'round'; g.stroke(P); }
  }

  // part list: silhouette pass first (heavy under-strokes of every part), then parts back to front
  function List() {
    const parts = [];
    return {
      add(pts, fn, sil) {
        const P = pts instanceof Path2D ? pts : pathOf(pts);
        parts.push([P, fn, sil == null ? SIL : sil, pts]);
        return P;
      },
      render(g) {
        // silhouette: every part's heavy under-stroke, merged per width
        const sil = new Map();
        for (const [P, , s] of parts) if (s) { let Q = sil.get(s); if (!Q) { Q = new Path2D(); sil.set(s, Q); } Q.addPath(P); }
        g.save();
        g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INKC;
        for (const [s, Q] of sil) { g.lineWidth = s; g.stroke(Q); }
        g.restore();
        for (const [P, fn, , pts] of parts) {
          g.save();
          g.lineJoin = 'round'; g.lineCap = 'round';
          batched(g, () => fn(g, P, pts));
          g.restore();
        }
      },
    };
  }

  // ---- IK + limb outlines -------------------------------------------------------------
  function ik(A, T, L1, L2, pref) {
    let d = sub(T, A), D = len(d);
    const maxD = L1 + L2 - 0.01, minD = Math.abs(L1 - L2) + 0.01;
    if (D > maxD) { d = mul(d, maxD / D); D = maxD; }
    if (D < minD) { d = mul(nrm(d), minD); D = minD; }
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const Mi = add(A, mul(d, a / D));
    const p = [-d[1] / D, d[0] / D];
    const k1 = add(Mi, mul(p, h)), k2 = sub(Mi, mul(p, h));
    const s1 = (k1[0] - Mi[0]) * pref[0] + (k1[1] - Mi[1]) * pref[1];
    return { mid: s1 >= 0 ? k1 : k2, end: add(A, d) };
  }
  // two-segment limb outline. rows [t, wL, wR]; L = left of travel direction (n = (-dy, dx) rotated)
  function limb2(a, m, b, prof1, joint, prof2, capA, capB) {
    const d1 = nrm(sub(m, a)), d2 = nrm(sub(b, m)), L1 = len(sub(m, a)), L2 = len(sub(b, m));
    const n1 = [d1[1], -d1[0]], n2 = [d2[1], -d2[0]], nj = nrm(add(n1, n2));
    const Ls = [], Rs = [];
    for (const [t, wl, wr] of prof1) { const c = add(a, mul(d1, t * L1)); Ls.push(add(c, mul(n1, wl))); Rs.push(sub(c, mul(n1, wr))); }
    Ls.push(add(m, mul(nj, joint[0]))); Rs.push(sub(m, mul(nj, joint[1])));
    for (const [t, wl, wr] of prof2) { const c = add(m, mul(d2, t * L2)); Ls.push(add(c, mul(n2, wl))); Rs.push(sub(c, mul(n2, wr))); }
    const out = [];
    if (capA != null) out.push(sub(a, mul(d1, capA)));
    out.push(...Ls);
    if (capB != null) out.push(add(b, mul(d2, capB)));
    out.push(...Rs.reverse());
    return { pts: out, d1, d2, n1, n2, L1, L2 };
  }

  // ---- poses -----------------------------------------------------------------------------
  // Authored reference: the stand pose. Shapes are written in its world coordinates.
  const REF = { pel: [4, -89], head: [11, -156] };
  const POSES = {
    stand: {
      pel: [4, -89],      // pelvis centre
      lean: 0,            // torso rotation about the pelvis (deg, + = forward)
      tilt: 0,            // pelvis rotation (deg)
      head: 0,            // head rotation about the neck (deg)
      ankB: [-33, -11],   // back (screen-left) ankle centre
      ankF: [23.4, -11],  // front (screen-right) ankle centre
      legScF: 0.987,      // front leg slightly foreshortened
      legScB: 1.030,      // back leg reaching back
      kneeB: [-1, -0.2],
      kneeF: [-1, -0.1],  // front knee locked back a touch: thigh straight down, shin slanting forward
      footB: 0, footF: 0, // foot rotation about the ankle (deg)
      wriS: [-33.4, -123.2],  // staff-hand wrist target
      wriF: [33.2, -91.0],// free-hand wrist target
      foreS: 1,           // staff forearm foreshortening (it points toward the viewer)
      foreF: 1,
      staffAng: -92.6,    // staff direction grip -> top (deg; -90 = straight up)
      staffU: 0,          // grip position along the staff (0 = reference grip)
      cloak: 0,           // cloak billow (0 hanging .. 1 streaming back)
      breath: 1,          // breathing amplitude
      loop: 3.6,          // seconds: everything in this pose repeats with this period, so its frames may be cached
    },
  };
  const LEN = { thigh: 36.6, shin: 43, upper: 22.4, upperS: 21.6, fore: 11.4, foreF: 18.4 };

  function solve(p, time) {
    const per = p.loop || 3.6;
    const br = Math.sin(time * (Math.PI * 2) / per) * (p.breath || 0);
    const pel = [p.pel[0], p.pel[1] - br * 0.15];
    const PF = frame(pel, p.tilt);
    const TFr = frame(pel, p.lean);
    // torso points: chest and shoulders rise with the breath
    const lift = (y) => br * 0.75 * clamp((-y - 22) / 34, 0, 1);
    const T = (x, y) => { const lx = x - REF.pel[0], ly = y - REF.pel[1]; return TFr(lx, ly - lift(ly)); };
    const Pv = (x, y) => PF(x - REF.pel[0], y - REF.pel[1]);
    const S = { br, T, Pv, pel };
    // the head sits back over an upright neck: authored head points map 8 units back of where they were drawn
    S.neckTop = T(REF.head[0] - 6, REF.head[1] - 1.0);
    const HF = frame(S.neckTop, p.head + p.lean * 0.5, 1.0);
    S.H = (x, y) => HF(x - REF.head[0], y - REF.head[1]);
    // shoulders, hips
    S.shS = T(-17.4, -138.6);
    S.shF = T(21.2, -130.2);
    S.hipB = Pv(-8.5, -89);
    S.hipF = Pv(15, -89);
    // legs
    // legScB / legScF: per-leg length scale (three-quarter foreshortening); kneeB / kneeF: preferred knee side
    const kB = p.legScB || 1, kF = p.legScF || 1;
    const lb = ik(S.hipB, p.ankB, LEN.thigh * kB, LEN.shin * kB, p.kneeB || [1, -0.15]);
    const lf = ik(S.hipF, p.ankF, LEN.thigh * kF, LEN.shin * kF, p.kneeF || [1, -0.15]);
    S.kneeB = lb.mid; S.ankB = lb.end; S.kneeF = lf.mid; S.ankF = lf.end;
    S.footB = p.footB; S.footF = p.footF;
    // arms
    const as = ik(S.shS, [p.wriS[0], p.wriS[1] - br * 0.2], LEN.upperS, LEN.fore * p.foreS, [0.3, 1]);
    S.elbS = as.mid; S.wriS = as.end;
    const af = ik(S.shF, [p.wriF[0], p.wriF[1] - br * 0.35], LEN.upper, LEN.foreF * p.foreF, [-1, 0.1]);
    S.elbF = af.mid; S.wriF = af.end;
    // staff: gripped in the staff fist
    const fd = nrm(sub(S.wriS, S.elbS));
    S.fistS = add(S.wriS, mul(fd, 5.6));
    S.SF = frame(S.fistS, p.staffAng);
    S.SFu = p.staffU;
    // cloak sway
    S.sway = Math.sin(time * (Math.PI * 2) / per - 0.9) * 0.9 + (p.cloak || 0) * 14;
    S.time = time;
    return S;
  }

  // ---- feathers and wings -----------------------------------------------------------------------
  // F: wing frame, origin at the root, +x toward the tip along the leading edge, +y toward the trailing feathers
  function wing(Ld, F, o) {
    // F: wing frame, origin at the root, +x toward the tip, +y toward the trailing feather tips.
    // o: len, wid (depth of the trailing edge), n feathers, arch (leading-edge bow), fw (feather width),
    //    curl (tip upturn), cov (covert length as a fraction), sil, dots (tone of the lower feathers)
    const Lw = o.len, n = o.n, A = o.arch || 0.12;
    const tip = [Lw, -A * Lw * 0.35 - (o.curl || 0) * Lw];
    const bone = (s) => {
      const p0 = [0, 0], p1 = [Lw * 0.42, -A * Lw], p2 = tip, u = 1 - s;
      return [u * u * p0[0] + 2 * u * s * p1[0] + s * s * p2[0], u * u * p0[1] + 2 * u * s * p1[1] + s * s * p2[1]];
    };
    const trail = (t) => {
      // trailing-edge tip positions: from the wing tip back toward the root, sagging outward
      const a = tip, b = [Lw * (o.trail == null ? 0.35 : o.trail), o.wid];
      const q = mix(a, b, t);
      return [q[0] - Math.sin(t * Math.PI) * o.wid * 0.15, q[1] + Math.sin(t * Math.PI) * o.wid * 0.3];
    };
    const fw = o.fw || o.wid * 0.42;
    const feathers = [];
    for (let i = n - 1; i >= 0; i--) {
      const t = n > 1 ? i / (n - 1) : 0;
      const B = add(bone(lerp(o.b0 == null ? 0.3 : o.b0, 0.03, t)), [0, o.wid * 0.12 * t]);
      const E = trail(t);
      const d = nrm(sub(E, B)), fl = len(sub(E, B)), nn = [-d[1], d[0]];
      const W = fw * (1 - 0.15 * t);
      const at = (u, s) => {
        const w = W * (u < 0.25 ? 0.45 + u * 2.2 : u > 0.7 ? (o.round ? Math.sqrt(Math.max(0.0, 1 - Math.pow((u - 0.7) / 0.33, 2))) : Math.max(0.08, 1 - Math.pow((u - 0.7) / 0.32, 1.6))) : 1); // tapered (pointed or rounded) tips
        return add(add(B, mul(d, fl * u)), mul(nn, s * w * 0.5 - (o.fcurl || 0) * fl * u * u));
      };
      const pts = [];
      for (const u of [0, 0.25, 0.55, 0.8, 0.92, 0.98]) pts.push(at(u, -1));
      pts.push(at(1.02, 0));
      for (const u of [0.98, 0.92, 0.8, 0.55, 0.25, 0]) pts.push(at(u, 1));
      feathers.push({ pts: M(F, pts), shaft: M(F, [at(0.3, -0.1), at(0.62, -0.05), at(0.88, 0)]), lower: M(F, [at(0.3, 0), at(0.85, 0), at(0.96, 0.6), at(0.85, 1), at(0.3, 1)]), t });
    }
    for (const f of feathers) {
      Ld.add(f.pts, (g, P, pts) => {
        surf(g, P, pts, {
          lw: LD,
          clip: false,
          inner(g2) {
            if (o.dots) { g2.fillStyle = pat(f.t > 0.5 ? o.dots + 1 : o.dots); g2.fill(pathOf(f.lower)); }
            ln(g2, f.shaft, LH);
          },
        });
      }, o.sil);
    }
    // coverts: scalloped band along the leading edge over the feather roots
    if (o.cov) {
      const c = [], nb = o.covN || 3, cl = o.cov;
      for (let j = 0; j <= 6; j++) c.push(bone((j / 6) * cl));
      const depth = o.covD || o.wid * 0.42;
      for (let j = nb; j >= 1; j--) {
        const s1 = (j / nb) * cl, s0 = ((j - 1) / nb) * cl;
        const b1 = bone(s1), bm = bone((s0 + s1) / 2);
        c.push([b1[0] - 0.4, b1[1] + depth * 0.55]);
        c.push([bm[0], bm[1] + depth * (1.05 + 0.2 * (1 - j / nb))]);
      }
      c.push([-depth * 0.2, depth * 0.6]);
      const cp = M(F, c);
      Ld.add(cp, (g, P, pts) => {
        surf(g, P, pts, {
          lw: LD,
          inner(g2) {
            if (o.covFill) { g2.fillStyle = pat(o.covFill); g2.fill(P); }
            g2.fillStyle = pat(o.covDots || 2);
            g2.fill(pathOf(shift(pts, mul(nrm(sub(F(0, 1), F(0, 0))), depth * 0.45))));
            for (let j = 1; j < nb; j++) {
              const b1 = bone((j / nb) * cl);
              ln(g2, M(F, [[b1[0] - 0.4, b1[1] + depth * 0.55], [b1[0] - depth * 0.3, b1[1] + depth * 0.1]]), LH);
            }
          },
        });
      }, o.sil);
    }
  }

  // ---- body parts -----------------------------------------------------------------------------

  // the chlamys behind the body: one sheet of dense woven cloth falling from the shoulders behind the staff
  // arm. Its leading edge bellies out to a pointed corner at the lower left, where the hem curls under and
  // shows its lighter lining; below the curl a tubular fold ends in an open turned-back end, and the back
  // panel hangs on to a notched hem at the knee, showing again between the thighs.
  const CL = {
    outer: [
      [-3, -147.6], [-10, -149.2], [-17, -148.4], [-23, -145.4], [-27.8, -140.4], [-31.4, -134.6],
      [-34.6, -128.6], [-39.4, -123.4], [-43.6, -119.8], [-46.8, -116.4],
      [-51.8, -110.6], [-57.0, -105.2], [-60.2, -100.6], [-62.6, -96.6],
      [-66.6, -91.0], [-70.2, -85.4], [-72.8, -81.6], [-74.4, -79.4, 1],
      [-73.6, -76.4], [-71.2, -73.6], [-67.6, -71.6], [-66.0, -69.6], [-65.8, -63.0], [-65.4, -58.8], [-63.6, -56.8, 1],
      [-58.6, -55.4], [-55.2, -53.6, 1], [-52.0, -51.4], [-46.6, -48.4], [-41.6, -46.6], [-38.6, -47.6, 1],
      [-36.0, -51.4], [-32.6, -53.6, 1], [-27.4, -54.4], [-22.4, -53.8, 1], [-18, -55.4], [-12.0, -55.4, 1], [-6.4, -56.6],
      [-2.0, -58.6], [0.4, -62.6], [1.2, -70], [4, -82], [8, -92], [2, -108], [-2, -126], [-1, -140],
    ],
    // the lit belly of the leading edge, ending at the curl
    lit: [[-31.6, -134.0], [-37.6, -125.6], [-46.4, -116.6], [-57.0, -105.6], [-65.8, -92.6], [-72.6, -81.6], [-68.4, -83.4], [-62.6, -85.4], [-56.8, -86.2],
      [-53.4, -95.0], [-47.6, -105.0], [-40.6, -115.6], [-34.4, -126.0]],
    // the lining under the curl
    lining: [[-74.0, -79.6], [-68.4, -82.6], [-62.6, -84.6], [-56.8, -85.4], [-55.6, -80], [-56.8, -73.0], [-61.6, -71.4], [-67.0, -72.0], [-71.0, -73.8], [-73.4, -76.4]],
    // a tubular fold crest falling to the lower left, its end turned back and open
    tube: [[-45.0, -110.0], [-49.4, -100.6], [-53.2, -92.0], [-55.8, -84.0], [-57.2, -74.0], [-57.4, -66.4], [-55.4, -62.8], [-50.6, -62.2], [-47.0, -63.8],
      [-46.6, -72.0], [-46.4, -84.0], [-44.6, -94.0], [-41.8, -104.0]],
    tubeEnd: [[-57.0, -66.0], [-55.4, -63.2], [-50.8, -62.6], [-47.2, -64.0], [-49.6, -66.2], [-53.6, -66.8]],
    // fold valleys: [points], width
    folds: [
      [[[-33.4, -128.6], [-40.6, -117.6], [-47.6, -106.0], [-53.6, -96.0], [-56.6, -86.8]], 1.1],
      [[[-30.4, -122.0], [-37.6, -108.0], [-42.6, -96.0], [-45.4, -84.0], [-46.4, -72.0], [-46.8, -64.4]], 1.2],
      [[[-28.6, -110.0], [-33.0, -96.0], [-36.4, -80.0], [-38.4, -64.0], [-39.4, -50.4]], 0.9],
      [[[-60.6, -71.0], [-61.0, -64.0], [-60.4, -57.4]], 0.7],
    ],
  };
  function cloakBack(Ld, S) {
    const T = S.T, sw = S.sway;
    // lower points swing back with the sway; weight grows with the drop below the shoulder
    const C = (x, y) => {
      const w = clamp((y + 135) / 85, 0, 1) * clamp((24 - x) / 30, 0, 1);
      const q = T(x, y);
      return [q[0] - sw * w * 2.2 - w * w * sw * 0.6, q[1] - Math.abs(sw) * w * 0.4];
    };
    const Cm = (pts) => M(C, pts);
    Ld.add(Cm(CL.outer), (g, P, pts) => {
      surf(g, P, pts, {
        inner(g2) {
          // the outer face: a dense weave, darkest toward the body
          g2.fillStyle = wpat(4); g2.fill(P);
          g2.fillStyle = wpat(5); g2.fill(pathOf(Cm([[-30, -120], [-36, -100], [-40, -80], [-42, -60], [-40, -45], [-20, -45], [-20, -130]])));
          // the lit belly: paper under an open dot screen, darkening toward its inner edge
          const lit = pathOf(Cm(CL.lit));
          g2.fillStyle = PAPER_C; g2.fill(lit);
          g2.fillStyle = wpat(2); g2.fill(lit);
          g2.fillStyle = pat(4); g2.fill(pathOf(Cm([[-34.4, -126.0], [-40.6, -115.6], [-47.6, -105.0], [-53.4, -95.0], [-56.8, -86.2], [-60, -85.8], [-57, -93], [-51, -104], [-44, -113.6], [-36.4, -125]])));
          // the tube fold: a lit crest with its open end turned back
          const tb = pathOf(Cm(CL.tube));
          g2.fillStyle = PAPER_C; g2.fill(tb);
          g2.fillStyle = wpat(1); g2.fill(tb);
          g2.fillStyle = pat(4); g2.fill(pathOf(Cm([[-46.6, -72.0], [-46.4, -84.0], [-44.6, -94.0], [-41.8, -104.0], [-45, -104], [-47.6, -94], [-49.4, -84], [-49.8, -72], [-49.6, -64], [-47.0, -63.8]])));
          ln(g2, Cm(CL.tube.slice(0, 7)), LF);
          ln(g2, Cm(CL.tube.slice(8)), LD);
          // its open end: the inside in shade, a dark crescent at the back
          g2.fillStyle = pat(4); g2.fill(pathOf(Cm(CL.tubeEnd)));
          taper(g2, Cm([[-56.6, -65.4], [-53.6, -66.4], [-49.6, -65.8], [-47.4, -64.2]]), 1.0, 0.2);
          ln(g2, Cm([[-57.0, -66.0], [-53.6, -67.2], [-49.6, -66.6], [-47.2, -64.0]]), LD);
          // the lining under the curl: lighter, a coarse dot screen
          const lp = pathOf(Cm(CL.lining));
          g2.fillStyle = PAPER_C; g2.fill(lp);
          g2.fillStyle = wpat(4); g2.fill(lp);
          g2.fillStyle = PAPER_C; g2.fill(pathOf(Cm([[-73.6, -76.4], [-71.2, -73.6], [-67.6, -71.6], [-62, -71.0], [-57.0, -73.0], [-57.2, -74.6], [-62, -73.2], [-67, -73.8], [-71, -75.6]])));
          g2.fillStyle = pat(2); g2.fill(pathOf(Cm([[-73.6, -76.4], [-71.2, -73.6], [-67.6, -71.6], [-62, -71.0], [-57.0, -73.0], [-57.2, -74.6], [-62, -73.2], [-67, -73.8], [-71, -75.6]])));
          g2.fillStyle = INKC; g2.fill(pathOf(Cm([[-74.0, -79.6], [-68.4, -82.6], [-62.6, -84.6], [-56.8, -85.4], [-56.4, -83.0], [-62.6, -82.4], [-68.4, -80.8], [-72.6, -78.4]])));
          g2.fillStyle = wpat(4); g2.fill(pathOf(Cm([[-72.6, -78.4], [-68.4, -80.8], [-62.6, -82.4], [-56.4, -83.0], [-56.2, -79.6], [-62.6, -78.8], [-68.4, -77.4]])));
          ln(g2, Cm([[-74.0, -79.6], [-68.4, -82.8], [-62.6, -84.8], [-56.8, -85.6]]), LF);
          // fold valleys: dark tapering creases
          for (const [f, w] of CL.folds) taper(g2, Cm(f), w, 0.12);
          // the back panel's hem: a turned edge line just above it
          ln(g2, Cm([[-63.2, -58.6], [-58.6, -57.2], [-52.2, -53.6], [-46.6, -50.4], [-41.6, -48.8]]), LH * 1.5);
          // behind and between the thighs: deep shadow
          g2.fillStyle = pat(4); g2.fill(pathOf(Cm([[-24, -80], [-22, -60], [-12, -57], [0, -60], [6, -72], [6, -82]])));
          // the deep inner fold beside the body and under the staff arm
          const inside = Cm([[-28.6, -137], [-20, -130], [-13, -116], [-9, -98], [-14, -82], [-21, -70], [-28, -64.6], [-32, -70], [-31, -90], [-29.6, -112], [-29.4, -126]]);
          g2.fillStyle = pat(4); g2.fill(pathOf(inside));
        },
      });
    });
  }

  // leg: hip -> knee -> ankle with muscle profile. Profile rows are [t, front, back] half-widths.
  function leg(Ld, S, hip, knee, ank, back) {
    const L = limb2(hip, knee, ank,
      [[0, 8.6, 8.2], [0.38, 9.9, 7.8], [0.7, 7.6, 6.6], [0.86, 6.0, 5.6], [0.95, 5.6, 5.0]],
      [5.2, 4.6],
      [[0.07, 5.5, 5.8], [0.2, 5.2, 8.6], [0.34, 4.9, 9.8], [0.48, 4.5, 8.6], [0.62, 4.0, 6.0], [0.76, 3.5, 4.0], [0.88, 3.0, 3.3], [1, 3.1, 3.2]],
      null, 2);
    const d2 = L.d2, n2 = L.n2, d1 = L.d1, n1 = L.n1;
    // s > 0: front (shin / kneecap side), s < 0: back (calf side)
    const at1 = (t, s) => add(add(hip, mul(d1, t * L.L1)), mul(n1, s));
    const at2 = (t, s) => add(add(knee, mul(d2, t * L.L2)), mul(n2, s));
    const sdir = back ? [-0.75, -0.66] : [0.9, -0.42];
    Ld.add(L.pts, (g, P, pts) => {
      if (back) {
        // a bare-paper rim so the leg separates from the cape behind it
        g.strokeStyle = PAPER_C; g.lineWidth = SIL + 4; g.stroke(P);
        g.strokeStyle = INKC; g.lineWidth = SIL; g.stroke(P);
      }
      surf(g, P, pts, {
        sh: [[4.2, 1, sdir], [2.4, 3, sdir], [1.0, 1, [-sdir[0], sdir[1]]]],
        inner(g2) {
          // inner-thigh teardrop above the knee, and the tibialis edge
          ln(g2, [at1(0.6, -2.6), at1(0.78, -4.8), at1(0.92, -3.6), at1(0.97, -1.8)], LD);
          ln(g2, [at2(0.6, -1.2), at2(0.8, -0.6)], LH * 1.3);
          // fine hatching on the calf (back) and along the shin's shadow
          // hatching that follows the form: lines parallel to the calf and the back of the thigh
          const calfW = [[0.1, 6.6], [0.2, 8.6], [0.34, 9.8], [0.48, 8.6], [0.62, 6.0], [0.76, 4.0], [0.86, 3.4]];
          for (const o of [1.0, 2.0, 3.0, 4.0]) {
            const k = o / 4.5, row = calfW.filter(([t]) => t > 0.06 + k * 0.12 && t < 0.88 - k * 0.2);
            ln(g2, row.map(([t, w]) => at2(t, -(w - o))), LH);
          }
          const thW = [[0.3, 8.0], [0.45, 7.6], [0.6, 7.0], [0.75, 6.2], [0.86, 5.6]];
          for (const o of [1.0, 2.0, 3.0]) ln(g2, thW.filter(([t]) => t > 0.3 + o * 0.04 && t < 0.88 - o * 0.04).map(([t, w]) => at1(t, -(w - o))), LH);
          // a few short cross-contour strokes in the deepest part of the calf
          if (SC > 1.6) for (const t of [0.26, 0.32, 0.38, 0.44]) ln(g2, [at2(t, -9.4 + Math.abs(t - 0.34) * 8), at2(t + 0.03, -6.2), at2(t + 0.02, -4.4)], LH);
          // vastus: the teardrop of the outer thigh muscle above the knee
          ln(g2, [at1(0.42, 5.6), at1(0.64, 6.4), at1(0.8, 5.4), at1(0.88, 3.8)], LD);
          ln(g2, [at1(0.5, 4.6), at1(0.68, 5.0), at1(0.78, 4.2)], LH);
          // knee: kneecap, the inner-knee bulge, tendon
          ln(g2, [at1(0.86, 3.6), at1(0.97, 4.6), at2(0.07, 4.4), at2(0.13, 2.8)], LD);
          ln(g2, [at1(0.82, 0.5), at1(0.93, -1.2), at2(0.04, -2.2)], LH * 1.5);
          ln(g2, [at1(0.55, 2.4), at1(0.75, 3.2)], LH * 1.4);
          // calf separation and shin line
          ln(g2, [at2(0.12, -2.4), at2(0.3, -3.6), at2(0.52, -2.6)], LD);
          ln(g2, [at2(0.22, 2.4), at2(0.5, 2.1), at2(0.7, 1.8)], LH * 1.4);
        },
      });
    });
  }

  // ankle wing: a fan of five curved primaries from the stud, the top one longest, pointing up and back,
  // the lower ones shorter and flatter; a scalloped row of coverts over their roots. Mostly bare paper.
  const AWF = [[-124, 20.5], [-138, 18.4], [-152, 16.0], [-166, 13.4], [-180, 10.6]]; // [angle, length]
  function featherPts(B, ang, L, W, bend) {
    const d = vdeg(ang), n = [-d[1], d[0]];
    const at = (u, s) => {
      const w = W * (u < 0.2 ? 0.5 + u * 2.5 : u > 0.72 ? Math.max(0.1, 1 - Math.pow((u - 0.72) / 0.3, 1.8)) : 1);
      return add(add(B, mul(d, L * u)), mul(n, s * w * 0.5 + bend * L * u * u));
    };
    const pts = [];
    for (const u of [0.05, 0.25, 0.55, 0.8, 0.93]) pts.push(at(u, -1));
    pts.push(at(1.0, 0));
    for (const u of [0.93, 0.8, 0.55, 0.25, 0.05]) pts.push(at(u, 1));
    return { pts, shaft: [at(0.22, 0), at(0.55, 0.05), at(0.85, 0.05)], at };
  }
  function ankleWing(Ld, root, rot, k) {
    for (let i = AWF.length - 1; i >= 0; i--) {
      const [a, L] = AWF[i];
      const B = add(root, mul(vdeg(a + rot), 1.6 * k));
      const f = featherPts(B, a + rot, L * k, 3.6 * k, 0.1);
      Ld.add(f.pts, (g, P, pts) => surf(g, P, pts, {
        lw: LD, clip: false,
        inner(g2) { ln(g2, f.shaft, LH); },
      }), SIL * 0.9);
    }
    // coverts: three scallops over the roots, light dots in the shadow under them
    const cv = [root];
    const R = 8.6 * k, a0 = -116 + rot, a1 = -186 + rot;
    for (let j = 0; j <= 6; j++) {
      const a = lerp(a0, a1, j / 6), r = j % 2 ? R : R * 0.78;
      const q = add(root, mul(vdeg(a), r));
      cv.push(j % 2 ? q : [...q, 1]);
    }
    Ld.add(cv, (g, P, pts) => surf(g, P, pts, {
      lw: LD, clip: false,
      inner(g2) {
        g2.fillStyle = pat(2);
        g2.fill(pathOf([root, add(root, mul(vdeg(a0 - 4), R * 0.5)), add(root, mul(vdeg((a0 + a1) / 2), R * 0.55)), add(root, mul(vdeg(a1 + 4), R * 0.5))]));
        for (const j of [2, 4]) { const a = lerp(a0, a1, j / 6); ln(g2, [add(root, mul(vdeg(a), R * 0.78)), add(root, mul(vdeg(a), R * 0.45))], LH * 1.3); }
      },
    }), SIL * 0.9);
  }

  // laced sandal + ankle wing, in the foot frame (x forward along the ground, y down, ankle at the origin).
  // o.tl / o.hl: toe / heel reach; o.turn: 0 profile .. 1 turned toward the viewer (toes face out)
  function foot(Ld, S, ank, footAng, o) {
    const F = frame(ank, footAng);
    const ah = -ank[1]; // ankle height above the ground at rest
    const tl = o.tl, hl = o.hl, tn = o.turn || 0;
    const sT = ah - 3.0; // top of the sole
    // shin frame for the cuff (x across the shin, + toward the heel side; y up the shin)
    const shinDir = nrm(sub(o.knee, ank));
    const SH = (x, y) => add(add(ank, mul(shinDir, y)), mul([-shinDir[1], shinDir[0]], -x));
    // bare foot above the sole: heel, back of the ankle, front of the ankle, instep, toes
    const top = tn > 0.5
      ? [[3.4, -7.6], [5.6, -3.4], [tl * 0.74, 0.6], [tl - 0.4, 3.6], [tl + 0.6, 5.8], [tl + 0.4, sT, 1]]
      : [[4.0, -8], [tl * 0.3, -4.4], [tl * 0.55, -1.0], [tl * 0.76, 2.0], [tl - 3.0, 3.6], [tl - 0.6, 4.4], [tl + 0.8, 5.8], [tl + 0.6, sT, 1]];
    const body = M(F, [[-hl + 0.6, sT, 1], [-hl - 0.2, sT - 3.6], [-hl + 1.4 + tn * 1.2, -1.6], [-4.6 + tn * 0.8, -7.0 - tn * 0.6], ...top]);
    Ld.add(body, (g, P, pts) => {
      surf(g, P, pts, {
        sh: [[1.6, 1, [-0.7, -0.7]]],
        inner(g2) {
          // shade behind the heel and under the ankle
          g2.fillStyle = pat(2);
          g2.fill(pathOf(M(F, [[-hl - 1, -2], [-hl + 2.4, sT], [-2, sT], [-3.6, -2]])));
          // toes: rounded tips along the front of the sole, the big toe the largest
          const n = tn > 0.5 ? 5 : 4;
          for (let i = 0; i < n; i++) {
            let x, w, h;
            if (tn > 0.5) { x = lerp(tl - 1.4, -tl * 0.15, i / (n - 1)); w = i === 0 ? 3.2 : 2.6 - i * 0.12; h = i === 0 ? 3.0 : 2.5 - i * 0.18; }
            else { x = tl - 1.4 - i * 2.2; w = i === 0 ? 3.2 : 2.4; h = i === 0 ? 3.4 : 2.7 - i * 0.25; }
            ln(g2, M(F, [[x - w * 0.5, sT], [x - w * 0.5, sT - h * 0.6], [x - w * 0.2, sT - h], [x + w * 0.2, sT - h], [x + w * 0.5, sT - h * 0.6], [x + w * 0.5, sT]]), LD);
            g2.fillStyle = pat(3);
            g2.fill(pathOf(M(F, [[x - w * 0.5, sT], [x - w * 0.5, sT - h * 0.5], [x - w * 0.25, sT - h * 0.6], [x - w * 0.2, sT]])));
          }
          // the ankle bone
          ln(g2, M(F, [[-2.0, -6.2], [-0.6, -7.4], [1.0, -6.8]]), LH * 1.4);
        },
      });
    });
    // sole: a dark double line, about 2.4 thick
    const sole = M(F, [[-hl - 0.8, sT, 1], [tl + 1.4, sT, 1], [tl + 2.2, ah - 1.6], [tl + 1.4, ah - 0.3, 1], [-hl - 0.4, ah - 0.3, 1], [-hl - 1.4, ah - 1.6]]);
    Ld.add(sole, (g, P, pts) => surf(g, P, pts, {
      lw: LF * 1.6,
      inner(g2) {
        g2.fillStyle = pat(3); g2.fill(P);
        g2.fillStyle = INKC; g2.fill(pathOf(M(F, [[-hl - 2, ah - 1.1], [tl + 3, ah - 1.1], [tl + 3, ah + 1], [-hl - 2, ah + 1]])));
      },
    }), SIL * 1.1);
    // straps over the foot: broad bands with paper between them
    const strapQ = (a, b, w) => {
      const d = nrm(sub(b, a)), n = [-d[1] * w, d[0] * w];
      return [add(a, n), add(b, n), sub(b, n), sub(a, n)];
    };
    const straps = tn > 0.5
      ? [strapQ([-hl + 0.4, -0.6], [tl - 1.0, 2.6], 0.95), strapQ([-hl + 0.6, 3.2], [tl - 0.6, -0.6], 0.95), strapQ([-hl + 1.2, -4.6], [5.4, -4.2], 0.85)]
      : [strapQ([-3.6, -4.0], [tl - 7.4, sT + 0.3], 0.95), strapQ([3.6, -6.4], [tl * 0.28, sT + 0.3], 0.95), strapQ([tl - 5.6, sT + 0.3], [tl - 7.2, 2.4], 0.9), strapQ([-hl + 0.4, sT - 3.2], [-3.8, -4.6], 0.85)];
    for (const st of straps) Ld.add(M(F, st.map((q) => [q[0], q[1], 1])), (g, P, pts) => surf(g, P, pts, { lw: LF * 1.3, base: 1, sh: [[0.8, 4, [0.3, -1]]] }), 1.1);
    // ankle cuff: two wide bands with a short X of laces between them
    const wAt = (y) => lerp(4.0, 4.5, clamp(y / 20, 0, 1)) + 0.3;
    const bandQ = (y0, y1) => [[-wAt(y0), y0], [wAt(y0), y0], [wAt(y1), y1], [-wAt(y1), y1]];
    const cuff = [
      [bandQ(5.4, 8.6), 2],
      [[[-wAt(8.6), 8.6], [-wAt(8.6) + 1.7, 8.6], [wAt(16.8), 16.0], [wAt(16.8), 17.2]], 0],
      [[[wAt(8.6), 8.6], [wAt(8.6) - 1.7, 8.6], [-wAt(16.8), 16.0], [-wAt(16.8), 17.2]], 0],
      [bandQ(16.6, 19.6), 2],
    ];
    for (const [st, t] of cuff) Ld.add(M(SH, st.map((q) => [q[0], q[1], 1])), (g, P, pts) => surf(g, P, pts, {
      lw: LD,
      inner: t ? (g2) => { g2.fillStyle = pat(t); g2.fill(P); ln(g2, M(SH, [[-wAt(st[0][1]), (st[0][1] + st[2][1]) / 2], [wAt(st[0][1]), (st[0][1] + st[2][1]) / 2]]), LH * 1.3); } : null,
      sh: [[1.0, 3, [0.3, -1]]],
    }), t ? SIL * 0.8 : 0);
    // ankle wing: grows from the stud on the lower band and sweeps up and back
    const root = SH(4.4, 7.0);
    ankleWing(Ld, root, footAng + (o.wingAng || 0), 1.0);
    Ld.add(ellPts(root, 1.6, 1.6, 0, 10), (g, P, pts) => surf(g, P, pts, { lw: LD, sh: [[0.7, 4]] }), SIL * 0.8);
  }

  function skirt(Ld, S) {
    const Pv = S.Pv;
    const sw = S.sway * 0.15;
    const H = (x, y) => { const q = Pv(x, y); const w = clamp((y + 112) / 40, 0, 1); return [q[0] - sw * w, q[1]]; };
    // hem with soft scallops
    // key band between two smooth curves above the hem: lower at the back, sagging a little at the middle
    const bandBot = (s) => { const x = lerp(-18.9, 25.0, s); return [x, -77.0 + s * 4.2 + Math.sin(s * Math.PI) * 1.0 + Math.sin(s * Math.PI * 5) * 0.4]; };
    // hem: follows the band with a gentle wave
    const hem = [];
    // hem: a near-straight edge below a plain pleated strip, with small V notches where the pleats fold in
    for (let i = 0; i <= 16; i++) { const s = 1 - i / 16, b = bandBot(s); const q = [b[0] + (i === 0 ? 0.4 : i === 16 ? -0.3 : 0), b[1] + 2.9 - (i % 2 ? 0 : 0.7)]; if (i % 2 === 0) q.push(1); hem.push(q); }
    const pts = M(H, [[-9.2, -113], [17.6, -112.8], [20.2, -103], [22.6, -92], [24.2, -82.0], [25.0, -76.8], ...hem, [-19.8, -79.4], [-16.8, -92], [-12.8, -104.6]]);
    const bandTop = (s) => { const b = bandBot(s); return [b[0] + lerp(-1.2, 0.3, s), b[1] - 5.2]; };
    Ld.add(pts, (g, P, p2) => {
      surf(g, P, p2, {
        sh: [[6, 1, [1, -0.25]], [3, 3, [1, -0.25]]],
        inner(g2) {
          // folds fanning from the belt to the hem: curved, tapering lines with a halftone valley beside each,
          // and short parallel hatch groups in the lower valleys
          const folds = [[-5.6, -14.4], [-1.0, -6.0], [3.6, 2.6], [8.2, 11.4], [12.8, 19.8]];
          folds.forEach(([bx, hx], i) => {
            const by = bandTop((hx + 18.9) / 43.9)[1];
            const top = [bx, -111.6], mid = [lerp(bx, hx, 0.45) + 1.3, -94], bot = [hx, by - 0.4];
            g2.fillStyle = pat(i < 1 ? 4 : i < 3 ? 3 : 2);
            g2.fill(pathOf(M(H, [top, mid, bot, [hx + 3.0, by], [mid[0] + 1.4, -94], [bx + 0.4, -109]])));
            taper(g2, M(H, [top, [lerp(bx, mid[0], 0.5) + 0.3, -103], mid, [lerp(mid[0], hx, 0.5) + 0.2, -85], bot]), i % 2 ? 1.15 : 0.9, 0.15);
            for (let k = 0; k < 4; k++) {
              const u = 0.55 + k * 0.035;
              const a = [lerp(mid[0], hx, u - 0.5) + 0.9 + k * 0.8, lerp(-94, by, u - 0.5)];
              ln(g2, M(H, [a, [a[0] + (hx - mid[0]) * 0.3, a[1] + (by - -94) * 0.3]]), LH);
            }
          });
          // fine hatching in the shadowed back third
          const hr = M(H, [[-20, -112], [-8, -112], [-12, -72], [-20, -72]]); g2.save(); g2.clip(pathOf(hr)); hatch(g2, bbox(hr), 102, 1.15, LH * 0.8, 0.7); g2.restore();
        },
      });
      // Greek key (meander) band
      const N = 9;
      const BP = (u, v) => { const s = u / N; return mix(bandTop(s), bandBot(s), v); };
      const top = [], bot = [];
      for (let i = 0; i <= 12; i++) { top.push(H(...bandTop(i / 12))); bot.push(H(...bandBot(i / 12))); }
      g.fillStyle = PAPER_C;
      g.fill(pathOf([...top, ...bot.slice().reverse()].map((q, i) => (i === 0 || i === 12 || i === 13 || i === 25 ? [...q, 1] : q))));
      ln(g, top, LD);
      ln(g, bot, LD * 0.9);
      g.beginPath();
      for (let k = 0; k < N; k++) {
        const key = [[0.08, 0.84], [0.08, 0.16], [0.78, 0.16], [0.78, 0.66], [0.33, 0.66], [0.33, 0.42], [0.55, 0.42]];
        key.forEach(([u, v], j) => { const q = H(...BP(k + u, v)); if (j) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
        const a = H(...BP(k + 0.08, 0.84)), b = H(...BP(k + 1.08, 0.84));
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      }
      g.lineWidth = LD * 0.85;
      g.strokeStyle = INKC;
      g.stroke();
      // the plain pleated strip under the band: short pleat lines down to the notches
      for (let i = 2; i < 16; i += 2) { const sx = 1 - i / 16, b = bandBot(sx); ln(g, M(H, [[b[0], b[1] + 0.3], [b[0] + 0.1, b[1] + 2.0]]), LH * 1.3); }
    });
  }

  function torso(Ld, S) {
    const T = S.T;
    // belt first: the bloused chiton hangs over its top edge
    const belt = M(T, [[-9.9, -116.2, 1], [18.3, -116.0, 1], [18.1, -110.0, 1], [-9.5, -110.2, 1]]);
    Ld.add(belt, (g, P, pts) => surf(g, P, pts, {
      sh: [[2.5, 3, [1, 0]]],
      inner(g2) {
        // a woven band: horizontal stripes, darker toward its lower edge
        g2.fillStyle = pat(4); g2.fill(pathOf(M(T, [[-10, -111.8], [19, -111.6], [19, -109], [-10, -109]])));
        for (const y of [-114.9, -113.7, -112.6]) ln(g2, M(T, [[-9.7, y], [18.2, y + 0.2]]), LH * 1.6);
        ln(g2, M(T, [[-9.6, -111.6], [18.1, -111.4]]), LD);
      },
    }), 1.6);
    // chiton bodice: sleeveless, tapering to the waist, bloused over the belt with a wavy lower edge
    const wave = [];
    for (let i = 0; i <= 8; i++) { const x = lerp(-7.4, 16.6, i / 8); wave.push([x, i % 2 ? -113.0 : -114.1]); }
    const top = M(T, [[-3.5, -148.6], [-9.6, -142.4], [-12.4, -134.6], [-11.8, -126.6], [-10.4, -120.4], [-11.4, -116.2], [-10.0, -113.4, 1],
      ...wave, [18.4, -113.6, 1], [18.8, -116.4], [17.8, -120.4], [17.6, -125.0],
      [19.0, -130.4], [19.6, -136], [17.8, -141.4], [14.4, -145.6], [9.6, -148], [4.5, -147.4, 1]]);
    Ld.add(top, (g, P, pts) => {
      surf(g, P, pts, {
        sh: [[6, 1, [1, -0.1]], [3.2, 3, [1, -0.1]]],
        inner(g2) {
          // cast shadow under the mantle cap's lower edge, and the shaded far side under the staff arm
          g2.fillStyle = pat(3);
          g2.fill(pathOf(M(T, [[-4, -146], [0, -142.2], [4.2, -139.0], [8.0, -136.2], [11.6, -133.2], [15.4, -132.0], [18.4, -130.0], [21, -129.4], [21, -126.4], [17, -127.4], [12, -129.6], [7, -132.6], [2, -136.6], [-3, -140.6], [-6, -142]])));
          g2.fillStyle = pat(2);
          g2.fill(pathOf(M(T, [[-13, -140], [-8.6, -138], [-7.4, -128], [-8.4, -118], [-11.4, -122]])));
          // the armhole edge of the sleeveless chiton on the staff side
          ln(g2, M(T, [[-7.8, -143.6], [-8.6, -137.4], [-10.4, -131.6], [-12.4, -128.4]]), LD);
          // diagonal folds falling from the brooch toward the belt, tapering at both ends
          const folds = [
            [[-4.6, -141.0], [-5.6, -128], [-5.4, -116]],
            [[-2.6, -140.0], [-0.8, -127], [0.2, -116.2]],
            [[0, -138.6], [4.6, -127], [6.6, -116.4]],
            [[3.6, -136.4], [9.6, -126.6], [12.4, -116.6]],
            [[8.6, -132.6], [14.6, -125.6], [16.8, -118.6]],
          ];
          folds.forEach((f, i) => {
            const P2 = M(T, f);
            g2.fillStyle = pat(i < 2 ? 3 : 2);
            g2.fill(pathOf([P2[0], P2[1], P2[2], add(P2[2], [-1.8, 0]), add(P2[1], [-1.5, 0]), add(P2[0], [-0.5, 0])]));
            taper(g2, P2, i % 2 ? 0.75 : 0.55);
          });
          // blousing: the cloth puffs and folds over the belt
          for (let i = 1; i < 8; i += 2) {
            const x = lerp(-7.4, 16.6, i / 8);
            ln(g2, M(T, [[x - 0.6, -117.2], [x, -114.4], [x + 0.4, -113.2]]), LH * 1.5);
          }
          ln(g2, M(T, [[-9.4, -116.4], [-3, -115.8], [4, -116.2], [11, -115.8], [18, -116.4]]), LH);
        },
      });
    });
  }

  // neck: upright, bare paper at the front; a narrow shadow only down the far (back) side and under the jaw
  function neck(Ld, S) {
    const T = S.T, H = S.H;
    const pts = [H(17.4, -157.8), H(17.6, -155.2), T(12.4, -150.8), T(14.6, -147.2), T(11.4, -146.4), T(7.6, -146.8), T(4.2, -147.8), T(2.4, -151.4), H(7.2, -157.4), H(8.2, -161)];
    Ld.add(pts, (g, P, p2) => {
      surf(g, P, p2, {
        lw: 0,
        inner(g2) {
          // the far side, turned from the light
          g2.fillStyle = pat(1);
          g2.fill(pathOf([H(7.2, -157.4), H(8.4, -160), T(5.0, -151.4), T(6.0, -147.4), T(4.0, -147.6), T(2.4, -151.4)]));
          for (const k of [0, 1, 2]) ln(g2, [T(3.4 + k * 1.1, -153.4 + k * 0.4), T(4.4 + k * 1.2, -149.0)], LH);
          // under the jaw
          g2.fillStyle = pat(2);
          g2.fill(pathOf([H(9.4, -158.6), H(12.6, -156.4), H(17.0, -155.4), H(17.4, -154.4), H(12.6, -155.0), H(9.6, -156.6)]));
          // the two sternomastoids, from behind the ear to the pit of the throat
          ln(g2, [H(9.8, -160.2), T(9.4, -152.6), T(12.0, -147.6)], LH * 1.5);
          ln(g2, [H(15.0, -156.0), T(11.6, -151.4), T(12.2, -147.8)], LH * 1.2);
        },
      });
      ln(g, [H(17.4, -157.8), H(17.6, -155.2), T(12.4, -150.8), T(14.6, -147.2)], LF);
      ln(g, [H(7.4, -158.4), H(7.2, -157.4), T(2.4, -151.4), T(4.2, -147.8)], LF);
    }, 0);
  }

  // satchel: hangs tilted from the strap at its upper-right corner; flap over the top, a round stud at its point
  // corners TL, TR, BR, BL (pelvis frame): seen in perspective, its top nearly level, its bottom swinging back
  const SAT = { q: [[-24.8, -106.2], [-7.0, -105.2], [-8.8, -91.0], [-25.4, -92.0]], w: 7.8, h: 6.8 };
  const satAt = (x, y) => {
    const a = (x / SAT.w + 1) / 2, b = (y / SAT.h + 1) / 2, Q = SAT.q;
    return mix(mix(Q[0], Q[1], a), mix(Q[3], Q[2], a), b);
  };
  function satchel(Ld, S) {
    const Pv = S.Pv, { w, h } = SAT;
    const B = (x, y) => Pv(...satAt(x, y));
    const Bm = (pts) => pts.map((p) => { const q = B(p[0], p[1]); if (p[2]) q.push(1); return q; });
    // gusset: the side of the bag seen past its back (left) edge
    Ld.add(Bm([[-w + 0.4, -h + 0.4, 1], [-w - 1.8, -h + 1.6, 1], [-w - 1.8, h - 1.4], [-w - 0.6, h + 0.2], [-w + 0.6, h]]), (g, P, pts) => surf(g, P, pts, { base: 4 }), SIL);
    // body: slightly rounded bottom corners
    Ld.add(Bm([[-w, -h, 1], [w, -h, 1], [w, h - 1.4], [w - 1.4, h], [-w + 1.4, h], [-w, h - 1.4]]), (g, P, pts) => surf(g, P, pts, {
      sh: [[2.4, 2, [1, -0.4]], [1.1, 4, [1, -0.4]]],
      inner(g2) {
        // dots on the body below the flap, the flap's cast shadow, a stitched seam along the bottom
        g2.fillStyle = pat(2); g2.fill(P);
        g2.fillStyle = pat(4);
        g2.fill(pathOf(Bm([[-w, 0.2], [0, 2.6], [w, 0.2], [w, 2.0], [0, 4.2], [-w, 2.0]])));
        ln(g2, Bm([[-w + 1.2, h - 1.2], [0, h - 0.9], [w - 1.2, h - 1.2]]), LH * 1.3);
      },
    }), 1.5);
    // flap: covers the top half, its lower edge rounded, a round button at its centre
    const flap = [[-w - 0.4, -h - 0.4, 1], [w + 0.4, -h - 0.4, 1], [w + 0.3, -1.4]];
    for (let i = 0; i <= 8; i++) { const t = i / 8, x = lerp(w - 0.6, -w + 0.6, t); flap.push([x, -0.6 + Math.sin(t * Math.PI) * 1.8]); }
    flap.push([-w - 0.3, -1.4]);
    Ld.add(Bm(flap), (g, P, pts) => surf(g, P, pts, {
      sh: [[1.8, 2, [0.6, -1]]],
      inner(g2) {
        ln(g2, Bm([[-w + 0.8, -h + 0.8], [w - 0.6, -h + 0.8]]), LH * 1.3);
        const st = [];
        for (let i = 0; i <= 8; i++) { const t = i / 8, x = lerp(w - 1.4, -w + 1.4, t); st.push([x, -1.6 + Math.sin(t * Math.PI) * 1.6]); }
        ln(g2, Bm(st), LH * 1.2);
      },
    }), 0);
    const bc = B(-0.4, 0.6);
    Ld.add(ellPts(bc, 1.6, 1.6, 0, 12), (g, P, pts) => surf(g, P, pts, {
      lw: LD, clip: false,
      inner(g2) { g2.fillStyle = INKC; g2.beginPath(); g2.arc(bc[0] + 0.2, bc[1] + 0.2, 0.6, 0, Math.PI * 2); g2.fill(); },
    }), 1.2);
  }

  // cross-body strap from the front shoulder to the satchel's upper-right corner, with a ring at the bag
  function strap(Ld, S) {
    const T = S.T, Pv = S.Pv, { w, h } = SAT;
    const a = T(14.6, -139.0), b = Pv(...satAt(w - 0.6, -h - 0.6));
    const d = nrm(sub(b, a)), n = [-d[1] * 0.85, d[0] * 0.85];
    const pts = [add(a, n), add(b, n), sub(b, n), sub(a, n)].map((q) => [...q, 1]);
    Ld.add(pts, (g, P, p2) => surf(g, P, p2, {
      sh: [[0.75, 3, [-n[0], -n[1]]]],
      inner(g2) { ln(g2, [add(a, mul(n, 0.3)), add(b, mul(n, 0.3))], LH); },
    }), 1.6);
    // buckle ring where the strap meets the bag
    const r = sub(b, mul(d, 2.6));
    Ld.add(ellPts(r, 1.9, 1.4, angOf(d) + 90, 10), (g, P, p2) => surf(g, P, p2, {
      lw: LD, clip: false,
      inner(g2) { g2.fillStyle = INKC; g2.fill(pathOf(ellPts(r, 0.8, 0.5, angOf(d) + 90, 8))); },
    }), 1.3);
  }

  // arm: shoulder -> elbow -> wrist: a swelling deltoid cap, biceps / triceps, a tapered forearm with the
  // brachioradialis bulge below the elbow, and a wristband. No sleeve: the chiton is sleeveless.
  // out: +1 when the left-of-travel side (n1) is the outer (deltoid / biceps) side of the arm, -1 otherwise
  function arm(Ld, S, sh, el, wr, isStaff) {
    const out = isStaff ? -1 : 1;
    const o = (a, b) => (out > 0 ? [a, b] : [b, a]);
    const fore = isStaff
      ? [[0.1, ...o(5.0, 4.8)], [0.4, ...o(5.0, 4.6)], [0.72, ...o(4.0, 3.8)], [1, ...o(3.4, 3.2)]]
      : [[0.12, ...o(4.3, 3.9)], [0.3, ...o(4.6, 3.9)], [0.58, ...o(3.6, 3.4)], [0.82, ...o(3.1, 3.0)], [1, ...o(2.9, 2.8)]];
    const L = limb2(sh, el, wr,
      [[0, ...o(5.8, 5.0)], [0.18, ...o(6.9, 5.1)], [0.4, ...o(5.1, 5.4)], [0.62, ...o(5.7, 4.9)], [0.82, ...o(4.7, 4.2)], [0.95, ...o(4.1, 3.8)]],
      o(3.7, 3.4), fore, 1.5, 1);
    const d2 = L.d2, n2 = L.n2, d1 = L.d1, n1 = L.n1;
    // s measured toward the outer side
    const at1 = (t, s) => add(add(sh, mul(d1, t * L.L1)), mul(n1, s * out));
    const at2 = (t, s) => add(add(el, mul(d2, t * L.L2)), mul(n2, s * out));
    const sdir = isStaff ? [0.9, -0.1] : [-0.95, -0.3];
    Ld.add(L.pts, (g, P, pts) => surf(g, P, pts, {
      sh: [[3.0, 1, sdir], [1.5, 3, sdir]],
      inner(g2) {
        // parallel hatching along the underside (inner side) of the upper arm and forearm
        for (const k of [0.9, 1.8, 2.7, 3.5]) {
          ln(g2, [at1(0.3, -(5.2 - k)), at1(0.5, -(5.4 - k) - 0.2), at1(0.72, -(4.9 - k)), at1(0.9, -(4.2 - k * 0.8))], LH);
        }
        for (const k of [0.8, 1.6, 2.4]) ln(g2, [at2(0.1, -(4.0 - k * 0.8)), at2(0.4, -(4.0 - k * 0.8)), at2(0.65, -(3.4 - k * 0.7))], LH);
        // deltoid: its lower edge dips into the arm in a V between biceps and triceps
        ln(g2, [at1(0.03, 4.6), at1(0.22, 5.2), at1(0.38, 3.0), at1(0.46, 1.0)], LD);
        ln(g2, [at1(0.46, 1.0), at1(0.34, -1.6), at1(0.14, -3.2)], LH * 1.5);
        // biceps: a long swelling contour on the outer half, and the split from the triceps
        ln(g2, [at1(0.44, 3.4), at1(0.62, 3.8), at1(0.8, 2.8)], LH * 1.6);
        ln(g2, [at1(0.48, -0.4), at1(0.68, -0.6), at1(0.88, 0.2)], LD);
        // elbow crease and point, brachioradialis down the forearm
        ln(g2, [at1(0.9, -2.6), add(el, mul(n2, -1.2 * out)), at2(0.14, -1.8)], LD);
        ln(g2, [at2(0.04, 2.8), at2(0.24, 2.6), at2(0.5, 1.0), at2(0.66, 0.2)], LD);
        ln(g2, [at2(0.3, -0.6), at2(0.55, -1.0)], LH * 1.4);
      },
    }));
    // wristband: about a third of the forearm on the free arm, a short cuff on the foreshortened staff arm
    const w0 = isStaff ? 0.7 : 0.64;
    const wb = [at2(w0, 3.8), at2(1.0, 3.4), at2(1.0, -3.4), at2(w0, -3.7)].map((q) => [...q, 1]);
    Ld.add(wb, (g, P, pts) => surf(g, P, pts, {
      sh: [[1.6, 3, sdir]],
      clip: false,
      inner(g2) {
        g2.fillStyle = pat(4); g2.fill(pathOf(wb));
        g2.strokeStyle = PAPER_C; g2.lineWidth = 0.55; g2.lineCap = 'butt';
        for (const t of [0.33, 0.66]) { const u = lerp(w0, 1.0, t); g2.stroke(pathOf([at2(u, 3.6), at2(u, -3.6)], false)); }
      },
    }), SIL);
    return L;
  }

  // the staff arm, raised and turned toward the viewer: a broad upper arm (deltoid cap, biceps below it)
  // running down to the elbow, and the foreshortened forearm as a rounded mass coming forward to the fist
  function capsule(a, b, ra, rb, n) {
    const d = nrm(sub(b, a)), ang = Math.atan2(d[1], d[0]), out = [], k = n || 7;
    for (let i = 0; i <= k; i++) { const t = ang + Math.PI / 2 + (i / k) * Math.PI; out.push(add(a, [Math.cos(t) * ra, Math.sin(t) * ra])); }
    for (let i = 0; i <= k; i++) { const t = ang - Math.PI / 2 + (i / k) * Math.PI; out.push(add(b, [Math.cos(t) * rb, Math.sin(t) * rb])); }
    return out;
  }
  function armStaff(Ld, S) {
    const sh = S.shS, el = S.elbS, wr = S.wriS;
    const d1 = nrm(sub(el, sh)), n1 = [-d1[1], d1[0]], L1 = len(sub(el, sh)); // n1 points to the arm's outer (left) side
    const at1 = (t, s) => add(add(sh, mul(d1, t * L1)), mul(n1, s));
    // upper arm: rows [t, outer, inner]
    const rows = [[0, 6.4, 6.0], [0.16, 7.4, 6.2], [0.36, 6.4, 6.4], [0.58, 6.0, 6.6], [0.8, 5.6, 5.8], [0.96, 5.0, 4.8]];
    const up = [...rows.map(([t, o]) => at1(t, o)), add(el, mul(d1, 3.6)), ...rows.slice().reverse().map(([t, , i]) => at1(t, -i)), sub(sh, mul(d1, 2))];
    Ld.add(up, (g, P, pts) => surf(g, P, pts, {
      sh: [[3.0, 1, [-n1[0], -n1[1]]], [1.5, 3, [-n1[0], -n1[1]]], [1.8, 2, n1]],
      inner(g2) {
        // deltoid: the cap's lower edge curving round into the arm
        ln(g2, [at1(0.04, 5.6), at1(0.28, 6.0), at1(0.46, 3.0), at1(0.5, 0.4)], LD);
        // biceps swelling on the inner side, its underside hatched
        ln(g2, [at1(0.42, -1.6), at1(0.64, -2.6), at1(0.86, -1.8)], LD);
        for (const k of [0.9, 1.8, 2.7, 3.6]) ln(g2, [at1(0.42, -(6.0 - k)), at1(0.64, -(6.4 - k)), at1(0.86, -(5.4 - k))], LH);
        for (const k of [0.8, 1.6, 2.4]) ln(g2, [at1(0.3, 6.2 - k), at1(0.55, 5.8 - k * 0.8), at1(0.8, 5.4 - k)], LH);
      },
    }));
    // forearm: a rounded mass from the elbow up and forward to the wrist, the brachioradialis along its top
    const d2 = nrm(sub(wr, el)), n2 = [-d2[1], d2[0]];
    const fa = capsule(add(el, mul(d2, 1.0)), wr, 5.0, 3.6, 7);
    Ld.add(fa, (g, P, pts) => surf(g, P, pts, {
      sh: [[2.2, 1, [0.3, 1]], [1.1, 3, [0.3, 1]]],
      inner(g2) {
        ln(g2, [add(el, mul(n2, -3.2)), add(mix(el, wr, 0.45), mul(n2, -2.4)), add(wr, mul(n2, -1.6))], LD);
        for (const k of [0, 1, 2]) ln(g2, [add(mix(el, wr, 0.15), mul(n2, 3.2 - k)), add(mix(el, wr, 0.6), mul(n2, 2.6 - k * 0.8))], LH);
      },
    }));
  }

  // free fist hanging at the side: knuckles forward and down, fingers folded, thumb wrapped across the front
  function fistFree(Ld, S) {
    const d = nrm(sub(S.wriF, S.elbF));
    const F = frame(S.wriF, angOf(d) - 90 - 8, 1.04); // local y along the forearm (down the hand), x toward the front
    // knuckle row: four bumps along the front-bottom edge
    const kn = [], A = [6.3, 6.4], B = [0.2, 11.6], c = [1.6, 6.6];
    for (let i = 0; i <= 8; i++) {
      const q = mix(A, B, i / 8);
      const dn = nrm(sub(q, c));
      kn.push(i % 2 ? add(q, mul(dn, 0.75)) : [...q, 1]);
    }
    const pts = M(F, [[-3.0, -0.4], [3.0, -0.4], [4.6, 1.4], [5.6, 3.4], [6.4, 5.2], ...kn.slice(0, -1), [-1.8, 11.6], [-3.8, 10.0], [-4.7, 6.8], [-4.2, 2.6]]);
    Ld.add(pts, (g, P, p2) => surf(g, P, p2, {
      sh: [[2.6, 1, [0.9, -0.4]], [1.3, 3, [0.9, -0.4]]],
      inner(g2) {
        // finger folds running back from the knuckle valleys
        for (let i = 2; i <= 6; i += 2) {
          const q = mix(A, B, i / 8), r = add(q, mul(nrm(sub(c, q)), 2.6));
          ln(g2, M(F, [q, r]), LD);
        }
        // the folded fingers' middle joints
        ln(g2, M(F, [[5.6, 4.4], [3.4, 6.0], [1.0, 8.6], [-0.6, 10.6]]), LH * 1.4);
        // thumb wrapped across the front of the fingers
        ln(g2, M(F, [[4.4, 1.0], [3.0, 3.4], [2.4, 5.4], [3.6, 6.4], [5.2, 5.6]]), LD);
        ln(g2, M(F, [[-3.4, 4.6], [-1.6, 6.0]]), LH * 1.4);
      },
    }));
  }

  // fist around the staff: four finger rows wrapped across the staff, thumb over the top
  function fistStaff(Ld, S) {
    const F = (x, y) => S.SF(x * 0.86, y * 0.86); // x up the staff, y to the right
    const pts = M(F, [[-6.4, -4.6], [-6.8, 0.6], [-6.0, 4.6], [-2.6, 5.6], [2.6, 5.6], [6.2, 4.8], [7.4, 2.2], [7.2, -1.6], [6.0, -4.6],
      [3.4, -5.6], [1.4, -5.2], [-0.2, -5.7], [-1.7, -5.2], [-3.2, -5.7], [-4.8, -5.3]]);
    Ld.add(pts, (g, P, p2) => surf(g, P, p2, {
      sh: [[2.6, 2, [0.4, -0.9]], [1.3, 3, [0.4, -0.9]]],
      inner(g2) {
        for (const u of [-3.9, -1.0, 1.9]) ln(g2, M(F, [[u, -5.4], [u + 0.2, -2.2], [u - 0.1, 1.6]]), LD);
        ln(g2, M(F, [[4.8, -5.2], [4.6, -1.4], [3.6, 2.6], [4.2, 5.2]]), LD); // thumb over the top
        ln(g2, M(F, [[-5.4, 1.4], [-1.5, 2.6], [2.6, 3.2]]), LH * 1.4);
      },
    }));
  }

  // polyline sampler: point at s in [0, 1] by arc length
  function polyAt(P, s) {
    let tot = 0;
    const segs = [];
    for (let i = 1; i < P.length; i++) { const l = len(sub(P[i], P[i - 1])); segs.push(l); tot += l; }
    let d = clamp(s, 0, 1) * tot;
    for (let i = 0; i < segs.length; i++) {
      if (d <= segs[i] || i === segs.length - 1) return mix(P[i], P[i + 1], segs[i] ? clamp(d / segs[i], 0, 1) : 0);
      d -= segs[i];
    }
    return P[P.length - 1];
  }
  // the cloak's end falling behind the front arm (drawn before that arm)
  function mantleHang(Ld, S) {
    const T = S.T, sw = S.sway * 0.25;
    const Tm = (x, y) => { const q = T(x, y); return [q[0] - sw * clamp((y + 140) / 22, 0, 1), q[1]]; };
    const pts = M(Tm, [[11.4, -146.6], [17.4, -144.4], [22.0, -139.6], [25.0, -133.2], [26.4, -127.4], [26.2, -123.4, 1], [24.4, -125.4],
      [22.6, -123.6, 1], [20.8, -127], [17.8, -131], [12.4, -136]]);
    Ld.add(pts, (g, P, p2) => surf(g, P, p2, {
      base: 4,
      inner(g2) {
        g2.fillStyle = pat(6); g2.fill(pathOf(M(Tm, [[22.8, -134], [25.8, -126], [26.0, -118], [24.2, -119], [22.6, -127]])));
        xhatch(g2, P, bbox(p2), 1.0, LH);
        ln(g2, M(Tm, [[20.6, -137.6], [23.6, -128], [24.2, -119]]), LD);
        ln(g2, M(Tm, [[17.0, -136], [20.4, -128], [22.0, -120]]), LH * 1.4);
      },
    }));
  }

  // the mantle: the chlamys laid flat over both shoulders from the brooch. A low collar fold stands up
  // behind the neck (drawn before the neck); in front, a broad cap over the near shoulder ending at mid
  // upper arm with soft folds along its lower edge, and a narrower band over the staff shoulder.
  function mantleTm(S) {
    const T = S.T, sw = S.sway * 0.2;
    return (x, y) => { const q = T(x, y); return [q[0] - sw * clamp((y + 145) / 15, 0, 1), q[1]]; };
  }
  function mantleCollar(Ld, S) {
    const Tm = mantleTm(S);
    const pts = M(Tm, [[-4, -149.4], [-1.6, -153.2], [3.4, -155.6], [9.4, -156.0], [14.6, -154.0], [18.4, -150.4], [15.4, -149.6], [10.6, -151.2], [5.2, -151.6], [0.6, -150.4]]);
    Ld.add(pts, (g, P, p2) => surf(g, P, p2, {
      inner(g2) {
        g2.fillStyle = wpat(3); g2.fill(P);
        g2.fillStyle = pat(3); g2.fill(pathOf(M(Tm, [[0.6, -150.4], [5.2, -151.6], [10.6, -151.2], [15.4, -149.6], [16, -152], [10, -153.6], [3, -153.4]])));
        ln(g2, M(Tm, [[-1.2, -152.0], [4.0, -154.0], [10.0, -154.4], [15.4, -152.4]]), LD);
      },
    }));
  }
  function mantle(Ld, S) {
    const Tm = mantleTm(S);
    // staff-shoulder band: over the top of the shoulder and down behind the arm
    const L = M(Tm, [[-3.4, -150.2], [-9.6, -151.4], [-16.4, -150.6], [-22.4, -147.6], [-27.0, -142.6], [-30.0, -136.6], [-31.4, -130.8, 1],
      [-28.6, -133.6], [-26.4, -136.4, 1], [-23.6, -139.6], [-19.6, -142.8], [-14.4, -144.6], [-8.6, -145.2]]);
    Ld.add(L, (g, P, p2) => surf(g, P, p2, {
      inner(g2) {
        g2.fillStyle = wpat(3); g2.fill(P);
        // lit crest along the top of the shoulder
        g2.fillStyle = PAPER_C; g2.fill(pathOf(M(Tm, [[-6, -150.0], [-14, -150.2], [-21, -147.4], [-25.6, -142.6], [-23.4, -142.6], [-18.6, -146.4], [-12, -148.2]])));
        g2.fillStyle = pat(1); g2.fill(pathOf(M(Tm, [[-6, -150.0], [-14, -150.2], [-21, -147.4], [-25.6, -142.6], [-23.4, -142.6], [-18.6, -146.4], [-12, -148.2]])));
        g2.fillStyle = pat(5); g2.fill(pathOf(M(Tm, [[-8, -145.4], [-15, -144.8], [-21, -142.2], [-26, -136.6], [-28, -134.4], [-25, -138.6], [-19.6, -144.0], [-12, -146.2]])));
        ln(g2, M(Tm, [[-7.4, -147.4], [-15.4, -147.2], [-22.0, -143.6], [-26.6, -137.6]]), LD);
      },
    }));
    // near-shoulder cap: broad and flat, soft folds along its lower edge, a dark lining showing at its end
    const capTop = [[-3.0, -150.6], [2.4, -152.4], [8.6, -152.6], [14.4, -150.8], [19.6, -147.4], [23.8, -142.4], [26.6, -136.4], [28.0, -130.0], [28.0, -124.6, 1]];
    const capBot = [[25.4, -126.0], [23.2, -125.2, 1], [21.0, -128.6], [18.4, -129.4, 1], [15.4, -131.4], [11.6, -132.6, 1], [8.0, -135.6], [4.2, -138.4], [0.0, -141.6], [-3.4, -144.6]];
    const R = M(Tm, [...capTop, ...capBot]);
    Ld.add(R, (g, P, p2) => surf(g, P, p2, {
      inner(g2) {
        g2.fillStyle = wpat(3); g2.fill(P);
        // fold crests fanning from the brooch toward the lower edge: paper with a light screen
        const crests = [
          [[-1, -149.0], [9, -146.6], [17.6, -139.2], [20.6, -130.6], [22.2, -127.6], [19.4, -135.6], [12, -144.6], [2, -150.2]],
          [[0, -145.4], [6, -142.6], [11, -137.4], [13.6, -133.4], [10.6, -135.0], [5.6, -140.0]],
          [[6, -151.4], [15, -148.6], [22.2, -141.4], [25.6, -133.4], [26.8, -127.4], [24.6, -134.6], [19.6, -143.4], [12, -149.6]],
        ];
        for (const c of crests) {
          const Q = pathOf(M(Tm, c));
          g2.fillStyle = PAPER_C; g2.fill(Q);
          g2.fillStyle = pat(1); g2.fill(Q);
        }
        // valleys between the crests
        taper(g2, M(Tm, [[2, -147.6], [12, -142.4], [18.4, -133.4], [21.0, -128.6]]), 1.0, 0.2);
        taper(g2, M(Tm, [[1, -143.6], [8, -138.6], [11.6, -132.8]]), 0.8, 0.15);
        taper(g2, M(Tm, [[8, -149.6], [18, -144.6], [24.2, -134.8], [25.4, -126.4]]), 0.6, 0.1);
        // under the lower edge: the turned lining in deep shade
        g2.fillStyle = pat(5); g2.fill(pathOf(M(Tm, [[28.4, -131], [28.4, -124], [25.4, -126.0], [23.2, -125.2], [21.0, -128.6], [18.4, -129.4], [15.4, -131.4], [11.6, -132.6], [8.0, -135.6], [8.6, -137.2], [12, -134.4], [15.6, -133.2], [18.8, -131.4], [21.6, -130.8], [24, -128.6], [26.6, -129.4]])));
        ln(g2, M(Tm, [[8.6, -136.8], [12, -134.0], [15.6, -132.8], [18.8, -131.0], [21.6, -130.4], [24, -128.2], [26.6, -129.0]]), LD);
      },
    }));
    // brooch
    const c = Tm(-3.2, -145.6);
    Ld.add(ellPts(c, 4.3, 4.3, 0, 14), (g, P, pts) => surf(g, P, pts, {
      sh: [[1.2, 3, [0.5, -1]]],
      clip: false,
      inner(g2) {
        g2.strokeStyle = INKC; g2.lineWidth = LD;
        g2.beginPath(); g2.arc(c[0], c[1], 2.6, 0, Math.PI * 2); g2.stroke();
        g2.fillStyle = INKC; g2.beginPath(); g2.arc(c[0] + 0.4, c[1] - 0.4, 0.8, 0, Math.PI * 2); g2.fill();
      },
    }), 2.0);
  }

  // caduceus in the staff frame: x up the staff (from the grip), y to the right
  // two snakes wind up the rod in widening loops (crossings at u = 8, 19, 30), rise past the top loop and turn
  // their heads in to face each other under the wings; collar, spread wings and a sphere finial on top
  const SN = { k: Math.PI / 11, u0: 8, cuts: [2.6, 13.5, 24.5, 35.5] };
  const snAmp = (u) => 1.6 + 8.2 * Math.pow(clamp((u - 5) / 31, 0, 1), 1.3);
  function staff(Ld, S) {
    const F = (u, v) => S.SF(u + S.SFu, v);
    const rod = M(F, [[-38.5, -0.78, 1], [48, -0.72, 1], [48, 0.72, 1], [-38.5, 0.78, 1]]);
    const snakePts = (sgn, a, b) => {
      const out = [];
      for (let u = a; u <= b + 1e-6; u += 0.9) out.push([u, sgn * snAmp(u) * Math.sin(SN.k * (u - SN.u0))]);
      if (out[out.length - 1][0] < b - 1e-6) out.push([b, sgn * snAmp(b) * Math.sin(SN.k * (b - SN.u0))]);
      return out;
    };
    const segs = [];
    const cuts = SN.cuts;
    for (const sgn of [1, -1]) {
      for (let i = 0; i < cuts.length - 1; i++) {
        const mid = (cuts[i] + cuts[i + 1]) / 2;
        segs.push({ pts: snakePts(sgn, cuts[i], cuts[i + 1]), front: sgn * Math.cos(SN.k * (mid - SN.u0)) > 0, w: i === 0 ? 2.0 : 2.6 });
      }
      // the neck rises from the top loop and curls in toward the rod
      const top = snAmp(35.5) * Math.sin(SN.k * (35.5 - SN.u0));
      segs.push({ pts: [[35.5, sgn * top], [37.6, sgn * (top - 0.3)], [39.6, sgn * (top - 1.6)], [40.8, sgn * (top - 3.4)], [41.2, sgn * (top - 4.8)]], front: true, w: 2.5 });
    }
    const tube = (g, pts, w) => {
      const P = pathOf(M(F, pts), false);
      g.lineCap = 'round';
      g.strokeStyle = INKC; g.lineWidth = w; g.stroke(P);
      g.strokeStyle = PAPER_C; g.lineWidth = w - 1.1; g.stroke(P);
      // the underside of the body in a halftone band
      g.strokeStyle = pat(4); g.lineWidth = (w - 1.1) * 0.45;
      g.stroke(pathOf(M(F, pts.map((q) => [q[0] - (w - 1.1) * 0.28, q[1]])), false));
    };
    const drawSegs = (front) => (g) => { for (const s of segs) if (s.front === front) tube(g, s.pts, s.w); };
    Ld.add(new Path2D(), drawSegs(false), 0);
    Ld.add(rod, (g, P, pts) => surf(g, P, pts, {
      lw: LD,
      inner(g2) { g2.fillStyle = pat(4); g2.fill(pathOf(M(F, [[-40, -1.0], [48, -1.0], [48, -0.1], [-40, -0.1]]))); },
    }), 1.3);
    Ld.add(new Path2D(), drawSegs(true), 0);
    // heads: small wedges facing each other across the rod just under the collar, noses toward the rod
    const sTop = snAmp(35.5) * Math.sin(SN.k * (35.5 - SN.u0)) - 4.8;
    for (const sgn of [1, -1]) {
      const y0 = sTop;
      const hp = M(F, [[40.2, sgn * (y0 + 0.6)], [42.0, sgn * (y0 + 0.9)], [43.4, sgn * (y0 - 0.2)], [43.0, sgn * (y0 - 1.6)], [42.2, sgn * (y0 - 2.6), 1], [41.0, sgn * (y0 - 1.8)], [40.2, sgn * (y0 - 0.8)]]);
      Ld.add(hp, (g, P, pts) => {
        surf(g, P, pts, { lw: LD, sh: [[0.6, 3, [0, 1]]] });
        const e = F(42.4, sgn * (y0 - 0.4));
        g.fillStyle = INKC; g.beginPath(); g.arc(e[0], e[1], 0.42, 0, Math.PI * 2); g.fill();
      }, 1.4);
    }
    // collar and knob under the wings, sphere finial
    Ld.add(M(F, [[45.6, -1.6, 1], [48.8, -1.6, 1], [49.2, -1.1], [49.2, 1.1], [48.8, 1.6, 1], [45.6, 1.6, 1], [45.2, 1.0], [45.2, -1.0]]), (g, P, pts) => surf(g, P, pts, { lw: LD, sh: [[1, 3, [0, -1]]] }), 1.6);
    // wings, spread to both sides: a smooth arched leading edge, coverts over two overlapping feather rows
    for (const sgn of [-1, 1]) {
      const root = F(49.0, sgn * 1.0);
      const tilt = S.SF.deg + 90;
      const WF = frame(root, sgn < 0 ? 194 + tilt : -14 + tilt, 1, sgn < 0);
      wing(Ld, WF, { n: 6, len: 18.4, wid: 6.4, arch: 0.24, fw: 3.6, curl: 0.13, b0: 0.36, trail: 0.22, round: true, cov: 0.46, covN: 3, covD: 2.6, covFill: 1, covDots: 2, sil: 1.6 });
    }
    Ld.add(M(F, [[49.2, -1.0, 1], [51.2, -1.0, 1], [51.2, 1.0, 1], [49.2, 1.0, 1]]), (g, P, pts) => surf(g, P, pts, { lw: LD }), 1.4);
    const top = F(53.2, 0);
    Ld.add(ellPts(top, 2.2, 2.2, 0, 14), (g, P, pts) => surf(g, P, pts, { lw: LD, sh: [[1.1, 3, [0.5, -0.9]]] }), 1.7);
    // butt cap
    Ld.add(M(F, [[-40.4, -1.2, 1], [-37.8, -1.2, 1], [-37.8, 1.2, 1], [-40.4, 1.2, 1]]), (g, P, pts) => surf(g, P, pts, { lw: LD, sh: [[1, 3]] }), 1.4);
  }

  // hair: short wavy locks from under the brim, a sideburn lock in front of the ear and loose locks behind it
  // falling to the nape (head frame, authored coordinates = world + (6, 1) in the stand pose)
  const HAIR = {
    out: [[12.2, -166.4], [11.4, -164.0], [10.6, -162.4, 1], [9.8, -164.0], [8.6, -164.8], [7.0, -164.8], [5.4, -164.0], [4.8, -161.6], [5.0, -158.6],
      [4.2, -156.0, 1], [2.6, -157.4], [1.4, -154.4], [0.2, -150.8, 1], [-1.0, -153.6], [-2.6, -155.2], [-4.0, -156.2, 1], [-4.8, -158.6],
      [-5.6, -161.0], [-6.4, -163.6], [-5.8, -166.2], [-3, -168.8], [4, -169.6], [12.6, -168.8]],
    // short wavy locks: [points] each drawn as a tapered ink stroke with a thin paper sheen along it
    locks: [
      [[11.6, -167.6], [10.4, -166.0], [11.0, -164.2], [10.8, -162.8]],
      [[4.2, -167.4], [2.4, -166.2], [3.0, -164.0], [4.6, -163.2]],
      [[0.4, -167.6], [-1.6, -166.0], [-1.0, -163.8], [0.8, -162.6]],
      [[-3.4, -166.8], [-5.0, -164.6], [-4.0, -162.4], [-2.4, -161.6]],
      [[3.6, -162.0], [2.2, -160.6], [3.0, -158.6], [3.6, -156.6]],
      [[-0.4, -161.6], [-2.0, -159.8], [-1.0, -157.4], [0.2, -155.6], [0.4, -152.6]],
      [[-3.8, -160.6], [-4.4, -158.6], [-3.4, -157.0]],
    ],
  };
  function head(Ld, S) {
    const H = S.H;
    const Hh = (x, y) => H(x + 2, y + 2.0); // brim and wings: the hat sits down on the brow
    const Hc = (x, y) => H(x + 2, y + 1.4 + 0.6 * clamp((y + 178) / 8, 0, 1)); // crown: its base on the brim
    // far hat wing, behind the crown: a small wing with a scalloped leading edge and a few feathers
    const farPts = M(Hh, [[11.4, -177.0], [11.0, -180.0], [11.2, -183.6], [11.6, -186.8], [12.2, -189.8, 1], [13.8, -188.0], [14.4, -186.4, 1],
      [15.4, -184.6], [15.8, -183.4, 1], [17.0, -181.4], [17.4, -180.4, 1], [18.6, -178.4], [19.0, -176.4]]);
    Ld.add(farPts, (g, P, pts) => surf(g, P, pts, {
      lw: LD,
      inner(g2) {
        g2.fillStyle = pat(2);
        g2.fill(pathOf(M(Hh, [[11.4, -177.0], [11.0, -180.0], [11.2, -183.6], [11.6, -186.8], [12.6, -184], [13.0, -180], [13.4, -177]])));
        ln(g2, M(Hh, [[14.4, -186.4], [13.2, -183.4], [13.0, -179.6]]), LH * 1.4);
        ln(g2, M(Hh, [[15.8, -183.4], [14.6, -181.0], [14.6, -177.6]]), LH * 1.4);
        ln(g2, M(Hh, [[17.4, -180.4], [16.4, -178.6], [16.4, -176.8]]), LH * 1.4);
      },
    }), SIL);
    // face in profile: a straight Greek line from brow to nose tip, a firm chin and jaw
    const face = M(H, [
      [5, -172], [21.0, -172.0], [21.2, -168.4], [21.6, -165.8], [21.5, -164.6], [22.5, -161.4, 1], [21.0, -161.1], [20.7, -160.8], [21.3, -160.2],
      [20.7, -159.7], [21.1, -159.0], [20.5, -158.2], [20.9, -156.6], [20.3, -154.6, 1], [17.6, -155.0], [14.0, -156.6], [10.6, -158.6, 1],
      [7.0, -159.6], [4.6, -162.6],
    ]);
    Ld.add(face, (g, P, pts) => surf(g, P, pts, {
      inner(g2) {
        // the brim's shadow across the brow and eye
        g2.fillStyle = pat(4);
        g2.fill(pathOf(M(H, [[4, -174], [24, -174], [24, -166.8], [19.4, -166.4], [15.6, -165.4], [12, -165.0], [8, -164.6], [4, -164.2]])));
        g2.fillStyle = pat(2);
        g2.fill(pathOf(M(H, [[8, -164.6], [12, -165.0], [15.6, -165.4], [19.4, -166.4], [24, -166.8], [24, -165.4], [19.4, -165.2], [15.6, -164.2], [12, -163.6], [8, -163.0]])));
        // the shadow plane of the cheek and jaw, in fine hatching
        for (const k of [0, 1, 2]) ln(g2, M(H, [[11.8 + k * 1.1, -161.6 + k * 0.2], [12.6 + k * 1.1, -158.6 + k * 0.4]]), LH);
        ln(g2, M(H, [[11.0, -158.2], [14.4, -156.6], [18.2, -155.6]]), LH * 1.4);
        // eye under the brim: dark lid, a paper glint; nostril, mouth
        g2.fillStyle = INKC;
        g2.fill(pathOf(M(H, [[15.6, -165.2], [17.4, -166.0], [19.2, -165.6], [18.4, -165.0], [17.0, -164.8]])));
        ln(g2, M(H, [[16.6, -164.2], [18.0, -164.0]]), LH * 1.6);
        ln(g2, M(H, [[20.0, -161.8], [21.0, -161.4]]), LD);
        ln(g2, M(H, [[20.8, -160.2], [19.2, -160.0]]), LD);
        ln(g2, M(H, [[19.8, -158.4], [20.4, -158.0]]), LH * 1.3);
      },
    }));
    // ear: a C-shaped ear between the sideburn and the back locks
    const ec = H(7.0, -161.8);
    const eang = angOf(sub(H(0, 1), H(0, 0))) - 90 + 10;
    Ld.add(ellPts(ec, 1.9, 2.7, eang, 12), (g, P, pts) => surf(g, P, pts, {
      lw: LD, clip: false,
      inner(g2) {
        ln(g2, M(H, [[7.6, -163.6], [6.4, -163.2], [6.0, -161.6], [6.6, -160.2], [7.4, -160.0]]), LD);
        g2.fillStyle = pat(4); g2.fill(pathOf(M(H, [[7.4, -162.8], [6.8, -162.2], [6.8, -161.2], [7.6, -160.8], [8.0, -161.8]])));
      },
    }), 1.2);
    // hair: a dark mass of short wavy locks, with paper sheen along each lock
    Ld.add(M(H, HAIR.out), (g, P, pts) => surf(g, P, pts, {
      lw: LD,
      inner(g2) {
        g2.fillStyle = pat(5); g2.fill(P);
        g2.fillStyle = INKC; g2.fill(pathOf(M(H, [[-7, -171], [14, -171], [13, -167.0], [6, -166.6], [0, -166.4], [-7, -165.2]])));
        g2.strokeStyle = PAPER_C; g2.lineWidth = 0.55; g2.lineCap = 'round';
        for (const L of HAIR.locks) g2.stroke(pathOf(M(H, L.map((v) => [v[0] + 0.8, v[1] + 0.2])), false));
        for (const L of HAIR.locks) taper(g2, M(H, L), 0.8, 0.15);
      },
    }), SIL);
    // near wing (big), root behind the crown, sweeping back more than up
    const near = frame(Hh(0.6, -177.0), -155.5, 1.08, true);
    wing(Ld, near, { n: 6, len: 26.6, wid: 9.0, arch: 0.14, fw: 4.6, curl: 0.03, b0: 0.42, trail: 0.46, round: true, cov: 0.46, covN: 4, covD: 4.4, covFill: 2, covDots: 3, sil: SIL });
    // brim: a heavy tilted disc seen from a little below: the front rim on top, the dark underside below it
    // (its lower half foreshortened), its front lip low over the brow so the eye sits in its shadow
    const bc = Hh(7.2, -167.8), rot = -11.4 + angOf(sub(S.H(1, 0), S.H(0, 0)));
    const bAt = (t, bt, bb, ox, oy) => {
      const x = Math.cos(t) * (19.2 + (ox || 0)), y = Math.sin(t) * (Math.sin(t) < 0 ? bt : bb) + (oy || 0), a = rot * D2R;
      return [bc[0] + x * Math.cos(a) - y * Math.sin(a), bc[1] + x * Math.sin(a) + y * Math.cos(a)];
    };
    const brim = [];
    for (let i = 0; i < 28; i++) brim.push(bAt((i / 28) * Math.PI * 2, 4.2, 1.6));
    Ld.add(brim, (g, P, pts) => surf(g, P, pts, {
      inner(g2) {
        g2.fillStyle = pat(5); g2.fill(P);
        g2.fillStyle = wpat(3); g2.fill(P);
        // a lit line along the rim's top edge
        const rim = [];
        for (let i = 15; i <= 27; i++) rim.push(bAt((i / 28) * Math.PI * 2, 3.1, 1.6, -1.2));
        g2.strokeStyle = PAPER_C; g2.lineWidth = 0.7; g2.lineCap = 'round'; g2.stroke(pathOf(rim, false));
      },
    }), 2.0);
    // crown: dome seated on the brim's centre line
    const crown = M(Hc, [[-1.0, -173.0], [0.4, -177.6], [3.0, -180.2], [7.0, -181.2], [11.0, -181.0], [14.5, -179.6], [17.4, -176.9], [19.0, -174.2], [19.6, -172.6],
      [14, -172.0], [8, -171.2], [4, -170.4], [0, -169.6]]);
    Ld.add(crown, (g, P, pts) => surf(g, P, pts, {
      inner(g2) {
        // soft dot gradient on the shadow (left) side of the dome
        g2.fillStyle = pat(1); g2.fill(pathOf(M(Hc, [[-2, -167], [-2, -175], [4, -181], [10, -181], [9, -176], [8, -170]])));
        g2.fillStyle = pat(2); g2.fill(pathOf(M(Hc, [[-2, -167], [-2, -175], [3, -180], [6, -180], [4.4, -175], [4, -169]])));
        g2.fillStyle = pat(3); g2.fill(pathOf(M(Hc, [[-2, -167], [-2, -174], [1.2, -176.6], [1.6, -172], [1.8, -169]])));
        // hat band
        ln(g2, M(Hc, [[0.2, -170.6], [6, -170.8], [14, -171.3], [22.4, -172.2]]), LD);
        g2.fillStyle = pat(2); g2.fill(pathOf(M(Hc, [[-1, -168.6], [6, -169.2], [14, -169.8], [23, -171], [22.4, -172.2], [14, -171.3], [6, -170.8], [0.2, -170.6]])));
      },
    }));
  }

  function groundShadow(g, S) {
    g.strokeStyle = INKC;
    g.lineWidth = 0.45;
    g.beginPath();
    for (const [a, b, y] of [[-42, -8, 0.5], [-38, -14, 1.7], [15, 58, 0.5], [20, 52, 1.7]]) { g.moveTo(a, y); g.lineTo(b, y); }
    g.stroke();
  }

  // ---- draw ---------------------------------------------------------------------------------------
  // drawRig: solve the pose and draw every part from the joints (the rig itself)
  function drawRig(g, p, time, ink) {
    INKC = ink;
    const T = g.getTransform();
    SC = Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1;
    GX = g;
    const S = solve(p, time);
    g.save();
    groundShadow(g, S);
    const Ld = List();
    cloakBack(Ld, S);
    leg(Ld, S, S.hipB, S.kneeB, S.ankB, true);
    foot(Ld, S, S.ankB, S.footB, { tl: 11.0, hl: 8.2, turn: 1, wingAng: 0, knee: S.kneeB });
    leg(Ld, S, S.hipF, S.kneeF, S.ankF, false);
    foot(Ld, S, S.ankF, S.footF, { tl: 20.6, hl: 10.4, turn: 0.3, wingAng: 0, knee: S.kneeF });
    skirt(Ld, S);
    torso(Ld, S);
    satchel(Ld, S);
    strap(Ld, S);
    mantleHang(Ld, S);
    arm(Ld, S, S.shF, S.elbF, S.wriF, false);
    fistFree(Ld, S);
    armStaff(Ld, S);
    mantleCollar(Ld, S);
    neck(Ld, S);
    mantle(Ld, S);
    staff(Ld, S);
    fistStaff(Ld, S);
    head(Ld, S);
    Ld.render(g);
    g.restore();
  }

  // Frame cache for looping poses (the idle): the rig's output for a pose, ink, quantised device scale, mirror
  // and loop phase is rendered once into an offscreen canvas and then stamped with drawImage, scaled by the
  // small remainder between the real and the quantised scale (so a smooth camera zoom stays on cached frames).
  // Poses driven by continuous animation parameters (no 'loop' field) always draw the rig directly.
  const FCACHE = new Map();
  const FC_MAX = 160, FC_STEPS = 32, FC_Q = 8; // FC_Q scale steps per octave
  const BOX = [-86, -206, 72, 8]; // world extents of the figure, wings and staff included
  function draw(g, poseName, opts) {
    const ink = !opts || !opts.ink || opts.ink === INK.blue ? OWN : opts.ink;
    const p = POSES[poseName] || POSES.stand;
    const time = (opts && opts.time) || 0;
    const T = g.getTransform();
    const axis = Math.abs(T.b) < 1e-6 && Math.abs(T.c) < 1e-6;
    if (!p.loop || !axis || (opts && opts.noCache) || typeof document === 'undefined') { drawRig(g, p, time, ink); return; }
    const ph = ((Math.round((((time % p.loop) + p.loop) % p.loop) / p.loop * FC_STEPS)) % FC_STEPS);
    const sc = Math.sqrt(Math.abs(T.a * T.d)) || 1;
    const qi = Math.round(Math.log2(sc) * FC_Q), q = Math.pow(2, qi / FC_Q), k = sc / q;
    const ax = Math.sign(T.a) * q * Math.abs(T.a) / sc, dy = Math.sign(T.d) * q * Math.abs(T.d) / sc;
    const key = (poseName || 'stand') + '|' + ink + '|' + qi + '|' + Math.sign(T.a) + Math.sign(T.d) + '|' + ph;
    let e = FCACHE.get(key);
    if (!e) {
      // device-space bounds of the world box under the quantised scale
      const xs = [BOX[0] * ax, BOX[2] * ax], ys = [BOX[1] * dy, BOX[3] * dy];
      const x0 = Math.floor(Math.min(...xs)) - 2, y0 = Math.floor(Math.min(...ys)) - 2;
      const w = Math.ceil(Math.max(...xs) - x0) + 4, h = Math.ceil(Math.max(...ys) - y0) + 4;
      let cv;
      if (FCACHE.size >= FC_MAX) { const old = FCACHE.keys().next().value; cv = FCACHE.get(old).cv; FCACHE.delete(old); }
      else cv = document.createElement('canvas');
      cv.width = w; cv.height = h; // also clears a reused canvas
      const c2 = cv.getContext('2d');
      c2.setTransform(ax, 0, 0, dy, -x0, -y0);
      drawRig(c2, p, (ph / FC_STEPS) * p.loop, ink);
      e = { cv, x0, y0 };
      FCACHE.set(key, e);
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (Math.abs(k - 1) < 1e-3) g.drawImage(e.cv, Math.round(T.e + e.x0), Math.round(T.f + e.y0));
    else g.drawImage(e.cv, T.e + e.x0 * k, T.f + e.y0 * k, e.cv.width * k, e.cv.height * k);
    g.restore();
  }

  window.CONCEPT = {
    name: 'Classical Messenger',
    tagline: 'cobalt ink print: winged petasos, chlamys, caduceus',
    height: 182,
    print: { paper: PAPER_C, ink: OWN, grain: 0 },
    poses: POSES,
    solve,
    draw,
    drawRig: (g, pose, opts) => drawRig(g, POSES[pose] || POSES.stand, (opts && opts.time) || 0, !opts || !opts.ink || opts.ink === INK.blue ? OWN : opts.ink),
  };
})();
