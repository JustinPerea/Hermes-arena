// Loads the real game engine (src/*.js) into a Node VM with no browser, so
// balance checks and rule tests run against the same code the game ships.
// Usage: const E = require('./engine.cjs')(); new E.Match({ fighters: ['hermes', 'hermes'] })
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.resolve(__dirname, '../src');

function engineFiles() {
  const anims = fs.readdirSync(path.join(SRC, 'anims')).filter((f) => f.endsWith('.js')).sort().map((f) => 'anims/' + f);
  return ['core.js', 'art.js', 'stage.js', 'figure.js', 'anim.js', 'skins.js', ...anims, 'fighter.js', 'match.js'];
}

// A canvas stand-in: every drawing call is a no-op, every property read works.
function fakeCanvas() {
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : /^(create|get)/.test(String(k)) ? () => ctx : () => {}),
    set: (t, k, v) => ((t[k] = v), true),
  });
  return { width: 0, height: 0, style: {}, getContext: () => ctx, setAttribute() {}, addEventListener() {} };
}

module.exports = function loadEngine() {
  const code = engineFiles().map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n') +
    '\n;({ Match, Fighter, FIGHTER_DEFS, FIGHTER_ROSTER, ANIMS, STAGES, RULES, liveHitboxes, animJoints, animContext, inRanges, hitGroup, Controller, EMPTY_RAW, clamp })';
  const sandbox = {
    console, Math, Date, Map, Set, Object, Array, JSON, Number, String, Proxy, Error,
    document: { createElement: fakeCanvas },
    window: {}, navigator: {}, performance: { now: () => 0 },
    OffscreenCanvas: undefined,
  };
  vm.createContext(sandbox);
  return vm.runInContext(code, sandbox, { filename: 'engine.js' });
};
