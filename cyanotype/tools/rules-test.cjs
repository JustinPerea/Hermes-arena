// Checks that the shared engine rules (roster doc, "Shared engine rules") are
// in the code, by running the real engine headless. Exit code 1 on a failure.
// Usage: node tools/rules-test.cjs
const loadEngine = require('./engine.cjs');

let fails = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}

const RAW0 = { x: 0, y: 0 };
function freshMatch(E, stocks) {
  const m = new E.Match({ fighters: ['hermes', 'hermes'], stocks });
  const [a, b] = m.fighters;
  const left = m.stage.solids.find((s) => s.t === 452 && s.l === 300);
  for (const [f, x, face] of [[a, 420, 1], [b, 480, -1]]) {
    f.x = f.px = x;
    f.y = f.py = 452;
    f.ground = left;
    f.face = face;
    f.setState('ground');
    f.anim = 'idle';
  }
  return m;
}
// run n frames; inputs(i) -> [rawA, rawB]
function run(m, n, inputs) {
  for (let i = 0; i < n; i++) {
    const r = inputs ? inputs(i) : [];
    m.fighters.forEach((f, k) => f.ctrl.feed(r[k] || RAW0));
    m.simulate();
  }
}
// attacker a starts a move; run until b is struck or the move ends
function strike(m, a, b, name, opts) {
  placeInReach(a, b, name);
  a.startMove(name, m, opts);
  const d0 = b.damage;
  for (let i = 0; i < 120 && a.move; i++) {
    run(m, 1, () => [opts && opts.hold ? { strong: true } : RAW0, (opts && opts.target) || RAW0]);
    if (b.damage !== d0 || b.state === 'hurt' || b.state === 'lie' || b.shieldStun > 0) break;
  }
  return b.damage - d0;
}
// stand b where a's first hitbox of the move lands
function placeInReach(a, b, name) {
  const E = ENGINE;
  const d = a.book[name];
  const h = d.hit.find((x) => !x.grab) || d.hit[0];
  const J = E.animJoints(a.def.anim, d, h.f[0], E.animContext(a.def.anim, d, h.f[0], { face: 1 }), a.def.scale);
  const box = E.liveHitboxes(d, h.f[0], J)[0];
  b.x = b.px = a.x + a.face * box.x;
}
function putInAir(m, f, x, y) {
  f.x = f.px = x;
  f.y = f.py = y;
  f.ground = null;
  f.vx = f.vy = 0;
  f.setState('air');
  f.jumpsUsed = 1;
}

const E = loadEngine();
const ENGINE = E;
const R = E.RULES;

// 1. Swift Courier (side special) once per airtime
{
  const m = freshMatch(E);
  const [a] = m.fighters;
  putInAir(m, a, 120, -300); // offstage, nothing to land on
  run(m, 1, () => [{ x: 1, special: true }]);
  const first = a.move && a.move.name;
  run(m, 45, () => [{ x: 0.1 }]);
  run(m, 1, () => [{ x: 1, special: true }]);
  const second = a.move && a.move.name;
  check('Side special is once per airtime', first === 'special_s' && second !== 'special_s', `first: ${first}, second: ${second || 'nothing'}, still airborne: ${!a.ground}`);
  // lands, then it works again
  putInAir(m, a, 640, 400);
  a.move = null;
  run(m, 40);
  run(m, 1, () => [{ x: 1, special: true }]);
  check('Side special comes back on landing', a.move && a.move.name === 'special_s');
}
// 2. Up special once per airtime, and being hit resets both
{
  const m = freshMatch(E);
  const [a, b] = m.fighters;
  putInAir(m, a, 640, 0);
  a.usedUpSpecial = true;
  run(m, 1, () => [{ y: -1, special: true }]);
  check('Up special is once per airtime', !(a.move && a.move.name === 'special_u'));
  a.takeHit(m, b, { dmg: 3, kb: 2, ang: 45 }, { x: a.x, y: a.y });
  check('Being hit gives specials back', !a.usedUpSpecial && !a.usedSideSpecial);
}
// 3. Smash charge scales damage and knockback by up to 1.4
{
  const m0 = freshMatch(E);
  const d0 = strike(m0, m0.fighters[0], m0.fighters[1], 'fsmash');
  const v0 = Math.hypot(m0.fighters[1].vx, m0.fighters[1].vy);
  const m1 = freshMatch(E);
  const d1 = strike(m1, m1.fighters[0], m1.fighters[1], 'fsmash', { hold: true });
  const v1 = Math.hypot(m1.fighters[1].vx, m1.fighters[1].vy);
  check('Full smash charge = 1.4x damage', Math.abs(d1 - d0 * 1.4) < 0.01, `${d0.toFixed(1)}% -> ${d1.toFixed(1)}%`);
  check('Full smash charge launches harder', v1 > v0 * 1.3, `launch ${v0.toFixed(1)} -> ${v1.toFixed(1)}`);
}
// 4. Gravity halves in hitstun
{
  const m = freshMatch(E);
  const [a, b] = m.fighters;
  b.damage = 50;
  b.takeHit(m, a, { dmg: 0, kb: 6, ang: 90 }, { x: b.x, y: b.y });
  run(m, b.hitlag);
  const v1 = b.vy;
  run(m, 1);
  const g = b.vy - v1;
  check('Gravity is halved in hitstun', Math.abs(g - b.def.gravity * R.hitstunGravity) < 1e-6, `dvy ${g.toFixed(3)} vs gravity ${b.def.gravity}`);
}
// 5. Shieldstun = round(2 + 0.8 x damage)
{
  const m = freshMatch(E);
  const [a, b] = m.fighters;
  b.startShield(m);
  run(m, 8, () => [RAW0, { shield: true }]);
  strike(m, a, b, 'ftilt', { target: { shield: true } });
  const want = R.shieldstun(9);
  check('Shieldstun scales with damage', b.shieldStun === want || b.shieldStun === want - 1, `ftilt 9%: ${b.shieldStun} frames, rule says ${want}`);
}
// 6. Launched fighters lose their ground jump
{
  const m = freshMatch(E);
  const [a, b] = m.fighters;
  b.jumpsUsed = 0;
  b.damage = 60;
  b.takeHit(m, a, { dmg: 10, kb: 7, ang: 60 }, { x: b.x, y: b.y });
  check('A launched fighter has only air jumps', b.jumpsUsed >= 1, `jumpsUsed ${b.jumpsUsed}`);
}
// 7. Ledge: safe for 30 frames, regrab without landing gives nothing
{
  const m = freshMatch(E);
  const [a] = m.fighters;
  putInAir(m, a, 990, 452 + a.def.h * 0.8 - 10);
  a.vy = 2;
  a.touchedStage = true;
  a.tryLedge(m);
  const first = { state: a.state, invuln: a.invuln, hittable: m.hittable(a) };
  run(m, R.ledgeHittableAfter + 1, () => [RAW0]);
  const later = m.hittable(a);
  // drop and regrab without touching the stage
  a.ledge = null;
  a.ledgeCool = 0;
  putInAir(m, a, 990, 452 + a.def.h * 0.8 - 10);
  a.jumpsUsed = 2;
  a.vy = 2;
  a.tryLedge(m);
  check('Fresh ledge grab is safe, then hittable after 30 frames', first.state === 'ledge' && !first.hittable && later, `invuln ${first.invuln}`);
  check('Ledge regrab gives no invulnerability or jump', a.state === 'ledge' && a.invuln === 0 && a.jumpsUsed === 2);
}
// 8. Armor: a hit under the threshold lands its damage but not its flinch
{
  const m = freshMatch(E);
  const [a, b] = m.fighters;
  const def = b.book.ftilt;
  const saved = def.armor;
  def.armor = [[0, 40, 7]]; // test-only: armor against hits under 7%
  b.startMove('ftilt', m);
  a.startMove('jab1', m);
  let res = null;
  for (let i = 0; i < 30 && !res; i++) {
    const d0 = b.damage;
    run(m, 1);
    if (b.damage !== d0) res = { state: b.state, move: b.move && b.move.name, dmg: b.damage - d0 };
  }
  check('Armor absorbs a weak hit (damage taken, no flinch)', res && res.state === 'move' && res.move === 'ftilt' && res.dmg > 0, JSON.stringify(res));
  const m2 = freshMatch(E);
  const [a2, b2] = m2.fighters;
  b2.startMove('ftilt', m2);
  const r2 = m2.resolveHit(a2, b2, { dmg: 9, kb: 5, ang: 30 }, b2.x, b2.y - 60);
  check('Armor does not hold against a hit over its threshold', r2 === 'hit');
  def.armor = saved;
}
// 9. Counters: melee only, strike = 1.2 x absorbed, clamped 8..18
{
  const strikeFor = (dmg) => {
    const m = freshMatch(E);
    const [a, b] = m.fighters;
    b.startMove('special_d', m);
    run(m, 8);
    const r = m.resolveHit(a, b, { dmg, kb: 5, ang: 40 }, b.x, b.y - 60);
    return r === 'counter' ? b.move.strikeDmg : r;
  };
  const got = [2, 9, 16].map(strikeFor);
  check('Counter strike = 1.2x absorbed, 8% to 18%', got[0] === 8 && got[1] === 11 && got[2] === 18, `absorbed 2/9/16 -> ${got.join('/')}`);
  const m = freshMatch(E);
  const [a, b] = m.fighters;
  b.startMove('special_d', m);
  run(m, 8);
  const r = m.resolveHit({ x: a.x, face: 1, ink: a.ink, hitlag: 0, fighter: a, moveDef: () => null }, b, { dmg: 5, kb: 3, ang: 30 }, b.x, b.y - 60, { proj: true });
  check('Counters do not catch projectiles', r === 'hit');
}
// 10. Trip: knocked down in place, no launch, 30 frames
{
  const m = freshMatch(E);
  const [a, b] = m.fighters;
  b.takeHit(m, a, { dmg: 5, kb: 3, ang: 20, trip: true }, { x: b.x, y: b.y });
  check('Trip knocks down with no launch', b.state === 'lie' && b.vx === 0 && b.vy === 0 && !!b.ground && b.lieLock === R.tripFrames);
}
// 11. Stocks and a winner
{
  const m = freshMatch(E, 2);
  const [a, b] = m.fighters;
  for (let k = 0; k < 2; k++) {
    b.lastHitBy = a;
    b.setState('air');
    b.x = m.stage.blast.r + 10;
    run(m, 1);
    if (k === 0) check('Losing a stock respawns the fighter', b.stocks === 1 && b.state === 'respawn');
  }
  check('Last stock gone ends the match with a winner', b.out && m.result && m.result.winner === a, `stocks ${b.stocks}, KOs by P1 ${a.kos}`);
  const t = freshMatch(E, Infinity);
  t.fighters[1].x = t.stage.blast.r + 10;
  run(t, 1);
  check('Training (infinite stocks) never ends', !t.result && !t.fighters[1].out);
}

console.log(`\n${results.length - fails}/${results.length} rule checks pass`);
module.exports = results;
if (require.main === module) process.exit(fails ? 1 : 0);
