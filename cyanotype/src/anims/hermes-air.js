// Hermes — jumping, falling and landing.
//
// Grounded frames (jumpsquat, landings, the start of a platform drop) plant
// the feet with the same small IK used by the stand file: hx/hh are the hip
// position and bx/bh, fx/fh the back and front feet (x in feet space, h above
// the floor), all in figure units. 'sa' is an absolute caduceus angle.
(() => {
  const SH = HERMES_SHAPE;

  // ---- feet, hips and keyed poses -------------------------------------------------
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
    return 'hh' in p ? plant(p) : p;
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
  const AIR = Object.assign({}, BASE_POSE, { air: 1, sa: IDLE_SA });
  const groundSeq = (keys) => {
    const s = seq(GROUND, keys);
    return (f) => fin(s(f));
  };
  const airSeq = (keys) => {
    const s = seq(AIR, keys);
    return (f) => fin(s(f));
  };
  const settle = (f, f0, amp, period, decay) => (f < f0 ? 0 : amp * Math.exp(-(f - f0) / decay) * Math.sin(((f - f0) / period) * Math.PI * 2));

  // ---- the shared falling pose ---------------------------------------------------
  function fallPose(f) {
    const ph = (f / 30) * Math.PI * 2;
    return Object.assign({}, AIR, {
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
  const FALL0 = fallPose(0);

  // world-anchoring for effects left behind by a jump: displacement (px, y down)
  // of Hermes after t frames, from vy0 under the game's 0.72 gravity.
  const riseY = (t, vy0) => vy0 * t + 0.36 * t * (t - 1);

  // ---- effects ---------------------------------------------------------------
  function dust(g, ink, x, t, size, dir, alpha) {
    if (t < 0 || t > 1) return;
    g.save();
    g.globalAlpha *= (alpha == null ? 1 : alpha) * (1 - t * t);
    const r = size * (0.32 + 0.6 * Math.sqrt(t));
    const cx = x + dir * size * 1.3 * t;
    const cy = -r * 0.55 - size * 0.25 * t;
    const lobes = [[-0.75, 0.2, 0.55], [0, -0.2, 0.78], [0.8, 0.15, 0.5]];
    g.beginPath();
    for (const [dx, dy, rr] of lobes) {
      g.moveTo(cx + dir * dx * r + rr * r, cy + dy * r);
      g.arc(cx + dir * dx * r, cy + dy * r, rr * r, 0, Math.PI * 2);
    }
    g.strokeStyle = ink;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    g.globalAlpha *= 0.8;
    g.fillStyle = inkPatterns(g, ink).hatch;
    g.fill();
    g.fillStyle = ink;
    for (let i = 0; i < 3; i++) {
      const a = 0.5 + i * 0.35;
      const d = size * (0.6 + 1.5 * t) * (0.8 + i * 0.25);
      g.beginPath();
      g.arc(x + dir * Math.cos(a) * d, -Math.sin(a) * d * 0.8 + t * t * size * 0.6, 0.9 + (i % 2) * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  // flat engraved shock ring (ellipse seen edge-on) with radial ticks
  function airRing(g, ink, x, y, t, R) {
    if (t < 0 || t > 1) return;
    g.save();
    g.globalAlpha *= 1 - t * t;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    const rx = R * (0.35 + 0.75 * EASE.out(t));
    const ry = rx * 0.26;
    g.lineWidth = 2.4 * (1 - t) + 0.6;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 0.8;
    g.beginPath();
    g.ellipse(x, y, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
    g.stroke();
    // ticks flung outward along the ring
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      g.lineWidth = i % 2 ? 0.7 : 1.3;
      line(g, x + c * rx * 1.08, y + s * ry * 1.08, x + c * rx * (1.25 + 0.2 * t), y + s * ry * (1.25 + 0.2 * t));
    }
    g.restore();
  }

  defineAnims('hermes', [
    {
      name: 'jumpsquat',
      label: 'Jump squat',
      group: 'Jump and air',
      input: 'Press jump on the ground',
      notes: 'A quick coil before takeoff: knees load, arms swing back and the heel wings flare open.',
      frames: 4,
      pose: groundSeq([
        [0, {}],
        [2, { hx: 1, hh: 40.5, lean: 14, head: -4, la1: -42, la2: 30, ra1: 2, ra2: 58, sa: 176, wing: 1.1, cloak: 0.45 }, 'out'],
        [4, { hx: 1.5, hh: 37.5, lean: 20, head: -7, la1: -58, la2: 24, ra1: -8, ra2: 60, sa: 170, wing: 1.55, cloak: 0.6 }, 'inOut'],
      ]),
      fx(g, f, c) {
        const J = c.J;
        dust(g, c.ink, J.footB[0] - 2 * c.k, (f - 1.5) / 5, 6 * c.k, -1, 0.7);
        dust(g, c.ink, J.footF[0] + 6 * c.k, (f - 1.5) / 5, 6 * c.k, 1, 0.7);
      },
      next: 'jump',
    },
    {
      name: 'jump',
      label: 'Jump',
      group: 'Jump and air',
      input: 'Jump',
      notes: 'Springs up fully extended, tucks the front knee and trails the back leg, then eases into a hang at the apex.',
      frames: 30,
      air: true,
      pose: (() => {
        const s = airSeq([
          [0, { lean: 2, head: -9, la1: 82, la2: 30, ra1: 148, ra2: 20, sa: 186, ll1: -14, ll2: -8, rl1: -2, rl2: -12, wing: 1.5, cloak: 1.0, handB: 1 }],
          [5, { lean: 9, head: -7, la1: 96, la2: 40, ra1: 108, ra2: 40, sa: 176, ll1: -16, ll2: -46, rl1: 80, rl2: -112, wing: 0.95, cloak: 0.95, handB: 1 }, 'out'],
          [16, { lean: 6, head: -2, la1: 30, la2: 36, ra1: 84, ra2: 44, sa: 170, ll1: -11, ll2: -44, rl1: 60, rl2: -88, wing: 0.8, cloak: 0.9, handB: 1 }],
          [30, FALL0],
        ]);
        return (f) => {
          const p = s(f);
          p.wing += settle(f, 3, 0.3, 7, 8);
          return p;
        };
      })(),
      fx(g, f, c) {
        // short wind streaks trailing below the feet as he springs up
        if (f > 9) return;
        const t = f / 9;
        const J = c.J;
        const y = Math.max(J.footB[1], J.footF[1]) + 4 * c.k;
        fxSpeedLines(g, c.ink, [J.hip[0] - 2 * c.k, y], [0, -1], (30 - 16 * t) * c.k, 24 * c.k, 4, (1 - t) * 0.85, c.rnd);
      },
    },
    {
      name: 'double_jump',
      label: 'Double jump',
      group: 'Jump and air',
      input: 'Jump again in the air',
      notes: 'The heel wings burst open, kicking off a ring of wind, and he turns a full tucked forward somersault, shedding feathers.',
      frames: 26,
      air: true,
      pose: (() => {
        const TUCKED = { lean: 18, head: 6, ll1: 88, ll2: -132, rl1: 100, rl2: -138, la1: 72, la2: 88, ra1: 60, ra2: 96, sa: 158, wing: 0.9, cloak: 1.2, handB: 0 };
        const s = airSeq([
          [0, { lean: -2, head: -8, la1: 112, la2: 10, ra1: 146, ra2: 22, sa: 188, ll1: -24, ll2: -8, rl1: 14, rl2: -6, wing: 1.8, cloak: 1.1, handB: 1 }],
          [5, TUCKED, 'out'],
          [14, Object.assign({}, TUCKED, { ll1: 84, rl1: 96 })],
          [20, { lean: 6, head: 0, la1: -40, la2: 30, ra1: 80, ra2: 44, sa: 168, ll1: 4, ll2: -40, rl1: 46, rl2: -70, wing: 1.0, cloak: 1.0, handB: 1 }, 'out'],
          [26, FALL0],
        ]);
        const spin = (f) => {
          if (f < 2) return -10 * smoothstep(0, 2, f);
          const t = clamp((f - 2) / 18, 0, 1);
          return -10 + 370 * (1 - Math.pow(1 - EASE.inOut(t), 1.6));
        };
        return (f) => {
          const p = s(f);
          p.rot = spin(f);
          p.wing += settle(f, 0, 0.4, 5, 7);
          return p;
        };
      })(),
      fxBack(g, f, c) {
        // ring and gust where he kicked off, left behind in the air
        const y = -riseY(f, -15) + 4 * c.k;
        const x = c.sample(0).hip[0];
        airRing(g, c.ink, x, y, f / 12, 40 * c.k);
        if (f < 9) fxGust(g, c.ink, x, y - 2 * c.k, (12 + f * 2.2) * c.k, f * 0.5, 0.75 * (1 - f / 9));
      },
      fx(g, f, c) {
        // shed feathers drift down while he rises away from them
        const seeds = [[-12, 0.6, -40, 1], [6, 1.2, 30, 1.5], [-2, 2.0, -70, 2], [14, 2.8, 60, 2.5]];
        for (const [dx, sp, a0, t0] of seeds) {
          const t = f - t0;
          if (t < 0) continue;
          const life = clamp(t / 22, 0, 1);
          const x = (dx + Math.sin(t * 0.25 + sp) * 6 + sp * t * 0.6) * c.k;
          const y = -riseY(t, -15) + (2 + t * 0.9) * c.k;
          fxFeather(g, c.ink, x, y, a0 + Math.sin(t * 0.3 + sp) * 50, 9 * c.k, 1 - life * life);
        }
      },
      motion: (f) => (f < 1 ? { vy: -15 } : {}),
    },
    {
      name: 'fall',
      label: 'Fall',
      group: 'Jump and air',
      input: 'Airborne, moving down',
      notes: 'Drifting down with arms spread for balance, legs loose and the heel wings fluttering.',
      frames: 30,
      loop: true,
      air: true,
      pose: (f) => fin(fallPose(f)),
    },
    {
      name: 'fastfall',
      label: 'Fast fall',
      group: 'Jump and air',
      input: 'Press down while falling',
      notes: 'Streamlined dive: legs together pointing down, arms and caduceus up, wind streaming past.',
      frames: 12,
      loop: true,
      air: true,
      pose(f) {
        const ph = (f / 12) * Math.PI * 2;
        return fin(Object.assign({}, AIR, {
          lean: -2 + 0.8 * Math.sin(ph), head: 12,
          la1: 166 + 2 * Math.sin(ph + 1), la2: 8,
          ra1: 160 + 2 * Math.sin(ph), ra2: 12, sa: 182 + 1.5 * Math.sin(ph + 0.6),
          ll1: -3 + 1.5 * Math.sin(2 * ph), ll2: -8, rl1: 3 + 1.5 * Math.sin(2 * ph + 1), rl2: -10,
          handB: 1,
          wing: 0.12 + 0.1 * Math.sin(2 * ph),
          cloak: 1.25,
        }));
      },
      fxBack(g, f, c) {
        // air streaming up past the body: crisp engraved streaks that race
        // from the feet to above the head (two passes per loop, seamless)
        const J = c.J;
        g.save();
        g.strokeStyle = c.ink;
        g.lineCap = 'round';
        const a0 = g.globalAlpha;
        const xs = [-31, -22, -13, 14, 23, 32, -4, 6, -26];
        for (let i = 0; i < xs.length; i++) {
          const u = ((2 * f) / 12 + i * 0.29) % 1;
          const y0 = J.footF[1] + 8 * c.k - u * 150 * c.k;
          const L = (30 + (i % 3) * 12) * c.k;
          g.globalAlpha = a0 * 0.9 * Math.sin(u * Math.PI);
          g.lineWidth = i % 3 === 0 ? 2 : i % 3 === 1 ? 1.2 : 0.8;
          const x = J.hip[0] + xs[i] * c.k;
          line(g, x, y0, x, y0 - L);
        }
        g.restore();
      },
    },
    {
      name: 'land',
      label: 'Land',
      group: 'Jump and air',
      input: 'Touch down from a jump',
      notes: 'Soft touchdown: the knees give, the arms settle and he rises back into stance.',
      frames: 5,
      pose: (() => {
        const s = groundSeq([
          [0, { hh: 43.5, lean: 9, head: 2, la1: -72, la2: 22, ra1: 58, ra2: 40, sa: 156, wing: 0.95, cloak: 0.75, handB: 1 }],
          [2, { hx: 1, hh: 39.5, lean: 15, head: -3, la1: 12, la2: 40, ra1: 30, ra2: 58, sa: 178, wing: 0.7, cloak: 0.55 }, 'out'],
          [5, {}],
        ]);
        return (f) => s(f);
      })(),
      fx(g, f, c) {
        const J = c.J;
        dust(g, c.ink, J.footB[0] - 3 * c.k, f / 6, 6 * c.k, -1, 0.65);
        dust(g, c.ink, J.footF[0] + 7 * c.k, f / 6, 6 * c.k, 1, 0.65);
      },
    },
    {
      name: 'land_heavy',
      label: 'Hard landing',
      group: 'Jump and air',
      input: 'Land from a fast fall or during an aerial',
      notes: 'Slams down into a deep squash with dust bursting to both sides, then pushes slowly back up.',
      frames: 12,
      pose: (() => {
        const s = groundSeq([
          [0, { hh: 39, lean: 18, head: 0, la1: -64, la2: 26, ra1: 66, ra2: 30, sa: 156, wing: 1.3, cloak: 1.1, handB: 1 }],
          [2, { hx: 2.5, hh: 29.5, lean: 31, head: -18, la1: 26, la2: 64, ra1: 26, ra2: 50, sa: 146, wing: 1.05, cloak: 0.95, handB: 1 }, 'out'],
          [5, { hx: 2.5, hh: 30.5, lean: 29, head: -16, la1: 20, la2: 60, ra1: 24, ra2: 54, sa: 150, wing: 0.7, cloak: 0.7, handB: 1 }],
          [12, {}],
        ]);
        return (f) => {
          const p = s(f);
          p.wing += settle(f, 2, 0.25, 4, 4);
          return p;
        };
      })(),
      fx(g, f, c) {
        const J = c.J;
        const t = f / 10;
        dust(g, c.ink, J.footB[0] - 4 * c.k, t, 12 * c.k, -1, 0.95);
        dust(g, c.ink, J.footF[0] + 9 * c.k, t, 12 * c.k, 1, 0.95);
        dust(g, c.ink, J.footB[0] - 14 * c.k, (f - 2) / 9, 7 * c.k, -1, 0.7);
        dust(g, c.ink, J.footF[0] + 19 * c.k, (f - 2) / 9, 7 * c.k, 1, 0.7);
      },
    },
    {
      name: 'helpless',
      label: 'Helpless fall',
      group: 'Jump and air',
      input: 'After the up special',
      notes: 'Spent after his up special: limp limbs trailing upward, slowly tumbling, wings drooping and a dazed swirl over his head.',
      frames: 40,
      loop: true,
      air: true,
      pose(f) {
        const ph = (f / 40) * Math.PI * 2;
        return fin(Object.assign({}, AIR, {
          // slow, lolling sway; every limb lags the body a little more
          rot: -12 + 16 * Math.sin(ph),
          lean: 8 + 5 * Math.sin(ph - 0.7),
          head: 20 + 8 * Math.sin(ph - 1.3),
          // arms float up loosely from the drag, elbows soft, hands open
          la1: -158 + 14 * Math.sin(ph - 1),
          la2: 52 + 14 * Math.sin(ph - 1.6),
          ra1: 90 + 10 * Math.sin(ph - 0.9),
          ra2: 26 + 12 * Math.sin(ph - 1.5),
          // the caduceus dangles from loose fingers like a pendulum
          sa: 14 + 18 * Math.sin(ph - 2.2),
          // legs hang slack, knees loose, feet trailing
          ll1: 6 + 9 * Math.sin(ph - 1.1),
          ll2: -48 + 12 * Math.sin(ph - 1.8),
          rl1: 26 + 10 * Math.sin(ph - 0.9),
          rl2: -64 + 12 * Math.sin(ph - 1.6),
          handB: 1,
          handF: 0,
          wing: -0.55 + 0.08 * Math.sin(2 * ph),
          cloak: 0.55 + 0.1 * Math.sin(ph - 0.5),
        }));
      },
      fx(g, f, c) {
        // dazed swirl: three small engraved stars circling over his head
        const ph = (f / 40) * Math.PI * 2;
        const J = c.J;
        const cx = J.top[0] - 2 * c.k;
        const cy = J.top[1] - 2 * c.k;
        g.save();
        g.strokeStyle = c.ink;
        g.lineCap = 'round';
        g.lineWidth = 0.7;
        g.globalAlpha *= 0.6;
        g.beginPath();
        g.ellipse(cx, cy, 13 * c.k, 3.5 * c.k, 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha /= 0.6;
        for (let i = 0; i < 3; i++) {
          const a = ph * 2 + (i * Math.PI * 2) / 3;
          const x = cx + Math.cos(a) * 13 * c.k;
          const y = cy + Math.sin(a) * 3.5 * c.k;
          const r = (1.8 + 0.8 * Math.sin(a)) * c.k;
          g.lineWidth = 1.1;
          line(g, x - r, y, x + r, y);
          line(g, x, y - r, x, y + r);
          g.lineWidth = 0.7;
          line(g, x - r * 0.6, y - r * 0.6, x + r * 0.6, y + r * 0.6);
          line(g, x - r * 0.6, y + r * 0.6, x + r * 0.6, y - r * 0.6);
        }
        g.restore();
      },
    },
    {
      name: 'platform_drop',
      label: 'Platform drop',
      group: 'Jump and air',
      input: 'Press down on a platform',
      notes: 'A small hop off the toes, then he drops straight through the platform with legs pressed together.',
      frames: 10,
      air: true,
      pose: (() => {
        const crouch = fin(Object.assign({}, GROUND, { hx: 1, hh: 41.5, lean: 11, head: -2, la1: -20, la2: 34, ra1: 20, ra2: 60, sa: 180, wing: 0.6, cloak: 0.35 }));
        const s = airSeq([
          [0, Object.assign({ air: 0, sa: crouch.lean + crouch.ra1 + crouch.ra2 + crouch.wpn }, crouch)],
          [3, { air: 0.5, oy: -7, lean: 2, head: -2, la1: 40, la2: 30, ra1: 54, ra2: 44, sa: 176, ll1: -5, ll2: -8, rl1: 5, rl2: -10, wing: 1.05, cloak: 0.5, handB: 1 }, 'out'],
          [6, { air: 1, oy: 0, lean: 0, head: 6, la1: 96, la2: 30, ra1: 66, ra2: 40, sa: 170, ll1: -4, ll2: -16, rl1: 6, rl2: -20, wing: 0.9, cloak: 0.85, handB: 1 }],
          [10, { air: 1, lean: 1, head: 5, la1: 112, la2: 34, ra1: 62, ra2: 44, sa: 165, ll1: -6, ll2: -22, rl1: 10, rl2: -30, wing: 0.7, cloak: 0.85, handB: 1 }],
        ]);
        return (f) => s(f);
      })(),
    },
  ]);
})();
