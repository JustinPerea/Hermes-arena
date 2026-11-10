// Hermes — grab, hold, pummel and the four throws.
//
// He grabs with his free BACK (far) hand; the caduceus never leaves the front
// hand. Poses are keyed like the grounded sets: a hip position (hx forward, hh
// height) and two planted feet (bx/bh back, fx/fh front; figure units, feet
// space) are solved with a two-bone IK so planted feet never slide. Extra key
// channels resolved by fin():
//   sa        absolute caduceus angle (dirv degrees) instead of wpn
//   gw        weight of the back hand gripping the opponent's collar; the
//             collar point (gx, gy) is filled in from the victim track
// Every held/throw animation also has a victim track vic(f) (figure units,
// local feet space) that drives victim() for the game and the sanguine
// training dummy drawn on the sheets (only when c.dummy !== false).
//
// victim().rot is the opponent's own pose rotation (positive = the opponent
// pitches toward the way it faces, i.e. toward Hermes while face is -1).
(() => {
  const SH = HERMES_SHAPE;
  const S1 = Object.assign({}, SH, { scale: 1 });

  // ---- planted stance toolkit ---------------------------------------------------
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

  function legIK(dx, dy) {
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
  // two-bone arm IK from shoulder s to target t (hip space): absolute upper-arm
  // angle and a positive elbow bend
  function armIK(s, t) {
    const U = SH.upper;
    const F = SH.fore;
    const vx = t[0] - s[0];
    const vy = t[1] - s[1];
    const L = clamp(Math.hypot(vx, vy), Math.abs(U - F) + 1, U + F - 0.05);
    const a = Math.atan2(vx, vy) / D2R;
    const al = Math.acos(clamp((U * U + L * L - F * F) / (2 * U * L), -1, 1)) / D2R;
    const b = Math.acos(clamp((U * U + F * F - L * L) / (2 * U * F), -1, 1)) / D2R;
    return [a - al, 180 - b];
  }

  const EXTRA = ['hx', 'hh', 'bx', 'bh', 'fx', 'fh', 'sa', 'gw', 'gx', 'gy', 'pw', 'px', 'py'];
  function fin(q) {
    const p = Object.assign({}, q);
    const [ll1, ll2] = legIK(p.bx - p.hx + 4, p.hh - p.bh);
    const [rl1, rl2] = legIK(p.fx - p.hx - 4, p.hh - p.fh);
    p.ll1 = ll1;
    p.ll2 = ll2;
    p.rl1 = rl1;
    p.rl2 = rl2;
    p.ox = (p.ox || 0) + p.hx;
    p.lift = (p.lift || 0) + Math.min(p.bh, p.fh);
    const sa = p.sa;
    const gw = p.gw || 0;
    const gx = p.gx;
    const gy = p.gy;
    const pw = p.pw || 0;
    const px = p.px;
    const py = p.py;
    for (const k of EXTRA) delete p[k];
    if ((gw > 0 && gx != null) || (pw > 0 && px != null)) {
      const FR = hermesFrame(Object.assign({}, BASE_POSE, p), S1);
      const hip = FR.J.hip;
      // back hand on the opponent's collar
      if (gw > 0 && gx != null) {
        const s = FR.sk.armB.s;
        let t = [gx - hip[0], gy - hip[1]];
        // the fist closes around the collar: the wrist sits a little short of it
        const d = Math.hypot(t[0] - s[0], t[1] - s[1]) || 1;
        t = [t[0] - ((t[0] - s[0]) / d) * 3.5, t[1] - ((t[1] - s[1]) / d) * 3.5];
        const [A1, bend] = armIK(s, t);
        p.la1 = lerp(p.la1, A1 - p.lean, gw);
        p.la2 = lerp(p.la2, bend, gw);
      }
      // front (staff) hand placed at (px, py), feet space
      if (pw > 0 && px != null) {
        const [A1, bend] = armIK(FR.sk.armF.s, [px - hip[0], py - hip[1]]);
        p.ra1 = lerp(p.ra1, A1 - p.lean, pw);
        p.ra2 = lerp(p.ra2, bend, pw);
      }
    }
    // caduceus at an absolute angle, after the arm is final
    if (sa != null) p.wpn = sa - (p.lean + p.ra1 + p.ra2);
    p.wpn = BASE_POSE.wpn + wrap(p.wpn - BASE_POSE.wpn);
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
  const GROUND = Object.assign({}, BASE_POSE, NEUT, { sa: IDLE_SA, gw: 0, gx: 0, gy: 0, pw: 0, px: 0, py: 0 });
  delete GROUND.ll1;
  delete GROUND.ll2;
  delete GROUND.rl1;
  delete GROUND.rl2;
  // frame 0 of the idle loop (hermes-stand.js), so every move lands exactly on it
  const IDLE0 = { hx: 0.27, hh: H0 - 0.7, lean: 4, head: 0.86, la1: -15.2, la2: 22.4, ra1: 26, ra2: 56, sa: IDLE_SA - 1.48, wing: 0.36, cloak: 0.185 };
  const settle = (f, f0, amp, period, decay) => (f < f0 ? 0 : amp * Math.exp(-(f - f0) / decay) * Math.sin(((f - f0) / period) * Math.PI * 2));
  const win = (f, a, b, c, d) => smoothstep(a, b, f) * (1 - smoothstep(c, d, f));
  // one scalar channel keyed on its own: [[t, value, ease?], ...]
  const track = (keys) => (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, v0] = keys[i - 1];
        const [t1, v1, e] = keys[i];
        return lerp(v0, v1, EASE[e || 'inOut']((t - t0) / (t1 - t0 || 1)));
      }
    }
    return keys[keys.length - 1][1];
  };

  // ---- the held opponent (training dummy) -------------------------------------
  // victim channels: x, y (feet point, figure units, y down), rot, plus dummy
  // pose channels. face is resolved separately.
  const DUMMY = {
    lean: -8, head: 12, la1: 142, la2: 34, ra1: 118, ra2: 44,
    ll1: -8, ll2: -26, rl1: 26, rl2: -46, handB: 1, handF: 1, wpnShow: 0, wing: 0.55, cloak: 0.55, air: 0,
  };
  const VBASE = Object.assign({ x: 38, y: 0, rot: 0, cvx: 0, cvy: 0 }, DUMMY);
  function dummyPose(v) {
    const p = Object.assign({}, BASE_POSE);
    for (const k in v) if (k in BASE_POSE) p[k] = v[k];
    p.rot = v.rot || 0;
    p.ox = 0;
    p.oy = 0;
    return p;
  }
  // local (Hermes feet space, figure units) position of a dummy joint
  function dummyJ(v) {
    const J = hermesFrame(dummyPose(v), S1).J;
    const L = (p) => [v.x + v.face * p[0], v.y + p[1]];
    return { J, L };
  }
  // collar: base of the neck, a little toward the dummy's chest
  function collarOf(v) {
    const { J, L } = dummyJ(v);
    const ux = J.head[0] - J.sh[0];
    const uy = J.head[1] - J.sh[1];
    const ul = Math.hypot(ux, uy) || 1;
    const fx = -uy / ul;
    const fy = ux / ul;
    return L([J.sh[0] + ux * 0.18 + fx * 4.5, J.sh[1] + uy * 0.18 + fy * 4.5]);
  }
  function drawDummy(g, c, v) {
    if (c.dummy === false || !v || v.alpha <= 0.01) return;
    g.save();
    g.globalAlpha *= v.alpha == null ? 1 : v.alpha;
    // cvx/cvy: velocity hint (world px/frame) so the cloak streams the right way
    c.drawFigure(g, dummyPose(v), v.x * c.k, v.y * c.k, { face: v.face, ink: INK.sanguine, scale: c.k, time: c.time, vx: v.cvx, vy: v.cvy });
    g.restore();
  }

  // A held move: Hermes keys + victim keys, a release frame and a launch.
  //   o.hk      Hermes keys (merged onto o.hbase or GROUND)
  //   o.vk      victim keys (merged onto VBASE)
  //   o.face(f) victim facing (default -1)
  //   o.rel     release frame (victim flies ballistically after it)
  //   o.launch  { vx, vy, grav, spin, fade:[a, b] } in figure units / frame
  //   o.hfx(p, f) final tweak of Hermes' keyed channels (loops, flutter)
  //   o.vfx(v, f) final tweak of the victim
  function holdMove(o) {
    const H = seq(o.hbase || GROUND, o.hk);
    const V = seq(VBASE, o.vk);
    const faceAt = o.face || (() => -1);
    const vic = (f) => {
      const L = o.launch;
      if (o.rel == null || f <= o.rel || !L) {
        const v = V(f);
        if (o.vfx) o.vfx(v, f);
        v.face = faceAt(f);
        v.alpha = 1;
        return v;
      }
      const v = V(o.rel);
      if (o.vfx) o.vfx(v, o.rel);
      v.face = faceAt(o.rel);
      const t = f - o.rel;
      // carry the release velocity of the keyed track into a clean ballistic arc
      v.x += L.vx * t;
      v.y += L.vy * t + 0.5 * (L.grav || 0) * t * t;
      v.rot += (L.spin || 0) * t;
      v.cvx = L.vx * 1.4;
      v.cvy = (L.vy + (L.grav || 0) * t) * 1.4;
      if (L.pose) Object.assign(v, mixPose(v, Object.assign({}, v, L.pose), smoothstep(0, 4, t)));
      v.alpha = 1 - smoothstep(L.fade[0], L.fade[1], t);
      return v;
    };
    const keyed = (f) => {
      const q = H(f);
      if (o.hfx) o.hfx(q, f);
      if (q.gw > 0) {
        const col = collarOf(vic(f));
        q.gx = col[0];
        q.gy = col[1];
      }
      return q;
    };
    return { vic, pose: (f) => fin(keyed(f)), keyed };
  }
  const victimOut = (vic) => (f, c) => {
    const v = vic(f);
    return { x: v.x * c.k, y: v.y * c.k, rot: v.rot, face: v.face, pose: dummyPose(v) };
  };
  // victim's mass centre in figure units (for hitboxes and sparks)
  const vicCentre = (v) => {
    const { J, L } = dummyJ(v);
    return L(J.center);
  };

  // ---- effects --------------------------------------------------------------------
  function smear(g, c, f, a, b, span, keys, alpha) {
    if (f < a || f > b + 2) return;
    const fade = f <= b ? 1 : 1 - (f - b) / 2;
    fxCrescent(g, c.ink, trailOf(c, keys || ['tip', 'handF'], span, 0.25), (alpha == null ? 0.95 : alpha) * fade);
  }
  // engraved dust cloud: three billows that swell and thin out
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
    g.lineWidth = 1.4;
    g.stroke();
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    g.globalAlpha *= 0.8;
    g.fillStyle = inkPatterns(g, ink).hatch;
    g.fill();
    g.restore();
  }
  function scuff(g, ink, x, w, n, alpha) {
    if (alpha <= 0) return;
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
  // short engraved strokes radiating from a point (grab snap, impact ticks)
  function ticks(g, ink, x, y, r0, r1, a0, a1, n, alpha) {
    if (alpha <= 0) return;
    g.save();
    g.globalAlpha *= alpha;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = (lerp(a0, a1, n === 1 ? 0.5 : i / (n - 1)) * Math.PI) / 180;
      g.lineWidth = i % 2 ? 0.9 : 1.5;
      line(g, x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    }
    g.restore();
  }
  // a flattened whirl of wind around a point (spin throw)
  function whirl(g, ink, cx, cy, rx, ry, a0, a1, alpha, lw) {
    if (alpha <= 0) return;
    g.save();
    g.globalAlpha *= alpha;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    for (let j = 0; j < 3; j++) {
      g.lineWidth = (lw || 1.6) - j * 0.45;
      g.beginPath();
      const N = 24;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const a = lerp(a0, a1, t) - j * 0.35;
        const px = cx + Math.cos(a) * rx * (1 - j * 0.1);
        const py = cy + Math.sin(a) * ry * (1 - j * 0.1) + j * 4;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    }
    g.restore();
  }

  // ---- Hermes keys shared by the hold set -------------------------------------------
  // braced stance, back hand on the collar at arm's length, caduceus couched
  // at the hip like a short spear, knob levelled at the opponent's belly
  const HOLD = {
    hx: 2, hh: 45, bx: -22, bh: 0, fx: 18, fh: 0,
    lean: 13, head: -6, ra1: -80, ra2: 90, pw: 1, px: -4, py: -56, sa: 99, handF: 0, handB: 0, gw: 1, wing: 0.45, cloak: 0.45,
  };
  // yanked forward by the collar, clawing at Hermes' wrist, knees buckling
  const HOLD_V = {
    x: 53, y: 0, rot: 0, lean: 16, head: 8, la1: 74, la2: 44, ra1: 56, ra2: 62,
    ll1: -22, ll2: -18, rl1: 18, rl2: -52,
  };

  // ---- grab (whiff) -------------------------------------------------------------------
  const grabK = seq(GROUND, [
    [0, {}],
    [4, { hx: -2.5, hh: 44.2, fh: 1.5, lean: -2, head: 2, la1: -46, la2: 50, handB: 1, ra1: 34, ra2: 52, sa: 186, wing: 0.45, cloak: 0.35 }],
    [5.5, { hx: 3, hh: 42, fx: 22, fh: 6, lean: 14, head: -6, la1: 10, la2: 50, handB: 1, ra1: -10, ra2: 40, sa: 200, wing: 0.9, cloak: 0.7 }, 'in'],
    [7, { hx: 10, hh: 38.5, bx: NEUT.bx, fx: 32, fh: 0, lean: 30, head: -16, la1: 56, la2: 4, handB: 1, ra1: -62, ra2: 18, sa: 228, wing: 1.3, cloak: 1.15 }, 'out'],
    [9, { hx: 11, hh: 38, bx: NEUT.bx, fx: 32, lean: 31, head: -17, la1: 57, la2: 2, handB: 1, ra1: -66, ra2: 16, sa: 232, wing: 1.0, cloak: 1.25 }],
    [12, { hx: 10, hh: 38.6, bx: NEUT.bx, fx: 32, lean: 28, head: -13, la1: 50, la2: 34, handB: 0, ra1: -58, ra2: 22, sa: 226, wing: 0.7, cloak: 1.05 }, 'out'],
    [17, { hx: 5, hh: 42.5, bx: NEUT.bx, fx: 26, fh: 5, lean: 14, head: -5, la1: 16, la2: 44, handB: 0, ra1: -8, ra2: 46, sa: 166, wing: 0.55, cloak: 0.7 }],
    [21, { hx: 1, hh: 46.4, bx: NEUT.bx, fx: NEUT.fx, fh: 0, lean: 4, head: 1, la1: -18, la2: 30, ra1: 24, ra2: 56, sa: 184, wing: 0.42, cloak: 0.4 }],
    [30, IDLE0],
  ]);
  // recovery: the staff stays tipped back until the hand has come forward past
  // the face, then flips upright in front of him (never across the face)
  const grabSa = track([[12, 226], [15.5, 223], [17.5, 168, 'inOut'], [21, 184]]);
  const grabPose = (f) => {
    const q = grabK(f);
    if (f > 12 && f < 21) q.sa = grabSa(f);
    return fin(q);
  };

  // ---- dash grab ------------------------------------------------------------------------
  const dashK = seq(GROUND, [
    [0, { hx: 0, hh: 41.5, bx: -30, bh: 9, fx: 16, fh: 0, lean: 22, head: -11, la1: -40, la2: 70, ra1: 52, ra2: 52, sa: 158, wing: 1.0, cloak: 1.05 }],
    [4, { hx: 2, hh: 37, bx: -23, bh: 4, fx: 30, fh: 0, lean: 16, head: -6, la1: -66, la2: 52, handB: 1, ra1: 4, ra2: 40, sa: 182, wing: 0.8, cloak: 1.15 }],
    [9, { hx: 7, hh: 30, bx: -30, bh: 2.5, fx: 43, fh: 0, lean: 38, head: -24, la1: 50, la2: 4, handB: 1, ra1: -70, ra2: 14, sa: 246, wing: 1.35, cloak: 1.35 }, 'out'],
    [11, { hx: 7.5, hh: 29.5, bx: -30, bh: 2.5, fx: 43, fh: 0, lean: 39, head: -24, la1: 51, la2: 3, handB: 1, ra1: -72, ra2: 14, sa: 248, wing: 1.1, cloak: 1.4 }],
    [15, { hx: 7, hh: 30.5, bx: -30, bh: 2.5, fx: 43, fh: 0, lean: 35, head: -19, la1: 44, la2: 38, handB: 0, ra1: -64, ra2: 20, sa: 238, wing: 0.8, cloak: 1.2 }, 'out'],
    [19, { hx: 2, hh: 34, bx: -30, bh: 2.5, fx: 43, fh: 0, lean: 24, head: -12, la1: 20, la2: 44, handB: 0, ra1: -40, ra2: 34, sa: 206, wing: 0.6, cloak: 0.95 }],
    [24, { hx: 0, hh: 41, bx: -30, bh: 1.5, fx: 29, fh: 8, lean: 11, head: -5, la1: -2, la2: 40, handB: 0, ra1: -6, ra2: 48, sa: 168, wing: 0.55, cloak: 0.7 }],
    [28, { hx: -1, hh: 43.5, bx: -30, bh: 0, fx: 14, fh: 0, lean: 6, head: -1, la1: -12, la2: 32, ra1: 16, ra2: 54, sa: 182, wing: 0.45, cloak: 0.5 }, 'out'],
    [31, { hx: -0.5, hh: 45.5, bx: -26, bh: 5, fx: 13.6, fh: 0, lean: 5, head: 0, la1: -15, la2: 26, ra1: 24, ra2: 56, sa: 191, wing: 0.4, cloak: 0.35 }],
    [36, IDLE0],
  ]);
  const dashSa = track([[15, 238], [19, 234], [22.5, 226], [24.5, 170, 'inOut'], [28, 182]]);
  const dashPose = (f) => {
    const q = dashK(f);
    if (f > 15 && f < 28) q.sa = dashSa(f);
    return fin(q);
  };
  const dashVx = (f) => 6 * Math.exp(-f / 7.5) * (1 - smoothstep(18, 24, f));

  // ---- hold loop ------------------------------------------------------------------------
  const P = 60;
  const holdHfx = (q, f) => {
    const ph = (f / P) * Math.PI * 2;
    q.hh += -0.35 * Math.cos(2 * ph);
    q.hx += 0.5 * Math.sin(ph);
    q.lean += 1.2 * Math.sin(ph + 0.6);
    q.head += 1.5 * Math.sin(ph - 0.4);
    q.sa += 2.5 * Math.sin(ph - 0.9);
    q.px += 0.9 * Math.sin(ph - 0.5);
    q.py += 0.5 * Math.cos(ph - 0.5);
    // heel and hat wings: sharp little flicks, three per cycle
    const fl = Math.pow(Math.max(0, Math.sin(3 * ph)), 8);
    q.wing = 0.42 + 0.55 * fl + 0.05 * Math.sin(6 * ph);
    q.cloak = 0.45 + 0.07 * Math.sin(ph - 1.2) + 0.03 * Math.sin(3 * ph + 0.3);
  };
  const holdVfx = (v, f) => {
    const ph = (f / P) * Math.PI * 2;
    v.rot += 2.5 * Math.sin(ph) + 1.2 * Math.sin(3 * ph + 0.4);
    v.x += 0.6 * Math.sin(2 * ph + 0.3);
    v.la1 += 14 * Math.sin(2 * ph);
    v.la2 += 12 * Math.sin(2 * ph + 1);
    v.ra1 += 14 * Math.sin(2 * ph + 1.9);
    v.ra2 += 12 * Math.sin(2 * ph + 2.6);
    v.head += 3 * Math.sin(ph + 0.4);
    v.rl1 += 6 * Math.sin(ph + 1);
    v.rl2 += 6 * Math.sin(ph + 1.6);
  };
  const HOLDM = holdMove({ hk: [[0, HOLD]], vk: [[0, HOLD_V]], hfx: holdHfx, vfx: holdVfx });
  // the hold loop's first frame, so pummel and throws start and end exactly on it
  const HOLD0 = Object.assign({}, GROUND, HOLD);
  holdHfx(HOLD0, 0);
  const HOLD_V0 = Object.assign({}, VBASE, HOLD_V);
  holdVfx(HOLD_V0, 0);

  // ---- pummel ------------------------------------------------------------------------
  const PUM = holdMove({
    hk: [
      [0, HOLD0],
      // draw the staff back along the forearm
      [2.5, Object.assign({}, HOLD0, { hx: 0.5, lean: 9, head: -4, px: -13, py: -57, sa: 104, wing: 0.55, cloak: 0.5 }), 'in'],
      // drive the knob into the gut
      [4, Object.assign({}, HOLD0, { hx: 3.5, hh: 44.4, lean: 18, head: -9, px: 4.5, py: -58.5, sa: 96, wing: 0.95, cloak: 0.6 }), 'out'],
      [7, Object.assign({}, HOLD0, { hx: 3.2, hh: 44.5, lean: 17, head: -8, px: 3.5, py: -58.5, sa: 97, wing: 0.7, cloak: 0.6 })],
      [16, HOLD0],
    ],
    vk: [
      [0, HOLD_V0],
      [4, HOLD_V0],
      // doubles over the blow, arms flung up
      [6, Object.assign({}, HOLD_V0, { x: 55, rot: 7, head: 14, lean: 28, la1: 140, ra1: 120 }), 'out'],
      [10, Object.assign({}, HOLD_V0, { x: 54, rot: 3, head: 10 })],
      [16, HOLD_V0],
    ],
    hfx: (q, f) => {
      q.wing += settle(f, 4, 0.2, 5, 4);
    },
  });

  // ---- forward throw: gust shove ----------------------------------------------------
  const TF = holdMove({
    rel: 12,
    hk: [
      [0, HOLD0],
      [8, Object.assign({}, HOLD0, { pw: 0, hx: -3.5, hh: 44.2, lean: -9, head: 2, ra1: -71, ra2: 83, sa: 86, gw: 1, wing: 0.55, cloak: 0.6 })],
      [10, Object.assign({}, HOLD0, { pw: 0, hx: -2, hh: 44, lean: -5, head: 0, la1: 24, la2: 110, handB: 1, ra1: -76, ra2: 84, sa: 88, gw: 0.15, wing: 0.7, cloak: 0.7 }), 'in'],
      [12, Object.assign({}, HOLD0, { pw: 0, hx: 9, hh: 42.2, lean: 20, head: -12, la1: 70, la2: 2, handB: 1, ra1: -116, ra2: 92, sa: 84, gw: 0, wing: 1.4, cloak: 1.35 }), 'out'],
      [17, Object.assign({}, HOLD0, { pw: 0, hx: 9.5, hh: 42, lean: 21, head: -12, la1: 72, la2: 4, handB: 1, ra1: -114, ra2: 90, sa: 86, gw: 0, wing: 1.0, cloak: 1.3 })],
      [25, Object.assign({}, HOLD0, { pw: 0, hx: 3, hh: 45.4, bx: -22, fx: 16, fh: 2.5, lean: 8, head: -3, la1: 10, la2: 40, handB: 0.6, ra1: -10, ra2: 74, sa: 150, gw: 0, wing: 0.55, cloak: 0.7 })],
      [34, Object.assign({}, IDLE0, { gw: 0, pw: 0 })],
    ],
    vk: [
      [0, HOLD_V0],
      [8, Object.assign({}, HOLD_V0, { x: 45, rot: 8, lean: 22, head: 14, la1: 96, ra1: 80 })],
      [10, Object.assign({}, HOLD_V0, { x: 46, rot: 5, lean: 18, head: 12, la1: 90, ra1: 76 })],
      [12, Object.assign({}, HOLD_V0, { x: 50, y: -3, rot: -10, lean: -26, head: -12, la1: 40, la2: 30, ra1: 55, ra2: 30, ll1: 0, ll2: -24, rl1: 20, rl2: -30, air: 0.4 }), 'out'],
    ],
    launch: { vx: 5.6, vy: -3.9, grav: 0.3, spin: -11, fade: [7, 12], pose: { lean: -24, la1: 40, ra1: 40, air: 1, ll1: 30, rl1: 50 } },
  });

  // ---- back throw: spin and swing ------------------------------------------------------
  // the opponent orbits Hermes: in front at theta 0, behind his back at 90,
  // on his back side at 180, where it is let go
  const TB_TH = seq({ th: 0, R: HOLD_V0.x, up: 0, rot: HOLD_V0.rot }, [
    [0, { th: 0, R: HOLD_V0.x, up: 0, rot: HOLD_V0.rot }],
    [6, { th: -8, R: 44, up: 0, rot: -6 }],
    [12, { th: 85, R: 34, up: 18, rot: 34 }, 'in'],
    [18, { th: 172, R: 52, up: 26, rot: 60 }, 'lin'],
    [20, { th: 188, R: 68, up: 34, rot: 80 }, 'out'],
  ]);
  const TB = holdMove({
    rel: 20,
    face: (f) => (Math.cos((TB_TH(Math.min(f, 20)).th * Math.PI) / 180) >= 0 ? -1 : 1),
    hk: [
      [0, HOLD0],
      [6, Object.assign({}, HOLD0, { pw: 0, hx: 3, hh: 42.5, bh: 0, lean: 16, head: -4, ra1: -100, ra2: 70, sa: 86, wing: 0.6, cloak: 0.7 })],
      [12, Object.assign({}, HOLD0, { pw: 0, hx: -1, hh: 44, bx: -21, bh: 4, lean: 0, head: 4, ra1: 10, ra2: 40, sa: 92, wing: 1.1, cloak: 1.3 }), 'in'],
      [18, Object.assign({}, HOLD0, { pw: 0, hx: -6, hh: 43, bx: -24, bh: 0, fx: 19, lean: -15, head: 8, ra1: 96, ra2: 10, sa: 96, wing: 1.4, cloak: 1.5 }), 'lin'],
      [20, Object.assign({}, HOLD0, { pw: 0, hx: -7, hh: 42.5, bx: -24, bh: 0, fx: 19, lean: -19, head: 10, la1: -128, la2: 8, handB: 1, ra1: 100, ra2: 8, sa: 92, gw: 0, wing: 1.5, cloak: 1.5 }), 'out'],
      [25, Object.assign({}, HOLD0, { pw: 0, hx: -6.5, hh: 43, bx: -24, bh: 0, fx: 19, lean: -16, head: 8, la1: -116, la2: 16, handB: 1, ra1: 92, ra2: 14, sa: 98, gw: 0, wing: 1.0, cloak: 1.3 })],
      [32, Object.assign({}, HOLD0, { pw: 0, hx: -1.5, hh: 46, bx: -24, bh: 1, fx: 16, fh: 2.5, lean: 0, head: 2, la1: -40, la2: 30, handB: 0.5, ra1: 40, ra2: 50, sa: 172, gw: 0, wing: 0.5, cloak: 0.6 })],
      [40, Object.assign({}, IDLE0, { gw: 0, pw: 0 })],
    ],
    vk: [
      [0, HOLD_V0],
      [6, Object.assign({}, HOLD_V0, { lean: 4, head: 16 })],
      [12, Object.assign({}, HOLD_V0, { lean: -6, head: 8, air: 1, ll1: -30, ll2: -20, rl1: -10, rl2: -30, la1: 160, ra1: 150 }), 'in'],
      [20, Object.assign({}, HOLD_V0, { lean: -4, head: 6, air: 1, ll1: -50, ll2: -10, rl1: -36, rl2: -20, la1: 170, ra1: 165 })],
    ],
    vfx: (v, f) => {
      const o = TB_TH(Math.min(f, 20));
      const a = (o.th * Math.PI) / 180;
      v.x = o.R * Math.cos(a);
      v.y = -o.up;
      v.rot = o.rot;
    },
    launch: { vx: -5.8, vy: -3.6, grav: 0.3, spin: 10, fade: [7, 12] },
  });

  // ---- up throw: toss and staff strike ---------------------------------------------------
  const TU = holdMove({
    rel: 16,
    hk: [
      [0, HOLD0],
      [5, Object.assign({}, HOLD0, { pw: 0, hx: 1, hh: 38.5, bh: 2, lean: 15, head: 0, ra1: -100, ra2: 70, sa: 72, wing: 0.4, cloak: 0.4 })],
      [10, Object.assign({}, HOLD0, { pw: 0, hx: 0, hh: 48.4, bh: 3, fh: 1, lean: -8, head: -22, ra1: -40, ra2: 40, sa: 52, wing: 1.0, cloak: 1.0 }), 'out'],
      [12, Object.assign({}, HOLD0, { pw: 0, hx: 0, hh: 48.2, bh: 2, fh: 0.5, lean: -4, head: -24, la1: 160, la2: 10, handB: 1, ra1: 20, ra2: 8, sa: 58, gw: 0, wing: 0.9, cloak: 1.0 }), 'out'],
      [16, Object.assign({}, HOLD0, { pw: 0, hx: 0.5, hh: 49, bh: 3.5, fh: 1, lean: -5, head: -26, la1: -40, la2: 40, handB: 1, ra1: 170, ra2: 3, sa: 181, gw: 0, wing: 1.5, cloak: 1.3 }), 'out'],
      [21, Object.assign({}, HOLD0, { pw: 0, hx: 0.5, hh: 48.6, bh: 3, fh: 0.5, lean: -4, head: -24, la1: -36, la2: 42, handB: 1, ra1: 168, ra2: 4, sa: 182, gw: 0, wing: 1.0, cloak: 1.15 })],
      [30, Object.assign({}, HOLD0, { pw: 0, hx: 0, hh: 45, bh: 0, fh: 0, bx: -22, fx: 16, fh: 2.5, lean: 6, head: -2, la1: -16, la2: 30, handB: 0, ra1: 50, ra2: 60, sa: 196, gw: 0, wing: 0.5, cloak: 0.6 })],
      [40, Object.assign({}, IDLE0, { gw: 0, pw: 0 })],
    ],
    vk: [
      [0, HOLD_V0],
      [5, Object.assign({}, HOLD_V0, { x: 48, lean: 20, head: 20, ll1: 10, ll2: -70, rl1: 50, rl2: -100 })],
      [10, Object.assign({}, HOLD_V0, { x: 20, y: -40, rot: -18, lean: -10, head: -6, air: 1, ll1: 6, ll2: -30, rl1: 30, rl2: -60, la1: 170, ra1: 160 }), 'out'],
      [16, Object.assign({}, HOLD_V0, { x: 8, y: -92, rot: -78, lean: -14, head: -10, air: 1, ll1: 20, ll2: -50, rl1: 50, rl2: -70, la1: 175, ra1: 170 }), 'out'],
    ],
    launch: { vx: 0.3, vy: -7.5, grav: 0.2, spin: -9, fade: [5, 10] },
  });

  // ---- down throw: slam and talaria stomp ------------------------------------------------
  // feet-point height that rests a lying dummy's back on the floor
  function floorY(v) {
    const J = hermesFrame(dummyPose(Object.assign({}, v, { y: 0 })), S1).J;
    let m = J.head[1] + 8;
    for (const k of ['hip', 'sh', 'center', 'kneeF', 'kneeB', 'footF', 'footB']) m = Math.max(m, J[k][1] + 4.5);
    for (const k of ['handF', 'handB']) m = Math.max(m, J[k][1] + 2.5);
    return -m;
  }
  const LYING = { lean: 0, head: -10, la1: 178, la2: 6, ra1: 170, ra2: 10, ll1: -6, ll2: -14, rl1: 14, rl2: -30, air: 1, cloak: 0.5, cvy: 12.5 };
  const TD = holdMove({
    rel: 22,
    hk: [
      [0, HOLD0],
      [5, Object.assign({}, HOLD0, { pw: 0, hx: -1, hh: 47.5, bh: 1.5, lean: -6, head: -6, ra1: -71, ra2: 80, sa: 84, wing: 0.7, cloak: 0.6 })],
      [8, Object.assign({}, HOLD0, { pw: 0, hx: 3, hh: 43, lean: 18, head: -12, ra1: -95, ra2: 80, sa: 74, gw: 1, wing: 0.9, cloak: 0.9 }), 'in'],
      [11, Object.assign({}, HOLD0, { pw: 0, hx: 5, hh: 36, bh: 2.5, lean: 36, head: -18, la1: 40, la2: 6, handB: 1, ra1: -44, ra2: 50, sa: 64, gw: 1, wing: 1.2, cloak: 1.2 }), 'out'],
      [14, Object.assign({}, HOLD0, { pw: 0, hx: 3, hh: 46, lean: 4, head: -10, la1: -40, la2: 50, handB: 1, ra1: 36, ra2: 54, sa: 118, gw: 0, wing: 0.9, cloak: 0.9 })],
      [18, Object.assign({}, HOLD0, { pw: 0, hx: 4, hh: 50, bh: 3, fx: 27, fh: 30, lean: -6, head: -16, la1: -70, la2: 50, handB: 1, ra1: 80, ra2: 60, sa: 150, gw: 0, wing: 1.6, cloak: 1.1 }), 'out'],
      [20, Object.assign({}, HOLD0, { pw: 0, hx: 6, hh: 46, bh: 0, fx: 31, fh: 24, lean: 4, head: -18, la1: -50, la2: 50, handB: 1, ra1: 74, ra2: 58, sa: 140, gw: 0, wing: 1.2, cloak: 1.2 }), 'in'],
      [22, Object.assign({}, HOLD0, { pw: 0, hx: 9, hh: 41, bh: 0, fx: 33, fh: 11, lean: 17, head: -20, la1: -24, la2: 40, handB: 1, ra1: 56, ra2: 50, sa: 118, gw: 0, wing: 1.7, cloak: 1.3 }), 'out'],
      [26, Object.assign({}, HOLD0, { pw: 0, hx: 8.5, hh: 41.5, bh: 0, fx: 33, fh: 11, lean: 15, head: -18, la1: -26, la2: 40, handB: 1, ra1: 54, ra2: 50, sa: 122, gw: 0, wing: 1.0, cloak: 1.2 })],
      [31, Object.assign({}, HOLD0, { pw: 0, hx: 4, hh: 45, bh: 0, fx: 22, fh: 7, lean: 8, head: -6, la1: -20, la2: 34, handB: 0.5, ra1: 38, ra2: 58, sa: 168, gw: 0, wing: 0.6, cloak: 0.8 })],
      [34, Object.assign({}, HOLD0, { pw: 0, hx: 1, hh: 46.6, bx: NEUT.bx, fx: NEUT.fx + 1, fh: 0, lean: 4, head: 0, la1: -15, la2: 28, handB: 0, ra1: 28, ra2: 56, sa: 188, gw: 0, wing: 0.42, cloak: 0.45 })],
      [40, Object.assign({}, IDLE0, { gw: 0, pw: 0 })],
    ],
    vk: [
      [0, HOLD_V0],
      [5, Object.assign({}, HOLD_V0, { x: 50, y: -8, lean: 8, head: 16, air: 1, ll1: -4, ll2: -20, rl1: 10, rl2: -40 })],
      [8, Object.assign({}, HOLD_V0, { x: 52, y: -6, rot: 24, lean: 10, head: 10, air: 1, ll1: 10, ll2: -20, rl1: 30, rl2: -40 }), 'in'],
      [11, Object.assign({}, HOLD_V0, LYING, { x: 74, rot: 88 }), 'out'],
      [13, Object.assign({}, HOLD_V0, LYING, { x: 74, rot: 84, la1: 156, ra1: 150 }), 'out'],
      [15, Object.assign({}, HOLD_V0, LYING, { x: 74, rot: 88 }), 'in'],
      [21, Object.assign({}, HOLD_V0, LYING, { x: 74, rot: 89, la1: 182, ra1: 176 })],
      [22, Object.assign({}, HOLD_V0, LYING, { x: 74, rot: 90, head: -2, la1: 160, la2: 30, ra1: 150, ra2: 30, ll1: -16, rl1: 4 }), 'out'],
    ],
    vfx: (v, f) => {
      // settle the slammed body onto the floor, with one small bounce
      const w = smoothstep(9, 11, f);
      if (w > 0) v.y = lerp(v.y, floorY(v), w) - 5 * Math.max(0, Math.sin(((f - 11) / 4) * Math.PI)) * (f > 11 && f < 15 ? 1 : 0);
    },
    launch: { vx: 2.2, vy: -6.2, grav: 0.3, spin: 6, fade: [7, 12] },
  });

  const vc = (M, f) => {
    const p = vicCentre(M.vic(f));
    return [p[0], p[1]];
  };

  defineAnims('hermes', [
    {
      name: 'grab',
      label: 'Swift Snatch',
      group: 'Grab and throws',
      input: 'Grab (or Shield + Attack)',
      notes: 'A quick stepping lunge that snatches forward with the free hand while the caduceus swings back for balance.',
      frames: 30,
      pose: grabPose,
      hit: [{ f: [7, 9], at: 'handB', r: 10, grab: true }],
      fxBack(g, f, c) {
        // swept-air streaks behind the reaching hand
        if (f >= 5 && f <= 10) {
          const J = c.J;
          const a = win(f, 5, 6.5, 8.5, 10.5);
          fxSpeedLines(g, c.ink, [J.handB[0] - 8 * c.k, J.handB[1]], [1, 0], 34 * c.k, 14 * c.k, 4, 0.75 * a, c.rnd);
        }
      },
      fx(g, f, c) {
        const J = c.J;
        // the front foot lands the lunge
        if (f >= 7 && f < 16) scuff(g, c.ink, J.footF[0] + 4 * c.k, 9 * c.k, 2, 1 - (f - 7) / 9);
        // empty-handed snap when the grab whiffs
        if (f >= 10 && f <= 15) ticks(g, c.ink, J.handB[0] + 4 * c.k, J.handB[1], 6 * c.k, 11 * c.k, -40, 40, 3, 1 - (f - 10) / 5);
      },
    },
    {
      name: 'dash_grab',
      label: 'Running Snatch',
      group: 'Grab and throws',
      input: 'Grab while running',
      notes: 'Drops out of the run into a low skidding lunge, reaching far ahead with the free hand before pushing back up.',
      frames: 36,
      pose: dashPose,
      hit: [{ f: [9, 11], at: 'handB', r: 10, grab: true }],
      motion: (f) => ({ vx: dashVx(f) }),
      fxBack(g, f, c) {
        if (f <= 12) {
          const J = c.J;
          const a = 1 - smoothstep(6, 12, f);
          fxSpeedLines(g, c.ink, [J.hip[0] - 18 * c.k, J.hip[1] - 26 * c.k], [1, 0], 44 * c.k, 50 * c.k, 5, 0.7 * a, c.rnd);
        }
      },
      fx(g, f, c) {
        const J = c.J;
        // skid: dust kicked up ahead of the sliding front foot, scuffs behind
        if (f >= 4 && f < 20) {
          const t = (f - 4) / 16;
          dust(g, c.ink, J.footF[0] + 8 * c.k, t, 10 * c.k, 1, 0.9);
          scuff(g, c.ink, J.footF[0] - 2 * c.k, 22 * c.k * (1 - t * 0.5), 3, 1 - t);
        }
        if (f >= 9 && f < 18) dust(g, c.ink, J.footB[0] - 4 * c.k, (f - 9) / 9, 7 * c.k, -1, 0.7);
        if (f >= 12 && f <= 17) ticks(g, c.ink, J.handB[0] + 4 * c.k, J.handB[1], 6 * c.k, 11 * c.k, -40, 40, 3, 1 - (f - 12) / 5);
      },
    },
    {
      name: 'grab_hold',
      label: 'Grab hold',
      group: 'Grab and throws',
      input: 'Automatic after a successful grab',
      notes: 'Holds the opponent by the collar at arm\'s length, caduceus couched at the hip with the knob levelled at them, heel wings flicking impatiently.',
      frames: P,
      loop: true,
      pose: (f) => HOLDM.pose(f),
      victim: victimOut(HOLDM.vic),
      fxBack(g, f, c) {
        drawDummy(g, c, HOLDM.vic(f));
      },
    },
    {
      name: 'pummel',
      label: 'Knob Jab',
      group: 'Grab and throws',
      input: 'Attack while holding',
      notes: 'Draws the caduceus back and jabs the knob into the opponent\'s gut, then settles straight back into the ready hold.',
      frames: 16,
      pose: (f) => PUM.pose(f),
      victim: victimOut(PUM.vic),
      hit: [{ f: [4, 4], at: 'tip', r: 8, dmg: 1.5, kb: 0, ang: 0 }],
      fxBack(g, f, c) {
        drawDummy(g, c, PUM.vic(f));
      },
      fx(g, f, c) {
        smear(g, c, f, 3, 4, 2, ['tip', 'mid'], 0.85);
        if (f >= 4 && f <= 9) {
          const J = c.J;
          fxSpark(g, c.ink, J.tip[0], J.tip[1], 13 * c.k, (f - 4) / 6, 1);
        }
      },
    },
    {
      name: 'throw_f',
      label: 'Gust Palm',
      group: 'Grab and throws',
      input: 'Forward while holding',
      notes: 'Draws the opponent in, lets go and thrusts an open palm into the chest with a burst of wind that blows them away.',
      frames: 34,
      pose: (f) => TF.pose(f),
      victim: victimOut(TF.vic),
      hit: [{ f: [12, 12], at: vc(TF, 12), r: 12, dmg: 8, kb: 6, ang: 35 }],
      fxBack(g, f, c) {
        drawDummy(g, c, TF.vic(f));
        if (f >= 12 && f <= 22) {
          // wind streaming past the opponent along the launch line
          const a = win(f, 11.5, 12.5, 16, 22);
          const d = dirv(90 + 35);
          const q = vicCentre(TF.vic(f));
          fxSpeedLines(g, c.ink, [(q[0] - d[0] * 22) * c.k, (q[1] - d[1] * 22) * c.k], [d[0], d[1]], 40 * c.k, 36 * c.k, 5, 0.7 * a, c.rnd);
        }
      },
      fx(g, f, c) {
        const J = c.J;
        if (f >= 11 && f <= 22) {
          const t = (f - 11) / 11;
          const a = 1 - smoothstep(0.45, 1, t);
          const cx = J.handB[0] + (8 + 26 * t) * c.k;
          const cy = J.handB[1] - (2 + 14 * t) * c.k;
          fxGust(g, c.ink, cx, cy, (10 + 16 * Math.sqrt(t)) * c.k, -1.4 + t * 3, a);
        }
        if (f >= 12 && f <= 16) fxSpark(g, c.ink, J.handB[0] + 6 * c.k, J.handB[1], 12 * c.k, (f - 12) / 5, 0.9);
        if (f >= 12 && f <= 30) {
          // shed feathers ride the gust
          const t = f - 12;
          for (let i = 0; i < 3; i++) {
            const x = J.handB[0] + (14 + i * 9 + t * (2.2 + i * 0.6)) * c.k;
            const y = J.handB[1] + (-6 + i * 8 - t * (1.1 + i * 0.25) + 0.03 * t * t) * c.k;
            fxFeather(g, c.ink, x, y, 70 + i * 40 + t * (14 + i * 5), (7 - i) * c.k, 1 - smoothstep(10, 18, t));
          }
        }
        if (f >= 12 && f < 22) scuff(g, c.ink, J.footF[0] + 6 * c.k, 10 * c.k, 2, 1 - (f - 12) / 10);
      },
    },
    {
      name: 'throw_b',
      label: 'Whirlwind Fling',
      group: 'Grab and throws',
      input: 'Back while holding',
      notes: 'Pivots and swings the opponent around his back in a whirl of wind, flinging them out behind him.',
      frames: 40,
      pose: (f) => TB.pose(f),
      victim: victimOut(TB.vic),
      hit: [{ f: [20, 20], at: vc(TB, 20), r: 12, dmg: 10, kb: 7, ang: 150 }],
      fxBack(g, f, c) {
        const v = TB.vic(f);
        // behind his back half of the orbit the opponent passes behind the body
        // the far hand holds the opponent, so it is always on the far side
        drawDummy(g, c, v);
        if (f >= 8 && f <= 24) {
          const J = c.J;
          const a = win(f, 8, 11, 20, 24);
          whirl(g, c.ink, J.hip[0], J.hip[1] - 20 * c.k, 44 * c.k, 13 * c.k, Math.PI * (-0.15 + (f - 8) * 0.09), Math.PI * (0.7 + (f - 8) * 0.09), 0.8 * a);
        }
      },
      fx(g, f, c) {
        const J = c.J;
        if (f >= 10 && f <= 24) {
          const a = win(f, 10, 12, 20, 24);
          whirl(g, c.ink, J.hip[0], J.hip[1] - 14 * c.k, 46 * c.k, 12 * c.k, Math.PI * (0.05 + (f - 10) * 0.1), Math.PI * (0.85 + (f - 10) * 0.1), 0.85 * a, 1.8);
        }
        if (f >= 20 && f <= 25) {
          const p = vc(TB, 20);
          fxSpark(g, c.ink, p[0] * c.k, p[1] * c.k, 16 * c.k, (f - 20) / 6, 0.9);
        }
        if (f >= 20 && f <= 28) {
          const d = dirv(-90 + 30);
          const p = TB.vic(f);
          const q = vicCentre(p);
          fxSpeedLines(g, c.ink, [q[0] * c.k + 12 * c.k, q[1] * c.k + 4 * c.k], [-d[0] * -1, d[1]], 40 * c.k, 30 * c.k, 4, 0.7 * (1 - (f - 20) / 8), c.rnd);
        }
        if (f >= 18 && f < 30) scuff(g, c.ink, J.footB[0] - 2 * c.k, 12 * c.k, 2, 1 - (f - 18) / 12);
      },
    },
    {
      name: 'throw_u',
      label: 'Skyward Toss',
      group: 'Grab and throws',
      input: 'Up while holding',
      notes: 'Squats and heaves the opponent overhead, then whips the caduceus up from below to knock them skyward.',
      frames: 40,
      pose: (f) => TU.pose(f),
      victim: victimOut(TU.vic),
      hit: [{ f: [16, 16], at: vc(TU, 16), r: 12, dmg: 7, kb: 7, ang: 90 }],
      fxBack(g, f, c) {
        drawDummy(g, c, TU.vic(f));
      },
      fx(g, f, c) {
        const J = c.J;
        smear(g, c, f, 14, 16, 2, ['tip', 'mid'], 0.85);
        if (f >= 16 && f <= 22) fxSpark(g, c.ink, J.tip[0], J.tip[1] - 4 * c.k, 18 * c.k, (f - 16) / 7, 1);
        if (f >= 16 && f <= 26) fxSpeedLines(g, c.ink, [J.tip[0], J.tip[1] - 30 * c.k], [0, -1], 40 * c.k, 36 * c.k, 5, 0.7 * (1 - (f - 16) / 10), c.rnd);
        if (f >= 4 && f < 14) dust(g, c.ink, J.footF[0] + 4 * c.k, (f - 4) / 10, 7 * c.k, 1, 0.6);
        if (f >= 15 && f <= 26) {
          // a ring of wind round the staff as it connects
          const t = (f - 15) / 11;
          fxGust(g, c.ink, J.tip[0], J.tip[1] + 6 * c.k, (8 + 14 * t) * c.k, t * 4, 0.8 * (1 - t));
        }
      },
    },
    {
      name: 'throw_d',
      label: 'Sandal Stamp',
      group: 'Grab and throws',
      input: 'Down while holding',
      notes: 'Hoists and slams the opponent flat on the floor, hops and stamps down on them with a winged sandal.',
      frames: 40,
      pose: (f) => TD.pose(f),
      victim: victimOut(TD.vic),
      hit: [{ f: [22, 22], at: 'footF', off: [4, 2], r: 12, dmg: 7, kb: 5, ang: 70 }],
      fxBack(g, f, c) {
        drawDummy(g, c, TD.vic(f));
      },
      fx(g, f, c) {
        const J = c.J;
        // slam: dust bursts both sides of the body
        const sx = vicCentre(TD.vic(11))[0] * c.k;
        if (f >= 11 && f < 22) {
          const t = (f - 11) / 11;
          dust(g, c.ink, sx - 26 * c.k, t, 10 * c.k, -1, 0.9);
          dust(g, c.ink, sx + 30 * c.k, t, 11 * c.k, 1, 0.9);
        }
        if (f >= 11 && f <= 15) ticks(g, c.ink, sx, -2 * c.k, 22 * c.k, 34 * c.k, -160, -20, 5, 1 - (f - 11) / 4);
        // talaria flare on the hop
        if (f >= 15 && f <= 21) fxSpeedLines(g, c.ink, [J.footF[0], J.footF[1] + 8 * c.k], [0, -1], 24 * c.k, 14 * c.k, 3, 0.6 * win(f, 15, 16, 19, 21), c.rnd);
        // stomp
        if (f >= 20 && f <= 23) fxSpeedLines(g, c.ink, [J.footF[0], J.footF[1]], [0, 1], 30 * c.k, 16 * c.k, 3, 0.8, c.rnd);
        if (f >= 22 && f <= 28) fxSpark(g, c.ink, J.footF[0] + 4 * c.k, J.footF[1] + 2 * c.k, 18 * c.k, (f - 22) / 7, 1);
        if (f >= 22 && f < 34) {
          const t = (f - 22) / 12;
          dust(g, c.ink, J.footF[0] - 12 * c.k, t, 9 * c.k, -1, 0.85);
          dust(g, c.ink, J.footF[0] + 22 * c.k, t, 9 * c.k, 1, 0.85);
        }
      },
    },
  ]);
})();
