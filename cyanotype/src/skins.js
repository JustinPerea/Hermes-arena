// ---------------------------------------------------------------------------
// Hermes Arena — skins: interchangeable art for one character skeleton.
//
// Animations are defined once per character (src/anims/*). A SKIN decides how
// the solved skeleton is drawn, and may bring its own SHAPE (bone lengths) so
// the skeleton, hitboxes and joints J match its art. Skins of 'hermes':
//   procedural  the original code-drawn figure (drawHermes)
//   masked      Masked Herald cutout puppet   (src/skins/masked.js, GENERATED)
//   classic     Classical Messenger puppet    (src/skins/classic.js, GENERATED)
//
// registerSkin(id, def) -> skin
//   def.name     display name
//   def.char     character id (default 'hermes')
//   def.shape    partial SHAPE merged onto CHARACTERS[char].shape. Fields: torso,
//                neck, headR, upper, fore, thigh, shin, shoulder (figure units) and
//                the optional hipW, shDrop, sole, crown, staffTip, staffButt (see
//                HERMES_SHAPE in src/figure.js). NOTE: the animations solve their
//                foot / hand IK with HERMES_SHAPE, so changing the limb lengths
//                (thigh, shin, upper, fore, torso, hipW, shoulder) makes planted
//                feet slide and ledge grips miss by the difference; prefer fitting
//                the art to the skeleton (stretch parts along their bones) and
//                change only head / crown / staff / sole freely.
//   def.frame    frame solver (default the character's: hermesFrame)
//   def.draw     draw(g, pose, x, y, opts) -> { tip, top, J }: same contract as
//                drawHermes. (x, y) = feet in the current space, opts = { face,
//                ink, scale, alpha, time, vx, vy, skin }. Must honour face, ink
//                (INK.blue = the skin's own print, others re-inked and cached),
//                alpha, pose.fade (>= 0.999 draws nothing) and return J from this
//                skin's own frame (skinBegin / skinEnd below do all of that).
//   def.ready    Promise resolved when the images are decoded (optional). Until
//                then drawAnimFrame draws the procedural figure instead.
//   def.props    optional overrides for props the animations draw in fx (see
//                skinProp): { caduceus, talaria, hand, face }. A key set to null
//                suppresses that prop for this skin.
//   def.preview  optional preview(g, x, y, opts): idle thumbnail (default: draw
//                BASE_POSE).
// ---------------------------------------------------------------------------

const SKINS = {}; // id -> skin
const SKIN_ORDER = []; // ids in registration order
// default skin per player slot (P1..P4); missing skins fall back to procedural
const SLOT_SKINS = ['masked', 'classic', 'masked', 'classic'];

function registerSkin(id, def) {
  const char = def.char || 'hermes';
  const ch = CHARACTERS[char];
  if (!ch) throw new Error('registerSkin: unknown character ' + char);
  if (typeof def.draw !== 'function') throw new Error('registerSkin: ' + id + ' needs draw()');
  const skin = Object.assign({}, def, {
    id,
    char,
    name: def.name || id,
    shape: Object.assign({}, ch.shape, def.shape || {}, { scale: 1 }),
    frame: def.frame || ch.frame,
    props: def.props || null,
    isReady: !def.ready,
    failed: false,
  });
  skin.ready = Promise.resolve(def.ready).then(
    () => {
      skin.isReady = true;
    },
    (e) => {
      // a skin whose images failed keeps drawing the procedural figure
      skin.failed = true;
      if (typeof console !== 'undefined') console.warn('skin ' + id + ' failed to load:', e && e.message ? e.message : e);
    },
  );
  if (!def.preview) skin.preview = (g, x, y, o) => skin.draw(g, Object.assign({}, BASE_POSE), x, y, o || {});
  if (!SKINS[id]) SKIN_ORDER.push(id);
  SKINS[id] = skin;
  ch.skins = ch.skins || {};
  ch.skins[id] = skin;
  return skin;
}

// skin by id for a character (null when unknown or for another character)
function getSkin(id, charId) {
  const s = id && SKINS[id];
  if (!s) return null;
  if (charId && s.char !== charId) return null;
  return s;
}

// [{ id, name }] of the skins a character can wear, in registration order
function skinList(charId) {
  return SKIN_ORDER.filter((id) => SKINS[id].char === (charId || 'hermes')).map((id) => ({ id, name: SKINS[id].name }));
}

// the skin after id in the list (wraps around)
function nextSkin(id, charId, dir) {
  const L = skinList(charId).map((s) => s.id);
  if (!L.length) return null;
  const i = L.indexOf(id);
  return L[(((i < 0 ? 0 : i + (dir || 1)) % L.length) + L.length) % L.length];
}

// default skin of a player slot (0-based)
function slotSkin(slot, charId) {
  const want = SLOT_SKINS[slot % SLOT_SKINS.length];
  return getSkin(want, charId || 'hermes') ? want : 'procedural';
}

function skinIsReady(id) {
  const s = SKINS[id];
  return !s || s.isReady;
}

// Promise resolved once every listed skin (default all) has loaded or failed.
function skinsReady(ids) {
  return Promise.all((ids || SKIN_ORDER).map((id) => (SKINS[id] ? SKINS[id].ready : null)));
}

// SHAPE of a skin at a scale (for frame())
function skinShape(skin, scale) {
  return Object.assign({}, skin.shape, { scale: scale || CHARACTERS[skin.char].scale });
}

// Props drawn by animation effects (detached caduceus, heel wings, a hand over
// a prop, face overlays such as a wink). Animations call
//   skinProp(c, name, ...args) || drawDefault(...args)
// It returns true when the active skin handled the prop (drew it, or set it to
// null to hide it), false when the procedural default should be drawn.
// Signatures (all in local feet space, facing +x):
//   caduceus(g, ink, grip, angDeg, k, wing, time)        like drawCaduceus
//   talaria(g, ink, x, y, angDeg, len, flap, shade, kk)  like drawWing (heel wing)
//   hand(g, ink, wrist, angDeg, mode, k, shade)          like drawHand
//   face(g, c, kind, amt)   kind: 'wink' | 'smirk' | 'pout' (amt 0..1)
function skinProp(c, name, ...args) {
  const s = c && c.skin ? getSkin(c.skin) : null;
  if (!s || !s.props || !(name in s.props) || !s.isReady) return false;
  const fn = s.props[name];
  if (fn) fn(...args);
  return true;
}

// ---- helpers for skin authors ------------------------------------------------
// 2D affine matrices as [a, b, c, d, e, f] (canvas setTransform order):
// x' = a x + c y + e, y' = b x + d y + f.
const AFF = {
  I: [1, 0, 0, 1, 0, 0],
  mul: (A, B) => [
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
  ],
  apply: (M, p) => [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]],
  inv: (M) => {
    const det = M[0] * M[3] - M[1] * M[2] || 1e-12;
    const a = M[3] / det, b = -M[1] / det, c = -M[2] / det, d = M[0] / det;
    return [a, b, c, d, -(a * M[4] + c * M[5]), -(b * M[4] + d * M[5])];
  },
  translate: (x, y) => [1, 0, 0, 1, x, y],
  scale: (sx, sy) => [sx, 0, 0, sy == null ? sx : sy, 0, 0],
  // rotation by deg (clockwise on screen, y down)
  rotate: (deg) => {
    const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R);
    return [c, s, -s, c, 0, 0];
  },
  // rotate by deg and scale (sx, sy) about point p
  about: (p, deg, sx, sy) => {
    const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R);
    const X = sx == null ? 1 : sx, Y = sy == null ? X : sy;
    const a = c * X, b = s * X, cc = -s * Y, d = c * Y;
    return [a, b, cc, d, p[0] - (a * p[0] + cc * p[1]), p[1] - (b * p[0] + d * p[1])];
  },
  // set on a context (multiplied onto its current transform)
  apply2d: (g, M) => g.transform(M[0], M[1], M[2], M[3], M[4], M[5]),
};

// Affine that carries the source segment s0 -> s1 (e.g. a bone of the rest
// pose, in puppet SOURCE pixels) onto the destination segment d0 -> d1 (the
// posed bone, e.g. in local feet space). Along the bone it scales by
// |d1 - d0| / |s1 - s0|; across it by `cross` (destination units per source
// unit; default the same as along = a similarity, no squash). mirror: true
// reflects across the bone (use it when the source art faces -x and the
// destination faces +x without a separate flip).
function segmentAffine(s0, s1, d0, d1, cross, mirror) {
  const ux = s1[0] - s0[0], uy = s1[1] - s0[1];
  const vx = d1[0] - d0[0], vy = d1[1] - d0[1];
  const Ls = Math.hypot(ux, uy) || 1e-9;
  const Ld = Math.hypot(vx, vy) || 1e-9;
  const along = Ld / Ls;
  const cr = cross == null ? along : cross;
  const u = [ux / Ls, uy / Ls], n = [-u[1], u[0]];
  const v = [vx / Ld, vy / Ld];
  const m = mirror ? [v[1], -v[0]] : [-v[1], v[0]];
  const a = along * v[0] * u[0] + cr * m[0] * n[0];
  const b = along * v[1] * u[0] + cr * m[1] * n[0];
  const c = along * v[0] * u[1] + cr * m[0] * n[1];
  const d = along * v[1] * u[1] + cr * m[1] * n[1];
  return [a, b, c, d, d0[0] - (a * s0[0] + c * s0[1]), d0[1] - (b * s0[0] + d * s0[1])];
}

// Every bone of a solved frame (FR = frame(pose, S), e.g. hermesFrame) in LOCAL
// FEET SPACE (origin at the feet, facing +x, y down, pose.rot / ox / oy / lift /
// air grounding all applied: the same space as J). Each bone is
//   { a, b, len, rad, deg }   a = root joint, b = end joint, rad / deg = screen
//   angle of a -> b (atan2, 0 = +x, 90 deg = straight down).
// Bones: torso (hip -> shoulder centre), neck (shoulder centre -> head centre),
// upperB / foreB (back arm: shoulder -> elbow -> wrist), upperF / foreF (front
// arm, holds the caduceus), thighB / shinB, thighF / shinF (hip -> knee ->
// ankle), footB / footF (ankle -> toe, the procedural sandal's direction),
// staff (butt -> tip, through the front hand), pelvis (back hip -> front hip),
// shoulders (back shoulder -> front shoulder).
// Also: rot (deg, the whole-body turn), headDeg (deg: the head's drawn tilt in
// the procedural figure = rot + lean * 0.4 + head), lean, k (scale), pivot.
function skinBones(FR, pose) {
  const sk = FR.sk, L = FR.toLocal, k = FR.J.k;
  const bone = (p, q) => {
    const a = L(p), b = L(q);
    const rad = Math.atan2(b[1] - a[1], b[0] - a[0]);
    return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]), rad, deg: rad / D2R };
  };
  const foot = (leg) => {
    const tilt = clamp(leg.ang * 0.35, -35, 50);
    const fd = dirv(90 + tilt);
    return bone(leg.f, [leg.f[0] + fd[0] * 11 * k, leg.f[1] + fd[1] * 11 * k]);
  };
  const rot = pose.rot || 0;
  const J = FR.J;
  const staffRad = Math.atan2(J.tip[1] - J.butt[1], J.tip[0] - J.butt[0]);
  return {
    torso: bone(sk.hip, sk.sh),
    neck: bone(sk.sh, sk.head),
    upperB: bone(sk.armB.s, sk.armB.e),
    foreB: bone(sk.armB.e, sk.armB.h),
    upperF: bone(sk.armF.s, sk.armF.e),
    foreF: bone(sk.armF.e, sk.armF.h),
    thighB: bone(sk.legB.h, sk.legB.k),
    shinB: bone(sk.legB.k, sk.legB.f),
    thighF: bone(sk.legF.h, sk.legF.k),
    shinF: bone(sk.legF.k, sk.legF.f),
    footB: foot(sk.legB),
    footF: foot(sk.legF),
    pelvis: bone(sk.legB.h, sk.legF.h),
    shoulders: bone(sk.armB.s, sk.armF.s),
    staff: { a: J.butt, b: J.tip, len: Math.hypot(J.tip[0] - J.butt[0], J.tip[1] - J.butt[1]), rad: staffRad, deg: staffRad / D2R },
    rot,
    lean: pose.lean,
    headDeg: rot + pose.lean * 0.4 + pose.head,
    k,
    pivot: FR.pivot,
  };
}

// Start drawing a skinned figure. Solves the skin's frame, then (unless the
// figure is invisible) saves g and moves it into LOCAL FEET SPACE: translate to
// (x, y), mirror by face, alpha and pose.fade applied. Returns a context:
//   { drawn, skin, pose, S, k, unit, FR, J, sk, face, x, y, ink, own, time,
//     opts, bones() }
// unit = k / CHARACTERS[char].scale (1 at the fighter's normal scale: a puppet
// authored at game scale draws with g.scale(unit, unit)). own = the skin's own
// print (ink is INK.blue or unset). Draw only when ctx.drawn, then always
// return skinEnd(g, ctx).
function skinBegin(g, skin, pose, x, y, opts) {
  const o = opts || {};
  const base = CHARACTERS[skin.char].scale;
  const k = o.scale || base;
  const S = skinShape(skin, k);
  const FR = skin.frame(pose, S);
  const face = o.face || 1;
  const ctx = {
    drawn: false, skin, pose, S, k, unit: k / base, FR, J: FR.J, sk: FR.sk, face, x, y,
    ink: o.ink || INK.blue, own: !o.ink || o.ink === INK.blue, time: o.time || 0, opts: o,
  };
  let B = null;
  ctx.bones = () => B || (B = skinBones(FR, pose));
  if ((pose.fade || 0) >= 0.999 || o.alpha === 0) return ctx;
  g.save();
  g.translate(x, y);
  g.scale(face, 1);
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  if (pose.fade > 0) g.globalAlpha *= 1 - pose.fade;
  ctx.drawn = true;
  return ctx;
}

// Finish a skinned figure: restores g and returns { tip, top, J } like drawHermes.
function skinEnd(g, ctx) {
  if (ctx.drawn) g.restore();
  return skinResult(ctx.J, ctx.x, ctx.y, ctx.face);
}

// { tip, top, J } in world space from local joints J
function skinResult(J, x, y, face) {
  return { tip: [x + J.tip[0] * face, y + J.tip[1]], top: [x + J.top[0] * face, y + J.top[1]], J };
}

// ---- the procedural figure is a skin too ---------------------------------------
registerSkin('procedural', {
  name: 'Procedural',
  char: 'hermes',
  shape: HERMES_SHAPE,
  frame: hermesFrame,
  draw: drawHermes,
});
