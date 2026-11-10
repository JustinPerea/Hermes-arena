// ---------------------------------------------------------------------------
// Hermes Arena — core: constants, math, ink patterns, input, controllers
// ---------------------------------------------------------------------------

const VW = 1280;
const VH = 720;
const STEP = 1000 / 60;
const D2R = Math.PI / 180;

const INK = {
  blue: '#1d3b91',
  blueDeep: '#0e2566',
  sanguine: '#8a3324',
  sanguineDeep: '#561a10',
  green: '#24563f',
  violet: '#4a2f78',
};
const DEEP = { '#1d3b91': '#0e2566', '#8a3324': '#561a10', '#24563f': '#123323', '#4a2f78': '#2a1748' };
const deepInk = (ink) => DEEP[ink] || ink;
const PAPER = '#e6e9e6';
const PAPER_LIGHT = '#f1f2ed';
// line-weight hierarchy (world units at zoom 1)
const LW = { sil: 2.8, form: 1.3, detail: 0.8, hatch: 0.5 };

// Player ink by slot (4 players supported)
const SLOT_INKS = [INK.blue, INK.sanguine, INK.green, INK.violet];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Angle convention for limbs: 0 = straight down, 90 = forward, 180 = up, -90 = back.
// Returns [x, y] in screen space (y down) for a figure facing +x.
function dirv(deg) {
  const a = deg * D2R;
  return [Math.sin(a), Math.cos(a)];
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------------------------------------------------------------------------
// Engraving patterns. One set per ink colour, cached. Patterns are drawn at
// 2x density so lines stay fine when the world is zoomed.
// ---------------------------------------------------------------------------
const _patternCache = new Map();

function inkPatterns(ctx, color) {
  const key = color;
  if (_patternCache.has(key)) return _patternCache.get(key);
  const mk = (size, draw) => {
    const R = 3; // tiles are rendered at 3x and scaled down so hatching stays crisp when zoomed
    const c = makeCanvas(size * R, size * R);
    const g = c.getContext('2d');
    g.scale(R, R);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineCap = 'square';
    draw(g, size);
    const p = ctx.createPattern(c, 'repeat');
    if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(1 / R));
    return p;
  };
  const diag = (g, s, w, alpha, flip) => {
    g.globalAlpha = alpha;
    g.lineWidth = w;
    g.beginPath();
    for (let o = -s; o <= s * 2; o += s) {
      if (flip) {
        g.moveTo(o, 0);
        g.lineTo(o + s, s);
      } else {
        g.moveTo(o, s);
        g.lineTo(o + s, 0);
      }
    }
    g.stroke();
  };
  const set = {
    // light diagonal hatching
    hatch: mk(6, (g, s) => diag(g, s, 0.9, 0.75, false)),
    // fine light hatching (for subtle surfaces)
    fine: mk(5, (g, s) => diag(g, s, 0.6, 0.55, false)),
    // cross hatching (shadow)
    cross: mk(6, (g, s) => {
      diag(g, s, 0.9, 0.8, false);
      diag(g, s, 0.9, 0.8, true);
    }),
    // dense cross hatching (deep shadow)
    dense: mk(4, (g, s) => {
      diag(g, s, 1, 0.9, false);
      diag(g, s, 1, 0.9, true);
    }),
    // horizontal engraving lines (stone faces)
    horiz: mk(4, (g, s) => {
      g.globalAlpha = 0.7;
      g.fillRect(0, 1, s, 0.8);
    }),
    // vertical lines (fluting, cloth)
    vert: mk(4, (g, s) => {
      g.globalAlpha = 0.7;
      g.fillRect(1, 0, 0.8, s);
    }),
    // stipple
    dots: mk(5, (g) => {
      g.globalAlpha = 0.8;
      g.fillRect(1, 1, 1, 1);
      g.fillRect(3.5, 3.5, 1, 1);
    }),
  };
  _patternCache.set(key, set);
  return set;
}

// ---------------------------------------------------------------------------
// Input: keyboard (two layouts) + gamepads, feeding per-slot Controllers.
// ---------------------------------------------------------------------------
const BUTTONS = ['jump', 'attack', 'special', 'shield', 'strong', 'grab', 'taunt', 'start', 'back'];

const KEY_LAYOUTS = {
  p1: {
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    jump: ['Space'], attack: ['KeyJ'], special: ['KeyK'], shield: ['KeyL'], strong: ['KeyI'],
    grab: ['KeyU'], taunt: ['KeyT'], start: ['Enter'], back: [],
  },
  // arrows + Z/X/C/V; used by P1 when nobody else is on the keyboard
  p1alt: {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    jump: [], attack: ['KeyZ'], special: ['KeyX'], shield: ['KeyC'], strong: ['KeyV'],
    grab: ['KeyB'], taunt: ['KeyN'], start: [], back: [],
  },
  p2: {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    jump: ['ShiftRight', 'Numpad0'], attack: ['Comma', 'Numpad1'], special: ['Period', 'Numpad2'],
    shield: ['Slash', 'Numpad3'], strong: ['Semicolon', 'Numpad5'],
    grab: ['Quote', 'Numpad4'], taunt: ['BracketRight', 'Numpad6'], start: ['NumpadEnter'], back: ['Backslash'],
  },
};

const GAME_KEYS = new Set();
for (const lay of Object.values(KEY_LAYOUTS)) for (const k of Object.values(lay)) k.forEach((c) => GAME_KEYS.add(c));
GAME_KEYS.add('KeyM');
GAME_KEYS.add('KeyH');
// 1-4: cycle the look (skin) of player 1-4
const SKIN_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
SKIN_KEYS.forEach((c) => GAME_KEYS.add(c));

class Keyboard {
  constructor(target) {
    this.down = new Set();
    this.tapped = new Set(); // pressed since last poll (catches taps shorter than a frame)
    this.target = target;
    this.onDown = (e) => {
      // never swallow host shortcuts (Cmd/Ctrl/Alt combos)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (GAME_KEYS.has(e.code)) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.repeat) return;
      this.down.add(e.code);
      this.tapped.add(e.code);
      if (this.listener) this.listener(e.code);
    };
    this.onUp = (e) => {
      // macOS drops keyup for keys released while Cmd is held: clear everything
      if (e.key === 'Meta' || e.key === 'Control') this.down.clear();
      if (GAME_KEYS.has(e.code)) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.down.delete(e.code);
    };
    this.onBlur = () => this.down.clear();
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }
  is(code) {
    return this.down.has(code) || this.tapped.has(code);
  }
  any(codes) {
    for (const c of codes) if (this.is(c)) return true;
    return false;
  }
  read(layoutName) {
    const L = KEY_LAYOUTS[layoutName];
    const raw = {
      x: (this.any(L.right) ? 1 : 0) - (this.any(L.left) ? 1 : 0),
      y: (this.any(L.down) ? 1 : 0) - (this.any(L.up) ? 1 : 0),
    };
    for (const b of BUTTONS) raw[b] = this.any(L[b]);
    return raw;
  }
  endFrame() {
    this.tapped.clear();
  }
  destroy() {
    this.target.removeEventListener('keydown', this.onDown);
    this.target.removeEventListener('keyup', this.onUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}

// Connected standard-mapping pads in stable connection order.
function listGamepads() {
  const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
  const out = [];
  for (const p of pads) if (p && p.connected && (p.mapping === 'standard' || p.mapping === '')) out.push(p);
  out.sort((a, b) => a.index - b.index);
  return out;
}

function readGamepad(p) {
  if (!p || !p.connected) return null;
  const ax = (i) => (Math.abs(p.axes[i] || 0) > 0.3 ? p.axes[i] : 0);
  const bt = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
  let x = ax(0);
  let y = ax(1);
  if (bt(14)) x = -1;
  if (bt(15)) x = 1;
  if (bt(12)) y = -1;
  if (bt(13)) y = 1;
  const rx = ax(2);
  const ry = ax(3);
  const cstick = Math.hypot(rx, ry) > 0.7;
  if (cstick) {
    x = rx;
    y = ry;
  }
  return {
    x, y,
    attack: bt(0),
    special: bt(1),
    jump: bt(2) || bt(3),
    shield: bt(6) || bt(7),
    grab: bt(4) || bt(5),
    strong: cstick,
    taunt: bt(8),
    start: bt(9),
    back: false,
  };
}

function mergeRaw(a, b) {
  if (!b) return a;
  if (!a) return b;
  const out = { x: Math.abs(b.x) > Math.abs(a.x) ? b.x : a.x, y: Math.abs(b.y) > Math.abs(a.y) ? b.y : a.y };
  for (const k of BUTTONS) out[k] = !!(a[k] || b[k]);
  return out;
}

const EMPTY_RAW = { x: 0, y: 0, jump: false, attack: false, special: false, shield: false, strong: false, grab: false, taunt: false, start: false, back: false };

// Turns raw held state into presses with a short input buffer.
class Controller {
  constructor() {
    this.frame = 0;
    this.x = 0;
    this.y = 0;
    this.held = {};
    this.prev = {};
    this.buf = {};
    this.prevDir = { up: false, down: false, left: false, right: false };
  }
  feed(raw) {
    raw = raw || EMPTY_RAW;
    this.frame++;
    this.x = clamp(raw.x || 0, -1, 1);
    this.y = clamp(raw.y || 0, -1, 1);
    for (const b of BUTTONS) {
      const h = !!raw[b];
      if (h && !this.prev[b]) this.buf[b] = this.frame;
      this.held[b] = h;
      this.prev[b] = h;
    }
    const dirs = { up: this.y < -0.5, down: this.y > 0.5, left: this.x < -0.5, right: this.x > 0.5 };
    for (const d in dirs) {
      if (dirs[d] && !this.prevDir[d]) this.buf[d] = this.frame;
      this.prevDir[d] = dirs[d];
    }
  }
  pressed(b, win = 6) {
    const f = this.buf[b];
    return f !== undefined && this.frame - f < win;
  }
  take(b, win = 6) {
    if (this.pressed(b, win)) {
      delete this.buf[b];
      return true;
    }
    return false;
  }
  clear() {
    this.buf = {};
  }
}

// ---------------------------------------------------------------------------
// Sound: tiny WebAudio synth, created lazily on first input.
// ---------------------------------------------------------------------------
class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }
  ensure() {
    if (this.muted) return false;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.3;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    } catch (e) {
      return false;
    }
  }
  tone(freq, dur, type = 'sine', vol = 0.4, slideTo = null) {
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.4, freq = 1200, q = 0.8, type = 'bandpass', slideTo = null) {
    const c = this.ctx;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }
  play(name, power = 1) {
    if (!this.ensure()) return;
    switch (name) {
      case 'jump': this.noise(0.12, 0.18, 900, 1, 'bandpass', 2400); break;
      case 'djump': this.noise(0.16, 0.2, 1400, 2, 'bandpass', 3600); this.tone(520, 0.12, 'sine', 0.06, 900); break;
      case 'land': this.noise(0.08, 0.2, 300, 1, 'lowpass'); break;
      case 'step': this.noise(0.04, 0.05, 500, 1, 'lowpass'); break;
      case 'swing': this.noise(0.14, 0.15, 700, 1.5, 'bandpass', 2600); break;
      case 'hit':
        this.noise(0.1 + power * 0.05, 0.35 + power * 0.1, 900, 0.7, 'lowpass', 200);
        this.tone(160 + 40 / power, 0.12 + power * 0.04, 'triangle', 0.35, 50);
        break;
      case 'ko': this.noise(0.9, 0.5, 2000, 0.5, 'lowpass', 80); this.tone(90, 0.8, 'sawtooth', 0.15, 30); break;
      case 'select': this.tone(660, 0.06, 'triangle', 0.15); break;
      case 'confirm': this.tone(523, 0.08, 'triangle', 0.18); this.timer = setTimeout(() => this.ctx && this.tone(784, 0.12, 'triangle', 0.18), 70); break;
      default: break;
    }
  }
  close() {
    clearTimeout(this.timer);
    try {
      if (this.ctx) this.ctx.close();
    } catch (e) { /* ignore */ }
    this.ctx = null;
  }
}
