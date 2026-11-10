// ---------------------------------------------------------------------------
// Hermes Arena — skin "Masked Herald" (TEMPLATE of src/skins/masked.js).
// Owned by the masked skin: edit this file, then run
//   node tools/build-skins.mjs masked && node build.mjs
// tools/build-skins.mjs fills the placeholders: CONCEPT (the whole generated
// puppet concepts/cutout-masked.js), PARTS / RIG (its data as JSON), KEY.
//
// The cutout puppet driven by the solved skeleton. Every part of the mockup
// (concepts/cutout/masked/build.py) is placed from the skeleton each frame:
//   torso (+ skirt)  rigid on the hip, turned with the torso bone (the mockup's
//                    upright torso = lean 4, the idle lean)
//   head             on the neck pivot, tilted by pose.head (and less than the
//                    torso leans, like the procedural head)
//   cloak            on the shoulders, swung back by pose.cloak / air / velocity
//   pauldrons        on the torso, lifted a little with their upper arm
//   arms, legs       two-bone IK in the ART's own proportions from the art's
//                    shoulder / hip to the skeleton's hand / ankle, so hands and
//                    planted feet land exactly where the animation puts them;
//                    bones stretch only when the target is out of the art's reach
//   feet             turn about the ankle: flat on the floor when grounded,
//                    following the shin in the air (ankle bend limited)
//   staff arm        the skeleton's FRONT arm is the mockup's FAR arm (drawn
//                    behind the torso): borrowed upper arm + full-length bracer +
//                    the mockup's gripping fist; the fist bends at the wrist
//                    toward the staff, the caduceus runs through the fist
// The skeleton's BACK arm / leg are the mockup's NEAR (front-drawn) arm / leg.
// SHAPE is measured from the mockup (torso, shoulders, head, sole, staff) so
// J (hitboxes, hurt capsules) sits on the drawn body. Limb lengths keep
// HERMES_SHAPE's (the animations' foot / hand IK uses them).
// ---------------------------------------------------------------------------
(function () {
  // the generated puppet, captured privately (its window.CONCEPT lands here)
  const PUPPET = (function () {
    const window = {};
    /*@CONCEPT@*/
    return window.CONCEPT;
  })();
  const R = PUPPET.rig;
  const P = R.parts;

  // ---- the mockup's joints (SOURCE px of masked-34.png; the art faces -x) ----
  const PXU = 7.02; // source px per figure unit at game scale (182 world units tall)
  const A = {
    hip: [241, 578], // pelvis centre: the skeleton's hip
    shF: [176, 290], shN: [318, 292], // shoulder joints (F = far = staff arm)
    elF: [158, 393], elN: [337, 410], // elbows (elF: the borrowed upper arm's)
    handN: [308, 540], // near fist centre
    handC: [309, 547], // centre of the near hand below the cuff (prop hand clip)
    braceE: [337, 410], braceW: [318, 507], // the staff-arm bracer: elbow -> wrist
    fistW: [114, 378], grip: [83, 372], // staff fist: wrist end -> grip
    hipF: [192, 588], hipN: [290, 586],
    kneeF: [185, 702], kneeN: [298, 698],
    ankF: [193, 899], ankN: [340, 901],
    neck: [243, 202], headC: [250, 140], crown: 75, ground: 975,
    staffTip: [84, 100], staffButt: [83, 775],
    cloak: [300, 240], pauldF: [172, 268], pauldN: [322, 268],
    wingF: [216, 100], wingN: [289, 104], // helmet wing roots
    talRoot: [352, 885], talTip: [398, 829], // the boot wing (talaria prop)
    brim: [190, 147], // the helmet's front brim (where a hat-tipping fist goes)
  };
  const d2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const shC = [(A.shF[0] + A.shN[0]) / 2, (A.shF[1] + A.shN[1]) / 2];
  const SHDROP = 3;
  const torsoLen = (A.hip[1] - shC[1]) / PXU + SHDROP;
  const headR = 8.5;
  const neckLen = (shC[1] - SHDROP * PXU - A.headC[1]) / PXU - headR;
  const SHAPE = Object.assign({}, HERMES_SHAPE, {
    torso: +torsoLen.toFixed(2),
    shDrop: SHDROP,
    shoulder: +((A.shN[0] - A.shF[0]) / 2 / PXU).toFixed(2),
    neck: +neckLen.toFixed(2),
    headR,
    crown: +((A.headC[1] - A.crown) / PXU - headR).toFixed(2),
    sole: +((A.ground - (A.ankF[1] + A.ankN[1]) / 2) / PXU).toFixed(2),
    staffTip: +(d2(A.grip, A.staffTip) / PXU).toFixed(2),
    staffButt: +(d2(A.grip, A.staffButt) / PXU).toFixed(2),
  });

  // ---- small 2D helpers (local feet space: y down, angles in screen degrees) ----
  const RAD = Math.PI / 180;
  const angOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD;
  const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
  const add = (p, ang, len) => [p[0] + Math.cos(ang * RAD) * len, p[1] + Math.sin(ang * RAD) * len];
  const apply = (M, p) => [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];
  const mul = AFF.mul;
  // rigid mirrored placement: source point s -> local point d, the source "up"
  // (0, -1) turned to screen angle `up` (deg), q local units per source px
  function place(s, d, up, q) {
    const r = (up + 90) * RAD, c = Math.cos(r), sn = Math.sin(r);
    // M = T(d) R(r) S(-q, q) T(-s)
    const a = -q * c, b = -q * sn, cc = -q * sn, dd = q * c;
    return [a, b, cc, dd, d[0] - (a * s[0] + cc * s[1]), d[1] - (b * s[0] + dd * s[1])];
  }
  // rotation by deg about local point p, applied after M
  const turn = (M, p, deg) => (deg ? mul(AFF.about(p, deg), M) : M);

  // two-bone IK from root r to target t with bone lengths l1, l2 (local units);
  // side: +1 / -1 picks the bend. Returns [joint, end] (end = t, or the reach).
  function ik2(r, t, l1, l2, side) {
    const vx = t[0] - r[0], vy = t[1] - r[1];
    const L = Math.hypot(vx, vy) || 1e-6;
    const d = Math.min(Math.max(L, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
    const ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const a = Math.acos(Math.max(-1, Math.min(1, ca)));
    const base = Math.atan2(vy, vx);
    const th = base + side * a;
    const j = [r[0] + Math.cos(th) * l1, r[1] + Math.sin(th) * l1];
    const e = [r[0] + (vx / L) * d, r[1] + (vy / L) * d];
    return [j, e];
  }
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  // limb: art lengths (px) of a two-bone chain, solved to the skeleton's end
  // point. stretchMin: the chain is scaled at least by this (arms: so the art
  // arm spans the skeleton arm), and further when the target is out of reach.
  // rebal (0..1): how far a deeply bent limb takes the skeleton's proportions.
  // The mockup's leg is a short thigh on a long booted shin (16 : 28 units, the
  // skeleton's is 25 : 24): folded tight (a flip's tuck) pure IK swings the art
  // thigh up past the hip and the knees never come forward, so the thigh grows
  // and the shin shrinks with the skeleton's knee bend.
  function limb(root, target, joint0, L1, L2, q, stretchMin, defSide, B1, B2, rebal) {
    let l1 = L1 * q * stretchMin, l2 = L2 * q * stretchMin;
    if (rebal > 0) {
      const bendDeg = Math.abs(wrap(B2.deg - B1.deg));
      const r = smoothstep(35, 110, bendDeg) * rebal;
      l1 *= 1 + 0.35 * r;
      l2 *= 1 - 0.2 * r;
    }
    const dist = d2(root, target);
    if (dist > (l1 + l2) * 0.999) {
      const s = (dist / (l1 + l2)) * 1.0005;
      l1 *= s;
      l2 *= s;
    }
    // bend like the skeleton's joint (sign of its cross product); a nearly
    // straight skeleton limb keeps the default bend
    const cr = cross(B1.a, B2.b, B1.b);
    const side = Math.abs(cr) > 0.02 * B1.len * B2.len ? (cr > 0 ? 1 : -1) : defSide;
    return ik2(root, target, l1, l2, side);
  }

  const LEN = {
    upN: d2(A.shN, A.elN), foN: d2(A.elN, A.handN),
    upF: d2(A.shF, A.elF), brace: d2(A.braceE, A.braceW), fist: d2(A.fistW, A.grip),
    thF: d2(A.hipF, A.kneeF), shF: d2(A.kneeF, A.ankF),
    thN: d2(A.hipN, A.kneeN), shN: d2(A.kneeN, A.ankN),
  };
  const armStretchN = ((HERMES_SHAPE.upper + HERMES_SHAPE.fore) * PXU) / (LEN.upN + LEN.foN);
  const armStretchF = ((HERMES_SHAPE.upper + HERMES_SHAPE.fore) * PXU) / (LEN.upF + LEN.brace + LEN.fist);
  // rest screen angles of the mirrored art (for relative joint turns)
  const mir = (a, b) => angOf([-a[0], a[1]], [-b[0], b[1]]);
  const REST = {
    shinF: mir(A.kneeF, A.ankF), shinN: mir(A.kneeN, A.ankN),
    upN: mir(A.shN, A.elN), upF: mir(A.shF, A.elF),
    fist: mir(A.fistW, A.grip),
  };
  const REST_LEAN = 4; // the mockup's torso = the skeleton's torso at lean 4
  // torso silhouette (source px) for "is the staff fist behind the body?"
  const TORSO_HULL = [[150, 240], [330, 240], [312, 420], [350, 540], [366, 618], [200, 646], [136, 600], [149, 430], [163, 300]];
  const KILT_TOP = 432; // the kilt flap hangs from this source row (under the belt)
  const inPoly = (pt, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  const closestOnSeg = (p, a, b) => {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1)));
    return [a[0] + vx * t, a[1] + vy * t];
  };
  // staff placed along a local line: the art's butt -> tip centred on `mid`, art length
  const STAFF_LEN = d2(A.staffButt, A.staffTip);
  function staffAlong(mid, dir, q) {
    const h = (STAFF_LEN * q) / 2;
    return segmentAffine(A.staffButt, A.staffTip, [mid[0] - dir[0] * h, mid[1] - dir[1] * h], [mid[0] + dir[0] * h, mid[1] + dir[1] * h], q, true);
  }

  // ---- one frame ----
  function partM(name, M, clip) {
    return [P[name], M, clip];
  }
  const HSHAPE = Object.assign({}, HERMES_SHAPE);
  const ARM = HERMES_SHAPE.upper + HERMES_SHAPE.fore;

  // world (local feet space) direction the procedural cloak streams in, deg
  function cloakDir(cloak, vx, vy) {
    const flare = Math.max(0, Math.min(1.5, cloak + Math.abs(vx) * 0.04));
    const tx = -0.38 - vx * 0.06 - flare * 0.2;
    const ty = Math.max(-0.7, Math.min(1, 1 - vy * 0.08));
    return Math.atan2(ty, tx) / RAD;
  }
  function cloakTurn(pose, c, leanRel, rotK, legBack) {
    const vx = (c.opts.vx || 0) * c.face, vy = c.opts.vy || 0;
    const cloak = pose.cloak == null ? 0.25 : pose.cloak;
    // speed / fall: how far the procedural cloak would turn (capped)
    const vel = Math.max(-20, Math.min(20, 1.5 * wrap(cloakDir(cloak, vx, vy) - cloakDir(cloak, 0, 0))));
    const t = c.time || 0;
    const sway = Math.sin(t * 2.3) * 1.2 + 4 * Math.max(0, cloak - 0.6) * Math.sin(t * 9);
    // flare with pose.cloak and air, and half-hang when the torso leans (the
    // feathers are stiff: the cloak keeps half of the torso's lean)
    // Flare and speed only count while the body is upright: a flipped / tumbling
    // body keeps the cloak against its back (else the 650 px mantle fans into a
    // wall of feathers that hides the move). A leg kicked far behind (back air)
    // lowers the flare so the kick shows clear of the feathers.
    const flare = (26 * (cloak - 0.25) + 6 * (pose.air || 0) + vel) * rotK;
    const lb = Math.min(30, legBack);
    const cl = flare - 0.45 * leanRel + sway - lb;
    const lo = -25 + 15 * (1 - rotK), hi = 60 - 45 * (1 - rotK);
    return Math.max(lo - lb, Math.min(hi, cl));
  }

  function solveParts(c, pose) {
    const B = c.bones();
    const k = c.k;
    const q = k / PXU; // local units per source px
    const out = [];
    const J = c.J;
    const rotAbs = Math.abs(wrap(pose.rot || 0));
    const rotK = 1 - smoothstep(25, 60, rotAbs);
    // arms overhead: with BOTH arms up (ledge hang / climb, cheers) the hands go
    // where the procedural figure's hands are (the ledge animations pin those to
    // the ledge corner). This skin's shoulders sit higher (the mockup's long
    // torso), so the whole puppet slides down by the shoulder difference and the
    // arms hang at full length instead of folding up in front of the mask.
    const tu = [(B.torso.b[0] - B.torso.a[0]) / B.torso.len, (B.torso.b[1] - B.torso.a[1]) / B.torso.len];
    const upness = (U, F) => ((F.b[0] - U.a[0]) * tu[0] + (F.b[1] - U.a[1]) * tu[1]) / (ARM * k);
    const wUp = smoothstep(0.35, 0.75, Math.min(upness(B.upperF, B.foreF), upness(B.upperB, B.foreB)));
    // hanging below a ledge corner (the hips below the corner's level, y = 0): only
    // then does the puppet slide and the staff lie along the procedural line (a
    // standing cheer with both arms up keeps its feet on the floor)
    const hang = wUp * smoothstep(-35 * k, -10 * k, J.hip[1]);
    let FRh = null, dv = [0, 0];
    if (wUp > 0) {
      HSHAPE.scale = k;
      FRh = hermesFrame(pose, HSHAPE);
      const sd = [FRh.J.sh[0] - J.sh[0], FRh.J.sh[1] - J.sh[1]];
      // only the part along the arms (the torso's up axis): slide down, not sideways
      const along = Math.min(0, sd[0] * tu[0] + sd[1] * tu[1]) * hang;
      // and ~2 units back from the wall (the stage is ahead, +x): the kilt and
      // boots stay clear of the wall line
      dv = [tu[0] * along - 2 * k * hang, tu[1] * along];
    }
    const sh = (pt) => [pt[0] + dv[0], pt[1] + dv[1]];
    // torso
    const tAng = B.torso.deg; // screen angle hip -> shoulders
    // NOTE: place() turns the art's "up" to `up`; the art's up is the skeleton's
    // torso at lean REST_LEAN, i.e. screen angle REST_LEAN - 90.
    const Mtorso = place(A.hip, sh(B.torso.a), tAng - REST_LEAN, q);
    const L = (p) => apply(Mtorso, p);
    const leanRel = wrap(tAng - (REST_LEAN - 90) - (pose.rot || 0)); // lean change, deg

    // head: follows the torso, tilted by head - 0.6 (lean - rest) like drawHermes
    const headTilt = Math.max(-40, Math.min(40, (pose.head || 0) - 0.6 * leanRel));
    const neckL = L(A.neck);
    const Mhead = turn(Mtorso, neckL, headTilt);

    // legs (solved first: the cloak and the kilt flap react to them)
    const hipFL = L(A.hipF), hipNL = L(A.hipN);
    const rebal = Math.max(Math.min(1, Math.max(0, pose.air || 0)), 1 - rotK);
    const [knF, anF] = limb(hipFL, B.shinF.b, null, LEN.thF, LEN.shF, q, 1, -1, B.thighF, B.shinF, rebal);
    const [knN, anN] = limb(hipNL, B.shinB.b, null, LEN.thN, LEN.shN, q, 1, -1, B.thighB, B.shinB, rebal);
    // thigh angle relative to the torso's down axis: + forward, - behind
    const down = tAng + 180;
    const fwdF = -wrap(angOf(hipFL, knF) - down), fwdN = -wrap(angOf(hipNL, knN) - down);
    const legBack = (pose.air || 0) > 0.5 ? Math.max(0, -Math.min(fwdF, fwdN) - 40) : 0; // aerial back kicks only

    // cloak: hangs from the shoulders, swung back by pose.cloak / air and by the
    // speed the procedural cloak streams with (cloakGeometry); squashed along its
    // length while the body is upside down / sideways
    const cl = cloakTurn(pose, c, leanRel, rotK, legBack);
    let Mcloak = turn(Mtorso, L(A.cloak), cl);
    const sq = 1 - 0.25 * smoothstep(45, 80, rotAbs);
    if (sq < 0.999) Mcloak = mul(Mcloak, [1, 0, 0, sq, 0, A.cloak[1] * (1 - sq)]);

    // kilt flap: sheared forward (top edge fixed under the belt) by the forward
    // thigh, so its hem covers the thigh's top when a knee comes up
    // (a knee drawn up to the chest, as in a flip's tuck, lets the flap fall back:
    // else it covers the whole folded leg)
    const fwdMax = Math.max(fwdF, fwdN);
    const kiltDeg = Math.max(0, Math.min(26, 0.42 * (fwdMax - 8))) * (1 - 0.75 * smoothstep(80, 110, fwdMax));
    let Mkilt = Mtorso;
    if (kiltDeg > 0.2) {
      const t = Math.sin(kiltDeg * RAD), cs = Math.cos(kiltDeg * RAD);
      // source space: x' = x - t (y - top) (forward = -x in the art), y' = top + (y - top) cs
      Mkilt = mul(Mtorso, [1, 0, -t, cs, t * KILT_TOP, KILT_TOP * (1 - cs)]);
    }

    // arms. Hands go where the skeleton puts them (see wUp above)
    let tgtN = B.foreB.b, tgtF = B.foreF.b;
    if (wUp > 0) {
      const hB = FRh.J.handB, hF = FRh.J.handF;
      tgtN = [tgtN[0] + (hB[0] - tgtN[0]) * wUp, tgtN[1] + (hB[1] - tgtN[1]) * wUp];
      tgtF = [tgtF[0] + (hF[0] - tgtF[0]) * wUp, tgtF[1] + (hF[1] - tgtF[1]) * wUp];
    }
    // the near hand by the face (upright poses only): the mask is this figure's
    // face, so a hand never parks in front of it.
    //   at mask height in front of it (hat tip, win2): onto the helmet's front brim
    //   just below it (run's fist pump, guards): pushed down under the chin
    if (rotK > 0.5 && wUp < 0.5) {
      const hc = J.head, fw = [-tu[1], tu[0]];
      const rx = ((tgtN[0] - hc[0]) * fw[0] + (tgtN[1] - hc[1]) * fw[1]) / k;
      const ry = -((tgtN[0] - hc[0]) * tu[0] + (tgtN[1] - hc[1]) * tu[1]) / k; // + below the head centre
      const wHat = (1 - smoothstep(5.5, 7, ry)) * smoothstep(-8, -5, ry) * smoothstep(3, 5, rx) * rotK;
      const wFace = smoothstep(5.5, 7, ry) * (1 - smoothstep(13, 15, ry)) * smoothstep(-1, 2, rx) * rotK;
      if (wHat > 0) {
        const br = apply(Mhead, A.brim);
        tgtN = [tgtN[0] + (br[0] - tgtN[0]) * wHat, tgtN[1] + (br[1] - tgtN[1]) * wHat];
      }
      if (wFace > 0) {
        // (an open hand's fingers reach further: a little lower still)
        const dn = Math.max(0, ((pose.handB || 0) > 0.5 ? 17 : 14) - ry) * k * wFace;
        tgtN = [tgtN[0] - tu[0] * dn, tgtN[1] - tu[1] * dn];
      }
    }
    const staffOn = pose.wpnShow == null || pose.wpnShow > 0.5;
    // two-handed staff (fsmash wind-up, ...): a near hand close to the shaft wraps it
    if (staffOn && wUp < 0.5) {
      const cp = closestOnSeg(tgtN, J.butt, J.tip);
      const dd = d2(cp, tgtN);
      if (dd < 9 * k) {
        const w = 1 - smoothstep(5 * k, 9 * k, dd);
        tgtN = [tgtN[0] + (cp[0] - tgtN[0]) * w, tgtN[1] + (cp[1] - tgtN[1]) * w];
      }
    }
    const shNL = L(A.shN), shFL = L(A.shF);
    const [elN, haN] = limb(shNL, tgtN, null, LEN.upN, LEN.foN, q, armStretchN, 1, B.upperB, B.foreB);
    const [elF, gripL0] = limb(shFL, tgtF, null, LEN.upF, LEN.brace + LEN.fist, q, armStretchF, 1, B.upperF, B.foreF);
    const MupN = segmentAffine(A.shN, A.elN, shNL, elN, q, true);
    const MfoN = segmentAffine(A.elN, A.handN, elN, haN, q, true);
    const MupF = segmentAffine(A.shF, A.elF, shFL, elF, q, true);
    const foAng = angOf(elF, gripL0);
    const sF = d2(elF, gripL0) / (LEN.brace + LEN.fist); // local units per art px along the forearm
    const wristL = add(elF, foAng, LEN.brace * sF);
    const MbrF = segmentAffine(A.braceE, A.braceW, elF, wristL, q, true);
    // the fist bends toward the staff (limited), about the wrist
    const staffAng = B.staff.deg;
    const restRel = -90 - REST.fist; // staff (up) relative to the fist axis in the mockup
    const bend = staffOn ? Math.max(-40, Math.min(40, wrap(staffAng - foAng - restRel))) : 0;
    const fistAng = foAng + bend;
    const gripL = add(wristL, fistAng, LEN.fist * q);
    const Mfist = segmentAffine(A.fistW, A.grip, wristL, gripL, q, true);
    let Mstaff = place(A.grip, gripL, staffAng, q);
    // open hands (pose.handB / handF > 0.5); the staff hand stays a fist while it
    // holds the staff
    const openN = (pose.handB || 0) > 0.5;
    const openF = !staffOn && (pose.handF || 0) > 0.5;
    // the staff where it is not in the fist:
    //   ledge hang / climb: laid along the procedural figure's staff line (on the
    //   stage top), not through the raised fist and the helmet
    //   lying on the floor: along the skeleton's butt -> tip line, flat on the body
    // (both blend in over a few frames: matrices interpolated, no pop)
    const wLine = smoothstep(0.3, 0.7, hang);
    const wLie = (1 - smoothstep(0.35, 0.65, rotK)) * smoothstep(-18 * k, -10 * k, J.hip[1]) * (1 - smoothstep(0.35, 0.65, pose.air || 0));
    const lerpM = (M0, M1, t) => M0.map((v, i) => v + (M1[i] - v) * t);
    if (staffOn && wLine > 0) {
      const a = FRh.J.butt, b = FRh.J.tip, len = d2(a, b) || 1;
      Mstaff = lerpM(Mstaff, staffAlong([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [(b[0] - a[0]) / len, (b[1] - a[1]) / len], q), wLine);
    } else if (staffOn && wLie > 0) {
      const a = J.butt, b = J.tip, len = d2(a, b) || 1;
      const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // keep it on (not under) the floor: lift so the lower end sits at y <= -0.5k
      const hl = (STAFF_LEN * q) / 2;
      const lowY = Math.max(mid[1] + dir[1] * hl, mid[1] - dir[1] * hl);
      if (lowY > -0.5 * k) mid[1] -= lowY + 0.5 * k;
      Mstaff = lerpM(Mstaff, staffAlong(mid, dir, q), wLie);
    }
    // pauldrons lift a little with their upper arms
    const upNrel = wrap(angOf(shNL, elN) - (REST.upN + leanRel + (pose.rot || 0)));
    const upFrel = wrap(angOf(shFL, elF) - (REST.upF + leanRel + (pose.rot || 0)));
    const MpaN = turn(Mtorso, L(A.pauldN), Math.max(-14, Math.min(14, 0.22 * upNrel)));
    const MpaF = turn(Mtorso, L(A.pauldF), Math.max(-14, Math.min(14, 0.22 * upFrel)));

    const MthF = segmentAffine(A.hipF, A.kneeF, hipFL, knF, q, true);
    const MshF = segmentAffine(A.kneeF, A.ankF, knF, anF, q, true);
    const MthN = segmentAffine(A.hipN, A.kneeN, hipNL, knN, q, true);
    const MshN = segmentAffine(A.kneeN, A.ankN, knN, anN, q, true);
    const air = Math.max(0, Math.min(1, pose.air || 0));
    const foot = (kn, an, ankS, restShin) => {
      const shin = angOf(kn, an);
      const restRelF = 0 - restShin; // foot (flat, screen 0) relative to the shin at rest
      const nat = shin + restRelF + 14 * (1 - rotK * (1 - air)); // in the air the toes drop a little
      const h = -an[1] / k; // ankle height above the floor (figure units)
      const gnd = (1 - smoothstep(SHAPE.sole + 1.5, SHAPE.sole + 9, h)) * (1 - air) * rotK;
      let fa = nat + wrap(0 - nat) * gnd;
      const rel = Math.max(restRelF - 38, Math.min(restRelF + 42, wrap(fa - shin)));
      fa = shin + rel;
      return place(ankS, an, fa - 90, q);
    };
    const MftF = foot(knF, anF, A.ankF, REST.shinF);
    const MftN = foot(knN, anN, A.ankN, REST.shinN);

    // helmet wings beat a little with pose.wing
    const wing = pose.wing == null ? 0.3 : pose.wing;
    const flap = (wing - 0.3) * 9 + (wing > 0.6 ? Math.sin((c.time || 0) * 31) * 2.5 * (wing - 0.6) : 0);
    const MwN = turn(Mhead, apply(Mhead, A.wingN), -flap);
    const MwF = turn(Mhead, apply(Mhead, A.wingF), -flap * 0.7);

    // floor: when the figure is on the ground the cloak is cut at the floor line
    // (it rests on it) instead of hanging through it
    const low = Math.max(J.footF[1], J.footB[1], J.hip[1], J.head[1], J.kneeF[1], J.kneeB[1]);
    // (grounded poses: y = 0 is the floor; not while hanging below a ledge corner)
    const onFloor = air < 0.5 && J.hip[1] < 2 * k && low > -(SHAPE.sole + 16) * k;
    const clipY = onFloor ? 0.6 * k : null;

    // the staff fist inside the torso's silhouette (staff arm reaching across the
    // body): staff and fist come in front of the torso, else the shaft floats with
    // no hand on it
    const fistFront = staffOn && wUp < 0.5 && inPoly(gripL, TORSO_HULL.map(L));
    const staffParts = [];
    if (staffOn) staffParts.push(partM('staff', Mstaff));
    staffParts.push(openF ? partM('openF', MbrF) : partM('fistF', Mfist));
    out.push(partM('cloak', Mcloak, clipY));
    out.push(partM('footF', MftF), partM('shinF', MshF), partM('thighF', MthF));
    out.push(partM('footN', MftN), partM('shinN', MshN), partM('thighN', MthN));
    out.push(partM('uarmF', MupF), partM('braceF', MbrF));
    if (!fistFront) out.push(...staffParts);
    out.push(partM('torso', Mtorso), partM('kilt', Mkilt));
    if (fistFront) out.push(...staffParts);
    out.push(partM('pauldronF', MpaF), partM('uarmN', MupN));
    if (openN) out.push(partM('braceN', MfoN), partM('openN', MfoN));
    else out.push(partM('farmN', MfoN));
    out.push(partM('pauldronN', MpaN));
    out.push(partM('head', Mhead), partM('wingF', MwF), partM('wingN', MwN));
    return { list: out, q, gripL, staffAng, MfoN, openN };
  }

  // see-through frames (pose.fade, opts.alpha < 1): the parts are painted opaque
  // into one offscreen canvas, which is then drawn once with the combined alpha, so
  // overlaps between parts do not show (a faded figure, not a stack of faded
  // cutouts). One canvas, grown as needed and reused; no readback.
  let OFF = null;
  function paintFaded(g, c, S) {
    const T = g.getTransform();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [p, M] of S.list) {
      if (!p) continue;
      const W = mul([T.a, T.b, T.c, T.d, T.e, T.f], M);
      for (const [px, py] of [[p.x, p.y], [p.x + p.w, p.y], [p.x, p.y + p.h], [p.x + p.w, p.y + p.h]]) {
        const X = W[0] * px + W[2] * py + W[4], Y = W[1] * px + W[3] * py + W[5];
        if (X < x0) x0 = X;
        if (X > x1) x1 = X;
        if (Y < y0) y0 = Y;
        if (Y > y1) y1 = Y;
      }
    }
    const cvs = g.canvas;
    if (cvs && cvs.width) {
      x0 = Math.max(x0, 0); y0 = Math.max(y0, 0);
      x1 = Math.min(x1, cvs.width); y1 = Math.min(y1, cvs.height);
    }
    x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2;
    const w = Math.ceil(x1) + 2 - x0, h = Math.ceil(y1) + 2 - y0;
    if (!(w > 0 && h > 0) || w * h > 4096 * 4096 || typeof document === 'undefined') return paint(g, c, S);
    if (!OFF) OFF = document.createElement('canvas');
    if (OFF.width < w || OFF.height < h) {
      OFF.width = Math.max(OFF.width, w);
      OFF.height = Math.max(OFF.height, h);
    }
    const o = OFF.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, w, h);
    o.globalAlpha = 1;
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = g.imageSmoothingQuality || 'high';
    o.setTransform(T.a, T.b, T.c, T.d, T.e - x0, T.f - y0);
    paint(o, c, S);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(OFF, 0, 0, w, h, x0, y0, w, h);
    g.restore();
  }

  // draw the solved parts (local feet space is the current transform)
  function paint(g, c, S) {
    const T = g.getTransform();
    const px = Math.hypot(T.a, T.b) * S.q;
    const l = R.level(px);
    const f = 1 << l;
    for (const [p, M, clip] of S.list) {
      if (!p || !p.lv) continue;
      const cv = R.image(p, l, c.own ? null : c.ink);
      const o = p.off[l] * f;
      g.save();
      if (clip != null) {
        g.beginPath();
        g.rect(-1e4, -1e4, 2e4, 1e4 + clip);
        g.clip();
      }
      g.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
      g.drawImage(cv, p.x - o, p.y - o, cv.width * f, cv.height * f);
      g.restore();
    }
  }

  // detached caduceus (taunts): the mockup's staff, grip at `grip`, pointing angDeg
  // (dirv degrees: 0 down, 90 forward, 180 up)
  function propCaduceus(g, ink, grip, angDeg, k) {
    const p = P.staff;
    if (!p || !p.lv) return;
    const q = k / PXU;
    // The animations place the grip for the procedural staff (26 units of shaft
    // below the grip, 46 above); this staff is longer below the grip. A staff
    // standing up with its butt near the floor (planted: down taunt) slides along
    // its axis so the butt stands ON the floor (y = 0 in local feet space) instead
    // of sinking into it.
    // Elsewhere (in a hand, tucked under an arm) it slides half the difference, so
    // neither end sticks out far past where the procedural staff's ends are.
    const td = dirv(angDeg);
    const buttY = grip[1] - td[1] * (SHAPE.staffButt - 0.5) * k;
    const sl = td[1] < -0.8 && Math.abs(buttY) < 40 * k ? -buttY / td[1] : 0.5 * (SHAPE.staffButt - 26) * k;
    grip = [grip[0] + td[0] * sl, grip[1] + td[1] * sl];
    const M = place(A.grip, grip, 90 - angDeg, q);
    const T = g.getTransform();
    const l = R.level(Math.hypot(T.a, T.b) * q);
    const f = 1 << l;
    const own = !ink || ink === INK.blue;
    const cv = R.image(p, l, own ? null : ink);
    const o = p.off[l] * f;
    g.save();
    g.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
    g.drawImage(cv, p.x - o, p.y - o, cv.width * f, cv.height * f);
    g.restore();
  }

  // one part drawn with matrix M (props)
  function drawPart(g, p, M, ink, q) {
    if (!p || !p.lv) return;
    const T = g.getTransform();
    const l = R.level(Math.hypot(T.a, T.b) * q);
    const f = 1 << l;
    const own = !ink || ink === INK.blue;
    const cv = R.image(p, l, own ? null : ink);
    const o = p.off[l] * f;
    g.save();
    g.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
    g.drawImage(cv, p.x - o, p.y - o, cv.width * f, cv.height * f);
    g.restore();
  }
  // the last solved figure, for props drawn by the animation's fx right after it
  let LAST = null;
  // heel wing (talaria): the mockup's boot wing, root at (x, y), pointing angDeg + flap
  // (dirv degrees), len long
  function propTalaria(g, ink, x, y, angDeg, len, flap) {
    const d = dirv(angDeg + flap);
    const M = segmentAffine(A.talRoot, A.talTip, [x, y], [x + d[0] * len, y + d[1] * len], null, true);
    drawPart(g, P.talaria, M, ink, len / d2(A.talRoot, A.talTip));
  }
  // a hand over a prop (hat tip): the near forearm and fist redrawn on top
  function propHand(g, ink) {
    // only the hand itself comes in front (clipped round the hand): the forearm
    // stays behind the head instead of crossing the mask
    if (!LAST) return;
    const M = LAST.MfoN, c0 = apply(M, A.handC);
    g.save();
    g.beginPath();
    g.arc(c0[0], c0[1], 37 * LAST.q, 0, Math.PI * 2);
    g.clip();
    drawPart(g, LAST.openN ? P.openN : P.farmN, M, ink, LAST.q);
    g.restore();
  }

  const SKIN = registerSkin(/*@KEY@*/, {
    name: 'Masked Herald',
    char: 'hermes',
    shape: SHAPE,
    ready: PUPPET.ready,
    props: {
      caduceus: (g, ink, grip, ang, k) => propCaduceus(g, ink, grip, ang, k),
      face: null, // the mask hides the face: no wink / smirk / pout overlays
      talaria: (g, ink, x, y, ang, len, flap) => propTalaria(g, ink, x, y, ang, len, flap),
      hand: (g, ink) => propHand(g, ink),
    },
    draw(g, pose, x, y, opts) {
      const c = skinBegin(g, SKIN, pose, x, y, opts);
      if (c.drawn) {
        LAST = solveParts(c, pose);
        if (g.globalAlpha < 0.995) paintFaded(g, c, LAST);
        else paint(g, c, LAST);
      }
      return skinEnd(g, c);
    },
  });
})();
