// Hermes — standing and moving on the ground.
//
// Grounded moves plant the feet with a small two-bone IK: a pose is keyed as a
// hip position (hx forward, hh height above the floor) and two foot positions
// (bx/bh back foot, fx/fh front foot; x in feet space, h above the floor), all
// in figure units. plant() turns those into leg angles, ox and lift, so a
// planted foot never slides. Locomotion cycles are generated from foot paths
// whose stance speed equals motion().vx, so the feet stay locked to the floor.
(() => {
  const SH = HERMES_SHAPE;
  const K = CHARACTERS.hermes.scale;

  // ---- feet and hips ---------------------------------------------------------
  const fk = (l1, l2, side) => {
    const a = dirv(l1);
    const b = dirv(l1 + l2);
    return [side * 4 + a[0] * SH.thigh + b[0] * SH.shin, a[1] * SH.thigh + b[1] * SH.shin];
  };
  const nB = fk(BASE_POSE.ll1, BASE_POSE.ll2, -1);
  const nF = fk(BASE_POSE.rl1, BASE_POSE.rl2, 1);
  const H0 = Math.max(nB[1], nF[1]);
  // neutral (idle) stance
  const NEUT = { hx: 0, hh: H0, bx: nB[0], bh: H0 - nB[1], fx: nF[0], fh: H0 - nF[1] };

  const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
  // two-bone leg IK, knee forward. (dx, dy) foot relative to the hip joint.
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
    p.ll1 = ll1;
    p.ll2 = ll2;
    p.rl1 = rl1;
    p.rl2 = rl2;
    p.ox = (p.ox || 0) + p.hx;
    p.lift = (p.lift || 0) + Math.min(p.bh, p.fh);
    for (const k of TRACK) delete p[k];
    return p;
  }

  // keyed tween over arbitrary channels; every key is merged onto base.
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
  // finish a keyed pose: 'sa' is an absolute staff angle, hh/hx/.. are planted feet
  function fin(p) {
    if (p.sa != null) p.wpn = p.sa - (p.lean + p.ra1 + p.ra2);
    delete p.sa;
    return 'hh' in p ? plant(p) : p;
  }
  const IDLE_SA = BASE_POSE.lean + BASE_POSE.ra1 + BASE_POSE.ra2 + BASE_POSE.wpn;
  const GROUND = Object.assign({}, BASE_POSE, NEUT, { sa: IDLE_SA });
  delete GROUND.ll1;
  delete GROUND.ll2;
  delete GROUND.rl1;
  delete GROUND.rl2;
  const groundSeq = (keys) => {
    const s = seq(GROUND, keys);
    return (f) => fin(s(f));
  };
  // damped wobble that starts at frame f0 (overlapping action)
  const settle = (f, f0, amp, period, decay) => (f < f0 ? 0 : amp * Math.exp(-(f - f0) / decay) * Math.sin(((f - f0) / period) * Math.PI * 2));
  // a staff angle in absolute terms -> wpn channel
  const staffAt = (p, abs) => abs - (p.lean + p.ra1 + p.ra2);

  // Hermite spline through timed points [[t, x, y], ...] with end tangents.
  function spline(pts, m0, m1) {
    const n = pts.length;
    const tan = pts.map((p, i) => {
      if (i === 0) return m0;
      if (i === n - 1) return m1;
      const a = pts[i - 1];
      const b = pts[i + 1];
      const dt = b[0] - a[0];
      return [(b[1] - a[1]) / dt, (b[2] - a[2]) / dt];
    });
    return (t) => {
      let i = 0;
      while (i < n - 2 && t > pts[i + 1][0]) i++;
      const a = pts[i];
      const b = pts[i + 1];
      const h = b[0] - a[0];
      const s = clamp((t - a[0]) / h, 0, 1);
      const s2 = s * s;
      const s3 = s2 * s;
      const h00 = 2 * s3 - 3 * s2 + 1;
      const h10 = s3 - 2 * s2 + s;
      const h01 = -2 * s3 + 3 * s2;
      const h11 = s3 - s2;
      return [
        h00 * a[1] + h10 * h * tan[i][0] + h01 * b[1] + h11 * h * tan[i + 1][0],
        h00 * a[2] + h10 * h * tan[i][1] + h01 * b[2] + h11 * h * tan[i + 1][1],
      ];
    };
  }

  // One foot of a locomotion cycle. u in [0,1): stance first (touchdown at u=0).
  // Returns [x, h] relative to that leg's hip joint.
  function gaitFoot(G, u) {
    if (u < G.duty) return [G.td - u * G.sweep / G.duty, 0];
    return G.swing((u - G.duty) / (1 - G.duty));
  }
  function makeGait(o) {
    const sweep = (o.duty * o.P * o.vx) / K; // stance travel, figure units
    const td = sweep * o.ahead;
    const to = td - sweep;
    const vs = -sweep / o.duty; // stance velocity per unit u
    const sw = (1 - o.duty); // swing length in u
    const pts = [[0, to, 0]].concat(o.path(to, td)).concat([[1, td, 0]]);
    // end tangents in swing-normalised time
    const swing = spline(pts, [vs * sw * 0.6, o.lift0 || 0], [vs * sw * 0.5, -(o.land0 || 0)]);
    return Object.assign({ sweep, td, to, swing }, o);
  }

  // ---- run cycle --------------------------------------------------------------
  const RUN = makeGait({
    P: 36, vx: 9, duty: 0.19, ahead: 0.42, lift0: 60, land0: 30,
    path: (to, td) => [
      [0.17, -32, 9],
      [0.38, -30, 22],
      [0.56, -10, 28],
      [0.73, 14, 24],
      [0.88, td + 7, 10],
    ],
  });
  // run hip height over a half cycle (w = 0 at a touchdown)
  const runHip = (w) => {
    const d2 = RUN.duty * 2;
    return w < d2 ? 41.3 - 1.6 * Math.sin((Math.PI * w) / d2) : 41.3 + 4.2 * Math.sin((Math.PI * (w - d2)) / (1 - d2));
  };
  function runTracks(f) {
    const u = (((f / RUN.P) % 1) + 1) % 1;
    const b = gaitFoot(RUN, u);
    const fr = gaitFoot(RUN, (u + 0.5) % 1);
    const w = (u * 2) % 1;
    return { hx: 0, hh: runHip(w), bx: b[0] - 4, bh: b[1], fx: fr[0] + 4, fh: fr[1] };
  }
  function runUpper(f) {
    const u = f / RUN.P;
    const ph = Math.PI * 2 * u;
    const farLeg = Math.cos(ph + 0.5); // +1 when the far leg reaches forward
    const lean = 22 + 2.2 * Math.cos(2 * ph - 0.6);
    const p = {
      lean,
      head: -11 - 2 * Math.cos(2 * ph - 0.3),
      la1: 8 - 62 * farLeg,
      la2: 78 + 22 * Math.max(0, -farLeg),
      ra1: 34 + 34 * farLeg,
      ra2: 62 - 12 * farLeg,
      handB: 0,
      wing: 0.75 + 0.45 * Math.sin(2 * ph * 2 + 0.4),
      cloak: 1.05 + 0.12 * Math.sin(2 * ph + 1),
    };
    // staff carried leaning forward, swinging a little behind the arm
    p.wpn = staffAt(p, 158 + 10 * Math.cos(ph + 0.5 - 0.9));
    return p;
  }
  const runPose = (f) => plant(Object.assign({}, BASE_POSE, runUpper(f), runTracks(f)));

  // ---- walk cycle -------------------------------------------------------------
  const WALK = makeGait({
    P: 44, vx: 2.6, duty: 0.53, ahead: 0.5, lift0: 10, land0: 6,
    path: (to, td) => [
      [0.3, to * 0.45, 4.2],
      [0.62, td * 0.35, 5],
      [0.85, td * 0.9, 2.4],
    ],
  });
  function walkPose(f) {
    const u = (((f / WALK.P) % 1) + 1) % 1;
    const ph = Math.PI * 2 * u;
    const b = gaitFoot(WALK, u);
    const fr = gaitFoot(WALK, (u + 0.5) % 1);
    // highest over each mid-stance, lowest in double support
    const hh = 44.9 + 1.3 * Math.cos(4 * Math.PI * (u - WALK.duty / 2));
    const farLeg = Math.cos(ph - 0.2 + Math.PI * 0.05);
    const p = Object.assign({}, BASE_POSE, {
      hx: 0.6, hh, bx: b[0] - 4, bh: b[1], fx: fr[0] + 4, fh: fr[1],
      lean: 7 + 1.2 * Math.cos(4 * Math.PI * (u - WALK.duty / 2) + 0.6),
      head: -2 - 1.5 * Math.cos(4 * Math.PI * (u - WALK.duty / 2) + 1.2),
      la1: -6 - 24 * farLeg,
      la2: 22 + 10 * Math.max(0, -farLeg),
      ra1: 24 + 20 * farLeg,
      ra2: 52 + 6 * farLeg,
      wing: 0.38 + 0.16 * Math.sin(4 * ph + 1),
      cloak: 0.42 + 0.08 * Math.sin(2 * ph + 1.4),
    });
    // jaunty cane swing: the staff tips forward on the forward swing, with lag
    p.wpn = staffAt(p, 168 - 22 * Math.cos(ph - 0.2 - 0.7));
    return plant(p);
  }

  // ---- dash -------------------------------------------------------------------
  const dashVx = (f) => (f < 1 ? 3 : f < 2 ? 5 : 10);
  const dashOrigin = (f) => {
    let s = 0;
    for (let i = 0; i < Math.floor(f); i++) s += dashVx(i);
    s += (f - Math.floor(f)) * dashVx(Math.floor(f));
    return s / K;
  };
  const R0 = runTracks(0);
  const RU0 = runUpper(0);
  // near foot is the push foot: locked to the floor until toe-off
  const dashNearX = (f) => NEUT.fx - dashOrigin(f);
  const RU0_SA = RU0.lean + RU0.ra1 + RU0.ra2 + RU0.wpn;
  const dashUpper = seq(Object.assign({}, BASE_POSE, { sa: IDLE_SA }), [
    [0, {}],
    [2, { lean: 14, head: -4, la1: 34, la2: 60, ra1: -4, ra2: 74, sa: 152, wing: 0.9, cloak: 0.5 }, 'out'],
    [6, { lean: 34, head: -14, la1: -82, la2: 32, ra1: 42, ra2: 40, sa: 116, wing: 1.35, cloak: 1.3, handB: 1 }, 'out'],
    [11, { lean: 27, head: -12, la1: -44, la2: 70, ra1: 50, ra2: 50, sa: 138, wing: 1.0, cloak: 1.2 }],
    [16, Object.assign({}, RU0, { sa: RU0_SA })],
  ]);
  const dashLegs = seq({}, [
    [0, { hx: 0, hh: NEUT.hh, bx: NEUT.bx, bh: NEUT.bh, fx: dashNearX(0), fh: 0 }],
    [2, { hx: -1, hh: 42.5, bx: NEUT.bx - dashOrigin(2), bh: 1.5, fx: dashNearX(2), fh: 0 }, 'out'],
    [4, { hx: 3, hh: 40.5, bx: -12, bh: 11, fx: dashNearX(4), fh: 0 }],
    [6, { hx: 4, hh: 39.5, bx: 12, bh: 20, fx: dashNearX(6), fh: 0 }],
    [8, { hx: 3, hh: 42.5, bx: 24, bh: 17, fx: -30, fh: 9 }, 'lin'],
    [11, { hx: 1.5, hh: 44.5, bx: 28, bh: 9, fx: -32, fh: 20 }],
    [16, { hx: 0, hh: R0.hh, bx: R0.bx, bh: R0.bh, fx: R0.fx, fh: R0.fh }],
  ]);

  // ---- skid / turn helpers ---------------------------------------------------------
  const skidVx = (f) => 8 * Math.pow(Math.max(0, 1 - f / 10), 1.4);
  const turnVx = (f) => {
    const t = f / 12;
    return -6.5 * Math.pow(Math.max(0, 1 - t / 0.6), 1.5) + 7 * smoothstep(0.45, 1, t);
  };
  const turnOrigin = (f) => {
    let s = 0;
    for (let i = 0; i < Math.floor(f); i++) s += turnVx(i);
    s += (f - Math.floor(f)) * turnVx(Math.floor(f));
    return s / K;
  };

  // ---- crouch ----------------------------------------------------------------
  // low guard: hips well down (smaller hurtbox read), staff held diagonally
  // across the body in front of the chest, open back hand ready.
  const CROUCH = {
    hx: 3, hh: 25.5, bx: NEUT.bx - 2, bh: 0, fx: NEUT.fx + 2, fh: 0,
    lean: 30, head: -20, la1: 46, la2: 58, ra1: 4, ra2: 98, sa: 150, handB: 1, wing: 0.5, cloak: 0.45,
  };

  // ---- effects ---------------------------------------------------------------
  // engraved dust cloud: three billows that swell, drift and thin out
  function dust(g, c, x, t, size, dir, alpha) {
    if (t < 0 || t > 1) return;
    const ink = c.ink;
    g.save();
    g.globalAlpha *= (alpha == null ? 1 : alpha) * (1 - t * t);
    const r = size * (0.32 + 0.6 * Math.sqrt(t));
    const cx = x + dir * size * 1.3 * t;
    const cy = -r * 0.55 - size * 0.25 * t;
    const lobes = [[-0.75, 0.2, 0.55], [0, -0.2, 0.78], [0.8, 0.15, 0.5]];
    const path = (q) => {
      for (const [dx, dy, rr] of lobes) {
        q.moveTo(cx + dir * dx * r + rr * r, cy + dy * r);
        q.arc(cx + dir * dx * r, cy + dy * r, rr * r, 0, Math.PI * 2);
      }
    };
    g.beginPath();
    path(g);
    g.strokeStyle = ink;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    g.globalAlpha *= 0.8;
    g.fillStyle = inkPatterns(g, ink).hatch;
    g.fill();
    // flung grit
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
  // small ink scuff strokes on the floor
  function scuff(g, ink, x, w, n, alpha) {
    g.save();
    g.globalAlpha *= alpha;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      g.lineWidth = i === 0 ? 1.6 : 0.8;
      const y = -0.5 - i * 2.2;
      line(g, x - w * (1 - i * 0.25), y, x + w * 0.2, y);
    }
    g.restore();
  }

  defineAnims('hermes', [
    {
      name: 'idle',
      label: 'Idle',
      group: 'Stand and move',
      input: 'No input',
      notes: 'Relaxed contrapposto with the caduceus upright, slow breathing while the cloak and heel wings drift.',
      frames: 120,
      loop: true,
      pose(f) {
        const ph = (f / 120) * Math.PI * 2;
        const b = Math.sin(ph);
        const p = Object.assign({}, GROUND, {
          hx: 0.7 * Math.sin(ph + 0.4),
          hh: H0 - 0.35 - 0.35 * Math.cos(2 * ph),
          lean: 4 + 1.3 * b,
          head: -1.2 * b + 1.2 * Math.sin(2 * ph + 0.8),
          la1: -14 + 2.5 * Math.sin(ph - 0.5),
          la2: 26 + 4 * Math.sin(ph - 1.1),
          ra1: 26 + 1.5 * b,
          ra2: 56 - 2 * b,
          wing: 0.32 + 0.1 * Math.sin(3 * ph) + 0.05 * Math.sin(7 * ph + 1),
          cloak: 0.25 + 0.07 * Math.sin(ph - 1.2) + 0.03 * Math.sin(3 * ph),
        });
        p.sa = IDLE_SA + 1.5 * Math.sin(ph - 1.4);
        return fin(p);
      },
    },
    {
      name: 'walk',
      label: 'Walk',
      group: 'Stand and move',
      input: 'Tilt left or right gently',
      notes: 'Light, confident stride with heel-to-toe steps, swinging the caduceus like a walking cane.',
      frames: WALK.P,
      loop: true,
      pose: (f) => walkPose(f),
      motion: () => ({ vx: WALK.vx }),
    },
    {
      name: 'dash',
      label: 'Dash',
      group: 'Stand and move',
      input: 'Flick left or right',
      notes: 'Explosive start: a quick dip, a deep forward lean off the push foot and a bounding first stride into the run.',
      frames: 16,
      pose(f) {
        const p = Object.assign({}, dashUpper(f), dashLegs(f));
        // the push foot stays locked to the floor until it peels off
        if (f <= 6) {
          p.fx = dashNearX(f);
          p.fh = 0;
        } else if (f < 8) {
          const t = (f - 6) / 2;
          p.fx = lerp(dashNearX(6) - (dashOrigin(f) - dashOrigin(6)), p.fx, t * t);
          p.fh = lerp(0, p.fh, t);
        }
        return fin(p);
      },
      fxBack(g, f, c) {
        // push-off dust kicked up behind the planted foot
        const x0 = (NEUT.fx - dashOrigin(f)) * c.k;
        dust(g, c, x0 - 4 * c.k, (f - 3) / 9, 13 * c.k, -1, 0.95);
        dust(g, c, x0 - 12 * c.k, (f - 5) / 9, 9 * c.k, -1, 0.7);
        if (f >= 2 && f <= 7) scuff(g, c.ink, x0 + 8 * c.k, 10 * c.k, 3, 1 - (f - 2) / 6);
      },
      fx(g, f, c) {
        if (f < 4 || f > 14) return;
        const a = smoothstep(4, 6, f) * (1 - smoothstep(10, 14, f));
        const J = c.J;
        fxSpeedLines(g, c.ink, [J.hip[0] - 22 * c.k, J.hip[1] - 22 * c.k], [1, 0], 42 * c.k, 56 * c.k, 5, a * 0.85, c.rnd);
      },
      motion: (f) => ({ vx: dashVx(f) }),
      next: 'run',
    },
    {
      name: 'run',
      label: 'Run',
      group: 'Stand and move',
      input: 'Hold left or right',
      notes: 'Airy sprint with a real flight phase: high knees, heel kick, pumping arms, cloak streaming and heel wings beating.',
      frames: RUN.P,
      loop: true,
      pose: (f) => runPose(f),
      motion: () => ({ vx: RUN.vx }),
    },
    {
      name: 'skid',
      label: 'Skid',
      group: 'Stand and move',
      input: 'Release or reverse out of a run',
      notes: 'Heels dig in and plough the floor while he leans back against the momentum, then steps back into stance.',
      frames: 14,
      pose: (() => {
        const s = groundSeq([
          [0, { hx: 1, hh: 41, bx: -18, bh: 3, fx: 22, fh: 2, lean: 12, head: -6, la1: -40, la2: 60, ra1: 40, ra2: 50, sa: 196, wing: 0.9, cloak: 1.1 }],
          [2, { hx: -4, hh: 37, bx: -21, bh: 0, fx: 26, fh: 0, lean: -21, head: 9, la1: 118, la2: 28, ra1: 84, ra2: 10, sa: 136, wing: 1.3, cloak: 1.35, handB: 1 }, 'out'],
          [7, { hx: -3, hh: 38, bx: -21, bh: 0, fx: 25, fh: 0, lean: -15, head: 5, la1: 100, la2: 34, ra1: 74, ra2: 16, sa: 146, wing: 0.9, cloak: 1.1, handB: 1 }],
          [10, { hx: -0.5, hh: 43, bx: -22, bh: 1, fx: 19, fh: 5, lean: -2, head: 0, la1: 20, la2: 34, ra1: 40, ra2: 44, sa: 180, wing: 0.6, cloak: 0.6 }],
          [14, {}],
        ]);
        return (f) => {
          const p = s(f);
          p.wing += settle(f, 2, 0.25, 4, 4);
          p.cloak += settle(f, 9, 0.12, 6, 4);
          return p;
        };
      })(),
      fx(g, f, c) {
        if (f > 11) return;
        const J = c.J;
        // ploughed dust spraying forward off the leading heel
        const x = J.footF[0] + 6 * c.k;
        dust(g, c, x, (f % 5) / 6 + 0.1, (8 + 4 * (1 - f / 11)) * c.k, 1, 1 - f / 12);
        dust(g, c, x + 6 * c.k, ((f + 2.5) % 5) / 6 + 0.1, 6 * c.k, 1, 0.8 * (1 - f / 12));
        scuff(g, c.ink, J.footF[0] - 2 * c.k, 22 * c.k * (1 - f / 14), 3, 1 - f / 11);
      },
      motion: (f) => ({ vx: skidVx(f) }),
    },
    {
      name: 'turn',
      label: 'Turnaround',
      group: 'Stand and move',
      input: 'Reverse direction during a run',
      notes: 'Pivots on the planted foot: still carried backwards and glancing over his shoulder, then whips round into the run.',
      frames: 12,
      pose: (() => {
        // pivot foot locked to the floor (world x) through the turn
        const W = 10;
        const piv = (f) => W - turnOrigin(f);
        const up = seq(Object.assign({}, BASE_POSE, { sa: IDLE_SA }), [
          [0, { lean: -24, head: 16, rot: -4, la1: 70, la2: 40, ra1: 130, ra2: 30, sa: 205, wing: 1.1, cloak: 1.3, handB: 1 }],
          [4, { lean: -11, head: 6, rot: -2, la1: 20, la2: 50, ra1: 18, ra2: 62, sa: 150, wing: 0.9, cloak: 0.9, handB: 1 }, 'inOut'],
          [8, { lean: 25, head: -12, la1: -62, la2: 50, ra1: 46, ra2: 44, sa: 134, wing: 1.25, cloak: 1.1 }, 'out'],
          [12, Object.assign({}, RU0, { sa: RU0_SA })],
        ]);
        const legs = seq({}, [
          [0, { hx: -6, hh: 40, bx: -28, bh: 6, fx: piv(0), fh: 0 }],
          [4, { hx: -3, hh: 38.5, bx: -22, bh: 9, fx: piv(4), fh: 0 }],
          [8, { hx: 3, hh: 40.5, bx: 14, bh: 14, fx: piv(8), fh: 0 }],
          [12, { hx: 0, hh: R0.hh, bx: R0.bx, bh: R0.bh, fx: R0.fx, fh: R0.fh }],
        ]);
        return (f) => {
          const p = Object.assign({}, up(f), legs(f));
          if (f <= 8) p.fx = piv(f);
          return fin(p);
        };
      })(),
      fx(g, f, c) {
        if (f > 8) return;
        const x = (10 - turnOrigin(f)) * c.k;
        dust(g, c, x - 4 * c.k, f / 8, 11 * c.k, -1, 0.9);
        dust(g, c, x + 8 * c.k, (f - 2) / 7, 8 * c.k, 1, 0.7);
        scuff(g, c.ink, x + 6 * c.k, 14 * c.k, 2, 1 - f / 8);
      },
      motion: (f) => ({ vx: turnVx(f) }),
      next: 'run',
    },
    {
      name: 'crouch',
      label: 'Crouch',
      group: 'Stand and move',
      input: 'Hold down',
      notes: 'Drops into a low guard with the caduceus brought across the body.',
      frames: 6,
      pose: (() => {
        const s = groundSeq([
          [0, {}],
          [3, Object.assign({}, CROUCH, { hh: CROUCH.hh - 2, lean: CROUCH.lean + 4, head: CROUCH.head - 2, sa: CROUCH.sa - 6, wing: 0.9, cloak: 0.65 }), 'out'],
          [6, CROUCH],
        ]);
        return (f) => s(f);
      })(),
      next: 'crouch_idle',
    },
    {
      name: 'crouch_idle',
      label: 'Crouch hold',
      group: 'Stand and move',
      input: 'Keep holding down',
      notes: 'Low, alert crouch with the staff held across, breathing and watching.',
      frames: 60,
      loop: true,
      pose(f) {
        const ph = (f / 60) * Math.PI * 2;
        const b = Math.sin(ph);
        const p = Object.assign({}, GROUND, CROUCH, {
          hh: CROUCH.hh + 0.5 * b,
          hx: CROUCH.hx + 0.3 * Math.sin(ph - 0.8),
          lean: CROUCH.lean - 1.4 * b,
          head: CROUCH.head + 1.6 * b + 1.5 * Math.sin(2 * ph + 0.5),
          la2: CROUCH.la2 + 3 * Math.sin(ph - 0.9),
          ra1: CROUCH.ra1 + 1.5 * b,
          sa: CROUCH.sa + 1.8 * Math.sin(ph - 0.6),
          wing: 0.5 + 0.12 * Math.sin(3 * ph) + 0.05 * Math.sin(5 * ph),
          cloak: 0.45 + 0.05 * Math.sin(ph - 1.3),
        });
        return fin(p);
      },
    },
    {
      name: 'crouch_up',
      label: 'Stand up',
      group: 'Stand and move',
      input: 'Release down',
      notes: 'Rises out of the crouch with a light settle back into the idle stance.',
      frames: 6,
      pose: (() => {
        const s = groundSeq([
          [0, CROUCH],
          [3, { hh: H0 - 1.5, lean: 6, head: -3, la1: -8, la2: 30, ra1: 30, ra2: 56, sa: 184, wing: 0.55, cloak: 0.4 }, 'out'],
          [6, {}],
        ]);
        return (f) => s(f);
      })(),
    },
    {
      name: 'teeter',
      label: 'Teeter',
      group: 'Stand and move',
      input: 'Stand at a ledge edge',
      notes: 'Rocks on his back foot at the brink with the front foot over the void, back arm windmilling and heel wings beating to haul himself back.',
      frames: 60,
      loop: true,
      pose(f) {
        const ph = (f / 60) * Math.PI * 2;
        const rock = Math.sin(2 * ph - 0.6); // +1 tipping toward the void
        const spin = 2 * ph; // windmill, two turns per loop
        const p = Object.assign({}, GROUND, {
          // hips pushed back over the planted foot, rocking toward the drop
          hx: -10 + 3 * rock,
          hh: 41.5 - 0.8 * Math.sin(4 * ph),
          bx: -11, bh: 0,
          // front foot lifted off the edge, pawing at the air over the void
          fx: 15 + 3 * rock + 2 * Math.sin(4 * ph + 0.5), fh: 6 + 6 * Math.sin(2 * ph + 0.9),
          lean: -24 + 10 * rock,
          head: 26 + 6 * rock,
          la1: 160 - ((spin / D2R) % 360),
          la2: 14 + 8 * Math.sin(spin),
          ra1: 124 + 40 * Math.sin(spin + 2.2),
          ra2: 22 + 18 * Math.sin(spin + 0.8),
          handB: 1,
          wing: 0.75 + 0.75 * Math.sin(6 * ph),
          cloak: 0.75 + 0.25 * Math.sin(2 * ph - 1.6),
        });
        p.sa = 176 + 24 * Math.sin(spin + 1.4);
        return fin(p);
      },
      fxBack(g, f, c) {
        // motion arcs trailing the windmilling hand (behind the body)
        const pts = [];
        for (let i = 7; i >= 0; i--) pts.push(c.sample(f - i).handB);
        g.save();
        g.strokeStyle = c.ink;
        g.lineCap = 'round';
        const a0 = g.globalAlpha;
        for (let j = 0; j < 2; j++) {
          g.lineWidth = j ? 0.7 : 1.3;
          g.globalAlpha = a0 * (j ? 0.5 : 0.75);
          g.beginPath();
          pts.forEach((p, i) => {
            const cx = c.J.sh[0];
            const cy = c.J.sh[1];
            const s = 1 + (j ? 0.32 : 0.18);
            const x = cx + (p[0] - cx) * s;
            const y = cy + (p[1] - cy) * s;
            if (i === 0) g.moveTo(x, y);
            else if (i < pts.length - 1) g.lineTo(x, y);
          });
          g.stroke();
        }
        g.restore();
      },
      fx(g, f, c) {
        // a bead of sweat flicked off the brow
        const t = (f % 30) / 30;
        if (t >= 0.6) return;
        const J = c.J;
        const x = J.head[0] - 6 * c.k - t * 14 * c.k;
        const y = J.head[1] - 9 * c.k - Math.sin(t * Math.PI) * 8 * c.k;
        g.save();
        g.globalAlpha *= 1 - t / 0.6;
        g.strokeStyle = c.ink;
        g.beginPath();
        g.ellipse(x, y, 1.6 * c.k, 2.4 * c.k, -0.5, 0, Math.PI * 2);
        g.fillStyle = PAPER_LIGHT;
        g.fill();
        g.lineWidth = 1;
        g.stroke();
        g.restore();
      },
    },
  ]);
})();
