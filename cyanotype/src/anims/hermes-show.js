// Hermes — taunts, the match entrance and the results-screen poses.
//
// Grounded poses are keyed like the stand file: hip position (hx forward, hh
// height) and two planted feet (bx/bh, fx/fh), solved with a two-bone leg IK so
// planted feet never slide. Hands can also be keyed as targets in hip-local
// figure units (tfx/tfy for the front hand, tbx/tby for the back hand, y down)
// blended in by tfw/tbw, solved with an arm IK; 'sa' is the absolute caduceus
// angle. Props that leave the hand (planted staff, tossed staff, scroll) are
// drawn in fx with the shared drawCaduceus so they match the held staff exactly.
(() => {
  const SH = HERMES_SHAPE;
  const TAU = Math.PI * 2;

  // ---- legs and hips ------------------------------------------------------------
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

  // two-bone arm IK: wrist to (tx, ty) in hip-local figure units (y down).
  // Returns [a1, a2] with a natural (positive) elbow bend.
  function armIK(lean, side, tx, ty) {
    const td = dirv(180 - lean);
    const perp = [Math.cos(lean * D2R), Math.sin(lean * D2R)];
    const sx = td[0] * SH.torso + perp[0] * side * SH.shoulder - td[0] * 4;
    const sy = td[1] * SH.torso + perp[1] * side * SH.shoulder - td[1] * 4;
    const vx = tx - sx;
    const vy = ty - sy;
    const U = SH.upper;
    const F = SH.fore;
    const L = clamp(Math.hypot(vx, vy), Math.abs(U - F) + 1, U + F - 0.05);
    const A = Math.atan2(vx, vy) / D2R;
    const al = Math.acos(clamp((U * U + L * L - F * F) / (2 * U * L), -1, 1)) / D2R;
    const up = A - al;
    const e = dirv(up);
    const ex = sx + e[0] * U;
    const ey = sy + e[1] * U;
    const t = dirv(A);
    const fa = Math.atan2(sx + t[0] * L - ex, sy + t[1] * L - ey) / D2R;
    return [up - lean, wrap(fa - up)];
  }

  // keyed tween over arbitrary channels; every key is merged onto base
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

  const EXTRA = ['sa', 'tfx', 'tfy', 'tfw', 'tbx', 'tby', 'tbw'];
  // finish a keyed pose: hand targets -> arm angles, sa -> wpn, planted feet -> legs
  function fin(p) {
    if (p.tfw > 0) {
      const [a1, a2] = armIK(p.lean, 1, p.tfx, p.tfy);
      p.ra1 = lerp(p.ra1, p.ra1 + wrap(a1 - p.ra1), p.tfw);
      p.ra2 = lerp(p.ra2, p.ra2 + wrap(a2 - p.ra2), p.tfw);
    }
    if (p.tbw > 0) {
      const [a1, a2] = armIK(p.lean, -1, p.tbx, p.tby);
      p.la1 = lerp(p.la1, p.la1 + wrap(a1 - p.la1), p.tbw);
      p.la2 = lerp(p.la2, p.la2 + wrap(a2 - p.la2), p.tbw);
    }
    if (p.sa != null) p.wpn = p.sa - (p.lean + p.ra1 + p.ra2);
    for (const k of EXTRA) delete p[k];
    return 'hh' in p ? plant(p) : p;
  }

  const IDLE_SA = BASE_POSE.lean + BASE_POSE.ra1 + BASE_POSE.ra2 + BASE_POSE.wpn;
  const GROUND = Object.assign({}, BASE_POSE, NEUT, { sa: IDLE_SA, tfx: 0, tfy: 0, tfw: 0, tbx: 0, tby: 0, tbw: 0 });
  delete GROUND.ll1;
  delete GROUND.ll2;
  delete GROUND.rl1;
  delete GROUND.rl2;
  // the idle loop at frame 0 (same formulas as the idle definition), so every
  // non-looping piece here hands back to idle without a pop
  const IDLE0 = {
    hx: 0.7 * Math.sin(0.4),
    hh: H0 - 0.7,
    lean: 4,
    head: 1.2 * Math.sin(0.8),
    la1: -14 + 2.5 * Math.sin(-0.5),
    la2: 26 + 4 * Math.sin(-1.1),
    ra1: 26,
    ra2: 56,
    wing: 0.32 + 0.05 * Math.sin(1),
    cloak: 0.25 + 0.07 * Math.sin(-1.2),
    sa: IDLE_SA + 1.5 * Math.sin(-1.4),
  };
  const groundSeq = (keys) => {
    const s = seq(GROUND, keys);
    return (f) => s(f);
  };
  // damped wobble that starts at frame f0 (overlapping action)
  const settle = (f, f0, amp, period, decay) => (f < f0 ? 0 : amp * Math.exp(-(f - f0) / decay) * Math.sin(((f - f0) / period) * TAU));
  const bump = (f, a, b) => smoothstep(a, (a + b) / 2, f) * (1 - smoothstep((a + b) / 2, b, f));

  // ---- effect helpers ---------------------------------------------------------------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l];
  };
  const angOf = (v) => Math.atan2(v[0], v[1]) / D2R; // dirv angle of a vector
  const staffAng = (J) => angOf(sub(J.tip, J.handF));
  const wingOf = (c) => (c.pose ? c.pose.wing : 0.3);
  function drawStaff(g, c, grip, ang, alpha) {
    g.save();
    if (alpha != null) g.globalAlpha *= alpha;
    if (!skinProp(c, 'caduceus', g, c.ink, grip, ang, c.k, wingOf(c), c.time || 0)) drawCaduceus(g, c.ink, grip, ang, c.k, wingOf(c), c.time || 0);
    g.restore();
  }
  // head frame: translate to the head centre, rotate like drawHermes does
  function inHead(g, c, fn) {
    const p = c.pose || BASE_POSE;
    g.save();
    g.translate(c.J.head[0], c.J.head[1]);
    g.rotate(((p.rot || 0) + p.lean * 0.4 + p.head) * D2R);
    fn(c.k);
    g.restore();
  }
  // a closed, happy eye over the drawn almond eye (wink)
  function wink(g, c, amt) {
    if (amt <= 0 || skinProp(c, 'face', g, c, 'wink', amt)) return;
    inHead(g, c, (k) => {
      g.globalAlpha *= clamp(amt * 2, 0, 1);
      g.beginPath();
      g.ellipse(4.6 * k, -1.4 * k, 1.9 * k, 1.05 * k, 0, 0, TAU);
      g.fillStyle = PAPER_LIGHT;
      g.fill();
      g.strokeStyle = c.ink;
      g.lineCap = 'round';
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(3.1 * k, -1.7 * k);
      g.quadraticCurveTo(4.6 * k, -0.4 * k, 6.1 * k, -1.6 * k);
      g.stroke();
      g.lineWidth = 0.7;
      line(g, 3.4 * k, -1.2 * k, 2.6 * k, -0.5 * k);
    });
  }
  // a one-sided smirk at the mouth corner
  function smirk(g, c, amt) {
    if (amt <= 0 || skinProp(c, 'face', g, c, 'smirk', amt)) return;
    inHead(g, c, (k) => {
      g.globalAlpha *= clamp(amt, 0, 1);
      g.strokeStyle = c.ink;
      g.lineCap = 'round';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(5.2 * k, 3.5 * k);
      g.quadraticCurveTo(6.2 * k, 3.4 * k, 6.9 * k, 2.4 * k);
      g.stroke();
      g.lineWidth = 0.6;
      line(g, 5.0 * k, 4.4 * k, 5.6 * k, 4.0 * k);
    });
  }
  // a small downturned mouth (sulk)
  function pout(g, c, amt) {
    if (amt <= 0 || skinProp(c, 'face', g, c, 'pout', amt)) return;
    inHead(g, c, (k) => {
      g.globalAlpha *= clamp(amt, 0, 1);
      g.strokeStyle = c.ink;
      g.lineCap = 'round';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(5.0 * k, 4.3 * k);
      g.quadraticCurveTo(5.8 * k, 3.5 * k, 6.9 * k, 3.7 * k);
      g.stroke();
      // a heavier, lowered brow
      g.lineWidth = 1.3;
      line(g, 2.8 * k, -2.8 * k, 6.2 * k, -2.9 * k);
    });
  }
  // little four-point twinkle
  function twinkle(g, ink, x, y, r, alpha) {
    if (alpha <= 0) return;
    g.save();
    g.globalAlpha *= alpha;
    g.beginPath();
    g.moveTo(x, y - r);
    g.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y);
    g.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
    g.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y);
    g.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r);
    g.closePath();
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    g.strokeStyle = ink;
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }
  // short engraved strokes radiating from a point
  function burst(g, ink, x, y, r0, r1, n, rot, alpha, lw) {
    if (alpha <= 0) return;
    g.save();
    g.globalAlpha *= alpha;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      g.lineWidth = (lw || 1.2) * (i % 2 ? 0.6 : 1);
      const rr = i % 2 ? r1 * 0.75 : r1;
      line(g, x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.restore();
  }
  // engraved dust billows at the floor
  function dust(g, ink, x, t, size, dir, alpha) {
    if (t < 0 || t > 1) return;
    g.save();
    g.globalAlpha *= (alpha == null ? 1 : alpha) * (1 - t * t);
    const r = size * (0.32 + 0.6 * Math.sqrt(t));
    const cx = x + dir * size * 1.2 * t;
    const cy = -r * 0.55 - size * 0.2 * t;
    const lobes = [[-0.75, 0.2, 0.55], [0, -0.2, 0.78], [0.8, 0.15, 0.5]];
    g.beginPath();
    for (const [dx, dy, rr] of lobes) {
      g.moveTo(cx + dir * dx * r + rr * r, cy + dy * r);
      g.arc(cx + dir * dx * r, cy + dy * r, rr * r, 0, TAU);
    }
    g.strokeStyle = ink;
    g.lineWidth = 1.6;
    g.stroke();
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    g.globalAlpha *= 0.8;
    g.fillStyle = inkPatterns(g, ink).hatch;
    g.fill();
    g.restore();
  }
  // motion arcs (")") around a point, facing direction ang (radians)
  function flutterMarks(g, ink, x, y, r, ang, alpha) {
    if (alpha <= 0) return;
    g.save();
    g.globalAlpha *= alpha;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      g.lineWidth = 1.6 - i * 0.5;
      g.beginPath();
      g.arc(x, y, r * (1 + i * 0.45), ang - 0.5, ang + 0.5);
      g.stroke();
    }
    g.restore();
  }
  // crescent smear from explicit point pairs (oldest first)
  function smear(g, c, pairs, alpha) {
    if (pairs.length >= 3) fxCrescent(g, c.ink, pairs, alpha);
  }

  // small rolled scroll / opened letter. (x, y) = where the hand holds the top
  // roller, ang = roller direction (radians), open 0..1 unrolls the sheet downwards.
  function drawScroll(g, ink, x, y, ang, open, k, alpha) {
    const P = inkPatterns(g, ink);
    g.save();
    if (alpha != null) g.globalAlpha *= alpha;
    g.translate(x, y);
    g.rotate(ang);
    const L = 11 * k;
    const R = 1.8 * k;
    const H = 15 * k * open;
    if (open > 0.02) {
      // the sheet, slightly curled, with lines of tiny script
      g.beginPath();
      g.moveTo(-L * 0.42, 0);
      g.lineTo(L * 0.42, 0);
      g.quadraticCurveTo(L * 0.5, H * 0.5, L * 0.42, H);
      g.lineTo(-L * 0.42, H);
      g.quadraticCurveTo(-L * 0.34, H * 0.5, -L * 0.42, 0);
      g.closePath();
      g.fillStyle = PAPER_LIGHT;
      g.fill();
      g.save();
      g.globalAlpha *= 0.35;
      g.fillStyle = P.fine;
      g.fill();
      g.restore();
      g.strokeStyle = ink;
      g.lineWidth = 1;
      g.stroke();
      g.lineWidth = 0.6;
      for (let yy = 3 * k; yy < H - 2 * k; yy += 2.4 * k) {
        g.beginPath();
        for (let xx = -L * 0.32; xx <= L * 0.3; xx += 1.1 * k) {
          const w = Math.sin(xx * 2.1 + yy * 3.3) * 0.45 * k;
          if (xx === -L * 0.32) g.moveTo(xx, yy + w);
          else g.lineTo(xx, yy + w);
        }
        g.stroke();
      }
      // bottom roller
      g.beginPath();
      capsulePath(g, -L / 2, H, L / 2, H, R * 0.85, R * 0.85);
      engraveFill(g, ink, { pat: 'hatch', patAlpha: 0.7, lw: LW.form });
    }
    // top roller (the rolled body when closed)
    const Rt = R * (1 + (1 - open) * 0.4);
    g.beginPath();
    capsulePath(g, -L / 2, 0, L / 2, 0, Rt, Rt);
    engraveFill(g, ink, { pat: 'hatch', patAlpha: 0.75, lw: LW.form });
    g.strokeStyle = ink;
    g.lineWidth = 0.7;
    for (const s of [-0.25, 0.1]) line(g, s * L, -Rt, s * L + 0.6 * k, Rt);
    if (open < 0.5) {
      // tie ribbon with a wax seal
      g.globalAlpha *= 1 - open * 2;
      g.lineWidth = 1.4;
      line(g, 0, -Rt, 0, Rt);
      g.beginPath();
      g.arc(0.2 * k, Rt + 1.2 * k, 1.3 * k, 0, TAU);
      g.fillStyle = deepInk(ink);
      g.fill();
    }
    g.restore();
  }

  // ==============================================================================
  // taunt_up: caduceus thrust overhead, snakes rear and hiss
  // ==============================================================================
  const UP_HOLD = {
    hx: -1, hh: H0 - 0.2, lean: -10, head: -20,
    ra1: 172, ra2: 6, sa: 540, la1: -36, la2: 98,
    wing: 1.1, cloak: 1.2,
  };
  const tauntUpKeys = groundSeq([
    [0, IDLE0],
    [7, { hx: 1.6, hh: H0 - 4.2, lean: 15, head: 6, ra1: 46, ra2: 92, sa: 156, la1: -28, la2: 54, wing: 0.12, cloak: 0.4 }],
    [13, UP_HOLD, 'out'],
    [16, Object.assign({}, UP_HOLD, { hh: H0 - 0.9, lean: -8, head: -17, ra1: 170 })],
    [44, Object.assign({}, UP_HOLD, { hh: H0 - 0.6, lean: -9, head: -18, ra1: 171 })],
    [52, { hx: 0.8, hh: H0 - 2.2, lean: 8, head: 3, ra1: 50, ra2: 72, sa: 548, la1: -20, la2: 34, wing: 0.5, cloak: 0.5 }],
    [60, Object.assign({}, IDLE0, { sa: IDLE0.sa + 360 })],
  ]);
  function tauntUpPose(f) {
    const p = tauntUpKeys(f);
    const hold = smoothstep(13, 17, f) * (1 - smoothstep(42, 48, f));
    // wings beat fast while the staff is up; snakes make the staff quiver
    p.wing += hold * (0.32 * Math.sin(f * 1.7) + 0.12 * Math.sin(f * 3.1));
    p.cloak += hold * 0.08 * Math.sin(f * 0.45) + settle(f, 13, 0.18, 14, 9);
    p.sa += hold * 1.6 * Math.sin(f * 2.3);
    p.head += hold * 1.5 * Math.sin(f * 0.3);
    p.lean += settle(f, 13, -2.2, 12, 6);
    return fin(p);
  }
  // the two snake heads of the drawn caduceus; returns [{ p, out, d }]
  function snakeHeads(J) {
    const k = J.k;
    const d = norm(sub(J.tip, J.handF));
    const n = [-d[1], d[0]];
    return [1, -1].map((side) => ({
      p: [J.handF[0] + d[0] * 38.5 * k + n[0] * side * 5.3 * k, J.handF[1] + d[1] * 38.5 * k + n[1] * side * 5.3 * k],
      out: norm([n[0] * side * 0.8 + d[0] * 0.6, n[1] * side * 0.8 + d[1] * 0.6]),
      side,
    }));
  }
  function hiss(g, c, f, amt) {
    if (amt <= 0) return;
    const k = c.k;
    g.save();
    g.globalAlpha *= amt;
    g.strokeStyle = c.ink;
    g.lineCap = 'round';
    for (const s of snakeHeads(c.J)) {
      // forked tongue flicking in and out
      const fl = Math.max(0, Math.sin(f * 1.25 + s.side * 1.3));
      if (fl > 0.05) {
        const L = 6 * k * fl;
        const a = [s.p[0] + s.out[0] * 1.5 * k, s.p[1] + s.out[1] * 1.5 * k];
        const b = [a[0] + s.out[0] * L, a[1] + s.out[1] * L];
        g.lineWidth = 0.9;
        line(g, a[0], a[1], b[0], b[1]);
        const ang = Math.atan2(s.out[1], s.out[0]);
        for (const sp of [-0.5, 0.5]) line(g, b[0], b[1], b[0] + Math.cos(ang + sp) * 2.2 * k, b[1] + Math.sin(ang + sp) * 2.2 * k);
      }
      // hiss: rippling arcs leaving each head
      for (let i = 0; i < 2; i++) {
        const u = (((f - 16) / 9 + i * 0.5) % 1 + 1) % 1;
        const r = (5 + u * 9) * k;
        const ang = Math.atan2(s.out[1], s.out[0]);
        g.globalAlpha = amt * (1 - u) * 0.9;
        g.lineWidth = 1.1;
        g.beginPath();
        g.arc(s.p[0], s.p[1], r, ang - 0.45, ang + 0.45);
        g.stroke();
      }
      g.globalAlpha = amt;
    }
    g.restore();
  }

  // ==============================================================================
  // taunt_side: baton twirl, then a flourish bow
  // ==============================================================================
  const TW0 = 9;
  const TW1 = 30;
  const BOW = {
    hx: -3, hh: H0 - 4.5, bx: NEUT.bx - 7, bh: 0.3, lean: 40, head: 16,
    ra1: 20, ra2: 6, sa: 60 - 1080, la1: -138, la2: 16, handB: 1, wing: 0.55, cloak: 0.8,
  };
  const tauntSideKeys = groundSeq([
    [0, IDLE0],
    [6, { hx: -0.6, hh: H0 - 2.4, lean: 0, head: 3, ra1: 36, ra2: 80, sa: 232, la1: -6, la2: 44, wing: 0.3, cloak: 0.3 }],
    [TW0, { hx: 0, hh: H0 - 1.2, lean: 7, head: -2, ra1: 70, ra2: 24, sa: 222, la1: -24, la2: 30, wing: 0.55, cloak: 0.45 }, 'out'],
    [TW1, { hx: 0.4, hh: H0 - 1.2, lean: 7, head: -4, ra1: 72, ra2: 22, sa: 222 - 1000, la1: -26, la2: 34, wing: 0.7, cloak: 0.55 }, 'lin'],
    [33, { hx: 0.6, hh: H0 - 0.6, lean: 0, head: -10, ra1: 132, ra2: 4, sa: 166 - 1080, la1: -60, la2: 18, handB: 1, wing: 0.9, cloak: 0.8 }, 'out'],
    [36, { hx: -1.5, hh: H0 - 2.6, bx: NEUT.bx - 4, bh: 5, lean: 18, head: 2, ra1: 70, ra2: 8, sa: 110 - 1080, la1: -110, la2: 24, handB: 1, wing: 0.8, cloak: 0.95 }],
    [40, BOW, 'out'],
    [48, Object.assign({}, BOW, { lean: 43, head: 19, hh: H0 - 5 })],
    [53, { hx: -1, hh: H0 - 1.5, bx: NEUT.bx - 3, bh: 4.5, lean: 10, head: 0, ra1: 30, ra2: 60, sa: 170 - 1080, la1: -30, la2: 30, handB: 0.6, wing: 0.5, cloak: 0.45 }],
    [60, Object.assign({}, IDLE0, { sa: IDLE0.sa - 1080 })],
  ]);
  function tauntSidePose(f) {
    const p = tauntSideKeys(f);
    // twirling hand circles a little and the hips sway with the rhythm
    const tw = smoothstep(TW0 - 1, TW0 + 2, f) * (1 - smoothstep(TW1 - 2, TW1 + 1, f));
    const ph = ((f - TW0) / (TW1 - TW0)) * TAU * 2.8;
    p.ra1 += tw * 6 * Math.sin(ph);
    p.ra2 += tw * 5 * Math.cos(ph);
    p.hx += tw * 0.8 * Math.sin(ph * 0.5);
    p.head += tw * 3 * Math.sin(ph * 0.5 + 0.6);
    p.cloak += settle(f, 40, 0.2, 12, 7);
    p.wing += settle(f, 40, 0.25, 9, 6);
    p.wpnShow = twirlW(f) > 0 ? 0 : 1;
    return fin(p);
  }
  // 0..1: how far the twirling staff has slid to spin about its middle
  const twirlW = (f) => smoothstep(TW0 - 2, TW0 + 1, f) * (1 - smoothstep(TW1, TW1 + 3, f));
  // twirling staff geometry at frame s: grip, angle, tip, butt, centre. The
  // baton spins in his frontal plane, so seen from the side its horizontal
  // reach is foreshortened by sx about the hand (it never sweeps the face).
  function twirlStaff(c, s) {
    const J = c.sample(s);
    const k = c.k;
    const d = norm(sub(J.tip, J.handF));
    const w = twirlW(s) * 10 * k;
    const h = J.handF;
    const sx = 1 - 0.55 * twirlW(s);
    const at = (u) => [h[0] + (d[0] * u - d[0] * w) * sx, h[1] + d[1] * u - d[1] * w];
    return {
      hand: h,
      sx,
      grip: [-d[0] * w, -d[1] * w], // relative to the hand, before the squash
      ang: angOf(d),
      tip: at(46 * k),
      butt: at(-26 * k),
      mid: at(10 * k),
    };
  }

  // ==============================================================================
  // taunt_down: plants the staff, kneels to fix a sandal, the heel wing flaps on
  // its own, he shrugs and picks the staff back up
  // ==============================================================================
  const TD_R = 12; // staff released
  const TD_P = 50; // staff picked back up
  const KNEEL = { hx: -4, hh: 27, bx: NEUT.bx - 9, bh: 2.5, fx: NEUT.fx, fh: 0 };
  const PLANT = Object.assign({}, KNEEL, {
    lean: 44, head: 8, tfx: 51, tfy: 4, tfw: 1, sa: 166, ra1: 60, ra2: 30, handF: 0,
    la1: 30, la2: 50, wing: 0.25, cloak: 0.35,
  });
  const FIX = Object.assign({}, KNEEL, {
    lean: 44, head: 26, tfx: 18, tfy: 17, tfw: 1, tbx: 25, tby: 4, tbw: 1, handF: 1, handB: 1,
    ra1: 20, ra2: 60, la1: 40, la2: 60, sa: 180, wing: 0.2, cloak: 0.3,
  });
  const tauntDownKeys = groundSeq([
    [0, IDLE0],
    [6, { hx: -1.5, hh: H0 - 9, bx: NEUT.bx - 5, bh: 7, lean: 12, head: -4, ra1: 120, ra2: 20, sa: 182, la1: 10, la2: 40, wing: 0.4, cloak: 0.4 }],
    [TD_R, PLANT, 'out'],
    [16, Object.assign({}, PLANT, { lean: 42, head: 14, tfx: 36, tfy: 8 })],
    [22, FIX],
    [26, Object.assign({}, FIX, { tfx: 19, tfy: 16 })],
    [29, Object.assign({}, FIX, { lean: 38, head: -12, tfx: 23, tfy: 8, wing: 0.2 }), 'out'],
    [36, Object.assign({}, FIX, { lean: 44, head: 18, tfx: 20, tfy: 15 })],
    [39, Object.assign({}, KNEEL, { lean: 12, head: 6, ra1: 22, ra2: 70, la1: 18, la2: 74, handF: 1, handB: 1, sa: 180, wing: 0.25, cloak: 0.3 })],
    [42, Object.assign({}, KNEEL, { hh: 28.8, lean: 3, head: -9, ra1: 14, ra2: 118, la1: 26, la2: 116, handF: 1, handB: 1, sa: 180, wing: 0.25, cloak: 0.3 }), 'out'],
    [46, Object.assign({}, KNEEL, { hh: 28.4, lean: 4, head: -6, ra1: 16, ra2: 112, la1: 28, la2: 110, handF: 1, handB: 1, sa: 180, wing: 0.25, cloak: 0.3 })],
    [TD_P, PLANT],
    [55, { hx: -1, hh: H0 - 4, bx: NEUT.bx - 4, bh: 6, lean: 10, head: 2, ra1: 60, ra2: 50, sa: 200, la1: -10, la2: 30, wing: 0.5, cloak: 0.45 }],
    [60, IDLE0],
  ]);
  function tauntDownPose(f) {
    const p = tauntDownKeys(f);
    // fiddling with the strap
    const fid = smoothstep(21, 23, f) * (1 - smoothstep(26, 28, f)) + smoothstep(32, 34, f) * (1 - smoothstep(36, 38, f));
    p.tfx += fid * 1.6 * Math.sin(f * 1.9);
    p.tfy += fid * 1.2 * Math.cos(f * 2.3);
    // the heel wing flaps all by itself
    const gag = smoothstep(25, 27, f) * (1 - smoothstep(35, 38, f));
    p.wing += gag * (0.7 + 0.55 * Math.sin(f * 2.4));
    p.wpnShow = f > TD_R && f < TD_P ? 0 : 1;
    return fin(p);
  }

  // ==============================================================================
  // entrance: swoops down from the sky and lands lightly
  // ==============================================================================
  const EN_TD = 46; // touchdown
  const EN_LAND = {
    hx: 0.5, hh: H0 - 2.5, bx: NEUT.bx, bh: 4, fx: NEUT.fx, fh: 0,
    lean: 8, head: -4, la1: -70, la2: 26, handB: 1, ra1: 66, ra2: 34, sa: 150, wing: 1.3, cloak: 1.3,
  };
  const enGround = groundSeq([
    [EN_TD, EN_LAND],
    [51, { hx: 1.5, hh: H0 - 8, bx: NEUT.bx, bh: 3, fx: NEUT.fx, fh: 0, lean: 18, head: 6, la1: -36, la2: 46, handB: 0.6, ra1: 40, ra2: 64, sa: 166, wing: 0.7, cloak: 1.0 }, 'out'],
    [63, { hx: 0, hh: H0 - 0.3, bx: NEUT.bx, bh: NEUT.bh, fx: NEUT.fx, lean: 1, head: -5, la1: -18, la2: 24, handB: 0, ra1: 28, ra2: 54, sa: 188, wing: 0.5, cloak: 0.5 }],
    [80, Object.assign({}, IDLE0, { fx: NEUT.fx })],
  ]);
  const EN_TDP = fin(enGround(EN_TD));
  // airborne keys use raw angles; the last one is the touchdown pose itself
  const enAir = keyframes([
    [0, { lean: 34, head: -14, rot: 22, ll1: -52, ll2: -24, rl1: -26, rl2: -46, la1: -112, la2: 14, ra1: 96, ra2: 8, wpn: 100 - (34 + 96 + 8), wing: 1.4, cloak: 1.4, air: 1, handB: 1 }],
    [24, { lean: 30, head: -12, rot: 16, ll1: -46, ll2: -26, rl1: -18, rl2: -50, la1: -116, la2: 12, ra1: 92, ra2: 10, wpn: 104 - (30 + 92 + 10), wing: 1.3, cloak: 1.4, air: 1, handB: 1 }],
    [36, { lean: -4, head: -6, rot: -6, ll1: -12, ll2: -34, rl1: 22, rl2: -44, la1: -150, la2: 20, ra1: 132, ra2: 20, wpn: 150 - (-4 + 132 + 20), wing: 1.6, cloak: 1.5, air: 0.6, handB: 1 }],
    [42, { lean: 2, head: -4, rot: -2, ll1: -14, ll2: -10, rl1: 14, rl2: -12, la1: -100, la2: 22, ra1: 90, ra2: 30, wpn: 150 - (2 + 90 + 30), wing: 1.5, cloak: 1.4, air: 0, handB: 1 }],
    [EN_TD, Object.assign({}, EN_TDP, { ox: 0 })],
  ]);
  // swoop path (figure units, feet point): high behind, dive, glide, settle
  const EN_P = [[-150, -270], [-70, -40], [-14, -34], [0, 0]];
  function enPath(f) {
    const u = clamp(f / EN_TD, 0, 1);
    const s = 1 - Math.pow(1 - u, 1.7);
    const m = 1 - s;
    const b = [m * m * m, 3 * m * m * s, 3 * m * s * s, s * s * s];
    return [0, 1].map((i) => b[0] * EN_P[0][i] + b[1] * EN_P[1][i] + b[2] * EN_P[2][i] + b[3] * EN_P[3][i]);
  }
  function entrancePose(f) {
    if (f >= EN_TD) {
      const p = fin(enGround(f));
      p.cloak += settle(f, EN_TD, 0.35, 16, 12);
      p.wing += settle(f, EN_TD, 0.3, 7, 8);
      return p;
    }
    const p = enAir(f);
    const [x, y] = enPath(f);
    p.ox = x + EN_TDP.ox * smoothstep(30, EN_TD, f);
    p.oy = y;
    p.fade = 1 - smoothstep(0, 18, f);
    // big slow wingbeats in the dive, fast braking beats in the flare
    const br = smoothstep(30, 36, f);
    p.wing += (1 - br) * 0.25 * Math.sin(f * 0.6) + br * 0.4 * Math.sin(f * 1.9) * (1 - smoothstep(42, EN_TD, f));
    p.cloak += 0.1 * Math.sin(f * 0.8);
    return p;
  }

  // ==============================================================================
  // win1: forward flip into a heroic pose, caduceus aloft
  // ==============================================================================
  const W1_UP = 14; // feet leave the floor
  const W1_DN = 42; // feet touch down
  const HERO = {
    hx: 0, hh: H0 - 4.5, bx: NEUT.bx - 6, bh: 0, fx: NEUT.fx + 9, fh: 0,
    lean: -6, head: -14, ra1: 166, ra2: 8, sa: 180 + 360, la1: -36, la2: 98, wing: 1.0, cloak: 1.2,
  };
  const w1Ground = groundSeq([
    [0, IDLE0],
    [9, { hx: 2, hh: H0 - 9, lean: 24, head: 6, ra1: 18, ra2: 74, sa: 140, la1: 34, la2: 40, wing: 0.15, cloak: 0.4 }],
    [W1_UP, { hx: -0.5, hh: H0 + 1, bh: 5, fh: 4, lean: -2, head: -10, ra1: 150, ra2: 12, sa: 200, la1: 150, la2: 14, wing: 1.2, cloak: 0.9 }, 'out'],
    [W1_DN, { hx: 1, hh: H0 - 6, bx: HERO.bx, bh: 1, fx: HERO.fx, fh: 0, lean: 18, head: 4, ra1: 70, ra2: 30, sa: 150 + 360, la1: -60, la2: 30, handB: 1, wing: 1.2, cloak: 1.3 }],
    [48, { hx: 1.5, hh: H0 - 11, bx: HERO.bx, bh: 1, fx: HERO.fx, fh: 0, lean: 24, head: 8, ra1: 40, ra2: 70, sa: 160 + 360, la1: -40, la2: 50, handB: 0.5, wing: 0.6, cloak: 1.0 }, 'out'],
    [56, { hx: 0, hh: H0 - 6, bx: HERO.bx, bh: 1, fx: HERO.fx, fh: 0, lean: 10, head: 0, ra1: 90, ra2: 60, sa: 175 + 360, la1: -40, la2: 70, wing: 0.7, cloak: 0.9 }, 'in'],
    [64, Object.assign({}, HERO, { hh: H0 - 3.4, lean: -9, head: -16, ra1: 172 }), 'out'],
    [80, HERO],
  ]);
  const W1_A = fin(w1Ground(W1_UP));
  const W1_B = fin(w1Ground(W1_DN));
  const w1Air = keyframes([
    [W1_UP, W1_A],
    [18, Object.assign({}, POSES.jump(), { lean: 4, head: -8, ra1: 150, ra2: 20, wpn: 200 - 174, la1: 140, la2: 30, wing: 1.3, cloak: 1.1, air: 1 })],
    [23, Object.assign({}, BASE_POSE, TUCK, { head: 10, wing: 1.2, cloak: 1.3, air: 1 })],
    [33, Object.assign({}, BASE_POSE, TUCK, { head: 10, wing: 1.1, cloak: 1.3, air: 1 })],
    [38, { lean: 6, head: -2, ll1: -16, ll2: -20, rl1: 26, rl2: -30, la1: -80, la2: 30, handB: 1, ra1: 80, ra2: 30, wpn: 150 - 116 + 360, wing: 1.4, cloak: 1.3, air: 1 }],
    [W1_DN, W1_B],
  ]);
  function win1Pose(f) {
    if (f > W1_UP && f < W1_DN) {
      const p = w1Air(f);
      const u = (f - W1_UP) / (W1_DN - W1_UP);
      p.oy = -78 * 4 * u * (1 - u);
      p.ox = lerp(W1_A.ox, W1_B.ox, u);
      p.air = smoothstep(W1_UP, W1_UP + 4, f) * (1 - smoothstep(W1_DN - 4, W1_DN, f));
      p.rot = 360 * smoothstep(17, 37, f);
      p.lift = lerp(W1_A.lift, W1_B.lift, u);
      return p;
    }
    const p = w1Ground(f);
    // breathing on the held pose
    const br = smoothstep(76, 84, f);
    const ph = ((f - 80) / 40) * TAU;
    p.hh += br * 0.35 * Math.sin(ph);
    p.lean += br * 0.8 * Math.sin(ph + 0.4);
    p.head += br * 1 * Math.sin(ph + 1);
    p.wing += br * (0.12 * Math.sin(f * 0.35)) + settle(f, 64, 0.2, 10, 8);
    p.cloak += br * 0.08 * Math.sin(ph * 2 + 1) + settle(f, 64, 0.25, 16, 10);
    p.sa += br * 1.2 * Math.sin(ph + 2);
    return fin(p);
  }

  // ==============================================================================
  // win2: tosses the caduceus behind his back and over, catches it, tips his hat
  // and winks
  // ==============================================================================
  const W2_R = 15; // release
  const W2_C = 33; // catch
  const W2_SPIN = 720; // backward turns: the staff flips up off his back, over his head
  // end pose: staff stood upright at his side like a cane, far hand tipping the hat
  const TIP = {
    hx: 0.6, hh: H0 - 0.8, lean: 2, head: 9, tfw: 0, ra1: 22, ra2: 46, sa: 178 + W2_SPIN,
    tbx: 14, tby: -44, tbw: 1, la1: 120, la2: 60, handB: 0, wing: 0.45, cloak: 0.35,
  };
  const win2Keys = groundSeq([
    [0, IDLE0],
    [8, { hx: 1, hh: H0 - 2.5, lean: 10, head: 2, ra1: 60, ra2: 30, sa: 120, la1: -40, la2: 30, wing: 0.3, cloak: 0.35 }],
    [W2_R, { hx: -0.8, hh: H0 - 1.8, lean: -2, head: -6, ra1: -62, ra2: 22, sa: 205, la1: 30, la2: 40, wing: 0.8, cloak: 0.7 }, 'out'],
    [26, { hx: 0, hh: H0 - 0.5, lean: -6, head: -24, ra1: 52, ra2: 40, sa: 150 + W2_SPIN, la1: 10, la2: 50, handF: 1, wing: 0.8, cloak: 0.7 }],
    [W2_C, { hx: 0.6, hh: H0 - 1.2, lean: 2, head: -8, ra1: 78, ra2: 34, sa: 150 + W2_SPIN, la1: -10, la2: 40, handF: 0, wing: 0.7, cloak: 0.6 }],
    [37, { hx: 1, hh: H0 - 2.6, lean: 6, head: -2, ra1: 66, ra2: 44, sa: 168 + W2_SPIN, la1: -14, la2: 34, wing: 0.5, cloak: 0.5 }, 'out'],
    [46, { hx: 0.6, hh: H0 - 0.8, lean: 2, head: 0, ra1: 22, ra2: 46, sa: 178 + W2_SPIN, la1: -16, la2: 30, wing: 0.4, cloak: 0.35 }],
    [54, Object.assign({}, TIP, { head: -2, tby: -50, handB: 0.6 })],
    [60, Object.assign({}, TIP, { head: 14 }), 'out'],
    [67, Object.assign({}, TIP, { head: 4, lean: 1, tbx: 15, tby: -46 })],
  ]);
  function win2Pose(f) {
    const p = win2Keys(f);
    const br = smoothstep(64, 72, f);
    const ph = ((f - 70) / 50) * TAU;
    p.hh += br * 0.3 * Math.sin(ph);
    p.lean += br * 0.6 * Math.sin(ph + 0.4);
    p.cloak += br * 0.05 * Math.sin(ph + 1);
    p.wing += br * 0.08 * Math.sin(f * 0.3);
    p.wpnShow = f > W2_R && f < W2_C ? 0 : 1;
    return fin(p);
  }
  // flying staff between release and catch (mid point and angle)
  function w2Flight(c, f) {
    const A = c.sample(W2_R);
    const B = c.sample(W2_C);
    const a0 = staffAng(A);
    let a1 = staffAng(B);
    a1 = a0 + wrap(a1 - a0) + W2_SPIN; // continue the backward spin
    const t = clamp((f - W2_R) / (W2_C - W2_R), 0, 1);
    const k = c.k;
    const C = [-22 * k, -205 * k];
    const m = 1 - t;
    const mid = [m * m * A.mid[0] + 2 * m * t * C[0] + t * t * B.mid[0], m * m * A.mid[1] + 2 * m * t * C[1] + t * t * B.mid[1]];
    const ang = lerp(a0, a1, t);
    return { mid, ang };
  }

  // ==============================================================================
  // win3: reads a message scroll, smirks and flings it away on the wind
  // ==============================================================================
  const W3_OUT = 15; // scroll appears in the hand
  const W3_REL = 80; // released
  const SHOULDER = { tfx: 17, tfy: -14, tfw: 1, ra1: 30, ra2: 98, sa: 252 };
  const READ = { hx: 0.5, hh: H0 - 0.8, lean: 3, head: 12, tbx: 27, tby: -37, tbw: 1, handB: 0, wing: 0.3, cloak: 0.3 };
  const W3_END = {
    hx: -0.5, hh: H0 - 0.6, lean: -4, head: -14, tfx: 17, tfy: -14, tfw: 1, ra1: 30, ra2: 98, sa: 252,
    la1: -36, la2: 98, tbw: 0, handB: 0, wing: 0.7, cloak: 0.8,
  };
  const win3Keys = groundSeq([
    [0, IDLE0],
    [10, Object.assign({}, SHOULDER, { hx: 0.4, hh: H0 - 1.4, lean: 8, head: 10, tbx: 11, tby: -3, tbw: 1, la1: 0, la2: 40, wing: 0.3, cloak: 0.25 })],
    [W3_OUT, Object.assign({}, SHOULDER, { hx: 0.2, hh: H0 - 1.2, lean: 7, head: 8, tbx: 12, tby: -6, tbw: 1, la1: 0, la2: 40, wing: 0.3, cloak: 0.25 })],
    [25, Object.assign({}, SHOULDER, READ, { head: 4 })],
    [44, Object.assign({}, SHOULDER, READ, { head: 11 })],
    [50, Object.assign({}, SHOULDER, READ, { head: 7, tby: -41 })],
    [60, Object.assign({}, SHOULDER, READ, { head: 12 })],
    [66, Object.assign({}, SHOULDER, READ, { hx: 0, lean: -2, head: -6, tbx: 23, tby: -36 }), 'out'],
    [74, Object.assign({}, SHOULDER, { hx: -1.2, hh: H0 - 2.6, lean: -12, head: -8, tbx: -11, tby: -60, tbw: 1, la1: 160, la2: 40, wing: 0.4, cloak: 0.4 })],
    [W3_REL, Object.assign({}, SHOULDER, { hx: 1.4, hh: H0 - 1.8, lean: 12, head: -12, tbx: 34, tby: -52, tbw: 1, la1: 130, la2: 10, handB: 1, wing: 1.1, cloak: 1.0 }), 'out'],
    [88, Object.assign({}, SHOULDER, { hx: 0.8, hh: H0 - 1, lean: 4, head: -18, tbx: 30, tby: -56, tbw: 1, la1: 130, la2: 10, handB: 1, wing: 0.9, cloak: 1.0 })],
    [100, W3_END],
  ]);
  function win3Pose(f) {
    const p = win3Keys(f);
    const br = smoothstep(96, 104, f);
    const ph = ((f - 100) / 40) * TAU;
    p.hh += br * 0.3 * Math.sin(ph);
    p.lean += br * 0.6 * Math.sin(ph + 0.4);
    p.head += br * 0.8 * Math.sin(ph + 1);
    p.cloak += settle(f, W3_REL, 0.3, 14, 10) + br * 0.06 * Math.sin(ph * 2);
    return fin(p);
  }
  // scroll unroll state while held: 0 rolled .. 1 open
  const w3Open = (f) => smoothstep(25, 31, f) * (1 - smoothstep(64, 70, f));
  // scroll in flight after release: position (px, feet space) and spin
  function w3Flight(c, f) {
    const A = c.sample(W3_REL);
    const P0 = c.sample(W3_REL - 1);
    const v = sub(A.handB, P0.handB);
    const t = f - W3_REL;
    const k = c.k;
    const wind = [0.05 * k, -0.035 * k];
    return {
      p: [A.handB[0] + v[0] * 0.8 * t + 0.5 * wind[0] * t * t * 2, A.handB[1] + v[1] * 0.55 * t + 0.5 * wind[1] * t * t * 2],
      ang: -0.3 + t * 0.32,
      t,
    };
  }

  // ==============================================================================
  // lose: polite applause, staff tucked under the arm, a little sulky
  // ==============================================================================
  const CLAP = 15; // frames per clap (four claps per loop)
  const clapSep = (f) => Math.pow(Math.abs(Math.sin((Math.PI * f) / CLAP)), 0.6);
  function losePose(f) {
    const ph = (f / 60) * TAU;
    const s = clapSep(f);
    const lean = 1 + 0.8 * Math.sin(ph);
    const P = [21 + 0.6 * Math.sin(ph), -21 + 0.5 * Math.sin(ph + 1)];
    const p = Object.assign({}, GROUND, {
      hx: -0.8 + 0.6 * Math.sin(ph),
      hh: H0 - 0.9 - 0.3 * Math.cos(2 * ph),
      lean,
      head: 13 + 1.5 * Math.sin(ph + 0.5),
      tfx: P[0] + s * 3, tfy: P[1] - s * 7, tfw: 1,
      tbx: P[0] - s * 2, tby: P[1] + s * 6, tbw: 1,
      handF: 1, handB: 1,
      wing: 0.14 + 0.04 * Math.sin(2 * ph),
      cloak: 0.16 + 0.03 * Math.sin(ph + 1),
      wpnShow: 0,
    });
    return fin(p);
  }
  // staff pinned under the far arm, drawn behind the body
  function tuckedStaff(g, c) {
    const p = c.pose;
    const k = c.k;
    const lean = p.lean;
    const td = dirv(180 - lean);
    const perp = [Math.cos(lean * D2R), Math.sin(lean * D2R)];
    const pit = [c.J.sh[0] - (perp[0] * 5 + td[0] * 9) * k, c.J.sh[1] - (perp[1] * 5 + td[1] * 9) * k];
    drawStaff(g, c, pit, 62 + lean);
  }

  defineAnims('hermes', [
    {
      name: 'taunt_up',
      label: 'Up taunt',
      group: 'Taunts and results',
      input: 'Taunt + up',
      notes: 'Dips, twirls the caduceus up overhead and holds it high while the snakes rear and hiss and every wing beats.',
      frames: 60,
      pose: (f) => tauntUpPose(f),
      fxBack(g, f, c) {
        // a quiet engraved glory around the knob while it is held up
        const a = smoothstep(14, 20, f) * (1 - smoothstep(40, 46, f));
        if (a > 0) burst(g, c.ink, c.J.tip[0], c.J.tip[1], 9 * c.k, 18 * c.k, 14, f * 0.02, a * 0.7, 1);
        // the twirl up: a short crescent behind the body so it never covers the face
        if (f >= 8 && f <= 13) smear(g, c, trailOf(c, ['tip', 'mid'], 1.25, 0.25), 0.5 * (1 - smoothstep(11, 13, f)));
      },
      fx(g, f, c) {
        hiss(g, c, f, smoothstep(17, 21, f) * (1 - smoothstep(40, 44, f)));
      },
    },
    {
      name: 'taunt_side',
      label: 'Side taunt',
      group: 'Taunts and results',
      input: 'Taunt + left or right',
      notes: 'Twirls the caduceus like a baton in front of his chest, flicks it out and finishes with a sweeping bow.',
      frames: 60,
      pose: (f) => tauntSidePose(f),
      fxBack(g, f, c) {
        // the flick up and the sweep into the bow
        if (f >= 32 && f <= 39) smear(g, c, trailOf(c, ['tip', 'mid'], 1.5, 0.25), 0.5 * (1 - smoothstep(37, 39, f)));
      },
      fx(g, f, c) {
        if (twirlW(f) > 0) {
          // spin blur on both ends, then the baton itself on top of the hand
          const a = 0.5 * smoothstep(TW0, TW0 + 3, f) * (1 - smoothstep(TW1 - 2, TW1 + 2, f));
          if (a > 0) {
            const T = [];
            const B = [];
            for (let s = Math.max(0, f - 1.5); s <= f + 1e-6; s += 0.5) {
              const q = twirlStaff(c, s);
              T.push([q.tip, q.mid]);
              B.push([q.butt, q.mid]);
            }
            smear(g, c, T, a);
            smear(g, c, B, a * 0.8);
          }
          const q = twirlStaff(c, f);
          g.save();
          g.translate(q.hand[0], q.hand[1]);
          g.scale(q.sx, 1);
          drawStaff(g, c, q.grip, q.ang);
          g.restore();
        }
        // a flourish of feathers from the swept hand at the bow
        if (f >= 38 && f <= 54) {
          const t = (f - 38) / 16;
          const J = c.sample(38);
          for (let i = 0; i < 3; i++) {
            const x = J.handB[0] - (6 + i * 7 + t * 14) * c.k;
            const y = J.handB[1] + (-4 + i * 5 + t * t * 16) * c.k;
            fxFeather(g, c.ink, x, y, -60 + i * 40 + t * 90, 8 * c.k, (1 - t) * 0.9);
          }
        }
      },
    },
    {
      name: 'taunt_down',
      label: 'Down taunt',
      group: 'Taunts and results',
      input: 'Taunt + down',
      notes: 'Plants the staff, kneels to fix a winged sandal whose heel wing flaps on its own, shrugs and picks the staff back up.',
      frames: 60,
      pose: (f) => tauntDownPose(f),
      fxBack(g, f, c) {
        if (f > TD_R && f < TD_P) {
          const J = c.sample(TD_R);
          drawStaff(g, c, J.handF, staffAng(J));
        }
      },
      fx(g, f, c) {
        const k = c.k;
        if (f >= 8 && f <= 12) smear(g, c, trailOf(c, ['butt', 'handF'], 3, 0.5), 0.6);
        const J0 = c.sample(TD_R);
        dust(g, c.ink, J0.butt[0], (f - TD_R) / 12, 8 * k, 1, 0.8);
        dust(g, c.ink, J0.butt[0], (f - TD_P) / 10, 6 * k, 1, 0.6);
        // the restless heel wing: motion arcs and a shed feather
        const gag = smoothstep(25, 27, f) * (1 - smoothstep(35, 38, f));
        const ft = c.J.footF;
        // redraw the front heel wing (same geometry as the figure's) on top of the
        // kneeling legs so the restless flapping is readable
        if (f > 23 && f < 40) {
          g.save();
          g.globalAlpha *= smoothstep(23, 25, f) * (1 - smoothstep(37, 40, f));
          if (!skinProp(c, 'talaria', g, c.ink, ft[0] - 2 * k, ft[1] - 4 * k, -128, 14.5 * k, -c.pose.wing * 16, 'hatch', k * 0.8)) drawWing(g, c.ink, ft[0] - 2 * k, ft[1] - 4 * k, -128, 14.5 * k, -c.pose.wing * 16, 'hatch', k * 0.8);
          g.restore();
        }
        // arcs bracketing the tip of the heel wing (it points back and up from the heel)
        const wt = [ft[0] - 11 * k, ft[1] - 11 * k];
        const jit = 0.25 * Math.sin(f * 2.4);
        flutterMarks(g, c.ink, wt[0], wt[1], 8 * k, -2.4 + jit, gag);
        flutterMarks(g, c.ink, wt[0] + 2 * k, wt[1] + 2 * k, 9 * k, 2.3 + jit, gag * 0.85);
        flutterMarks(g, c.ink, wt[0] + 1 * k, wt[1], 8 * k, -0.9 + jit, gag * 0.7);
        if (f > 28 && f < 50) {
          const t = (f - 28) / 22;
          fxFeather(g, c.ink, ft[0] - (8 + t * 16) * k, ft[1] - (12 + 26 * Math.sin(t * Math.PI * 0.8)) * k, 200 + 120 * t + 20 * Math.sin(f * 0.5), 7 * k, 1 - t * t);
        }
        // shrug: two little up-ticks over the open palms
        const sh = bump(f, 41, 48);
        if (sh > 0) {
          g.save();
          g.globalAlpha *= sh * 0.85;
          g.strokeStyle = c.ink;
          g.lineCap = 'round';
          g.lineWidth = 1;
          for (const hnd of [c.J.handF, c.J.handB]) {
            for (const dx of [-3, 3]) line(g, hnd[0] + dx * k, hnd[1] - 7 * k, hnd[0] + dx * 1.5 * k, hnd[1] - 11 * k);
          }
          g.restore();
        }
      },
    },
    {
      name: 'entrance',
      label: 'Entrance',
      group: 'Taunts and results',
      input: 'Automatic at match start',
      notes: 'Fades in high above, swoops down in a long dive, flares his wings to brake and alights lightly as the cloak settles.',
      frames: 80,
      pose: (f) => entrancePose(f),
      fxBack(g, f, c) {
        // speed lines behind the dive
        if (f < 40) {
          const a = smoothstep(4, 12, f) * (1 - smoothstep(32, 40, f));
          const p0 = enPath(f - 2);
          const p1 = enPath(f);
          const d = norm([(p1[0] - p0[0]) || 1, (p1[1] - p0[1])]);
          fxSpeedLines(g, c.ink, c.J.center, d, 46 * c.k, 34 * c.k, 5, a * 0.8, c.rnd);
        }
      },
      fx(g, f, c) {
        const k = c.k;
        // landing: dust, wind and a few drifting feathers
        dust(g, c.ink, -6 * k, (f - EN_TD) / 14, 10 * k, -1, 0.9);
        dust(g, c.ink, 10 * k, (f - EN_TD) / 14, 9 * k, 1, 0.8);
        if (f >= EN_TD - 4 && f < EN_TD + 14) {
          const t = (f - EN_TD + 4) / 18;
          fxGust(g, c.ink, 2 * k, -5 * k, (14 + 16 * t) * k, t * 2.4, (1 - t) * 0.6);
        }
        for (let i = 0; i < 3; i++) {
          const t0 = 30 + i * 6;
          const t = (f - t0) / 40;
          if (t < 0 || t > 1) continue;
          const x = (-30 + i * 22 + Math.sin(t * 5 + i) * 6) * k;
          const y = (-120 + i * 12 + t * 110) * k;
          fxFeather(g, c.ink, x, Math.min(y, -2 * k), 160 + 50 * Math.sin(t * 6 + i), 8 * k, (1 - t * t) * smoothstep(0, 0.1, t));
        }
      },
    },
    {
      name: 'win1',
      label: 'Victory: heroic flip',
      group: 'Taunts and results',
      input: 'Results screen (victory)',
      notes: 'Springs into a tucked forward flip, sticks the landing and rises into a heroic stance with the caduceus held aloft.',
      frames: 120,
      pose: (f) => win1Pose(f),
      fxBack(g, f, c) {
        const a = smoothstep(62, 74, f);
        if (a > 0) burst(g, c.ink, c.J.tip[0], c.J.tip[1], 10 * c.k, 22 * c.k, 16, 0.1 + f * 0.004, a * 0.6, 1);
      },
      fx(g, f, c) {
        const k = c.k;
        dust(g, c.ink, -8 * k, (f - 11) / 12, 9 * k, -1, 0.8);
        dust(g, c.ink, 4 * k, (f - W1_DN) / 14, 11 * k, -1, 0.9);
        dust(g, c.ink, 18 * k, (f - W1_DN) / 14, 10 * k, 1, 0.8);
        if (f > 18 && f < 38) {
          const a = bump(f, 18, 38);
          smear(g, c, trailOf(c, ['footF', 'kneeF'], 4, 0.5), a * 0.55);
          fxGust(g, c.ink, c.J.pivot[0], c.J.pivot[1], 40 * k, f * 0.3, a * 0.55);
        }
        // a twinkle on the knob as he raises it
        twinkle(g, c.ink, c.J.tip[0] + 3 * k, c.J.tip[1] - 4 * k, 6 * k * bump(f, 62, 76), bump(f, 62, 76));
      },
    },
    {
      name: 'win2',
      label: 'Victory: hat tip',
      group: 'Taunts and results',
      input: 'Results screen (victory)',
      notes: 'Flicks the caduceus up off his back and over his head, catches it, stands it at his side like a cane and tips his hat with a wink.',
      frames: 120,
      pose: (f) => win2Pose(f),
      fxBack(g, f, c) {
        // the backswing flick
        if (f >= 10 && f <= W2_R) smear(g, c, trailOf(c, ['tip', 'mid'], 1.5, 0.25), 0.5);
        if (f > W2_R && f < W2_C) {
          const k = c.k;
          // spin blur, then the staff itself
          const pairs = [];
          for (let s = Math.max(W2_R, f - 1.5); s <= f + 1e-6; s += 0.5) {
            const q = w2Flight(c, s);
            const d = dirv(q.ang);
            pairs.push([[q.mid[0] + d[0] * 36 * k, q.mid[1] + d[1] * 36 * k], q.mid]);
          }
          smear(g, c, pairs, 0.45);
          const q = w2Flight(c, f);
          const d = dirv(q.ang);
          drawStaff(g, c, [q.mid[0] - d[0] * 10 * k, q.mid[1] - d[1] * 10 * k], q.ang);
        }
      },
      fx(g, f, c) {
        const k = c.k;
        // catch snap
        burst(g, c.ink, c.J.handF[0], c.J.handF[1], 6 * k, 11 * k, 8, 0.3, (1 - (f - W2_C) / 5) * (f >= W2_C ? 1 : 0), 1);
        // the tipping hand is drawn over the brim
        const tip = smoothstep(50, 55, f);
        if (tip > 0.5) {
          const J = c.J;
          if (!skinProp(c, 'hand', g, c.ink, J.handB, angOf(sub(J.handB, J.elbowB)), c.pose.handB, k, 'cross')) drawHand(g, c.ink, J.handB, angOf(sub(J.handB, J.elbowB)), c.pose.handB, k, 'cross');
        }
        // wink and a twinkle
        const w = smoothstep(62, 65, f);
        wink(g, c, w);
        smirk(g, c, w);
        if (f >= 62) {
          const h = c.J.head;
          const t = clamp((f - 62) / 10, 0, 1);
          twinkle(g, c.ink, h[0] + 16 * k, h[1] - 6 * k, (2 + 5 * Math.sin(t * Math.PI * 0.85)) * k, 1 - 0.5 * t);
        }
      },
    },
    {
      name: 'win3',
      label: 'Victory: the message',
      group: 'Taunts and results',
      input: 'Results screen (victory)',
      notes: 'Pulls a scroll from his belt, reads it, smirks and flings it away on a gust of wind.',
      frames: 120,
      pose: (f) => win3Pose(f),
      fx(g, f, c) {
        const k = c.k;
        const J = c.J;
        if (f >= W3_OUT && f <= W3_REL) {
          const d = norm(sub(J.handB, J.elbowB));
          const g0 = smoothstep(W3_OUT, W3_OUT + 3, f);
          const ang = Math.atan2(d[1], d[0]) - Math.PI / 2 + 0.2;
          const hold = [J.handB[0] + d[0] * 3 * k, J.handB[1] + d[1] * 3 * k];
          drawScroll(g, c.ink, hold[0], hold[1], lerp(ang, 0.15, w3Open(f)), w3Open(f), k * (0.8 + 0.45 * g0), g0);
        }
        if (f > W3_REL) {
          const q = w3Flight(c, f);
          const a = 1 - smoothstep(22, 34, q.t);
          drawScroll(g, c.ink, q.p[0], q.p[1], q.ang, 0, k * 1.25, a);
          // the wind that carries it
          const gt = clamp(q.t / 18, 0, 1);
          fxGust(g, c.ink, q.p[0] - 10 * k, q.p[1] + 6 * k, (14 + 18 * gt) * k, q.t * 0.35, (1 - gt) * 0.8);
          fxSpeedLines(g, c.ink, [q.p[0] - 8 * k, q.p[1] + 2 * k], norm([1, -0.6]), 30 * k, 14 * k, 3, (1 - gt) * 0.7, c.rnd);
          if (q.t < 30) fxFeather(g, c.ink, J.handB[0] + q.t * 1.6 * k, J.handB[1] - q.t * 1.2 * k + Math.sin(q.t * 0.4) * 4 * k, 120 + q.t * 9, 7 * k, 1 - q.t / 30);
        }
        if (f >= W3_REL - 3 && f <= W3_REL + 1) smear(g, c, trailOf(c, ['handB', 'elbowB'], 3, 0.5), 0.6);
        // reading ticks, then the smirk
        smirk(g, c, smoothstep(62, 66, f));
      },
    },
    {
      name: 'lose',
      label: 'Defeat: polite applause',
      group: 'Taunts and results',
      input: 'Results screen (defeat)',
      notes: 'Claps politely for the winner with the caduceus tucked under his arm, head bowed a little, wings drooping.',
      frames: 60,
      loop: true,
      pose: (f) => losePose(f),
      fxBack(g, f, c) {
        tuckedStaff(g, c);
      },
      fx(g, f, c) {
        pout(g, c, 1);
        // a small clap tick each time the palms meet
        const u = (((f % CLAP) + CLAP) % CLAP) / CLAP;
        const t = u < 0.5 ? u : u - 1;
        if (t >= 0 && t < 0.25) {
          const m = [(c.J.handF[0] + c.J.handB[0]) / 2 + 4 * c.k, (c.J.handF[1] + c.J.handB[1]) / 2];
          burst(g, c.ink, m[0], m[1], 5 * c.k, 9 * c.k, 6, -0.6, (1 - t / 0.25) * 0.7, 0.9);
        }
      },
    },
  ]);
})();
