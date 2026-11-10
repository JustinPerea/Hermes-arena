// Hermes — ledge: grab, hang, climb, jump, roll and attack.
// SPECIAL COORDINATES: the origin is the ledge corner. The stage top is y = 0
// for x >= 0, the wall drops from (0, 0), the void is x < 0.
(() => {
  // ---- placement solver ------------------------------------------------------
  // Keys carry extra channels (all in figure units, corner coordinates) that pin
  // a body part instead of moving the root. They are blended by weight:
  //   wH  hands: the hands' mid point (hb = share of the back hand) on (hx, hy)
  //   wP  hips: the hip joint on (px, py)
  //   wG  floor: the lowest foot (gAll = 1: lowest body part) rests on y = 0, x from ox
  //   the rest (1 - wH - wP - wG) is free flight on ox / oy.
  // ikF / ikB solve the front / back leg so the ankle reaches (fFx, fFy) /
  // (fBx, fBy) from the hip target (px, py): planted feet never slide.
  const EX = { wH: 0, hx: 0, hy: 0, hb: 0.5, wP: 0, px: 0, py: 0, wG: 0, gAll: 0, gCl: 0, hop: 0, ikF: 0, fFx: 0, fFy: -3, ikB: 0, fBx: 0, fBy: -3 };
  const SH1 = Object.assign({}, HERMES_SHAPE, { scale: 1 });
  const RAD = { head: 9, sh: 10, hip: 9, center: 13, kneeF: 5.5, kneeB: 5.5, footF: 4, footB: 4, handF: 3, handB: 3, elbowF: 4, elbowB: 4 };
  const TH = HERMES_SHAPE.thigh;
  const SN = HERMES_SHAPE.shin;

  // two-bone leg: thigh angle (absolute) and knee bend reaching (tx, ty) from (rx, ry)
  function legIK(rx, ry, tx, ty) {
    const vx = tx - rx;
    const vy = ty - ry;
    const d = clamp(Math.hypot(vx, vy), 2, TH + SN - 0.05);
    const a = Math.atan2(vx, vy) / D2R;
    const al = Math.acos(clamp((TH * TH + d * d - SN * SN) / (2 * TH * d), -1, 1)) / D2R;
    const be = Math.acos(clamp((TH * TH + SN * SN - d * d) / (2 * TH * SN), -1, 1)) / D2R;
    return [a + al, -(180 - be)];
  }

  function solve(q) {
    const p = {};
    for (const k in q) if (!(k in EX)) p[k] = q[k];
    p.rot = (((p.rot || 0) % 360) + 540) % 360 - 180;
    if (q.ikF > 0) {
      const [a, b] = legIK(q.px + 4, q.py, q.fFx, q.fFy);
      p.rl1 = lerp(p.rl1, a, q.ikF);
      p.rl2 = lerp(p.rl2, b, q.ikF);
    }
    if (q.ikB > 0) {
      const [a, b] = legIK(q.px - 4, q.py, q.fBx, q.fBy);
      p.ll1 = lerp(p.ll1, a, q.ikB);
      p.ll2 = lerp(p.ll2, b, q.ikB);
    }
    const P1 = Object.assign({}, BASE_POSE, p, { ox: 0, oy: 0 });
    const FR = hermesFrame(P1, SH1);
    const J = FR.J;
    const hand = [lerp(J.handF[0], J.handB[0], q.hb), lerp(J.handF[1], J.handB[1], q.hb)];
    let low = Math.max(J.footF[1], J.footB[1]) + 3;
    if (q.gAll > 0) {
      let all = -1e9;
      for (const k in RAD) all = Math.max(all, J[k][1] + RAD[k]);
      low = lerp(low, all, q.gAll);
    }
    // gCl: the streaming cloak hem counts as a body part too, so it never dips into the floor
    if (q.gCl > 0) {
      let hl = -1e9;
      for (const h of cloakGeometry(FR.sk, SH1, P1, {}).hem) hl = Math.max(hl, FR.toLocal(h)[1] + 4);
      low = lerp(low, Math.max(low, hl), q.gCl);
    }
    const wF = 1 - q.wH - q.wP - q.wG;
    p.ox = q.wH * (q.hx - hand[0]) + q.wP * (q.px - J.hip[0]) + q.wG * q.ox + wF * q.ox;
    p.oy = q.wH * (q.hy - hand[1]) + q.wP * (q.py - J.hip[1]) + q.wG * (-low - q.hop) + wF * q.oy;
    return p;
  }
  // keyframes over frame numbers with the extra channels
  const track = (keys) => {
    const K = keyframes(keys.map(([t, p, e]) => [t, Object.assign({}, EX, p), e]));
    return (f) => solve(K(f));
  };
  // idle stance placed with the hips at x (figure units): exact match of the idle pose
  const J0 = hermesFrame(BASE_POSE, SH1).J;
  const standAt = (x) => ({
    air: 0, wP: 1, px: x, py: J0.hip[1],
    ikF: 1, fFx: x + J0.footF[0], fFy: J0.footF[1], ikB: 1, fBx: x + J0.footB[0], fBy: J0.footB[1],
  });
  // a planted stance: hips at (x, y), ankles on the floor at fx (front) and bx (back)
  const plant = (x, y, fx, bx, extra) => Object.assign({ wP: 1, px: x, py: y, ikF: 1, fFx: fx, ikB: 1, fBx: bx }, extra || {});

  const PH = (f, n) => (f / n) * Math.PI * 2;
  const S = 1.42; // nominal scale: stage x in world px = figure units * S

  // ---- key poses ---------------------------------------------------------------
  const HANG = {
    air: 1, lean: 0, head: -24, rot: 0,
    ra1: 173, ra2: 4, la1: 150, la2: 8, wpn: -66, handF: 0, handB: 0,
    ll1: -12, ll2: -16, rl1: -1, rl2: -24,
    wing: 0.6, cloak: 0.55,
    wH: 1, hx: -3, hy: -1, hb: 0.5, px: -12, py: 62,
  };
  const X = (px) => px / S; // stage x in world px -> figure units
  // pull-up: chest at the lip, elbows driving back (hands still pinned)
  const PULL = { ...HANG, lean: 8, head: -12, ra1: -36, ra2: 150, la1: -10, la2: 128, wpn: -50,
    ll1: 8, ll2: -74, rl1: 28, rl2: -92, wing: 1, cloak: 0.9, py: 20, px: -16 };
  // mantle: arms locked under the shoulders, hips over, front knee driving up
  const MANTLE = { ...HANG, lean: 56, head: -16, ra1: -46, ra2: 6, la1: -54, la2: 10, wpn: 64,
    ll1: 6, ll2: -50, rl1: 104, rl2: -126, wing: 0.9, cloak: 1, py: -12, px: -24 };
  // ---- shared effects ----------------------------------------------------------------
  // short ink grip marks at the corner (fingers biting the stone)
  function gripMarks(g, ink, t, s) {
    if (t <= 0 || t >= 1) return;
    g.save();
    g.globalAlpha *= 1 - t;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    const r0 = 6 * s + t * 10 * s;
    for (let i = 0; i < 7; i++) {
      const a = (-160 + i * 22) * D2R;
      g.lineWidth = i % 2 ? 0.8 : 1.6;
      const r1 = r0 + (i % 2 ? 6 : 11) * s;
      line(g, Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1);
    }
    g.restore();
  }
  // a small cloud of stone dust on the stage top at x, billowing along dir, with skid lines
  const puff = (g, ink, x, t, size, dir) => {
    if (t <= 0 || t >= 1) return;
    const k = size / 7;
    const d = dir || 1;
    const P = inkPatterns(g, ink);
    const u = EASE.out(t);
    g.save();
    g.globalAlpha *= (1 - t) * 0.9;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const x0 = x + d * (2 + u * 8) * k;
    const bumps = [[0, 3 + u * 3], [6 + u * 6, 4 + u * 4], [13 + u * 11, 2.6 + u * 3.4]];
    g.beginPath();
    g.moveTo(x0 - d * 3 * k, 0);
    for (const [o, r] of bumps) {
      const rr = r * k;
      g.arc(x0 + d * o * k, -rr * 0.7, rr, d > 0 ? Math.PI * 0.95 : Math.PI * 0.05, d > 0 ? Math.PI * 2.05 : -Math.PI * 1.05, d < 0);
    }
    g.lineTo(x0 + d * (bumps[2][0] + bumps[2][1] + 1) * k, 0);
    g.closePath();
    g.fillStyle = rgba(PAPER_LIGHT, 0.85);
    g.fill();
    g.fillStyle = P.fine;
    g.fill();
    g.lineWidth = 0.8 * k;
    g.stroke();
    g.lineWidth = 0.55 * k;
    for (let i = 0; i < 2; i++) line(g, x - d * (2 + i * 4) * k, -(0.5 + i * 1.6) * k, x + d * (10 + u * 16 + i * 5) * k, -(0.5 + i * 1.6) * k);
    g.restore();
  };

  // ---- definitions ---------------------------------------------------------------------
  const grabK = track([
    [0, { ...HANG, rot: 34, ra1: 168, la1: 146, lean: -10, head: -26, ll1: -40, ll2: -30, rl1: -22, rl2: -40, wpn: -20, wing: 1.2, cloak: 1.2, handF: 1, handB: 1 }],
    [2, { ...HANG, rot: 14, lean: -8, head: -22, ll1: -16, ll2: -36, rl1: -2, rl2: -46, wpn: -52, wing: 1, cloak: 1.1 }, 'out'],
    [5, { ...HANG, rot: -7, ll1: 22, ll2: -58, rl1: 38, rl2: -70, wing: 0.9, cloak: 0.8, head: -10 }, 'inOut'],
    [8, { ...HANG }, 'inOut'],
  ]);

  const climbK = track([
    [0, { ...HANG }],
    [5, { ...HANG, head: -4, ll1: 4, ll2: -40, rl1: 22, rl2: -56, wing: 0.9, cloak: 0.7, rot: -3 }, 'inOut'],
    [11, { ...PULL }, 'out'],
    [15, { ...MANTLE }, 'inOut'],
    // front foot reaches out and plants on the stage, back knee on the lip
    [19, { air: 1, lean: 36, head: -10, ra1: 40, ra2: 50, la1: -24, la2: 24, wpn: 50, handB: 1, wing: 1, cloak: 1,
      ...plant(4, -24, X(34) + 13.4, -14, { fBy: 6 }) }, 'out'],
    // rise over the front foot, back leg comes through to the stance
    [26, { air: 1, lean: 12, head: -2, ra1: 30, ra2: 52, la1: -24, la2: 30, wpn: 100, wing: 0.6, cloak: 0.6,
      ...plant(20, -47, X(34) + 13.4, J0.footB[0] + X(34), { fBy: J0.footB[1] }) }, 'inOut'],
    [32, { ...standAt(X(34)) }, 'inOut'],
  ]);

  const jumpK = track([
    [0, { ...HANG }],
    // gather: arms bend, feet tucked against the wall
    [4, { ...HANG, lean: 12, head: -8, ra1: 142, ra2: 26, la1: 120, la2: 26, ll1: 34, ll2: -110, rl1: 46, rl2: -120, wpn: -118, wing: 1, cloak: 0.8 }, 'inOut'],
    // spring: body stretches up past the lip, arms flung high
    [7, { air: 1, lean: -6, head: -24, ra1: 172, ra2: 6, la1: 164, la2: 10, ll1: -14, ll2: -8, rl1: 4, rl2: -14, wpn: 0, wing: 1.4, cloak: 1.3, handB: 1,
      ox: -14, oy: 22 }, 'out'],
    // tucked forward vault over the edge
    [12, { ...TUCK, air: 1, rot: 200, wing: 1.2, cloak: 1.2, ox: 0, oy: 4 }, 'inOut'],
    [17, { ...TUCK, air: 1, rot: 345, wing: 1, cloak: 1, ox: 8, oy: 0 }, 'inOut'],
    // open into the jump pose
    [24, { air: 1, lean: 6, ll1: 18, ll2: -76, rl1: 58, rl2: -66, la1: -50, la2: 40, ra1: 112, ra2: 24, wpn: 70, wing: 1, cloak: 0.9, rot: 360, ox: 10, oy: 0 }, 'inOut'],
  ]);

  const rollK = track([
    [0, { ...HANG }],
    [3, { ...PULL }, 'out'],
    // over the lip already curled
    [7, { ...TUCK, air: 1, rot: 80, wing: 1.2, cloak: 0.6, wG: 1, gAll: 1, gCl: 1, ox: 2 }, 'inOut'],
    [19, { ...TUCK, air: 1, rot: 360, wing: 1.2, cloak: 0.6, wG: 1, gAll: 1, gCl: 1, ox: X(70), px: X(70), py: -22 }, 'lin'],
    // land in a low crouch, sliding the last few px
    [23, { air: 1, lean: 18, la1: 40, la2: 30, ra1: 44, ra2: 60, wpn: 130, wing: 0.9, cloak: 0.8, rot: 360,
      ...plant(X(84), -32, X(84) + 16, X(84) - 14), ox: X(74) }, 'out'],
    [32, { ...standAt(X(90)), rot: 360 }, 'inOut'],
  ]);

  // on the stage (x >= 0) the feet never sink below its top while he lands from the roll
  const noSink = (p) => {
    const J = hermesFrame(Object.assign({}, BASE_POSE, p), SH1).J;
    let low = -1e9;
    for (const k of ['footF', 'footB']) if (J[k][0] > 0) low = Math.max(low, J[k][1] + 3);
    if (low > 0.01) p.oy = (p.oy || 0) - low;
    return p;
  };

  const FA = X(40) + J0.footF[0]; // ledge attack: planted front foot
  const BA = X(40) + J0.footB[0];
  const attackK = track([
    [0, { ...HANG }],
    [4, { ...HANG, head: -4, ll1: 4, ll2: -40, rl1: 22, rl2: -56, wing: 1, cloak: 0.8, rot: -3 }, 'inOut'],
    // snap up over the lip, staff slung back and down into the void behind him
    [9, { ...MANTLE, ra1: -40, wpn: 277, wing: 1.2, cloak: 1.1 }, 'out'],
    // land in a wide low stance, hand high behind the head, staff hanging down his back (anticipation)
    [13, { air: 1, lean: 24, head: -8, ra1: 196, ra2: 40, la1: 60, la2: 40, wpn: 87, wing: 0.9, cloak: 1, handB: 1,
      ...plant(X(26), -30, FA, BA) }, 'out'],
    [16, { air: 1, lean: 20, head: -12, ra1: 214, ra2: 26, la1: 70, la2: 40, wpn: 88, wing: 0.8, cloak: 1, handB: 1,
      ...plant(X(24), -31, FA, BA) }, 'inOut'],
    // the sweep: over the top in one frame and down to skim the stage
    [17, { air: 1, lean: 34, head: 0, ra1: 120, ra2: 10, la1: -20, la2: 30, wpn: -24, wing: 1.2, cloak: 1.2, handB: 1,
      ...plant(X(30), -27, FA, BA) }, 'lin'],
    [18, { air: 1, lean: 38, head: 4, ra1: 24, ra2: 8, la1: -60, la2: 24, wpn: -2, wing: 1.2, cloak: 1.3, handB: 1,
      ...plant(X(34), -25, FA, BA) }, 'out'],
    [22, { air: 1, lean: 40, head: 4, ra1: 18, ra2: 6, la1: -66, la2: 24, wpn: -4, wing: 1, cloak: 1.2, handB: 1,
      ...plant(X(35), -24, FA, BA) }, 'inOut'],
    [32, { ...standAt(X(40)) }, 'inOut'],
  ]);

  defineAnims('hermes', [
    {
      name: 'ledge_grab',
      label: 'Ledge grab',
      group: 'Ledge',
      input: 'Fall or drift into a ledge',
      notes: 'Both hands snap onto the corner and the body swings in under the lip before settling.',
      frames: 8,
      pose: (f) => grabK(f),
      fx(g, f, c) {
        gripMarks(g, c.ink, f / 6, c.k / S);
        if (f < 4) fxSpeedLines(g, c.ink, [c.J.hip[0] - 12 * c.J.k, c.J.hip[1] + 6 * c.J.k], [0.5, -0.86], 26 * c.J.k, 22 * c.J.k, 4, 0.6 * (1 - f / 4), c.rnd);
      },
      next: 'ledge_hang',
    },
    {
      name: 'ledge_hang',
      label: 'Ledge hang',
      group: 'Ledge',
      input: 'Automatic after a ledge grab',
      notes: 'Hangs by both hands with the caduceus laid on the stage, legs swaying and heel wings fluttering.',
      frames: 60,
      loop: true,
      pose(f) {
        const a = PH(f, 60);
        const s = Math.sin(a);
        const s2 = Math.sin(a - 0.9);
        return solve(Object.assign({}, EX, BASE_POSE, HANG, {
          rot: 2.5 * s,
          ll1: HANG.ll1 + 7 * s2, ll2: HANG.ll2 - 8 * (0.5 - 0.5 * Math.cos(a - 1.4)),
          rl1: HANG.rl1 + 6 * Math.sin(a - 1.3), rl2: HANG.rl2 - 9 * (0.5 - 0.5 * Math.cos(a - 1.9)),
          head: HANG.head + 3 * Math.sin(a * 2),
          lean: HANG.lean + 1.5 * Math.sin(a * 2),
          wing: 0.6 + 0.35 * Math.sin(a * 6),
          cloak: 0.55 + 0.12 * Math.sin(a - 0.6),
        }));
      },
    },
    {
      name: 'ledge_climb',
      label: 'Ledge climb',
      group: 'Ledge',
      input: 'Up or forward while hanging',
      notes: 'Pulls up, mantles over the lip with straight arms and steps out onto the stage into the idle stance.',
      frames: 32,
      pose: (f) => climbK(f),
      fx(g, f, c) {
        puff(g, c.ink, c.J.footF[0], (f - 18) / 8, 7 * c.J.k, 1);
        if (f >= 9 && f <= 14) fxSpeedLines(g, c.ink, [c.J.sh[0] - 4 * c.J.k, c.J.sh[1] + 30 * c.J.k], [0.35, -0.94], 24 * c.J.k, 26 * c.J.k, 4, 0.55 * (1 - Math.abs(f - 11) / 4), c.rnd);
      },
    },
    {
      name: 'ledge_jump',
      label: 'Ledge jump',
      group: 'Ledge',
      input: 'Jump while hanging',
      notes: 'Gathers against the wall then springs high with a forward vault, opening into the jump pose (the game carries the rise with vy).',
      frames: 24,
      air: true,
      pose: (f) => jumpK(f),
      motion: (f) => (f < 7 ? { vy: 0, grav: 0 } : f < 9 ? { vy: -14 } : {}),
      fx(g, f, c) {
        const J = c.J;
        if (f >= 6 && f <= 13) {
          const t = (f - 6) / 7;
          fxGust(g, c.ink, 0, -4 * J.k, (10 + 18 * t) * J.k, t * 4, 0.8 * (1 - t));
          fxSpeedLines(g, c.ink, [J.center[0], J.center[1] + 24 * J.k], [0, -1], 40 * J.k, 24 * J.k, 5, 0.6 * (1 - t), c.rnd);
        }
        if (f >= 7 && f <= 20) {
          const t = (f - 7) / 13;
          fxFeather(g, c.ink, -6 * J.k - t * 10 * J.k, 10 * J.k + t * 24 * J.k, 200 + t * 140, 9 * J.k, 1 - t);
          fxFeather(g, c.ink, 6 * J.k + t * 6 * J.k, 2 * J.k + t * 30 * J.k, 140 - t * 100, 7 * J.k, 1 - t);
        }
      },
    },
    {
      name: 'ledge_roll',
      label: 'Ledge roll',
      group: 'Ledge',
      input: 'Shield while hanging',
      notes: 'Flips up over the lip into a wind-wrapped forward roll that carries him well onto the stage.',
      frames: 32,
      intan: [[1, 22]],
      pose: (f) => noSink(rollK(f)),
      fx(g, f, c) {
        const J = c.J;
        if (f >= 5 && f <= 21) {
          const t = (f - 5) / 16;
          fxGust(g, c.ink, J.pivot[0], J.pivot[1], 24 * J.k, f * 0.55, 0.55 * Math.sin(t * Math.PI));
          fxSpeedLines(g, c.ink, [J.pivot[0] - 20 * J.k, J.pivot[1]], [1, 0], 30 * J.k, 26 * J.k, 4, 0.55 * Math.sin(t * Math.PI), c.rnd);
        }
        puff(g, c.ink, J.footF[0], (f - 20) / 9, 7 * J.k, -1);
      },
    },
    {
      name: 'ledge_attack',
      label: 'Lip Vault',
      group: 'Ledge',
      input: 'Attack while hanging',
      notes: 'Vaults up over the lip and brings the caduceus over the top into a low sweep that skims the stage.',
      frames: 32,
      hit: [
        { f: [18, 21], at: 'tip', r: 13, dmg: 8, kb: 5, ang: 28 },
        { f: [18, 21], at: 'mid', r: 11, dmg: 8, kb: 5, ang: 28 },
      ],
      pose: (f) => attackK(f),
      fx(g, f, c) {
        const J = c.J;
        if (f >= 16.6 && f <= 20.5) fxCrescent(g, c.ink, trailOf(c, ['tip', 'handF'], 1.1, 0.1), f <= 18.5 ? 0.95 : 0.95 * (1 - (f - 18.5) / 2));
        if (f >= 18 && f <= 23) {
          const t = (f - 18) / 5;
          fxSpeedLines(g, c.ink, [J.tip[0] + 6 * J.k, -3 * J.k], [1, 0], 34 * J.k, 10 * J.k, 3, 0.7 * (1 - t), c.rnd);
          puff(g, c.ink, J.tip[0] - 4 * J.k, t, 6 * J.k, 1);
        }
        puff(g, c.ink, c.J.footF[0], (f - 13) / 7, 6 * J.k, 1);
      },
    },
  ]);
})();
