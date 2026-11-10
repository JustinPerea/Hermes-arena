// ---------------------------------------------------------------------------
// Hermes Arena — figures: pose system, one-piece engraved bodies, Hermes.
// Local figure space: facing +x, origin at the hips, y down.
// ---------------------------------------------------------------------------

const BASE_POSE = {
  lean: 4, head: 0, rot: 0, lift: 0,
  la1: -14, la2: 26, ra1: 26, ra2: 56,
  ll1: -16, ll2: -12, rl1: 20, rl2: -18,
  wpn: 104, wing: 0.3, cloak: 0.25, air: 0,
  handB: 0, handF: 0, // 0 fist/grip, 1 open
  ox: 0, oy: 0, // visual body offset in figure units (after grounding)
  fade: 0, // 0 solid .. 1 invisible (dodges, respawn)
  wpnShow: 1, // caduceus drawn when > 0.5
};

function mixPose(a, b, t) {
  const o = {};
  for (const k in a) o[k] = lerp(a[k], b[k] == null ? a[k] : b[k], t);
  return o;
}

const EASE = {
  inOut: easeInOut,
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  lin: (t) => t,
};

// keyframes: [[t, partialPose, ease?], ...]; ease applies to the segment ending at that key.
function keyframes(frames) {
  const full = frames.map(([t, p, e]) => [t, Object.assign({}, BASE_POSE, p), EASE[e || 'inOut']]);
  return (t) => {
    if (t <= full[0][0]) return Object.assign({}, full[0][1]);
    for (let i = 1; i < full.length; i++) {
      if (t <= full[i][0]) {
        const [t0, p0] = full[i - 1];
        const [t1, p1, ease] = full[i];
        return mixPose(p0, p1, ease((t - t0) / (t1 - t0 || 1)));
      }
    }
    return Object.assign({}, full[full.length - 1][1]);
  };
}

const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const TUCK = { ll1: 85, ll2: -135, rl1: 95, rl2: -140, la1: 70, la2: 90, ra1: 60, ra2: 100, wpn: 175, lean: 20 };

const POSES = {
  idle(time) {
    const b = Math.sin(time * 2.2);
    return Object.assign({}, BASE_POSE, {
      la1: -14 + b * 3, la2: 26 + b * 4, ra1: 26 + b * 1.5, lean: 4 + b * 0.8, head: b * 1.5,
      wing: 0.3 + 0.18 * Math.sin(time * 5), cloak: 0.25 + 0.05 * b,
    });
  },
  run(phase, speed) {
    const s = Math.sin(phase);
    const k = clamp(speed, 0.3, 1);
    const knee = (p) => -26 - 60 * Math.max(0, Math.cos(p)) * k;
    return Object.assign({}, BASE_POSE, {
      lean: 14 * k + 2 + 2 * Math.cos(2 * phase),
      head: -s * 3,
      ll1: -s * 46 * k + 4,
      ll2: knee(phase + Math.PI),
      rl1: s * 46 * k + 4,
      rl2: knee(phase),
      la1: s * 55 * k,
      la2: 30 + Math.max(0, s) * 40,
      ra1: 30 - s * 28 * k,
      ra2: 50 + s * 25,
      wpn: 100,
      wing: 0.6 + 0.4 * Math.sin(phase * 2),
      cloak: 0.6 * k + 0.3,
      lift: 7 * Math.max(0, -Math.cos(2 * phase)) * k,
    });
  },
  jump: () => Object.assign({}, BASE_POSE, { lean: 6, ll1: 18, ll2: -76, rl1: 58, rl2: -66, la1: -50, la2: 40, ra1: 112, ra2: 24, wpn: 70, wing: 1, cloak: 0.9, air: 1 }),
  fall: () => Object.assign({}, BASE_POSE, { lean: 0, ll1: -8, ll2: -24, rl1: 24, rl2: -38, la1: 100, la2: 24, ra1: 50, ra2: 40, wpn: 140, wing: 0.8, cloak: 0.7, air: 1 }),
  flip(t) {
    const tuck = smoothstep(0, 0.15, t) * (1 - smoothstep(0.8, 1, t));
    const p = mixPose(POSES.jump(), Object.assign({}, BASE_POSE, TUCK, { wing: 1, cloak: 1, air: 1 }), tuck);
    p.rot = 360 * EASE.out(t);
    p.air = 1;
    return p;
  },
  land: () => Object.assign({}, BASE_POSE, { lean: 18, ll1: 20, ll2: -78, rl1: 46, rl2: -92, la1: 40, la2: 30, ra1: 44, ra2: 60, wpn: 130, wing: 0.9 }),
  crouch: () => Object.assign({}, BASE_POSE, { lean: 14, ll1: 30, ll2: -96, rl1: 58, rl2: -112, la1: 30, la2: 50, ra1: 38, ra2: 74, wpn: 135 }),
  skid: () => Object.assign({}, BASE_POSE, { lean: -12, ll1: -34, ll2: -10, rl1: 34, rl2: -36, la1: -50, la2: 20, ra1: 20, cloak: 1.1, handB: 1 }),
  // caduceus strike: big overhead arc with a lunge
  swing: keyframes([
    [0, { ra1: 165, ra2: 25, wpn: 70, lean: -10, la1: 40, ll1: -14, rl1: 20 }],
    [0.12, { ra1: 70, ra2: 8, wpn: 95, lean: 24, la1: -55, la2: 30, rl1: 42, rl2: -48, ll1: -32, ll2: -8, cloak: 1 }, 'out'],
    [0.22, { ra1: 30, ra2: 18, wpn: 110, lean: 26, la1: -60, la2: 30, rl1: 42, rl2: -48, ll1: -32, ll2: -8, cloak: 0.9 }],
    [0.45, { ra1: 30, ra2: 18, wpn: 110, lean: 24, la1: -55, la2: 30, rl1: 42, rl2: -48, ll1: -32, ll2: -8 }],
    [1, {}],
  ]),
  // victory pose: caduceus raised, fist on hip, wide stance
  _taunt: keyframes([
    [0, {}],
    [0.12, { lean: 12, ll2: -24, rl2: -34, ra1: 60, ra2: 60 }],
    [0.3, { ra1: 176, ra2: 0, wpn: 0, lean: -9, head: -18, la1: -35, la2: 95, ll1: -22, ll2: -4, rl1: 28, rl2: -18, wing: 1, cloak: 1.2 }, 'out'],
    [0.85, { ra1: 174, ra2: 2, wpn: 0, lean: -8, head: -16, la1: -35, la2: 95, ll1: -22, ll2: -4, rl1: 28, rl2: -18, wing: 1, cloak: 1.2 }],
    [1, {}],
  ]),
  taunt(t, time) {
    const p = POSES._taunt(t);
    const hold = smoothstep(0.25, 0.32, t) * (1 - smoothstep(0.8, 0.9, t));
    p.head += 2 * Math.sin(time * 3) * hold;
    p.wing = lerp(p.wing, 0.8 + 0.2 * Math.sin(time * 40), hold);
    // a quick twirl of the staff as it goes up
    if (t > 0.22 && t < 0.34) p.wpn += 360 * smoothstep(0.22, 0.34, t);
    return p;
  },
};

// ---- skeleton ---------------------------------------------------------------

const HERMES_SHAPE = { scale: 1, torso: 33, neck: 4.5, headR: 7.4, upper: 18, fore: 16, thigh: 25, shin: 24, shoulder: 6.5 };
// Optional SHAPE fields (skins may set them; defaults reproduce the procedural figure):
//   hipW 4 (hip joint offset from the pelvis centre), shDrop 4 (shoulder joint below the
//   torso top), sole 3 (ankle height above the floor), crown 14 (J.top above the head
//   circle), staffTip 46 / staffButt 26 (caduceus tip / butt distance from the front hand).
const shapeOr = (S, key, dflt) => (S[key] != null ? S[key] : dflt);

function skeleton(pose, S) {
  const k = S.scale;
  const lean = pose.lean;
  const hip = [0, 0];
  const td = dirv(180 - lean);
  const sh = [td[0] * S.torso * k, td[1] * S.torso * k];
  const hd = dirv(180 - lean - pose.head * 0.5);
  const head = [sh[0] + hd[0] * (S.neck + S.headR) * k, sh[1] + hd[1] * (S.neck + S.headR) * k];
  const perp = [Math.cos(lean * D2R), Math.sin(lean * D2R)];
  const shDrop = shapeOr(S, 'shDrop', 4);
  const hipW = shapeOr(S, 'hipW', 4);
  const arm = (a1, a2, side) => {
    const s = [sh[0] + perp[0] * side * S.shoulder * k - td[0] * shDrop * k, sh[1] + perp[1] * side * S.shoulder * k - td[1] * shDrop * k];
    const d1 = dirv(a1 + lean);
    const e = [s[0] + d1[0] * S.upper * k, s[1] + d1[1] * S.upper * k];
    const d2 = dirv(a1 + a2 + lean);
    const h = [e[0] + d2[0] * S.fore * k, e[1] + d2[1] * S.fore * k];
    return { s, e, h, ang: a1 + a2 + lean, ang1: a1 + lean };
  };
  const leg = (l1, l2, side) => {
    const h = [side * hipW * k, 0];
    const d1 = dirv(l1);
    const kn = [h[0] + d1[0] * S.thigh * k, h[1] + d1[1] * S.thigh * k];
    const d2 = dirv(l1 + l2);
    const f = [kn[0] + d2[0] * S.shin * k, kn[1] + d2[1] * S.shin * k];
    return { h, k: kn, f, ang: l1 + l2 };
  };
  return {
    hip, sh, head, td, perp,
    armB: arm(pose.la1, pose.la2, -1),
    armF: arm(pose.ra1, pose.ra2, 1),
    legB: leg(pose.ll1, pose.ll2, -1),
    legF: leg(pose.rl1, pose.rl2, 1),
  };
}

// ---- limb construction ------------------------------------------------------

// One continuous outline through root -> joint -> end with a muscle profile.
// prof: half-widths [root, mid1, joint, mid2, end], mid positions m1, m2,
// and a "back bulge" multiplier for mid2 (calf).
function limbOutline(a, b, c, prof, k) {
  const d1 = [b[0] - a[0], b[1] - a[1]];
  const d2 = [c[0] - b[0], c[1] - b[1]];
  const l1 = Math.hypot(d1[0], d1[1]) || 1;
  const l2 = Math.hypot(d2[0], d2[1]) || 1;
  const u1 = [d1[0] / l1, d1[1] / l1];
  const u2 = [d2[0] / l2, d2[1] / l2];
  const n1 = [-u1[1], u1[0]];
  const n2 = [-u2[1], u2[0]];
  let nj = [n1[0] + n2[0], n1[1] + n2[1]];
  const lj = Math.hypot(nj[0], nj[1]) || 1;
  nj = [nj[0] / lj, nj[1] / lj];
  const w = prof.w.map((v) => v * k);
  const bb = prof.backBulge || 1;
  const samples = [
    { p: a, n: n1, wl: w[0], wr: w[0] },
    { p: [a[0] + d1[0] * prof.m1, a[1] + d1[1] * prof.m1], n: n1, wl: w[1] * (prof.frontBulge1 || 1), wr: w[1] },
    { p: b, n: nj, wl: w[2], wr: w[2] },
    { p: [b[0] + d2[0] * prof.m2, b[1] + d2[1] * prof.m2], n: n2, wl: w[3] * bb, wr: w[3] * (2 - bb) },
    { p: c, n: n2, wl: w[4], wr: w[4] },
  ];
  const L = samples.map((s) => [s.p[0] + s.n[0] * s.wl, s.p[1] + s.n[1] * s.wl]);
  const R = samples.map((s) => [s.p[0] - s.n[0] * s.wr, s.p[1] - s.n[1] * s.wr]);
  const path = (g) => {
    smoothThrough(g, L, true);
    const ae = Math.atan2(u2[1], u2[0]);
    g.arc(c[0], c[1], w[4], ae + Math.PI / 2, ae - Math.PI / 2, true);
    smoothThrough(g, R.slice().reverse(), false);
    const as = Math.atan2(u1[1], u1[0]);
    g.arc(a[0], a[1], w[0], as - Math.PI / 2, as + Math.PI / 2, true);
    g.closePath();
  };
  return { path, samples, segs: [[a, b, u1, n1, w[0], w[2]], [b, c, u2, n2, w[2], w[4]]] };
}

const LEG_PROF = { w: [6.2, 6.8, 4.2, 4.9, 2.5], m1: 0.35, m2: 0.3, backBulge: 1.3 };
const ARM_PROF = { w: [4.9, 4.6, 3.1, 3.7, 2.4], m1: 0.45, m2: 0.25, backBulge: 1.05 };

// Contour hatching for a limb: lines across the bone on the shadow side,
// bowed to suggest roundness, plus a dense band along the shadow edge.
function hatchLimb(g, ink, limb, light, k, darkness) {
  const P = inkPatterns(g, ink);
  g.save();
  g.beginPath();
  limb.path(g);
  g.clip();
  g.strokeStyle = ink;
  g.lineCap = 'round';
  const sp = 2.3 * k;
  for (const [a, b, u, n, wa, wb] of limb.segs) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const side = n[0] * light[0] + n[1] * light[1] > 0 ? -1 : 1; // normal side facing away from the light
    const ns = [n[0] * side, n[1] * side];
    for (let s = sp * 0.5; s < len; s += sp) {
      const t = s / len;
      const W = lerp(wa, wb, t) * 1.35;
      const px = a[0] + u[0] * s;
      const py = a[1] + u[1] * s;
      g.lineWidth = 0.55 + 0.25 * darkness;
      g.beginPath();
      g.moveTo(px - ns[0] * W * 0.15, py - ns[1] * W * 0.15);
      g.quadraticCurveTo(px + ns[0] * W * 0.5 - u[0] * W * 0.35, py + ns[1] * W * 0.5 - u[1] * W * 0.35, px + ns[0] * W * 1.1, py + ns[1] * W * 1.1);
      g.stroke();
    }
    // dense shadow band
    g.strokeStyle = P.dense;
    g.lineWidth = (wa + wb) * 0.55 * (0.7 + darkness * 0.5);
    g.beginPath();
    g.moveTo(a[0] + ns[0] * wa * 1.05, a[1] + ns[1] * wa * 1.05);
    g.lineTo(b[0] + ns[0] * wb * 1.05, b[1] + ns[1] * wb * 1.05);
    g.stroke();
    g.strokeStyle = ink;
  }
  g.restore();
}

// ---- body parts -------------------------------------------------------------

function torsoPath(k, T) {
  return (q) => {
    q.moveTo(-6.5 * k, -3 * k);
    q.quadraticCurveTo(-10 * k, -T * 0.5, -11 * k, -T + 4 * k); // back line to shoulder
    q.quadraticCurveTo(-8 * k, -T - 1.5 * k, -1 * k, -T - 1 * k); // trapezius
    q.quadraticCurveTo(9 * k, -T - 0.5 * k, 13 * k, -T + 4 * k); // front shoulder
    q.quadraticCurveTo(14.5 * k, -T + 12 * k, 11 * k, -T * 0.42); // chest swell
    q.quadraticCurveTo(8 * k, -T * 0.2, 7.5 * k, -3 * k); // abdomen
    q.closePath();
  };
}

function drawHand(g, ink, wrist, angDeg, mode, k, shade) {
  const [dx, dy] = dirv(angDeg);
  const nx = -dy;
  const ny = dx;
  const cx = wrist[0] + dx * 3 * k;
  const cy = wrist[1] + dy * 3 * k;
  g.save();
  if (mode > 0.5) {
    // open hand: palm and four fingers
    g.beginPath();
    g.ellipse(cx, cy, 3.2 * k, 2.6 * k, Math.atan2(dy, dx), 0, Math.PI * 2);
    engraveFill(g, ink, { pat: shade, patAlpha: 0.6, lw: LW.form });
    g.strokeStyle = ink;
    g.lineWidth = 1.5 * k * 0.8;
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const sp = (i - 1.5) * 0.35;
      const fx = Math.cos(Math.atan2(dy, dx) + sp);
      const fy = Math.sin(Math.atan2(dy, dx) + sp);
      line(g, cx + dx * 2 * k, cy + dy * 2 * k, cx + dx * 2 * k + fx * 6 * k, cy + dy * 2 * k + fy * 6 * k);
    }
  } else {
    // fist with knuckles
    g.beginPath();
    const ang = Math.atan2(dy, dx);
    g.save();
    g.translate(cx, cy);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(-2.5 * k, -2.8 * k);
    g.quadraticCurveTo(3.8 * k, -3.4 * k, 3.6 * k, 0);
    g.quadraticCurveTo(3.8 * k, 3.2 * k, -2.5 * k, 2.8 * k);
    g.quadraticCurveTo(-3.6 * k, 0, -2.5 * k, -2.8 * k);
    g.closePath();
    engraveFill(g, ink, { pat: shade, patAlpha: 0.65, lw: LW.form });
    g.strokeStyle = ink;
    g.lineWidth = 0.7;
    for (let i = -1; i <= 1; i++) line(g, 1.8 * k, i * 1.4 * k, 3.4 * k, i * 1.5 * k);
    g.restore();
    void nx;
    void ny;
  }
  g.restore();
}

// A proper wing: bony leading edge, covert row, graduated notched primaries.
function drawWing(g, ink, x, y, ang, len, flap, shade, k) {
  const P = inkPatterns(g, ink);
  const A = ang + flap;
  const [dx, dy] = dirv(A);
  const tip = [x + dx * len, y + dy * len];
  // leading edge bows away from the trailing side
  const [bx, by] = dirv(A - 90);
  const ctrl = [x + dx * len * 0.45 + bx * len * 0.18, y + dy * len * 0.45 + by * len * 0.18];
  const along = (t) => {
    const mt = 1 - t;
    return [mt * mt * x + 2 * mt * t * ctrl[0] + t * t * tip[0], mt * mt * y + 2 * mt * t * ctrl[1] + t * t * tip[1]];
  };
  g.save();
  // primaries, longest at the tip, swept back toward the trailing side
  const n = 5;
  for (let i = n - 1; i >= 0; i--) {
    const t = 0.32 + (i / (n - 1)) * 0.68;
    const p = along(t);
    const fa = A + 34 + (1 - t) * 40;
    const fl = len * (0.42 + t * 0.5);
    const [fx, fy] = dirv(fa);
    const nx = -fy;
    const ny = fx;
    const fw = 2.4 * k;
    const ex = p[0] + fx * fl;
    const ey = p[1] + fy * fl;
    g.beginPath();
    g.moveTo(p[0] + nx * fw, p[1] + ny * fw);
    g.lineTo(ex + nx * fw * 0.8, ey + ny * fw * 0.8);
    g.lineTo(ex - fx * 1.6 * k, ey - fy * 1.6 * k); // notch
    g.lineTo(ex - nx * fw * 0.6, ey - ny * fw * 0.6);
    g.lineTo(p[0] - nx * fw, p[1] - ny * fw);
    g.closePath();
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    g.save();
    g.globalAlpha *= shade === 'cross' ? 0.85 : 0.6;
    g.fillStyle = P[shade === 'cross' ? 'cross' : 'hatch'];
    g.fill();
    g.restore();
    g.strokeStyle = ink;
    g.lineWidth = LW.detail;
    g.stroke();
    g.lineWidth = 0.6;
    line(g, p[0], p[1], p[0] + fx * fl * 0.9, p[1] + fy * fl * 0.9);
  }
  // covert row near the root (scalloped)
  g.beginPath();
  const c0 = along(0.05);
  g.moveTo(c0[0], c0[1]);
  for (let i = 1; i <= 4; i++) {
    const p = along(i / 4);
    const [fx, fy] = dirv(A + 70);
    const prev = along((i - 0.5) / 4);
    g.quadraticCurveTo(prev[0] + fx * 7 * k, prev[1] + fy * 7 * k, p[0], p[1]);
  }
  g.closePath();
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  g.fillStyle = P.dense;
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = LW.detail;
  g.stroke();
  // bony leading edge
  g.lineCap = 'round';
  g.strokeStyle = deepInk(ink);
  g.lineWidth = 2.2 * k;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(ctrl[0], ctrl[1], tip[0], tip[1]);
  g.stroke();
  g.strokeStyle = PAPER_LIGHT;
  g.lineWidth = 0.8 * k;
  g.stroke();
  g.restore();
}

function drawCaduceus(g, ink, hand, angDeg, k, flap, time) {
  const [dx, dy] = dirv(angDeg);
  const nx = -dy;
  const ny = dx;
  const below = 26 * k;
  const above = 46 * k;
  const b = [hand[0] - dx * below, hand[1] - dy * below];
  const t = [hand[0] + dx * above, hand[1] + dy * above];
  const P = inkPatterns(g, ink);
  g.save();
  // wings first (behind the snakes), V-shaped
  const wr = [hand[0] + dx * (above - 5 * k), hand[1] + dy * (above - 5 * k)];
  drawWing(g, ink, wr[0], wr[1], angDeg - 150, 15 * k, -flap * 10, 'cross', k * 0.7);
  drawWing(g, ink, wr[0], wr[1], angDeg + 150, 15 * k, flap * 10, 'hatch', k * 0.7);
  // rod (tapered)
  g.beginPath();
  capsulePath(g, b[0], b[1], t[0], t[1], 1.8 * k, 1.3 * k);
  engraveFill(g, ink, { pat: 'dense', patAlpha: 0.8, lw: LW.form });
  // two snakes, filled tapered bodies crossing twice, heads facing each other
  const snake = (side, near) => {
    const pts = [];
    const N = 26;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const along = lerp(-4 * k, above - 13 * k, s);
      const off = Math.sin(s * Math.PI * 2.5) * side * (4.6 - s * 0.6) * k;
      pts.push([hand[0] + dx * along + nx * off, hand[1] + dy * along + ny * off, s]);
    }
    // neck curls out and back toward the rod
    const neck = [hand[0] + dx * (above - 9 * k) + nx * side * 6.5 * k, hand[1] + dy * (above - 9 * k) + ny * side * 6.5 * k, 1.05];
    pts.push(neck);
    const width = (s) => (s < 0.5 ? lerp(1.0, 2.8, s / 0.5) : lerp(2.8, 2.1, (s - 0.5) / 0.55)) * k;
    const Lp = [];
    const Rp = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[Math.min(i + 1, pts.length - 1)];
      const o = pts[Math.max(i - 1, 0)];
      let tx = q[0] - o[0];
      let ty = q[1] - o[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const w = width(p[2]);
      Lp.push([p[0] - ty * w, p[1] + tx * w]);
      Rp.push([p[0] + ty * w, p[1] - tx * w]);
    }
    const path = (q) => {
      smoothThrough(q, Lp, true);
      smoothThrough(q, Rp.slice().reverse(), false);
      q.closePath();
    };
    g.beginPath();
    path(g);
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    g.fillStyle = near ? P.hatch : P.dense;
    g.globalAlpha *= near ? 0.7 : 0.9;
    g.fill();
    g.globalAlpha /= near ? 0.7 : 0.9;
    g.strokeStyle = ink;
    g.lineWidth = LW.detail;
    g.stroke();
    // head: almond facing across the rod
    const hx = neck[0] - nx * side * 1.2 * k + dx * 1.5 * k;
    const hy = neck[1] - ny * side * 1.2 * k + dy * 1.5 * k;
    const ha = Math.atan2(-ny * side, -nx * side) * 0.6 + Math.atan2(dy, dx) * 0.4;
    g.save();
    g.translate(hx, hy);
    g.rotate(ha);
    g.beginPath();
    g.moveTo(-2 * k, -1.6 * k);
    g.quadraticCurveTo(2.6 * k, -1.8 * k, 3.6 * k, 0);
    g.quadraticCurveTo(2.6 * k, 1.6 * k, -2 * k, 1.4 * k);
    g.closePath();
    engraveFill(g, ink, { pat: near ? 'hatch' : 'dense', patAlpha: 0.8, lw: LW.detail });
    g.fillStyle = deepInk(ink);
    g.beginPath();
    g.arc(1, -0.5 * k, 0.55 * k, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  snake(1, false);
  snake(-1, true);
  // knob
  g.beginPath();
  g.arc(t[0], t[1], 3.2 * k, 0, Math.PI * 2);
  engraveFill(g, ink, { pat: 'cross', patAlpha: 0.8, lw: LW.form });
  g.restore();
  void time;
  return t;
}

function drawHermesHead(g, ink, S, pose, wing, light) {
  const k = S.scale;
  const r = S.headR * k;
  const P = inkPatterns(g, ink);
  // far hat wing (behind)
  g.save();
  g.rotate(-0.1);
  drawWing(g, ink, -3 * k, -r - 1 * k, -150, 17 * k, wing * 22 - 6, 'cross', k * 0.85);
  g.restore();
  // hair mass at the nape
  g.beginPath();
  g.ellipse(-3 * k, 1.5 * k, r * 0.9, r * 0.95, 0, 0, Math.PI * 2);
  engraveFill(g, ink, { pat: 'dense', patAlpha: 0.85, lw: LW.form });
  // face profile: straight Greek nose, firm jaw
  const face = (q) => {
    q.moveTo(-1.5 * k, -r);
    q.quadraticCurveTo(4 * k, -r - 0.5 * k, 6 * k, -4.5 * k);
    q.lineTo(9.4 * k, 0.8 * k); // nose tip
    q.lineTo(7 * k, 1.6 * k);
    q.quadraticCurveTo(7.8 * k, 2.8 * k, 7 * k, 3.6 * k); // lips
    q.quadraticCurveTo(7.4 * k, 5.6 * k, 5.8 * k, 8.2 * k); // chin
    q.lineTo(-1.5 * k, 7 * k); // jaw corner
    q.quadraticCurveTo(-4 * k, 1 * k, -1.5 * k, -r);
    q.closePath();
  };
  g.beginPath();
  face(g);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  // shadow side of the face (away from light)
  const shadowRight = light[0] < 0;
  shadeRegion(g, ink, face, (q) => q.rect(shadowRight ? 2 * k : -6 * k, -r, 8 * k, 2 * r + 2 * k), 'cross', 0.65);
  g.beginPath();
  face(g);
  g.strokeStyle = ink;
  g.lineWidth = LW.form;
  g.stroke();
  g.save();
  g.strokeStyle = ink;
  g.fillStyle = deepInk(ink);
  // heavy brow with hatching beneath
  g.lineWidth = 1.2;
  line(g, 2.6 * k, -3.2 * k, 6.2 * k, -3.6 * k);
  g.lineWidth = 0.6;
  for (let i = 0; i < 3; i++) line(g, (3 + i * 1.1) * k, -2.8 * k, (3.6 + i * 1.1) * k, -2 * k);
  // almond eye
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(3.2 * k, -1.4 * k);
  g.quadraticCurveTo(4.6 * k, -2.2 * k, 6 * k, -1.2 * k);
  g.quadraticCurveTo(4.6 * k, -0.6 * k, 3.2 * k, -1.4 * k);
  g.stroke();
  g.beginPath();
  g.arc(5 * k, -1.35 * k, 0.6 * k, 0, Math.PI * 2);
  g.fill();
  // ear
  g.lineWidth = 0.9;
  g.beginPath();
  g.arc(-0.8 * k, 0.6 * k, 1.9 * k, -Math.PI * 0.6, Math.PI * 0.6);
  g.stroke();
  // curls along the temple and nape
  g.lineWidth = 0.8;
  for (const [cx, cy] of [[-6.5, -1], [-7, 3], [-5.5, 6.5], [-2.5, 8], [1, -5.5]]) spiral(g, cx * k, cy * k, 2 * k, 1.2, 1);
  g.restore();

  // petasos: rounded crown, broad brim
  g.save();
  g.rotate(-0.12);
  g.beginPath();
  g.ellipse(-0.5 * k, -r + 0.8 * k, 8 * k, 7.2 * k, 0, Math.PI, Math.PI * 2);
  g.closePath();
  engraveFill(g, ink, { pat: 'cross', patAlpha: 0.7, lw: LW.form });
  g.beginPath();
  g.ellipse(0.5 * k, -r + 1.4 * k, 14 * k, 3.2 * k, 0, 0, Math.PI * 2);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  engraveLines(g, ink, (q) => q.ellipse(0.5 * k, -r + 1.4 * k, 14 * k, 3.2 * k, 0, 0, Math.PI * 2), [-14 * k, -r - 2 * k, 15 * k, -r + 5 * k], 0, 1.6 * k, 0.4, 1, 0.9);
  g.beginPath();
  g.ellipse(0.5 * k, -r + 1.4 * k, 14 * k, 3.2 * k, 0, 0, Math.PI * 2);
  g.strokeStyle = ink;
  g.lineWidth = LW.form;
  g.stroke();
  g.fillStyle = P.dense;
  g.fillRect(-7.5 * k, -r - 0.8 * k, 15 * k, 1.6 * k);
  // near wing on the side of the crown, swept up and back
  drawWing(g, ink, -1 * k, -r - 1.5 * k, -150, 20 * k, wing * 24 - 8, 'hatch', k);
  g.restore();
}

// Chlamys cloak. Back part streams behind in world space; front part drapes the chest.
function cloakGeometry(sk, S, pose, opts) {
  const k = S.scale;
  const flare = clamp(pose.cloak + Math.abs(opts.vx || 0) * 0.04, 0, 1.5);
  const face = opts.face || 1;
  const vxl = (opts.vx || 0) * face;
  let tx = -0.38 - vxl * 0.06 - flare * 0.2;
  let ty = clamp(1 - (opts.vy || 0) * 0.08, -0.7, 1);
  const tl = Math.hypot(tx, ty);
  tx /= tl;
  ty /= tl;
  // counter-rotate so the cloak streams during flips
  if (pose.rot) {
    const a = -pose.rot * D2R;
    const rx = tx * Math.cos(a) - ty * Math.sin(a);
    const ry = tx * Math.sin(a) + ty * Math.cos(a);
    tx = rx;
    ty = ry;
  }
  const pin = [sk.sh[0] + sk.perp[0] * 7 * k + sk.td[0] * -1 * k, sk.sh[1] + sk.perp[1] * 7 * k + sk.td[1] * -1 * k];
  const backSh = [sk.sh[0] - sk.perp[0] * 10 * k, sk.sh[1] - sk.perp[1] * 10 * k + 1 * k];
  const len = (36 + flare * 8) * k;
  const hemC = [backSh[0] + tx * len, backSh[1] + ty * len];
  const perpT = [-ty, tx];
  const time = opts.time || 0;
  const hem = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const o = lerp(-12, 13, t) * k;
    const zig = (i % 2 ? 4 : -2) * k;
    const fl = Math.sin(time * 14 + i * 1.3) * 2.5 * k * Math.min(1, flare);
    hem.push([hemC[0] + perpT[0] * o + tx * (zig + fl), hemC[1] + perpT[1] * o + ty * (zig + fl)]);
  }
  return { pin, backSh, hem, tx, ty, perpT, k, flare };
}

function drawCloakBack(g, ink, C) {
  const P = inkPatterns(g, ink);
  const { pin, backSh, hem, k } = C;
  const outerStart = [backSh[0] - C.perpT[0] * 3 * k, backSh[1] - C.perpT[1] * 3 * k];
  const path = (q) => {
    q.moveTo(pin[0], pin[1]);
    q.quadraticCurveTo(backSh[0] + C.perpT[0] * -2 * k, backSh[1] - 6 * k, outerStart[0], outerStart[1]);
    const first = hem[0];
    q.quadraticCurveTo((outerStart[0] + first[0]) / 2 - C.perpT[0] * 5 * k, (outerStart[1] + first[1]) / 2 - C.perpT[1] * 5 * k, first[0], first[1]);
    for (let i = 1; i < hem.length; i++) q.lineTo(hem[i][0], hem[i][1]);
    const last = hem[hem.length - 1];
    q.quadraticCurveTo((last[0] + pin[0]) / 2 + C.perpT[0] * 4 * k, (last[1] + pin[1]) / 2 + C.perpT[1] * 4 * k, pin[0], pin[1] + 8 * k);
    q.closePath();
  };
  // silhouette
  g.beginPath();
  path(g);
  g.strokeStyle = deepInk(ink);
  g.lineWidth = LW.sil * 1.3;
  g.lineJoin = 'round';
  g.stroke();
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  // folds radiate from the pin, hatched along their length
  g.save();
  g.clip();
  g.strokeStyle = ink;
  for (let i = 0; i < hem.length; i++) {
    const h = hem[i];
    g.lineWidth = i % 2 ? 1.2 : 0.6;
    g.beginPath();
    g.moveTo(lerp(pin[0], backSh[0], 0.5), lerp(pin[1], backSh[1], 0.5));
    g.quadraticCurveTo(lerp(backSh[0], h[0], 0.5) + C.perpT[0] * 2 * k, lerp(backSh[1], h[1], 0.5), h[0], h[1]);
    g.stroke();
  }
  // inner side in deep shadow
  g.fillStyle = P.dense;
  g.beginPath();
  const last = hem[hem.length - 1];
  g.moveTo(pin[0], pin[1]);
  g.lineTo(last[0], last[1]);
  g.lineTo(hem[hem.length - 3][0], hem[hem.length - 3][1]);
  g.lineTo(lerp(pin[0], backSh[0], 0.6), lerp(pin[1], backSh[1], 0.6));
  g.closePath();
  g.fill();
  g.fillStyle = P.cross;
  g.globalAlpha = 0.6;
  g.fillRect(-200, -200, 400, 400);
  g.restore();
  g.beginPath();
  path(g);
  g.strokeStyle = ink;
  g.lineWidth = LW.form;
  g.stroke();
}

function drawCloakFront(g, ink, C, sk) {
  const { pin, backSh, k } = C;
  // a band of cloth from the pin across the chest to the back shoulder
  const mid = [lerp(pin[0], backSh[0], 0.5) + sk.td[0] * -6 * k, lerp(pin[1], backSh[1], 0.5) + 7 * k];
  const path = (q) => {
    q.moveTo(pin[0], pin[1] - 2 * k);
    q.quadraticCurveTo(mid[0], mid[1] - 4 * k, backSh[0], backSh[1] - 1 * k);
    q.lineTo(backSh[0] + 1 * k, backSh[1] + 5 * k);
    q.quadraticCurveTo(mid[0], mid[1] + 4 * k, pin[0], pin[1] + 3 * k);
    q.closePath();
  };
  g.beginPath();
  path(g);
  engraveFill(g, ink, { pat: 'cross', patAlpha: 0.7, lw: LW.form });
  g.save();
  g.strokeStyle = ink;
  g.lineWidth = 0.7;
  for (const f of [0.35, 0.65]) {
    g.beginPath();
    g.moveTo(pin[0], pin[1] + (f - 0.5) * 4 * k);
    g.quadraticCurveTo(mid[0], mid[1] + (f - 0.5) * 8 * k, backSh[0], backSh[1] + (f * 5 - 1) * k);
    g.stroke();
  }
  g.restore();
  // round fibula pin
  g.beginPath();
  g.arc(pin[0], pin[1], 2.6 * k, 0, Math.PI * 2);
  engraveFill(g, ink, { pat: 'dense', patAlpha: 0.9, lw: LW.form });
  g.fillStyle = PAPER_LIGHT;
  g.beginPath();
  g.arc(pin[0] - 0.8 * k, pin[1] - 0.8 * k, 0.8 * k, 0, Math.PI * 2);
  g.fill();
}

function skirtPath(sk, S, pose) {
  const k = S.scale;
  const lean = pose.lean * D2R;
  const wb = [-7.5 * k * Math.cos(lean), -2 * k];
  const wf = [8 * k * Math.cos(lean), -2 * k];
  const hb = sk.legB.k;
  const hf = sk.legF.k;
  const hemB = [lerp(0, hb[0], 0.62) - 8 * k, lerp(0, hb[1], 0.62) + 2 * k];
  const hemF = [lerp(0, hf[0], 0.62) + 8 * k, lerp(0, hf[1], 0.62) + 2 * k];
  const path = (q) => {
    q.moveTo(wb[0], wb[1]);
    q.lineTo(wf[0], wf[1]);
    q.quadraticCurveTo(wf[0] + 4 * k, (wf[1] + hemF[1]) / 2, hemF[0], hemF[1]);
    const n = 5;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = lerp(hemF[0], hemB[0], t);
      const y = lerp(hemF[1], hemB[1], t);
      const mx = lerp(hemF[0], hemB[0], t - 0.5 / n);
      const my = lerp(hemF[1], hemB[1], t - 0.5 / n) + 3 * k;
      q.quadraticCurveTo(mx, my, x, y);
    }
    q.quadraticCurveTo(wb[0] - 4 * k, (wb[1] + hemB[1]) / 2, wb[0], wb[1]);
    q.closePath();
  };
  return { path, wb, wf, hemB, hemF };
}

// Solve a pose into placed joints. Local "feet space": origin at the feet
// point, facing +x, y down, rotation and offsets applied, scale applied.
function hermesFrame(pose, S) {
  const k = S.scale;
  const sk = skeleton(pose, S);
  // ground the figure: blend between lowest-foot grounding and a fixed hip height
  const dyGround = -Math.max(sk.legB.f[1], sk.legF.f[1]) - shapeOr(S, 'sole', 3) * k - (pose.lift || 0) * k;
  const dyAir = -(S.thigh + S.shin) * k * 0.9;
  const air = clamp(pose.air || 0, 0, 1);
  const dy = lerp(dyGround, dyAir, smoothstep(0, 1, air)) + (pose.oy || 0) * k;
  const dx = (pose.ox || 0) * k;
  const pivot = [(sk.hip[0] + sk.sh[0] + sk.legF.k[0]) / 3 + dx, (sk.hip[1] + sk.sh[1] + sk.legF.k[1]) / 3 + dy];
  const a = (pose.rot || 0) * D2R;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const toLocal = (p) => {
    const px = p[0] + dx;
    const py = p[1] + dy;
    if (!a) return [px, py];
    const rx = px - pivot[0];
    const ry = py - pivot[1];
    return [rx * ca - ry * sa + pivot[0], rx * sa + ry * ca + pivot[1]];
  };
  const wAng = sk.armF.ang + pose.wpn;
  const wd = dirv(wAng);
  const tipLen = shapeOr(S, 'staffTip', 46) * k;
  const buttLen = shapeOr(S, 'staffButt', 26) * k;
  const tipL = [sk.armF.h[0] + wd[0] * tipLen, sk.armF.h[1] + wd[1] * tipLen];
  const buttL = [sk.armF.h[0] - wd[0] * buttLen, sk.armF.h[1] - wd[1] * buttLen];
  const J = {
    hip: toLocal(sk.hip), sh: toLocal(sk.sh), head: toLocal(sk.head),
    top: toLocal([sk.head[0], sk.head[1] - (S.headR + shapeOr(S, 'crown', 14)) * k]),
    handF: toLocal(sk.armF.h), handB: toLocal(sk.armB.h), elbowF: toLocal(sk.armF.e), elbowB: toLocal(sk.armB.e),
    footF: toLocal(sk.legF.f), footB: toLocal(sk.legB.f), kneeF: toLocal(sk.legF.k), kneeB: toLocal(sk.legB.k),
    tip: toLocal(tipL), butt: toLocal(buttL), mid: toLocal([(tipL[0] + buttL[0]) / 2, (tipL[1] + buttL[1]) / 2]),
    center: toLocal([(sk.hip[0] + sk.sh[0]) / 2, (sk.hip[1] + sk.sh[1]) / 2]),
    pivot: [pivot[0], pivot[1]],
    k,
  };
  return { sk, dx, dy, pivot, J, toLocal };
}

// Draw a full Hermes figure. (x, y) = feet in world space.
// Returns { tip, top } in world space and J (joints in local feet space).
function drawHermes(g, pose, x, y, opts) {
  const ink = opts.ink || INK.blue;
  const deep = deepInk(ink);
  const S = Object.assign({}, HERMES_SHAPE, { scale: opts.scale || 1 });
  const k = S.scale;
  const face = opts.face || 1;
  const FR = hermesFrame(pose, S);
  const sk = FR.sk;
  const light = (() => {
    const lx = -face;
    const ly = -1.2;
    const l = Math.hypot(lx, ly);
    return [lx / l, ly / l];
  })();
  const dy = FR.dy;
  const pivot = FR.pivot;
  if (pose.fade >= 0.999) return { tip: [x + FR.J.tip[0] * face, y + FR.J.tip[1]], top: [x + FR.J.top[0] * face, y + FR.J.top[1]], J: FR.J };

  g.save();
  g.translate(x, y);
  g.scale(face, 1);
  if (pose.rot) {
    g.translate(pivot[0], pivot[1]);
    g.rotate(pose.rot * D2R);
    g.translate(-pivot[0], -pivot[1]);
  }
  g.translate(FR.dx, dy);
  if (opts.alpha != null) g.globalAlpha *= opts.alpha;
  if (pose.fade > 0) g.globalAlpha *= 1 - pose.fade;
  const wing = pose.wing;

  const legB = limbOutline(sk.legB.h, sk.legB.k, sk.legB.f, LEG_PROF, k);
  const legF = limbOutline(sk.legF.h, sk.legF.k, sk.legF.f, LEG_PROF, k);
  const armB = limbOutline(sk.armB.s, sk.armB.e, sk.armB.h, ARM_PROF, k);
  const armF = limbOutline(sk.armF.s, sk.armF.e, sk.armF.h, ARM_PROF, k);
  const T = S.torso * k;
  const torso = torsoPath(k, T);
  const skirt = skirtPath(sk, S, pose);
  const C = cloakGeometry(sk, S, pose, opts);
  const inTorso = (fn) => {
    g.save();
    g.rotate(pose.lean * D2R);
    fn();
    g.restore();
  };

  // 1) cloak behind everything
  drawCloakBack(g, ink, C);

  // 2) silhouette pass: heavy outline of the body mass
  g.save();
  g.strokeStyle = deep;
  g.lineWidth = LW.sil * 1.3;
  g.lineJoin = 'round';
  for (const L of [armB, legB, legF, armF]) {
    g.beginPath();
    L.path(g);
    g.stroke();
  }
  g.beginPath();
  skirt.path(g);
  g.stroke();
  inTorso(() => {
    g.beginPath();
    torso(g);
    g.stroke();
  });
  g.restore();

  // 3) back limbs (darker)
  const limbFill = (L, dark) => {
    g.beginPath();
    L.path(g);
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    hatchLimb(g, ink, L, light, k, dark);
    g.save();
    g.globalAlpha *= 0.32;
    g.fillStyle = inkPatterns(g, ink).fine;
    g.beginPath();
    L.path(g);
    g.fill();
    g.restore();
    if (dark > 0.8) {
      g.save();
      g.beginPath();
      L.path(g);
      g.globalAlpha *= 0.55;
      g.fillStyle = inkPatterns(g, ink).hatch;
      g.fill();
      g.restore();
    }
    g.beginPath();
    L.path(g);
    g.strokeStyle = ink;
    g.lineWidth = LW.form;
    g.stroke();
  };
  limbFill(armB, 1);
  drawHand(g, ink, sk.armB.h, sk.armB.ang, pose.handB, k, 'cross');
  limbFill(legB, 1);
  drawFoot(g, ink, sk.legB, 'cross', wing, k);

  // 4) torso with contour hatching
  inTorso(() => {
    g.beginPath();
    torso(g);
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    const shadowX = light[0] < 0 ? 1 : -1;
    g.save();
    g.beginPath();
    torso(g);
    g.clip();
    g.strokeStyle = ink;
    for (let yy = -T + 2 * k; yy < 0; yy += 2.3 * k) {
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(shadowX * 1 * k, yy);
      g.quadraticCurveTo(shadowX * 8 * k, yy + 1.4 * k, shadowX * 16 * k, yy - 0.5 * k);
      g.stroke();
    }
    g.fillStyle = inkPatterns(g, ink).dense;
    g.fillRect(shadowX > 0 ? 8 * k : -16 * k, -T - 3 * k, 8 * k, T + 6 * k);
    g.globalAlpha *= 0.3;
    g.fillStyle = inkPatterns(g, ink).fine;
    g.fillRect(-20 * k, -T - 4 * k, 40 * k, T + 8 * k);
    g.restore();
    g.beginPath();
    torso(g);
    g.strokeStyle = ink;
    g.lineWidth = LW.form;
    g.stroke();
    // anatomy lines: pectoral, abdomen, chiton strap
    g.strokeStyle = ink;
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(12 * k, -T + 11 * k);
    g.quadraticCurveTo(7 * k, -T + 16 * k, 2 * k, -T + 15 * k);
    g.stroke();
    g.lineWidth = 0.7;
    for (const f of [0.45, 0.3]) {
      g.beginPath();
      g.moveTo(9.5 * k, -T * f);
      g.quadraticCurveTo(6 * k, -T * f + 2 * k, 2.5 * k, -T * f + 1 * k);
      g.stroke();
    }
    // belt
    g.beginPath();
    g.rect(-7.5 * k, -4.5 * k, 16 * k, 4 * k);
    engraveFill(g, ink, { pat: 'dense', patAlpha: 0.85, lw: LW.form });
  });

  // 5) skirt (chiton)
  g.beginPath();
  skirt.path(g);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  engraveLines(g, ink, skirt.path, [skirt.hemB[0] - 4 * k, -4 * k, skirt.hemF[0] + 4 * k, Math.max(skirt.hemB[1], skirt.hemF[1]) + 4 * k], 90, 2.2 * k, 0.5, 0.9, 0.55);
  shadeRegion(g, ink, skirt.path, (q) => q.rect(light[0] < 0 ? 2 * k : -40 * k, -6 * k, 38 * k, 50 * k), 'cross', 0.7);
  g.beginPath();
  skirt.path(g);
  g.strokeStyle = ink;
  g.lineWidth = LW.form;
  g.stroke();
  g.save();
  g.strokeStyle = ink;
  g.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    line(g, lerp(skirt.wb[0], skirt.wf[0], t), skirt.wb[1] + 2 * k, lerp(skirt.hemB[0], skirt.hemF[0], t), lerp(skirt.hemB[1], skirt.hemF[1], t) - 1 * k);
  }
  g.restore();

  // 6) front leg
  limbFill(legF, 0.5);
  drawFoot(g, ink, sk.legF, 'hatch', wing, k);

  // 7) head
  const neckTop = [lerp(sk.sh[0], sk.head[0], 0.75), lerp(sk.sh[1], sk.head[1], 0.75)];
  g.beginPath();
  capsulePath(g, sk.sh[0], sk.sh[1], neckTop[0], neckTop[1], 3.8 * k, 3.2 * k);
  engraveFill(g, ink, { pat: 'hatch', patAlpha: 0.6, lw: LW.form });
  g.save();
  g.translate(sk.head[0], sk.head[1]);
  g.rotate((pose.lean * 0.4 + pose.head) * D2R);
  drawHermesHead(g, ink, S, pose, wing, light);
  g.restore();

  // 8) cloak drape over the chest
  drawCloakFront(g, ink, C, sk);

  // 9) caduceus, front arm, deltoid, gripping hand
  if (pose.wpnShow > 0.5) drawCaduceus(g, ink, sk.armF.h, sk.armF.ang + pose.wpn, k, wing, opts.time || 0);
  limbFill(armF, 0.4);
  g.beginPath();
  g.ellipse(sk.armF.s[0] + dirv(sk.armF.ang1)[0] * 3 * k, sk.armF.s[1] + dirv(sk.armF.ang1)[1] * 3 * k, 5.6 * k, 4.6 * k, (90 - sk.armF.ang1) * -D2R, 0, Math.PI * 2);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = inkPatterns(g, ink).hatch;
  g.globalAlpha = 0.6;
  g.fillRect(sk.armF.s[0] - 8 * k, sk.armF.s[1], 16 * k, 10 * k);
  g.restore();
  g.strokeStyle = ink;
  g.lineWidth = LW.form;
  g.stroke();
  drawHand(g, ink, sk.armF.h, sk.armF.ang, pose.handF, k, 'hatch');
  g.restore();

  const J = FR.J;
  return { tip: [x + J.tip[0] * face, y + J.tip[1]], top: [x + J.top[0] * face, y + J.top[1]], J };
}

// Sandalled foot with a heel wing (talaria).
function drawFoot(g, ink, leg, shade, wing, k) {
  const [ax, ay] = leg.f;
  const tilt = clamp(leg.ang * 0.35, -35, 50);
  const fd = dirv(90 + tilt);
  const toe = [ax + fd[0] * 11 * k, ay + fd[1] * 11 * k + 2 * k];
  const heel = [ax - fd[0] * 3.5 * k, ay - fd[1] * 3.5 * k + 2.8 * k];
  drawWing(g, ink, ax - 2 * k, ay - 4 * k, -128, 12 * k, -wing * 14, shade, k * 0.7);
  g.beginPath();
  g.moveTo(heel[0], heel[1]);
  g.quadraticCurveTo(ax - 1.5 * k, ay - 3.5 * k, ax + fd[0] * 3 * k, ay - 1.8 * k);
  g.quadraticCurveTo(toe[0] - 2 * k, toe[1] - 4.5 * k, toe[0], toe[1]);
  g.lineTo(heel[0], heel[1] + 1.4 * k);
  g.closePath();
  engraveFill(g, ink, { pat: shade, patAlpha: 0.7, lw: LW.form });
  g.save();
  g.strokeStyle = deepInk(ink);
  g.lineWidth = 1.6;
  line(g, heel[0], heel[1] + 1.4 * k, toe[0], toe[1]);
  g.strokeStyle = ink;
  g.lineWidth = 0.9;
  line(g, ax - 3 * k, ay - 3 * k, ax + 2.5 * k, ay - 1 * k);
  line(g, ax - 2.5 * k, ay - 6.5 * k, ax + 2.5 * k, ay - 5 * k);
  g.restore();
}
