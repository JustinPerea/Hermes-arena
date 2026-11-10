// Hermes — getting hit, going down, getting back up, KO and respawn.
//
// Floor poses (knockdown, lie, getups, tech, light flinch) are keyed with
// place(): limbs in WORLD angles (so a body rotated by rot keeps its arms and
// staff where they were keyed), feet as floor positions solved with a
// body-frame two-bone IK (knees always bend to the chest side), and the hip
// pinned to (hx, hh) so planted feet never slide. Heights follow the stand
// file's convention: h is measured from the foot line, 3 units above the floor.
// Air poses (hurt_heavy, tumble, ko, respawn) use the plain pose channels.
(() => {
  const SH = HERMES_SHAPE;
  const K = CHARACTERS.hermes.scale;
  const S1 = Object.assign({}, SH, { scale: 1 });
  const TAU = Math.PI * 2;

  // ---- legs ---------------------------------------------------------------------
  const fk = (l1, l2, side) => {
    const a = dirv(l1);
    const b = dirv(l1 + l2);
    return [side * 4 + a[0] * SH.thigh + b[0] * SH.shin, a[1] * SH.thigh + b[1] * SH.shin];
  };
  const nB = fk(BASE_POSE.ll1, BASE_POSE.ll2, -1);
  const nF = fk(BASE_POSE.rl1, BASE_POSE.rl2, 1);
  const H0 = Math.max(nB[1], nF[1]);
  const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
  // two-bone IK in the body frame, knee toward the body's front
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
  // damped wobble from frame f0 (overlapping action)
  const settle = (f, f0, amp, period, decay) => (f < f0 ? 0 : amp * Math.exp(-(f - f0) / decay) * Math.sin(((f - f0) / period) * TAU));

  // ---- floor poses ------------------------------------------------------------------
  // STAND is the idle stance in world terms (idle frame 0 rounded).
  const STAND = {
    rot: 0, lean: 4, head: 0,
    law: -11, la2: 23, raw: 30, ra2: 56, saw: 188,
    hx: 0.3, hh: H0 - 0.7, bx: nB[0], bh: H0 - nB[1], fx: nF[0], fh: H0 - nF[1],
    wing: 0.36, cloak: 0.2, handB: 0, handF: 0, fade: 0, wpnShow: 1,
  };
  const PLACE_KEYS = ['law', 'raw', 'saw', 'hx', 'hh', 'bx', 'bh', 'fx', 'fh'];
  // world-keyed floor pose -> pose channels
  function place(q) {
    const p = Object.assign({}, STAND, q);
    const r = p.rot;
    const o = Object.assign({}, BASE_POSE);
    for (const k in p) if (k in BASE_POSE) o[k] = p[k];
    o.rot = wrap(r);
    o.air = 0;
    o.lift = 0;
    o.la1 = p.law - p.lean + r;
    o.ra1 = p.raw - p.lean + r;
    o.wpn = p.saw + r - (p.lean + o.ra1 + o.ra2);
    // feet: world vector from the hip centre, turned into the body frame
    const cr = Math.cos(r * D2R);
    const sr = Math.sin(r * D2R);
    const body = (vx, vy) => [vx * cr + vy * sr, -vx * sr + vy * cr];
    const vb = body(p.bx - p.hx, p.hh - p.bh);
    const vf = body(p.fx - p.hx, p.hh - p.fh);
    [o.ll1, o.ll2] = ik(vb[0] + 4, vb[1]);
    [o.rl1, o.rl2] = ik(vf[0] - 4, vf[1]);
    // pin the hip at (hx, hh)
    o.ox = 0;
    o.oy = 0;
    const J = hermesFrame(o, S1).J;
    o.ox = p.hx - J.hip[0];
    o.oy = -(p.hh + 3) - J.hip[1];
    return o;
  }
  const placeSeq = (keys) => {
    const s = seq(STAND, keys);
    return (f) => place(s(f));
  };

  // plain-channel pose with the hip pinned at x = hx and the body resting on
  // the floor (lowest contact point at y = 0) plus an optional raise 'up'
  function contacts(o) {
    const FR = hermesFrame(o, S1);
    const sk = FR.sk;
    const L = FR.toLocal;
    const back = (p, d) => [p[0] - sk.perp[0] * d, p[1] - sk.perp[1] * d];
    const along = (t) => [sk.sh[0] * t, sk.sh[1] * t];
    const pts = [
      [L(back(sk.hip, 7)), 1], [L(back(along(0.5), 9)), 1], [L(back(along(0.85), 10.5)), 1],
      [FR.J.head, 7.6], [FR.J.kneeF, 4], [FR.J.kneeB, 4], [FR.J.footF, 3], [FR.J.footB, 3],
      [FR.J.handF, 2.5], [FR.J.handB, 2.5], [FR.J.elbowF, 3.5], [FR.J.elbowB, 3.5],
      [L(back(sk.hip, -6)), 5],
    ];
    if (o.wpnShow > 0.5) pts.push([FR.J.tip, 1.5], [FR.J.butt, 1.5]);
    let low = -1e9;
    for (const [pt, r] of pts) low = Math.max(low, pt[1] + r);
    return { low, J: FR.J };
  }
  function rest(q) {
    const o = Object.assign({}, BASE_POSE, q);
    if (q.sa != null) o.wpn = q.sa - (o.lean + o.ra1 + o.ra2);
    for (const k in o) if (!(k in BASE_POSE)) delete o[k];
    o.rot = wrap(o.rot);
    o.ox = 0;
    o.oy = 0;
    const { low, J } = contacts(o);
    o.ox = (q.hx || 0) - J.hip[0];
    o.oy = -low - (q.up || 0);
    return o;
  }

  // ---- key poses ---------------------------------------------------------------------
  // flat on his back, head toward the back (-x), one knee up, staff lying by his side
  // (the torso tilt is split as lean -80 + rot -6 so the heel wings and the hat
  // wing, which are fixed to the body frame, lie along the floor instead of into it)
  const LIE = {
    rot: -6, lean: -80, head: -22,
    law: -74, la2: -12, raw: 80, ra2: 6, saw: 108,
    hx: 4, hh: 5, bx: 51, bh: 1, fx: 30, fh: 0,
    wing: 0.3, cloak: 0, handB: 1, handF: 0,
  };
  // a lying-family key: torso world tilt tw split the same way
  const flat = (tw, p) => Object.assign({ rot: tw + 80, lean: -80 }, p);
  const LIE_CLOAK = 112;
  // deep crouch on the idle footprint (end of rolls, tech)
  const CROUCH = {
    rot: 0, lean: 26, head: -8,
    law: 30, la2: 50, raw: 56, ra2: 64, saw: 150,
    hx: 1.5, hh: 30, wing: 0.7, cloak: 0.6, handB: 1,
  };
  // limp airborne body: the start of the tumble cycle
  const TUMBLE_ROT = -30;
  function tumbleAt(f) {
    const ph = (f / 40) * TAU;
    const s = (a, w) => Math.sin(ph * (w || 1) + a);
    return {
      air: 1,
      rot: wrap(TUMBLE_ROT - 360 * (f / 40) + 6 * Math.sin(ph)),
      lean: -10 + 6 * s(0),
      head: -10 + 9 * s(1),
      la1: 112 + 30 * s(0.6), la2: 36 + 22 * s(0.2, 2),
      ra1: 80 + 24 * s(2.1), ra2: 44 + 18 * s(1, 2),
      ll1: 30 + 16 * s(1.3), ll2: -58 + 18 * s(0.1),
      rl1: 58 + 18 * s(2.6), rl2: -46 + 16 * s(0.5),
      sa: 168 + 26 * s(0.3),
      handB: 1, handF: 0,
      wing: 0.9 + 0.35 * s(0, 4),
      cloak: 1.2 + 0.2 * s(0.7, 2),
    };
  }
  const TUMBLE0 = tumbleAt(0);
  const finSa = (p) => {
    const o = Object.assign({}, p);
    if (o.sa != null) o.wpn = o.sa - (o.lean + o.ra1 + o.ra2);
    delete o.sa;
    return o;
  };

  // ---- body redrawn from fx with a steered cloak ----------------------------------------
  // The cloak always hangs world-down from the back of the shoulders, which
  // pushes it through the floor when he lies on his back. Floor poses hide the
  // main figure (fade 1) and redraw the same pose here with draw options that
  // steer the cloak along the body instead (see the report: a cloak-direction
  // pose channel would make this unnecessary).
  function cloakOpts(deg, cloak) {
    let [dx, dy] = dirv(deg);
    const s = dy < -0.7 ? 0.7 / -dy : 1;
    dx *= s;
    dy *= s;
    const tx = (v) => -0.38 - 0.06 * v - 0.2 * clamp(cloak + 0.04 * Math.abs(v), 0, 1.5);
    let lo = -300;
    let hi = 300;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (tx(m) > dx) lo = m;
      else hi = m;
    }
    return { vx: (lo + hi) / 2, vy: (1 - dy) / 0.08 };
  }
  // cl = { w: steer weight 0..1, d: cloak direction (dirv degrees, local space) }
  function drawBody(g, c, cl) {
    const P = Object.assign({}, c.pose, { fade: 0 });
    const nx = (c.vx || 0) * (c.face || 1);
    const ny = c.vy || 0;
    const o = cl.w > 0 ? cloakOpts(cl.d, P.cloak) : { vx: nx, vy: ny };
    c.drawFigure(g, P, 0, 0, { face: 1, ink: c.ink, scale: c.k, time: c.time, vx: lerp(nx, o.vx, cl.w), vy: lerp(ny, o.vy, cl.w) });
  }
  const cloakSeq = (keys) => seq({ w: 1, d: 112 }, keys);
  // wrap a floor definition: hide the main figure before frame 'until' and redraw it from fx
  function floorBody(def, cloakFn, until) {
    const pose = def.pose;
    const fx = def.fx;
    return Object.assign(def, {
      pose(f, c) {
        const p = pose(f, c);
        if (f < until) p.fade = 1;
        return p;
      },
      fx(g, f, c) {
        if (f < until) drawBody(g, c, cloakFn(f));
        if (fx) fx(g, f, c);
      },
    });
  }

  // ---- effects -----------------------------------------------------------------------
  function dust(g, ink, x, t, size, dir, alpha) {
    if (t < 0 || t > 1) return;
    g.save();
    g.globalAlpha *= (alpha == null ? 1 : alpha) * (1 - t * t);
    const r = size * (0.32 + 0.6 * Math.sqrt(t));
    const cx = x + dir * size * 1.4 * t;
    const cy = -r * 0.55 - size * 0.2 * t;
    const lobes = [[-0.75, 0.2, 0.55], [0, -0.2, 0.78], [0.8, 0.15, 0.5]];
    g.beginPath();
    for (const [dx, dy, rr] of lobes) {
      g.moveTo(cx + dir * dx * r + rr * r, cy + dy * r);
      g.arc(cx + dir * dx * r, cy + dy * r, rr * r, 0, TAU);
    }
    g.strokeStyle = ink;
    g.lineWidth = 1.8;
    g.stroke();
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    g.globalAlpha *= 0.8;
    g.fillStyle = inkPatterns(g, ink).hatch;
    g.fill();
    g.fillStyle = ink;
    for (let i = 0; i < 3; i++) {
      const a = 0.45 + i * 0.35;
      const d = size * (0.6 + 1.5 * t) * (0.8 + i * 0.25);
      g.beginPath();
      g.arc(x + dir * Math.cos(a) * d, -Math.sin(a) * d * 0.8 + t * t * size * 0.6, 0.9 + (i % 2) * 0.5, 0, TAU);
      g.fill();
    }
    g.restore();
  }
  // short floor strokes flicking out from an impact
  function impactLines(g, ink, x, w, t, alpha) {
    if (t < 0 || t > 1) return;
    g.save();
    g.globalAlpha *= (alpha == null ? 1 : alpha) * (1 - t);
    g.strokeStyle = ink;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = -1 - i * 3;
        const x0 = x + s * (w * (0.5 + 0.7 * t) + i * 3);
        g.lineWidth = i === 0 ? 1.8 : 0.9;
        line(g, x0, y, x0 + s * w * (0.5 - i * 0.12) * (1 - 0.4 * t), y - i * 1.2);
      }
    }
    g.restore();
  }
  // feathers bursting out of a point and fluttering down
  function featherBurst(g, ink, x, y, t, n, size, seed, alpha) {
    if (t < 0 || t > 1) return;
    const rnd = mulberry32(seed);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.1 + 0.8 * (i + rnd() * 0.6) / n);
      const v = size * (1.6 + rnd() * 1.4);
      const e = 1 - Math.pow(1 - t, 2.4);
      const px = x + Math.cos(a) * v * e + Math.sin(t * 9 + i) * 3;
      const py = y + Math.sin(a) * v * e + t * t * size * 1.2;
      const ang = (a / D2R) + 90 + 70 * Math.sin(t * 7 + i * 2);
      fxFeather(g, ink, px, py, ang, size * (0.55 + rnd() * 0.3), (alpha == null ? 1 : alpha) * (1 - t * t));
    }
  }
  // flattened wind rings at the feet
  function windRing(g, ink, x, y, R, t, alpha) {
    if (t < 0 || t > 1) return;
    g.save();
    g.globalAlpha *= (alpha == null ? 1 : alpha) * (1 - t);
    g.strokeStyle = ink;
    g.lineCap = 'round';
    for (let j = 0; j < 2; j++) {
      const rr = R * (0.45 + 0.75 * t) * (1 - j * 0.28);
      g.lineWidth = j === 0 ? 1.8 : 1;
      for (const [a0, a1] of [[0.15, 1.25], [1.6, 2.55], [3.35, 4.3], [4.7, 5.9]]) {
        g.beginPath();
        g.ellipse(x, y, rr, rr * 0.22, 0, a0 + j * 0.4 + t * 0.6, a1 + j * 0.4 + t * 0.6);
        g.stroke();
      }
    }
    g.restore();
  }
  // radiating ink rays (wedges with hatching) for the KO burst
  function rays(g, ink, x, y, R0, R1, t, n, seed, alpha) {
    if (t < 0 || t > 1) return;
    const rnd = mulberry32(seed);
    const P = inkPatterns(g, ink);
    g.save();
    g.globalAlpha *= (alpha == null ? 1 : alpha) * (1 - t * t);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.25;
      const long = i % 2 ? 0.6 + rnd() * 0.25 : 0.9 + rnd() * 0.2;
      const r0 = R0 + (R1 - R0) * 0.3 * t;
      const r1 = r0 + (R1 - R0) * long * (0.4 + 0.6 * Math.sqrt(t));
      const w = (i % 2 ? 0.035 : 0.06) * (1 - 0.5 * t);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      g.beginPath();
      g.moveTo(x + Math.cos(a - w) * r0, y + Math.sin(a - w) * r0);
      g.lineTo(x + ca * r1, y + sa * r1);
      g.lineTo(x + Math.cos(a + w) * r0, y + Math.sin(a + w) * r0);
      g.closePath();
      g.fillStyle = PAPER_LIGHT;
      g.fill();
      g.fillStyle = i % 2 ? P.hatch : P.cross;
      g.fill();
      g.strokeStyle = ink;
      g.lineWidth = i % 2 ? 0.8 : 1.4;
      g.stroke();
    }
    g.restore();
  }
  // upward fan of short ink ticks from a floor impact
  function flash(g, ink, x, y, R, t) {
    if (t < 0 || t > 1) return;
    g.save();
    g.globalAlpha *= 1 - t;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.08 + (i / 8) * 0.84);
      const r0 = R * (0.35 + 0.45 * t);
      const r1 = r0 + R * (i % 2 ? 0.25 : 0.45) * (1 - 0.5 * t);
      g.lineWidth = i % 2 ? 1 : 1.8;
      line(g, x + Math.cos(a) * r0, y + Math.sin(a) * r0 * 0.7, x + Math.cos(a) * r1, y + Math.sin(a) * r1 * 0.7);
    }
    g.restore();
  }
  // a little ring of feathers circling over a dazed head
  function dazed(g, ink, hx, hy, ph, alpha) {
    const items = [];
    for (let i = 0; i < 3; i++) {
      const a = ph + (i / 3) * TAU;
      items.push({ x: hx + Math.cos(a) * 24, y: hy + Math.sin(a) * 7, front: Math.sin(a), a });
    }
    items.sort((p, q) => p.front - q.front);
    for (const it of items) {
      const sc = 0.75 + 0.25 * it.front;
      fxFeather(g, ink, it.x, it.y, 90 + 35 * Math.cos(it.a * 2), 19 * sc, (alpha == null ? 1 : alpha) * (0.6 + 0.4 * sc));
    }
    g.save();
    g.globalAlpha *= (alpha == null ? 1 : alpha) * 0.55;
    g.strokeStyle = ink;
    g.lineWidth = 0.7;
    g.setLineDash([2, 3]);
    g.beginPath();
    g.ellipse(hx, hy, 24, 7, 0, 0, TAU);
    g.stroke();
    g.restore();
  }
  // short flinch strokes beside the head
  function flinchMarks(g, ink, x, y, t, dir) {
    if (t < 0 || t > 1) return;
    g.save();
    g.globalAlpha *= 1 - t;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = (-60 + i * 35) * D2R;
      const r0 = 11 + t * 6;
      const r1 = r0 + 7 - i;
      g.lineWidth = 1.4 - i * 0.25;
      line(g, x + dir * Math.cos(a) * r0, y + Math.sin(a) * r0, x + dir * Math.cos(a) * r1, y + Math.sin(a) * r1);
    }
    g.restore();
  }
  // curved motion arcs around a spinning body
  function spinArcs(g, ink, cx, cy, R, rotDeg, alpha) {
    g.save();
    g.globalAlpha *= alpha;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    const a0 = rotDeg * D2R;
    for (const [off, w, len] of [[0.6, 1.6, 1.1], [0.75, 0.8, 0.8], [3.75, 1.4, 1.0], [3.9, 0.7, 0.7]]) {
      g.lineWidth = w;
      g.beginPath();
      g.arc(cx, cy, R * (off > 3 ? 0.92 : 1) - (w < 1 ? 6 : 0), a0 + off, a0 + off + len);
      g.stroke();
    }
    g.restore();
  }

  // ---- hurt_light ------------------------------------------------------------------------
  const hurtLight = placeSeq([
    [0, { hx: -2.2, hh: H0 - 1.4, lean: -9, head: -20, law: -32, la2: 44, raw: 44, ra2: 70, saw: 182, wing: 0.95, cloak: 0.85, handB: 1 }],
    [2, { hx: -3.4, hh: H0 - 2.6, lean: -14, head: -27, law: -44, la2: 52, raw: 52, ra2: 80, saw: 188, wing: 1.15, cloak: 1.0, handB: 1 }, 'out'],
    [6, { hx: -3, hh: H0 - 3, lean: -11, head: -19, law: -38, la2: 48, raw: 48, ra2: 76, saw: 186, wing: 0.8, cloak: 0.95, handB: 1 }],
    [12, { hx: 0.9, hh: H0 - 1.8, lean: 9, head: 5, law: -2, la2: 30, raw: 36, ra2: 62, saw: 184, wing: 0.45, cloak: 0.45 }],
    [20, {}],
  ]);

  // ---- hurt_heavy ---------------------------------------------------------------------
  const AIRB = Object.assign({}, BASE_POSE, { air: 1, sa: 190 });
  const hurtHeavy = seq(AIRB, [
    [0, { rot: -6, lean: -26, head: -24, la1: 118, la2: 18, ra1: 104, ra2: 14, sa: 146, ll1: 48, ll2: -34, rl1: 72, rl2: -24, wing: 1.3, cloak: 1.5, handB: 1 }],
    [3, { rot: -12, lean: -36, head: -32, la1: 134, la2: 10, ra1: 120, ra2: 6, sa: 138, ll1: 58, ll2: -22, rl1: 84, rl2: -14, wing: 1.45, cloak: 1.5, handB: 1 }, 'out'],
    [9, { rot: -16, lean: -30, head: -24, la1: 122, la2: 30, ra1: 104, ra2: 26, sa: 150, ll1: 42, ll2: -40, rl1: 70, rl2: -34, wing: 1.1, cloak: 1.4, handB: 1 }],
    [18, { rot: -22, lean: -18, head: -14, la1: 112, la2: 36, ra1: 88, ra2: 40, sa: 166, ll1: 32, ll2: -54, rl1: 60, rl2: -44, wing: 0.95, cloak: 1.25, handB: 1 }],
    [30, TUMBLE0],
  ]);

  // ---- knockdown ----------------------------------------------------------------------
  const knockdown = placeSeq([
    [0, flat(-82, { head: 10, law: -150, la2: 24, raw: 160, ra2: 20, saw: 172, hx: 2, hh: 6.5, bx: 32, bh: 34, fx: 20, fh: 40, wing: 1.3, cloak: 0.6, handB: 1 })],
    [2, flat(-90, { head: -16, law: -96, la2: 8, raw: 110, ra2: 16, saw: 124, hx: 3, hh: 3.6, bx: 44, bh: 14, fx: 34, fh: 18, wing: 0.9, cloak: 0.2, handB: 1 }), 'out'],
    [6, flat(-82, { head: -8, law: -124, la2: 30, raw: 122, ra2: 30, saw: 136, hx: 3.5, hh: 15, bx: 47, bh: 11, fx: 37, fh: 16, wing: 0.7, cloak: 0.2, handB: 1 }), 'out'],
    [10, flat(-89, { head: -26, law: -80, la2: -8, raw: 78, ra2: 10, saw: 106, hx: 4, hh: 4.4, bx: 50, bh: 2, fx: 42, fh: 3, wing: 0.4, cloak: 0, handB: 1 }), 'in'],
    [13, flat(-85, { head: -17, law: -82, la2: -10, raw: 80, ra2: 8, saw: 108, hx: 4, hh: 5.8, bx: 51, bh: 3, fx: 42, fh: 3.5, wing: 0.35, cloak: 0, handB: 1 }), 'out'],
    [24, LIE],
  ]);
  const knockdownCloak = cloakSeq([
    [0, { d: 165 }],
    [4, { d: LIE_CLOAK }],
  ]);

  // ---- lie --------------------------------------------------------------------------------
  function liePose(f) {
    const ph = (f / 60) * TAU;
    return place(Object.assign({}, LIE, {
      lean: LIE.lean + 1.6 * Math.sin(ph),
      head: LIE.head + 3 * Math.sin(ph + 1) + 1.5 * Math.sin(2 * ph),
      raw: LIE.raw + 1.2 * Math.sin(ph + 0.6),
      law: LIE.law + 2 * Math.sin(ph - 0.4),
      fx: LIE.fx + 1.2 * Math.sin(ph + 2),
      wing: LIE.wing + 0.12 * Math.sin(3 * ph),
    }));
  }

  // ---- getup ------------------------------------------------------------------------------
  const getup = placeSeq([
    [0, LIE],
    [6, { rot: -54, lean: 4, head: 16, law: -100, la2: 6, raw: 112, ra2: 30, saw: 134, hx: 2, hh: 6, bx: 30, bh: 0, fx: 24, fh: 0, wing: 1.6, cloak: 0.3, handB: 1 }],
    [11, { rot: -14, lean: 4, head: 10, law: -36, la2: 6, raw: 84, ra2: 48, saw: 150, hx: -3, hh: 17, bx: -26, bh: 2, fx: STAND.fx, fh: 0, wing: 0.7, cloak: 0.6, handB: 1 }],
    [17, { rot: 0, lean: 24, head: -4, law: 24, la2: 46, raw: 56, ra2: 62, saw: 160, hx: 1.5, hh: 31, bx: STAND.bx, bh: STAND.bh, wing: 0.8, cloak: 0.7, handB: 1 }],
    [23, { rot: 0, lean: 1, head: -3, law: -16, la2: 20, raw: 26, ra2: 52, saw: 192, hx: 0.4, hh: H0 + 0.2, wing: 0.55, cloak: 0.4 }, 'out'],
    [30, {}],
  ]);
  const getupCloak = cloakSeq([
    [0, {}],
    [6, { d: 285 }],
    [11, { w: 0, d: 300 }],
  ]);

  // ---- getup_attack -------------------------------------------------------------------------
  const KNEEL = { hx: -1, hh: 17, bx: -27, bh: 2, fx: 20, fh: 0 };
  const kneel = (p, extra) => Object.assign({ rot: 0, handB: 1 }, KNEEL, p, extra || {});
  const getupAttack = placeSeq([
    [0, LIE],
    [5, { rot: -50, lean: 4, head: 14, law: -100, la2: 6, raw: 150, ra2: 26, saw: 196, hx: 2, hh: 6, bx: 30, bh: 0, fx: 24, fh: 0, wing: 1.4, cloak: 0.3, handB: 1 }],
    [11, kneel({ lean: 8, head: 4, law: 30, la2: 40, raw: 176, ra2: 24, saw: 228, wing: 0.9, cloak: 0.7 })],
    [14, kneel({ lean: 30, head: -2, law: -64, la2: 14, raw: 74, ra2: 6, saw: 100, wing: 1.3, cloak: 1.1 }, { hx: 2, hh: 15 }), 'out'],
    [16, kneel({ lean: 33, head: -2, law: -68, la2: 12, raw: 66, ra2: 4, saw: 96, wing: 1.0, cloak: 1.15 }, { hx: 2.5, hh: 14.5 })],
    // the staff whirls up over his head (tip forward -> up -> back) and the
    // arm swings over to sweep the tip low behind him; arm angles keep
    // increasing past 360 so the whirl turns one way, and the pose is wrapped
    [18, kneel({ lean: 14, head: -6, law: -20, la2: 30, raw: 132, ra2: 6, saw: 190, wing: 1.2, cloak: 1.1 }, { hx: 1, hh: 16 }), 'lin'],
    [20, kneel({ lean: -12, head: -16, law: 86, la2: 14, raw: 292, ra2: 8, saw: 262, wing: 1.35, cloak: 1.25 }, { hx: -2.5, hh: 17.5 }), 'out'],
    [22, kneel({ lean: -14, head: -15, law: 90, la2: 16, raw: 297, ra2: 8, saw: 268, wing: 1.0, cloak: 1.3 }, { hx: -3, hh: 18 })],
    [27, { rot: 0, lean: 7, head: -4, law: 6, la2: 32, raw: 380, ra2: 60, saw: 205, hx: 0.5, hh: H0 - 4, wing: 0.7, cloak: 0.7, handB: 1 }],
    [34, { raw: STAND.raw + 360 }],
  ]);
  const getupAttackCloak = cloakSeq([
    [0, {}],
    [5, { d: 270 }],
    [10, { w: 0, d: 300 }],
  ]);

  // ---- getup_roll ---------------------------------------------------------------------------
  // a tucked backward roll: rot keeps turning backward from the lying -90 to -360
  const LIE_CH = place(LIE);
  const CROUCH_CH = place(CROUCH);
  const chan = (P, extra) => Object.assign({}, P, extra);
  const TUCKB = { ll1: 96, ll2: -140, rl1: 108, rl2: -146 };
  // roll keys use a figure-space staff angle 'sa'
  const rk = (...ps) => finSa(Object.assign({}, BASE_POSE, ...ps));
  const rollFit = seq(Object.assign({}, BASE_POSE, { hx: 0, up: 0 }), [
    [0, chan(LIE_CH, { hx: LIE.hx, rot: LIE.rot })],
    [3, rk({ rot: -110, lean: 20, head: 48, la1: 168, la2: 36, ra1: 150, ra2: 60, sa: 30, hx: 4, wing: 1.2, cloak: 0.3, handB: 1 }, TUCKB)],
    [6, rk({ rot: -168, lean: 18, head: 34, la1: 176, la2: 8, ra1: 166, ra2: 16, sa: 30, hx: 1, up: 14, wing: 2.0, cloak: 0.6, handB: 1 }, TUCKB), 'out'],
    [9, rk({ rot: -232, lean: 22, head: 18, la1: 70, la2: 90, ra1: 60, ra2: 100, sa: 24, hx: -1, up: 22, wing: 1.6, cloak: 0.8, handB: 0 }, TUCKB)],
    [13, rk({ rot: -305, lean: 18, head: 6, la1: -50, la2: 30, ra1: 80, ra2: 50, sa: 120, hx: 0, up: 9, ll1: 20, ll2: -72, rl1: 46, rl2: -84, wing: 1.3, cloak: 0.8, handB: 1 })],
    [17, chan(CROUCH_CH, { hx: CROUCH.hx, rot: -360 }), 'out'],
  ]);
  const rollCloak = cloakSeq([
    [0, {}],
    [4, { d: 150 }],
    [8, { d: 175 }],
    [12, { d: 130 }],
    [16, { w: 0, d: 100 }],
  ]);
  const rollPlace = placeSeq([
    [17, CROUCH],
    [23, { lean: 2, head: -3, law: -14, la2: 22, raw: 28, ra2: 54, saw: 190, hx: 0.3, hh: H0 + 0.2, wing: 0.55, cloak: 0.45 }, 'out'],
    [30, {}],
  ]);

  // ---- tech ----------------------------------------------------------------------------------
  const tech = placeSeq([
    [0, { lean: 30, head: -10, law: -58, la2: 22, raw: 78, ra2: 30, saw: 120, hx: 2, hh: 27, wing: 1.5, cloak: 1.2, handB: 1, handF: 0 }],
    [3, { lean: 33, head: -6, law: -66, la2: 26, raw: 70, ra2: 34, saw: 116, hx: 2.5, hh: 24, wing: 1.3, cloak: 1.25, handB: 1 }, 'out'],
    [9, { lean: -3, head: -8, law: -36, la2: 14, raw: 44, ra2: 46, saw: 176, hx: 0, hh: H0 + 0.4, wing: 1.0, cloak: 0.8, handB: 1 }, 'out'],
    [14, { lean: 7, head: 2, law: -6, la2: 28, raw: 32, ra2: 58, saw: 186, hx: 0.6, hh: H0 - 1.4, wing: 0.55, cloak: 0.4 }],
    [20, {}],
  ]);

  // ---- ko --------------------------------------------------------------------------------------
  // the body flies back (-x) and up, spinning and shrinking into the distance
  const koT = (f) => clamp(f / 52, 0, 1);
  const koE = (f) => 1 - Math.pow(1 - koT(f), 1.7);
  const koPath = (f) => {
    const e = koE(f);
    return [-34 - 250 * e, -40 - 230 * e + 30 * Math.sin(Math.PI * e) * 0];
  };
  const koScale = (f) => 1 - 0.9 * Math.pow(koE(f), 0.8);
  function koBody(f) {
    const ph = f * 0.9;
    return finSa({
      air: 1,
      rot: wrap(-20 - 760 * koE(f)),
      lean: -26, head: -24,
      la1: 130 + 12 * Math.sin(ph), la2: 20, ra1: 112 + 10 * Math.sin(ph + 1), ra2: 16, sa: 236,
      ll1: 50, ll2: -30, rl1: 78, rl2: -20,
      wing: 1.2 + 0.3 * Math.sin(ph * 2), cloak: 1.5, handB: 1,
    });
  }

  // ---- respawn ------------------------------------------------------------------------------
  const FALL0 = {
    lean: 1.4, head: 3.4, la1: -98, la2: 13, ra1: 74.4, ra2: 32.8, sa: 147.6,
    ll1: -3.8, ll2: -33.7, rl1: 37.5, rl2: -53.1, handB: 1, wing: 0.7, cloak: 0.93,
  };
  const respawnBody = seq(Object.assign({}, BASE_POSE, { air: 1, sa: 150 }), [
    [0, { lean: -4, head: 8, la1: -128, la2: 10, ra1: 132, ra2: 8, sa: 176, ll1: 4, ll2: -14, rl1: 14, rl2: -22, handB: 1, cloak: 1.3 }],
    [40, { lean: -2, head: 6, la1: -118, la2: 12, ra1: 118, ra2: 14, sa: 170, ll1: 2, ll2: -18, rl1: 18, rl2: -28, handB: 1, cloak: 1.2 }],
    [66, { lean: 6, head: 2, la1: -84, la2: 20, ra1: 70, ra2: 40, sa: 150, ll1: 6, ll2: -46, rl1: 44, rl2: -66, handB: 1, cloak: 0.9 }],
    [78, { lean: 2, head: 4, la1: -100, la2: 12, ra1: 76, ra2: 30, sa: 148, ll1: -6, ll2: -30, rl1: 34, rl2: -50, handB: 1, cloak: 0.95 }],
    [90, FALL0],
  ]);
  const RESP_DROP = 150;
  const respawnY = (f) => {
    // glide down (decelerating), dip a touch below the hover line, rise back
    if (f < 66) return -RESP_DROP * Math.pow(1 - f / 66, 2.1) + 3 * smoothstep(48, 66, f);
    return 3 * Math.exp(-(f - 66) / 9) * Math.cos(((f - 66) / 24) * TAU * 0.5) - 2 * Math.sin(((f - 66) / 24) * TAU) * smoothstep(66, 80, f) * (1 - smoothstep(84, 90, f));
  };

  defineAnims('hermes', [
    {
      name: 'hurt_light',
      label: 'Light flinch',
      group: 'Hit and recovery',
      input: 'Hit by a weak attack on the ground',
      notes: 'The head snaps back and the hips give a step, then he rocks forward through a small overshoot and settles.',
      frames: 20,
      pose(f) {
        const p = hurtLight(f);
        p.cloak += settle(f, 4, 0.18, 9, 6);
        p.wing += settle(f, 2, 0.25, 6, 5);
        return p;
      },
      fx(g, f, c) {
        const J = c.J;
        flinchMarks(g, c.ink, J.head[0] + 6, J.head[1] - 4, f / 7, 1);
      },
    },
    {
      name: 'hurt_heavy',
      label: 'Heavy recoil',
      group: 'Hit and recovery',
      input: 'Hit by a strong attack',
      notes: 'A whiplash arch: the torso is driven back while arms, legs and cloak are flung forward, then the body goes limp.',
      frames: 30,
      air: true,
      pose(f) {
        const p = finSa(hurtHeavy(f));
        p.wing += settle(f, 3, 0.3, 7, 8);
        return p;
      },
      fxBack(g, f, c) {
        if (f > 12) return;
        const J = c.J;
        const t = f / 12;
        fxSpeedLines(g, c.ink, [J.center[0] + 30 - 10 * t, J.center[1] - 4], [-1, 0.12], 46, 52, 6, 0.75 * (1 - t), c.rnd);
      },
    },
    {
      name: 'tumble',
      label: 'Tumble',
      group: 'Hit and recovery',
      input: 'Launched by a strong hit',
      notes: 'A slow backward cartwheel through the air with limp, trailing limbs and the cloak flapping.',
      frames: 40,
      loop: true,
      air: true,
      pose: (f) => finSa(tumbleAt(f)),
      fxBack(g, f, c) {
        const J = c.J;
        spinArcs(g, c.ink, J.pivot[0], J.pivot[1], 58, -c.pose.rot + 180, 0.45);
      },
    },
    floorBody({
      name: 'knockdown',
      label: 'Knockdown',
      group: 'Hit and recovery',
      input: 'Tumbling into the floor without teching',
      notes: 'Slams down on his back, legs whipping over, bounces once in a burst of dust and sprawls flat.',
      frames: 24,
      next: 'lie',
      pose(f) {
        const p = knockdown(f);
        p.wing += settle(f, 2, 0.35, 6, 5);
        return p;
      },
      fxBack(g, f, c) {
        const J = c.J;
        dust(g, c.ink, J.hip[0] - 10, f / 16, 20, -1, 0.95);
        dust(g, c.ink, J.hip[0] + 14, f / 16, 18, 1, 0.95);
      },
      fx(g, f, c) {
        const J = c.J;
        // clouds billowing out past the head and the feet, in front of the body
        dust(g, c.ink, J.head[0] - 22, (f - 1) / 15, 17, -1, 0.95);
        dust(g, c.ink, Math.max(J.footB[0], J.footF[0]) + 14, (f - 1) / 15, 15, 1, 0.9);
        dust(g, c.ink, J.head[0] - 16, (f - 10) / 12, 12, -1, 0.85);
        dust(g, c.ink, Math.max(J.footB[0], J.footF[0]) + 10, (f - 10) / 12, 10, 1, 0.8);
        impactLines(g, c.ink, J.hip[0] - 4, 40, f / 8, 1);
        impactLines(g, c.ink, J.sh[0], 22, (f - 10) / 7, 0.7);
      },
    }, knockdownCloak, Infinity),
    floorBody({
      name: 'lie',
      label: 'Lying down',
      group: 'Hit and recovery',
      input: 'After a knockdown (attack, roll or jump to get up)',
      notes: 'Flat on his back, chest rising and falling, staff on the floor beside him while little feathers circle his head.',
      frames: 60,
      loop: true,
      pose: liePose,
      fx(g, f, c) {
        const J = c.J;
        dazed(g, c.ink, J.head[0] + 2, J.head[1] - 20, (f / 60) * TAU * 2, 0.95);
      },
    }, () => ({ w: 1, d: LIE_CLOAK }), Infinity),
    floorBody({
      name: 'getup',
      label: 'Get up',
      group: 'Hit and recovery',
      input: 'Jump or up while lying',
      notes: 'Sits up, plants the back foot and hand, and pushes through a crouch back to his stance.',
      frames: 30,
      intan: [[0, 22]],
      pose(f) {
        const p = getup(f);
        p.cloak += settle(f, 22, 0.15, 10, 6);
        return p;
      },
      fxBack(g, f, c) {
        dust(g, c.ink, c.J.footB[0] - 6, (f - 9) / 14, 11, -1, 0.7);
      },
    }, getupCloak, 12),
    floorBody({
      name: 'getup_attack',
      label: 'Rising Sweep',
      group: 'Hit and recovery',
      input: 'Attack while lying',
      notes: 'Springs to one knee sweeping the caduceus low in front, then whirls it overhead to sweep the tip low behind him.',
      frames: 34,
      intan: [[0, 13]],
      hit: [
        { f: [14, 16], at: 'tip', r: 13, dmg: 6, kb: 4, ang: 30 },
        { f: [14, 16], at: 'mid', r: 10, dmg: 6, kb: 4, ang: 30 },
        { f: [20, 22], at: 'tip', r: 13, dmg: 6, kb: 4, ang: 150 },
        { f: [20, 22], at: 'mid', r: 10, dmg: 6, kb: 4, ang: 150 },
      ],
      pose(f) {
        const p = getupAttack(f);
        p.ra1 = wrap(p.ra1);
        p.wpn = wrap(p.wpn);
        p.cloak += settle(f, 24, 0.2, 10, 6);
        return p;
      },
      fxBack(g, f, c) {
        dust(g, c.ink, c.J.footF[0] + 10, (f - 13) / 12, 10, 1, 0.75);
        dust(g, c.ink, c.J.footB[0] - 8, (f - 19) / 12, 10, -1, 0.75);
      },
      fx(g, f, c) {
        if (f >= 13 && f <= 17) fxCrescent(g, c.ink, trailOf(c, ['tip', 'handF'], 2, 0.5), f <= 16 ? 0.9 : 0.45);
        if (f >= 19 && f <= 23) fxCrescent(g, c.ink, trailOf(c, ['tip', 'handF'], 1.5, 0.25), f <= 22 ? 0.85 : 0.4);
      },
    }, getupAttackCloak, 11),
    floorBody({
      name: 'getup_roll',
      label: 'Getup roll',
      group: 'Hit and recovery',
      input: 'Left, right or shield while lying',
      notes: 'Tucks and rolls backward over his shoulder, coming up in a crouch facing the same way.',
      frames: 30,
      intan: [[0, 20]],
      motion: (f) => ({ vx: f < 18 ? -7 * Math.pow(1 - f / 18, 1.4) : 0 }),
      pose(f) {
        if (f <= 17) return rest(rollFit(f));
        const p = rollPlace(f);
        p.cloak += settle(f, 22, 0.15, 10, 6);
        return p;
      },
      fxBack(g, f, c) {
        dust(g, c.ink, c.J.hip[0] + 8, (f - 1) / 14, 12, 1, 0.7);
        dust(g, c.ink, c.J.footF[0] + 6, (f - 16) / 12, 10, 1, 0.6);
      },
      fx(g, f, c) {
        if (f < 3 || f > 16) return;
        const t = (f - 3) / 13;
        fxSpeedLines(g, c.ink, [c.J.pivot[0] + 26, c.J.pivot[1]], [-1, 0], 30, 40, 4, 0.6 * (1 - t), c.rnd);
      },
    }, rollCloak, 17),
    {
      name: 'tech',
      label: 'Tech',
      group: 'Hit and recovery',
      input: 'Shield just before hitting the floor',
      notes: 'Catches the impact in a deep crouch, heel wings flaring in a burst of wind and feathers, and springs upright.',
      frames: 20,
      intan: [[0, 18]],
      pose(f) {
        const p = tech(f);
        p.wing += settle(f, 9, 0.25, 6, 4);
        return p;
      },
      fxBack(g, f, c) {
        const J = c.J;
        // a paper-white flash pressed flat on the floor
        if (f < 6) {
          const t = f / 6;
          g.save();
          g.globalAlpha *= 1 - t;
          g.beginPath();
          g.ellipse(J.hip[0], -4, 44 + 40 * t, 10 + 6 * t, 0, 0, TAU);
          g.fillStyle = PAPER_LIGHT;
          g.fill();
          g.strokeStyle = c.ink;
          g.lineWidth = 1.6;
          g.stroke();
          g.restore();
        }
        windRing(g, c.ink, J.hip[0], -2, 84, f / 12, 1);
      },
      fx(g, f, c) {
        const J = c.J;
        // twin gusts curling off the heel wings
        const t = f / 13;
        if (t <= 1) {
          fxGust(g, c.ink, J.footB[0] - 16 - 18 * t, -12 - 8 * t, 13 + 13 * t, -t * 3, 0.9 * (1 - t));
          fxGust(g, c.ink, J.footF[0] + 16 + 18 * t, -12 - 8 * t, 13 + 13 * t, Math.PI + t * 3, 0.9 * (1 - t));
        }
        featherBurst(g, c.ink, J.footB[0] - 4, J.footB[1] - 6, f / 18, 4, 19, 31, 1);
        featherBurst(g, c.ink, J.footF[0] + 4, J.footF[1] - 6, f / 18, 3, 18, 57, 1);
        flash(g, c.ink, J.hip[0], -4, 62, f / 7);
      },
    },
    {
      name: 'ko',
      label: 'Blast KO',
      group: 'Hit and recovery',
      input: 'Knocked past the blast zone',
      notes: 'A burst of radiating ink rays and wind as he is flung spinning up and away, shrinking into the distance.',
      frames: 60,
      air: true,
      pose(f) {
        // main figure is hidden: the shrinking body is drawn in fx
        const p = koBody(f);
        const [x, y] = koPath(f);
        p.ox = x / K;
        p.oy = y / K + 44;
        p.fade = 1;
        return p;
      },
      fxBack(g, f, c) {
        const cx = 0;
        const cy = -70;
        if (f < 5) {
          g.save();
          g.globalAlpha *= 1 - f / 5;
          g.beginPath();
          g.arc(cx, cy, 70 + f * 14, 0, TAU);
          g.fillStyle = PAPER_LIGHT;
          g.fill();
          g.restore();
        }
        rays(g, c.ink, cx, cy, 22, 170, f / 22, 18, 7, 1);
        rays(g, c.ink, cx, cy, 14, 100, (f - 3) / 16, 12, 19, 0.8);
        for (let i = 0; i < 2; i++) {
          const tt = (f - 2 - i * 5) / 24;
          if (tt < 0 || tt > 1) continue;
          fxGust(g, c.ink, cx - 30 * tt, cy - 6 * i, 20 + 40 * tt, -tt * 4 + i * 2.5, 0.75 * (1 - tt));
        }
      },
      fx(g, f, c) {
        const s = koScale(f) * c.k;
        const [x, y] = koPath(f);
        const alpha = 1 - smoothstep(44, 58, f);
        if (alpha <= 0.01) return;
        // spiral wake behind the flying body
        const e0 = koE(Math.max(0, f - 6));
        const p0 = koPath(Math.max(0, f - 6));
        if (f > 2) {
          g.save();
          g.globalAlpha *= 0.6 * alpha;
          g.strokeStyle = c.ink;
          g.lineCap = 'round';
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(p0[0], p0[1]);
          g.lineTo(x, y);
          g.stroke();
          g.restore();
          void e0;
        }
        const body = koBody(f);
        c.drawFigure(g, body, x, y + 44 * s, { face: 1, ink: c.ink, scale: s, time: c.time, alpha });
        featherBurst(g, c.ink, 0, -70, f / 40, 5, 14, 91, 0.9);
      },
    },
    {
      name: 'respawn',
      label: 'Respawn descent',
      group: 'Hit and recovery',
      input: 'After a KO',
      notes: 'Fades in high above the stage and glides down on beating heel wings, settling into a light hover.',
      frames: 90,
      air: true,
      pose(f) {
        const p = finSa(respawnBody(f));
        p.oy = respawnY(f);
        p.fade = 1 - smoothstep(0, 26, f);
        // slow strong beats while gliding, quick light ones in the hover
        const glide = 1 - smoothstep(56, 80, f);
        p.wing = lerp(0.7 + 0.35 * Math.sin((f / 30) * TAU * 3), 0.95 + 0.55 * Math.sin(f * 0.42), glide);
        p.cloak += 0.1 * Math.sin(f * 0.3) * glide;
        return p;
      },
      fxBack(g, f, c) {
        // descending engraved light shaft
        const a = (1 - smoothstep(20, 60, f)) * smoothstep(0, 6, f);
        if (a > 0.01) {
          g.save();
          g.globalAlpha *= 0.5 * a;
          g.strokeStyle = c.ink;
          g.lineCap = 'round';
          const x0 = c.J.hip[0];
          for (let i = -4; i <= 4; i++) {
            g.lineWidth = i % 2 ? 0.6 : 1;
            const x = x0 + i * 9 * (1 - 0.1 * Math.abs(i));
            line(g, x, c.J.top[1] - 120 + Math.abs(i) * 8, x, c.J.footF[1] - 10 - Math.abs(i) * 6);
          }
          g.restore();
        }
      },
      fx(g, f, c) {
        const J = c.J;
        const glide = 1 - smoothstep(56, 80, f);
        // down-draught gusts under the heel wings
        for (let i = 0; i < 2; i++) {
          const ph = (f / 20 + i * 0.5) % 1;
          fxGust(g, c.ink, J.footB[0] + 8, J.footB[1] + 6 + ph * 14, 12 + ph * 12, ph * 4 + i, 0.55 * (1 - ph) * (0.3 + 0.7 * glide) * smoothstep(8, 24, f));
        }
        featherBurst(g, c.ink, J.hip[0], J.hip[1] - 10, (f - 10) / 60, 3, 11, 13, 0.8);
      },
    },
  ]);
})();
