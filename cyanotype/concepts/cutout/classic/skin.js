// ---------------------------------------------------------------------------
// Hermes Arena — skin "Classical Messenger" (TEMPLATE of src/skins/classic.js).
// Owned by the classic skin: edit this file, then run
//   node tools/build-skins.mjs classic && node build.mjs
// tools/build-skins.mjs fills the placeholders: PARTS / RIG (the data of the
// generated puppet concepts/cutout-classic.js, built by concepts/cutout/classic/
// build.py from the mockup), KEY.
//
// The puppet's parts are carried by the solved animation skeleton: every part
// has a rest segment in the drawing (RIG.art, source px) and is mapped onto its
// posed bone (segmentAffine: turn + move, stretched along the bone only as much
// as the skeleton needs, a fixed scale across it). The skeleton keeps the
// animation proportions (HERMES_SHAPE limb and torso lengths, so planted feet,
// ledge grips, grabs and hitboxes stay exactly where the animations put them);
// this skin only sets the head / crown / sole / staff fields to its art.
//
// Mapping of the drawing onto the skeleton (it faces +x):
//   torso, mantle     hip -> shoulders (lean, rot)          cloak  pinned at the
//   back shoulder, swings with pose.cloak / air / speed      skirt  hangs from the
//   waist, lifts with the thighs      head (+ hat wing)  neck, pose.head, wing
//   legs: the drawing's trailing leg = the skeleton's back leg (drawn darker,
//   behind), its front leg = the front leg; thighs / shins on their bones, the
//   sandals flat on the ground and pointed in the air, heel wings flap.
//   arms: the drawing's free arm serves both arms (the back one darker, behind
//   the body); the front hand holds the caduceus (pose.wpn, wpnShow); hands are
//   fists, or the painted open hand when handB / handF > 0.5.
// ---------------------------------------------------------------------------
(function () {
  const RIG = /*@RIG@*/null;
  const PARTS = /*@PARTS@*/[];
  const OWN = RIG.ink;
  const PAPER_C = RIG.paper;
  const A = RIG.art;
  const BY = {};
  for (const p of PARTS) BY[p.name] = p;

  // ---- scales: game units (at the fighter's scale 1.42) per source px --------------------
  const NAT = RIG.scale; // the drawing's own scale (182 units tall)
  const SB = NAT * 0.9; // body parts across their bones, feet, head, skirt, cloak
  const SA = NAT * 1.0; // arms across their bones, hands
  const ST_A = 41.3 / (A.hipC[1] - 163); // torso along: drawn shoulders on the skeleton's
  const ST_C = NAT * 0.84; // torso across
  const K0 = 1.42;

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const len = (v) => Math.hypot(v[0], v[1]);
  // staff: the art axis butt -> tip, the grip projected onto it
  const SAX = sub(A.staffTip, A.staffButt);
  const SAL = len(SAX);
  const SAU = [SAX[0] / SAL, SAX[1] / SAL];
  const gT = (A.grip[0] - A.staffButt[0]) * SAU[0] + (A.grip[1] - A.staffButt[1]) * SAU[1];
  const GRIP = [A.staffButt[0] + SAU[0] * gT, A.staffButt[1] + SAU[1] * gT];
  const STAFF_TIP = HERMES_SHAPE.staffTip != null ? HERMES_SHAPE.staffTip : 46; // keep the reach
  const SS = (STAFF_TIP * K0) / (SAL - gT); // staff scale (uniform)
  const STAFF_BUTT = (gT * SS) / K0;

  // head: J.head on the drawn head centre, J.top on the hat's crown
  const neckAlong = (A.hipC[1] - A.neck[1]) * ST_A; // drawn neck point above the hip (units)
  const headUp = (A.neck[1] - A.headC[1]) * SB;
  const HEAD_R = 7.4;
  const NECK = (neckAlong + headUp - 33 * K0) / K0 - HEAD_R;
  const CROWN = ((A.headC[1] - A.crown) * SB) / K0 - HEAD_R;
  const SOLE = ((A.ground - (A.ankleB[1] + A.ankleF[1]) / 2) * SB) / K0;

  const SHAPE = Object.assign({}, HERMES_SHAPE, {
    neck: NECK, headR: HEAD_R, crown: CROWN, sole: SOLE, staffTip: STAFF_TIP, staffButt: STAFF_BUTT,
  });

  // ---- part prints (per ink, cached) ---------------------------------------------------------
  const mk = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    return c;
  };
  const BASE = {}; // name -> { paper, inkMask }
  const CACHE = new Map(); // ink -> prints
  // parts that also get a darker print (the far arm reuses the near arm's parts)
  const DARKABLE = ['armF_up', 'foreF', 'fistF', 'palm'];
  // parts always printed darker (they only ever draw the far leg)
  const ALWAYS_DARK = ['legB_up', 'legB_lo', 'footB', 'wingB'];
  const DARK = 0.15; // share of ink mixed into the paper of far limbs

  function decode(p) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('classic part ' + p.name + ' failed to decode'));
      im.src = p.src;
    }).then((im) => {
      const w = p.w, h = p.h;
      const c = mk(w, h * 2), x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(im, 0, 0);
      const D = x.getImageData(0, 0, w, h * 2).data; // once, at load time
      const paper = mk(w, h), inkMask = mk(w, h);
      const pd = paper.getContext('2d').createImageData(w, h);
      const kd = inkMask.getContext('2d').createImageData(w, h);
      for (let i = 0, n = w * h; i < n; i++) {
        pd.data[i * 4 + 3] = D[(i + n) * 4];
        kd.data[i * 4 + 3] = D[i * 4];
      }
      paper.getContext('2d').putImageData(pd, 0, 0);
      inkMask.getContext('2d').putImageData(kd, 0, 0);
      BASE[p.name] = { paper, inkMask };
      if (DARKABLE.includes(p.name) || ALWAYS_DARK.includes(p.name)) {
        // far limbs: the engraving's hatching strengthened (ink share 1-(1-i)^1.7, taken from
        // the paper share so the coverage is unchanged), so the darker paper does not wash
        // the far leg / arm out into a flat fill
        const paper2 = mk(w, h), ink2 = mk(w, h);
        const pd2 = paper2.getContext('2d').createImageData(w, h);
        const kd2 = ink2.getContext('2d').createImageData(w, h);
        for (let i = 0, n = w * h; i < n; i++) {
          const ia = D[i * 4] / 255, pa = D[(i + n) * 4] / 255;
          const cov = Math.min(1, ia + pa);
          const ib = Math.min(cov, 1 - Math.pow(1 - ia, 1.7));
          kd2.data[i * 4 + 3] = Math.round(ib * 255);
          pd2.data[i * 4 + 3] = Math.round(Math.max(0, cov - ib) * 255);
        }
        paper2.getContext('2d').putImageData(pd2, 0, 0);
        ink2.getContext('2d').putImageData(kd2, 0, 0);
        BASE[p.name].paper2 = paper2;
        BASE[p.name].ink2 = ink2;
      }
    });
  }

  function hexMix(a, b, t) {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return 'rgb(' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',') + ')';
  }

  // one print of a part: full size, half size and a half-size ink rim (silhouette)
  function printPart(p, ink, paperCol, far) {
    const B = BASE[p.name];
    const full = mk(p.w, p.h), fx = full.getContext('2d');
    const bp = far && B.paper2 ? B.paper2 : B.paper, bi = far && B.ink2 ? B.ink2 : B.inkMask;
    // paper share, filled with the paper colour
    fx.drawImage(bp, 0, 0);
    fx.globalCompositeOperation = 'source-in';
    fx.fillStyle = paperCol;
    fx.fillRect(0, 0, p.w, p.h);
    // ink share, added (premultiplied parts of one coverage)
    const tint = mk(p.w, p.h), tx = tint.getContext('2d');
    tx.drawImage(bi, 0, 0);
    tx.globalCompositeOperation = 'source-in';
    tx.fillStyle = ink;
    tx.fillRect(0, 0, p.w, p.h);
    fx.globalCompositeOperation = 'lighter';
    fx.drawImage(tint, 0, 0);
    fx.globalCompositeOperation = 'source-over';
    const hw = Math.ceil(p.w / 2), hh = Math.ceil(p.h / 2);
    const half = mk(hw, hh), hx = half.getContext('2d');
    hx.imageSmoothingEnabled = true;
    hx.imageSmoothingQuality = 'high';
    hx.drawImage(full, 0, 0, hw, hh);
    const rim = mk(hw + 2, hh + 2), rx = rim.getContext('2d');
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      rx.drawImage(half, 1 + 0.55 * Math.cos(a), 1 + 0.55 * Math.sin(a));
    }
    rx.globalCompositeOperation = 'source-in';
    rx.fillStyle = ink;
    rx.fillRect(0, 0, hw + 2, hh + 2);
    // the caduceus also gets a thin paper halo (full size), so its shaft stays apart from
    // the cobalt cloak hatching it crosses
    let halo = null;
    if (p.name === 'staff') {
      halo = mk(p.w + 8, p.h + 8);
      const ax = halo.getContext('2d');
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6;
        ax.drawImage(full, 4 + 2.2 * Math.cos(a), 4 + 2.2 * Math.sin(a));
      }
      ax.globalCompositeOperation = 'source-in';
      ax.fillStyle = paperCol;
      ax.fillRect(0, 0, p.w + 8, p.h + 8);
    }
    return { full, half, rim, halo };
  }

  const CACHE_MAX = 4;
  function printed(ink) {
    let set = CACHE.get(ink);
    if (set) {
      if (ink !== OWN) {
        CACHE.delete(ink);
        CACHE.set(ink, set);
      }
      return set;
    }
    set = { dark: {} };
    const paperDark = hexMix(PAPER_C, ink.length === 7 ? ink : OWN, DARK);
    for (const p of PARTS) {
      const far = ALWAYS_DARK.includes(p.name);
      set[p.name] = printPart(p, ink, far ? paperDark : PAPER_C, far);
      if (DARKABLE.includes(p.name)) set.dark[p.name] = printPart(p, ink, paperDark, true);
    }
    // soft contact shadow
    const sh = mk(64, 16), sx = sh.getContext('2d');
    sx.translate(32, 8);
    sx.scale(1, 0.25);
    const gr = sx.createRadialGradient(0, 0, 0, 0, 0, 31);
    gr.addColorStop(0, ink);
    gr.addColorStop(0.55, ink);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    sx.fillStyle = gr;
    sx.beginPath();
    sx.arc(0, 0, 31, 0, Math.PI * 2);
    sx.fill();
    set.shadow = sh;
    CACHE.set(ink, set);
    while (CACHE.size > CACHE_MAX) {
      for (const k of CACHE.keys()) {
        if (k !== OWN) {
          CACHE.delete(k);
          break;
        }
      }
    }
    return set;
  }

  let loaded = false;
  const ready = Promise.all(PARTS.map(decode)).then(() => {
    printed(OWN);
    if (typeof INK !== 'undefined' && INK.sanguine) printed(INK.sanguine);
    loaded = true;
  });

  // ---- pose -> part matrices (source px -> local feet space) ----------------------------------
  const M = AFF;
  const rad = (d) => d * D2R;
  const angOf = (v) => Math.atan2(v[1], v[0]) / D2R; // screen degrees
  const wrapD = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
  const lerpAng = (a, b, t) => a + wrapD(b - a) * t;
  // similarity: art point s -> d, turned by deg, uniform scale sc
  function place(s, d, deg, sc) {
    const c = Math.cos(rad(deg)) * sc, n = Math.sin(rad(deg)) * sc;
    return [c, n, -n, c, d[0] - (c * s[0] - n * s[1]), d[1] - (n * s[0] + c * s[1])];
  }
  // a bone: art segment s0 -> s1 onto posed bone {a, b}, cross scale cr
  const onBone = (s0, s1, bone, cr) => segmentAffine(s0, s1, bone.a, bone.b, cr);

  const ART_FORE = angOf(sub(A.fist, A.elbow));
  const CLOAK_AXIS = angOf([-44, 178]); // pin -> hem in the drawing
  const ART_SHIN = { B: angOf(sub(A.ankleB, A.kneeB)), F: angOf(sub(A.ankleF, A.kneeF)) };

  // the back arm turned down about the shoulder when its fist rises beside the head
  // (drawing only: joints / hitboxes are untouched). null when nothing to do.
  function lowerBackArm(up, fo, B, c, gate) {
    const k = c.k;
    const sh = up.a, hd = c.J.head;
    const tv = sub(B.torso.b, B.torso.a), tl = len(tv) || 1;
    const uT = [tv[0] / tl, tv[1] / tl], fw = [-uT[1], uT[0]];
    const h = sub(fo.b, sh);
    const hx = h[0] * fw[0] + h[1] * fw[1], hy = h[0] * uT[0] + h[1] * uT[1];
    const lim = 6 * k; // fist centre this far under the shoulder line
    if (hx <= 0 || hy <= -lim) return null;
    const dHead = len(sub(fo.b, hd));
    if (gate <= 0) return null;
    // only a pumping / bracing fist near chin height: a hand reaching up (ledge grips,
    // grabs, throws) stays where the animation puts it
    // (gate: 0 in the grab / hold / throw sets, where the far fist grips the opponent's
    // collar while the caduceus arm is drawn back)
    const w = gate * (1 - smoothstep(24 * k, 38 * k, dHead)) * (1 - smoothstep(10 * k, 14 * k, hy));
    if (w <= 0) return null;
    const r = Math.hypot(hx, hy);
    if (r <= lim) return null;
    const a1 = Math.atan2(hy, hx), a2 = Math.atan2(-lim, Math.sqrt(r * r - lim * lim));
    const dDeg = (-(a2 - a1) / D2R) * w; // screen degrees (clockwise = down in front)
    const R = M.about(sh, dDeg);
    const e = M.apply(R, up.b), hh = M.apply(R, fo.b);
    return [
      { a: sh, b: e, deg: up.deg + dDeg },
      { a: e, b: hh, deg: fo.deg + dDeg },
    ];
  }

  function solve(pose, c) {
    const B = c.bones();
    const u = c.unit;
    const k = c.k;
    const P = { unit: u };
    const rot = B.rot;
    // torso: art hip centre -> skeleton hip, along the torso bone
    const tAx = sub(A.top, A.hipC);
    const tL = len(tAx);
    const td = [Math.cos(B.torso.rad), Math.sin(B.torso.rad)];
    const topP = [B.torso.a[0] + td[0] * tL * ST_A * u, B.torso.a[1] + td[1] * tL * ST_A * u];
    const T = segmentAffine(A.hipC, A.top, B.torso.a, topP, ST_C * u);
    P.torso = T;
    P.mantle = T;
    const torsoDeg = B.torso.deg + 90; // = rot + lean
    const lean = pose.lean || 0;

    // cloak: pinned at the back shoulder. It streams the way the procedural cloak does
    // (world-down, back with speed, up when falling fast: the floor poses steer it with
    // vx / vy too), bounded so it never swings through the body.
    const vx = (c.opts.vx || 0) * c.face;
    const vy = c.opts.vy || 0;
    const air = clamp(pose.air || 0, 0, 1);
    // flips and inversions: the long cape trails along the back (not world-down past the
    // head), shorter, and no speed flare while upside down
    const aT = Math.abs(wrapD(torsoDeg));
    const inv = smoothstep(60, 140, aT);
    const flare = clamp((pose.cloak || 0) + Math.abs(vx) * 0.04 * (1 - inv), 0, 1.5);
    const t = c.time;
    // on the floor: the lowest of feet / hip / shoulders / head is at the ground line (not
    // in the air, and not hanging below the origin as on a ledge)
    const JJ = c.J;
    const low = Math.max(JJ.footB[1], JJ.footF[1], JJ.hip[1], JJ.sh[1], JJ.head[1]);
    const onFloor = air < 0.5 && low > -(SOLE + 12) * k && low < 4 * k;
    const tx = -0.38 - vx * 0.06 - flare * 0.2;
    let ty = clamp(1 - vy * 0.08, -0.7, 1);
    // on the floor it spreads along the ground (cut at the ground line) instead of rising
    if (onFloor) ty = Math.max(ty, 0.22);
    const sway = (Math.sin(t * 2.1) + 0.4 * Math.sin(t * 5.3 + 1)) * (1 + 2 * Math.min(1, flare)) * (1 - 0.6 * inv);
    // the long cape swings further back than the procedural flap as it flares
    const relW = clamp(wrapD(angOf([tx, ty]) - CLOAK_AXIS - torsoDeg) + 26 * clamp(flare - 0.25, 0, 1.2), -45, 110 - 65 * smoothstep(40, 100, aT));
    const relI = clamp(relW, -30, 60) * 0.25 - 20; // tucked along the back
    const rel = relW + (relI - relW) * inv;
    const cloakDeg = torsoDeg + rel + sway;
    const pin = M.apply(T, A.cloakPin);
    const cs = SB * u;
    const stretch = 1 + 0.12 * clamp(flare - 0.4, 0, 1);
    // inverted: about two thirds of its length, a little narrower
    const shr = smoothstep(45, 105, aT);
    const sxI = 1 - 0.2 * shr, syI = 1 - 0.36 * shr;
    P.cloak = M.mul(M.mul(M.translate(pin[0], pin[1]), M.rotate(cloakDeg)), M.mul(M.scale(cs * stretch * sxI, (cs / Math.sqrt(stretch)) * syI), M.translate(-A.cloakPin[0], -A.cloakPin[1])));
    // on the floor the cloak is cut at the ground line (never through it)
    P.cloakClip = onFloor || (air < 0.5 && low > -70 * k && low < 4 * k);

    // skirt: hangs from the waist over the thigh tops, so it turns with the thighs (the
    // skeleton's legs do not lean with the torso) and a little with the lean
    const thighs = ((pose.ll1 || 0) + (pose.rl1 || 0)) / 2;
    const lift = clamp((Math.max(pose.ll1 || 0, pose.rl1 || 0) - 25) / 60, 0, 1);
    let skirtDeg = rot + clamp(-(thighs - 2) * 0.75, -85, 30) + lean * 0.25;
    // lying on the floor: the cloth drops (bends toward world-down, its flare flattened
    // onto the thighs) instead of standing up from the hips like a sail
    const lie = onFloor ? smoothstep(55, 85, Math.max(Math.abs(wrapD(rot)), Math.abs(wrapD(torsoDeg)))) : 0;
    skirtDeg += wrapD(0 - skirtDeg) * 0.22 * lie;
    const waist = M.apply(T, A.waist);
    P.skirt = M.mul(M.mul(M.translate(waist[0], waist[1]), M.rotate(skirtDeg)), M.mul(M.scale(SB * u * (1 + 0.06 * lift) * (1 - 0.4 * lie), SB * u * (1 - 0.12 * lift)), M.translate(-A.waist[0], -A.waist[1])));
    P.skirtClip = lie > 0;

    // head and hat wing
    const neck = M.apply(T, A.neck);
    P.head = place(A.neck, neck, B.headDeg, SB * u);
    P.hatwing = M.mul(P.head, M.about(A.hatwing, -2 + 7 * ((pose.wing || 0) - 0.3)));

    // legs
    const ground = c.FR.J ? 0 : 0;
    for (const s of ['B', 'F']) {
      const th = B['thigh' + s], sh = B['shin' + s];
      P['legU' + s] = onBone(A['hip' + s], A['knee' + s], th, SB * u);
      P['legL' + s] = onBone(A['knee' + s], A['ankle' + s], sh, SB * u);
      // sandal: flat when near the ground, pointed (toes down, square to the shin) in the air
      const ank = sh.b;
      const h = -ank[1] - SOLE * k; // ankle height above its planted height
      const gnd = clamp(1 - (h - 5 * k) / (9 * k), 0, 1) * (1 - smoothstep(10, 35, Math.abs(wrapD(rot))));
      // pointed in the air; with the shin far off vertical (kicked back in a run, a bair) a
      // fixed point along the shin line instead of turning on, which shows the sole flat on
      // like a fan
      const shinOff = smoothstep(55, 80, Math.abs(wrapD(sh.deg - 90)));
      const airDeg = sh.deg - 90 + (18 + 12 * air) * (1 - shinOff) + 40 * shinOff;
      let footDeg = lerpAng(airDeg, 0, gnd);
      // a planted sandal under a steep shin: let the heel rise rather than break the ankle
      const rel = wrapD(footDeg - (sh.deg - 90));
      if (rel < -50) footDeg = sh.deg - 90 - 50;
      if (rel > 45) footDeg = sh.deg - 90 + 45;
      P['foot' + s] = place(A['ankle' + s], ank, footDeg, SB * u);
      // heel wing on its brooch, flapping with pose.wing
      const br = M.apply(P['legL' + s], A['brooch' + s]);
      const flap = 10 * ((pose.wing || 0) - 0.3) + 2.5 * Math.sin(t * 9 + (s === 'B' ? 1.3 : 0)) * (pose.wing || 0);
      P['wing' + s] = place(A['brooch' + s], br, sh.deg - ART_SHIN[s] + flap, SB * u);
    }

    // arms (both from the drawing's free arm)
    for (const s of ['B', 'F']) {
      let up = B['upper' + s], fo = B['fore' + s];
      // the far fist never pumps up beside the jaw (it draws behind the head, so the part
      // that pokes past the face reads as a growth on the neck): near the head, the back
      // arm turns down about its shoulder until the fist is just under the shoulder line
      if (s === 'B' && !(pose.handB > 0.5)) {
        const fixed = lowerBackArm(up, fo, B, c, smoothstep(-75, -45, pose.ra1 || 0));
        if (fixed) {
          up = fixed[0];
          fo = fixed[1];
        }
      }
      P['armU' + s] = onBone(A.shoulder, A.elbow, up, SA * u);
      // the fist's centre on the skeleton's hand point, so the staff runs through the fist
      P['armL' + s] = onBone(A.elbow, A.fist, fo, SA * u);
      P['hand' + s] = place(A.fist, fo.b, fo.deg - ART_FORE, SA * u);
    }
    // caduceus: butt -> tip on the staff bone (uniform, its length is the skeleton's)
    P.staff = segmentAffine(A.staffButt, A.staffTip, B.staff.a, B.staff.b);
    // its place in the draw order: behind the body (just over the cloak) when it points
    // back past the torso axis, when the shaft crosses the head, or lying on the floor;
    // otherwise in front of the mantle, under the front arm
    {
      const tv = sub(B.torso.b, B.torso.a), tl = len(tv) || 1;
      const fw = [-tv[1] / tl, tv[0] / tl];
      const tipR = sub(B.staff.b, B.torso.a);
      const behind = tipR[0] * fw[0] + tipR[1] * fw[1] < -2 * k;
      const hd = JJ.head, a = B.staff.a, d = sub(B.staff.b, a);
      const dl2 = d[0] * d[0] + d[1] * d[1] || 1;
      const tt = clamp(((hd[0] - a[0]) * d[0] + (hd[1] - a[1]) * d[1]) / dl2, 0, 1);
      const rHead = (A.headC[1] - A.crown) * SB * u * 0.85;
      const crosses = len([a[0] + d[0] * tt - hd[0], a[1] + d[1] * tt - hd[1]]) < rHead;
      P.staffBack = behind || crosses || lie > 0.5;
    }
    return P;
  }

  // ---- draw ----------------------------------------------------------------------------------
  // what to draw, back to front: [matrix key, part, dark print?]
  function drawList(pose, P) {
    const L = [['cloak', 'cloak']];
    const staff = pose.wpnShow > 0.5;
    if (staff && P.staffBack) L.push(['staff', 'staff']);
    const hB = pose.handB > 0.5 ? 'palm' : 'fistF';
    const hF = pose.handF > 0.5 ? 'palm' : 'fistF';
    L.push(['armUB', 'armF_up', 1], ['handB', hB, 1], ['armLB', 'foreF', 1]);
    L.push(['footB', 'footB'], ['legLB', 'legB_lo'], ['legUB', 'legB_up'], ['wingB', 'wingB']);
    L.push(['footF', 'footF'], ['legLF', 'legF_lo'], ['legUF', 'legF_up'], ['wingF', 'wingF']);
    L.push(['skirt', 'skirt'], ['torso', 'torso'], ['head', 'head'], ['hatwing', 'hatwing'], ['mantle', 'mantle']);
    if (staff && !P.staffBack) L.push(['staff', 'staff']);
    L.push(['armUF', 'armF_up'], ['handF', hF], ['armLF', 'foreF']);
    return L;
  }

  function devScale(g, m) {
    const T = g.getTransform();
    const a = T.a * m[0] + T.c * m[1], b = T.b * m[0] + T.d * m[1];
    const cc = T.a * m[2] + T.c * m[3], d = T.b * m[2] + T.d * m[3];
    return Math.sqrt(Math.abs(a * d - b * cc));
  }

  function drawParts(g, set, list, P) {
    const T0 = g.getTransform();
    // device px per source px, from the torso (all parts are drawn near this scale)
    const useHalf = devScale(g, P.torso) < 0.62;
    g.imageSmoothingEnabled = true;
    // the half prints are already filtered down: plain bilinear is enough (and much cheaper)
    g.imageSmoothingQuality = useHalf ? 'low' : 'medium';
    for (let pass = useHalf ? 0 : 1; pass < 2; pass++) {
      for (const [key, name, dark] of list) {
        if (SKIN.debugOnly && !SKIN.debugOnly.includes(key)) continue; // dev: draw a subset
        const p = BY[name], m = P[key];
        const pr = dark ? set.dark[name] : set[name];
        g.setTransform(T0);
        const clip = (key === 'cloak' && P.cloakClip) || (key === 'skirt' && P.skirtClip);
        if (clip) {
          g.save();
          g.beginPath();
          g.rect(-1e4, -1e4, 2e4, 1e4 + P.unit);
          g.clip();
        }
        g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        if (pass === 0) g.drawImage(pr.rim, p.x - 2, p.y - 2, p.w + 4, p.h + 4);
        else {
          if (pr.halo && P.staffBack) g.drawImage(pr.halo, p.x - 4, p.y - 4, p.w + 8, p.h + 8);
          g.drawImage(useHalf ? pr.half : pr.full, p.x, p.y, p.w, p.h);
        }
        if (clip) g.restore();
      }
    }
    g.setTransform(T0);
  }

  // contact shadows under grounded sandals, then the parts
  function drawFigure(g, set, list, P, c) {
    const a0 = g.globalAlpha;
    for (const s of ['B', 'F']) {
      const f = c.J['foot' + s];
      const h = -f[1] - SOLE * c.k;
      const w = 1 - clamp(h / (30 * c.k), 0, 1);
      if (w <= 0.02) continue;
      g.globalAlpha = a0 * 0.2 * w;
      const hw = 17 * c.unit;
      g.drawImage(set.shadow, f[0] + 4 * c.unit - hw * 1.2, -1.0 * c.unit, hw * 2.4, 2.2 * c.unit);
    }
    g.globalAlpha = a0;
    drawParts(g, set, list, P);
  }

  // the figure at full alpha into one reused offscreen canvas (grown, never shrunk,
  // only the figure's device box is cleared and copied), then composited once with a0
  let OFF = null, OFFX = null;
  function drawFaded(g, set, list, P, c, a0) {
    if (a0 <= 0.004) return;
    // local bounds of every part box (and the shadows)
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [key, name] of list) {
      const p = BY[name], m = P[key];
      for (let i = 0; i < 4; i++) {
        const sx = i & 1 ? p.x + p.w : p.x, sy = i & 2 ? p.y + p.h : p.y;
        const lx = m[0] * sx + m[2] * sy + m[4], ly = m[1] * sx + m[3] * sy + m[5];
        if (lx < x0) x0 = lx;
        if (lx > x1) x1 = lx;
        if (ly < y0) y0 = ly;
        if (ly > y1) y1 = ly;
      }
    }
    for (const s of ['B', 'F']) {
      const f = c.J['foot' + s];
      x0 = Math.min(x0, f[0] - 25 * c.unit);
      x1 = Math.max(x1, f[0] + 30 * c.unit);
      y1 = Math.max(y1, 2 * c.unit);
    }
    // to device px
    const T = g.getTransform();
    let dx0 = 1e9, dy0 = 1e9, dx1 = -1e9, dy1 = -1e9;
    for (let i = 0; i < 4; i++) {
      const lx = i & 1 ? x1 : x0, ly = i & 2 ? y1 : y0;
      const X = T.a * lx + T.c * ly + T.e, Y = T.b * lx + T.d * ly + T.f;
      if (X < dx0) dx0 = X;
      if (X > dx1) dx1 = X;
      if (Y < dy0) dy0 = Y;
      if (Y > dy1) dy1 = Y;
    }
    const cw = g.canvas.width, ch = g.canvas.height;
    const rx = Math.max(0, Math.floor(dx0) - 3), ry = Math.max(0, Math.floor(dy0) - 3);
    const rw = Math.min(cw, Math.ceil(dx1) + 3) - rx, rh = Math.min(ch, Math.ceil(dy1) + 3) - ry;
    if (rw <= 0 || rh <= 0) return;
    if (!OFF || OFF.width < rw || OFF.height < rh) {
      const nw = Math.max(OFF ? OFF.width : 0, Math.ceil(rw / 64) * 64);
      const nh = Math.max(OFF ? OFF.height : 0, Math.ceil(rh / 64) * 64);
      OFF = mk(nw, nh);
      OFFX = OFF.getContext('2d');
    } else {
      OFFX.setTransform(1, 0, 0, 1, 0, 0);
      OFFX.clearRect(0, 0, rw, rh);
    }
    OFFX.setTransform(T.a, T.b, T.c, T.d, T.e - rx, T.f - ry);
    OFFX.globalAlpha = 1;
    drawFigure(OFFX, set, list, P, c);
    OFFX.setTransform(1, 0, 0, 1, 0, 0);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = a0;
    g.drawImage(OFF, 0, 0, rw, rh, rx, ry, rw, rh);
    g.restore();
  }

  const SKIN = registerSkin(/*@KEY@*/, {
    name: 'Classical Messenger',
    char: 'hermes',
    shape: SHAPE,
    ready,
    draw(g, pose, x, y, opts) {
      const c = skinBegin(g, SKIN, pose, x, y, opts);
      if (c.drawn && loaded) {
        const ink = c.own ? OWN : c.ink;
        const set = printed(ink);
        const P = solve(pose, c);
        const list = drawList(pose, P);
        const a0 = g.globalAlpha;
        // see-through states (dodges, ghosts, respawn): one translucent figure, not
        // translucent parts (every hidden overlap and outline would show through)
        if (a0 < 0.999) drawFaded(g, set, list, P, c, a0);
        else drawFigure(g, set, list, P, c);
      }
      return skinEnd(g, c);
    },
    props: {
      // detached caduceus (taunts): the puppet's staff, grip at `grip`
      caduceus(g, ink, grip, angDeg, k, wing, time) {
        if (!loaded) return;
        const set = printed(!ink || ink === INK.blue ? OWN : ink);
        const d = dirv(angDeg);
        const sc = SS * (k / K0);
        const tip = [grip[0] + d[0] * (SAL - gT) * sc, grip[1] + d[1] * (SAL - gT) * sc];
        const m = segmentAffine(GRIP, A.staffTip, grip, tip);
        drawParts(g, set, [['s', 'staff']], { s: m, torso: m });
      },
      // a heel wing drawn by effects: the puppet's front heel wing, root at (x, y)
      talaria(g, ink, x, y, angDeg, L, flap, shade, kk) {
        if (!loaded) return;
        const set = printed(!ink || ink === INK.blue ? OWN : ink);
        const art = sub([205, 381], A.broochF); // brooch -> wing tip in the drawing
        const d = dirv(angDeg + flap);
        const sc = (L * 1.25) / len(art);
        const m = place(A.broochF, [x, y], angOf(d) - angOf(art), sc);
        drawParts(g, set, [['w', 'wingF']], { w: m, torso: m });
      },
      // a hand drawn by effects over a prop
      hand(g, ink, wrist, angDeg, mode, k, shade) {
        if (!loaded) return;
        const set = printed(!ink || ink === INK.blue ? OWN : ink);
        const d = dirv(angDeg);
        const m = place(A.fist, wrist, angOf(d) - ART_FORE, SA * (k / K0));
        drawParts(g, set, [['h', mode > 0.5 ? 'palm' : 'fistF']], { h: m, torso: m });
      },
      // face overlays, at the drawing's eye / mouth
      face(g, c, kind, amt) {
        if (!loaded || amt <= 0) return;
        const ink = !c.ink || c.ink === INK.blue ? OWN : c.ink;
        const k = c.k;
        const S = skinShape(SKIN, k);
        const FR = SKIN.frame(c.pose, S);
        const B = skinBones(FR, c.pose);
        const T = segmentAffine(A.hipC, A.top, B.torso.a, [B.torso.a[0] + Math.cos(B.torso.rad) * len(sub(A.top, A.hipC)) * ST_A * (k / K0), B.torso.a[1] + Math.sin(B.torso.rad) * len(sub(A.top, A.hipC)) * ST_A * (k / K0)], ST_C * (k / K0));
        const H = place(A.neck, M.apply(T, A.neck), B.headDeg, SB * (k / K0));
        g.save();
        M.apply2d(g, H);
        g.lineCap = 'round';
        g.strokeStyle = ink;
        if (kind === 'wink') {
          g.globalAlpha *= clamp(amt * 2, 0, 1);
          g.fillStyle = PAPER_C;
          g.beginPath();
          g.ellipse(A.eye[0], A.eye[1], 4.2, 2.6, 0, 0, Math.PI * 2);
          g.fill();
          g.lineWidth = 1.8;
          g.beginPath();
          g.moveTo(A.eye[0] - 4, A.eye[1] - 0.6);
          g.quadraticCurveTo(A.eye[0], A.eye[1] + 2.4, A.eye[0] + 3.6, A.eye[1] - 0.8);
          g.stroke();
        } else if (kind === 'smirk') {
          g.globalAlpha *= clamp(amt, 0, 1);
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(A.mouth[0] - 3.5, A.mouth[1] + 0.5);
          g.quadraticCurveTo(A.mouth[0] - 1, A.mouth[1] + 0.8, A.mouth[0] + 0.5, A.mouth[1] - 2);
          g.stroke();
        } else if (kind === 'pout') {
          g.globalAlpha *= clamp(amt, 0, 1);
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(A.mouth[0] - 3.5, A.mouth[1] + 1.5);
          g.quadraticCurveTo(A.mouth[0] - 1.5, A.mouth[1] - 1, A.mouth[0] + 1, A.mouth[1] + 0.5);
          g.stroke();
        }
        g.restore();
      },
    },
  });
})();
