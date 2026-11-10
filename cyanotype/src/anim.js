// ---------------------------------------------------------------------------
// Hermes Arena — animation registry.
//
// Every move a character can do is one animation definition. The same
// definition drives the game, the animation viewer and the sheet renderer.
//
// Coordinates. Animations are authored in "local feet space": origin at the
// fighter's feet point, facing +x, y down, already scaled (1 unit = 1 world px
// at the fighter's scale). Joint positions come from the character's frame
// solver as J = { hip, sh, head, top, center, handF, handB, elbowF, elbowB,
// footF, footB, kneeF, kneeB, tip, butt, mid, pivot, k }. J.k is the scale.
//
// Definition fields:
//   name     unique id, e.g. 'fsmash'
//   label    human name, e.g. 'Forward smash'
//   group    one of ANIM_GROUPS
//   input    how the player triggers it, e.g. 'Attack + forward'
//   notes    one line on what the motion is
//   frames   duration in 60 fps frames (loops use one cycle)
//   loop     true for cycles (idle, run, shield hold)
//   pose(f, c)      -> partial pose (merged onto BASE_POSE). f is a float frame.
//   fx(g, f, c)     optional effects drawn over the figure (local feet space)
//   fxBack(g, f, c) optional effects drawn behind the figure
//   hit      [{ f: [first, last], at: jointName | [x, y], off: [dx, dy], r, dmg, kb, ang }]
//            r and off are in figure units (multiplied by J.k). ang is the launch
//            angle in degrees (0 = forward, 90 = up). Hitboxes follow the joint.
//   intan    [[first, last]] intangible frames (dodges)
//   armor / counter  [[first, last]] frames where a counter or armor is live
//   charge   { f } frame where a smash attack holds while charging
//   motion(f, c)    optional -> { vx, vy, grav, fall } physics hints, vx facing-relative
//   cancel   frame from which the move can be interrupted (IASA)
//   landLag  landing lag frames (aerials and air specials)
//   next     name of the animation that follows automatically
//   air      true when the move is used in the air
//
// The context c holds: time (seconds, for ambient flutter), charge (0..1),
// face (1 or -1), vx, vy, k, ink, J (joints this frame), sample(frame) -> J at
// another frame of the same animation (for trails), def (this definition),
// rnd (seeded random for this frame), opp (optional dummy opponent info),
// skin (skin id or null), S (the skin's SHAPE at this scale) and
// drawFigure(g, pose, x, y, opts): draws a figure with the active skin (use it
// for afterimages and dummies instead of calling drawHermes directly).
//
// Skins (src/skins.js): every function below takes an optional skin id
// (opts.skin / extra.skin / the 6th argument of animJoints). The skin supplies
// the SHAPE, frame solver and drawer; null or unknown ids use the character's
// own (CHARACTERS[charId].shape / frame / draw = the procedural figure).
// ---------------------------------------------------------------------------

const ANIM_GROUPS = [
  'Stand and move',
  'Jump and air',
  'Ledge',
  'Shield and dodge',
  'Ground attacks',
  'Smash attacks',
  'Aerial attacks',
  'Specials',
  'Grab and throws',
  'Hit and recovery',
  'Taunts and results',
];

const CHARACTERS = {
  hermes: {
    id: 'hermes',
    name: 'Hermes',
    shape: HERMES_SHAPE,
    scale: 1.42,
    frame: hermesFrame,
    draw: drawHermes,
  },
};

const ANIMS = {}; // ANIMS[charId][name] = def
const ANIM_ORDER = {}; // ANIM_ORDER[charId] = [names in definition order]

function defineAnims(charId, defs) {
  const book = (ANIMS[charId] = ANIMS[charId] || {});
  const order = (ANIM_ORDER[charId] = ANIM_ORDER[charId] || []);
  for (const d of defs) {
    if (!d || !d.name) throw new Error('animation without a name');
    if (!book[d.name]) order.push(d.name);
    book[d.name] = Object.assign({ loop: false, frames: 30, group: 'Stand and move', label: d.name, input: '', notes: '' }, d);
  }
}

// { shape, frame, draw, ... } used to solve and draw charId with an optional skin.
function charRig(charId, skin) {
  if (skin && typeof getSkin === 'function') {
    const s = getSkin(skin, charId);
    if (s) return s;
  }
  return CHARACTERS[charId];
}
// The drawer to use right now: a skin whose images are still loading draws the
// character's own (procedural) figure until it is ready.
function rigDrawer(charId, rig) {
  return rig.isReady === false ? CHARACTERS[charId].draw : rig.draw;
}

function getAnim(charId, name) {
  const book = ANIMS[charId];
  return (book && book[name]) || null;
}

// Full pose for a definition at frame f.
function animPose(def, f, c) {
  const fr = def.loop ? ((f % def.frames) + def.frames) % def.frames : clamp(f, 0, def.frames);
  const p = def.pose ? def.pose(fr, c) : {};
  return Object.assign({}, BASE_POSE, p);
}

// Joints of the animation at frame f, without drawing. skin: optional skin id
// (defaults to c.skin).
function animJoints(charId, def, f, c, scale, skin) {
  const ch = CHARACTERS[charId];
  const rig = charRig(charId, skin !== undefined ? skin : c && c.skin);
  const S = Object.assign({}, rig.shape, { scale: scale || ch.scale });
  return rig.frame(animPose(def, f, c), S).J;
}

// Build a context object for a frame.
function animContext(charId, def, f, extra) {
  const ch = CHARACTERS[charId];
  const scale = (extra && extra.scale) || ch.scale;
  const c = Object.assign({ time: 0, charge: 0, face: 1, vx: 0, vy: 0, ink: INK.blue }, extra || {});
  c.k = scale;
  c.skin = c.skin || null;
  const rig = charRig(charId, c.skin);
  c.S = Object.assign({}, rig.shape, { scale });
  c.drawFigure = (g, pose, x, y, o) => rigDrawer(charId, rig)(g, pose, x, y, Object.assign({ skin: c.skin }, o));
  c.def = def;
  c.f = f;
  c.rnd = mulberry32(Math.floor(f * 7919) + 17);
  // sample(frame) solves joints at another frame of the same animation
  const cache = new Map();
  c.sample = (fr) => {
    const key = Math.round(fr * 100);
    if (!cache.has(key)) {
      const cc = Object.assign({}, c, { sample: null });
      cache.set(key, animJoints(charId, def, fr, cc, scale, c.skin));
    }
    return cache.get(key);
  };
  return c;
}

// Positions of one joint over the frames leading up to f (oldest first).
function trailOf(c, key, span, step) {
  const pts = [];
  const st = step || 1;
  const from = Math.max(0, c.f - span);
  for (let fr = from; fr <= c.f + 1e-6; fr += st) {
    const J = c.sample(fr);
    pts.push(Array.isArray(key) ? key.map((k) => J[k]) : J[key]);
  }
  return pts;
}

// Hitboxes live at frame f, resolved to local feet space.
function liveHitboxes(def, f, J) {
  const out = [];
  if (!def.hit) return out;
  const fi = Math.floor(f);
  for (const h of def.hit) {
    if (fi < h.f[0] || fi > h.f[1]) continue;
    const base = typeof h.at === 'string' ? J[h.at] : [h.at[0] * J.k, h.at[1] * J.k];
    if (!base) continue;
    const off = h.off || [0, 0];
    out.push({ x: base[0] + off[0] * J.k, y: base[1] + off[1] * J.k, r: (h.r || 8) * J.k, h });
  }
  return out;
}

const inRanges = (ranges, f) => !!ranges && ranges.some(([a, b]) => f >= a && f <= b);

// Phase of frame f: 'startup', 'active', 'endlag' or 'move' (no hitboxes).
function animPhase(def, f) {
  if (!def.hit || !def.hit.length) return 'move';
  const first = Math.min(...def.hit.map((h) => h.f[0]));
  const last = Math.max(...def.hit.map((h) => h.f[1]));
  if (f < first) return 'startup';
  if (f <= last) return 'active';
  return 'endlag';
}

// Draw one frame of an animation with its effects. (x, y) = feet in world space.
// opts: { face, ink, time, charge, vx, vy, scale, alpha, boxes, opp, skin }
function drawAnimFrame(g, charId, name, f, x, y, opts) {
  const ch = CHARACTERS[charId];
  const rig = charRig(charId, opts && opts.skin);
  const def = typeof name === 'string' ? getAnim(charId, name) : name;
  const o = opts || {};
  const face = o.face || 1;
  const c = animContext(charId, def, f, o);
  let pose = animPose(def, f, c);
  // game-side adjustments: crossfade from the previous animation, extra rotation
  if (o.blend && o.blend.t < 1) pose = mixPose(o.blend.pose, pose, o.blend.t);
  if (o.adjust) pose = o.adjust(pose) || pose;
  const scale = o.scale || ch.scale;
  const S = Object.assign({}, rig.shape, { scale });
  c.J = rig.frame(pose, S).J;
  c.pose = pose;
  const local = (fn) => {
    g.save();
    g.translate(x, y);
    g.scale(face, 1);
    if (o.alpha != null) g.globalAlpha *= o.alpha;
    try {
      fn();
    } finally {
      g.restore();
    }
  };
  if (def.fxBack) local(() => def.fxBack(g, f, c));
  const out = rigDrawer(charId, rig)(g, pose, x, y, { face, ink: o.ink, vx: o.vx, vy: o.vy, scale, time: o.time, alpha: o.alpha, skin: c.skin });
  if (def.fx) local(() => def.fx(g, f, c));
  if (o.boxes) local(() => drawBoxes(g, def, f, c.J));
  return { out, J: c.J, pose, c };
}

// Debug overlay: hitboxes (sanguine), intangibility (outline), counter frames.
function drawBoxes(g, def, f, J) {
  g.save();
  for (const b of liveHitboxes(def, f, J)) {
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(200, 40, 30, 0.28)';
    g.fill();
    g.strokeStyle = 'rgba(160, 20, 10, 0.9)';
    g.lineWidth = 1.5;
    g.stroke();
  }
  const fi = Math.floor(f);
  if (inRanges(def.intan, fi) || inRanges(def.counter, fi) || inRanges(def.armor, fi)) {
    const col = inRanges(def.intan, fi) ? 'rgba(40, 120, 220, 0.9)' : 'rgba(200, 150, 20, 0.95)';
    g.strokeStyle = col;
    g.setLineDash([5, 4]);
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(J.center[0], J.center[1] - 4 * J.k, 26 * J.k, 46 * J.k, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
  g.restore();
}

// ---- shared effect helpers (local feet space) --------------------------------

// Engraved crescent trail behind a moving point pair (e.g. caduceus tip/hand).
// pts: array of [outer, inner] point pairs, oldest first.
function fxCrescent(g, ink, pts, alpha) {
  if (pts.length < 3) return;
  g.save();
  g.globalAlpha *= alpha == null ? 1 : alpha;
  const P = inkPatterns(g, ink);
  g.beginPath();
  g.moveTo(pts[0][0][0], pts[0][0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0][0], pts[i][0][1]);
  for (let i = pts.length - 1; i >= 0; i--) {
    const w = i / (pts.length - 1);
    const [a, b] = pts[i];
    g.lineTo(lerp(a[0], b[0], 0.2 + 0.5 * w), lerp(a[1], b[1], 0.2 + 0.5 * w));
  }
  g.closePath();
  g.fillStyle = rgba(PAPER_LIGHT, 0.75);
  g.fill();
  g.fillStyle = P.hatch;
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = 1.5;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0][0][0], pts[0][0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0][0], pts[i][0][1]);
  g.stroke();
  // a few engraved speed lines along the arc
  g.lineWidth = 0.7;
  for (let s = 0.25; s < 1; s += 0.25) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [a, b] = pts[i];
      const w = i / (pts.length - 1);
      const p = [lerp(a[0], b[0], s * (0.2 + 0.5 * w)), lerp(a[1], b[1], s * (0.2 + 0.5 * w))];
      if (i === 0) g.moveTo(p[0], p[1]);
      else g.lineTo(p[0], p[1]);
    }
    g.stroke();
  }
  g.restore();
}

// Straight speed lines behind a point, pointing along dir (unit vector).
function fxSpeedLines(g, ink, at, dir, len, spread, n, alpha, rnd) {
  g.save();
  g.globalAlpha *= alpha == null ? 1 : alpha;
  g.strokeStyle = ink;
  g.lineCap = 'round';
  const nx = -dir[1];
  const ny = dir[0];
  for (let i = 0; i < n; i++) {
    const o = (i / Math.max(1, n - 1) - 0.5) * spread + (rnd ? (rnd() - 0.5) * spread * 0.2 : 0);
    const L = len * (0.55 + (rnd ? rnd() : 0.5) * 0.45);
    const sx = at[0] + nx * o;
    const sy = at[1] + ny * o;
    g.lineWidth = 0.6 + (rnd ? rnd() : 0.5) * 1.1;
    line(g, sx, sy, sx - dir[0] * L, sy - dir[1] * L);
  }
  g.restore();
}

// Wind spiral / gust (Hermes' signature effect).
function fxGust(g, ink, cx, cy, r, turn, alpha) {
  g.save();
  g.globalAlpha *= alpha == null ? 1 : alpha;
  g.strokeStyle = ink;
  g.lineCap = 'round';
  for (let j = 0; j < 3; j++) {
    g.lineWidth = 1.6 - j * 0.4;
    g.beginPath();
    const R = r * (1 - j * 0.22);
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const a = turn + j * 2.1 + t * Math.PI * 1.5;
      const rr = R * (0.35 + 0.65 * t);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr * 0.6;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }
  g.restore();
}

// Loose feather drifting (shed from talaria or wings).
function fxFeather(g, ink, x, y, ang, L, alpha) {
  g.save();
  g.globalAlpha *= alpha == null ? 1 : alpha;
  g.beginPath();
  featherPath(g, x, y, ang, L, L * 0.22);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  g.fillStyle = inkPatterns(g, ink).hatch;
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = 0.9;
  g.stroke();
  g.restore();
}

// Impact star (hit spark) in engraving style.
function fxSpark(g, ink, x, y, r, t, alpha) {
  g.save();
  g.globalAlpha *= (alpha == null ? 1 : alpha) * (1 - t);
  g.strokeStyle = ink;
  g.lineCap = 'round';
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const r0 = r * (0.25 + t * 0.5);
    const r1 = r * (0.7 + t * 0.6) * (i % 2 ? 0.6 : 1);
    g.lineWidth = i % 2 ? 1 : 2;
    line(g, x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1);
  }
  g.beginPath();
  g.arc(x, y, r * 0.22 * (1 - t * 0.5), 0, Math.PI * 2);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  g.lineWidth = 1.4;
  g.stroke();
  g.restore();
}

// Ground dust puff pair at the feet (local feet space, y = 0 is the floor).
function fxDustPuff(g, ink, x, t, size, dir) {
  g.save();
  const r = size * (0.4 + t * 0.8);
  g.globalAlpha *= (1 - t) * 0.9;
  const P = inkPatterns(g, ink);
  for (const s of dir ? [dir] : [-1, 1]) {
    g.beginPath();
    g.arc(x + s * (6 + t * size * 1.4), -r * 0.6, r, 0, Math.PI * 2);
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    g.fillStyle = P.hatch;
    g.fill();
    g.strokeStyle = ink;
    g.lineWidth = 1;
    g.stroke();
  }
  g.restore();
}
