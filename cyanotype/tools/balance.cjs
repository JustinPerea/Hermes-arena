// Balance checks from the roster doc ("Balance evals"), run headless against
// the real engine:
//   1. KO table     damage % at which each kill move KOs each fighter, from
//                   center stage and from the ledge (uncharged and full charge)
//   2. Doc vs code  the doc's move and physics tables against the code
//   3. Frame check  startup, active frames, total, advantage on shield, and
//                   moves that are both faster and stronger than another
//                   fighter's move in the same slot
// Writes report.md and report.json to <outdir>. Exit code 1 if a check fails.
//
// Usage: node tools/balance.cjs [outdir] [--fighters hermes,hermes]
const fs = require('fs');
const path = require('path');
const loadEngine = require('./engine.cjs');

const args = process.argv.slice(2);
const outdir = path.resolve(args.find((a) => !a.startsWith('--') && !a.includes(',')) || 'balance-report');
const fiArg = args.indexOf('--fighters');
const E = loadEngine();
const playable = Object.keys(E.FIGHTER_DEFS).filter((id) => E.ANIMS[E.FIGHTER_DEFS[id].anim]);
const matchup = fiArg >= 0 ? args[fiArg + 1].split(',') : [playable[0], playable[0]];
const roster = [...new Set(matchup)];
const DOC = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/roster-doc.json'), 'utf8'));

// Targets from the doc
const KO_TARGET = { lo: 85, hi: 115 }; // best grounded kill move vs Hermes, from center
const MAX_PCT = 300;

const failures = [];
const R = E.RULES;

// ---------------------------------------------------------------------------
// shared helpers
const book = (id) => E.ANIMS[E.FIGHTER_DEFS[id].anim];
const hitsOf = (d) => (d && d.hit ? d.hit.filter((h) => !h.grab) : []);
const first = (d) => Math.min(...d.hit.map((h) => h.f[0]));
// hit groups in frame order: [{ start, end, hits:[...] }]
function strikes(d) {
  const seen = new Set();
  const out = [];
  d.hit.forEach((h, i) => {
    if (seen.has(i)) return;
    const g = E.hitGroup(d, i);
    g.forEach((j) => seen.add(j));
    const hs = g.map((j) => d.hit[j]);
    out.push({ start: Math.min(...hs.map((x) => x.f[0])), end: Math.max(...hs.map((x) => x.f[1])), hits: hs });
  });
  return out.sort((a, b) => a.start - b.start);
}
const fmtRange = (rs) => rs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
function activeRanges(d) {
  const fr = new Set();
  for (const h of d.hit) for (let f = h.f[0]; f <= h.f[1]; f++) fr.add(f);
  const s = [...fr].sort((a, b) => a - b);
  const out = [];
  for (const f of s) {
    const last = out[out.length - 1];
    if (last && f === last[1] + 1) last[1] = f;
    else out.push([f, f]);
  }
  return out;
}
const kind = (name, d) => (/^throw_/.test(name) ? 'throw' : /^special/.test(name) ? 'special' : d.air ? 'aerial' : /smash$/.test(name) ? 'smash' : 'ground');

// ---------------------------------------------------------------------------
// 1. KO table
// A KO is crossing the side or top blast line before hitstun ends, with no
// input and no DI from the victim (the doc's reference model).
function koAt(attId, vicId, h, pct, spot, charge, d) {
  const m = new E.Match({ fighters: [attId, vicId], stocks: Infinity });
  const [a, v] = m.fighters;
  const surf = m.stage.solids.filter((s) => spot.x >= s.l && spot.x <= s.r).sort((p, q) => p.t - q.t)[0];
  v.x = v.px = spot.x;
  v.y = v.py = surf.t;
  v.ground = surf;
  v.setState('ground');
  v.damage = pct;
  // launch toward the near blast line: back-angled moves are used facing away
  const face = h.ang > 90 ? -1 : 1;
  a.face = face;
  a.x = spot.x - face * 40;
  a.y = surf.t;
  a.ground = surf;
  a.move = { name: d.name, f: h.f[0], charge, hitIds: new Set() };
  a.setState('move');
  m.resolveHit(a, v, m.strikeOf(a, h), v.x, v.y - 60);
  a.move = null;
  a.setState('ground');
  const B = m.stage.blast;
  let frames = 0;
  const stun = v.hitstun;
  for (let i = 0; i < 2000 && frames <= stun; i++) {
    const lag = v.hitlag > 0;
    v.ctrl.feed(null);
    // step only the victim: the attacker stands still
    const x0 = v.x;
    const y0 = v.y;
    v.update(m);
    if (v.falls > 0 || v.state === 'respawn') return { ko: true, x0, y0 };
    if (v.x > B.r || v.x < B.l || v.y < B.t) return { ko: true };
    if (!lag) frames++;
    if (v.state !== 'hurt') return { ko: false };
  }
  return { ko: false };
}
function koPercent(attId, vicId, h, spot, charge, d) {
  for (let p = 0; p <= MAX_PCT; p++) if (koAt(attId, vicId, h, p, spot, charge, d).ko) return p;
  return null;
}
function koTable() {
  const spots = { center: { x: 640 }, ledge: { x: 960 } };
  const rows = [];
  for (const att of roster) {
    const B = book(att);
    for (const [name, d] of Object.entries(B)) {
      if (!d.hit || name === 'special_d_hit' || /^proj_/.test(name)) continue;
      const k = kind(name, d);
      // candidate hitboxes: every distinct strong launcher (kb >= 6, not a spike)
      const cands = [];
      const ss = strikes(d);
      ss.forEach((s, si) => {
        // earlier weak hits (knockback 3 or less) carry the victim into this one
        const before = ss.slice(0, si).filter((x) => x.hits.every((hh) => (hh.kb || 0) <= 3)).reduce((t, x) => t + Math.max(...x.hits.map((hh) => hh.dmg || 0)), 0);
        for (const h of s.hits) {
          if (h.grab || (h.kb || 0) < 6 || (h.ang || 0) < 0) continue;
          if (cands.some((c) => c.h.dmg === h.dmg && c.h.kb === h.kb && c.h.ang === h.ang)) continue;
          cands.push({ h, before });
        }
      });
      if (!cands.length) continue;
      for (const vic of roster) {
        const row = { attacker: att, move: name, label: d.label, kind: k, victim: vic };
        for (const [spot, at] of Object.entries(spots)) {
          let best = null;
          for (const c of cands) {
            const p = koPercent(att, vic, c.h, at, 0, d);
            // the move's earlier hits add damage before the launcher lands
            const pre = p == null ? null : Math.max(0, p - c.before);
            if (pre != null && (best == null || pre < best.pct)) best = { pct: pre, h: c.h };
          }
          row[spot] = best ? best.pct : null;
          row.hit = row.hit || (best && best.h);
          if (d.charge) {
            let bc = null;
            for (const c of cands) {
              const p = koPercent(att, vic, c.h, at, 1, d);
              const pre = p == null ? null : Math.max(0, p - c.before * (1 + R.smashCharge));
              if (pre != null && (bc == null || pre < bc)) bc = pre;
            }
            row[spot + 'Charged'] = bc == null ? null : Math.round(bc);
          }
        }
        rows.push(row);
      }
    }
  }
  // target: each fighter's best grounded kill move vs Hermes, from center
  const verdicts = [];
  for (const att of roster) {
    const g = rows.filter((r) => r.attacker === att && r.victim === 'hermes' && (r.kind === 'smash' || r.kind === 'ground') && r.center != null);
    if (!g.length) continue;
    const best = g.reduce((a, b) => (b.center < a.center ? b : a));
    const ok = best.center >= KO_TARGET.lo && best.center <= KO_TARGET.hi;
    verdicts.push({ attacker: att, move: best.move, center: best.center, ok });
    if (!ok) failures.push(`KO table: ${E.FIGHTER_DEFS[att].name}'s best grounded kill move (${best.move}) KOs Hermes at ${best.center}% from center; target ${KO_TARGET.lo}-${KO_TARGET.hi}%`);
  }
  return { rows, verdicts };
}

// ---------------------------------------------------------------------------
// 2. Doc vs code
const SLOT_ANIMS = {
  Jab: ['jab1', 'jab2', 'jab3'], 'Dash attack': ['dash_attack'], 'Forward tilt': ['ftilt'], 'Up tilt': ['utilt'], 'Down tilt': ['dtilt'],
  'Forward smash': ['fsmash'], 'Up smash': ['usmash'], 'Down smash': ['dsmash'],
  'Neutral air': ['nair'], 'Forward air': ['fair'], 'Back air': ['bair'], 'Up air': ['uair'], 'Down air': ['dair'],
  Grab: ['grab'], 'Dash grab': ['dash_grab'], Pummel: ['pummel'],
  'Forward throw': ['throw_f'], 'Back throw': ['throw_b'], 'Up throw': ['throw_u'], 'Down throw': ['throw_d'],
  'Getup attack': ['getup_attack'], 'Ledge attack': ['ledge_attack'],
  'Neutral special': ['special_n'], 'Side special': ['special_s'], 'Up special': ['special_u'], 'Down special': ['special_d'],
};
const nums = (s) => (String(s).match(/-?\d+(\.\d+)?/g) || []).map(Number);
const uniq = (a) => [...new Set(a.map((x) => Math.round(x * 1000) / 1000))].sort((p, q) => p - q);
const same = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-6);
function codeSlot(B, slot) {
  const names = SLOT_ANIMS[slot].filter((n) => B[n]);
  if (!names.length) return null;
  const ds = names.map((n) => B[n]);
  // a projectile's hits count as the move's hits
  const hits = [];
  for (const d of ds) {
    for (const h of d.hit || []) hits.push(h);
    if (d.spawn && B[d.spawn.anim]) for (const h of B[d.spawn.anim].hit || []) hits.push(h);
    // a counter's strike is the move that answers the blow
    const strike = d.counter && B[d.counterMove || 'special_d_hit'];
    if (strike) for (const h of strike.hit || []) hits.push(h);
  }
  const real = hits.filter((h) => !h.grab);
  const d0 = ds[0];
  const startup = d0.counter ? d0.counter[0][0] : d0.hit && d0.hit.length ? first(d0) : d0.spawn ? d0.spawn.f : null;
  return {
    names,
    label: d0.label,
    startup: startup == null ? [] : [startup],
    total: ds.map((d) => d.frames),
    damage: uniq(real.map((h) => h.dmg || 0)),
    kb: uniq(real.map((h) => h.kb || 0)),
    angle: uniq(real.map((h) => h.ang || 0)),
    landLag: d0.landLag || (B[names[0] + '_air'] && B[names[0] + '_air'].landLag) || null,
  };
}
function docVsCode() {
  const out = { moves: [], names: [], physics: [], missing: [] };
  const fighters = DOC.tables.filter((t) => /^(Hermes|Aethon|Kairos|Iris),/.test(t.section));
  for (const t of fighters) {
    const fname = t.section.split(',')[0];
    const id = fname.toLowerCase();
    if (!E.FIGHTER_DEFS[id]) {
      out.missing.push(`${fname}: in the doc, not in the code yet`);
      continue;
    }
    const B = book(id);
    const [hdr, ...rows] = t.rows;
    const col = (n) => hdr.indexOf(n);
    for (const r of rows) {
      const slot = r[col('Slot')];
      if (!SLOT_ANIMS[slot]) continue;
      const c = codeSlot(B, slot);
      if (!c) {
        out.moves.push({ fighter: fname, slot, field: 'move', doc: r[col('Name')], code: 'missing' });
        continue;
      }
      const docName = r[col('Name')];
      if (docName && c.label.replace(/ \d$/, '') !== docName) out.names.push({ fighter: fname, slot, doc: docName, code: c.label, anim: c.names.join(', ') });
      const fields = [['Startup', 'startup'], ['Total', 'total'], ['Damage', 'damage'], ['KB', 'kb'], ['Angle', 'angle']];
      for (const [dc, k] of fields) {
        const cell = r[col(dc)];
        if (cell == null || cell === '') continue;
        if (/absorbed/.test(cell)) {
          // set by the shared counter rule, not by the move data
          continue;
        }
        let dv = k === 'total' ? nums(cell) : uniq(nums(cell));
        let cv = k === 'total' ? c.total : c[k];
        if (k === 'startup') dv = dv.slice(0, 1);
        if (!same(k === 'total' ? dv : uniq(dv), k === 'total' ? cv : uniq(cv))) out.moves.push({ fighter: fname, slot, field: dc, doc: cell, code: cv.join(' / ') });
      }
      const what = r[col('What it does')] || '';
      const ll = what.match(/[Ll]and(?:ing)? lag (\d+)/);
      if (ll && Number(ll[1]) !== c.landLag) out.moves.push({ fighter: fname, slot, field: 'Land lag', doc: ll[1], code: String(c.landLag) });
      const it = what.match(/intangible (?:on )?frames (\d+) to (\d+)/);
      const d0 = B[c.names[0]];
      if (it && slot !== 'Down special' && !(d0.intan && d0.intan.some(([a, b]) => a === +it[1] && b === +it[2]))) out.moves.push({ fighter: fname, slot, field: 'Intangible', doc: `${it[1]}-${it[2]}`, code: d0.intan ? fmtRange(d0.intan) : 'none' });
    }
  }
  // physics table
  const ph = DOC.tables.find((t) => t.section === 'Physics values');
  if (ph) {
    const [hdr, ...rows] = ph.rows;
    for (const r of rows) {
      const field = r[0];
      hdr.slice(1).forEach((fname, i) => {
        const id = fname.toLowerCase();
        const def = E.FIGHTER_DEFS[id];
        if (!def || !(field in def)) return;
        const dv = nums(r[i + 1])[0];
        if (dv == null || Math.abs(dv - def[field]) > 1e-6) out.physics.push({ fighter: fname, field, doc: r[i + 1], code: String(def[field]) });
      });
    }
  }
  const n = out.moves.length + out.physics.length;
  if (n) failures.push(`Doc vs code: ${out.moves.length} move mismatches and ${out.physics.length} physics mismatches`);
  return out;
}

// ---------------------------------------------------------------------------
// 3. Frame check
function frameCheck() {
  const rows = [];
  for (const id of roster) {
    const B = book(id);
    for (const [name, d] of Object.entries(B)) {
      if (!d.hit || !d.hit.length || /^proj_/.test(name)) continue;
      const k = kind(name, d);
      const grab = d.hit.every((h) => h.grab);
      const ss = strikes(d);
      const last = ss[ss.length - 1];
      const dmg = Math.max(...last.hits.map((h) => h.dmg || 0));
      const total = d.cancel || d.frames;
      let shield = null;
      if (!grab && k !== 'throw' && name !== 'pummel') {
        const stun = R.shieldstun(dmg);
        // the attacker can act after the move ends (or its cancel frame);
        // an aerial is assumed to land the frame after it connects
        shield = d.air && d.landLag ? stun - d.landLag : stun - (total - last.start);
      }
      rows.push({
        fighter: id, move: name, label: d.label, kind: k,
        startup: first(d), active: fmtRange(activeRanges(d)), total: d.frames, cancel: d.cancel || null, landLag: d.landLag || null,
        damage: Math.round(hitsOf(d).reduce((t, h) => Math.max(t, h.dmg || 0), 0) * 10) / 10,
        kb: hitsOf(d).reduce((t, h) => Math.max(t, h.kb || 0), 0),
        shield,
      });
    }
  }
  // faster AND stronger than another fighter's move in the same slot
  const flags = [];
  for (const a of rows)
    for (const b of rows) {
      if (a.fighter === b.fighter || a.move !== b.move) continue;
      if (a.startup < b.startup && a.damage > b.damage && a.kb >= b.kb)
        flags.push(`${a.fighter} ${a.move} (startup ${a.startup}, ${a.damage}%) beats ${b.fighter} ${b.move} (startup ${b.startup}, ${b.damage}%) on both speed and strength`);
    }
  if (flags.length) failures.push(`Frame check: ${flags.length} moves are both faster and stronger than the same slot on another fighter`);
  return { rows, flags };
}

// ---------------------------------------------------------------------------
const t0 = Date.now();
const ko = koTable();
const doc = docVsCode();
const frames = frameCheck();
const rules = (() => {
  // the rule tests print as they go; silence them here
  const log = console.log;
  console.log = () => {};
  try {
    return require('./rules-test.cjs');
  } finally {
    console.log = log;
  }
})();
for (const r of rules) if (!r.ok) failures.push(`Engine rule: ${r.name}`);

// ---- report -----------------------------------------------------------------
const name = (id) => E.FIGHTER_DEFS[id].name;
const cell = (v) => (v == null ? `> ${MAX_PCT}` : `${v}%`);
const L = [];
L.push(`# Balance report: ${matchup.map(name).join(' vs ')}`);
L.push('');
L.push(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from the game code, against the roster doc snapshot of ${DOC.snapshot} (rev ${DOC.rev}). ${failures.length ? `**${failures.length} checks fail.**` : '**All checks pass.**'}`);
L.push('');
if (failures.length) {
  L.push('## Failing');
  L.push('');
  for (const f of failures) L.push(`- ${f}`);
  L.push('');
}
L.push('## Engine rules');
L.push('');
L.push(`${rules.filter((r) => r.ok).length} of ${rules.length} shared engine rules verified in the running engine (tools/rules-test.cjs).`);
L.push('');
for (const r of rules) L.push(`- ${r.ok ? 'Pass' : '**Fail**'}: ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
L.push('');
L.push('## 1. KO table');
L.push('');
L.push('Damage the victim has **before** the move at which it KOs. A KO means crossing the side or top blast line before hitstun ends, with no DI and no input from the victim. "Center" stands the victim at x 640, "Ledge" at x 960 (the ledge is at 980). Back-angled moves are used facing away from the ledge. Charged columns are a full 60-frame smash charge. Moves whose strongest hit has knockback under 6 or a downward angle are left out.');
L.push('');
for (const v of ko.verdicts) L.push(`- Target (best grounded kill move vs Hermes from center, ${KO_TARGET.lo} to ${KO_TARGET.hi}%): ${name(v.attacker)}'s ${v.move} at ${v.center}%: **${v.ok ? 'pass' : 'fail'}**`);
L.push('');
L.push('| Attacker | Move | Kind | Victim | Hit (dmg / kb / angle) | Center | Ledge | Center charged | Ledge charged |');
L.push('|---|---|---|---|---|---|---|---|---|');
const kindOrder = { smash: 0, ground: 1, special: 2, aerial: 3, throw: 4 };
for (const r of ko.rows.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || (a.center ?? 999) - (b.center ?? 999)))
  L.push(`| ${name(r.attacker)} | ${r.label} (${r.move}) | ${r.kind} | ${name(r.victim)} | ${r.hit ? `${r.hit.dmg} / ${r.hit.kb} / ${r.hit.ang}` : ''} | ${cell(r.center)} | ${cell(r.ledge)} | ${'centerCharged' in r ? cell(r.centerCharged) : ''} | ${'ledgeCharged' in r ? cell(r.ledgeCharged) : ''} |`);
L.push('');
L.push('## 2. Doc vs code');
L.push('');
L.push(`Compares the move and physics tables in the roster doc with the code. Numbers are compared as sets (the doc's "8 (late 5)" is {8, 5}); Psychopomp Guard's strike damage is set by the shared counter rule and is not compared.`);
L.push('');
if (doc.missing.length) for (const m of doc.missing) L.push(`- ${m}`);
L.push('');
L.push(`### Numbers (${doc.moves.length + doc.physics.length} mismatches)`);
L.push('');
if (doc.moves.length + doc.physics.length) {
  L.push('| Fighter | Slot | Field | Doc | Code |');
  L.push('|---|---|---|---|---|');
  for (const m of doc.moves) L.push(`| ${m.fighter} | ${m.slot} | ${m.field} | ${m.doc} | ${m.code} |`);
  for (const m of doc.physics) L.push(`| ${m.fighter} | physics | ${m.field} | ${m.doc} | ${m.code} |`);
} else L.push('Every number matches.');
L.push('');
L.push(`### Move names (${doc.names.length} differ)`);
L.push('');
L.push("The doc's move names against the animation labels in the code. Not counted as a failure.");
L.push('');
if (doc.names.length) {
  L.push('| Fighter | Slot | Doc name | Code label |');
  L.push('|---|---|---|---|');
  for (const m of doc.names) L.push(`| ${m.fighter} | ${m.slot} | ${m.doc} | ${m.code} |`);
}
L.push('');
L.push('## 3. Frame check');
L.push('');
L.push(`Startup is the first frame that can hit (from 0). Shield is frame advantage when the move's last hit is blocked: shieldstun (round(2 + 0.8 x damage)) minus the attacker's remaining frames; for aerials, minus landing lag. Negative means the defender acts first.`);
L.push('');
L.push(frames.flags.length ? frames.flags.map((f) => `- ${f}`).join('\n') : `- No move is both faster and stronger than the same slot on another fighter${roster.length < 2 ? ' (only one fighter is in the code, so there is nothing to compare yet)' : ''}.`);
L.push('');
L.push('| Fighter | Move | Kind | Startup | Active | Total | Land lag | Max dmg | Max kb | On shield |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
for (const r of frames.rows.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.startup - b.startup))
  L.push(`| ${name(r.fighter)} | ${r.label} (${r.move}) | ${r.kind} | ${r.startup} | ${r.active} | ${r.total}${r.cancel ? ` (cancel ${r.cancel})` : ''} | ${r.landLag || ''} | ${r.damage} | ${r.kb} | ${r.shield == null ? '' : (r.shield > 0 ? '+' : '') + r.shield} |`);
L.push('');
L.push(`_${((Date.now() - t0) / 1000).toFixed(1)} s. Run again with \`node tools/balance.cjs <outdir>\` from the source folder._`);

fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(path.join(outdir, 'report.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(outdir, 'report.json'), JSON.stringify({ matchup, failures, rules, ko, doc, frames }, null, 1));
console.log(failures.length ? `${failures.length} failing:\n- ` + failures.join('\n- ') : 'all checks pass');
console.log('report:', path.join(outdir, 'report.md'));
process.exit(failures.length ? 1 : 0);
