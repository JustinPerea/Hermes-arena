// Hermes — aerial attacks.
//
// Every aerial is keyed with seq() over the neutral falling pose (AIRN), so a
// channel a key leaves out rests at its falling value and each move recovers
// into the fall cycle the game plays next. 'sa' is an absolute caduceus angle
// (dirv degrees: 0 down, 90 forward, 180 up); 'rot' may run past +-180 inside
// the keys (full flips) and is wrapped back into range when a pose is finished.
(() => {
  // ---- keyed poses -------------------------------------------------------------
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
  const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
  function fin(p) {
    if (p.sa != null) p.wpn = p.sa - (p.lean + p.ra1 + p.ra2);
    delete p.sa;
    p.rot = wrap(p.rot || 0);
    return p;
  }
  // the falling pose of the air file at frame 0 (aerials recover into it)
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
  const airSeq = (keys) => {
    const s = seq(AIRN, keys);
    return (f) => fin(s(f));
  };
  // damped wobble starting at f0 (overlapping action on wings and cloak)
  const settle = (f, f0, amp, period, decay) => (f < f0 ? 0 : amp * Math.exp(-(f - f0) / decay) * Math.sin(((f - f0) / period) * Math.PI * 2));
  const win = (f, a, b) => f >= a && f <= b;
  const fade01 = (f, a, b) => clamp((f - a) / (b - a), 0, 1);

  // ---- effects -----------------------------------------------------------------------
  // joint pairs over the last frames, never reaching back before frame 'from'
  // (w < 1 pulls the inner point toward the outer one for a slimmer smear)
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
  // smear behind a pair of joints while they travel (from..to), fading after
  function smear(g, c, f, outer, inner, from, to, span, alpha, w) {
    if (f < from || f > to + 2) return;
    const a = (alpha == null ? 1 : alpha) * (f > to ? 1 - (f - to) / 3 : 1);
    fxCrescent(g, c.ink, trail(c, [outer, inner], from - 1, span, 0.1, w), a);
  }
  function spark(g, c, f, f0, at, r) {
    if (f < f0 || f > f0 + 6) return;
    fxSpark(g, c.ink, at[0], at[1], r * c.k, (f - f0) / 7, 1);
  }
  // a few loose feathers shed from a point, drifting back and down
  function shed(g, c, f, f0, at, n, dir) {
    const t = (f - f0) / 14;
    if (t < 0 || t > 1) return;
    const rnd = mulberry32(Math.round(f0 * 31 + at[0]));
    for (let i = 0; i < n; i++) {
      const vx = (dir || -1) * (4 + rnd() * 10) * c.k;
      const vy = (-6 + rnd() * 10) * c.k;
      const x = at[0] + vx * t * 1.6;
      const y = at[1] + vy * t + 10 * c.k * t * t;
      fxFeather(g, c.ink, x, y, -60 + rnd() * 120 + t * 200 * (i % 2 ? 1 : -1), (6 + rnd() * 3) * c.k, 1 - t * t);
    }
  }
  // engraved ring of wind around a centre, trailing behind a spin
  function wheel(g, c, cx, cy, R, a0, sweep, alpha) {
    g.save();
    g.globalAlpha *= alpha;
    g.strokeStyle = c.ink;
    g.lineCap = 'round';
    const n = 26;
    for (let j = 0; j < 3; j++) {
      const r = R * (1 - j * 0.14);
      g.lineWidth = 1.7 - j * 0.5;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = a0 - sweep * (1 - t) - j * 0.25;
        const rr = r * (0.92 + 0.08 * t);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // hatch ticks across the band
    g.lineWidth = 0.7;
    for (let i = 0; i < 9; i++) {
      const a = a0 - sweep * (i / 9);
      const r0 = R * 0.7;
      const r1 = R * (0.98 - i * 0.015);
      line(g, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a - 0.12) * r1, cy + Math.sin(a - 0.12) * r1);
    }
    g.restore();
  }

  // ---- neutral air: the cloak wheel --------------------------------------------------
  const NAIR_SPREAD = {
    lean: 0, head: 4,
    la1: -112, la2: 8, ra1: 98, ra2: 4, sa: 96, handB: 1,
    ll1: -58, ll2: -8, rl1: 52, rl2: -14,
    wing: 1.3, cloak: 1.5,
  };
  const nairBody = airSeq([
    [0, {}],
    [3, { lean: 16, head: 8, ll1: 62, ll2: -112, rl1: 78, rl2: -122, la1: 50, la2: 86, ra1: 46, ra2: 92, sa: 205, wing: 0.2, cloak: 0.6 }],
    [5, NAIR_SPREAD, 'out'],
    [15, Object.assign({}, NAIR_SPREAD, { la1: -104, ra1: 92, ll1: -50, rl1: 46, wing: 1.1, cloak: 1.4 })],
    [21, { lean: 8, head: 6, ll1: 20, ll2: -70, rl1: 50, rl2: -90, la1: -70, la2: 30, ra1: 70, ra2: 40, sa: 140, wing: 0.9, cloak: 1.1 }],
    [36, {}],
  ]);
  // spin: a short wind-back, then one fast forward revolution that slows out
  const nairRot = (f) => {
    if (f <= 3) return -12 * EASE.inOut(f / 3);
    if (f <= 19) {
      const t = (f - 3) / 16;
      return -12 + 372 * (1 - (1 - t) * (1 - t));
    }
    return 360;
  };

  // ---- forward air: overhead chop --------------------------------------------------------
  const fairPose = airSeq([
    [0, {}],
    [5, { lean: -14, head: -8, ra1: 165, ra2: 20, sa: 215, la1: 60, la2: 40, ll1: 40, ll2: -92, rl1: 70, rl2: -100, wing: 0.9, cloak: 0.8 }],
    [9, { lean: -20, head: -12, rot: -10, ra1: 176, ra2: 24, sa: 238, la1: 76, la2: 36, ll1: 52, ll2: -104, rl1: 82, rl2: -112, wing: 0.5, cloak: 0.7 }, 'out'],
    [12, { lean: 28, head: 8, rot: 16, ra1: 74, ra2: 0, sa: 42, la1: -76, la2: 18, ll1: -42, ll2: -30, rl1: 8, rl2: -52, wing: 1.4, cloak: 1.25 }, 'out'],
    [17, { lean: 32, head: 10, rot: 20, ra1: 54, ra2: 4, sa: 22, la1: -84, la2: 22, ll1: -36, ll2: -34, rl1: 14, rl2: -58, wing: 1.1, cloak: 1.1 }],
    [24, { lean: 16, head: 8, rot: 8, ra1: 60, ra2: 30, sa: 70, la1: -96, la2: 22, ll1: -18, ll2: -36, rl1: 26, rl2: -62, wing: 0.9, cloak: 0.95 }],
    [38, {}],
  ]);

  // ---- back air: winged heel kick ---------------------------------------------------------
  const bairPose = airSeq([
    [0, {}],
    [4, { lean: 26, head: 14, rot: 8, ra1: 40, ra2: 56, sa: 112, la1: 34, la2: 70, handB: 0, ll1: 26, ll2: -100, rl1: 42, rl2: -134, wing: 0.4, cloak: 0.7 }],
    [6, { lean: 30, head: 16, rot: 12, ra1: 42, ra2: 54, sa: 108, la1: 40, la2: 64, handB: 0, ll1: 30, ll2: -106, rl1: 46, rl2: -140, wing: 0.3, cloak: 0.65 }],
    [8, { lean: 34, head: 20, rot: 16, ra1: 46, ra2: 18, sa: 94, la1: 34, la2: 34, handB: 1, ll1: 62, ll2: -112, rl1: -106, rl2: 4, wing: 1.5, cloak: 1.2 }, 'out'],
    [11, { lean: 35, head: 20, rot: 17, ra1: 48, ra2: 16, sa: 94, la1: 36, la2: 32, handB: 1, ll1: 64, ll2: -114, rl1: -108, rl2: 2, wing: 1.2, cloak: 1.15 }],
    [16, { lean: 22, head: 12, rot: 10, ra1: 54, ra2: 34, sa: 116, la1: 20, la2: 40, ll1: 34, ll2: -96, rl1: 10, rl2: -112, wing: 0.9, cloak: 1 }],
    [30, {}],
  ]);

  // ---- up air: bicycle flip kick ----------------------------------------------------------
  const uairPose = airSeq([
    [0, {}],
    [3, { lean: 10, head: 6, rot: 8, ll1: 50, ll2: -100, rl1: 60, rl2: -110, la1: -40, la2: 50, ra1: 60, ra2: 50, sa: 150, wing: 0.5, cloak: 0.7 }],
    [5, { lean: -10, head: -14, rot: -45, ll1: 140, ll2: -4, rl1: 40, rl2: -118, la1: -118, la2: 18, ra1: 236, ra2: 8, sa: 252, wing: 1.3, cloak: 1.1 }, 'out'],
    [7, { lean: -10, head: -14, rot: -66, ll1: 92, ll2: -86, rl1: 64, rl2: -104, la1: -134, la2: 20, ra1: 262, ra2: 12, sa: 290, wing: 0.9, cloak: 0.9 }],
    // inverted on his back: near leg spears straight up, arms flung down in a V
    // (the near arm keeps windmilling backward, so its angles run past 360)
    [10, { lean: -12, head: -20, rot: -100, ll1: 18, ll2: -122, rl1: 86, rl2: -2, la1: -168, la2: 10, ra1: 318, ra2: 10, sa: 318, wing: 1.5, cloak: 0.75 }, 'out'],
    [12, { lean: -12, head: -20, rot: -110, ll1: 16, ll2: -124, rl1: 84, rl2: -4, la1: -170, la2: 12, ra1: 322, ra2: 12, sa: 324, wing: 1.2, cloak: 0.75 }],
    [17, { lean: 22, head: 8, rot: -230, ll1: 86, ll2: -136, rl1: 96, rl2: -140, la1: 64, la2: 92, ra1: 418, ra2: 100, sa: 530, wing: 0.6, cloak: 1 }],
    [23, { lean: 16, head: 6, rot: -335, ll1: 50, ll2: -100, rl1: 70, rl2: -110, la1: -40, la2: 50, ra1: 422, ra2: 56, sa: 520, wing: 0.9, cloak: 0.9 }],
    [34, { rot: -360, ra1: AIRN.ra1 + 360, sa: AIRN.sa + 360 }],
  ]);

  // ---- down air: talaria stomp ------------------------------------------------------------
  const dairPose = airSeq([
    [0, {}],
    [6, { lean: 20, head: 10, oy: -4, ll1: 100, ll2: -150, rl1: 110, rl2: -150, la1: 34, la2: 70, ra1: 50, ra2: 70, sa: 116, handB: 0, wing: 1.2, cloak: 0.9 }],
    [12, { lean: 26, head: 14, oy: -7, ll1: 112, ll2: -152, rl1: 120, rl2: -152, la1: 40, la2: 76, ra1: 56, ra2: 76, sa: 112, handB: 0, wing: 1.4, cloak: 0.85 }],
    [14, { lean: 14, head: 26, oy: 6, ll1: -7, ll2: 0, rl1: 6, rl2: -3, la1: -168, la2: 8, ra1: 124, ra2: 8, sa: 146, handB: 1, wing: 1.6, cloak: 1.35 }, 'out'],
    [18, { lean: 16, head: 28, oy: 8, ll1: -7, ll2: -2, rl1: 7, rl2: -5, la1: -170, la2: 10, ra1: 128, ra2: 10, sa: 150, handB: 1, wing: 1.3, cloak: 1.3 }],
    [25, { lean: 8, head: 16, oy: 4, ll1: 0, ll2: -26, rl1: 18, rl2: -40, la1: -130, la2: 22, ra1: 108, ra2: 30, sa: 160, wing: 1, cloak: 1.05 }],
    [40, {}],
  ]);

  defineAnims('hermes', [
    {
      name: 'nair',
      label: 'Cyclone Wheel',
      group: 'Aerial attacks',
      input: 'Attack in the air',
      notes: 'He throws his limbs and staff wide and spins once like a wheel, the cloak flaring into a ring of wind; strong at the start, weak as it slows.',
      frames: 36,
      air: true,
      landLag: 7,
      hit: [
        { f: [5, 8], at: 'center', r: 15, dmg: 8, kb: 5, ang: 45 },
        { f: [5, 8], at: 'tip', r: 9, dmg: 8, kb: 5, ang: 45 },
        { f: [5, 8], at: 'footB', r: 8, dmg: 8, kb: 5, ang: 45 },
        { f: [9, 18], at: 'center', r: 14, dmg: 4, kb: 2.5, ang: 50 },
        { f: [9, 18], at: 'tip', r: 8, dmg: 4, kb: 2.5, ang: 50 },
      ],
      pose(f) {
        const p = nairBody(f);
        p.rot = wrap(nairRot(f));
        p.wing += settle(f, 19, 0.35, 8, 7);
        p.cloak += settle(f, 19, 0.2, 10, 8);
        return p;
      },
      fxBack(g, f, c) {
        if (f < 5 || f > 20) return;
        // ring of wind trailing the spin, centred on the rotation pivot
        const J = c.J;
        const R = Math.hypot(J.tip[0] - J.pivot[0], J.tip[1] - J.pivot[1]);
        const a = Math.atan2(J.tip[1] - J.pivot[1], J.tip[0] - J.pivot[0]);
        const strong = f <= 9 ? 1 : 1 - fade01(f, 9, 20);
        wheel(g, c, J.pivot[0], J.pivot[1], R * 0.66, a - 0.5, 1.6 * strong + 0.5, 0.55 * strong);
      },
      fx(g, f, c) {
        smear(g, c, f, 'tip', 'mid', 5, 15, 1.6, 0.9);
        smear(g, c, f, 'footB', 'kneeB', 5, 12, 1.4, 0.7, 0.5);
        spark(g, c, f, 5, c.J.tip, 12);
      },
    },
    {
      name: 'fair',
      label: 'Messenger\'s Chop',
      group: 'Aerial attacks',
      input: 'Attack + forward in the air',
      notes: 'He arches back with the caduceus cocked overhead, then brings it down in a big forward chop; the knob at full reach drives foes downward.',
      frames: 38,
      air: true,
      landLag: 12,
      hit: [
        { f: [11, 13], at: 'tip', r: 8, dmg: 13, kb: 6, ang: -60 },
        { f: [10, 13], at: 'mid', r: 10, dmg: 12, kb: 6, ang: 40 },
        { f: [10, 10], at: 'tip', r: 9, dmg: 12, kb: 6, ang: 40 },
        { f: [10, 13], at: 'handF', r: 7, dmg: 10, kb: 5, ang: 40 },
      ],
      pose(f) {
        const p = fairPose(f);
        // a tiny shiver at the top of the wind-up, then the cloak and wings settle
        if (f > 6 && f < 10) p.wpn += 1.5 * Math.sin(f * 3.1);
        p.wing += settle(f, 13, 0.35, 9, 7);
        p.cloak += settle(f, 13, 0.15, 11, 9);
        return p;
      },
      fx(g, f, c) {
        smear(g, c, f, 'tip', 'handF', 10, 13, 3, 1);
        spark(g, c, f, 11, c.J.tip, 13);
      },
    },
    {
      name: 'bair',
      label: 'Winged Mule Kick',
      group: 'Aerial attacks',
      input: 'Attack + back in the air',
      notes: 'He pitches forward, chambers the near knee and drives the winged heel straight out behind him in a mule kick.',
      frames: 30,
      air: true,
      landLag: 9,
      hit: [
        { f: [7, 10], at: 'footF', r: 10, dmg: 13, kb: 7, ang: 145 },
        { f: [7, 10], at: 'kneeF', r: 8, dmg: 9, kb: 5, ang: 145 },
      ],
      pose(f) {
        const p = bairPose(f);
        p.wing += settle(f, 11, 0.4, 7, 6);
        p.cloak += settle(f, 9, 0.18, 10, 8);
        return p;
      },
      fx(g, f, c) {
        smear(g, c, f, 'footF', 'kneeF', 7, 10, 2, 0.95, 0.55);
        const J = c.J;
        if (win(f, 7, 12)) {
          const d = [J.footF[0] - J.kneeF[0], J.footF[1] - J.kneeF[1]];
          const l = Math.hypot(d[0], d[1]) || 1;
          // thrust lines along the kick, trailing toward the hip
          fxSpeedLines(g, c.ink, [J.footF[0] - (d[0] / l) * 4 * c.k, J.footF[1] - (d[1] / l) * 4 * c.k - 9 * c.k], [d[0] / l, d[1] / l], 30 * c.k, 10 * c.k, 3, 0.8 * (1 - fade01(f, 9, 12)), c.rnd);
        }
        spark(g, c, f, 7, J.footF, 13);
        shed(g, c, f, 8, J.footF, 2, 1);
      },
    },
    {
      name: 'uair',
      label: 'Sky Somersault',
      group: 'Aerial attacks',
      input: 'Attack + up in the air',
      notes: 'A backward bicycle flip: one heel snaps up, then the other kicks straight overhead before he tucks through the rest of the somersault.',
      frames: 34,
      air: true,
      landLag: 8,
      hit: [
        { f: [5, 6], at: 'footB', r: 9, dmg: 4, kb: 2, ang: 90 },
        { f: [10, 12], at: 'footF', r: 10, dmg: 8, kb: 6, ang: 90 },
        { f: [10, 12], at: 'kneeF', r: 8, dmg: 6, kb: 5, ang: 90 },
      ],
      pose(f) {
        const p = uairPose(f);
        p.ra1 = wrap(p.ra1);
        p.wing += settle(f, 24, 0.3, 8, 6);
        return p;
      },
      fx(g, f, c) {
        smear(g, c, f, 'footB', 'kneeB', 5, 6, 1.5, 0.8, 0.5);
        smear(g, c, f, 'footF', 'kneeF', 9, 12, 2, 0.95, 0.55);
        spark(g, c, f, 5, c.J.footB, 8);
        spark(g, c, f, 10, c.J.footF, 13);
      },
    },
    {
      name: 'dair',
      label: 'Talaria Stomp',
      group: 'Aerial attacks',
      input: 'Attack + down in the air',
      notes: 'Talaria stomp: he hangs a moment with his knees drawn up and wings fanning, then drives both winged sandals straight down to spike.',
      frames: 40,
      air: true,
      landLag: 18,
      hit: [
        { f: [14, 17], at: 'footF', r: 9, dmg: 12, kb: 6, ang: -90 },
        { f: [14, 17], at: 'footB', r: 9, dmg: 12, kb: 6, ang: -90 },
      ],
      motion(f) {
        if (f >= 3 && f <= 12) return { grav: 0.35 };
        if (f >= 13 && f <= 17) return { vy: 7 };
        return null;
      },
      pose(f) {
        const p = dairPose(f);
        // heel wings beat to hold him up during the wind-up
        if (f > 3 && f < 13) p.wing += 0.35 * Math.sin((f - 3) * 1.6) * (1 - fade01(f, 9, 13));
        p.wing += settle(f, 18, 0.35, 8, 7);
        p.cloak += settle(f, 16, 0.2, 10, 8);
        return p;
      },
      fx(g, f, c) {
        const J = c.J;
        const mx = (J.footF[0] + J.footB[0]) / 2;
        const my = Math.max(J.footF[1], J.footB[1]);
        if (win(f, 13, 19)) {
          const a = 1 - fade01(f, 16, 19);
          // streaks either side of the legs, trailing upward
          for (const sd of [-1, 1]) fxSpeedLines(g, c.ink, [mx + sd * 22 * c.k, my - 8 * c.k], [0, 1], 52 * c.k, 14 * c.k, 3, 0.85 * a, c.rnd);
        }
        if (win(f, 14, 21)) {
          // downward shock: two engraved chevrons under the soles
          const t = (f - 14) / 8;
          g.save();
          g.strokeStyle = c.ink;
          g.lineCap = 'round';
          g.globalAlpha *= 1 - t;
          for (let i = 0; i < 2; i++) {
            const w = (10 + 14 * t + i * 6) * c.k;
            const y = my + (6 + 16 * t + i * 7) * c.k;
            g.lineWidth = 2 - i * 0.7;
            g.beginPath();
            g.moveTo(mx - w, y - w * 0.45);
            g.quadraticCurveTo(mx, y + w * 0.15, mx + w, y - w * 0.45);
            g.stroke();
          }
          g.restore();
        }
        spark(g, c, f, 14, [mx, my + 4 * c.k], 14);
        shed(g, c, f, 15, J.footB, 2, -1);
        shed(g, c, f, 16, J.footF, 1, 1);
      },
    },
  ]);
})();
