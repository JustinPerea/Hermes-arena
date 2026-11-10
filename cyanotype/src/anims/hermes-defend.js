// Hermes — shield and dodge: wind sphere, rolls, spot dodge, air dodge, dizzy.
(() => {
  // ---- placement solver ------------------------------------------------------
  // Keys carry extra channels (all in figure units, feet-space coordinates) that pin
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
  const crouch = (dy, extra) => Object.assign(standAt(0), { py: J0.hip[1] + dy }, extra || {});

  // ---- key poses -------------------------------------------------------------------
  // guard: knees bent, forearm raised with the caduceus upright, back fist at the chest
  const GUARD = { ...crouch(9), lean: 12, head: 6, ra1: 50, ra2: 88, wpn: -6, la1: 40, la2: 96, wing: 0.75, cloak: 0.8, handB: 0 };
  const FALL = { air: 1, lean: 0, ll1: -8, ll2: -24, rl1: 24, rl2: -38, la1: 100, la2: 24, ra1: 50, ra2: 40, wpn: 140, wing: 0.8, cloak: 0.7 };

  // ---- the wind sphere ----------------------------------------------------------------
  // centre and radius of the barrier for the current frame
  function sphere(c, grow) {
    const J = c.J;
    const hp = c.shield == null ? 1 : clamp(c.shield, 0, 1);
    const R = 60 * J.k * (0.5 + 0.5 * hp) * (grow == null ? 1 : grow);
    return { x: lerp(J.hip[0], J.head[0], 0.45) + 3 * J.k, y: lerp(J.hip[1], J.head[1], 0.45) - 2 * J.k, R, k: J.k };
  }
  // point on a tilted orbit around the sphere; z > 0 is in front of the body
  const orbit = (s, th, tilt, flat, rr) => {
    const x = Math.cos(th) * s.R * rr;
    const y = Math.sin(th) * s.R * rr * flat;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    return { x: s.x + x * ct - y * st, y: s.y + x * st + y * ct, z: Math.sin(th) };
  };
  // wind streaks on two crossing bands, half drawn behind the body, half in front
  function gustBands(g, ink, s, ph, front, alpha) {
    g.save();
    g.strokeStyle = ink;
    g.lineCap = 'round';
    const bands = [[-0.35, 0.34, 1, 3], [0.6, 0.26, -1, 2]];
    for (const [tilt, flat, dir, n] of bands) {
      for (let i = 0; i < n; i++) {
        const t0 = dir * ph + (i / n) * Math.PI * 2;
        for (let w = 0; w < 3; w++) {
          const rr = 0.96 - w * 0.045;
          const L = 1.7 - w * 0.35;
          g.beginPath();
          let drawn = false;
          for (let j = 0; j <= 16; j++) {
            const th = t0 + (j / 16) * L * dir;
            const p = orbit(s, th, tilt, flat, rr);
            const show = front ? p.z >= 0 : p.z < 0;
            if (!show) { drawn = false; continue; }
            if (!drawn) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
            drawn = true;
          }
          g.globalAlpha = alpha * (front ? 0.7 : 0.45);
          g.lineWidth = (1.7 - w * 0.45) * s.k * 0.8;
          g.stroke();
        }
      }
    }
    g.restore();
  }
  // feathers riding the wind around the sphere
  function orbitFeathers(g, ink, s, ph, front, alpha, spread) {
    for (let i = 0; i < 4; i++) {
      const th = ph * 1.0 + (i / 4) * Math.PI * 2 + 0.4;
      const p = orbit(s, th, i % 2 ? 0.6 : -0.35, i % 2 ? 0.26 : 0.34, (0.9 + 0.05 * (i % 2)) * (spread || 1));
      if ((p.z >= 0) !== front) continue;
      const q = orbit(s, th + 0.15, i % 2 ? 0.6 : -0.35, i % 2 ? 0.26 : 0.34, 0.9 * (spread || 1));
      const ang = Math.atan2(q.x - p.x, q.y - p.y) / D2R;
      fxFeather(g, ink, p.x, p.y, ang + 180, (11 + 2 * (i % 2)) * s.k, alpha * (front ? 1 : 0.55));
    }
  }
  // the bubble itself: faint paper body behind, engraved rim and shading in front
  function bubbleBack(g, ink, s, alpha) {
    g.save();
    g.globalAlpha *= alpha;
    g.beginPath();
    g.arc(s.x, s.y, s.R, 0, Math.PI * 2);
    g.fillStyle = rgba(PAPER_LIGHT, 0.55);
    g.fill();
    g.clip();
    // shadowed crescent on the lower right (light comes from the upper left)
    g.beginPath();
    g.arc(s.x, s.y, s.R, 0, Math.PI * 2);
    g.arc(s.x - s.R * 0.22, s.y - s.R * 0.2, s.R * 0.95, 0, Math.PI * 2, true);
    g.globalAlpha *= 0.5;
    g.fillStyle = inkPatterns(g, ink).fine;
    g.fill();
    g.restore();
  }
  function bubbleFront(g, ink, s, alpha, wob) {
    const P = inkPatterns(g, ink);
    const rim = (r) => {
      g.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const rr = r * (1 + (wob ? wob(a) : 0));
        const x = s.x + Math.cos(a) * rr;
        const y = s.y + Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
    };
    g.save();
    g.globalAlpha *= alpha;
    // crescent hatching: curved engraved strokes inside the shadow side
    g.save();
    rim(s.R);
    g.clip();
    g.strokeStyle = ink;
    for (let i = 0; i < 6; i++) {
      const r = s.R * (0.98 - i * 0.045);
      g.lineWidth = (0.9 - i * 0.1) * s.k * 0.7;
      g.globalAlpha = alpha * (0.7 - i * 0.09);
      g.beginPath();
      g.arc(s.x - i * 0.6 * s.k, s.y - i * 0.6 * s.k, r, -0.15, Math.PI * 0.75);
      g.stroke();
    }
    g.restore();
    // rim: heavy outer line, fine inner line, broken by a highlight at the upper left
    g.strokeStyle = ink;
    g.lineWidth = 1.7 * s.k * 0.75;
    rim(s.R);
    g.stroke();
    g.lineWidth = 0.7 * s.k * 0.75;
    g.beginPath();
    g.arc(s.x, s.y, s.R * 0.93, Math.PI * 0.1, Math.PI * 1.05);
    g.stroke();
    g.strokeStyle = PAPER_LIGHT;
    g.lineWidth = 3 * s.k * 0.75;
    g.beginPath();
    g.arc(s.x, s.y, s.R, Math.PI * 1.12, Math.PI * 1.38);
    g.stroke();
    g.strokeStyle = ink;
    g.lineWidth = 0.8 * s.k * 0.75;
    g.beginPath();
    g.arc(s.x, s.y, s.R * 0.8, Math.PI * 1.15, Math.PI * 1.35);
    g.stroke();
    void P;
    g.restore();
  }
  function drawShieldBack(g, c, s, ph, alpha) {
    bubbleBack(g, c.ink, s, alpha);
    gustBands(g, c.ink, s, ph, false, alpha);
    orbitFeathers(g, c.ink, s, ph, false, alpha);
  }
  function drawShieldFront(g, c, s, ph, alpha, wob) {
    bubbleFront(g, c.ink, s, alpha, wob);
    gustBands(g, c.ink, s, ph, true, alpha);
    orbitFeathers(g, c.ink, s, ph, true, alpha);
  }

  // a faint copy of the figure (afterimage) at an offset, drawn in local feet space
  function ghost(g, c, pose, dx, alpha) {
    const p = Object.assign({}, pose, { fade: 0, ox: (pose.ox || 0) + dx / c.k });
    c.drawFigure(g, p, 0, 0, { face: 1, ink: c.ink, scale: c.k, time: c.time, alpha });
  }

  // kicked-up dust at floor x: a few engraved puffs drifting along dir, plus skid lines
  function kick(g, ink, x, t, dir, k) {
    if (t <= 0 || t >= 1) return;
    const P = inkPatterns(g, ink);
    const u = EASE.out(t);
    g.save();
    g.globalAlpha *= (1 - t) * 0.9;
    g.strokeStyle = ink;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // one low billowing cloud: three bumps along dir, flat on the floor
    const x0 = x + dir * (2 + u * 8) * k;
    const bumps = [[0, 3 + u * 3], [6 + u * 6, 4 + u * 4], [13 + u * 11, 2.6 + u * 3.4]];
    g.beginPath();
    g.moveTo(x0 - dir * 3 * k, 0);
    for (const [d, r] of bumps) {
      const cx = x0 + dir * d * k;
      const rr = r * k;
      g.arc(cx, -rr * 0.7, rr, dir > 0 ? Math.PI * 0.95 : Math.PI * 0.05, dir > 0 ? Math.PI * 2.05 : -Math.PI * 1.05, dir < 0);
    }
    g.lineTo(x0 + dir * (bumps[2][0] + bumps[2][1] + 1) * k, 0);
    g.closePath();
    g.fillStyle = rgba(PAPER_LIGHT, 0.85);
    g.fill();
    g.fillStyle = P.fine;
    g.fill();
    g.lineWidth = 0.8 * k;
    g.stroke();
    g.lineWidth = 0.55 * k;
    for (let i = 0; i < 2; i++) line(g, x - dir * (2 + i * 4) * k, -(0.5 + i * 1.6) * k, x + dir * (10 + u * 16 + i * 5) * k, -(0.5 + i * 1.6) * k);
    g.restore();
  }
  // a flat whirl of wind around the body (spot dodge): the far half behind, the near half in front
  function windRing(g, ink, cx, cy, rx, ry, ph, front, alpha) {
    if (alpha <= 0) return;
    g.save();
    g.strokeStyle = ink;
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a0 = ph + (i / 4) * Math.PI * 2;
      for (let w = 0; w < 2; w++) {
        g.beginPath();
        let on = false;
        for (let j = 0; j <= 14; j++) {
          const a = a0 + (j / 14) * 1.5;
          const z = Math.sin(a);
          if ((z >= 0) !== front) { on = false; continue; }
          const x = cx + Math.cos(a) * rx * (1 - w * 0.08);
          const y = cy + z * ry * (1 - w * 0.08) - (i % 2 ? 6 : 0) * (ry / 10);
          if (!on) g.moveTo(x, y); else g.lineTo(x, y);
          on = true;
        }
        g.globalAlpha = alpha * (front ? 0.75 : 0.4);
        g.lineWidth = (w ? 0.6 : 1.3) * (rx / 40);
        g.stroke();
      }
    }
    g.restore();
  }

  // a tiny engraved star
  function star(g, ink, x, y, r, rot, alpha) {
    g.save();
    g.globalAlpha *= alpha;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + (i / 10) * Math.PI * 2;
      const rr = i % 2 ? r * 0.42 : r;
      if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    engraveFill(g, ink, { pat: 'hatch', patAlpha: 0.7, lw: 1 });
    g.restore();
  }

  // a great wing wrapped around him: feathers rooted along an arc over the head that
  // curls down his side (front = near wing, in front of the body), tips overlapping into a shell
  function cocoon(g, c, f, a, front) {
    const J = c.J;
    const k = J.k;
    const cx = J.center[0] + 2 * k;
    const cy = J.center[1] - 2 * k;
    const R = 40 * k;
    const n = 8;
    const sd = front ? 1 : -1; // near wing sweeps down the front, far wing down the back
    const reach = lerp(0.25, 1, a); // how far the wing has closed
    const flutter = 0.04 * Math.sin(f * 0.9 + (front ? 0 : 1.7));
    g.save();
    g.globalAlpha *= (front ? 0.82 : 0.95) * clamp(a * 1.4, 0, 1);
    for (let i = n - 1; i >= 0; i--) {
      const t = i / (n - 1);
      // arc angle measured from straight up, sweeping to the side
      const th = (0.08 + t * (front ? 1.8 : 1.55) * reach + flutter) * sd;
      const rr = R * (1.05 + 0.1 * t);
      const x = cx + Math.sin(th) * rr * 0.78;
      const y = cy - Math.cos(th) * rr;
      // feather points along the wrap (tangent), drooping more toward the bottom
      const tx = Math.cos(th) * sd * 0.78;
      const ty = Math.sin(th) * sd;
      const ang = Math.atan2(tx, ty) / D2R;
      const droop = ang + sd * (front ? -12 - 26 * t : -18 + 10 * t);
      g.beginPath();
      featherPath(g, x, y, droop, (30 + 12 * t) * k, (10 + 2 * t) * k);
      engraveFill(g, c.ink, { pat: front ? 'fine' : 'hatch', patAlpha: 0.65, lw: 1.1 });
      const [dx, dy] = dirv(droop);
      g.strokeStyle = c.ink;
      g.lineWidth = 0.6;
      line(g, x, y, x + dx * (24 + 10 * t) * k, y + dy * (24 + 10 * t) * k);
    }
    // the covert line over the roots: a heavy engraved shoulder of the wing
    g.beginPath();
    for (let j = 0; j <= 16; j++) {
      const th = (0.04 + (j / 16) * (front ? 1.85 : 1.6) * reach) * sd;
      const x = cx + Math.sin(th) * R * 0.98 * 0.78;
      const y = cy - Math.cos(th) * R * 0.98;
      if (j === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = deepInk(c.ink);
    g.lineWidth = 2 * k * 0.75;
    g.stroke();
    g.restore();
  }

  // ---- tracks -----------------------------------------------------------------------
  const STAND = standAt(0);
  const shieldUpK = track([
    [0, { ...STAND }],
    [4, { ...GUARD }, 'out'],
  ]);
  const shieldDropK = track([
    [0, { ...GUARD }],
    [2, { ...GUARD, ra1: 70, ra2: 70, la1: 20, la2: 70, wing: 1, cloak: 1 }, 'out'],
    [7, { ...STAND }, 'inOut'],
  ]);
  const spotK = track([
    [0, { ...STAND }],
    // snap: hips drop and slip back, arms whip in, body twists away behind the staff
    [2, { ...crouch(7, { px: -2 }), lean: -4, head: -6, ra1: 10, ra2: 110, wpn: 40, la1: -20, la2: 90, wing: 1.1, cloak: 1, fade: 0.2 }, 'out'],
    [4, { ...crouch(13, { px: -5 }), lean: -16, head: -16, ra1: -8, ra2: 132, wpn: 42, la1: -34, la2: 124, wing: 1.5, cloak: 1.5, fade: 0.55 }, 'out'],
    // hold the slip while the blur carries the dodge
    [12, { ...crouch(12, { px: -4 }), lean: -12, head: -12, ra1: -4, ra2: 128, wpn: 40, la1: -30, la2: 118, wing: 1.2, cloak: 1.3, fade: 0.55 }, 'inOut'],
    // unwind back to the stance
    [17, { ...crouch(5, { px: -1 }), lean: 2, head: -2, ra1: 18, ra2: 80, wpn: 80, la1: -18, la2: 50, wing: 0.8, cloak: 0.7, fade: 0.1 }, 'inOut'],
    [22, { ...STAND }, 'inOut'],
  ]);
  // rolls: a low handspring through the hands, resting on the floor; the game moves him with vx
  const GA = { air: 1, wG: 1, gAll: 1 };
  const rollFK = track([
    [0, { ...STAND }],
    // dip and reach: arms and staff thrown forward and down
    [3, { ...crouch(14), lean: 38, head: 8, ra1: 30, ra2: 14, wpn: 70, la1: 24, la2: 14, wing: 0.9, cloak: 1, handB: 1 }, 'in'],
    // hands planted, back leg whipping up
    [7, { ...GA, rot: 84, lean: 10, head: -10, ra1: 104, ra2: 4, wpn: 92, la1: 96, la2: 6, ll1: -70, ll2: -20, rl1: 30, rl2: -80, wing: 1.3, cloak: 0.6, handB: 1, fade: 0.3 }, 'out'],
    // over the top in a split
    [11, { ...GA, hop: 5, rot: 190, lean: -6, head: -16, ra1: 176, ra2: 4, wpn: 90, la1: 170, la2: 6, ll1: -58, ll2: -14, rl1: 52, rl2: -20, wing: 1.4, cloak: 0.4, handB: 1, fade: 0.3 }, 'inOut'],
    // snapping down onto the feet
    [14, { ...GA, hop: 22, rot: 290, lean: 10, head: -8, ra1: 150, ra2: 20, wpn: 60, la1: 160, la2: 20, ll1: 40, ll2: -60, rl1: 70, rl2: -70, wing: 1.2, cloak: 0.7, handB: 1, fade: 0.3 }, 'inOut'],
    [19, { ...crouch(16), lean: 14, head: 0, ra1: 70, ra2: 40, wpn: 40, la1: -40, la2: 30, wing: 1, cloak: 1, rot: 360, fade: 0.05, handB: 1 }, 'out'],
    [30, { ...STAND, rot: 360 }, 'inOut'],
  ]);
  const rollBK = track([
    [0, { ...STAND }],
    // sit back, arms swing up
    [3, { ...crouch(16), lean: -2, head: -6, ra1: 150, ra2: 20, wpn: 40, la1: 140, la2: 20, wing: 0.9, cloak: 1, handB: 1 }, 'in'],
    // arch back onto the hands
    [7, { ...GA, hop: 32, rot: -90, lean: -20, head: -24, ra1: 200, ra2: 6, wpn: 90, la1: 196, la2: 6, ll1: 30, ll2: -60, rl1: 50, rl2: -70, wing: 1.3, cloak: 0.6, handB: 1, fade: 0.3 }, 'out'],
    [11, { ...GA, hop: 5, rot: -185, lean: -6, head: -16, ra1: 178, ra2: 4, wpn: 90, la1: 172, la2: 6, ll1: -40, ll2: -20, rl1: 46, rl2: -16, wing: 1.4, cloak: 0.4, handB: 1, fade: 0.3 }, 'inOut'],
    // snap down: legs whip under
    [14, { ...GA, hop: 20, rot: -280, lean: 16, head: 6, ra1: 160, ra2: 20, wpn: 60, la1: 150, la2: 20, ll1: -20, ll2: -60, rl1: 10, rl2: -70, wing: 1.2, cloak: 0.7, handB: 1, fade: 0.3 }, 'inOut'],
    [19, { ...crouch(16), lean: 20, head: 4, ra1: 60, ra2: 50, wpn: 20, la1: 40, la2: 40, wing: 1, cloak: 1, rot: -360, fade: 0.05 }, 'out'],
    [30, { ...STAND, rot: -360 }, 'inOut'],
  ]);
  // nothing (feet, hands, head, cloak hem) may sink below the floor line during the rolls
  const noSink = (p) => {
    const P1 = Object.assign({}, BASE_POSE, p);
    const FR = hermesFrame(P1, SH1);
    let low = -1e9;
    for (const k in RAD) low = Math.max(low, FR.J[k][1] + (k === 'footF' || k === 'footB' ? 3 + Math.min(6, Math.abs(P1.rot || 0) * 0.25) : RAD[k] * 0.6));
    for (const h of cloakGeometry(FR.sk, SH1, P1, {}).hem) low = Math.max(low, FR.toLocal(h)[1] - 6); // soft cloth may brush the floor
    if (low > 0.01) p.oy = (p.oy || 0) - low;
    return p;
  };
  // keep the caduceus level (world angle wa) while the body flips, so it never stabs the floor
  const levelStaff = (p, f, wa) => {
    const w = smoothstep(3, 5, f) * (1 - smoothstep(13.5, 16.5, f));
    if (w <= 0) return p;
    const want = wa + p.rot - (p.ra1 + p.ra2 + p.lean); // rot turns clockwise: world angle = body angle - rot
    const d = ((((want - p.wpn) % 360) + 540) % 360) - 180;
    p.wpn += d * w;
    return p;
  };
  const WRAP = { air: 1, lean: 20, head: 12, ll1: 56, ll2: -112, rl1: 70, rl2: -124, ra1: 30, ra2: 118, wpn: 20, la1: 46, la2: 104, wing: 1.5, cloak: 1.5, fade: 0.55 };
  const airK = track([
    [0, { ...FALL }],
    [3, { ...WRAP }, 'out'],
    [12, { ...WRAP, lean: 16, head: 10, fade: 0.6 }, 'inOut'],
    [20, { ...WRAP, lean: 22, fade: 0.5 }, 'inOut'],
    // burst open
    [24, { air: 1, lean: -6, head: -10, ll1: -14, ll2: -20, rl1: 30, rl2: -40, ra1: 120, ra2: 20, wpn: 60, la1: -70, la2: 20, wing: 1.4, cloak: 1.4, fade: 0, handB: 1 }, 'out'],
    [32, { ...FALL }, 'inOut'],
  ]);

  // ---- definitions --------------------------------------------------------------------
  defineAnims('hermes', [
    {
      name: 'shield_up',
      label: 'Shield up',
      group: 'Shield and dodge',
      input: 'Press shield',
      notes: 'Drops into a guard and whips the wind into a sphere around himself.',
      frames: 4,
      pose: (f) => shieldUpK(f),
      fxBack(g, f, c) {
        const t = EASE.out(clamp(f / 4, 0, 1));
        drawShieldBack(g, c, sphere(c, 0.45 + 0.55 * t), -1.2 + t * 1.2, 0.35 + 0.65 * t);
      },
      fx(g, f, c) {
        const t = EASE.out(clamp(f / 4, 0, 1));
        const s = sphere(c, 0.45 + 0.55 * t);
        drawShieldFront(g, c, s, -1.2 + t * 1.2, 0.35 + 0.65 * t);
        fxGust(g, c.ink, s.x, s.y, s.R * (1.2 - 0.4 * t), t * 3, 0.6 * (1 - t));
      },
      next: 'shield',
    },
    {
      name: 'shield',
      label: 'Shield',
      group: 'Shield and dodge',
      input: 'Hold shield',
      notes: 'Holds his guard inside a whirling sphere of wind with feathers riding the gust.',
      frames: 60,
      loop: true,
      pose(f) {
        const a = PH(f, 60);
        const p = shieldUpK(4);
        p.lean += 1.2 * Math.sin(a * 2);
        p.head += 1.5 * Math.sin(a * 2 - 0.6);
        p.ra1 += 1.5 * Math.sin(a * 2 - 0.3);
        p.wing = 0.75 + 0.3 * Math.sin(a * 6);
        p.cloak = 0.8 + 0.15 * Math.sin(a * 3);
        return p;
      },
      fxBack(g, f, c) {
        drawShieldBack(g, c, sphere(c), PH(f, 60) * 2, 1);
      },
      fx(g, f, c) {
        const s = sphere(c);
        drawShieldFront(g, c, s, PH(f, 60) * 2, 1);
      },
    },
    {
      name: 'shield_drop',
      label: 'Shield drop',
      group: 'Shield and dodge',
      input: 'Release shield',
      notes: 'Lowers his guard and the wind sphere bursts outward and scatters.',
      frames: 7,
      pose: (f) => shieldDropK(f),
      fxBack(g, f, c) {
        const t = f / 7;
        if (t < 0.6) drawShieldBack(g, c, sphere(c, 1 + 0.25 * t), t * 1.5, 1 - t / 0.6);
      },
      fx(g, f, c) {
        const t = f / 7;
        const s = sphere(c, 1 + 0.3 * t);
        if (t < 0.6) bubbleFront(g, c.ink, s, 1 - t / 0.6);
        // the gust unwinds into streaks flying outward
        g.save();
        g.strokeStyle = c.ink;
        g.lineCap = 'round';
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + 0.3;
          const r0 = s.R * (0.9 + 0.5 * t);
          g.globalAlpha = 0.8 * (1 - t);
          g.lineWidth = (i % 2 ? 0.8 : 1.4) * s.k * 0.75;
          g.beginPath();
          g.arc(s.x, s.y, r0, a, a + 0.35 + 0.25 * t);
          g.stroke();
        }
        g.restore();
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + 0.9;
          const r = s.R * (0.85 + 0.6 * t);
          fxFeather(g, c.ink, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, a / D2R + 40 * t, 8 * s.k, 1 - t);
        }
      },
    },
    {
      name: 'shield_stun',
      label: 'Shield stun',
      group: 'Shield and dodge',
      input: 'Shield is struck',
      notes: 'The sphere ripples from the impact and he is shoved back a step inside it.',
      frames: 10,
      next: 'shield',
      pose(f) {
        const p = shieldUpK(4);
        const d = Math.pow(1 - f / 10, 2);
        p.ox = -5 * d * Math.cos(f * 1.6) * smoothstep(0, 1, f);
        p.lean -= 8 * d * smoothstep(0, 1, f);
        p.head -= 6 * d;
        p.wing = 0.75 + 0.6 * d;
        p.cloak = 0.8 + 0.5 * d;
        return p;
      },
      fxBack(g, f, c) {
        drawShieldBack(g, c, sphere(c), f * 0.08, 1);
      },
      fx(g, f, c) {
        const s = sphere(c);
        const d = Math.pow(1 - f / 10, 1.5);
        // the rim wobbles, strongest on the struck (front) side
        const wob = (a) => 0.07 * d * Math.cos(a) * Math.sin(f * 2.4 + a * 4);
        drawShieldFront(g, c, s, f * 0.08, 1, wob);
        // ripples spreading from the point of impact
        g.save();
        g.strokeStyle = c.ink;
        g.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const t = clamp(f / 8 - i * 0.18, 0, 1);
          if (t <= 0 || t >= 1) continue;
          g.globalAlpha = 0.9 * (1 - t);
          g.lineWidth = (1.6 - i * 0.4) * s.k * 0.75;
          g.beginPath();
          g.arc(s.x + s.R, s.y - 4 * s.k, s.R * (0.12 + 0.55 * t), Math.PI * 0.55, Math.PI * 1.45);
          g.stroke();
        }
        g.restore();
        if (f < 4) fxSpark(g, c.ink, s.x + s.R, s.y - 4 * s.k, 12 * s.k, f / 4, 0.9);
      },
    },
    {
      name: 'spotdodge',
      label: 'Spot dodge',
      group: 'Shield and dodge',
      input: 'Shield + down',
      notes: 'Slips aside in place, his body thinning into a blur of wind and shed feathers.',
      frames: 22,
      intan: [[3, 16]],
      pose(f) {
        const p = spotK(f);
        if (f >= 3 && f <= 16) p.fade = clamp(p.fade + 0.08 * Math.sin(f * 2.7), 0, 0.85);
        return p;
      },
      fxBack(g, f, c) {
        const a = smoothstep(1, 4, f) * (1 - smoothstep(13, 18, f));
        if (a <= 0) return;
        const spread = 7 + 5 * smoothstep(2, 8, f);
        ghost(g, c, c.pose, -spread * c.k, 0.16 * a);
        ghost(g, c, c.pose, spread * 0.8 * c.k, 0.12 * a);
        const J = c.J;
        windRing(g, c.ink, J.hip[0], J.hip[1] - 4 * J.k, 30 * J.k, 8 * J.k, f * 0.75, false, a);
        windRing(g, c.ink, J.sh[0], J.sh[1] + 2 * J.k, 24 * J.k, 6 * J.k, f * 0.75 + 1.3, false, a * 0.8);
      },
      fx(g, f, c) {
        const J = c.J;
        const a = smoothstep(1, 4, f) * (1 - smoothstep(13, 18, f));
        if (a > 0) {
          // horizontal blur streaks across the body
          g.save();
          g.strokeStyle = c.ink;
          g.lineCap = 'round';
          for (let i = 0; i < 4; i++) {
            const y = lerp(J.head[1], J.footF[1], (i + 0.5) / 4);
            const w = (16 + 8 * ((i * 7) % 3)) * J.k;
            const x = J.center[0] + (i % 2 ? 4 : -6) * J.k + Math.sin(f * 1.3 + i) * 4 * J.k;
            g.globalAlpha = 0.55 * a;
            g.lineWidth = (i % 2 ? 0.7 : 1.2) * J.k * 0.75;
            line(g, x - w, y, x + w, y);
          }
          g.restore();
        }
        if (a > 0) {
          windRing(g, c.ink, J.hip[0], J.hip[1] - 4 * J.k, 30 * J.k, 8 * J.k, f * 0.75, true, a);
          windRing(g, c.ink, J.sh[0], J.sh[1] + 2 * J.k, 24 * J.k, 6 * J.k, f * 0.75 + 1.3, true, a * 0.8);
        }
        // feathers shed at the start, drifting out
        if (f >= 2 && f <= 20) {
          const t = (f - 2) / 18;
          const pts = [[-1, -0.7], [1, -0.4], [-0.6, 0.1], [0.9, 0.3]];
          pts.forEach(([dx, dy], i) => {
            fxFeather(g, c.ink, J.center[0] + dx * (12 + 26 * t) * J.k, J.center[1] + dy * 30 * J.k + t * 14 * J.k, 90 * dx + 140 * t + i * 30, 9 * J.k, (1 - t) * 0.95);
          });
        }
      },
    },
    {
      name: 'roll_f',
      label: 'Forward roll',
      group: 'Shield and dodge',
      input: 'Shield + forward',
      notes: 'Dives low into a wind-wrapped somersault past the opponent and rises facing the same way.',
      frames: 30,
      intan: [[4, 18]],
      pose: (f) => noSink(levelStaff(rollFK(f), f, 90)),
      motion: (f) => ({ vx: f < 3 ? 1 : f <= 18 ? 7 * (1 - 0.55 * ((f - 3) / 15)) : Math.max(0, 3.1 * (1 - (f - 18) / 8)) }),
      fxBack(g, f, c) {
        if (f >= 5 && f <= 18) {
          const J = c.J;
          const t = (f - 5) / 13;
          fxSpeedLines(g, c.ink, [J.pivot[0] - 14 * J.k, J.pivot[1]], [1, 0], 40 * J.k, 30 * J.k, 5, 0.6 * Math.sin(t * Math.PI), c.rnd);
        }
      },
      fx(g, f, c) {
        const J = c.J;
        if (f >= 5 && f <= 18) {
          const t = (f - 5) / 13;
          fxGust(g, c.ink, J.pivot[0], J.pivot[1], 26 * J.k, f * 0.6, 0.6 * Math.sin(t * Math.PI));
        }
        kick(g, c.ink, -4 * J.k, (f - 3) / 8, -1, J.k);
        kick(g, c.ink, J.footF[0], (f - 17) / 9, 1, J.k);
      },
    },
    {
      name: 'roll_b',
      label: 'Back roll',
      group: 'Shield and dodge',
      input: 'Shield + back',
      notes: 'Sits back into a wind-wrapped backward somersault and rises still facing forward.',
      frames: 30,
      intan: [[4, 18]],
      pose: (f) => noSink(levelStaff(rollBK(f), f, 270)),
      motion: (f) => ({ vx: f < 3 ? -1 : f <= 18 ? -7 * (1 - 0.55 * ((f - 3) / 15)) : -Math.max(0, 3.1 * (1 - (f - 18) / 8)) }),
      fxBack(g, f, c) {
        if (f >= 5 && f <= 18) {
          const J = c.J;
          const t = (f - 5) / 13;
          fxSpeedLines(g, c.ink, [J.pivot[0] + 14 * J.k, J.pivot[1]], [-1, 0], 40 * J.k, 30 * J.k, 5, 0.6 * Math.sin(t * Math.PI), c.rnd);
        }
      },
      fx(g, f, c) {
        const J = c.J;
        if (f >= 5 && f <= 18) {
          const t = (f - 5) / 13;
          fxGust(g, c.ink, J.pivot[0], J.pivot[1], 26 * J.k, -f * 0.6, 0.6 * Math.sin(t * Math.PI));
        }
        kick(g, c.ink, 4 * J.k, (f - 3) / 8, 1, J.k);
        kick(g, c.ink, J.footB[0], (f - 17) / 9, -1, J.k);
      },
    },
    {
      name: 'airdodge',
      label: 'Air dodge',
      group: 'Shield and dodge',
      input: 'Shield in the air',
      notes: 'Folds into a cocoon of cloak and great wings that blurs out, then bursts open in a spray of feathers.',
      frames: 32,
      air: true,
      intan: [[3, 20]],
      landLag: 10,
      pose(f) {
        const p = airK(f);
        if (f >= 3 && f <= 20) {
          p.fade = clamp(p.fade + 0.1 * Math.sin(f * 2.3), 0, 0.85);
          p.rot = 4 * Math.sin(f * 0.7) * smoothstep(3, 6, f) * (1 - smoothstep(18, 21, f));
        }
        return p;
      },
      fxBack(g, f, c) {
        const a = smoothstep(0, 3, f) * (1 - smoothstep(19, 23, f));
        if (a <= 0) return;
        cocoon(g, c, f, a, false);
        fxGust(g, c.ink, c.J.center[0], c.J.center[1] + 4 * c.J.k, 42 * c.J.k, f * 0.5, 0.45 * a);
      },
      fx(g, f, c) {
        const J = c.J;
        const k = J.k;
        const a = smoothstep(0, 3, f) * (1 - smoothstep(19, 23, f));
        if (a > 0) {
          cocoon(g, c, f, a, true);
          // blur streaks
          g.save();
          g.strokeStyle = c.ink;
          g.lineCap = 'round';
          for (let i = 0; i < 5; i++) {
            const y = J.center[1] + (i - 2) * 12 * k;
            const x = J.center[0] + Math.sin(f * 1.7 + i * 2) * 6 * k;
            g.globalAlpha = 0.45 * a;
            g.lineWidth = (i % 2 ? 0.7 : 1.2) * k * 0.75;
            line(g, x - 30 * k, y, x + 30 * k, y);
          }
          g.restore();
        }
        // the cocoon bursts into feathers
        if (f >= 19 && f <= 31) {
          const t = (f - 19) / 12;
          for (let i = 0; i < 7; i++) {
            const ang = (i / 7) * Math.PI * 2 + 0.5;
            const r = (14 + 36 * EASE.out(t)) * k;
            fxFeather(g, c.ink, J.center[0] + Math.cos(ang) * r, J.center[1] + Math.sin(ang) * r + t * 10 * k, 90 - ang / D2R + 90 + t * 120, (7 + (i % 3)) * k, 1 - t);
          }
        }
      },
    },
    {
      name: 'dizzy',
      label: 'Dizzy',
      group: 'Shield and dodge',
      input: 'Shield broken',
      notes: 'Reels on wobbly knees with the caduceus drooping while little stars and a feather circle his head.',
      frames: 60,
      loop: true,
      pose(f) {
        const a = PH(f, 60);
        const s = Math.sin(a);
        const c2 = Math.cos(a);
        const lean = 10 + 9 * s;
        return solve(Object.assign({}, EX, BASE_POSE, standAt(0), {
          py: J0.hip[1] + 9 + 3 * Math.sin(a * 2), px: 2 * s,
          lean, head: 16 + 10 * c2,
          la1: -4 + 8 * Math.sin(a - 0.8), la2: 10 + 6 * s, handB: 1,
          ra1: 8 + 10 * Math.sin(a - 0.5), ra2: 18 + 6 * s,
          wpn: 50 - (8 + 10 * Math.sin(a - 0.5) + 18 + 6 * s + lean) + 6 * Math.sin(a - 1.2),
          wing: 0.12 + 0.08 * Math.sin(a * 3), cloak: 0.2 + 0.1 * s,
        }));
      },
      fxBack(g, f, c) {
        dizzyRing(g, f, c, false);
      },
      fx(g, f, c) {
        dizzyRing(g, f, c, true);
      },
    },
  ]);
  function dizzyRing(g, f, c, front) {
    const J = c.J;
    const k = J.k;
    const cx = J.head[0] - 1 * k;
    const cy = J.head[1] - 15 * k;
    for (let i = 0; i < 4; i++) {
      const th = PH(f, 60) * 2 + (i / 4) * Math.PI * 2;
      const z = Math.sin(th);
      if ((z >= 0) !== front) continue;
      const x = cx + Math.cos(th) * 21 * k;
      const y = cy + z * 5 * k;
      const sc = 0.8 + 0.25 * z;
      if (i === 3) fxFeather(g, c.ink, x, y, 90 + Math.cos(th) * 40, 9 * k * sc, front ? 1 : 0.6);
      else star(g, c.ink, x, y, 5.6 * k * sc, th * 0.5 + i, front ? 1 : 0.6);
    }
  }
})();
