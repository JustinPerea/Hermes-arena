// ---------------------------------------------------------------------------
// Hermes Arena — art: procedural engraving primitives, backdrop, stage, figures
// Everything is drawn in code. World units are pixels at zoom 1 (y down).
// ---------------------------------------------------------------------------

// ---- primitive helpers -----------------------------------------------------

// Fill the current path as an engraved surface: paper base, hatch pattern, outline.
function engraveFill(g, ink, opts = {}) {
  const P = inkPatterns(g, ink);
  if (opts.base !== false) {
    g.fillStyle = opts.base || PAPER_LIGHT;
    g.fill(opts.rule || 'nonzero');
  }
  if (opts.pat) {
    g.save();
    g.globalAlpha *= opts.patAlpha == null ? 1 : opts.patAlpha;
    g.fillStyle = P[opts.pat];
    g.fill(opts.rule || 'nonzero');
    g.restore();
  }
  if (opts.lw !== 0) {
    g.strokeStyle = ink;
    g.lineWidth = opts.lw || 1.6;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.stroke();
  }
}

// Shade part of a shape: clip to the shape path (already built by pathFn) and
// fill a half-plane region with a pattern.
function shadeRegion(g, ink, pathFn, regionFn, pat, alpha = 1) {
  const P = inkPatterns(g, ink);
  g.save();
  g.beginPath();
  pathFn(g);
  g.clip();
  g.beginPath();
  regionFn(g);
  g.globalAlpha *= alpha;
  g.fillStyle = P[pat];
  g.fill();
  g.restore();
}

function line(g, x1, y1, x2, y2) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

// Tapered capsule (limb) from a to b with half-widths w1, w2.
function capsulePath(g, ax, ay, bx, by, w1, w2) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 0.0001;
  const nx = -dy / len;
  const ny = dx / len;
  const ang = Math.atan2(dy, dx);
  g.moveTo(ax + nx * w1, ay + ny * w1);
  g.lineTo(bx + nx * w2, by + ny * w2);
  g.arc(bx, by, w2, ang + Math.PI / 2, ang - Math.PI / 2, true);
  g.lineTo(ax - nx * w1, ay - ny * w1);
  g.arc(ax, ay, w1, ang - Math.PI / 2, ang + Math.PI / 2, true);
  g.closePath();
}

function engravedLimb(g, ink, a, b, w1, w2, shade) {
  g.beginPath();
  capsulePath(g, a[0], a[1], b[0], b[1], w1, w2);
  engraveFill(g, ink, { pat: shade, patAlpha: shade === 'cross' ? 0.8 : 0.55, lw: 1.7 });
  // modelling contour along the shadow side
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  g.save();
  g.globalAlpha *= 0.55;
  g.lineWidth = 0.8;
  g.strokeStyle = ink;
  line(g, a[0] - nx * w1 * 0.45, a[1] - ny * w1 * 0.45, b[0] - nx * w2 * 0.45, b[1] - ny * w2 * 0.45);
  g.restore();
}

// A single feather: leaf from base along angle (deg, dirv convention), length L.
function featherPath(g, x, y, angDeg, L, W) {
  const [dx, dy] = dirv(angDeg);
  const nx = -dy;
  const ny = dx;
  const tx = x + dx * L;
  const ty = y + dy * L;
  g.moveTo(x, y);
  g.quadraticCurveTo(x + dx * L * 0.5 + nx * W, y + dy * L * 0.5 + ny * W, tx, ty);
  g.quadraticCurveTo(x + dx * L * 0.5 - nx * W, y + dy * L * 0.5 - ny * W, x, y);
}

function featherFan(g, ink, x, y, baseAng, spread, count, L0, L1, W, alpha = 1) {
  g.save();
  g.globalAlpha *= alpha;
  for (let i = count - 1; i >= 0; i--) {
    const t = count === 1 ? 0 : i / (count - 1);
    const ang = baseAng + spread * (t - 0.5);
    const L = lerp(L0, L1, t);
    g.beginPath();
    featherPath(g, x, y, ang, L, W);
    engraveFill(g, ink, { pat: 'fine', patAlpha: 0.6, lw: 1.1 });
    const [dx, dy] = dirv(ang);
    g.lineWidth = 0.6;
    line(g, x, y, x + dx * L * 0.85, y + dy * L * 0.85);
  }
  g.restore();
}

// Greek key (meander) band between x0..x1, top y, height h.
function meanderBand(g, ink, x0, x1, y, h, lw = 1) {
  const s = h / 5;
  const unit = s * 5;
  g.save();
  g.strokeStyle = ink;
  g.lineWidth = lw;
  g.lineJoin = 'miter';
  g.beginPath();
  g.rect(x0, y, x1 - x0, h);
  g.stroke();
  g.beginPath();
  for (let x = x0 + s * 0.5; x + unit <= x1 + 0.1; x += unit) {
    const py = y + s * 0.5;
    g.moveTo(x, py + s * 4);
    g.lineTo(x, py);
    g.lineTo(x + s * 4, py);
    g.lineTo(x + s * 4, py + s * 3);
    g.lineTo(x + s * 2, py + s * 3);
    g.lineTo(x + s * 2, py + s * 1.6);
    g.moveTo(x, py + s * 4);
    g.lineTo(x + unit, py + s * 4);
  }
  g.stroke();
  g.restore();
}

// Vitruvian wave scroll band.
function waveBand(g, ink, x0, x1, y, h, lw = 1) {
  g.save();
  g.strokeStyle = ink;
  g.lineWidth = lw;
  g.beginPath();
  const u = h * 1.6;
  g.moveTo(x0, y + h);
  for (let x = x0; x < x1 - 1; x += u) {
    const cx = x + u * 0.55;
    g.quadraticCurveTo(x + u * 0.25, y + h, x + u * 0.3, y + h * 0.5);
    g.arc(cx, y + h * 0.5, h * 0.28, Math.PI, Math.PI * 2.6, false);
    g.quadraticCurveTo(x + u * 0.9, y + h, x + u, y + h);
  }
  g.stroke();
  g.restore();
}

function spiral(g, cx, cy, r, turns, dir = 1) {
  g.beginPath();
  const steps = 40 * turns;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = dir * t * turns * Math.PI * 2;
    const rr = r * (1 - t * 0.85);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}


// ---- effects -----------------------------------------------------------------

function drawDust(g, ink, fx) {
  const t = fx.t / fx.life;
  const r = fx.r * (0.4 + t * 0.9);
  g.save();
  g.globalAlpha *= (1 - t) * 0.9;
  const P = inkPatterns(g, ink);
  g.beginPath();
  g.arc(fx.x, fx.y - r * 0.5, r, 0, Math.PI * 2);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  g.fillStyle = P.hatch;
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = 1;
  g.stroke();
  g.restore();
}

function drawRing(g, ink, fx) {
  const t = fx.t / fx.life;
  g.save();
  g.globalAlpha *= 1 - t;
  g.strokeStyle = ink;
  g.lineWidth = 2 * (1 - t) + 0.5;
  g.beginPath();
  g.ellipse(fx.x, fx.y, fx.r * (0.5 + t), fx.r * 0.3 * (0.5 + t), 0, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

function drawSwoosh(g, ink, pts, alpha) {
  if (pts.length < 3) return;
  g.save();
  g.globalAlpha *= alpha;
  const P = inkPatterns(g, ink);
  // crescent from tip trail toward the hand trail
  g.beginPath();
  g.moveTo(pts[0].tip[0], pts[0].tip[1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].tip[0], pts[i].tip[1]);
  for (let i = pts.length - 1; i >= 0; i--) {
    const m = pts[i];
    const w = i / (pts.length - 1);
    g.lineTo(lerp(m.tip[0], m.hand[0], 0.25 + 0.4 * w), lerp(m.tip[1], m.hand[1], 0.25 + 0.4 * w));
  }
  g.closePath();
  g.fillStyle = 'rgba(246,248,251,0.6)';
  g.fill();
  g.fillStyle = P.hatch;
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(pts[0].tip[0], pts[0].tip[1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].tip[0], pts[i].tip[1]);
  g.stroke();
  g.restore();
}

// Engraved display lettering.
function inkText(g, text, x, y, size, ink, opts = {}) {
  g.save();
  g.font = `${opts.weight || 700} ${size}px ${opts.font || 'Georgia, "Times New Roman", serif'}`;
  g.textAlign = opts.align || 'center';
  g.textBaseline = opts.baseline || 'alphabetic';
  if ('letterSpacing' in g) g.letterSpacing = `${opts.spacing == null ? Math.round(size * 0.12) : opts.spacing}px`;
  if (opts.hatch) {
    const P = inkPatterns(g, ink);
    g.fillStyle = PAPER_LIGHT;
    g.fillText(text, x, y);
    g.fillStyle = P[opts.hatch];
    g.fillText(text, x, y);
    g.strokeStyle = ink;
    g.lineWidth = opts.lw || Math.max(1, size / 28);
    g.strokeText(text, x, y);
  } else {
    g.fillStyle = opts.color || ink;
    g.fillText(text, x, y);
  }
  g.restore();
}


// ---- engraving helpers (form-following) --------------------------------------

// Append a smoothed polyline (quadratic through midpoints) to the current path.
function smoothThrough(g, pts, startWithMove) {
  if (!pts.length) return;
  if (startWithMove) g.moveTo(pts[0][0], pts[0][1]);
  else g.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  g.lineTo(last[0], last[1]);
}

// Parallel engraving lines clipped to a path. angle in degrees (screen), spacing
// in world units, line width ramps from w0 to w1 across the region (perpendicular
// to the lines), optional bow bends each line.
function engraveLines(g, ink, pathFn, box, angle, spacing, w0, w1, alpha = 1, bow = 0) {
  g.save();
  g.beginPath();
  pathFn(g);
  g.clip();
  g.strokeStyle = ink;
  g.globalAlpha *= alpha;
  const a = angle * D2R;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const nx = -dy;
  const ny = dx;
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  const R = Math.hypot(box[2] - box[0], box[3] - box[1]) / 2 + 2;
  const n = Math.ceil((R * 2) / spacing);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const o = -R + t * R * 2;
    const px = cx + nx * o;
    const py = cy + ny * o;
    g.lineWidth = lerp(w0, w1, t);
    g.beginPath();
    g.moveTo(px - dx * R, py - dy * R);
    if (bow) g.quadraticCurveTo(px + nx * bow, py + ny * bow, px + dx * R, py + dy * R);
    else g.lineTo(px + dx * R, py + dy * R);
    g.stroke();
  }
  g.restore();
}

// Raised relief: cast shadow, paper face, shaded lower-right, outline.
function relief(g, ink, pathFn, opts = {}) {
  const P = inkPatterns(g, ink);
  const off = opts.depth == null ? 2.2 : opts.depth;
  g.save();
  g.translate(off, off);
  g.beginPath();
  pathFn(g);
  g.fillStyle = deepInk(ink);
  g.fill();
  g.restore();
  g.beginPath();
  pathFn(g);
  g.fillStyle = opts.base || PAPER_LIGHT;
  g.fill();
  if (opts.pat) {
    g.save();
    g.globalAlpha *= opts.patAlpha || 0.5;
    g.fillStyle = P[opts.pat];
    g.fill();
    g.restore();
  }
  if (opts.shadeBox) {
    const b = opts.shadeBox;
    shadeRegion(g, ink, pathFn, (q) => {
      q.moveTo(b[0] + (b[2] - b[0]) * 0.45, b[3] + 4);
      q.lineTo(b[2] + 4, b[3] + 4);
      q.lineTo(b[2] + 4, b[1] + (b[3] - b[1]) * 0.25);
      q.closePath();
    }, 'cross', 0.85);
  }
  g.beginPath();
  pathFn(g);
  g.strokeStyle = ink;
  g.lineWidth = opts.lw || LW.form;
  g.lineJoin = 'round';
  g.stroke();
}

// Irregular reserved-paper chips (marble spalls) inside a rectangle.
function chipPatches(g, ink, rnd, rect, n, sizeMin = 5, sizeMax = 22) {
  const [x0, y0, x1, y1] = rect;
  g.save();
  for (let i = 0; i < n; i++) {
    const cx = x0 + rnd() * (x1 - x0);
    const cy = y0 + rnd() * (y1 - y0);
    const s = sizeMin + rnd() * (sizeMax - sizeMin);
    const sy = Math.min(s * (0.35 + rnd() * 0.4), (y1 - y0) * 0.45);
    const verts = 5 + Math.floor(rnd() * 4);
    const pts = [];
    for (let v = 0; v < verts; v++) {
      const a = (v / verts) * Math.PI * 2 + rnd() * 0.5;
      const r = 0.6 + rnd() * 0.5;
      pts.push([clamp(cx + Math.cos(a) * s * 0.5 * r, x0, x1), clamp(cy + Math.sin(a) * sy * 0.5 * r, y0, y1)]);
    }
    g.beginPath();
    pts.forEach((p, j) => (j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    // ink edge only on the shadow (lower/right) side
    g.strokeStyle = deepInk(ink);
    g.lineWidth = 1.1;
    g.beginPath();
    let started = false;
    for (let j = 0; j <= verts; j++) {
      const p = pts[j % verts];
      const q = pts[(j + 1) % verts];
      const nxs = q[1] - p[1];
      const nys = -(q[0] - p[0]);
      if (nxs * 0.6 + nys * 0.8 > 0) {
        if (!started) {
          g.moveTo(p[0], p[1]);
          started = true;
        }
        g.lineTo(q[0], q[1]);
      } else started = false;
    }
    g.stroke();
  }
  g.restore();
}
