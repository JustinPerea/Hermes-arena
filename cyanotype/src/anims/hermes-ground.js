// Hermes — grounded normals: jab chain, dash attack and the three tilts.
//
// Poses are keyed like the standing set: a hip position (hx forward, hh height)
// and two planted feet (bx/bh back, fx/fh front; figure units, feet space) are
// solved with a two-bone IK so planted feet never slide. Extra key channels:
//   pl        plant weight (1 = tracks above drive the legs, 0 = raw ll1..rl2)
//   sa        absolute caduceus angle (dirv degrees) instead of wpn
//   gw, gd    back hand gripping the staff (weight, distance along the staff
//             from the front hand; + toward the tip, - toward the butt)
// All of them are resolved by fin() into plain BASE_POSE channels.
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

  // two-bone leg IK, knee forward. (dx, dy) foot relative to the hip joint.
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
  // two-bone arm IK from shoulder s to target t (hip space). Returns the absolute
  // upper-arm angle and a positive elbow bend.
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

  // kneeling legs: never let a knee sink through the floor. Raise the hips (and
  // any foot already off the floor, so kicks keep their shape) until both knee
  // joints sit at least KNEE_MIN above the floor; planted feet stay put.
  const KNEE_MIN = 1.0;
  function kneeClear(p) {
    for (let it = 0; it < 5; it++) {
      const [lb] = legIK(p.bx - p.hx + 4, p.hh - p.bh);
      const [lf] = legIK(p.fx - p.hx - 4, p.hh - p.fh);
      const low = Math.min(p.hh - SH.thigh * Math.cos(lb * D2R), p.hh - SH.thigh * Math.cos(lf * D2R));
      if (low >= KNEE_MIN - 0.02) return;
      const d = (KNEE_MIN - low) * 1.05;
      p.hh += d;
      p.bh += d * smoothstep(0.5, 4, p.bh);
      p.fh += d * smoothstep(0.5, 4, p.fh);
    }
  }

  // describe a raw-angle leg pose (ll1..rl2) as planted tracks, so keys of both
  // kinds blend through foot positions instead of joint angles
  function fromAngles(q) {
    const o = Object.assign({}, q);
    const b = fk(q.ll1, q.ll2, -1);
    const f = fk(q.rl1, q.rl2, 1);
    const D = Math.max(b[1], f[1]);
    const hx = q.hx || 0;
    Object.assign(o, { hx, hh: D, bx: b[0] + hx, bh: D - b[1], fx: f[0] + hx, fh: D - f[1] });
    for (const k of ['ll1', 'll2', 'rl1', 'rl2', 'pl']) delete o[k];
    return o;
  }

  const EXTRA = ['hx', 'hh', 'bx', 'bh', 'fx', 'fh', 'pl', 'sa', 'gw', 'gd'];
  function fin(q) {
    const p = Object.assign({}, q);
    // legs: planted tracks blended with raw angles
    const pl = clamp(p.pl == null ? 1 : p.pl, 0, 1);
    if (pl > 0) kneeClear(p);
    if (pl > 0) {
      const [ll1, ll2] = legIK(p.bx - p.hx + 4, p.hh - p.bh);
      const [rl1, rl2] = legIK(p.fx - p.hx - 4, p.hh - p.fh);
      p.ll1 = lerp(p.ll1, ll1, pl);
      p.ll2 = lerp(p.ll2, ll2, pl);
      p.rl1 = lerp(p.rl1, rl1, pl);
      p.rl2 = lerp(p.rl2, rl2, pl);
      p.ox = (p.ox || 0) + p.hx * pl;
      p.lift = (p.lift || 0) + Math.min(p.bh, p.fh) * pl;
    }
    // caduceus angle in absolute terms
    if (p.sa != null) p.wpn = p.sa - (p.lean + p.ra1 + p.ra2);
    // back hand on the staff
    if (p.gw > 0) {
      const sk = skeleton(Object.assign({}, BASE_POSE, p), S1);
      const d = dirv(p.lean + p.ra1 + p.ra2 + p.wpn);
      const t = [sk.armF.h[0] + d[0] * p.gd, sk.armF.h[1] + d[1] * p.gd];
      const [A1, bend] = armIK(sk.armB.s, t);
      p.la1 = lerp(p.la1, A1 - p.lean, p.gw);
      p.la2 = lerp(p.la2, bend, p.gw);
    }
    // keep the staff angle near its rest value so crossfades never spin it
    p.wpn = BASE_POSE.wpn + wrap(p.wpn - BASE_POSE.wpn);
    for (const k of EXTRA) delete p[k];
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
  const IDLE_SA = BASE_POSE.lean + BASE_POSE.ra1 + BASE_POSE.ra2 + BASE_POSE.wpn;
  const GROUND = Object.assign({}, BASE_POSE, NEUT, { sa: IDLE_SA, pl: 1, gw: 0, gd: 0 });
  const keyed = (keys) => seq(GROUND, keys);
  // damped wobble that starts at frame f0 (overlapping action)
  const settle = (f, f0, amp, period, decay) => (f < f0 ? 0 : amp * Math.exp(-(f - f0) / decay) * Math.sin(((f - f0) / period) * Math.PI * 2));
  const win = (f, a, b, c, d) => smoothstep(a, b, f) * (1 - smoothstep(c, d, f));

  // crouch guard, identical to CROUCH in hermes-stand.js (dtilt hands off to crouch_idle)
  const CROUCH = {
    hx: 3, hh: 25.5, bx: NEUT.bx - 2, bh: 0, fx: NEUT.fx + 2, fh: 0,
    lean: 30, head: -20, la1: 46, la2: 58, ra1: 4, ra2: 98, sa: 150, handB: 1, wing: 0.5, cloak: 0.45,
  };

  // ---- effects --------------------------------------------------------------------
  // smear behind the staff (tip and hand trail)
  function smear(g, c, f, a, b, span, keys) {
    if (f < a || f > b + 2) return;
    const fade = f <= b ? 1 : 1 - (f - b) / 2;
    fxCrescent(g, c.ink, trailOf(c, keys || ['tip', 'handF'], span, 0.25), 0.95 * fade);
  }
  // tapered engraved streak from p0 (thin tail) to p1 (wide head)
  function streak(g, ink, p0, p1, w, alpha) {
    if (alpha <= 0) return;
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L;
    const ny = dx / L;
    g.save();
    g.globalAlpha *= alpha;
    g.beginPath();
    g.moveTo(p0[0], p0[1]);
    g.quadraticCurveTo(p0[0] + dx * 0.7 + nx * w, p0[1] + dy * 0.7 + ny * w, p1[0], p1[1]);
    g.quadraticCurveTo(p0[0] + dx * 0.7 - nx * w, p0[1] + dy * 0.7 - ny * w, p0[0], p0[1]);
    g.closePath();
    g.fillStyle = rgba(PAPER_LIGHT, 0.8);
    g.fill();
    g.fillStyle = inkPatterns(g, ink).hatch;
    g.fill();
    g.strokeStyle = ink;
    g.lineWidth = 1.2;
    g.stroke();
    g.lineWidth = 0.6;
    for (const s of [-0.45, 0, 0.45]) line(g, p0[0] + dx * 0.25 + nx * w * s * 0.6, p0[1] + dy * 0.25 + ny * w * s * 0.6, p1[0] - dx * 0.08 + nx * w * s, p1[1] - dy * 0.08 + ny * w * s);
    g.restore();
  }
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
    g.beginPath();
    for (const [dx, dy, rr] of lobes) {
      g.moveTo(cx + dir * dx * r + rr * r, cy + dy * r);
      g.arc(cx + dir * dx * r, cy + dy * r, rr * r, 0, Math.PI * 2);
    }
    g.strokeStyle = ink;
    g.lineWidth = 1.6;
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
  // floor scuff strokes
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
  // curved wind strokes (a gust front) opening toward dir
  function gustArcs(g, ink, x, y, r, t, dir, alpha) {
    if (t < 0 || t > 1 || alpha <= 0) return;
    g.save();
    g.globalAlpha *= alpha * (1 - t * t);
    g.strokeStyle = ink;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const rr = r * (0.55 + 0.45 * t) * (1 - i * 0.18);
      const cx = x + dir[0] * r * (0.2 + 1.1 * t) - dir[0] * i * r * 0.32;
      const cy = y + dir[1] * r * (0.2 + 1.1 * t) - dir[1] * i * r * 0.32;
      const a0 = Math.atan2(dir[1], dir[0]);
      g.lineWidth = 2 - i * 0.5;
      g.beginPath();
      g.arc(cx - dir[0] * rr, cy - dir[1] * rr, rr, a0 - 0.9, a0 + 0.9);
      g.stroke();
    }
    g.restore();
  }
  // two snake heads darting out of the caduceus knob along the staff
  function snakeLunge(g, c, J, ext, open) {
    if (ext <= 0.02) return;
    const k = J.k;
    const d = [J.tip[0] - J.handF[0], J.tip[1] - J.handF[1]];
    const L = Math.hypot(d[0], d[1]) || 1;
    const ux = d[0] / L;
    const uy = d[1] / L;
    const nx = -uy;
    const ny = ux;
    const P = inkPatterns(g, c.ink);
    g.save();
    for (const side of [1, -1]) {
      const pts = [];
      const N = 14;
      const len = ext * 26 * k;
      for (let i = 0; i <= N; i++) {
        const s = i / N;
        const along = -8 * k + s * (len + 8 * k);
        const off = side * (2.5 + Math.sin(s * Math.PI * 1.8 + 0.3) * 4 * (1 - s * 0.5) + s * s * 3) * k;
        pts.push([J.tip[0] + ux * along + nx * off, J.tip[1] + uy * along + ny * off]);
      }
      // body
      g.lineCap = 'round';
      g.strokeStyle = c.ink;
      g.lineWidth = 5.4 * k;
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.stroke();
      g.strokeStyle = PAPER_LIGHT;
      g.lineWidth = 3.4 * k;
      g.stroke();
      g.strokeStyle = c.ink;
      g.lineWidth = 0.6;
      g.setLineDash([1.5 * k, 1.5 * k]);
      g.stroke();
      g.setLineDash([]);
      // head with open jaws
      const h = pts[N];
      const ang = Math.atan2(uy, ux) + side * 0.2;
      g.save();
      g.translate(h[0], h[1]);
      g.rotate(ang);
      g.scale(1.45, 1.45);
      const o = open * 0.5;
      g.beginPath();
      g.moveTo(-1.5 * k, -2 * k);
      g.quadraticCurveTo(2.5 * k, -2.8 * k, 5.5 * k, -1.2 * k - o * 3 * k);
      g.lineTo(1.8 * k, -0.2 * k);
      g.lineTo(5.5 * k, 1.2 * k + o * 3 * k);
      g.quadraticCurveTo(2.5 * k, 2.8 * k, -1.5 * k, 2 * k);
      g.closePath();
      g.fillStyle = PAPER_LIGHT;
      g.fill();
      g.fillStyle = P.dense;
      g.fill();
      g.strokeStyle = c.ink;
      g.lineWidth = 1;
      g.stroke();
      // forked tongue
      if (open > 0.3) {
        g.lineWidth = 0.7;
        line(g, 2 * k, 0, 7.5 * k, 0);
        line(g, 7.5 * k, 0, 9 * k, -1 * k);
        line(g, 7.5 * k, 0, 9 * k, 1 * k);
      }
      g.fillStyle = PAPER_LIGHT;
      g.beginPath();
      g.arc(1 * k, -side * 0.9 * k, 0.6 * k, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.restore();
  }

  // ---- jab 1: butt-end poke ----------------------------------------------------------
  const jab1K = keyed([
    [0, {}],
    [1.5, { hx: -1.5, hh: H0 - 1.4, lean: 1, head: 2, ra1: -14, ra2: 84, sa: 268, la1: 4, la2: 50, wing: 0.45, cloak: 0.3 }, 'out'],
    [3, { hx: 4, hh: H0 - 2.2, lean: 15, head: -7, ra1: 64, ra2: 3, sa: 284, la1: -50, la2: 30, handB: 1, wing: 0.75, cloak: 0.55 }, 'out'],
    [6, { hx: 4.5, hh: H0 - 2.4, lean: 16, head: -7, ra1: 65, ra2: 4, sa: 286, la1: -54, la2: 28, handB: 1, wing: 0.55, cloak: 0.6 }],
    [11, { hx: 1.5, hh: H0 - 1, lean: 8, head: -2, ra1: 40, ra2: 44, sa: 470, la1: -24, la2: 30, wing: 0.4, cloak: 0.35 }],
    [16, { sa: IDLE_SA + 360 }],
  ]);

  // ---- jab 2: rising backhand swipe ---------------------------------------------------
  const jab2K = keyed([
    [0, {}],
    [2, { hx: -1.5, hh: H0 - 1.5, lean: 2, head: 3, ra1: -6, ra2: 70, sa: 318, la1: 22, la2: 46, wing: 0.5, cloak: 0.3 }, 'out'],
    [4, { hx: 3.5, hh: H0 - 2.5, lean: 13, head: -6, ra1: 64, ra2: 8, sa: 418, la1: -40, la2: 32, handB: 1, wing: 0.9, cloak: 0.6 }, 'out'],
    [6, { hx: 4, hh: H0 - 2.3, lean: 12, head: -7, ra1: 86, ra2: 8, sa: 458, la1: -48, la2: 30, handB: 1, wing: 0.7, cloak: 0.65 }, 'out'],
    [10, { hx: 3, hh: H0 - 1.8, lean: 9, head: -5, ra1: 98, ra2: 18, sa: 478, la1: -40, la2: 32, handB: 1, wing: 0.5, cloak: 0.5 }],
    [18, { sa: IDLE_SA + 360 }],
  ]);

  // ---- jab 3: twirl and gust push ------------------------------------------------------
  const jab3K = keyed([
    [0, {}],
    [3, { hx: 1.5, hh: H0 - 2, lean: 8, head: -3, ra1: 66, ra2: 12, la1: -30, la2: 60, fx: NEUT.fx + 3, fh: 3, wing: 0.7, cloak: 0.45 }, 'out'],
    [6, { hx: 3, hh: H0 - 3, lean: 10, head: -4, ra1: 68, ra2: 10, la1: -40, la2: 70, handB: 1, fx: NEUT.fx + 6, fh: 0, wing: 1, cloak: 0.6 }],
    [9.5, { hx: 7, hh: H0 - 5, lean: 18, head: -9, ra1: 72, ra2: 2, la1: -76, la2: 20, handB: 1, fx: NEUT.fx + 6, fh: 0, wing: 1.3, cloak: 0.95 }, 'out'],
    [14, { hx: 7.5, hh: H0 - 5.2, lean: 18, head: -9, ra1: 72, ra2: 4, la1: -74, la2: 24, handB: 1, fx: NEUT.fx + 6, fh: 0, wing: 0.8, cloak: 0.9 }],
    [21, { hx: 3, hh: H0 - 2.5, lean: 9, head: -3, ra1: 44, ra2: 46, la1: -20, la2: 34, fx: NEUT.fx + 3, fh: 2.5, wing: 0.45, cloak: 0.45 }],
    [30, {}],
  ]);
  // staff angle: two quick forward revolutions about the hand, ending level and
  // pointing ahead for the gust, then tipped back up to rest
  const jab3Spin = (f) => {
    const t = smoothstep(1.5, 9.5, f) * 0.3 + clamp((f - 1.5) / 8, 0, 1) * 0.7;
    return IDLE_SA - 810 * t + 90 * EASE.inOut(smoothstep(14, 27, f));
  };

  // ---- dash attack: Courier's Slide ------------------------------------------------------
  const SLIDE = { ll1: 64, ll2: -152, rl1: 84, rl2: -6, lean: -36, head: 26, rot: 0, ra1: 152, ra2: 20, sa: 214, la1: -6, la2: 30, handB: 1, wing: 1.6, cloak: 0.75 };
  const dashK = keyed([
    [0, { hx: 0, hh: H0 - 3, lean: 20, head: -9, ra1: 44, ra2: 52, sa: 156, la1: -40, la2: 64, wing: 0.9, cloak: 0.95, fx: NEUT.fx + 4 }],
    [3, { hx: 3, hh: 36, lean: 26, head: -12, ra1: 70, ra2: 40, sa: 168, la1: -70, la2: 40, handB: 1, wing: 1.1, cloak: 1.1, bx: NEUT.bx + 2, bh: 4, fx: NEUT.fx + 6 }, 'out'],
    [6, fromAngles(SLIDE), 'out'],
    [13, fromAngles(Object.assign({}, SLIDE, { rl1: 82, rl2: -4, lean: -32, head: 24, ra1: 148, sa: 210, wing: 1.2, cloak: 0.7 }))],
    [17, fromAngles(Object.assign({}, SLIDE, { ll1: 58, ll2: -150, rl1: 76, rl2: -10, lean: -24, head: 18, ra1: 138, ra2: 26, sa: 200, wing: 0.9, cloak: 0.7 }))],
    [19.5, Object.assign(fromAngles({ ll1: 58, ll2: -150, rl1: 66, rl2: -128, lean: -12, head: 10, ra1: 120, ra2: 30, sa: 190, la1: 10, la2: 30, handB: 1, wing: 0.8, cloak: 0.9 }), { fx: 18, fh: 6 })],
    [22.5, { hx: 2, hh: 19, bx: -14, bh: 1, fx: 14, fh: 0, lean: 24, head: -12, ra1: 60, ra2: 50, sa: 160, la1: 20, la2: 50, handB: 1, wing: 0.8, cloak: 0.8 }],
    [26, { hx: 2.5, hh: 30, bx: NEUT.bx + 2, bh: 0, fx: 14, fh: 0, lean: 16, head: -8, ra1: 40, ra2: 54, sa: 160, la1: 20, la2: 50, handB: 1, wing: 0.6, cloak: 0.6 }],
    [34, {}],
  ]);
  const dashVx = (f) => (f < 4 ? 10 : 10 * Math.pow(Math.max(0, 1 - (f - 4) / 18), 1.5));

  // ---- forward tilt: snake-lunge thrust ------------------------------------------------------
  const ftiltK = keyed([
    [0, {}],
    [3, { hx: -2, hh: H0 - 1.5, lean: -3, head: 4, ra1: -10, ra2: 112, sa: 96, la1: 26, la2: 50, fx: NEUT.fx + 3, fh: 3.5, wing: 0.5, cloak: 0.35 }],
    [5, { hx: -2.5, hh: H0 - 1.8, lean: -4, head: 5, ra1: -16, ra2: 120, sa: 97, la1: 32, la2: 52, fx: NEUT.fx + 6, fh: 4, wing: 0.6, cloak: 0.4 }, 'out'],
    [7, { hx: 6, hh: H0 - 4.5, lean: 15, head: -8, ra1: 75, ra2: 0, sa: 92, la1: -64, la2: 18, handB: 1, fx: NEUT.fx + 11, fh: 0, wing: 1.2, cloak: 0.85 }, 'out'],
    [11, { hx: 6.5, hh: H0 - 4.8, lean: 16, head: -8, ra1: 75, ra2: 1, sa: 92, la1: -66, la2: 18, handB: 1, fx: NEUT.fx + 11, fh: 0, wing: 0.8, cloak: 0.9 }],
    [15, { hx: 4, hh: H0 - 3, lean: 11, head: -5, ra1: 52, ra2: 34, sa: 118, la1: -36, la2: 28, fx: NEUT.fx + 8, fh: 3, wing: 0.6, cloak: 0.6 }],
    [19, { hx: 1, hh: H0 - 1.2, lean: 6, head: -2, ra1: 34, ra2: 50, sa: 164, la1: -18, la2: 28, fx: NEUT.fx + 0.5, fh: 0, wing: 0.4, cloak: 0.4 }],
    [26, {}],
  ]);

  // ---- up tilt: overhead arc --------------------------------------------------------------
  const utiltK = keyed([
    [0, {}],
    [4, { hx: 1.5, hh: H0 - 5, lean: 16, head: -4, ra1: 30, ra2: 30, sa: 58, la1: -34, la2: 46, wing: 0.55, cloak: 0.35 }, 'inOut'],
    [6, { hx: 1, hh: H0 - 2, lean: 6, head: -10, ra1: 106, ra2: 12, sa: 126, la1: -10, la2: 40, wing: 0.9, cloak: 0.6 }, 'in'],
    [8, { hx: 0, hh: H0 - 0.6, lean: -4, head: -18, ra1: 152, ra2: 6, sa: 186, la1: 20, la2: 40, wing: 1.2, cloak: 0.8 }, 'lin'],
    [10, { hx: -1, hh: H0 - 0.5, lean: -10, head: -20, ra1: 184, ra2: 6, sa: 244, la1: 42, la2: 34, handB: 1, wing: 1.3, cloak: 0.95 }, 'lin'],
    [12, { hx: -1.5, hh: H0 - 1, lean: -13, head: -16, ra1: 226, ra2: 10, sa: 300, la1: 56, la2: 30, handB: 1, wing: 1.1, cloak: 1.05 }, 'out'],
    [15, { hx: -1.5, hh: H0 - 1.5, lean: -12, head: -12, ra1: 228, ra2: 14, sa: 306, la1: 52, la2: 32, handB: 1, wing: 0.8, cloak: 1 }],
    [20, { hx: -0.5, hh: H0 - 1, lean: -4, head: -6, ra1: 150, ra2: 12, sa: 222, la1: 20, la2: 34, wing: 0.5, cloak: 0.6 }],
    [28, {}],
  ]);

  // ---- down tilt: low sweep ------------------------------------------------------------------
  const DT_LOW = { hx: 6, hh: 21, bx: NEUT.bx - 1, bh: 0, fx: NEUT.fx + 18, fh: 0 };
  const dtiltK = keyed([
    [0, CROUCH],
    [2, Object.assign({}, CROUCH, { hx: 1.5, hh: 26, lean: 32, head: -18, ra1: -20, ra2: 56, sa: 122, la1: 30, la2: 50, fx: NEUT.fx + 8, fh: 5, wing: 0.7, cloak: 0.55 }), 'out'],
    [3.5, Object.assign({}, DT_LOW, { hx: 3, hh: 23, lean: 40, head: -22, ra1: -34, ra2: 50, sa: 132, la1: -40, la2: 40, fx: NEUT.fx + 15, fh: 4, wing: 0.9, cloak: 0.7 }), 'in'],
    [5, Object.assign({}, DT_LOW, { lean: 50, head: -32, ra1: -16, ra2: 8, sa: 84, la1: -150, la2: 20, handB: 1, wing: 1.3, cloak: 0.9 }), 'out'],
    [8, Object.assign({}, DT_LOW, { hx: 6.5, lean: 51, head: -33, ra1: -13, ra2: 8, sa: 82, la1: -152, la2: 22, handB: 1, wing: 0.9, cloak: 0.95 })],
    [13, Object.assign({}, DT_LOW, { hx: 5, hh: 24, lean: 38, head: -22, ra1: 10, ra2: 40, sa: 110, la1: -40, la2: 50, handB: 1, wing: 0.6, cloak: 0.7 })],
    [16, Object.assign({}, CROUCH, { fx: NEUT.fx + 6, fh: 3.5, hh: 26.5, lean: 32, ra1: 8, ra2: 90, sa: 140 })],
    [20, CROUCH],
  ]);

  defineAnims('hermes', [
    {
      name: 'jab1',
      label: 'Messenger\'s Flurry 1',
      group: 'Ground attacks',
      input: 'Attack',
      notes: 'A snappy poke with the butt end of the caduceus, the back arm swinging out for balance.',
      frames: 16,
      cancel: 10,
      hit: [
        { f: [3, 4], at: 'butt', r: 6.5, dmg: 2, kb: 1, ang: 70 },
        { f: [3, 4], at: 'handF', r: 5.5, dmg: 2, kb: 1, ang: 70 },
      ],
      pose(f) {
        const p = jab1K(f);
        p.wing += settle(f, 3, 0.18, 4, 3);
        p.cloak += settle(f, 6, 0.08, 6, 4);
        return fin(p);
      },
      fx(g, f, c) {
        const J = c.J;
        if (f >= 2 && f <= 6) {
          const t = (f - 2) / 4;
          const d = [J.butt[0] - J.handF[0], J.butt[1] - J.handF[1]];
          const L = Math.hypot(d[0], d[1]) || 1;
          fxSpeedLines(g, c.ink, [J.handF[0] - (d[0] / L) * 4 * J.k, J.handF[1] - (d[1] / L) * 4 * J.k], [d[0] / L, d[1] / L], 20 * J.k, 12 * J.k, 3, 0.8 * (1 - t), c.rnd);
        }
        if (f >= 3 && f <= 6) fxSpark(g, c.ink, J.butt[0] + 3 * J.k, J.butt[1], 9 * J.k, (f - 3) / 4, 0.9);
      },
    },
    {
      name: 'jab2',
      label: 'Messenger\'s Flurry 2',
      group: 'Ground attacks',
      input: 'Attack again during jab 1',
      notes: 'Backhanded rising swipe: the caduceus whips up from behind the hip through a low arc in front.',
      frames: 18,
      cancel: 11,
      hit: [
        { f: [4, 5], at: 'tip', r: 8, dmg: 2, kb: 1, ang: 75 },
        { f: [4, 5], at: 'mid', r: 7, dmg: 2, kb: 1, ang: 75 },
      ],
      pose(f) {
        const p = jab2K(f);
        p.wing += settle(f, 4, 0.2, 4, 3);
        p.cloak += settle(f, 7, 0.08, 6, 4);
        return fin(p);
      },
      fx(g, f, c) {
        smear(g, c, f, 3, 6, 2.5);
      },
    },
    {
      name: 'jab3',
      label: 'Messenger\'s Flurry 3',
      group: 'Ground attacks',
      input: 'Attack again during jab 2',
      notes: 'Finisher: twirls the caduceus twice in front like a pinwheel, then stops it dead pointing ahead and a gust bursts off the knob.',
      frames: 30,
      hit: [
        { f: [6, 9], at: 'handF', r: 12, dmg: 4, kb: 5, ang: 35 },
        { f: [6, 9], at: 'tip', r: 9, dmg: 4, kb: 5, ang: 35 },
        { f: [8, 9], at: 'handF', off: [34, 0], r: 13, dmg: 4, kb: 5, ang: 35 },
      ],
      pose(f) {
        const p = jab3K(f);
        p.sa = jab3Spin(f);
        p.wing += settle(f, 9.5, 0.3, 4, 4);
        p.cloak += settle(f, 12, 0.12, 7, 5);
        return fin(p);
      },
      fx(g, f, c) {
        const J = c.J;
        if (f >= 2.5 && f <= 10.5) {
          const a = f <= 9.5 ? 1 : 1 - (f - 9.5);
          fxCrescent(g, c.ink, trailOf(c, ['tip', 'handF'], 1, 0.2), 0.85 * a);
          fxCrescent(g, c.ink, trailOf(c, ['butt', 'handF'], 1, 0.2), 0.55 * a);
        }
        if (f >= 8.5) {
          const t = (f - 8.5) / 12;
          const tp = c.sample(9.5).tip;
          gustArcs(g, c.ink, tp[0] + 2 * J.k, tp[1], 16 * J.k, t, [1, 0], 0.95);
          if (t < 1) fxGust(g, c.ink, tp[0] + (12 + 30 * t) * J.k, tp[1], (10 + 10 * t) * J.k, f * 0.6, 0.8 * (1 - t));
          if (t < 0.6) fxSpeedLines(g, c.ink, [tp[0] + 44 * J.k, tp[1]], [1, 0], 36 * J.k, 24 * J.k, 5, 0.75 * (1 - t / 0.6), c.rnd);
        }
      },
    },
    {
      name: 'dash_attack',
      label: "Courier's Slide",
      group: 'Ground attacks',
      input: 'Attack while running',
      notes: 'Drops into a feet-first slide, leading heel and its wing flared, spraying dust along the floor.',
      frames: 34,
      hit: [
        { f: [6, 9], at: 'footF', off: [2, -2], r: 9, dmg: 8, kb: 6, ang: 70 },
        { f: [6, 9], at: 'kneeF', r: 7, dmg: 8, kb: 6, ang: 70 },
        { f: [10, 16], at: 'footF', off: [2, -2], r: 8, dmg: 5, kb: 3, ang: 60 },
      ],
      pose(f) {
        const p = dashK(f);
        p.wing += 0.25 * Math.sin(f * 1.7) * win(f, 5, 7, 14, 18) + settle(f, 17, 0.2, 5, 4);
        p.cloak += 0.08 * Math.sin(f * 1.1) * win(f, 5, 7, 14, 18) + settle(f, 23, 0.1, 7, 5);
        return fin(p);
      },
      fxBack(g, f, c) {
        const J = c.J;
        // trail of dust left behind the sliding body
        for (let i = 0; i < 3; i++) {
          const f0 = 5 + i * 3.5;
          dust(g, c, J.footB[0] - (8 + i * 10) * J.k - (f - f0) * 3 * J.k, (f - f0) / 12, (9 - i) * J.k, -1, 0.85);
        }
        if (f >= 5 && f <= 18) scuff(g, c.ink, J.footF[0] - 4 * J.k, (34 - (f - 5) * 1.6) * J.k, 3, 1 - smoothstep(13, 18, f));
      },
      fx(g, f, c) {
        const J = c.J;
        // dust spray off the leading heel
        if (f >= 5 && f <= 20) {
          const x = J.footF[0] + 6 * J.k;
          const a = 1 - smoothstep(14, 20, f);
          dust(g, c, x, ((f - 5) % 4) / 5 + 0.1, (8 + 3 * a) * J.k, 1, a);
          dust(g, c, x + 4 * J.k, ((f - 3) % 4) / 5 + 0.1, 6 * J.k, 1, 0.8 * a);
        }
        if (f >= 4 && f <= 14) {
          const a = win(f, 4, 6, 10, 14);
          fxSpeedLines(g, c.ink, [J.hip[0] - 10 * J.k, J.hip[1] - 4 * J.k], [1, 0], 40 * J.k, 34 * J.k, 5, 0.7 * a, c.rnd);
        }
        // shed feathers from the flaring heel wing
        if (f >= 7 && f <= 22) {
          const t = (f - 7) / 15;
          fxFeather(g, c.ink, J.footF[0] - (10 + 30 * t) * J.k, J.footF[1] - (10 + 14 * Math.sin(t * 3)) * J.k, 220 + 200 * t, 7 * J.k, 1 - t);
        }
      },
      motion: (f) => ({ vx: dashVx(f) }),
    },
    {
      name: 'ftilt',
      label: 'Twin Serpent Thrust',
      group: 'Ground attacks',
      input: 'Tilt forward + Attack',
      notes: 'Steps in with a straight one-handed thrust of the caduceus while its two snakes lunge out past the knob.',
      frames: 26,
      hit: [
        { f: [7, 9], at: 'tip', off: [8, 0], r: 9, dmg: 9, kb: 5, ang: 30 },
        { f: [7, 9], at: 'mid', off: [6, 0], r: 8, dmg: 9, kb: 5, ang: 30 },
      ],
      pose(f) {
        const p = ftiltK(f);
        p.wing += settle(f, 7, 0.3, 4, 3);
        p.cloak += settle(f, 10, 0.1, 6, 4);
        return fin(p);
      },
      fxBack(g, f, c) {
        const J = c.J;
        if (f >= 5.5 && f <= 9) {
          const back = c.sample(Math.max(0, f - 2));
          streak(g, c.ink, [back.handF[0] - 10 * J.k, back.handF[1]], [J.tip[0] + 2 * J.k, J.tip[1]], 8 * J.k, f <= 8 ? 0.9 : 0.9 * (9 - f));
        }
      },
      fx(g, f, c) {
        const J = c.J;
        const ext = f < 6 ? 0 : f < 8 ? EASE.out((f - 6) / 2) : f < 11 ? 1 : 1 - EASE.inOut(clamp((f - 11) / 4, 0, 1));
        snakeLunge(g, c, J, ext, f < 12 ? clamp((f - 6.5) / 1.5, 0, 1) : 0.2);
        if (f >= 7 && f <= 11) fxSpark(g, c.ink, J.tip[0] + 18 * J.k, J.tip[1], 10 * J.k, (f - 7) / 4, 0.85);
      },
    },
    {
      name: 'utilt',
      label: 'Caduceus Arc',
      group: 'Ground attacks',
      input: 'Tilt up + Attack',
      notes: 'Arches back and carries the caduceus in a wide overhead arc from front to back.',
      frames: 28,
      hit: [
        { f: [6, 12], at: 'tip', r: 10, dmg: 7, kb: 5, ang: 90 },
        { f: [6, 12], at: 'mid', r: 8.5, dmg: 7, kb: 5, ang: 90 },
      ],
      pose(f) {
        const p = utiltK(f);
        p.wing += settle(f, 12, 0.25, 5, 4);
        p.cloak += settle(f, 14, 0.12, 7, 5);
        return fin(p);
      },
      fx(g, f, c) {
        smear(g, c, f, 6, 12.5, 3);
      },
    },
    {
      name: 'dtilt',
      label: 'Scything Sweep',
      group: 'Ground attacks',
      input: 'Crouch + Attack',
      notes: 'From the crouch, lunges low and scythes the caduceus along the floor at ankle height.',
      frames: 20,
      hit: [
        { f: [5, 7], at: 'tip', r: 8, dmg: 6, kb: 3, ang: 15 },
        { f: [5, 7], at: 'mid', r: 7, dmg: 6, kb: 3, ang: 15 },
      ],
      pose(f) {
        const p = dtiltK(f);
        p.wing += settle(f, 5, 0.25, 4, 3);
        return fin(p);
      },
      fx(g, f, c) {
        const J = c.J;
        smear(g, c, f, 4.5, 6.5, 1.2);
        if (f >= 5 && f <= 12) {
          const t = (f - 5) / 7;
          dust(g, c, J.tip[0] + 2 * J.k, t, 8 * J.k, 1, 0.9);
          scuff(g, c.ink, J.tip[0], 30 * J.k * (1 - t * 0.5), 3, 1 - t);
        }
      },
      next: 'crouch_idle',
    },
  ]);
})();
