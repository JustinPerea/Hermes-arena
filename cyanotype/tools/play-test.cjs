// Drives the built game (dist/web/index.html) through every move with real
// key presses and reports which animations each scenario reached, damage dealt
// to the dummy, and any page errors. Screenshots go to <outdir>/play-*.png.
//
// Usage: node tools/play-test.cjs <outdir> [scenarioName,...]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const out = path.resolve(process.argv[2] || 'play');
const only = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCENARIOS = [
  ['idle', [], ['idle']],
  ['run-skid-turn', [['hold', 'KeyD', 600], ['wait', 60], ['hold', 'KeyA', 250], ['wait', 300]], ['dash', 'run', 'skid', 'turn']],
  ['walk', [['call', 'walk'], ['wait', 500]], ['walk']],
  ['crouch', [['hold', 'KeyS', 500], ['wait', 200]], ['crouch', 'crouch_idle', 'crouch_up']],
  ['jab', [['tap', 'KeyJ'], ['wait', 250], ['tap', 'KeyJ'], ['wait', 250], ['tap', 'KeyJ'], ['wait', 600]], ['jab1', 'jab2', 'jab3']],
  ['tilts', [['combo', 'KeyD', 'KeyJ'], ['wait', 600], ['combo', 'KeyW', 'KeyJ'], ['wait', 600], ['combo', 'KeyS', 'KeyJ'], ['wait', 500]], ['ftilt', 'utilt', 'dtilt']],
  ['dash-attack', [['down', 'KeyD'], ['wait', 130], ['tap', 'KeyJ'], ['up', 'KeyD'], ['wait', 700]], ['dash_attack']],
  ['smashes', [['hold', 'KeyI', 500], ['wait', 700], ['combo', 'KeyW', 'KeyI'], ['wait', 900], ['combo', 'KeyS', 'KeyI'], ['wait', 900]], ['fsmash', 'usmash', 'dsmash']],
  ['aerials', [['tap', 'Space'], ['wait', 90], ['tap', 'KeyJ'], ['wait', 800], ['tap', 'Space'], ['wait', 90], ['combo', 'KeyD', 'KeyJ'], ['wait', 900],
    ['tap', 'Space'], ['wait', 90], ['combo', 'KeyA', 'KeyJ'], ['wait', 900], ['tap', 'Space'], ['wait', 90], ['combo', 'KeyW', 'KeyJ'], ['wait', 900],
    ['tap', 'Space'], ['wait', 90], ['combo', 'KeyS', 'KeyJ'], ['wait', 900]], ['jumpsquat', 'jump', 'nair', 'fair', 'bair', 'uair', 'dair']],
  ['jumps', [['tap', 'Space'], ['wait', 250], ['tap', 'Space'], ['wait', 450], ['tap', 'KeyS'], ['wait', 700]], ['jump', 'double_jump', 'fall', 'fastfall']],
  ['specials', [['tap', 'KeyK'], ['wait', 900], ['combo', 'KeyD', 'KeyK'], ['wait', 900], ['combo', 'KeyS', 'KeyK'], ['wait', 900], ['combo', 'KeyW', 'KeyK'], ['wait', 1800]],
    ['special_n', 'special_s', 'special_d', 'special_u', 'helpless']],
  ['counter', [['combo', 'KeyS', 'KeyK'], ['wait', 120], ['call', 'dummyJab'], ['wait', 1000]], ['special_d', 'special_d_hit']],
  ['shield-dodge', [['down', 'KeyL'], ['wait', 400], ['tap', 'KeyS'], ['wait', 500], ['tap', 'KeyD'], ['wait', 650], ['tap', 'KeyA'], ['wait', 650], ['up', 'KeyL'], ['wait', 300]],
    ['shield_up', 'shield', 'spotdodge', 'roll_f', 'roll_b']],
  ['shield-hit', [['down', 'KeyL'], ['wait', 150], ['call', 'dummyJab'], ['wait', 400], ['up', 'KeyL'], ['wait', 300]], ['shield_stun', 'shield_drop']],
  ['airdodge', [['tap', 'Space'], ['wait', 200], ['tap', 'KeyL'], ['wait', 900]], ['airdodge']],
  ['grab-throws', [['tap', 'KeyU'], ['wait', 250], ['tap', 'KeyJ'], ['wait', 350], ['tap', 'KeyD'], ['wait', 900], ['call', 'reset'],
    ['tap', 'KeyU'], ['wait', 250], ['tap', 'KeyW'], ['wait', 900], ['call', 'reset'], ['tap', 'KeyU'], ['wait', 250], ['tap', 'KeyS'], ['wait', 900], ['call', 'reset'],
    ['tap', 'KeyU'], ['wait', 250], ['tap', 'KeyA'], ['wait', 900]], ['grab', 'grab_hold', 'pummel', 'throw_f', 'throw_u', 'throw_d', 'throw_b']],
  ['taunts', [['tap', 'KeyT'], ['wait', 1100], ['combo', 'KeyD', 'KeyT'], ['wait', 1100], ['combo', 'KeyS', 'KeyT'], ['wait', 1100]], ['taunt_up', 'taunt_side', 'taunt_down']],
  ['ledge', [['call', 'nearLedge'], ['wait', 900], ['tap', 'KeyW'], ['wait', 900], ['call', 'nearLedge'], ['wait', 900], ['tap', 'Space'], ['wait', 900],
    ['call', 'nearLedge'], ['wait', 900], ['tap', 'KeyJ'], ['wait', 900], ['call', 'nearLedge'], ['wait', 900], ['tap', 'KeyL'], ['wait', 900]],
    ['ledge_grab', 'ledge_hang', 'ledge_climb', 'ledge_jump', 'ledge_attack', 'ledge_roll']],
  ['teeter', [['call', 'edge'], ['wait', 500]], ['teeter']],
  ['get-hit', [['call', 'getSmashed'], ['wait', 2600], ['tap', 'KeyW'], ['wait', 900]], ['hurt_heavy', 'tumble', 'knockdown', 'lie', 'getup']],
  ['get-hit-light', [['call', 'getJabbed'], ['wait', 700]], ['hurt_light']],
  ['getup-attack', [['call', 'lie'], ['wait', 500], ['tap', 'KeyJ'], ['wait', 900], ['call', 'lie'], ['wait', 500], ['tap', 'KeyD'], ['wait', 900]], ['getup_attack', 'getup_roll']],
  ['tech', [['call', 'getSmashedLow'], ['wait', 150], ['press-near-land', 'KeyL'], ['wait', 800]], ['tech']],
  ['ko', [['call', 'blast'], ['wait', 1600], ['tap', 'KeyD'], ['wait', 600]], ['respawn']],
  ['platform-drop', [['call', 'onPlatform'], ['wait', 200], ['tap', 'KeyS'], ['wait', 600]], ['platform_drop']],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../dist/web/index.html') + '?debug');
  await sleep(700);
  await page.mouse.click(640, 360);
  await sleep(300);
  await page.evaluate(() => {
    const g = window.__arena._game;
    window.__G = g;
    g.options.alwaysRun = true;
    window.__calls = {
      reset() {
        const [p, d] = g.fighters;
        p.reset({ x: 600, y: 452 });
        p.face = 1;
        p.ground = g.stage.solids[2 - 1 + 1] && g.stage.solids.find((s) => s.t === 452 && s.l === 300);
        p.state = 'ground';
        p.anim = 'idle';
        d.reset({ x: 680, y: 452 });
        d.face = -1;
        d.ground = g.stage.solids.find((s) => s.t === 452 && s.l === 720);
        d.state = 'ground';
        d.anim = 'idle';
        d.damage = 40;
        d.x = 680;
        p.ground = g.stage.solids.find((s) => s.t === 452 && s.l === 300);
        p.x = 545;
        d.ground = g.stage.solids.find((s) => s.t === 470);
        d.y = 470;
        // put both on the middle walkway so they can reach each other
        p.ground = g.stage.solids.find((s) => s.t === 470);
        p.x = 600;
        p.y = 470;
        d.x = 680;
        p.seen = p.seen || new Set();
        d.seen = d.seen || new Set();
        p.seen.add('idle');
      },
      walk() {
        const p = g.fighters[0];
        // half-tilted stick, as a gamepad would give
        let n = 0;
        const orig = g.readInputs.bind(g);
        g.readInputs = () => {
          const r = orig();
          if (n++ < 40 && r) r.p1 = Object.assign({}, r.p1, { x: 0.45 });
          if (n >= 40) g.readInputs = orig;
          return r;
        };
        void p;
      },
      dummyJab() {
        const d = g.fighters[1];
        d.face = -1;
        d.startMove('ftilt', g);
      },
      nearLedge() {
        const p = g.fighters[0];
        p.reset({ x: 280, y: 360 });
        p.face = 1;
        p.vy = 4;
        p.seen = p.seen || new Set();
      },
      edge() {
        const p = g.fighters[0];
        p.ground = g.stage.solids.find((s) => s.t === 452 && s.l === 720);
        p.x = 978;
        p.y = 452;
        p.vx = 0;
        p.face = 1;
        p.state = 'ground';
      },
      getSmashed() {
        const [p, d] = g.fighters;
        p.damage = 50; // enough to tumble, not enough to KO
        p.takeHit(g, d, { dmg: 12, kb: 8, ang: 60 }, { x: p.x, y: p.y - 70 });
      },
      getSmashedLow() {
        const [p, d] = g.fighters;
        p.damage = 60; // kb 6: apex stays below the platform above the walkway
        p.takeHit(g, d, { dmg: 10, kb: 6, ang: 80 }, { x: p.x, y: p.y - 70 });
      },
      getJabbed() {
        const [p, d] = g.fighters;
        p.damage = 0; // a light hit at low percent flinches instead of launching
        p.takeHit(g, d, { dmg: 2, kb: 1, ang: 30 }, { x: p.x, y: p.y - 70 });
      },
      lie() {
        const p = g.fighters[0];
        p.setState('lie');
        p.play('lie', 0, 0);
        p.stateT = 30;
      },
      blast() {
        const p = g.fighters[0];
        p.x = -400;
        p.y = 200;
      },
      onPlatform() {
        const p = g.fighters[0];
        const pl = g.stage.plats[0];
        p.ground = pl;
        p.x = (pl.l + pl.r) / 2;
        p.y = pl.t;
        p.state = 'ground';
      },
    };
  });

  const report = {};
  for (const [name, steps, expect] of SCENARIOS) {
    if (only && !only.includes(name)) continue;
    await page.evaluate(() => { window.__G.fighters[0].seen = null; window.__calls.reset(); });
    await sleep(120);
    let shot = 0;
    for (const st of steps) {
      const [op, a, b] = st;
      if (op === 'hold') await page.keyboard.down(a), await sleep(b), await page.keyboard.up(a);
      else if (op === 'tap') await page.keyboard.press(a);
      else if (op === 'down') await page.keyboard.down(a);
      else if (op === 'up') await page.keyboard.up(a);
      else if (op === 'wait') await sleep(a);
      else if (op === 'combo') await page.keyboard.down(a), await sleep(30), await page.keyboard.press(b), await sleep(30), await page.keyboard.up(a);
      else if (op === 'call') await page.evaluate((fn) => window.__calls[fn](), a);
      else if (op === 'press-near-land') {
        for (let i = 0; i < 120; i++) {
          const y = await page.evaluate(() => { const p = window.__G.fighters[0]; return { vy: p.vy, y: p.y, g: !!p.ground }; });
          if (y.vy > 0 && y.y > 400) break;
          await sleep(5);
        }
        await page.keyboard.press(a);
      }
      if (op === 'wait' && a >= 500 && shot < 3) {
        await page.screenshot({ path: `${out}/play-${name}-${shot++}.png` });
      }
    }
    const seen = await page.evaluate(() => ({ p: [...(window.__G.fighters[0].seen || [])], d: window.__G.fighters[1].damage, state: window.__G.fighters[0].state }));
    const missing = expect.filter((e) => !seen.p.includes(e));
    report[name] = { missing, seen: seen.p, dummyDamage: seen.d, endState: seen.state };
  }
  await browser.close();
  console.log(JSON.stringify({ errors, report }, null, 1));
})();
