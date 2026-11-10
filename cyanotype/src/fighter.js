// ---------------------------------------------------------------------------
// Hermes Arena — fighters. Every visible action is an animation from the
// registry (src/anim.js + src/anims/*); this file decides which one plays and
// applies its frame data: motion, hitboxes, intangibility, charge, landing lag.
// ---------------------------------------------------------------------------

const FIGHTER_DEFS = {
  hermes: {
    id: 'hermes', name: 'Hermes', title: 'the Messenger', anim: 'hermes',
    scale: 1.42, w: 46, h: 126,
    walk: 3.6, run: 9, runAccel: 1.3, traction: 0.85,
    airSpeed: 5.8, airAccel: 0.6, airDrag: 0.05,
    gravity: 0.72, fall: 12.5, fastFall: 18,
    jump: 16.6, shortHop: 0.58, airJump: 15, jumps: 2,
    weight: 0.92,
  },
};

// The launch roster. A fighter is playable once it has FIGHTER_DEFS physics
// and an animation book; the others show on the select screen as coming soon.
const FIGHTER_ROSTER = [
  { id: 'hermes', name: 'Hermes', title: 'the Messenger', role: 'Rushdown trickster' },
  { id: 'aethon', name: 'Aethon', title: 'the Winged Hoplite', role: 'Heavy all-rounder' },
  { id: 'kairos', name: 'Kairos', title: 'the Hooded Sage', role: 'Zoner' },
  { id: 'iris', name: 'Iris', title: 'the Rainbow Herald', role: 'Aerial skirmisher' },
];
const fighterPlayable = (id) => !!(FIGHTER_DEFS[id] && ANIMS[FIGHTER_DEFS[id].anim] && ANIMS[FIGHTER_DEFS[id].anim].idle);

const BLEND_FRAMES = 4;

class Fighter {
  // skin: skin id (src/skins.js); defaults to the slot's skin. It is not touched
  // by reset(), so a fighter keeps its look across respawns.
  constructor(def, slot, spawn, skin) {
    this.def = def;
    this.slot = slot;
    this.ink = SLOT_INKS[slot];
    this.skin = skin || slotSkin(slot, def.anim);
    this.skinFlash = 0; // frames left showing the skin name over the tag
    this.ctrl = new Controller();
    this.time = slot * 1.7;
    this.damage = 0;
    this.reset(spawn);
  }
  reset(spawn) {
    this.x = this.px = spawn.x;
    this.y = this.py = spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.face = spawn.x < 640 ? 1 : -1;
    this.ground = null;
    this.state = 'air';
    this.stateT = 0;
    this.jumpsUsed = 1;
    this.fastfall = false;
    this.dropT = 0;
    this.helpless = false;
    this.airdodged = false;
    this.anim = 'fall';
    this.animF = 0;
    this.move = null; // { name, f, hitIds:Set, charge, chargeT, ... }
    this.hitlag = 0;
    this.hitstun = 0;
    this.invuln = 0;
    this.ledge = null;
    this.ledgeCool = 0;
    this.holding = null; // fighter we grabbed
    this.heldBy = null;
    this.techWindow = 0;
    this.crouchT = 0;
    this.dashT = 0;
    this.skidT = 0;
    this.turnT = 0;
    this.headTop = null;
    this.lastPose = null;
    this.blend = null;
    this.J = null;
    // once-per-airtime specials (reset on landing, ledge grab and being hit)
    this.usedSideSpecial = false;
    this.usedUpSpecial = false;
    this.touchedStage = true; // false between a ledge grab and the next landing
    this.shieldStun = 0;
    this.lieLock = RULES.knockdownFrames;
    this.lastHitBy = null;
  }
  // cycle to the next (dir 1) or previous (dir -1) skin
  cycleSkin(dir) {
    this.skin = nextSkin(this.skin, this.def.anim, dir) || this.skin;
    this.skinFlash = 100;
    this.lastPose = null;
    this.blend = null;
    this.J = null;
  }
  get book() {
    return ANIMS[this.def.anim] || {};
  }
  has(name) {
    return !!this.book[name];
  }
  setState(s) {
    this.state = s;
    this.stateT = 0;
  }
  // switch the visible animation; crossfade from the last drawn pose
  play(name, f, blend) {
    if (!this.has(name)) return false;
    if (this.seen) this.seen.add(name);
    if (this.anim !== name && this.lastPose) this.blend = { pose: this.lastPose, t: 0, n: blend == null ? BLEND_FRAMES : blend };
    this.anim = name;
    this.animF = f || 0;
    return true;
  }
  // playback rate that keeps a locomotion cycle's feet locked to the floor
  stride(name, speed) {
    const d = this.book[name];
    const mv = d && d.motion ? (d.motion(0, {}) || {}).vx : 0;
    return mv ? clamp(speed / mv, 0.35, 1.6) : 1;
  }
  loopAnim(name, speed) {
    if (this.anim !== name) this.play(name, 0);
    else this.animF += speed == null ? 1 : speed;
  }
  holdAnim(name) {
    // one-shot that holds on its last frame
    if (this.anim !== name) this.play(name, 0);
    else {
      const d = this.book[name];
      this.animF = Math.min(this.animF + 1, d ? d.frames : this.animF + 1);
    }
  }
  // ---- moves -------------------------------------------------------------------
  startMove(name, game, opts) {
    const d = this.book[name];
    if (!d) return false;
    this.move = Object.assign({ name, f: 0, hitIds: new Set(), charge: 0, chargeT: 0, spawned: false }, opts || {});
    this.play(name, 0, 2);
    this.setState('move');
    if (d.hit && d.hit.some((h) => !h.grab)) game.sfx.play('swing');
    return true;
  }
  endMove(game) {
    const d = this.book[this.move ? this.move.name : ''];
    const was = this.move ? this.move.name : '';
    this.move = null;
    if (/^(spotdodge|roll_f|roll_b)$/.test(was) && this.ground && this.ctrl.held.shield) {
      this.setState('shield');
      this.shieldDrop = 0;
      this.play('shield', 0, 3);
      return;
    }
    if (d && d.next && this.has(d.next)) {
      const nd = this.book[d.next];
      if (d.next === 'helpless') {
        this.helpless = true;
        this.setState('air');
        this.play('helpless', 0);
        return;
      }
      if (nd.loop && /crouch/.test(d.next)) {
        this.setState('ground');
        this.play(d.next, 0);
        return;
      }
      this.startMove(d.next, game);
      return;
    }
    this.setState(this.ground ? 'ground' : 'air');
  }
  moveDef() {
    return this.move ? this.book[this.move.name] : null;
  }
  intangible() {
    if (this.invuln > 0) return true;
    const d = this.moveDef();
    return !!(d && inRanges(d.intan, Math.floor(this.move.f)));
  }
  // ---- update -------------------------------------------------------------------
  update(game) {
    this.px = this.x;
    this.py = this.y;
    this.time += 1 / 60;
    if (this.hitlag > 0) {
      this.hitlag--;
      return;
    }
    this.stateT++;
    if (this.dropT > 0) this.dropT--;
    if (this.invuln > 0) this.invuln--;
    if (this.ledgeCool > 0) this.ledgeCool--;
    if (this.techWindow > 0) this.techWindow--;
    if (this.ctrl.pressed('shield', 2)) this.techWindow = 18;
    if (this.blend) {
      this.blend.t += 1 / Math.max(1, this.blend.n);
      if (this.blend.t >= 1) this.blend = null;
    }
    const c = this.ctrl;
    switch (this.state) {
      case 'ground': this.groundControl(game, c); break;
      case 'air': this.airControl(game, c); break;
      case 'jumpsquat': this.jumpsquat(game, c); break;
      case 'land': this.landing(game, c); break;
      case 'shield': this.shieldControl(game, c); break;
      case 'move': this.runMove(game, c); break;
      case 'ledge': this.ledgeControl(game, c); break;
      case 'hurt': this.hurtControl(game, c); break;
      case 'lie': this.lieControl(game, c); break;
      case 'held': this.heldControl(game); break;
      case 'respawn': this.respawnControl(game, c); break;
      default: break;
    }
    const pinned = this.move && this.move.fromLedge && !this.move.released;
    if (this.state !== 'ledge' && this.state !== 'held' && this.state !== 'respawn' && !pinned) this.physics(game);
    if (this.state === 'air' || (this.state === 'move' && !this.ground) || (this.state === 'hurt' && !this.ground)) this.tryLedge(game);

    // blast zones
    const B = game.stage.blast;
    if (this.state !== 'respawn' && (this.x < B.l || this.x > B.r || this.y > B.b || this.y < B.t)) this.ko(game);
  }
  // ---- ground -------------------------------------------------------------------
  groundControl(game, c) {
    const d = this.def;
    this.helpless = false;
    this.airdodged = false;
    if (c.take('jump')) return this.startJumpsquat(game);
    if (c.take('shield')) {
      if (c.held.attack) return this.tryGrab(game);
      return this.startShield(game);
    }
    if (c.take('grab')) return this.tryGrab(game);
    if (c.take('taunt')) {
      const n = c.y < -0.5 ? 'taunt_up' : c.y > 0.5 ? 'taunt_down' : Math.abs(c.x) > 0.5 ? 'taunt_side' : 'taunt_up';
      if (Math.abs(c.x) > 0.5) this.face = sign(c.x);
      return this.startMove(n, game);
    }
    if (c.take('special')) return this.special(game, c);
    if (c.take('strong')) return this.smash(game, c);
    if (c.take('attack')) return this.groundAttack(game, c);
    // drop through soft platforms
    if (this.ground.soft && c.take('down', 4)) {
      this.ground = null;
      this.dropT = 12;
      this.vy = 1.5;
      this.setState('air');
      this.play('platform_drop', 0, 2);
      return;
    }
    const crouch = c.y > 0.5 && Math.abs(c.x) < 0.5;
    const ax = Math.abs(c.x);
    if (crouch) {
      this.vx = approach(this.vx, 0, d.traction);
      this.crouchT++;
      if (this.anim !== 'crouch' && this.anim !== 'crouch_idle') this.play('crouch', 0, 2);
      else if (this.anim === 'crouch') {
        this.animF++;
        if (this.animF >= (this.book.crouch ? this.book.crouch.frames : 6)) this.play('crouch_idle', 0, 1);
      } else this.animF++;
      return;
    }
    if (this.crouchT > 0) {
      this.crouchT = 0;
      this.play('crouch_up', 0, 1);
    }
    const speed = Math.abs(this.vx);
    if (ax > 0.2) {
      const dir = sign(c.x);
      if (dir !== this.face && speed > d.run * 0.6 && this.skidT === 0) {
        // turnaround at speed: skid facing the old way, then pivot to the new one
        this.skidT = this.has('skid') ? this.book.skid.frames : 0;
        this.turnT = this.has('turn') ? this.book.turn.frames : 0;
        this.turnTo = dir;
        if (this.skidT) this.play('skid', 0, 2);
        else {
          this.face = dir;
          this.play('turn', 0, 2);
        }
      } else if (dir !== this.face && this.skidT > 0 && this.turnT === 0 && this.has('turn')) {
        // reversing during a stopping skid: pivot when the skid ends
        this.turnT = this.book.turn.frames;
        this.turnTo = dir;
      } else if (dir !== this.face && this.skidT === 0 && this.turnT === 0) this.face = dir;
      if (ax > 0.75 && speed < d.walk && this.dashT === 0 && this.skidT === 0 && this.turnT === 0 && this.has('dash')) {
        this.dashT = this.book.dash.frames;
        this.play('dash', 0, 2);
        game.fx.push({ type: 'dust', x: this.x - this.face * 16, y: this.y, r: 8, t: 0, life: 14, ink: this.ink });
      }
      const target = ax > 0.75 ? c.x * d.run : c.x * d.walk * 1.4;
      this.vx = approach(this.vx, this.skidT ? 0 : target, this.skidT ? d.traction * 1.2 : d.runAccel);
    } else {
      if (speed > d.run * 0.7 && this.skidT === 0 && this.anim === 'run' && this.has('skid')) {
        this.skidT = this.book.skid.frames;
        this.turnT = 0;
        this.play('skid', 0, 2);
      }
      this.vx = approach(this.vx, 0, d.traction);
    }
    // choose the visible locomotion animation
    if (this.skidT > 0) {
      this.skidT--;
      this.animF++;
      if (this.skidT === 0 && this.turnT > 0) {
        this.face = this.turnTo || this.face;
        this.play('turn', 0, 1);
      }
      return;
    }
    if (this.turnT > 0 && this.anim === 'turn') {
      this.turnT--;
      this.animF++;
      return;
    }
    this.turnT = 0;
    if (this.dashT > 0) {
      this.dashT--;
      this.animF++;
      return;
    }
    if (this.anim === 'crouch_up' && this.animF < (this.book.crouch_up ? this.book.crouch_up.frames : 6) && speed < 1) {
      this.animF++;
      return;
    }
    if (this.anim === 'land' || this.anim === 'land_heavy') {
      // finish the settle unless moving
      if (speed < 1 && this.animF < this.book[this.anim].frames) {
        this.animF++;
        return;
      }
    }
    if (speed > d.walk * 1.3) {
      if (this.anim !== 'run') this.play('run', 0, 3);
      else this.animF += this.stride('run', speed);
      const fr = this.book.run ? this.book.run.frames : 36;
      const ph = this.animF % (fr / 2);
      if (ph < this.stride('run', speed) + 0.01) {
        game.sfx.play('step');
        if (speed > d.run * 0.8) game.fx.push({ type: 'dust', x: this.x - this.face * 14, y: this.y, r: 6, t: 0, life: 14, ink: this.ink });
      }
    } else if (speed > 0.6) {
      const w = this.has('walk') ? 'walk' : 'run';
      this.loopAnim(w, this.stride(w, speed));
    } else if (this.atEdge(game) && this.has('teeter')) {
      this.loopAnim('teeter');
    } else {
      this.loopAnim('idle');
    }
  }
  atEdge(game) {
    const g = this.ground;
    if (!g) return false;
    const edge = this.face > 0 ? g.r : g.l;
    if (Math.abs(this.x - edge) > 14) return false;
    // nothing to stand on just past the edge?
    const px = this.x + this.face * 24;
    return !this.surfaces(game).some((s) => px > s.l && px < s.r && Math.abs(s.t - g.t) < 22);
  }
  startJumpsquat(game) {
    this.setState('jumpsquat');
    this.play('jumpsquat', 0, 1);
  }
  jumpsquat(game, c) {
    this.animF++;
    this.vx = approach(this.vx, 0, this.def.traction * 0.5);
    const n = this.book.jumpsquat ? this.book.jumpsquat.frames : 4;
    if (this.stateT >= n) {
      const d = this.def;
      this.ground = null;
      this.vy = -(c.held.jump || c.held.shield ? d.jump : d.jump * d.shortHop * 1.05);
      if (Math.abs(c.x) > 0.3) this.vx = clamp(this.vx + c.x * 2, -d.airSpeed * 1.4, d.airSpeed * 1.4);
      this.jumpsUsed = 1;
      this.setState('air');
      this.play('jump', 0, 1);
      game.sfx.play('jump');
      game.fx.push({ type: 'dust', x: this.x, y: this.y, r: 10, t: 0, life: 16, ink: this.ink });
    }
  }
  groundAttack(game, c) {
    const dirX = Math.abs(c.x) > 0.5 ? sign(c.x) : 0;
    if (Math.abs(this.vx) > this.def.run * 0.6 && (this.dashT > 0 || this.anim === 'run') && this.has('dash_attack')) return this.startMove('dash_attack', game);
    if (c.y < -0.5) return this.startMove('utilt', game);
    if (c.y > 0.5) return this.startMove('dtilt', game);
    if (dirX) {
      this.face = dirX;
      return this.startMove('ftilt', game);
    }
    return this.startMove('jab1', game);
  }
  smash(game, c) {
    if (!this.ground) return this.aerial(game, c);
    if (c.y < -0.5) return this.startMove('usmash', game);
    if (c.y > 0.5) return this.startMove('dsmash', game);
    if (Math.abs(c.x) > 0.5) this.face = sign(c.x);
    return this.startMove('fsmash', game);
  }
  special(game, c) {
    const air = !this.ground;
    // side and up specials: once each per airtime
    if (c.y < -0.5) {
      if (this.usedUpSpecial) return false;
      if (Math.abs(c.x) > 0.5) this.face = sign(c.x);
      this.usedUpSpecial = true;
      return this.startMove('special_u', game);
    }
    if (c.y > 0.5) return this.startMove('special_d', game);
    if (Math.abs(c.x) > 0.5) {
      if (this.usedSideSpecial) return false;
      this.face = sign(c.x);
      this.usedSideSpecial = true;
      return this.startMove('special_s', game);
    }
    return this.startMove(air && this.has('special_n_air') ? 'special_n_air' : 'special_n', game);
  }
  aerial(game, c) {
    let n = 'nair';
    if (c.y < -0.5) n = 'uair';
    else if (c.y > 0.5) n = 'dair';
    else if (Math.abs(c.x) > 0.5) n = sign(c.x) === this.face ? 'fair' : 'bair';
    return this.startMove(n, game);
  }
  tryGrab(game) {
    const running = Math.abs(this.vx) > this.def.run * 0.6;
    return this.startMove(running && this.has('dash_grab') ? 'dash_grab' : 'grab', game);
  }
  // ---- air ------------------------------------------------------------------------
  airDrift(c, mult) {
    const d = this.def;
    const target = c.x * d.airSpeed;
    if (Math.abs(c.x) > 0.2) {
      if ((target > 0 && this.vx < target) || (target < 0 && this.vx > target)) this.vx = approach(this.vx, target, d.airAccel * mult);
    } else {
      this.vx = approach(this.vx, 0, d.airDrag);
    }
  }
  airControl(game, c) {
    const d = this.def;
    this.airDrift(c, this.helpless ? 0.6 : 1);
    if (this.vy > 0 && c.take('down', 3)) this.fastfall = true;
    if (this.helpless) {
      this.loopAnim('helpless');
      return;
    }
    if (c.take('jump') && this.jumpsUsed < d.jumps) {
      this.jumpsUsed++;
      this.vy = -d.airJump;
      this.vx = c.x * d.airSpeed;
      if (Math.abs(c.x) > 0.3) this.face = sign(c.x);
      this.fastfall = false;
      this.play('double_jump', 0, 2);
      game.sfx.play('djump');
      return;
    }
    if (c.take('shield') && !this.airdodged) {
      this.airdodged = true;
      if (Math.abs(c.x) > 0.3 || Math.abs(c.y) > 0.3) {
        const l = Math.hypot(c.x, c.y) || 1;
        this.vx = (c.x / l) * 9;
        this.vy = (c.y / l) * 9;
      }
      return this.startMove('airdodge', game, { dodgeVel: true });
    }
    if (c.take('special')) return this.special(game, c);
    if (c.take('attack') || c.take('strong')) return this.aerial(game, c);
    // visible air animation
    if (this.anim === 'double_jump' && this.animF < this.book.double_jump.frames) {
      this.animF++;
      return;
    }
    if (this.anim === 'platform_drop' && this.animF < (this.book.platform_drop ? this.book.platform_drop.frames : 0)) {
      this.animF++;
      return;
    }
    if (this.fastfall) this.loopAnim('fastfall');
    else if (this.vy < 2 && this.anim === 'jump') this.holdAnim('jump');
    else if (this.vy < -2) this.holdAnim('jump');
    else this.loopAnim('fall');
  }
  // ---- landing ---------------------------------------------------------------------
  landing(game, c) {
    this.vx = approach(this.vx, 0, this.def.traction);
    this.animF++;
    if (this.stateT >= this.landLag) {
      this.setState('ground');
      // let the landing settle visually while standing
    }
    void c;
  }
  land(game, surf) {
    const impact = this.vy;
    this.ground = surf;
    this.vy = 0;
    this.fastfall = false;
    this.jumpsUsed = 0;
    this.airdodged = false;
    this.usedSideSpecial = false;
    this.usedUpSpecial = false;
    this.touchedStage = true;
    const wasHelpless = this.helpless;
    this.helpless = false;
    if (this.state === 'hurt') {
      // tumble into the floor: tech or knockdown
      if (this.techWindow > 0 && this.has('tech')) {
        this.hitstun = 0;
        this.startMove('tech', game);
        game.fx.push({ type: 'ring', x: this.x, y: this.y, r: 34, t: 0, life: 16, ink: this.ink });
        return;
      }
      if (this.anim === 'tumble' || impact > 6) {
        this.hitstun = 0;
        this.setState('lie');
        this.lieLock = RULES.knockdownFrames;
        this.play('knockdown', 0, 2);
        game.sfx.play('land');
        game.fx.push({ type: 'dust', x: this.x - 16, y: this.y, r: 11, t: 0, life: 18, ink: this.ink });
        game.fx.push({ type: 'dust', x: this.x + 16, y: this.y, r: 11, t: 0, life: 18, ink: this.ink });
        return;
      }
      return;
    }
    if (this.state === 'move') {
      const d = this.moveDef();
      if (d && d.air && !d.loop) {
        // aerial or air special interrupted by landing: landing lag
        const lag = d.landLag || (this.move.name.startsWith('special') ? 12 : 4);
        this.move = null;
        this.setState('land');
        this.landLag = lag;
        this.play(lag > 6 ? 'land_heavy' : 'land', 0, 1);
        game.sfx.play('land');
        return;
      }
      return; // grounded moves keep playing
    }
    if (this.state === 'air') {
      const heavy = wasHelpless || impact > 13;
      this.setState('land');
      this.landLag = heavy ? (wasHelpless ? 14 : 8) : 4;
      this.play(heavy ? 'land_heavy' : 'land', 0, 1);
    }
    if (impact > 4) {
      game.sfx.play('land');
      game.fx.push({ type: 'dust', x: this.x - 12, y: this.y, r: 8, t: 0, life: 16, ink: this.ink });
      game.fx.push({ type: 'dust', x: this.x + 12, y: this.y, r: 8, t: 0, life: 16, ink: this.ink });
    }
  }
  // ---- shield ------------------------------------------------------------------------
  startShield(game) {
    this.setState('shield');
    this.shieldDrop = 0;
    this.play('shield_up', 0, 1);
    this.vx = approach(this.vx, 0, this.def.traction * 2);
  }
  shieldControl(game, c) {
    this.vx = approach(this.vx, 0, this.def.traction);
    if (this.shieldDrop > 0) {
      this.shieldDrop--;
      this.animF++;
      if (this.shieldDrop === 0) this.setState('ground');
      return;
    }
    // shieldstun: no actions, no dropping the shield
    if (this.shieldStun > 0) {
      this.shieldStun--;
      if (this.anim === 'shield_stun') this.animF = Math.min(this.animF + 1, this.book.shield_stun.frames);
      return;
    }
    if (this.anim === 'shield_stun') this.play('shield', 0, 2);
    if (c.take('jump')) return this.startJumpsquat(game);
    if (c.take('attack') || c.take('grab')) return this.tryGrab(game);
    if (c.take('down', 4)) return this.startMove('spotdodge', game);
    if (c.take('left', 4) || c.take('right', 4)) {
      const dir = sign(c.x) || this.face;
      return this.startMove(dir === this.face ? 'roll_f' : 'roll_b', game);
    }
    if (!c.held.shield) {
      this.shieldDrop = this.book.shield_drop ? this.book.shield_drop.frames : 6;
      this.play('shield_drop', 0, 1);
      return;
    }
    if (this.anim === 'shield_up' && this.animF < this.book.shield_up.frames) this.animF++;
    else this.loopAnim('shield');
  }
  // ---- generic move runner ---------------------------------------------------------------
  runMove(game, c) {
    const m = this.move;
    const d = this.moveDef();
    if (!d) return this.endMove(game);
    const fi = Math.floor(m.f);
    // charge hold for smash attacks
    if (d.charge && fi === d.charge.f && (c.held.strong || c.held.attack) && m.chargeT < RULES.smashChargeFrames) {
      m.chargeT++;
      m.charge = m.chargeT / RULES.smashChargeFrames;
      this.vx = approach(this.vx, 0, this.def.traction);
      this.animF = m.f;
      return;
    }
    // physics hints
    const mo = d.motion ? d.motion(fi, { charge: m.charge }) || {} : {};
    if (m.fromLedge && !m.released) {
      // pinned to the ledge corner until the animation launches him
      if (mo.vy != null && mo.vy < 0) {
        m.released = true;
        this.ground = null;
      } else {
        this.vx = 0;
        this.vy = 0;
      }
    }
    if (m.fromLedge && !m.released) {
      /* no motion while pinned */
    } else if (mo.vx != null) this.vx = mo.vx * this.face;
    else if (this.ground) this.vx = approach(this.vx, 0, this.def.traction * 0.7);
    else if (!m.dodgeVel) this.airDrift(c, 0.6);
    if (m.dodgeVel) {
      this.vx *= 0.9;
      this.vy *= 0.88;
    }
    if (mo.vy != null && !(m.fromLedge && !m.released)) {
      this.vy = mo.vy;
      if (this.ground && mo.vy < 0) this.ground = null;
    }
    this.gravMul = mo.grav != null ? mo.grav : m.dodgeVel ? 0.15 : 1;
    if (!this.ground && d.air && this.vy > 0 && c.take('down', 3)) this.fastfall = true;
    // spawn projectiles
    if (d.spawn && !m.spawned && fi >= d.spawn.f) {
      m.spawned = true;
      game.spawnProjectile(this, d.spawn);
    }
    // jab chain and other cancels
    if (d.cancel && fi >= d.cancel) {
      if (this.move.name === 'jab1' && c.take('attack') && this.has('jab2')) return this.startMove('jab2', game);
      if (this.move.name === 'jab2' && c.take('attack') && this.has('jab3')) return this.startMove('jab3', game);
      if (this.ground && (c.pressed('jump') || c.pressed('attack') || c.pressed('special') || Math.abs(c.x) > 0.5)) {
        this.move = null;
        this.setState('ground');
        return this.groundControl(game, c);
      }
    }
    // grabs
    if (this.move.name === 'grab_hold') return this.holdControl(game, c);
    this.animF = m.f;
    m.f += 1;
    // hitboxes
    game.checkHits(this);
    if (this.state !== 'move' || this.move !== m) return;
    if (/^throw_/.test(m.name)) this.throwStep(game);
    if (m.f > d.frames) {
      if (m.name === 'pummel' && this.holding) {
        this.move = null;
        this.startMove('grab_hold', game, { holdT: m.holdT || 0 });
        return;
      }
      if (d.loop) {
        m.f = 0;
        return;
      }
      // ledge moves relocate the fighter to where the animation ended
      if (m.fromLedge) this.leaveLedge(game, d);
      this.endMove(game);
    }
  }
  // ---- ledge -----------------------------------------------------------------------------
  tryLedge(game) {
    if (this.ledgeCool > 0 || this.vy < 0 || !game.stage.ledges) return;
    for (const L of game.stage.ledges) {
      const hx = this.x;
      const hy = this.y - this.def.h * 0.8;
      if (Math.abs(hx - L.x) < 34 && hy > L.y - 40 && hy < L.y + 26 && (hx - L.x) * L.side >= -12) {
        if (game.fighters.some((f) => f !== this && f.ledge === L)) continue;
        // a regrab without touching the stage gives no invulnerability and no jump back
        const fresh = this.touchedStage;
        this.touchedStage = false;
        this.ledge = L;
        this.move = null;
        this.helpless = false;
        this.fastfall = false;
        if (fresh) this.jumpsUsed = 1;
        this.airdodged = false;
        this.usedSideSpecial = false;
        this.usedUpSpecial = false;
        this.x = L.x;
        this.y = L.y;
        this.vx = 0;
        this.vy = 0;
        this.face = -L.side;
        this.invuln = fresh ? RULES.ledgeHittableAfter : 0;
        this.setState('ledge');
        this.play(this.has('ledge_grab') ? 'ledge_grab' : 'fall', 0, 2);
        game.sfx.play('land');
        return;
      }
    }
  }
  ledgeControl(game, c) {
    if (this.anim === 'ledge_grab' && this.animF < this.book.ledge_grab.frames) {
      this.animF++;
      return;
    }
    if (this.anim !== 'ledge_hang') this.play('ledge_hang', 0, 3);
    else this.animF++;
    const toward = sign(c.x) === this.face && Math.abs(c.x) > 0.5;
    const away = sign(c.x) === -this.face && Math.abs(c.x) > 0.5;
    const pick = (n) => this.has(n) && this.startMove(n, game, { fromLedge: true });
    if (c.take('jump')) return pick('ledge_jump');
    if (c.take('up', 4)) return pick('ledge_climb');
    if (c.take('attack') || c.take('strong')) return pick('ledge_attack');
    if (c.take('shield')) return pick('ledge_roll');
    if (toward && this.stateT > 8) return pick('ledge_climb');
    if (away || c.take('down', 4) || this.stateT > 300) {
      this.ledge = null;
      this.ledgeCool = 40;
      this.x -= this.face * 30;
      this.y += 60;
      this.setState('air');
      this.play('fall', 0, 3);
    }
  }
  leaveLedge(game, d) {
    const pose = animPose(d, d.frames, {});
    const k = this.def.scale;
    this.x += this.face * pose.ox * k;
    this.y += pose.oy * k;
    this.ledge = null;
    this.ledgeCool = 30;
    this.lastPose = Object.assign({}, pose, { ox: 0, oy: 0 });
    if (pose.air > 0.5) {
      this.ground = null;
      if (this.vy >= 0 && !(this.move && this.move.released)) this.vy = -6;
      this.jumpsUsed = 1;
    } else {
      // feet on the stage top
      const s = game.stage.solids.find((s) => this.x >= s.l - FOOT && this.x <= s.r + FOOT && Math.abs(s.t - this.y) < 4);
      this.ground = s || null;
      this.vy = 0;
    }
  }
  // ---- grabs -------------------------------------------------------------------------------
  holdControl(game, c) {
    const m = this.move;
    m.holdT = (m.holdT || 0) + 1;
    this.animF = m.f;
    m.f = (m.f + 1) % (this.book.grab_hold.frames || 60);
    this.vx = approach(this.vx, 0, this.def.traction);
    const v = this.holding;
    if (!v || v.heldBy !== this) return this.endMove(game);
    if (c.take('attack') && this.has('pummel')) return this.startMove('pummel', game);
    let t = null;
    if (c.take('up', 12) || c.y < -0.5) t = 'throw_u';
    else if (c.take('down', 12) || c.y > 0.5) t = 'throw_d';
    else if (c.take('right', 12)) t = this.face > 0 ? 'throw_f' : 'throw_b';
    else if (c.take('left', 12)) t = this.face < 0 ? 'throw_f' : 'throw_b';
    else if (Math.abs(c.x) > 0.5) t = sign(c.x) === this.face ? 'throw_f' : 'throw_b';
    if (t && this.has(t)) return this.startMove(t, game);
    if (m.holdT > 100) {
      v.release(game, this, null);
      this.holding = null;
      this.endMove(game);
    }
  }
  throwStep(game) {
    const d = this.moveDef();
    const v = this.holding;
    if (!v) return;
    const rel = d.hit && d.hit.length ? Math.min(...d.hit.map((h) => h.f[0])) : Math.floor(d.frames / 2);
    if (Math.floor(this.move.f) - 1 === rel) {
      const h = d.hit && d.hit.find((hh) => hh.f[0] === rel);
      v.release(game, this, h || { dmg: 8, kb: 6, ang: 40 });
      this.holding = null;
    }
  }
  victimSpot() {
    const d = this.moveDef();
    if (!d || !d.victim) {
      const J = this.J;
      const hx = J ? J.handB[0] : 30;
      return { x: this.x + this.face * (hx + 10), y: this.y, rot: 0, face: -this.face };
    }
    const c = animContext(this.def.anim, d, this.animF, { face: this.face, ink: this.ink, time: this.time, scale: this.def.scale, dummy: false, skin: this.skin });
    c.J = animJoints(this.def.anim, d, this.animF, c, this.def.scale, this.skin);
    const v = d.victim(this.animF, c) || {};
    return {
      x: this.x + this.face * (v.x || 0),
      y: this.y + (v.y || 0),
      rot: v.pose ? 0 : (v.rot || 0),
      face: (v.face == null ? -1 : v.face) * this.face,
      pose: v.pose || null,
    };
  }
  heldControl(game) {
    const a = this.heldBy;
    if (!a || a.holding !== this) {
      this.heldBy = null;
      this.setState(this.ground ? 'ground' : 'air');
      return;
    }
    const s = a.victimSpot();
    this.x = s.x;
    this.y = s.y;
    this.face = s.face;
    this.heldRot = s.rot;
    this.heldPose = s.pose;
    this.vx = this.vy = 0;
    if (this.anim !== 'hurt_heavy') this.play('hurt_heavy', 8, 3);
  }
  release(game, by, h) {
    this.heldBy = null;
    this.heldRot = 0;
    this.heldPose = null;
    this.ground = null;
    if (!h) {
      this.setState('air');
      this.vx = by.face * 4;
      this.vy = -4;
      return;
    }
    this.takeHit(game, by, h, { x: this.x, y: this.y - 60 });
  }
  // ---- getting hit -----------------------------------------------------------------------------
  takeHit(game, by, h, at) {
    const dmg = h.dmg || 0;
    this.damage = Math.min(999, this.damage + dmg);
    this.lastHitBy = by.fighter || by;
    this.usedSideSpecial = false;
    this.usedUpSpecial = false;
    if (h.trip && this.ground) return this.trip(game, by, h, at);
    const kb = h.kb == null ? 3 : h.kb;
    const ang = (h.ang == null ? 40 : h.ang) * D2R;
    const launch = (kb * 0.75 + (kb * this.damage) / 55) / this.def.weight;
    const dir = by.x === this.x ? by.face : by.face;
    this.vx = Math.cos(ang) * launch * dir;
    this.vy = -Math.sin(ang) * launch;
    if (this.holding) {
      this.holding.heldBy = null;
      this.holding.setState('air');
      this.holding = null;
    }
    this.move = null;
    this.helpless = false;
    this.ledge = null;
    this.jumpsUsed = Math.max(this.jumpsUsed, 1); // a launched fighter has only air jumps
    this.face = -dir;
    this.hitstun = Math.round(launch * 2.6 + 6);
    this.setState('hurt');
    const big = launch > 9;
    if (this.vy < -1 || big) this.ground = null;
    this.play(big ? 'hurt_heavy' : this.ground ? 'hurt_light' : 'hurt_heavy', 0, 1);
    this.tumbleNext = big;
    const lag = Math.round(3 + dmg / 3);
    this.hitlag = lag;
    by.hitlag = Math.max(by.hitlag, lag);
    game.sfx.play('hit', clamp(kb / 4, 0.5, 2));
    game.fx.push({ type: 'spark', x: at.x, y: at.y, r: 16 + dmg * 1.6, t: 0, life: 12, ink: by.ink });
    if (big) game.shake = Math.min(14, launch * 0.6);
  }
  // a trip: knocked flat where he stands, no launch
  trip(game, by, h, at) {
    if (this.holding) {
      this.holding.heldBy = null;
      this.holding.setState('air');
      this.holding = null;
    }
    this.move = null;
    this.vx = 0;
    this.vy = 0;
    this.hitstun = 0;
    this.face = -by.face;
    this.setState('lie');
    this.lieLock = RULES.tripFrames;
    this.play('knockdown', 0, 1);
    const lag = Math.round(3 + (h.dmg || 0) / 3);
    this.hitlag = lag;
    by.hitlag = Math.max(by.hitlag, lag);
    game.sfx.play('hit', 0.6);
    game.fx.push({ type: 'spark', x: at.x, y: at.y, r: 14, t: 0, life: 12, ink: by.ink });
  }
  hurtControl(game, c) {
    this.hitstun--;
    const d = this.book[this.anim];
    if (this.anim === 'tumble') this.animF++;
    else if (d && this.animF < d.frames) this.animF++;
    else if (this.tumbleNext && !this.ground) this.play('tumble', 0, 4);
    if (this.hitstun <= 0) {
      if (this.ground) {
        this.setState('ground');
      } else if (this.anim === 'tumble') {
        // tumbling stays until an action: then a normal air state
        if (c.pressed('jump') || c.pressed('attack') || c.pressed('special') || c.pressed('shield') || Math.abs(c.x) > 0.5) {
          this.setState('air');
          this.airControl(game, c);
        } else this.hitstun = 0;
      } else this.setState('air');
    }
    if (this.ground) this.vx = approach(this.vx, 0, this.def.traction * 0.5);
  }
  lieControl(game, c) {
    this.vx = approach(this.vx, 0, this.def.traction);
    if (this.anim === 'knockdown' && this.animF < this.book.knockdown.frames) {
      this.animF++;
      return;
    }
    this.loopAnim('lie');
    if (this.stateT < this.lieLock) return;
    if (c.take('attack') || c.take('strong')) return this.startMove('getup_attack', game);
    if (c.take('left', 6) || c.take('right', 6) || c.take('shield')) {
      if (Math.abs(c.x) > 0.3) this.face = -sign(c.x);
      return this.startMove('getup_roll', game);
    }
    if (c.take('jump') || c.take('up', 6) || this.stateT > 160) return this.startMove('getup', game);
  }
  // ---- KO and respawn -------------------------------------------------------------------------
  ko(game) {
    const B = game.stage.blast;
    const cx = clamp(this.x, B.l + 360, B.r - 360);
    const cy = clamp(this.y, B.t + 300, B.b - 360);
    game.fx.push({ type: 'anim', anim: 'ko', char: this.def.anim, x: cx, y: cy, face: this.x < 640 ? 1 : -1, f: 0, life: this.book.ko ? this.book.ko.frames : 40, ink: this.ink, owner: this });
    game.fx.push({ type: 'ring', x: cx, y: cy, r: 140, t: 0, life: 30, ink: this.ink });
    game.sfx.play('ko');
    game.shake = 16;
    if (this.holding) {
      this.holding.heldBy = null;
      this.holding = null;
    }
    if (this.heldBy) {
      this.heldBy.holding = null;
      this.heldBy = null;
    }
    // last stock gone: leave the match
    if (game.onKO && !game.onKO(this)) {
      this.move = null;
      this.vx = this.vy = 0;
      this.setState('out');
      return;
    }
    const R = game.stage.respawn;
    this.reset({ x: R.x + [-60, 60, -160, 160][this.slot % 4], y: R.y + 120 });
    this.damage = 0;
    this.setState('respawn');
    this.respawnT = 0;
    this.play('respawn', 0, 0);
    this.invuln = 150;
  }
  respawnControl(game, c) {
    this.respawnT++;
    const d = this.book.respawn;
    const n = d ? d.frames : 60;
    if (this.animF < n) this.animF++;
    else this.loopAnim('fall', 0.5);
    const act = c.pressed('jump') || c.pressed('attack') || c.pressed('special') || Math.abs(c.x) > 0.5 || Math.abs(c.y) > 0.5;
    if ((this.respawnT > n && act) || this.respawnT > n + 150) {
      this.setState('air');
      this.vy = 0;
      this.jumpsUsed = 1;
    }
  }
  // ---- collision with the stage ------------------------------------------------------------------
  surfaces(game) {
    return this.dropT > 0 ? game.stage.solids : game.stage.solids.concat(game.stage.plats);
  }
  margin(s) {
    return s.soft ? 6 : FOOT;
  }
  physics(game) {
    const d = this.def;
    const st = game.stage;
    const hw = d.w / 2;
    if (!this.ground) {
      let gm = this.state === 'move' && this.gravMul != null ? this.gravMul : 1;
      if (this.state === 'hurt' && this.hitstun > 0) gm *= RULES.hitstunGravity;
      this.vy += d.gravity * gm;
      const max = this.fastfall ? d.fastFall : d.fall;
      if (this.fastfall) this.vy = Math.max(this.vy, Math.min(max, this.vy + 3));
      if (this.vy > max && this.state !== 'hurt') this.vy = max;
      if (this.state === 'hurt') this.vy = Math.min(this.vy, 20);
    }
    if (this.state === 'hurt' && !this.ground) {
      // knockback decays
      this.vx *= 0.985;
    }
    const ox = this.x;
    const oy = this.y;

    // vertical
    if (!this.ground) {
      this.y += this.vy;
      if (this.vy >= 0) {
        let best = null;
        for (const s of this.surfaces(game)) {
          const m = this.margin(s);
          if (this.x > s.l - m && this.x < s.r + m && oy <= s.t + 0.5 && this.y >= s.t) if (!best || s.t < best.t) best = s;
        }
        if (best) {
          this.y = best.t;
          this.land(game, best);
        }
      } else {
        for (const s of st.solids) {
          if (this.x + hw > s.l && this.x - hw < s.r && oy - d.h >= s.b - 0.5 && this.y - d.h < s.b) {
            this.y = s.b + d.h;
            this.vy = 0;
          }
        }
      }
    }

    // horizontal
    this.x += this.vx;
    for (const s of st.solids) {
      const overlapX = this.x + hw > s.l && this.x - hw < s.r;
      const overlapY = this.y > s.t + 0.5 && this.y - d.h < s.b;
      if (!overlapX || !overlapY) continue;
      if (this.ground && this.y - s.t <= 20) {
        this.y = s.t;
        this.ground = s;
        this.x = clamp(this.x, s.l - FOOT + 1, s.r + FOOT - 1);
        continue;
      }
      if (oy <= s.t + 0.5) continue;
      const fromLeft = ox <= (s.l + s.r) / 2;
      if (fromLeft) {
        this.x = s.l - hw;
        if (this.vx > 0) this.vx = 0;
      } else {
        this.x = s.r + hw;
        if (this.vx < 0) this.vx = 0;
      }
    }

    // still supported?
    if (this.ground) {
      const g = this.ground;
      const m = this.margin(g);
      if (!(this.x > g.l - m && this.x < g.r + m && Math.abs(this.y - g.t) < 0.6)) {
        let next = null;
        for (const s of this.surfaces(game)) {
          const ms = this.margin(s);
          const drop = s.t - this.y;
          if (this.x > s.l - ms && this.x < s.r + ms && drop > -0.6 && drop <= 20) if (!next || s.t < next.t) next = s;
        }
        if (next) {
          this.y = next.t;
          this.ground = next;
        } else {
          this.ground = null;
          this.vy = 0;
          this.jumpsUsed = Math.max(this.jumpsUsed, 1);
          if (this.state === 'ground' || this.state === 'land' || this.state === 'shield') {
            this.setState('air');
            this.play('fall', 0, 4);
          }
        }
      }
    }
  }
  // ---- drawing ----------------------------------------------------------------------------
  draw(g, a) {
    const x = lerp(this.px, this.x, a);
    const y = lerp(this.py, this.y, a);
    const def = this.book[this.anim] || this.book.fall || this.book.idle;
    if (!def) return;
    let alpha = null;
    if (this.invuln > 0 && this.state !== 'ledge' && Math.floor(this.invuln / 4) % 2 === 0) alpha = 0.55;
    const held = this.state === 'held';
    const rot = held ? this.heldRot || 0 : 0;
    const hp = held ? this.heldPose : null;
    const r = drawAnimFrame(g, this.def.anim, def, this.animF, x, y, {
      face: this.face, ink: this.ink, vx: this.vx, vy: this.ground ? 0 : this.vy, scale: this.def.scale, time: this.time,
      charge: this.move ? this.move.charge : 0, alpha, dummy: false, boxes: this.showBoxes, skin: this.skin,
      blend: hp ? null : this.blend,
      adjust: hp ? () => Object.assign({}, hp) : rot ? (p) => Object.assign(p, { rot: p.rot + rot }) : null,
    });
    this.lastPose = r.pose;
    this.J = r.J;
    this.headTop = r.out.top;
  }
}
