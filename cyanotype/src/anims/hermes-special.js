// Hermes — special moves.
//
// Grounded keys plant the feet with the same two-bone leg IK as the stand
// file: hx/hh are the hip position and bx/bh, fx/fh the back and front feet
// (x in feet space, h above the floor), all in figure units. 'sa' is an
// absolute caduceus angle (dirv degrees). Moves that change mode (a planted
// coil into a flying dash, a crouch into a rocket rise) key each mode on its
// own and cross-fade the finished poses.
(() => {
  const SH = HERMES_SHAPE;

  // ---- feet, hips and keyed poses ----------------------------------------------------------
  const fk = (l1, l2, side) => {
    const a = dirv(l1);
    const b = dirv(l1 + l2);
    return [side * 4 + a[0] * SH.thigh + b[0] * SH.shin, a[1] * SH.thigh + b[1] * SH.shin];
  };
  const nB = fk(BASE_POSE.ll1, BASE_POSE.ll2, -1);
  const nF = fk(BASE_POSE.rl1, BASE_POSE.rl2, 1);
  const H0 = Math.max(nB[1], nF[1]);
  const NEUT = { hx: 0, hh: H0, bx: nB[0], bh: H0 - nB[1], fx: nF[0], fh: H0 - nF[1] };
  const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
  function ik(dx, dy) {
    const T = SH.thigh;
    const S = SH.shin;
    const L = clamp(Math.hypot(dx, dy), Math.abs(T - S) + 2, T + S - 0.05);
    const a = Math.atan2(dx, dy) / D2R;
    const alpha = Math.acos(clamp((T * T + L * L - S * S) / (2 * T * L), -1, 1)) / D2R;
    const l1 = a + alpha;
    const kn = dirv(l1);
    const ft = dirv(a);
    const sh = Math.atan2(ft[0] * L - kn[0] * T, ft[1] * L - kn[1] * T) / D2R;
    return [l1, wrap(sh - l1)];
  }
  const TRACK = ['hx', 'hh', 'bx', 'bh', 'fx', 'fh'];
  function plant(p) {
    const [ll1, ll2] = ik(p.bx - p.hx + 4, p.hh - p.bh);
    const [rl1, rl2] = ik(p.fx - p.hx - 4, p.hh - p.fh);
    Object.assign(p, { ll1, ll2, rl1, rl2 });
    p.ox = (p.ox || 0) + p.hx;
    p.lift = (p.lift || 0) + Math.min(p.bh, p.fh);
    for (const k of TRACK) delete p[k];
    return p;
  }
  function fin(p) {
    if (p.sa != null) p.wpn = p.sa - (p.lean + p.ra1 + p.ra2);
    delete p.sa;
    if ('hh' in p) plant(p);
    p.rot = wrap(p.rot || 0);
    return p;
  }
  function seq(base, keys) {
    const full = keys.map(([t, p, e]) => [t, Object.assign({}, base, p), EASE[e || 'inOut']]);
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
  const IDLE_SA = BASE_POSE.lean + BASE_POSE.ra1 + BASE_POSE.ra2 + BASE_POSE.wpn;
  const GROUND = Object.assign({}, BASE_POSE, NEUT, { sa: IDLE_SA });
  for (const k of ['ll1', 'll2', 'rl1', 'rl2']) delete GROUND[k];
  function fallPose(f) {
    const ph = (f / 30) * Math.PI * 2;
    return Object.assign({}, BASE_POSE, {
      air: 1,
      lean: 2 + 1.5 * Math.sin(ph - 0.4),
      head: 5 + 2 * Math.sin(ph - 0.9),
      la1: -98 + 7 * Math.sin(ph),
      la2: 18 + 7 * Math.sin(ph - 0.8),
      ra1: 72 + 5 * Math.sin(ph + 0.5),
      ra2: 34 + 4 * Math.sin(ph - 0.3),
      sa: 150 + 5 * Math.sin(ph - 0.5),
      ll1: -8 + 5 * Math.sin(ph + 1),
      ll2: -36 + 6 * Math.sin(ph + 0.4),
      rl1: 32 + 6 * Math.sin(ph + 2),
      rl2: -60 + 7 * Math.sin(ph + 1.4),
      handB: 1,
      wing: 0.7 + 0.35 * Math.sin(3 * ph),
      cloak: 0.85 + 0.1 * Math.sin(ph + 1),
    });
  }
  const AIRN = fallPose(0);
  const groundSeq = (keys) => {
    const s = seq(GROUND, keys);
    return (f) => fin(s(f));
  };
  const airSeq = (keys) => {
    const s = seq(AIRN, keys);
    return (f) => fin(s(f));
  };
  const settle = (f, f0, amp, period, decay) => (f < f0 ? 0 : amp * Math.exp(-(f - f0) / decay) * Math.sin(((f - f0) / period) * Math.PI * 2));
  const win = (f, a, b) => f >= a && f <= b;
  const fade01 = (f, a, b) => clamp((f - a) / (b - a), 0, 1);
  // finished poses cross-faded (angles are already unwrapped and close)
  const blend = (a, b, t) => (t <= 0 ? a : t >= 1 ? b : mixPose(a, b, t));

  // two-bone arm IK for the back hand onto a point in hip space (figure units),
  // elbow hanging below the line from shoulder to hand
  function reachBack(p, target) {
    const sk = skeleton(p, Object.assign({}, SH, { scale: 1 }));
    const s = sk.armB.s;
    const U = SH.upper;
    const F = SH.fore;
    const dx = target[0] - s[0];
    const dy = target[1] - s[1];
    const L = clamp(Math.hypot(dx, dy), Math.abs(U - F) + 1, U + F - 0.1);
    const base = Math.atan2(dx, dy) / D2R;
    const alpha = Math.acos(clamp((U * U + L * L - F * F) / (2 * U * L), -1, 1)) / D2R;
    const a1 = base - alpha;
    const e = [s[0] + dirv(a1)[0] * U, s[1] + dirv(a1)[1] * U];
    const a2 = Math.atan2(target[0] - e[0], target[1] - e[1]) / D2R;
    return { la1: wrap(a1 - p.lean), la2: wrap(a2 - a1) };
  }

  // ---- effects -------------------------------------------------------------------------
  function trail(c, keys, from, span, step, w) {
    const pts = [];
    const a = Math.max(from, c.f - span);
    const ww = w == null ? 1 : w;
    for (let fr = a; fr <= c.f + 1e-6; fr += step) {
      const J = c.sample(fr);
      const o = J[keys[0]];
      const i = J[keys[1]];
      pts.push([o, [lerp(o[0], i[0], ww), lerp(o[1], i[1], ww)]]);
    }
    return pts;
  }
  function smear(g, c, f, outer, inner, from, to, span, alpha, w) {
    if (f < from || f > to + 2) return;
    const a = (alpha == null ? 1 : alpha) * (f > to ? 1 - (f - to) / 3 : 1);
    fxCrescent(g, c.ink, trail(c, [outer, inner], from - 1, span, 0.1, w), a);
  }
  function spark(g, c, f, f0, at, r) {
    if (f < f0 || f > f0 + 6) return;
    fxSpark(g, c.ink, at[0], at[1], r * c.k, (f - f0) / 7, 1);
  }
  // feathers flung out from a point (t: 0..1 through the burst)
  function featherBurst(g, c, at, t, n, R, seed) {
    if (t < 0 || t > 1) return;
    const rnd = mulberry32(seed);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
      const d = R * (0.3 + 0.7 * Math.sqrt(t)) * (0.7 + rnd() * 0.5);
      const x = at[0] + Math.cos(a) * d;
      const y = at[1] + Math.sin(a) * d * 0.8 + 10 * c.k * t * t;
      fxFeather(g, c.ink, x, y, (a / D2R) * -1 + 90 + t * 160 * (i % 2 ? 1 : -1), (6 + rnd() * 3) * c.k, 1 - t * t);
    }
  }

  // ---- Zephyr Letter: the flick ------------------------------------------------------------
  // upper body keys shared by the grounded and the aerial version
  const N_UP = [
    [0, {}],
    [7, { lean: -8, head: -4, ra1: 150, ra2: 40, sa: 222, la1: 46, la2: 44, handB: 1, wing: 0.6, cloak: 0.5 }],
    [10, { lean: -11, head: -6, ra1: 162, ra2: 36, sa: 240, la1: 56, la2: 40, handB: 1, wing: 0.4, cloak: 0.45 }],
    [12, { lean: 16, head: 4, ra1: 92, ra2: 2, sa: 108, la1: -62, la2: 22, handB: 1, wing: 1.1, cloak: 1 }, 'out'],
    [14, { lean: 17, head: 5, ra1: 88, ra2: 0, sa: 92, la1: -66, la2: 22, handB: 1, wing: 1.2, cloak: 1.05 }],
    [22, { lean: 13, head: 4, ra1: 80, ra2: 10, sa: 100, la1: -50, la2: 24, handB: 1, wing: 0.8, cloak: 0.9 }],
    [40, {}],
  ];
  const withLegs = (up, legs) => up.map(([t, p, e], i) => [t, Object.assign({}, p, legs[i]), e]);
  const nGround = groundSeq(withLegs(N_UP, [
    {},
    { hx: -3, hh: H0 - 3 },
    { hx: -4.5, hh: H0 - 4 },
    { hx: 5, hh: H0 - 5 },
    { hx: 5.5, hh: H0 - 5 },
    { hx: 4, hh: H0 - 4 },
    {},
  ]));
  const nAir = airSeq(withLegs(N_UP.map(([t, p, e]) => [t, Object.assign({}, p, t === 0 || t === 40 ? {} : { handB: 1 }), e]), [
    {},
    { ll1: 26, ll2: -84, rl1: 62, rl2: -96 },
    { ll1: 32, ll2: -92, rl1: 70, rl2: -104 },
    { ll1: -34, ll2: -30, rl1: 30, rl2: -64 },
    { ll1: -38, ll2: -28, rl1: 26, rl2: -62 },
    { ll1: -22, ll2: -34, rl1: 30, rl2: -62 },
    {},
  ]));
  function nOverlap(p, f) {
    if (f > 7 && f < 11) p.wpn += 1.2 * Math.sin(f * 2.9);
    p.wing += settle(f, 14, 0.35, 8, 7);
    p.cloak += settle(f, 13, 0.15, 10, 9);
    return p;
  }
  function nFx(g, f, c) {
    smear(g, c, f, 'tip', 'handF', 11, 13, 2, 0.95);
    const J = c.J;
    if (win(f, 12, 22)) {
      // a puff of wind leaves the knob as the letter is released
      const t = (f - 12) / 10;
      fxGust(g, c.ink, J.tip[0] + 6 * c.k * t, J.tip[1], (8 + 10 * t) * c.k, -t * 3, (1 - t) * 0.9);
      fxSpeedLines(g, c.ink, [J.tip[0] + (4 + 18 * t) * c.k, J.tip[1]], [1, 0], 16 * c.k, 12 * c.k, 3, (1 - t) * 0.8, c.rnd);
    }
  }
  const N_SPAWN = { f: 14, anim: 'proj_letter', at: 'tip', vx: 8, life: 70 };

  // ---- the winged letter (projectile) -------------------------------------------------------
  function drawLetter(g, ink, f, k0) {
    const k = k0 * 1.25;
    const ph = (f / 24) * Math.PI * 2;
    const P = inkPatterns(g, ink);
    const flap = Math.sin(ph * 2);
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // wind trail: wavy engraved lines streaming behind, flowing with the loop
    g.strokeStyle = ink;
    for (let j = 0; j < 3; j++) {
      const yo = (j - 1) * 4.5 * k;
      g.lineWidth = j === 1 ? 1.4 : 0.8;
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const s = i / 24;
        const x = -13 * k - s * 52 * k;
        const y = yo * (1 + s * 0.8) + Math.sin(s * 9 - ph * 2 + j * 1.7) * 2.2 * k * s;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.globalAlpha = 0.85;
      g.stroke();
    }
    g.globalAlpha = 1;
    // little eddies shed into the trail (two, phase-shifted so the loop is seamless)
    for (let i = 0; i < 2; i++) {
      const u = ((f / 24 + i * 0.5) % 1);
      fxGust(g, ink, -22 * k - u * 36 * k, (i ? 3 : -3) * k, (3.5 + u * 3) * k, ph * 2 + i * 3, (1 - u) * 0.75);
    }
    // gentle bob and pitch with the wingbeat
    g.translate(0, -flap * 1.4 * k);
    g.rotate((-6 + 4 * Math.sin(ph * 2 + 1.2)) * D2R);
    const A = -140 + 34 * flap;
    // far wing
    drawWing(g, ink, 1.5 * k, -4.5 * k, A - 26, 15 * k, 0, 'cross', k * 0.62);
    // the rolled scroll: a cylinder with a curled edge and a sealed ribbon
    const L = 12 * k;
    const R = 4.6 * k;
    g.beginPath();
    g.moveTo(-L, -R);
    g.lineTo(L, -R);
    g.ellipse(L, 0, 2 * k, R, 0, -Math.PI / 2, Math.PI / 2);
    g.lineTo(-L, R);
    g.ellipse(-L, 0, 2 * k, R, 0, Math.PI / 2, Math.PI * 1.5);
    g.closePath();
    engraveFill(g, ink, { pat: 'fine', patAlpha: 0.5, lw: 1.4 });
    // shading along the underside
    g.save();
    g.clip();
    g.fillStyle = P.hatch;
    g.globalAlpha = 0.8;
    g.fillRect(-L - 3 * k, R * 0.2, 2 * L + 6 * k, R);
    g.restore();
    // rolled end with its spiral
    g.beginPath();
    g.ellipse(L, 0, 2 * k, R, 0, 0, Math.PI * 2);
    engraveFill(g, ink, { lw: 1.2 });
    g.strokeStyle = ink;
    g.lineWidth = 0.7;
    spiral(g, L, 0, R * 0.8, 1.6, 1);
    // loose edge of the sheet curling under
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-L * 0.6, R);
    g.quadraticCurveTo(-L * 0.2, R + 2.4 * k, L * 0.3, R + 1.2 * k);
    g.stroke();
    // a few written lines
    g.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) line(g, -L * 0.75, (-2 + i * 1.6) * k, L * (0.1 + 0.2 * (i % 2)), (-2 + i * 1.6) * k);
    // ribbon and wax seal
    g.beginPath();
    g.rect(2.5 * k, -R - 0.3 * k, 2.4 * k, 2 * R + 0.6 * k);
    engraveFill(g, ink, { pat: 'dense', patAlpha: 0.8, lw: 1 });
    g.beginPath();
    g.moveTo(3.7 * k, R);
    g.lineTo(1.2 * k, R + 4.5 * k + flap * 0.8 * k);
    g.moveTo(3.7 * k, R);
    g.lineTo(6.2 * k, R + 4 * k - flap * 0.8 * k);
    g.lineWidth = 1.2;
    g.stroke();
    g.beginPath();
    g.arc(3.7 * k, 0.6 * k, 2.3 * k, 0, Math.PI * 2);
    engraveFill(g, ink, { pat: 'cross', patAlpha: 0.9, lw: 1.1 });
    // near wing
    drawWing(g, ink, 0, -4 * k, A, 17 * k, 0, 'hatch', k * 0.7);
    g.restore();
  }

  // ---- Swift Courier: the wind dash -----------------------------------------------------------
  const S_COIL = { hx: -7, hh: H0 - 14, lean: 38, head: -20, ra1: 26, ra2: 34, sa: 98, la1: -104, la2: 22, handB: 1, wing: 1.4, cloak: 0.55 };
  const S_SKID = { fx: NEUT.fx + 12, bx: NEUT.bx - 3, hx: -3, hh: H0 - 9, lean: -16, head: 8, ra1: 36, ra2: 40, sa: 160, la1: -82, la2: 20, handB: 1, wing: 1.1, cloak: 1.3 };
  const sGround = groundSeq([
    [0, {}],
    [5, Object.assign({}, S_COIL, { hx: -6, hh: H0 - 12.5, lean: 34, head: -17, ra1: 22, ra2: 38, sa: 100, la1: -96, wing: 1.2, cloak: 0.6 })],
    [7, S_COIL],
    [18, S_COIL],
    [20, S_SKID, 'out'],
    [26, Object.assign({}, S_SKID, { hx: -2, hh: H0 - 7.5, lean: -12, head: 6, ra1: 34, ra2: 46, sa: 156, la1: -70, wing: 0.9, cloak: 1.15 })],
    [32, { fx: NEUT.fx + 5, fh: NEUT.fh + 4, bx: NEUT.bx - 1, hx: -1, hh: H0 - 3, lean: 0, head: 3, ra1: 30, ra2: 52, sa: IDLE_SA + 10, la1: -30, la2: 24, handB: 1, wing: 0.6, cloak: 0.6 }],
    [38, {}],
  ]);
  const sDash = (f) => fin(Object.assign({}, BASE_POSE, {
    air: 1, oy: -4, fade: 0.68,
    lean: 60 + 2 * Math.sin(f * 1.7), head: -36,
    ra1: 58, ra2: 8, sa: 94, handF: 0,
    la1: -152, la2: 8, handB: 1,
    ll1: -66 + 4 * Math.sin(f * 2.1), ll2: -16, rl1: -36 - 4 * Math.sin(f * 2.1), rl2: -54,
    wing: 1.3 + 0.4 * Math.sin(f * 2.6), cloak: 1.5,
  }));
  const sDashW = (f) => smoothstep(7, 8.4, f) * (1 - smoothstep(18, 20, f));
  const sMotion = (f) => {
    if (f < 8) return { vx: 0, grav: 0.3 };
    if (f <= 18) return { vx: 22, vy: 0, grav: 0 };
    if (f <= 30) return { vx: 2 };
    return null;
  };
  // horizontal distance (local px) travelled from frame a to frame b
  const sDist = (a, b) => {
    let d = 0;
    for (let i = Math.ceil(a); i < b; i++) d += (sMotion(i) || {}).vx || 0;
    return d;
  };

  // ---- Talaria Rise -----------------------------------------------------------------------------
  const uCrouch = groundSeq([
    [0, {}],
    [4, { hx: -1, hh: H0 - 12, lean: 18, head: -8, ra1: 16, ra2: 52, sa: 150, la1: -24, la2: 40, handB: 1, wing: 1.2, cloak: 0.5 }],
    [6, { hx: -1, hh: H0 - 13, lean: 20, head: -10, ra1: 12, ra2: 54, sa: 148, la1: -28, la2: 40, handB: 1, wing: 1.3, cloak: 0.45 }],
  ]);
  const U_RISE = { lean: -4, head: -16, ra1: 172, ra2: 4, sa: 184, la1: -8, la2: 14, handB: 1, ll1: -5, ll2: -8, rl1: 8, rl2: -14, wing: 1.5, cloak: 1.45 };
  const U_HELP = { rot: -10, lean: -6, head: -20, la1: -150, la2: 40, ra1: 108, ra2: 28, sa: 18, ll1: 18, ll2: -58, rl1: 38, rl2: -72, handB: 1, handF: 0, wing: -0.55, cloak: 0.55 };
  const uRise = airSeq([
    [5, Object.assign({}, U_RISE, { lean: 10, head: -10, ra1: 120, sa: 160, ll1: 10, ll2: -40, rl1: 30, rl2: -60 })],
    [8, U_RISE, 'out'],
    [22, Object.assign({}, U_RISE, { lean: -2, head: -18, ra1: 168, sa: 180, rl1: 12, rl2: -20 })],
    [24, { lean: -8, head: -22, ra1: 160, ra2: 0, sa: 204, la1: -158, la2: 8, handB: 1, ll1: -22, ll2: -18, rl1: 24, rl2: -44, wing: 1.8, cloak: 1.5 }, 'out'],
    [28, { lean: -9, head: -22, ra1: 158, ra2: 2, sa: 206, la1: -160, la2: 10, handB: 1, ll1: -24, ll2: -20, rl1: 26, rl2: -46, wing: 1.4, cloak: 1.45 }],
  ]);
  // the helpless fall's own first frame (read at run time, once every file is loaded),
  // so the hand-off through next: 'helpless' has no pop
  let helpPose = null;
  function helpless0() {
    if (helpPose) return helpPose;
    const d = typeof getAnim === 'function' ? getAnim('hermes', 'helpless') : null;
    helpPose = d && d.pose ? Object.assign({}, BASE_POSE, d.pose(0, { time: 0, charge: 0, k: 1 })) : fin(Object.assign({}, AIRN, U_HELP));
    return helpPose;
  }
  // after the burst he droops: the staff falls forward and down in front of him
  const U_DROOP = { lean: 4, head: 2, ra1: 120, ra2: 10, sa: 120, la1: -170, la2: 30, handB: 1, ll1: -8, ll2: -40, rl1: 30, rl2: -64, wing: 0.2, cloak: 0.9 };
  let droopKeys = null;
  function uDroop(f) {
    if (!droopKeys) droopKeys = [uRise(28), fin(Object.assign({}, AIRN, U_DROOP))];
    const [R, D] = droopKeys;
    if (f <= 34) return mixPose(R, D, EASE.inOut(fade01(f, 28, 34)));
    return mixPose(D, helpless0(), EASE.inOut(fade01(f, 34, 42)));
  }
  const uMotion = (f) => {
    if (f < 6) return { vy: 0, grav: 0 };
    if (f <= 28) return { vy: -14 * Math.pow(0.935, f - 6), grav: 0 };
    return null;
  };
  const uGrow = (f) => smoothstep(1, 6, f) * (1 - smoothstep(25, 34, f));
  // the talaria wing of one foot, grown large and swept back from the heel
  function bigTalaria(g, c, f, foot, shade) {
    const grow = uGrow(f);
    if (grow < 0.02) return;
    const p = c.pose;
    const L = 12 * c.k * (1 + 1.7 * grow);
    const ang = -128 + 22 * grow + p.rot;
    const kk = c.k * 0.7 * (1 + 0.7 * grow);
    if (!skinProp(c, 'talaria', g, c.ink, foot[0] - 2 * c.k, foot[1] - 4 * c.k, ang, L, -p.wing * 18, shade, kk)) drawWing(g, c.ink, foot[0] - 2 * c.k, foot[1] - 4 * c.k, ang, L, -p.wing * 18, shade, kk);
  }
  // helix of wind trailing under the rising figure; front or back half
  function helix(g, c, f, front) {
    if (f < 6 || f > 32) return;
    const J = c.J;
    const cx = (J.footF[0] + J.footB[0]) / 2;
    const y0 = Math.max(J.footF[1], J.footB[1]) - 30 * c.k;
    const life = 1 - fade01(f, 24, 32);
    const Lh = (60 + 70 * Math.min(1, (f - 6) / 8)) * c.k;
    g.save();
    g.strokeStyle = c.ink;
    g.lineCap = 'round';
    for (let j = 0; j < 2; j++) {
      let drawing = false;
      g.lineWidth = j ? 0.9 : 1.6;
      g.beginPath();
      for (let i = 0; i <= 60; i++) {
        const s = i / 60;
        const th = s * Math.PI * 4.4 - f * 0.9 + j * Math.PI;
        const R = (9 + 16 * s) * c.k;
        const vis = Math.sin(th) > 0 === front;
        const x = cx + Math.cos(th) * R;
        const y = y0 + s * Lh;
        if (vis && !drawing) {
          g.moveTo(x, y);
          drawing = true;
        } else if (vis) g.lineTo(x, y);
        else drawing = false;
      }
      g.globalAlpha = 0.85 * life;
      g.stroke();
    }
    // feathers riding the spiral around the body
    for (let i = 0; i < 6; i++) {
      const th = (i / 6) * Math.PI * 2 + f * 0.45;
      if (Math.sin(th) > 0 !== front) continue;
      const y = J.center[1] + (i - 2) * 16 * c.k + (f - 6) * 2.2 * c.k;
      const x = J.center[0] + Math.cos(th) * 26 * c.k;
      fxFeather(g, c.ink, x, y, 180 + Math.cos(th) * 50, 8 * c.k, life * (0.6 + 0.4 * Math.sin(th + 1.6) * (front ? 1 : 0.5)));
    }
    g.restore();
  }

  // ---- Psychopomp Guard: the counter stance ----------------------------------------------------
  const GUARD = { hx: -3, hh: H0 - 7, lean: -2, head: 13, ra1: 92, ra2: 26, sa: 150, handF: 0, handB: 0, wing: 0.5, cloak: 0.6 };
  const dKeys = groundSeq([
    [0, {}],
    [5, GUARD, 'out'],
    [26, Object.assign({}, GUARD, { hh: H0 - 7.5, head: 14 })],
    [32, { hx: -1, hh: H0 - 2, lean: 2, head: 4, ra1: 40, ra2: 66, sa: 140, handB: 1, wing: 0.4, cloak: 0.4 }],
    [40, {}],
  ]);
  function guardPose(f) {
    const p = dKeys(f);
    // breathing in the hold
    if (f > 6 && f < 26) p.lean += 0.8 * Math.sin((f - 6) * 0.35);
    // back hand steadies the shaft below the grip
    const gw = smoothstep(1, 5, f) * (1 - smoothstep(26, 33, f));
    if (gw > 0) {
      const sk = skeleton(p, Object.assign({}, SH, { scale: 1 }));
      const d = dirv(sk.armF.ang + p.wpn);
      const T = [sk.armF.h[0] - d[0] * 20, sk.armF.h[1] - d[1] * 20];
      const r = reachBack(p, T);
      p.la1 = lerp(p.la1, r.la1, gw);
      p.la2 = lerp(p.la2, r.la2, gw);
    }
    p.wing += settle(f, 5, 0.25, 9, 8);
    return p;
  }
  // engraved rays around the snakes while the counter is live
  function snakeGlow(g, c, f, a) {
    if (a <= 0) return;
    const J = c.J;
    const S = [lerp(J.handF[0], J.tip[0], 0.42), lerp(J.handF[1], J.tip[1], 0.42)];
    const ax = Math.atan2(J.tip[1] - J.handF[1], J.tip[0] - J.handF[0]);
    g.save();
    g.strokeStyle = c.ink;
    g.lineCap = 'round';
    g.globalAlpha *= a;
    const n = 22;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const pulse = 0.5 + 0.5 * Math.sin(f * 0.7 + i * 1.9);
      // rays sit on an ellipse stretched along the staff
      const ex = Math.cos(th) * 1.5;
      const ey = Math.sin(th);
      const r0 = 12.5 * c.k;
      const r1 = r0 + (2.5 + 4.5 * pulse) * c.k * (i % 2 ? 0.6 : 1);
      const ca = Math.cos(ax);
      const sa = Math.sin(ax);
      const p0 = [S[0] + (ex * ca - ey * sa) * r0, S[1] + (ex * sa + ey * ca) * r0];
      const p1 = [S[0] + (ex * ca - ey * sa) * r1, S[1] + (ex * sa + ey * ca) * r1];
      g.lineWidth = i % 2 ? 0.6 : 1.1;
      line(g, p0[0], p0[1], p1[0], p1[1]);
    }
    g.lineWidth = 0.7;
    g.setLineDash([2.5, 3]);
    g.beginPath();
    g.ellipse(S[0], S[1], 11 * 1.5 * c.k, 11 * c.k, ax, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.restore();
  }

  // ---- the counter strike -----------------------------------------------------------------------
  const GUARD_HOLD = guardPose(12);
  const hKeys = groundSeq([
    [3, { hx: -2, hh: H0 - 9, fx: NEUT.fx + 4, bx: NEUT.bx - 4, lean: 24, head: -8, ra1: -36, ra2: 24, sa: -84, la1: 40, la2: 60, handB: 1, wing: 1.2, cloak: 1 }],
    [5, { hx: -2.5, hh: H0 - 9.5, fx: NEUT.fx + 4, bx: NEUT.bx - 4, lean: 25, head: -8, ra1: -40, ra2: 24, sa: -88, la1: 44, la2: 60, handB: 1, wing: 1.2, cloak: 1 }],
    [6, { hx: 1.5, hh: H0 - 7, fx: NEUT.fx + 4, bx: NEUT.bx - 4, lean: 10, head: -7, ra1: 70, ra2: 8, sa: 46, la1: -30, la2: 30, handB: 1, wing: 1.4, cloak: 1.15 }, 'in'],
    [8, { hx: 4, hh: H0 - 5, fx: NEUT.fx + 4, bx: NEUT.bx - 4, lean: -4, head: -6, ra1: 140, ra2: 4, sa: 150, la1: -70, la2: 20, handB: 1, wing: 1.5, cloak: 1.3 }, 'out'],
    [12, { hx: 3, hh: H0 - 4, fx: NEUT.fx + 4, bx: NEUT.bx - 4, lean: -8, head: -8, ra1: 160, ra2: 6, sa: 172, la1: -76, la2: 20, handB: 1, wing: 1.2, cloak: 1.2 }],
    [20, { hx: 1, hh: H0 - 3, fx: NEUT.fx + 4, bx: NEUT.bx - 4, lean: 0, head: -2, ra1: 110, ra2: 30, sa: 160, la1: -40, la2: 24, handB: 1, wing: 0.8, cloak: 0.9 }],
    // step back into the idle stance: front foot first, then the back foot
    [25, { fx: NEUT.fx + 2, fh: NEUT.fh + 3, bx: NEUT.bx - 4, hh: H0 - 2, lean: 1, ra1: 60, ra2: 50, sa: IDLE_SA + 20 }],
    [28, { fx: NEUT.fx, bx: NEUT.bx - 4, hh: H0 - 1.5 }],
    [31, { bx: NEUT.bx - 1.5, bh: NEUT.bh + 2.5, hh: H0 - 0.5 }],
    [34, {}],
  ]);
  const hFade = (f) => smoothstep(0, 3, f) * (1 - smoothstep(4, 6, f));
  // two snakes winding along the sweep, heads leading
  function snakeWreath(g, c, f) {
    if (f < 6 || f > 12) return;
    const pts = trail(c, ['tip', 'mid'], 5, 3, 0.1, 0.35);
    if (pts.length < 4) return;
    const a = f > 9 ? 1 - (f - 9) / 4 : 1;
    g.save();
    g.strokeStyle = c.ink;
    g.lineCap = 'round';
    g.globalAlpha *= a;
    for (const side of [1, -1]) {
      const body = [];
      for (let i = 0; i < pts.length; i++) {
        const s = i / (pts.length - 1);
        const [o, inn] = pts[i];
        const m = [lerp(o[0], inn[0], 0.5), lerp(o[1], inn[1], 0.5)];
        const w = Math.sin(s * Math.PI * 3 + (side > 0 ? 0 : Math.PI)) * 0.5;
        body.push([lerp(m[0], o[0], w * 2) , lerp(m[1], o[1], w * 2), s]);
      }
      g.beginPath();
      body.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.strokeStyle = PAPER_LIGHT;
      g.lineWidth = side > 0 ? 4.5 : 3.5;
      g.stroke();
      g.strokeStyle = c.ink;
      g.lineWidth = side > 0 ? 2 : 1.3;
      g.stroke();
      const h = body[body.length - 1];
      g.beginPath();
      g.arc(h[0], h[1], 2.2 * c.k, 0, Math.PI * 2);
      engraveFill(g, c.ink, { pat: 'dense', patAlpha: 0.9, lw: 1 });
    }
    g.restore();
  }

  defineAnims('hermes', [
    {
      name: 'special_n',
      label: 'Zephyr Letter',
      group: 'Specials',
      input: 'Special',
      notes: 'He cocks the caduceus back over his shoulder and flicks it forward, releasing a winged letter that flies straight ahead.',
      frames: 40,
      spawn: N_SPAWN,
      pose: (f) => nOverlap(nGround(f), f),
      fx: nFx,
    },
    {
      name: 'special_n_air',
      label: 'Zephyr Letter (air)',
      group: 'Specials',
      input: 'Special in the air',
      notes: 'The airborne flick: legs swing back for balance as the caduceus snaps forward and sends the winged letter off.',
      frames: 40,
      air: true,
      landLag: 10,
      spawn: N_SPAWN,
      motion: (f) => (f >= 6 && f <= 20 ? { grav: 0.5 } : null),
      pose: (f) => nOverlap(nAir(f), f),
      fx: nFx,
    },
    {
      name: 'proj_letter',
      label: 'Winged letter',
      group: 'Specials',
      input: 'Spawned by Zephyr Letter',
      notes: 'The projectile: a sealed scroll on two little wings, beating twice a cycle, with a wake of wind behind it.',
      frames: 24,
      loop: true,
      air: true,
      hit: [{ f: [0, 24], at: [0, 0], r: 9, dmg: 5, kb: 3, ang: 30 }],
      pose: () => ({ air: 1, fade: 1, wpnShow: 0 }),
      fx(g, f, c) {
        drawLetter(g, c.ink, f, c.k);
      },
    },
    {
      name: 'special_s',
      label: 'Swift Courier',
      group: 'Specials',
      input: 'Special + forward',
      notes: 'He coils low, then becomes a streak of wind that dashes through foes, leaving afterimages, and reappears in a braking skid.',
      frames: 38,
      air: true,
      landLag: 12,
      hit: [{ f: [8, 18], at: 'center', r: 16, dmg: 7, kb: 5, ang: 40 }],
      motion: sMotion,
      pose(f) {
        const p = blend(sGround(f), sDash(f), sDashW(f));
        if (f > 3 && f < 8) p.lean += 0.8 * Math.sin(f * 3.3); // tremble of the coiled spring
        p.cloak += settle(f, 20, 0.25, 9, 7);
        p.wing += settle(f, 20, 0.3, 7, 6);
        return p;
      },
      fxBack(g, f, c) {
        if (f < 8 || f > 24) return;
        // afterimages: earlier frames drawn where he was on those frames
        for (const back of [8, 4]) {
          const fr = Math.max(7, f - back);
          if (fr >= f || fr > 18 || (fr === 7 && f - 7 < back)) continue;
          const pose = Object.assign({}, BASE_POSE, c.def.pose(fr, c), { fade: 0 });
          const a = (back > 4 ? 0.07 : 0.16) * (1 - fade01(f, 18, 24));
          if (a <= 0) continue;
          c.drawFigure(g, pose, -sDist(fr, f), 0, { face: 1, ink: c.ink, scale: c.k, alpha: a, time: fr / 60 });
        }
      },
      fx(g, f, c) {
        const J = c.J;
        if (win(f, 8, 21)) {
          const a = 1 - fade01(f, 18, 21);
          const L = Math.min(sDist(7, f), 110 * c.k) + 20 * c.k;
          fxSpeedLines(g, c.ink, [J.center[0] - 16 * c.k, J.center[1] + 2 * c.k], [1, 0], L, 44 * c.k, 5, 0.75 * a, c.rnd);
          // the wind sheath: a long teardrop of ink around the streak
          g.save();
          g.strokeStyle = c.ink;
          g.globalAlpha *= 0.6 * a;
          g.lineCap = 'round';
          for (const s of [-1, 1]) {
            g.lineWidth = s > 0 ? 1.6 : 1;
            g.beginPath();
            g.moveTo(J.center[0] + 30 * c.k, J.center[1]);
            g.quadraticCurveTo(J.center[0] + 6 * c.k, J.center[1] + s * 30 * c.k, J.center[0] - L, J.center[1] + s * 8 * c.k);
            g.stroke();
          }
          g.restore();
        }
        if (win(f, 8, 16)) {
          const t = (f - 8) / 8;
          fxGust(g, c.ink, -sDist(7, f), -40 * c.k, (14 + 12 * t) * c.k, t * 4, 1 - t);
        }
        if (win(f, 19, 30)) {
          const t = (f - 19) / 11;
          fxDustPuff(g, c.ink, J.footF[0] + 8 * c.k, t, 12 * c.k, 1);
          fxDustPuff(g, c.ink, J.footB[0] - 2 * c.k, clamp(t * 1.2, 0, 1), 8 * c.k, -1);
        }
      },
    },
    {
      name: 'special_u',
      label: 'Talaria Rise',
      group: 'Specials',
      input: 'Special + up',
      notes: 'His heel wings swell and beat hard, rocketing him straight up inside a spiral of feathers and wind, the staff leading the way.',
      frames: 42,
      air: true,
      landLag: 14,
      next: 'helpless',
      hit: [
        { f: [6, 8], at: 'center', r: 16, dmg: 2, kb: 1.5, ang: 88 },
        { f: [12, 14], at: 'center', r: 16, dmg: 2, kb: 1.5, ang: 88 },
        { f: [18, 20], at: 'center', r: 16, dmg: 2, kb: 1.5, ang: 88 },
        { f: [24, 26], at: 'tip', r: 12, dmg: 6, kb: 6, ang: 85 },
        { f: [24, 26], at: 'center', r: 15, dmg: 6, kb: 6, ang: 85 },
      ],
      motion: uMotion,
      pose(f) {
        const p = f <= 28 ? blend(uCrouch(Math.min(f, 6)), uRise(f), smoothstep(5, 7, f)) : uDroop(f);
        // hard wingbeats during the climb, then they spread for the burst
        if (f > 6 && f < 24) p.wing += 0.55 * Math.sin((f - 6) * 1.25);
        if (f > 6 && f < 26) p.rot += 4 * Math.sin((f - 6) * 0.55) * (1 - fade01(f, 18, 26));
        p.cloak += settle(f, 28, 0.2, 10, 8);
        return p;
      },
      fxBack(g, f, c) {
        bigTalaria(g, c, f, c.J.footB, 'cross');
        helix(g, c, f, false);
      },
      fx(g, f, c) {
        bigTalaria(g, c, f, c.J.footF, 'hatch');
        helix(g, c, f, true);
        const J = c.J;
        if (win(f, 5, 12)) {
          const t = (f - 5) / 7;
          const fy = Math.max(J.footF[1], J.footB[1]);
          fxGust(g, c.ink, (J.footF[0] + J.footB[0]) / 2, fy + 8 * c.k * t, (12 + 16 * t) * c.k, t * 3, 1 - t);
        }
        if (win(f, 24, 32)) {
          const t = (f - 24) / 8;
          featherBurst(g, c, J.top, t, 7, 36 * c.k, 4242);
        }
        spark(g, c, f, 24, J.tip, 14);
      },
    },
    {
      name: 'special_d',
      label: 'Psychopomp Guard',
      group: 'Specials',
      input: 'Special + down',
      notes: 'A calm counter stance: the caduceus raised before him in both hands while the snakes glow; a blow struck now is answered.',
      frames: 40,
      air: true,
      landLag: 12,
      counter: [[6, 26]],
      pose: guardPose,
      fx(g, f, c) {
        const a = smoothstep(4, 7, f) * (1 - smoothstep(24, 29, f));
        snakeGlow(g, c, f, a);
        if (win(f, 5, 11)) {
          const t = (f - 5) / 6;
          const J = c.J;
          const S = [lerp(J.handF[0], J.tip[0], 0.42), lerp(J.handF[1], J.tip[1], 0.42)];
          g.save();
          g.strokeStyle = c.ink;
          g.globalAlpha *= 1 - t;
          g.lineWidth = 1.6;
          g.beginPath();
          g.arc(S[0], S[1], (12 + 22 * t) * c.k, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        }
      },
    },
    {
      name: 'special_d_hit',
      label: 'Psychopomp Guard strike',
      group: 'Specials',
      input: 'Automatic when the guard is struck',
      notes: 'He vanishes in a scatter of feathers, steps in unseen and reappears low, sweeping the caduceus upward wreathed in its snakes.',
      frames: 34,
      intan: [[0, 9]],
      hit: [
        { f: [6, 9], at: 'tip', r: 10, dmg: 12, kb: 8, ang: 40 },
        { f: [6, 9], at: 'mid', r: 10, dmg: 12, kb: 8, ang: 40 },
      ],
      motion(f) {
        if (f >= 2 && f <= 4) return { vx: 8 };
        if (f >= 5 && f <= 14) return { vx: 0 };
        return null;
      },
      pose(f) {
        const p = blend(GUARD_HOLD, hKeys(f), smoothstep(2.5, 4, f));
        p.fade = hFade(f);
        p.wing += settle(f, 9, 0.35, 8, 7);
        p.cloak += settle(f, 10, 0.2, 10, 8);
        return p;
      },
      fx(g, f, c) {
        const J = c.J;
        if (win(f, 0, 9)) {
          // vanishing: feathers scatter from where he stood (left behind as he steps in)
          const t = f / 9;
          const back = -8 * clamp(f - 2, 0, 3);
          featherBurst(g, c, [J.center[0] + back, J.center[1]], t, 8, 34 * c.k, 777);
          fxGust(g, c.ink, J.center[0] + back, J.center[1], (14 + 14 * t) * c.k, t * 3, 1 - t);
        }
        if (win(f, 4, 9)) {
          const t = (f - 4) / 5;
          fxGust(g, c.ink, J.center[0], J.center[1] + 10 * c.k, (22 - 10 * t) * c.k, -t * 4, (1 - t) * 0.8);
        }
        smear(g, c, f, 'tip', 'mid', 6, 9, 2.5, 0.95);
        snakeWreath(g, c, f);
        spark(g, c, f, 7, J.tip, 14);
      },
    },
  ]);
})();
