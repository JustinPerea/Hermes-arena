// Hermes — smash attacks: Herald's Strike (forward), the rotor whirlwind (up)
// and the split kicks (down).
//
// Same keyed-pose toolkit as the ground normals: planted hip/feet tracks solved
// with leg IK (pl = plant weight), an absolute staff angle (sa), the back hand
// gripping the staff (gw/gd) and a front-hand target in feet space (hw/htx/hty),
// all resolved by fin() into plain BASE_POSE channels. Every smash holds on its
// charge frame while the button is held; c.charge (0..1) drives the tremble,
// the gathering wind and the glow lines on the staff.
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

  const EXTRA = ['hx', 'hh', 'bx', 'bh', 'fx', 'fh', 'pl', 'sa', 'gw', 'gd', 'hw', 'htx', 'hty'];
  function fin(q) {
    const p = Object.assign({}, q);
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
    // front hand reaching a point in feet space (figure units)
    if (p.hw > 0) {
      const fr = hermesFrame(Object.assign({}, BASE_POSE, p, { rot: 0 }), S1);
      const s = [fr.sk.armF.s[0] + fr.dx, fr.sk.armF.s[1] + fr.dy];
      const [A1, bend] = armIK(s, [p.htx, p.hty]);
      p.ra1 = lerp(p.ra1, A1 - p.lean, p.hw);
      p.ra2 = lerp(p.ra2, bend, p.hw);
    }
    if (p.sa != null) p.wpn = p.sa - (p.lean + p.ra1 + p.ra2);
    if (p.gw > 0) {
      const sk = skeleton(Object.assign({}, BASE_POSE, p), S1);
      const d = dirv(p.lean + p.ra1 + p.ra2 + p.wpn);
      const t = [sk.armF.h[0] + d[0] * p.gd, sk.armF.h[1] + d[1] * p.gd];
      const [A1, bend] = armIK(sk.armB.s, t);
      p.la1 = lerp(p.la1, A1 - p.lean, p.gw);
      p.la2 = lerp(p.la2, bend, p.gw);
    }
    p.wpn = BASE_POSE.wpn + wrap(p.wpn - BASE_POSE.wpn);
    for (const k of EXTRA) delete p[k];
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
  const GROUND = Object.assign({}, BASE_POSE, NEUT, { sa: IDLE_SA, pl: 1, gw: 0, gd: 0, hw: 0, htx: 0, hty: 0 });
  const keyed = (keys) => seq(GROUND, keys);
  const settle = (f, f0, amp, period, decay) => (f < f0 ? 0 : amp * Math.exp(-(f - f0) / decay) * Math.sin(((f - f0) / period) * Math.PI * 2));
  const win = (f, a, b, c, d) => smoothstep(a, b, f) * (1 - smoothstep(c, d, f));

  // charge level shown on the hold frame (fades in/out over one frame either side)
  const holdW = (f, c, cf) => Math.max(0, 1 - Math.abs(f - cf)) * (0.3 + 0.7 * (c.charge || 0));
  // trembling while the smash is held
  function tremble(p, f, c, cf) {
    const w = Math.max(0, 1 - Math.abs(f - cf)) * (c.charge || 0);
    if (w <= 0) return p;
    const t = c.time || 0;
    p.hx += Math.sin(t * 93) * 0.6 * w;
    p.hh += Math.sin(t * 67 + 0.7) * 0.4 * w;
    p.lean += Math.sin(t * 71 + 1) * 1.4 * w;
    p.head += Math.sin(t * 83 + 2) * 1.2 * w;
    if (p.sa != null) p.sa += Math.sin(t * 111) * 2 * w;
    p.wing += w * (0.35 + 0.35 * Math.sin(t * 50));
    p.cloak += w * (0.2 + 0.1 * Math.sin(t * 23));
    return p;
  }

  // ---- effects ----------------------------------------------------------------------
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
    g.lineWidth = 1.3;
    g.stroke();
    g.lineWidth = 0.6;
    for (const s of [-0.45, 0, 0.45]) line(g, p0[0] + dx * 0.25 + nx * w * s * 0.6, p0[1] + dy * 0.25 + ny * w * s * 0.6, p1[0] - dx * 0.08 + nx * w * s, p1[1] - dy * 0.08 + ny * w * s);
    g.restore();
  }
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
      g.lineWidth = 2.2 - i * 0.5;
      g.beginPath();
      g.arc(cx - dir[0] * rr, cy - dir[1] * rr, rr, a0 - 0.9, a0 + 0.9);
      g.stroke();
    }
    g.restore();
  }
  // gathering wind: three strands spiralling in toward (x, y), turning with time
  function gather(g, ink, x, y, r, time, a) {
    if (a <= 0.01) return;
    g.save();
    g.globalAlpha *= a;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    const ph = (time * 2.4) % 1;
    for (let j = 0; j < 3; j++) {
      const R = r * (1.15 - 0.45 * ((ph + j / 3) % 1));
      g.lineWidth = 0.7 + 0.5 * (1 - ((ph + j / 3) % 1));
      g.beginPath();
      for (let i = 0; i <= 22; i++) {
        const t = i / 22;
        const ang = -time * 9 + j * 2.1 + t * 2.4;
        const rr = R * (1 - 0.55 * t);
        const px = x + Math.cos(ang) * rr;
        const py = y + Math.sin(ang) * rr * 0.55;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    }
    g.restore();
  }
  // short flickering rays around a segment (staff glow in engraving terms)
  function glowLines(g, ink, a, b, len, time, alpha) {
    if (alpha <= 0.01) return;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L;
    const ny = dx / L;
    g.save();
    g.globalAlpha *= alpha;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const fl = 0.5 + 0.5 * Math.sin(time * 40 + i * 2.3);
      const s = i % 2 ? 1 : -1;
      const px = a[0] + dx * t + nx * s * 4;
      const py = a[1] + dy * t + ny * s * 4;
      const l = len * (0.4 + 0.6 * fl) * (0.6 + 0.4 * Math.sin(t * Math.PI));
      g.lineWidth = 0.6 + 0.6 * fl;
      line(g, px, py, px + nx * s * l, py + ny * s * l);
    }
    // a ring of rays at the knob
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2 + time * 3;
      const fl = 0.5 + 0.5 * Math.sin(time * 37 + i * 1.7);
      const r0 = 6;
      const r1 = 6 + len * (0.5 + 0.7 * fl);
      g.lineWidth = 0.8;
      line(g, b[0] + Math.cos(an) * r0, b[1] + Math.sin(an) * r0, b[0] + Math.cos(an) * r1, b[1] + Math.sin(an) * r1);
    }
    g.restore();
  }
  // two snake heads darting out of the caduceus knob along the staff
  function snakeLunge(g, c, J, ext, open, spread) {
    if (ext <= 0.02) return;
    const k = J.k;
    const d = [J.tip[0] - J.handF[0], J.tip[1] - J.handF[1]];
    const L = Math.hypot(d[0], d[1]) || 1;
    const ux = d[0] / L;
    const uy = d[1] / L;
    const nx = -uy;
    const ny = ux;
    const P = inkPatterns(g, c.ink);
    const sp = spread || 1;
    g.save();
    for (const side of [1, -1]) {
      const pts = [];
      const N = 14;
      const len = ext * 26 * k;
      for (let i = 0; i <= N; i++) {
        const s = i / N;
        const along = -8 * k + s * (len + 8 * k);
        const off = side * (2.5 + Math.sin(s * Math.PI * 1.8 + 0.3) * 4 * (1 - s * 0.5) + s * s * 3 * sp) * k;
        pts.push([J.tip[0] + ux * along + nx * off, J.tip[1] + uy * along + ny * off]);
      }
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
      const h = pts[N];
      const ang = Math.atan2(uy, ux) + side * 0.2 * sp;
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
  // flared caduceus wings: two extra feather fans opening at the knob
  function wingFlare(g, c, J, amt) {
    if (amt <= 0.02) return;
    const d = [J.tip[0] - J.handF[0], J.tip[1] - J.handF[1]];
    const a = Math.atan2(d[0], d[1]) / D2R; // dirv angle of the staff
    const b = [J.tip[0] - (d[0] / Math.hypot(d[0], d[1])) * 5 * J.k, J.tip[1] - (d[1] / Math.hypot(d[0], d[1])) * 5 * J.k];
    featherFan(g, c.ink, b[0], b[1], a - 120, 50 * amt, 4, 9 * J.k * amt, 16 * J.k * amt, 2.4 * J.k, 0.95);
    featherFan(g, c.ink, b[0], b[1], a + 120, 50 * amt, 4, 9 * J.k * amt, 16 * J.k * amt, 2.4 * J.k, 0.95);
  }

  // ---- forward smash: Herald's Strike -----------------------------------------------------
  const FS_COIL = {
    hx: -4.5, hh: 40, bx: NEUT.bx - 2, bh: 0, fx: NEUT.fx + 12, fh: 0,
    lean: -14, head: 10, ra1: -48, ra2: 104, hw: 1, htx: -9, hty: -58, sa: 96, gw: 1, gd: -15, handB: 0, handF: 0, wing: 0.9, cloak: 0.7,
  };
  const FS_HIT = {
    hx: 10, hh: 36, bx: NEUT.bx - 2, bh: 0, fx: NEUT.fx + 12, fh: 0,
    lean: 24, head: -14, ra1: 64, ra2: 0, sa: 91, gw: 1, gd: -15, wing: 1.9, cloak: 1.3,
  };
  const fsmashK = keyed([
    [0, {}],
    [3, { hx: -1.5, hh: H0 - 2, lean: 2, head: 2, ra1: 10, ra2: 90, sa: 150, gw: 0.6, gd: -14, fx: NEUT.fx + 5, fh: 5, wing: 0.6, cloak: 0.4 }, 'inOut'],
    [7, Object.assign({}, FS_COIL, { hx: -3.5, hh: 41, lean: -10, htx: -6, hty: -59, fx: NEUT.fx + 11, fh: 1.5, wing: 1, cloak: 0.6 }), 'out'],
    [10, FS_COIL, 'inOut'],
    [12, Object.assign({}, FS_COIL, { hx: -6, hh: 39.5, lean: -16, head: 11, htx: -11, sa: 97, wing: 0.7 }), 'inOut'],
    [15, FS_HIT, 'out'],
    [20, Object.assign({}, FS_HIT, { hx: 10.5, hh: 35.5, lean: 25, ra1: 65, wing: 1.2, cloak: 1.35 })],
    [28, Object.assign({}, FS_HIT, { hx: 6, hh: 38, lean: 16, head: -8, ra1: 48, ra2: 26, sa: 104, gw: 0.6, gd: -14, wing: 0.8, cloak: 1 })],
    [36, { hx: 3, hh: 42, bx: NEUT.bx - 2, bh: 0, fx: NEUT.fx + 12, fh: 0, lean: 8, head: -3, ra1: 34, ra2: 54, sa: 160, gw: 0, la1: -20, la2: 30, wing: 0.55, cloak: 0.6 }],
    [42, { hx: 1, hh: H0 - 1.5, bx: NEUT.bx - 1, bh: 0, fx: NEUT.fx + 5, fh: 4, lean: 5, ra1: 28, ra2: 56, sa: 182, wing: 0.45, cloak: 0.4 }],
    [52, {}],
  ]);

  // ---- up smash: rotor whirlwind ------------------------------------------------------------
  const US_COIL = {
    hx: 1, hh: 33, bx: NEUT.bx + 3, bh: 0, fx: NEUT.fx - 1, fh: 0,
    lean: 30, head: -34, ra1: 30, ra2: 60, hw: 1, htx: 27, hty: -31, sa: 56, gw: 1, gd: -9, wing: 0.8, cloak: 0.5,
  };
  const US_UP = {
    hx: 0.5, hh: H0 + 0.6, bx: NEUT.bx + 3, bh: 2.5, fx: NEUT.fx - 1, fh: 2.5,
    lean: -6, head: -16, ra1: 182, ra2: 2, sa: 180, gw: 0, la1: 104, la2: 26, handB: 1, wing: 1.5, cloak: 1.2,
  };
  const usmashK = keyed([
    [0, {}],
    [5, Object.assign({}, US_COIL, { hh: 35, lean: 24, head: -20, htx: 25, hty: -36, sa: 62, wing: 0.7 }), 'inOut'],
    [8, US_COIL, 'out'],
    [12, US_UP, 'out'],
    [24, Object.assign({}, US_UP, { lean: -8, head: -18, ra1: 180, la1: 112, wing: 1.6 })],
    [27, Object.assign({}, US_UP, { hh: H0, bh: 0.8, fh: 0.8, lean: -10, head: -18, ra1: 182, la1: 120, la2: 20, wing: 1.2, cloak: 1.3 }), 'out'],
    [36, { hx: 0.5, hh: H0 - 1, lean: -2, head: -6, ra1: 120, ra2: 30, sa: 186, la1: 20, la2: 30, wing: 0.6, cloak: 0.8 }],
    [50, {}],
  ]);
  // rotor spin phase (radians) and visibility window
  const rotorOn = (f) => win(f, 10.5, 11.5, 24, 25.5);
  const rotorPhase = (f) => {
    // accelerates out of the lift, slows as it settles upright
    const a = smoothstep(9, 13, f);
    return (f - 9) * 1.15 * (0.4 + 0.6 * a) - 0.4 * Math.max(0, f - 22) * Math.max(0, f - 22) * 0.12;
  };

  // ---- down smash: split kicks --------------------------------------------------------------
  // kneeling leg: thigh down, shin flat on the floor behind
  const DS_GATHER = {
    hx: 1, hh: 30, bx: NEUT.bx + 5, bh: 0, fx: NEUT.fx - 3, fh: 0,
    lean: 18, head: -10, ra1: 40, ra2: 62, sa: 100, gw: 1, gd: -14, wing: 0.9, cloak: 0.5,
  };
  const DS_FRONT = {
    ll1: 6, ll2: -104, rl1: 80, rl2: -4,
    lean: -22, head: 14, ra1: 132, ra2: 12, sa: 148, la1: -12, la2: 6, handB: 1, wing: 1.8, cloak: 1.1,
  };
  const DS_BACK = {
    ll1: -82, ll2: 4, rl1: -4, rl2: -102,
    lean: 34, head: -20, ra1: 64, ra2: 16, sa: 112, la1: -6, la2: 4, handB: 1, wing: 1.8, cloak: 0.9,
  };
  const dsmashK = keyed([
    [0, {}],
    [4, Object.assign({}, DS_GATHER, { hh: 33, lean: 12, gw: 0.8 }), 'inOut'],
    [7, DS_GATHER, 'out'],
    [9, fromAngles({ ll1: 14, ll2: -112, rl1: 48, rl2: -126, lean: 0, head: 0, ra1: 104, ra2: 22, sa: 156, la1: -20, la2: 20, handB: 1, wing: 1.1, cloak: 0.8 }), 'in'],
    [11, fromAngles(DS_FRONT), 'out'],
    [13, fromAngles(Object.assign({}, DS_FRONT, { rl1: 82, wing: 1.3 }))],
    [15.5, fromAngles({ ll1: -14, ll2: -96, rl1: 30, rl2: -110, lean: 16, head: -8, ra1: 90, ra2: 18, sa: 134, la1: -4, la2: 16, handB: 1, wing: 1, cloak: 1 }), 'inOut'],
    [17, fromAngles(DS_BACK), 'out'],
    [19.5, fromAngles(Object.assign({}, DS_BACK, { ll1: -84, wing: 1.3 }))],
    [23, fromAngles({ ll1: -46, ll2: -84, rl1: 0, rl2: -104, lean: 24, head: -14, ra1: 64, ra2: 32, sa: 128, la1: -4, la2: 20, handB: 1, wing: 0.9, cloak: 0.8 })],
    [27, { hx: 0, hh: 22, bx: -30, bh: 7, fx: -16, fh: 0, lean: 20, head: -10, ra1: 56, ra2: 44, sa: 146, la1: -10, la2: 30, handB: 1, wing: 0.8, cloak: 0.7 }],
    [31, { hx: 0, hh: 30, bx: NEUT.bx + 4, bh: 0, fx: -4, fh: 5, lean: 15, head: -7, ra1: 40, ra2: 54, sa: 164, la1: -10, la2: 40, wing: 0.6, cloak: 0.55 }],
    [35, { hx: 1, hh: 33, bx: NEUT.bx + 4, bh: 0, fx: NEUT.fx - 2, fh: 0, lean: 12, head: -5, ra1: 32, ra2: 58, sa: 174, la1: -12, la2: 36, wing: 0.5, cloak: 0.45 }],
    [46, {}],
  ]);

  defineAnims('hermes', [
    {
      name: 'fsmash',
      label: "Herald's Strike",
      group: 'Smash attacks',
      input: 'Smash forward (Strong + forward)',
      notes: 'Draws the caduceus back in both hands, then lunges into a two-handed thrust as its wings and snakes flare open in a blast of wind.',
      frames: 52,
      charge: { f: 10 },
      hit: [
        { f: [15, 17], at: 'tip', off: [8, 0], r: 11, dmg: 16, kb: 9, ang: 35 },
        { f: [15, 17], at: 'mid', off: [6, 0], r: 9, dmg: 16, kb: 9, ang: 35 },
      ],
      pose(f, c) {
        const p = tremble(fsmashK(f), f, c, 10);
        p.wing += settle(f, 15, 0.35, 5, 4);
        p.cloak += settle(f, 18, 0.15, 7, 5);
        return fin(p);
      },
      fxBack(g, f, c) {
        const J = c.J;
        if (f >= 12.5 && f <= 18) {
          const back = c.sample(12);
          streak(g, c.ink, [back.handF[0] - 16 * J.k, back.handF[1]], [J.tip[0] + 4 * J.k, J.tip[1]], 12 * J.k, f <= 16 ? 0.95 : 0.95 * (1 - (f - 16) / 2));
        }
      },
      fx(g, f, c) {
        const J = c.J;
        const k = J.k;
        // charge: wind gathering at the knob, glow lines along the staff
        const hw = holdW(f, c, 10);
        if (hw > 0) {
          gather(g, c.ink, J.tip[0], J.tip[1], 26 * k, c.time || 0, hw);
          glowLines(g, c.ink, J.handF, J.tip, 7 * k, c.time || 0, hw);
        }
        // the strike: wings and snakes flare, wind bursts ahead
        const fl = f < 14 ? 0 : f < 16 ? EASE.out((f - 14) / 2) : f < 22 ? 1 : 1 - EASE.inOut(clamp((f - 22) / 6, 0, 1));
        wingFlare(g, c, J, fl);
        snakeLunge(g, c, J, fl, f < 24 ? clamp((f - 14.5) / 1.5, 0, 1) : 0.2, 1.6);
        if (f >= 15) {
          const t = (f - 15) / 14;
          const tp = c.sample(15).tip;
          gustArcs(g, c.ink, tp[0] + 20 * k, tp[1], 24 * k, t, [1, 0], 1);
          if (t < 1) fxGust(g, c.ink, tp[0] + (26 + 40 * t) * k, tp[1], (14 + 16 * t) * k, f * 0.5, 0.85 * (1 - t));
          if (t < 0.7) fxSpeedLines(g, c.ink, [tp[0] + 70 * k, tp[1]], [1, 0], 60 * k, 40 * k, 7, 0.8 * (1 - t / 0.7), c.rnd);
          if (f <= 19) fxSpark(g, c.ink, tp[0] + 30 * k, tp[1], 16 * k, (f - 15) / 4, 0.9);
        }
        // planted back foot scuffs as the weight drives forward
        if (f >= 12 && f <= 24) {
          const fb = c.sample(15).footB;
          dust(g, c, fb[0] - 4 * k, (f - 12) / 12, 10 * k, -1, 0.8);
          scuff(g, c.ink, fb[0] + 6 * k, 16 * k, 3, 1 - (f - 12) / 12);
        }
      },
    },
    {
      name: 'usmash',
      label: 'Whirlwind Rotor',
      group: 'Smash attacks',
      input: 'Smash up (Strong + up)',
      notes: 'Springs up and whirls the caduceus overhead like a rotor, raising a whirlwind column that carries foes up before a final burst.',
      frames: 50,
      charge: { f: 8 },
      hit: [
        { f: [12, 14], at: 'handF', off: [6, -4], r: 22, dmg: 3, kb: 2, ang: 95 },
        { f: [12, 14], at: 'top', off: [14, 2], r: 14, dmg: 3, kb: 2, ang: 95 },
        { f: [16, 18], at: 'handF', off: [6, -4], r: 22, dmg: 3, kb: 2, ang: 95 },
        { f: [16, 18], at: 'top', off: [14, 2], r: 14, dmg: 3, kb: 2, ang: 95 },
        { f: [20, 23], at: 'handF', off: [6, -6], r: 25, dmg: 8, kb: 8, ang: 90 },
        { f: [20, 23], at: 'top', off: [14, 0], r: 16, dmg: 8, kb: 8, ang: 90 },
      ],
      pose(f, c) {
        const p = tremble(usmashK(f), f, c, 8);
        // the real staff is hidden while the rotor (drawn in fx) spins
        p.wpnShow = rotorOn(f) > 0.5 ? 0 : 1;
        p.wing += 0.3 * Math.sin(f * 1.9) * win(f, 11, 13, 22, 26) + settle(f, 27, 0.25, 5, 4);
        p.cloak += 0.15 * Math.sin(f * 1.3) * win(f, 11, 13, 22, 26) + settle(f, 27, 0.12, 7, 5);
        return fin(p);
      },
      fxBack(g, f, c) {
        const J = c.J;
        const hw = holdW(f, c, 8);
        if (hw > 0) gather(g, c.ink, J.hip[0], -22 * J.k, 34 * J.k, c.time || 0, hw);
        column(g, c, f, J, false);
        if (rotorOn(f) > 0.5) rotor(g, c, f, J, false);
      },
      fx(g, f, c) {
        const J = c.J;
        const hw = holdW(f, c, 8);
        if (hw > 0) glowLines(g, c.ink, J.butt, J.tip, 6 * J.k, c.time || 0, hw);
        column(g, c, f, J, true);
        if (rotorOn(f) > 0.5) rotor(g, c, f, J, true);
        // final burst off the raised staff
        if (f >= 24 && f <= 34) {
          const t = (f - 24) / 10;
          fxSpark(g, c.ink, J.tip[0], J.tip[1] - 6 * J.k, 18 * J.k, t, 0.9);
          gustArcs(g, c.ink, J.tip[0], J.tip[1] - 4 * J.k, 20 * J.k, t, [0, -1], 0.9);
        }
        if (f >= 9 && f <= 20) dust(g, c, J.footF[0] + 6 * J.k, (f - 9) / 11, 10 * J.k, 1, 0.9);
        if (f >= 9 && f <= 20) dust(g, c, J.footB[0] - 6 * J.k, (f - 10) / 10, 9 * J.k, -1, 0.8);
      },
    },
    {
      name: 'dsmash',
      label: 'Split Talaria',
      group: 'Smash attacks',
      input: 'Smash down (Strong + down)',
      notes: 'Drops into a low split and slices the floor in front, then behind, with the winged sandals while the caduceus is held high for balance.',
      frames: 46,
      charge: { f: 7 },
      hit: [
        { f: [11, 13], at: 'footF', off: [3, -2], r: 10, dmg: 12, kb: 7, ang: 20 },
        { f: [11, 13], at: 'kneeF', off: [4, 0], r: 7, dmg: 12, kb: 7, ang: 20 },
        { f: [17, 19], at: 'footB', off: [-3, -2], r: 10, dmg: 13, kb: 8, ang: 160 },
        { f: [17, 19], at: 'kneeB', off: [-4, 0], r: 7, dmg: 13, kb: 8, ang: 160 },
      ],
      pose(f, c) {
        const p = tremble(dsmashK(f), f, c, 7);
        p.wing += 0.3 * Math.sin(f * 2.1) * win(f, 10, 11, 19, 22) + settle(f, 22, 0.25, 5, 4);
        p.cloak += settle(f, 20, 0.15, 7, 5);
        return fin(p);
      },
      fxBack(g, f, c) {
        const J = c.J;
        const hw = holdW(f, c, 7);
        if (hw > 0) gather(g, c.ink, J.hip[0], -26 * J.k, 40 * J.k, c.time || 0, hw);
      },
      fx(g, f, c) {
        const J = c.J;
        const k = J.k;
        const hw = holdW(f, c, 7);
        if (hw > 0) glowLines(g, c.ink, J.butt, J.tip, 6 * k, c.time || 0, hw);
        // heel-wing slices: smears trailing each kicking foot
        if (f >= 9.5 && f <= 14) fxCrescent(g, c.ink, trailOf(c, ['footF', 'kneeF'], 2.5, 0.25), f <= 13 ? 0.9 : 0.9 * (14 - f));
        if (f >= 16 && f <= 20) fxCrescent(g, c.ink, trailOf(c, ['footB', 'kneeB'], 2, 0.25), f <= 19 ? 0.9 : 0.9 * (20 - f));
        if (f >= 11) {
          const ff = c.sample(12).footF;
          dust(g, c, ff[0] + 6 * k, (f - 11) / 12, 11 * k, 1, 0.95);
          scuff(g, c.ink, ff[0], 26 * k, 3, 1 - (f - 11) / 10);
          if (f <= 15) fxSpark(g, c.ink, ff[0] + 10 * k, ff[1] - 4 * k, 12 * k, (f - 11) / 4, 0.8);
        }
        if (f >= 17) {
          const fb = c.sample(18).footB;
          dust(g, c, fb[0] - 6 * k, (f - 17) / 12, 11 * k, -1, 0.95);
          scuff(g, c.ink, fb[0] + 20 * k, 26 * k, 3, 1 - (f - 17) / 10);
          if (f <= 21) fxSpark(g, c.ink, fb[0] - 10 * k, fb[1] - 4 * k, 12 * k, (f - 17) / 4, 0.8);
        }
      },
    },
  ]);

  // ---- up smash rotor and whirlwind column -------------------------------------------------------
  // The caduceus spun flat overhead, seen from the side: its projected length swings
  // through the full rod while the near half passes in front of the figure.
  function rotor(g, c, f, J, front) {
    const k = J.k;
    const th = rotorPhase(f);
    const h = J.handF;
    const tilt = 0.24;
    const end = (L, s) => [h[0] + Math.cos(th) * L * s * k, h[1] - 6 * k + Math.sin(th) * L * s * k * tilt];
    const near = Math.sin(th) > 0; // tip half toward the viewer
    const P = inkPatterns(g, c.ink);
    // blur disc behind the spinning rod (drawn once, behind)
    if (!front) {
      g.save();
      g.globalAlpha *= 0.85 * rotorOn(f);
      g.strokeStyle = c.ink;
      for (let i = 0; i < 4; i++) {
        const R = (46 - i * 9) * k;
        g.lineWidth = i ? 0.7 : 1.3;
        g.beginPath();
        g.ellipse(h[0], h[1] - 6 * k, R, R * tilt, 0, th - 2.4, th - 0.15);
        g.stroke();
      }
      g.beginPath();
      g.ellipse(h[0], h[1] - 6 * k, 46 * k, 46 * k * tilt, 0, th - 1.6, th);
      g.ellipse(h[0], h[1] - 6 * k, 20 * k, 20 * k * tilt, 0, th, th - 1.6, true);
      g.closePath();
      g.fillStyle = rgba(PAPER_LIGHT, 0.6);
      g.fill();
      g.fillStyle = P.hatch;
      g.fill();
      g.restore();
    }
    const drawHalf = (L, s, knob) => {
      const a = [h[0], h[1] - 6 * k];
      const b = end(L, s);
      g.beginPath();
      capsulePath(g, a[0], a[1], b[0], b[1], 1.8 * k, 1.4 * k);
      engraveFill(g, c.ink, { pat: 'dense', patAlpha: 0.8, lw: LW.form });
      if (knob) {
        // snakes coiled near the knob as a twisted band, wings as small fans
        const m = end(L * 0.62, s);
        g.save();
        g.strokeStyle = c.ink;
        g.lineWidth = 1;
        for (const sd of [1, -1]) {
          g.beginPath();
          for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            const px = lerp(a[0], b[0], 0.15 + 0.7 * t);
            const py = lerp(a[1], b[1], 0.15 + 0.7 * t) + sd * Math.sin(t * Math.PI * 3) * 2.6 * k;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.stroke();
        }
        g.restore();
        const wa = Math.cos(th) > 0 ? 200 : 160;
        featherFan(g, c.ink, m[0], m[1], wa, 40, 3, 6 * k, 11 * k, 2 * k, 0.9);
        g.beginPath();
        g.arc(b[0], b[1], 3.2 * k, 0, Math.PI * 2);
        engraveFill(g, c.ink, { pat: 'cross', patAlpha: 0.8, lw: LW.form });
      }
    };
    // the tip half is near when sin > 0, the butt half then is far, and vice versa
    if (front === near) drawHalf(46, 1, true);
    if (front !== near) drawHalf(26, -1, false);
  }
  function column(g, c, f, J, front) {
    if (f < 9 || f > 36) return;
    const k = J.k;
    const a = win(f, 9, 13, 26, 36);
    if (a <= 0.01) return;
    const top = J.handF[1] - 10 * k;
    const cx = J.hip[0] + 4 * k;
    const n = 7;
    g.save();
    g.strokeStyle = c.ink;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      // rings rise through the column and widen with height
      const u = ((i / n + (f - 9) * 0.045) % 1);
      const y = lerp(-4 * k, top, u);
      const R = (18 + 30 * u) * k * (0.7 + 0.3 * a);
      const ry = R * 0.2;
      const ph = f * 0.7 + i * 1.3;
      g.globalAlpha = a * (0.25 + 0.6 * Math.sin(u * Math.PI));
      g.lineWidth = 0.8 + 0.8 * Math.sin(u * Math.PI);
      g.beginPath();
      if (front) g.ellipse(cx, y, R, ry, 0, 0.15 + (ph % 0.6), Math.PI - 0.15);
      else g.ellipse(cx, y, R, ry, 0, Math.PI + 0.2, Math.PI * 2 - 0.2 - (ph % 0.6));
      g.stroke();
    }
    // a few rising wind strands at the column edges
    if (front) {
      g.globalAlpha = a * 0.7;
      g.lineWidth = 1;
      for (const s of [-1, 1]) {
        g.beginPath();
        for (let i = 0; i <= 16; i++) {
          const t = i / 16;
          const y = lerp(-2 * k, top, t);
          const R = (20 + 30 * t) * k;
          const x = cx + s * R * (0.9 + 0.1 * Math.sin(t * 9 + f * 0.8));
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    g.restore();
  }
})();
