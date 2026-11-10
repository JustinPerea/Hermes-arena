// ---------------------------------------------------------------------------
// Hermes Arena — match: the rules of a fight with no screen attached.
// Stage data, hit resolution, projectiles, stocks and the win condition live
// here so the same code runs in the game (src/game.js extends Match) and in
// the headless balance checks (tools/engine.cjs).
// ---------------------------------------------------------------------------

const FOOT = 10; // how far a fighter's centre may overhang a solid edge and still stand on it

// Shared engine rules (roster doc, "Shared engine rules"). Every fighter is
// balanced against these numbers, so change them here and nowhere else.
const RULES = {
  stocks: 3,
  smashCharge: 0.4, // a full 60-frame charge scales damage and knockback by 1 + 0.4
  smashChargeFrames: 60,
  hitstunGravity: 0.5, // gravity multiplier while in hitstun
  shieldstun: (dmg) => Math.round(2 + 0.8 * dmg),
  ledgeHittableAfter: 30, // frames a fresh ledge grab is safe
  counterMult: 1.2, // counter strike = 1.2 x the absorbed hit's damage ...
  counterMin: 8, // ... clamped to 8% ...
  counterMax: 18, // ... and 18%
  tripFrames: 30, // a trip is a knockdown with no launch, actionable after this
  knockdownFrames: 20,
};

const STAGES = {
  agora: {
    name: 'Altar of the Agora',
    // solid blocks (walkable tops, walls)
    solids: [
      { l: 300, r: 980, t: 470, b: 600 },
      { l: 300, r: 560, t: 452, b: 470 },
      { l: 720, r: 980, t: 452, b: 470 },
    ],
    // pass-through platforms
    plats: [
      { l: 382, r: 548, t: 318, soft: true },
      { l: 732, r: 898, t: 318, soft: true },
      { l: 562, r: 718, t: 190, soft: true },
    ],
    ledges: [{ x: 300, y: 452, side: -1 }, { x: 980, y: 452, side: 1 }],
    blast: { l: -320, r: 1600, t: -480, b: 1100 },
    spawns: [{ x: 430, y: 452 }, { x: 850, y: 452 }, { x: 600, y: 190 }, { x: 680, y: 190 }],
    respawn: { x: 640, y: 60 },
    art: { x0: 230, y0: 410, x1: 1050, y1: 700 },
    floorY: 640,
    // world rectangle the camera may show
    camBounds: { l: -200, r: 1480, t: -330, b: 820 },
  },
};

const SILENT_SFX = { play() {}, ensure() {}, close() {}, muted: true };

// Indices of the hit entries that belong to the same strike as entry i.
function hitGroup(def, i) {
  if (!def._hitGroups) {
    const H = def.hit;
    const grp = H.map((_, k) => k);
    const find = (k) => (grp[k] === k ? k : (grp[k] = find(grp[k])));
    for (let a = 0; a < H.length; a++)
      for (let b = a + 1; b < H.length; b++) {
        const A = H[a];
        const B = H[b];
        const same = A.group != null || B.group != null ? A.group === B.group : A.f[0] <= B.f[1] + 1 && B.f[0] <= A.f[1] + 1;
        if (same) grp[find(a)] = find(b);
      }
    def._hitGroups = H.map((_, k) => H.map((__, j) => j).filter((j) => find(j) === find(k)));
  }
  return def._hitGroups[i] || [i];
}

// Armor entries are [first, last] or [first, last, maxDamage]: a hit whose
// damage is below maxDamage is absorbed (damage taken, no flinch).
function armorHolds(def, f, dmg) {
  if (!def || !def.armor) return false;
  return def.armor.some(([a, b, max]) => f >= a && f <= b && (max == null || dmg < max));
}

class Match {
  constructor(options) {
    this.options = options || {};
    this.stage = STAGES[this.options.stage] || STAGES.agora;
    this.sfx = this.options.sfx || SILENT_SFX;
    this.fx = [];
    this.shake = 0;
    this.frame = 0;
    this.time = 0;
    this.setupMatch(this.options.fighters || ['hermes', 'hermes'], this.options.stocks);
  }
  // fighters: ids from FIGHTER_DEFS, one per slot. stocks: a number, or
  // Infinity for training (nobody is ever eliminated).
  setupMatch(ids, stocks) {
    this.fighters = ids.map((id, i) => new Fighter(FIGHTER_DEFS[id] || FIGHTER_DEFS.hermes, i, this.stage.spawns[i]));
    for (const f of this.fighters) {
      f.stocks = stocks == null ? RULES.stocks : stocks;
      f.out = false;
      f.kos = 0;
      f.falls = 0;
    }
    this.stocks = stocks == null ? RULES.stocks : stocks;
    this.fx = [];
    this.result = null;
    this.matchFrame = 0;
  }
  // one fixed 60 Hz step of the fight (input is already fed to each controller)
  simulate() {
    this.matchFrame++;
    for (const f of this.fighters) {
      if (!f.out) f.update(this);
      if (f.skinFlash > 0) f.skinFlash--;
    }
    this.updateEffects();
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 1);
  }
  // Called by a fighter crossing the blast zone. Returns false when that was
  // their last stock (they leave the match instead of respawning).
  onKO(f) {
    f.falls++;
    if (f.lastHitBy && f.lastHitBy !== f) f.lastHitBy.kos++;
    if (!isFinite(f.stocks)) return true;
    f.stocks--;
    if (f.stocks > 0) return true;
    f.out = true;
    const left = this.fighters.filter((x) => !x.out);
    if (left.length <= 1 && !this.result) this.result = { winner: left[0] || null, frame: this.matchFrame };
    return false;
  }
  // ---- combat ---------------------------------------------------------------------
  // Hurt capsules follow the drawn pose: hip to head, hip to each foot.
  hurtCapsules(t) {
    const def = t.book[t.anim] || t.book.idle;
    const J = t.J || animJoints(t.def.anim, def, t.animF, animContext(t.def.anim, def, t.animF, { skin: t.skin, scale: t.def.scale }), t.def.scale, t.skin);
    const w = (p) => [t.x + t.face * p[0], t.y + p[1]];
    const hip = w(J.hip);
    return [[hip, w(J.head), 21], [hip, w(J.footF), 13], [hip, w(J.footB), 13]];
  }
  overlaps(t, x, y, r) {
    for (const [a, b, cr] of this.hurtCapsules(t)) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy || 1;
      const u = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0, 1);
      const px = a[0] + dx * u - x;
      const py = a[1] + dy * u - y;
      if (px * px + py * py <= (r + cr) * (r + cr)) return true;
    }
    return false;
  }
  targets(att) {
    return this.fighters.filter((f) => f !== att && !f.out && this.inPlay(f));
  }
  inPlay() {
    return true;
  }
  // can t be struck right now?
  hittable(t) {
    if (t.out || t.intangible() || t.state === 'respawn' || t.heldBy) return false;
    if (t.state === 'ledge' && t.stateT < RULES.ledgeHittableAfter) return false;
    return true;
  }
  // The hit as it lands: smash charge and counter strikes change the numbers.
  strikeOf(att, h) {
    const m = att.move;
    const d = att.moveDef();
    let out = h;
    if (m && d && d.charge && m.charge > 0 && !h.grab) {
      const k = 1 + RULES.smashCharge * m.charge;
      out = Object.assign({}, out, { dmg: (out.dmg || 0) * k, kb: (out.kb == null ? 3 : out.kb) * k });
    }
    if (m && m.strikeDmg != null && !h.grab) out = Object.assign({}, out, { dmg: m.strikeDmg });
    return out;
  }
  checkHits(att) {
    const d = att.moveDef();
    if (!d || !d.hit || !att.move) return;
    const m = att.move;
    const f = Math.floor(att.animF);
    // throws and pummels only touch the fighter being held
    if (/^throw_|^pummel/.test(m.name)) {
      const v = att.holding;
      if (m.name === 'pummel' && v && !m.hitIds.has('p') && d.hit.some((h) => f >= h.f[0] && f <= h.f[1])) {
        m.hitIds.add('p');
        const h = d.hit.find((hh) => f >= hh.f[0] && f <= hh.f[1]);
        v.damage += h.dmg || 1;
        att.hitlag = v.hitlag = 3;
        this.sfx.play('hit', 0.5);
        this.fx.push({ type: 'spark', x: v.x, y: v.y - 70, r: 14, t: 0, life: 10, ink: att.ink });
      }
      return;
    }
    const ctx = animContext(att.def.anim, d, f, { face: att.face, charge: m.charge, skin: att.skin, scale: att.def.scale });
    const J = animJoints(att.def.anim, d, f, ctx, att.def.scale, att.skin);
    const boxes = liveHitboxes(d, f, J);
    if (!boxes.length) return;
    for (const t of this.targets(att)) {
      if (!this.hittable(t)) continue;
      for (const b of boxes) {
        const id = d.hit.indexOf(b.h) + ':' + t.slot;
        if (m.hitIds.has(id)) continue;
        if (b.h.grab && t.state === 'ledge') continue;
        const wx = att.x + att.face * b.x;
        const wy = att.y + b.y;
        if (!this.overlaps(t, wx, wy, b.r)) continue;
        // one hit per hit group: boxes whose frame windows overlap or touch are
        // one strike (sweet and sour spots, strong then weak); gaps make multi-hits
        for (const i of hitGroup(d, d.hit.indexOf(b.h))) m.hitIds.add(i + ':' + t.slot);
        this.resolveHit(att, t, this.strikeOf(att, b.h), wx, wy);
        break;
      }
    }
  }
  // Priority when several things apply: grab, counter, armor, shield, hit.
  resolveHit(att, t, h, wx, wy, opts) {
    const proj = !!(opts && opts.proj);
    const dmg = h.dmg || 0;
    if (h.grab) {
      if (t.state === 'hurt' || t.state === 'lie') return 'none';
      att.move = null;
      att.holding = t;
      t.heldBy = att;
      t.move = null;
      t.setState('held');
      att.startMove('grab_hold', this);
      this.sfx.play('land');
      return 'grab';
    }
    const td = t.moveDef();
    const tf = t.move ? Math.floor(t.move.f) : 0;
    // counters answer melee hits only; the strike scales with the blow absorbed
    if (!proj && td && t.move && inRanges(td.counter, tf)) {
      const strike = td.counterMove || 'special_d_hit';
      t.face = sign(att.x - t.x) || t.face;
      att.hitlag = 26;
      t.startMove(strike, this, { strikeDmg: clamp(Math.round(dmg * RULES.counterMult), RULES.counterMin, RULES.counterMax) });
      this.sfx.play('confirm');
      this.fx.push({ type: 'ring', x: t.x, y: t.y - 70, r: 60, t: 0, life: 18, ink: t.ink });
      return 'counter';
    }
    // armor: the damage lands, the flinch does not
    if (td && t.move && armorHolds(td, tf, dmg)) {
      t.damage = Math.min(999, t.damage + dmg);
      t.lastHitBy = att.fighter || att;
      const lag = Math.round(3 + dmg / 3);
      t.hitlag = lag;
      att.hitlag = Math.max(att.hitlag || 0, lag);
      this.sfx.play('hit', 0.6);
      this.fx.push({ type: 'spark', x: wx, y: wy, r: 12 + dmg, t: 0, life: 10, ink: att.ink });
      this.fx.push({ type: 'ring', x: t.x, y: t.y - 70, r: 40, t: 0, life: 12, ink: t.ink });
      return 'armor';
    }
    if (t.state === 'shield' && t.shieldDrop === 0) {
      t.shieldStun = RULES.shieldstun(dmg);
      t.play('shield_stun', 0, 1);
      t.vx = att.face * (2 + dmg * 0.35);
      att.hitlag = t.hitlag = Math.round(2 + dmg / 4);
      this.sfx.play('hit', 0.4);
      this.fx.push({ type: 'spark', x: wx, y: wy, r: 12, t: 0, life: 10, ink: t.ink });
      return 'shield';
    }
    t.takeHit(this, att, h, { x: wx, y: wy });
    return 'hit';
  }
  spawnProjectile(owner, sp) {
    const def = owner.book[sp.anim];
    if (!def) return;
    const d = owner.moveDef();
    const ctx = animContext(owner.def.anim, d, owner.animF, { face: owner.face, skin: owner.skin, scale: owner.def.scale });
    const J = animJoints(owner.def.anim, d, owner.animF, ctx, owner.def.scale, owner.skin);
    const at = typeof sp.at === 'string' && J[sp.at] ? J[sp.at] : J.handF;
    this.fx.push({
      type: 'proj', anim: sp.anim, char: owner.def.anim, owner, x: owner.x + owner.face * at[0], y: owner.y + at[1],
      vx: (sp.vx || 8) * owner.face, vy: sp.vy || 0, face: owner.face, f: 0, t: 0, life: sp.life || 70, ink: owner.ink, hit: new Set(),
    });
  }
  updateEffects() {
    for (const fx of this.fx) {
      fx.t++;
      if (fx.type === 'anim') fx.f++;
      if (fx.type !== 'proj') continue;
      fx.f++;
      fx.x += fx.vx;
      fx.y += fx.vy;
      const def = fx.owner.book[fx.anim];
      const ctx = animContext(fx.char, def, fx.f % def.frames, { face: fx.face, skin: fx.owner.skin, scale: fx.owner.def.scale });
      const J = animJoints(fx.char, def, fx.f % def.frames, ctx, fx.owner.def.scale, fx.owner.skin);
      for (const b of liveHitboxes(def, fx.f % def.frames, J)) {
        const wx = fx.x + fx.face * b.x;
        const wy = fx.y + b.y;
        for (const t of this.targets(fx.owner)) {
          if (fx.hit.has(t) || !this.hittable(t)) continue;
          if (!this.overlaps(t, wx, wy, b.r)) continue;
          fx.hit.add(t);
          fx.t = fx.life; // spent
          // the projectile stands in for its owner when it lands
          const by = { x: fx.x - fx.face * 10, face: fx.face, ink: fx.ink, hitlag: 0, fighter: fx.owner, moveDef: () => null };
          this.resolveHit(by, t, b.h, wx, wy, { proj: true });
        }
      }
      // stops at walls
      for (const s of this.stage.solids) if (fx.x > s.l && fx.x < s.r && fx.y > s.t && fx.y < s.b) fx.t = fx.life;
    }
    this.fx = this.fx.filter((fx) => fx.t < fx.life);
  }
}
