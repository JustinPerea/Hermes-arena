// ---------------------------------------------------------------------------
// Hermes Arena — stage art: backdrop, armillary sphere, altar, floor, lintels.
// ---------------------------------------------------------------------------

// ---- architecture ------------------------------------------------------------

function fluteColumn(g, ink, x, yTop, yBot, w, rnd) {
  const P = inkPatterns(g, ink);
  const capH = w * 0.55;
  const baseH = w * 0.4;
  const sT = yTop + capH;
  const sB = yBot - baseH;
  // shaft with slight entasis
  g.beginPath();
  g.moveTo(x - w * 0.42, sT);
  g.quadraticCurveTo(x - w * 0.52, (sT + sB) / 2, x - w * 0.5, sB);
  g.lineTo(x + w * 0.5, sB);
  g.quadraticCurveTo(x + w * 0.52, (sT + sB) / 2, x + w * 0.42, sT);
  g.closePath();
  engraveFill(g, ink, { pat: null, lw: 1.2 });
  // fluting
  g.save();
  g.lineWidth = 0.7;
  g.strokeStyle = ink;
  const flutes = 7;
  for (let i = 1; i < flutes; i++) {
    const fx = -0.46 + (0.92 * i) / flutes;
    line(g, x + fx * w * 0.92, sT + 3, x + fx * w, sB - 2);
  }
  g.restore();
  // right-side shading
  g.save();
  g.beginPath();
  g.rect(x + w * 0.18, sT, w * 0.4, sB - sT);
  g.fillStyle = P.cross;
  g.globalAlpha *= 0.65;
  g.fill();
  g.restore();
  g.save();
  g.beginPath();
  g.rect(x - w * 0.1, sT, w * 0.28, sB - sT);
  g.fillStyle = P.hatch;
  g.globalAlpha *= 0.4;
  g.fill();
  g.restore();
  // ionic capital: abacus + echinus + volutes
  g.beginPath();
  g.rect(x - w * 0.7, yTop, w * 1.4, capH * 0.28);
  engraveFill(g, ink, { pat: 'horiz', patAlpha: 0.5, lw: 1.1 });
  g.beginPath();
  g.moveTo(x - w * 0.62, yTop + capH * 0.28);
  g.quadraticCurveTo(x, yTop + capH * 1.05, x + w * 0.62, yTop + capH * 0.28);
  g.closePath();
  engraveFill(g, ink, { pat: 'hatch', patAlpha: 0.5, lw: 1.1 });
  g.strokeStyle = ink;
  g.lineWidth = 1;
  spiral(g, x - w * 0.55, yTop + capH * 0.6, capH * 0.36, 2.2, 1);
  spiral(g, x + w * 0.55, yTop + capH * 0.6, capH * 0.36, 2.2, -1);
  // base mouldings
  g.beginPath();
  g.rect(x - w * 0.6, sB, w * 1.2, baseH * 0.45);
  engraveFill(g, ink, { pat: 'hatch', patAlpha: 0.4, lw: 1.1 });
  g.beginPath();
  g.rect(x - w * 0.72, sB + baseH * 0.45, w * 1.44, baseH * 0.55);
  engraveFill(g, ink, { pat: 'horiz', patAlpha: 0.6, lw: 1.1 });
}

function templeFront(g, ink, x0, x1, yBase, colH) {
  const w = x1 - x0;
  const n = 6;
  const cw = w / (n * 1.9);
  const entH = colH * 0.16;
  const yCol = yBase - colH;
  // steps
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.rect(x0 - 14 - i * 10, yBase + i * 9, w + 28 + i * 20, 9);
    engraveFill(g, ink, { pat: 'horiz', patAlpha: 0.5, lw: 1 });
  }
  for (let i = 0; i < n; i++) {
    const cx = x0 + cw + (i * (w - cw * 2)) / (n - 1);
    fluteColumn(g, ink, cx, yCol, yBase, cw, null);
  }
  // entablature
  g.beginPath();
  g.rect(x0 - 10, yCol - entH, w + 20, entH);
  engraveFill(g, ink, { pat: 'hatch', patAlpha: 0.35, lw: 1.1 });
  g.save();
  g.strokeStyle = ink;
  g.lineWidth = 0.8;
  for (let x = x0; x < x1; x += 16) {
    g.strokeRect(x, yCol - entH * 0.55, 6, entH * 0.45);
  }
  g.restore();
  // pediment
  const pH = w * 0.2;
  g.beginPath();
  g.moveTo(x0 - 18, yCol - entH);
  g.lineTo((x0 + x1) / 2, yCol - entH - pH);
  g.lineTo(x1 + 18, yCol - entH);
  g.closePath();
  engraveFill(g, ink, { pat: 'fine', patAlpha: 0.4, lw: 1.3 });
  g.beginPath();
  g.moveTo(x0 + 10, yCol - entH - 6);
  g.lineTo((x0 + x1) / 2, yCol - entH - pH + 12);
  g.lineTo(x1 - 10, yCol - entH - 6);
  g.closePath();
  g.strokeStyle = ink;
  g.lineWidth = 0.9;
  g.stroke();
  // tympanum emblem: a small winged disc
  const cx = (x0 + x1) / 2;
  const cy = yCol - entH - pH * 0.38;
  g.beginPath();
  g.arc(cx, cy, pH * 0.14, 0, Math.PI * 2);
  engraveFill(g, ink, { pat: 'cross', patAlpha: 0.5, lw: 1 });
  featherFan(g, ink, cx - pH * 0.12, cy, -95, 40, 4, pH * 0.35, pH * 0.2, 2.5, 0.9);
  featherFan(g, ink, cx + pH * 0.12, cy, 95, 40, 4, pH * 0.35, pH * 0.2, 2.5, 0.9);
}

function sunRelief(g, ink, cx, cy, r) {
  g.save();
  g.strokeStyle = ink;
  // flame rays
  const rays = 18;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const a2 = a + Math.PI / rays;
    const r1 = r * 1.05;
    const r2 = r * (i % 2 ? 1.6 : 1.9);
    g.beginPath();
    g.moveTo(cx + Math.cos(a - 0.12) * r1, cy + Math.sin(a - 0.12) * r1);
    g.quadraticCurveTo(
      cx + Math.cos(a - 0.25) * (r1 + r2) * 0.55, cy + Math.sin(a - 0.25) * (r1 + r2) * 0.55,
      cx + Math.cos(a + 0.05) * r2, cy + Math.sin(a + 0.05) * r2,
    );
    g.quadraticCurveTo(
      cx + Math.cos(a + 0.22) * (r1 + r2) * 0.5, cy + Math.sin(a + 0.22) * (r1 + r2) * 0.5,
      cx + Math.cos(a + 0.12) * r1, cy + Math.sin(a + 0.12) * r1,
    );
    engraveFill(g, ink, { pat: 'hatch', patAlpha: 0.5, lw: 1 });
    void a2;
  }
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  engraveFill(g, ink, { pat: 'fine', patAlpha: 0.4, lw: 1.4 });
  g.beginPath();
  g.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  g.lineWidth = 0.8;
  g.stroke();
  // engraved inner ring of short radial strokes
  g.lineWidth = 0.7;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    line(g, cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
  }
  g.beginPath();
  g.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

// Background image covering world-space rect (BG_X0..BG_X0+BG_W, BG_Y0..BG_Y0+BG_H).
// Background image covering world-space rect (BG_X0..BG_X0+BG_W, BG_Y0..BG_Y0+BG_H).
const BG_X0 = -360;
const BG_Y0 = -260;
const BG_W = 2000;
const BG_H = 1240;

function renderBackdrop(scale = 1.5) {
  const c = makeCanvas(BG_W * scale, BG_H * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.translate(-BG_X0, -BG_Y0);
  const rnd = mulberry32(7);
  const ink = INK.blue;

  // paper with visible mottling and fibres
  g.fillStyle = PAPER;
  g.fillRect(BG_X0, BG_Y0, BG_W, BG_H);
  for (let i = 0; i < 90; i++) {
    const x = BG_X0 + rnd() * BG_W;
    const y = BG_Y0 + rnd() * BG_H;
    const r = 60 + rnd() * 240;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + rnd() * 0.05;
    grd.addColorStop(0, rnd() < 0.5 ? `rgba(255,255,250,${a * 1.6})` : `rgba(130,145,175,${a})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(60,75,110,0.08)';
  g.lineWidth = 0.6;
  for (let i = 0; i < 3200; i++) {
    const x = BG_X0 + rnd() * BG_W;
    const y = BG_Y0 + rnd() * BG_H;
    const a = rnd() * Math.PI;
    const l = 2 + rnd() * 8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rnd() * 2, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }

  // construction geometry, kept very faint
  g.save();
  g.globalAlpha = 0.07;
  g.strokeStyle = ink;
  g.lineWidth = 0.9;
  for (const r of [430, 760]) {
    g.beginPath();
    g.arc(640, 200, r, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    line(g, 640 + Math.cos(a) * 200, 200 + Math.sin(a) * 200, 640 + Math.cos(a) * 1000, 200 + Math.sin(a) * 1000);
  }
  g.restore();

  // rotunda dome band with scroll frieze
  g.save();
  g.globalAlpha = 0.24;
  const dcx = 640;
  const dcy = 820;
  const R1 = 1000;
  const R2 = 930;
  const R3 = 884;
  const a0 = Math.PI * 1.1;
  const a1 = Math.PI * 1.9;
  g.beginPath();
  g.arc(dcx, dcy, R1, a0, a1);
  g.arc(dcx, dcy, R2, a1, a0, true);
  g.closePath();
  engraveFill(g, ink, { pat: 'hatch', patAlpha: 0.45, lw: 1.1 });
  g.strokeStyle = ink;
  g.lineWidth = 0.9;
  for (let i = 0; i <= 30; i++) {
    const a = a0 + ((a1 - a0) * i) / 30;
    line(g, dcx + Math.cos(a) * R2, dcy + Math.sin(a) * R2, dcx + Math.cos(a) * R1, dcy + Math.sin(a) * R1);
  }
  g.beginPath();
  g.arc(dcx, dcy, R2, a0, a1);
  g.arc(dcx, dcy, R3, a1, a0, true);
  g.closePath();
  engraveFill(g, ink, { base: PAPER_LIGHT, pat: null, lw: 1 });
  for (let i = 0; i < 40; i++) {
    const a = a0 + ((a1 - a0) * (i + 0.5)) / 40;
    const rr = (R2 + R3) / 2;
    g.lineWidth = 0.9;
    spiral(g, dcx + Math.cos(a) * rr, dcy + Math.sin(a) * rr, 12, 1.6, i % 2 ? 1 : -1);
  }
  g.restore();

  // architrave
  g.save();
  g.globalAlpha = 0.2;
  g.beginPath();
  g.rect(BG_X0, 96, BG_W, 26);
  engraveFill(g, ink, { pat: 'horiz', patAlpha: 0.5, lw: 1 });
  meanderBand(g, ink, BG_X0, BG_X0 + BG_W, 124, 22, 1);
  g.restore();

  // colonnade: big columns near the edges, smaller ones further back
  g.save();
  g.globalAlpha = 0.16;
  for (const [x, w] of [[300, 46], [980, 46]]) fluteColumn(g, ink, x, 170, 690, w, rnd);
  g.restore();
  g.save();
  g.globalAlpha = 0.27;
  for (const [x, w] of [[-210, 70], [40, 70], [1240, 70], [1490, 70]]) fluteColumn(g, ink, x, 150, 860, w, rnd);
  g.restore();

  // sun relief and temple front
  g.save();
  g.globalAlpha = 0.15;
  sunRelief(g, ink, 860, 330, 80);
  g.restore();
  g.save();
  g.globalAlpha = 0.25;
  templeFront(g, ink, 1060, 1350, 590, 250);
  g.restore();

  // left: an arched niche with a faint draped statue
  g.save();
  g.globalAlpha = 0.15;
  g.beginPath();
  g.moveTo(90, 600);
  g.lineTo(90, 350);
  g.arc(175, 350, 85, Math.PI, 0);
  g.lineTo(260, 600);
  g.closePath();
  engraveFill(g, ink, { pat: 'cross', patAlpha: 0.6, lw: 1.1 });
  g.beginPath();
  g.moveTo(150, 600);
  g.quadraticCurveTo(140, 470, 160, 400);
  g.quadraticCurveTo(175, 380, 190, 400);
  g.quadraticCurveTo(212, 470, 200, 600);
  g.closePath();
  engraveFill(g, ink, { base: PAPER_LIGHT, pat: 'vert', patAlpha: 0.35, lw: 1 });
  g.beginPath();
  g.ellipse(175, 368, 13, 16, 0, 0, Math.PI * 2);
  engraveFill(g, ink, { base: PAPER_LIGHT, pat: 'fine', patAlpha: 0.3, lw: 1 });
  featherFan(g, ink, 160, 410, -140, 40, 4, 60, 30, 5, 0.9);
  featherFan(g, ink, 190, 410, 140, 40, 4, 60, 30, 5, 0.9);
  g.restore();

  // haze towards the bottom so the world floor blends in
  const fade = g.createLinearGradient(0, 520, 0, 760);
  fade.addColorStop(0, 'rgba(230,233,230,0)');
  fade.addColorStop(1, 'rgba(230,233,230,0.85)');
  g.fillStyle = fade;
  g.fillRect(BG_X0, 520, BG_W, BG_Y0 + BG_H - 520);
  return c;
}

// Armillary sphere (drawn into a sprite a few times per second).
function drawArmillary(g, cx, cy, R, t, alpha) {
  const ink = INK.blue;
  const P = inkPatterns(g, ink);
  g.save();
  g.globalAlpha *= alpha;
  g.strokeStyle = ink;
  g.lineCap = 'round';

  // suspension: chain, ring and finial
  g.lineWidth = 1.3;
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.ellipse(cx, cy - R - 34 - i * 11, 2.4, 5, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.arc(cx, cy - R - 20, 9, 0, Math.PI * 2);
  g.lineWidth = 2;
  g.stroke();

  const band = (rx, ry, rot, w, ticks, marks, front) => {
    const s = front ? 0 : Math.PI;
    const e = front ? Math.PI : Math.PI * 2;
    const arx = Math.abs(rx);
    const ary = Math.abs(ry);
    if (arx < 1 || ary < 1) return;
    const k = w / Math.max(arx, 1);
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.beginPath();
    g.ellipse(0, 0, arx, ary, 0, s, e);
    g.ellipse(0, 0, Math.max(0.5, arx - w), Math.max(0.5, ary - w * (ary / arx)), 0, e, s, true);
    g.closePath();
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    g.fillStyle = front ? P.fine : P.cross;
    g.globalAlpha *= front ? 0.5 : 0.75;
    g.fill();
    g.globalAlpha /= front ? 0.5 : 0.75;
    g.lineWidth = 1.4;
    g.stroke();
    if (ticks) {
      g.lineWidth = 0.6;
      for (let i = 0; i <= ticks; i++) {
        const a = s + ((e - s) * i) / ticks;
        const x1 = Math.cos(a) * arx;
        const y1 = Math.sin(a) * ary;
        const long = i % 5 === 0;
        const f = 1 - k * (long ? 0.7 : 0.35);
        line(g, x1, y1, x1 * f, y1 * f);
      }
    }
    if (marks) {
      // tiny engraved letter-like marks
      g.fillStyle = ink;
      for (let i = 0; i < marks; i++) {
        const a = s + ((e - s) * (i + 0.5)) / marks;
        const f = 1 - k * 0.55;
        g.save();
        g.translate(Math.cos(a) * arx * f, Math.sin(a) * ary * f);
        g.rotate(a + Math.PI / 2);
        g.fillRect(-3, -1.5, 1.4, 3);
        g.fillRect(0, -1.5, 1.4, 3);
        g.restore();
      }
    }
    g.restore();
  };

  const th = t * 0.32;
  const rings = [
    { rx: R * Math.cos(th), ry: R * 0.98, rot: 0, w: 12, ticks: 40, marks: 0 },
    { rx: R * 0.93 * Math.cos(th + 1.2), ry: R * 0.93, rot: 0, w: 9, ticks: 0, marks: 0 },
    { rx: R * 1.02, ry: R * 1.02 * (0.28 + 0.1 * Math.sin(th * 0.7)), rot: -0.41, w: 16, ticks: 60, marks: 14 },
    { rx: R * 1.25, ry: R * 0.24, rot: 0, w: 13, ticks: 72, marks: 18 },
  ];
  for (const r of rings) band(r.rx, r.ry, r.rot, r.w, r.ticks, r.marks, false);

  // fixed outer meridian
  g.beginPath();
  g.arc(cx, cy, R + 14, 0, Math.PI * 2);
  g.arc(cx, cy, R + 2, Math.PI * 2, 0, true);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  g.fillStyle = P.horiz;
  g.globalAlpha *= 0.6;
  g.fill();
  g.globalAlpha /= 0.6;
  g.lineWidth = 1.6;
  g.stroke();
  g.lineWidth = 0.6;
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const r2 = i % 10 === 0 ? R + 2 : i % 2 === 0 ? R + 6 : R + 9;
    line(g, cx + Math.cos(a) * (R + 14), cy + Math.sin(a) * (R + 14), cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
  }
  // spokes from the globe
  g.lineWidth = 0.9;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + th * 0.5;
    line(g, cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2, cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62);
  }
  // axis
  g.lineWidth = 2;
  const ax = Math.sin(0.41) * (R + 40);
  const ay = Math.cos(0.41) * (R + 40);
  line(g, cx - ax, cy + ay, cx + ax, cy - ay);
  // central globe
  g.beginPath();
  g.arc(cx, cy, R * 0.18, 0, Math.PI * 2);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  g.fillStyle = P.cross;
  g.globalAlpha *= 0.7;
  g.fill();
  g.globalAlpha /= 0.7;
  g.lineWidth = 1.4;
  g.stroke();
  g.lineWidth = 0.7;
  for (const f of [0.35, 0.7, 1]) {
    g.beginPath();
    g.ellipse(cx, cy, R * 0.18 * Math.abs(Math.cos(th * 2 + f * 2)), R * 0.18, 0, 0, Math.PI * 2);
    g.stroke();
  }
  for (const r of rings) band(r.rx, r.ry, r.rot, r.w, r.ticks, r.marks, true);
  // pendulum below
  g.lineWidth = 1.2;
  line(g, cx, cy + R + 14, cx, cy + R + 80);
  g.beginPath();
  g.arc(cx, cy + R + 92, 12, 0, Math.PI * 2);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  g.fillStyle = P.cross;
  g.fill();
  g.lineWidth = 1.4;
  g.stroke();
  g.restore();
}

// ---- altar frieze motifs (carved relief) ------------------------------------

function maskRelief(g, ink, cx, cy, s) {
  const face = (q) => {
    q.moveTo(cx, cy - 15 * s);
    q.bezierCurveTo(cx + 12 * s, cy - 15 * s, cx + 12 * s, cy + 2 * s, cx + 8 * s, cy + 10 * s);
    q.quadraticCurveTo(cx, cy + 17 * s, cx - 8 * s, cy + 10 * s);
    q.bezierCurveTo(cx - 12 * s, cy + 2 * s, cx - 12 * s, cy - 15 * s, cx, cy - 15 * s);
    q.closePath();
  };
  // leafy hair crown behind
  const hair = (q) => {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.05 + (i / 8) * 0.9);
      const hx = cx + Math.cos(a) * 14 * s;
      const hy = cy - 3 * s + Math.sin(a) * 15 * s;
      q.moveTo(hx + 4 * s, hy);
      q.arc(hx, hy, 4.2 * s, 0, Math.PI * 2);
    }
  };
  relief(g, ink, hair, { pat: 'cross', patAlpha: 0.7, lw: 1 });
  relief(g, ink, face, { shadeBox: [cx - 12 * s, cy - 15 * s, cx + 12 * s, cy + 17 * s], lw: 1.3 });
  g.save();
  g.strokeStyle = ink;
  g.fillStyle = deepInk(ink);
  g.lineWidth = 1;
  // brow ridge with shadow beneath
  g.beginPath();
  g.moveTo(cx - 8 * s, cy - 5 * s);
  g.quadraticCurveTo(cx - 4 * s, cy - 8 * s, cx, cy - 5.5 * s);
  g.quadraticCurveTo(cx + 4 * s, cy - 8 * s, cx + 8 * s, cy - 5 * s);
  g.stroke();
  for (const ex of [-4, 4]) {
    // eye socket hatched, almond eye
    g.save();
    g.beginPath();
    g.ellipse(cx + ex * s, cy - 3 * s, 3.4 * s, 2 * s, 0, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = inkPatterns(g, ink).dense;
    g.fillRect(cx + (ex - 4) * s, cy - 6 * s, 8 * s, 4 * s);
    g.restore();
    g.beginPath();
    g.moveTo(cx + (ex - 2.6) * s, cy - 2.4 * s);
    g.quadraticCurveTo(cx + ex * s, cy - 4 * s, cx + (ex + 2.6) * s, cy - 2.4 * s);
    g.quadraticCurveTo(cx + ex * s, cy - 1.2 * s, cx + (ex - 2.6) * s, cy - 2.4 * s);
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    g.stroke();
  }
  // nose with hatched side
  g.beginPath();
  g.moveTo(cx, cy - 4 * s);
  g.lineTo(cx + 1.8 * s, cy + 4 * s);
  g.lineTo(cx - 1.4 * s, cy + 4.6 * s);
  g.stroke();
  g.save();
  g.globalAlpha = 0.8;
  g.lineWidth = 0.6;
  for (let i = 0; i < 4; i++) line(g, cx + 1 * s, cy + (-1 + i * 1.4) * s, cx + 3 * s, cy + (-0.5 + i * 1.4) * s);
  g.restore();
  // straight, solemn lips
  g.lineWidth = 1.1;
  line(g, cx - 3.4 * s, cy + 8 * s, cx + 3.4 * s, cy + 8 * s);
  line(g, cx - 2 * s, cy + 9.6 * s, cx + 2 * s, cy + 9.6 * s);
  g.restore();
}

function rosette(g, ink, cx, cy, r) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    relief(g, ink, (q) => q.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.48, r * 0.24, a, 0, Math.PI * 2), { depth: 1.4, lw: 0.9 });
  }
  relief(g, ink, (q) => q.arc(cx, cy, r * 0.28, 0, Math.PI * 2), { pat: 'dense', patAlpha: 0.8, depth: 1.4, lw: 0.9 });
}

// Thick draped swag of cloth/leaves.
function garland(g, ink, x0, y0, x1, y1, sag) {
  const N = 20;
  const top = [];
  const bot = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = lerp(x0, x1, t);
    const y = lerp(y0, y1, t) + Math.sin(t * Math.PI) * sag;
    const th = 4 + Math.sin(t * Math.PI) * 11;
    top.push([x, y - th * 0.35]);
    bot.push([x, y + th]);
  }
  const path = (q) => {
    smoothThrough(q, top, true);
    smoothThrough(q, bot.slice().reverse(), false);
    q.closePath();
  };
  const xs = [Math.min(x0, x1), Math.max(x0, x1)];
  relief(g, ink, path, { shadeBox: [xs[0], y0 - 6, xs[1], y0 + sag + 16], lw: 1.2 });
  // fold lines following the swag
  g.save();
  g.beginPath();
  path(g);
  g.clip();
  g.strokeStyle = ink;
  for (const f of [0.25, 0.5, 0.75]) {
    g.lineWidth = 0.6 + f * 0.6;
    g.beginPath();
    const pts = top.map((p, i) => [p[0], lerp(p[1], bot[i][1], f)]);
    smoothThrough(g, pts, true);
    g.stroke();
  }
  // leaf ticks along the lower edge
  g.lineWidth = 0.7;
  for (let i = 1; i < N; i++) {
    const p = bot[i];
    line(g, p[0] - 2, p[1] - 5, p[0] + 2, p[1] - 1);
  }
  g.restore();
  // ribbons hanging from the ends
  for (const [x, y, d] of [[x0, y0, x0 < x1 ? -1 : 1], [x1, y1, x0 < x1 ? 1 : -1]]) {
    relief(g, ink, (q) => {
      q.moveTo(x - 2, y);
      q.quadraticCurveTo(x + d * 6, y + 14, x + d * 2, y + 30);
      q.lineTo(x + d * 6, y + 30);
      q.quadraticCurveTo(x + d * 10, y + 14, x + 3, y);
      q.closePath();
    }, { depth: 1.5, lw: 0.9, pat: 'hatch', patAlpha: 0.4 });
  }
}

// Vine scroll with raised stem, spirals and leaves.
function rinceau(g, ink, x0, x1, cy, h) {
  const n = Math.max(2, Math.round((x1 - x0) / (h * 1.25)));
  const step = (x1 - x0) / n;
  const stem = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    stem.push([lerp(x0, x1, t), cy + Math.sin(t * n * Math.PI) * h * 0.22]);
  }
  const raised = (drawFn, w) => {
    g.save();
    g.lineCap = 'round';
    g.translate(1.6, 1.6);
    g.strokeStyle = deepInk(ink);
    g.lineWidth = w + 1;
    g.beginPath();
    drawFn();
    g.stroke();
    g.restore();
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = ink;
    g.lineWidth = w + 1.4;
    g.beginPath();
    drawFn();
    g.stroke();
    g.strokeStyle = PAPER_LIGHT;
    g.lineWidth = w - 1;
    g.beginPath();
    drawFn();
    g.stroke();
    g.restore();
  };
  raised(() => smoothThrough(g, stem, true), 4.5);
  for (let i = 0; i < n; i++) {
    const x = x0 + step * (i + 0.5);
    const up = i % 2 === 0;
    const sy = cy + (up ? -1 : 1) * h * 0.17;
    raised(() => {
      const turns = 1.5;
      const steps = 40;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const a = (up ? 1 : -1) * t * turns * Math.PI * 2 + (up ? Math.PI / 2 : -Math.PI / 2);
        const rr = h * 0.3 * (1 - t * 0.8);
        const px = x + Math.cos(a) * rr;
        const py = sy + Math.sin(a) * rr;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
    }, 3);
    // acanthus leaf
    const lx = x - step * 0.32;
    const ang = up ? 145 : 35;
    relief(g, ink, (q) => featherPath(q, lx, cy, ang, h * 0.42, h * 0.15), { depth: 1.6, lw: 1, pat: 'hatch', patAlpha: 0.55 });
  }
}

function caduceusEmblem(g, ink, cx, cy, h) {
  relief(g, ink, (q) => {
    q.rect(cx - 1.8, cy - h * 0.5, 3.6, h);
  }, { depth: 1.6, lw: 1, pat: 'cross', patAlpha: 0.6 });
  for (const ph of [0, Math.PI]) {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      pts.push([cx + Math.sin(t * Math.PI * 2.5 + ph) * h * 0.17 * (1 - t * 0.25), cy + h * 0.42 - t * h * 0.76]);
    }
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = deepInk(ink);
    g.lineWidth = 4.4;
    g.beginPath();
    smoothThrough(g, pts.map((p) => [p[0] + 1.4, p[1] + 1.4]), true);
    g.stroke();
    g.strokeStyle = ink;
    g.lineWidth = 4;
    g.beginPath();
    smoothThrough(g, pts, true);
    g.stroke();
    g.strokeStyle = PAPER_LIGHT;
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  }
  featherFan(g, ink, cx - 2, cy - h * 0.42, -128, 44, 4, h * 0.34, h * 0.16, 2.4, 1);
  featherFan(g, ink, cx + 2, cy - h * 0.42, 128, 44, 4, h * 0.34, h * 0.16, 2.4, 1);
  relief(g, ink, (q) => q.arc(cx, cy - h * 0.53, 3.2, 0, Math.PI * 2), { depth: 1.2, pat: 'dense', patAlpha: 0.7, lw: 1 });
}

// Stone block face with engraved tone, outlines by weight.
function stoneFace(g, ink, x, y, w, h, pat, alpha, lwOuter) {
  const P = inkPatterns(g, ink);
  g.beginPath();
  g.rect(x, y, w, h);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = P[pat];
  g.fill();
  g.restore();
  g.strokeStyle = lwOuter > 2 ? deepInk(ink) : ink;
  g.lineWidth = lwOuter;
  g.stroke();
}

// The altar stage. Collision tops (452 slabs, 470 middle) must match STAGES.agora.
function renderAltar(stage, scale = 2) {
  const ox = stage.art.x0;
  const oy = stage.art.y0;
  const w = stage.art.x1 - ox;
  const h = stage.art.y1 - oy;
  const c = makeCanvas(w * scale, h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.translate(-ox, -oy);
  const ink = INK.blue;
  const deep = deepInk(ink);
  const P = inkPatterns(g, ink);
  const rnd = mulberry32(11);
  const L = 300;
  const R = 980;

  // crepidoma: three widening steps down to the floor
  const steps = [[580, 596, 22], [596, 612, 42], [612, 628, 64]];
  for (const [y0, y1, out] of steps) {
    g.beginPath();
    g.moveTo(L - out + 6, y0);
    g.lineTo(R + out - 6, y0);
    g.lineTo(R + out, y0 + 5);
    g.lineTo(L - out, y0 + 5);
    g.closePath();
    engraveFill(g, ink, { pat: 'horiz', patAlpha: 0.55, lw: 1 });
    stoneFace(g, ink, L - out, y0 + 5, R - L + out * 2, y1 - y0 - 5, 'cross', 0.8, 1.4);
    chipPatches(g, ink, rnd, [L - out + 4, y0 + 6, R + out - 4, y1 - 1], 10, 6, 26);
  }

  // plinth
  stoneFace(g, ink, L - 10, 562, R - L + 20, 18, 'cross', 0.9, 1.6);
  g.save();
  g.strokeStyle = ink;
  g.lineWidth = 0.9;
  line(g, L - 10, 567, R + 10, 567);
  g.restore();
  chipPatches(g, ink, rnd, [L - 6, 568, R + 6, 579], 9, 6, 22);

  // body ground
  stoneFace(g, ink, L, 486, R - L, 76, 'cross', 0.9, 1.6);

  // corner pilasters with mask niches
  for (const px of [L, R - 30]) {
    stoneFace(g, ink, px, 486, 30, 76, 'hatch', 0.7, 1.4);
    g.beginPath();
    g.ellipse(px + 15, 522, 12, 22, 0, 0, Math.PI * 2);
    g.fillStyle = P.dense;
    g.fill();
    maskRelief(g, ink, px + 15, 522, 0.95);
  }

  // frieze panel: dense ground, carved motifs
  const fx0 = L + 38;
  const fx1 = R - 38;
  const fy0 = 491;
  const fy1 = 557;
  g.beginPath();
  g.rect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  g.fillStyle = PAPER;
  g.fill();
  g.fillStyle = P.dense;
  g.fill();
  g.save();
  g.globalAlpha = 0.5;
  g.fillStyle = P.horiz;
  g.fill();
  g.restore();
  g.strokeStyle = deep;
  g.lineWidth = 1.6;
  g.stroke();
  // inner bevel highlight
  g.strokeStyle = PAPER_LIGHT;
  g.lineWidth = 1.4;
  line(g, fx0 + 2, fy1 - 2, fx1 - 2, fy1 - 2);
  line(g, fx1 - 2, fy0 + 2, fx1 - 2, fy1 - 2);

  const midY = (fy0 + fy1) / 2;
  // centre: winged mask
  featherFan(g, ink, 616, midY - 4, -102, 58, 5, 50, 24, 4.4, 1);
  featherFan(g, ink, 664, midY - 4, 102, 58, 5, 50, 24, 4.4, 1);
  maskRelief(g, ink, 640, midY + 1, 1.75);
  // swags to rosettes
  garland(g, ink, 598, fy0 + 9, 478, fy0 + 9, 20);
  garland(g, ink, 682, fy0 + 9, 802, fy0 + 9, 20);
  rosette(g, ink, 474, fy0 + 12, 11);
  rosette(g, ink, 806, fy0 + 12, 11);
  // vine scrolls and caduceus emblems
  rinceau(g, ink, fx0 + 44, 452, midY + 10, 40);
  rinceau(g, ink, 828, fx1 - 44, midY + 10, 40);
  caduceusEmblem(g, ink, fx0 + 22, midY, 54);
  caduceusEmblem(g, ink, fx1 - 22, midY, 54);

  // cornice (with top plane where the middle walkway is recessed)
  g.beginPath();
  g.moveTo(L - 14 + 8, 466);
  g.lineTo(R + 14 - 8, 466);
  g.lineTo(R + 14, 472);
  g.lineTo(L - 14, 472);
  g.closePath();
  engraveFill(g, ink, { pat: 'hatch', patAlpha: 0.5, lw: 1.2 });
  stoneFace(g, ink, L - 14, 472, R - L + 28, 14, 'horiz', 0.75, 1.6);
  g.fillStyle = P.dense;
  g.fillRect(L - 14, 485, R - L + 28, 3);
  g.save();
  g.strokeStyle = ink;
  g.lineWidth = 0.9;
  for (let x = L - 10; x < R + 10; x += 9) {
    g.fillStyle = PAPER_LIGHT;
    g.fillRect(x, 476, 5, 6);
    g.strokeRect(x, 476, 5, 6);
  }
  g.restore();

  // recessed middle walkway (top face)
  g.beginPath();
  g.moveTo(560, 456);
  g.lineTo(720, 456);
  g.lineTo(720, 472);
  g.lineTo(560, 472);
  g.closePath();
  engraveFill(g, ink, { pat: 'cross', patAlpha: 0.55, lw: 1.2 });
  chipPatches(g, ink, rnd, [566, 459, 714, 470], 6, 8, 26);

  // raised slabs
  const slab = (x0, x1, inner) => {
    // deep top plane seen from above
    const top = (q) => {
      q.moveTo(x0 + 14, 430);
      q.lineTo(x1 - 14, 430);
      q.lineTo(x1, 458);
      q.lineTo(x0, 458);
      q.closePath();
    };
    g.beginPath();
    top(g);
    g.fillStyle = PAPER_LIGHT;
    g.fill();
    engraveLines(g, ink, top, [x0, 430, x1, 458], 0, 3.2, 0.35, 0.8, 0.85);
    g.save();
    g.beginPath();
    top(g);
    g.clip();
    chipPatches(g, ink, rnd, [x0 + 10, 433, x1 - 10, 456], 9, 10, 40);
    g.restore();
    g.beginPath();
    top(g);
    g.strokeStyle = deep;
    g.lineWidth = LW.sil * 0.8;
    g.stroke();
    // front face
    stoneFace(g, ink, x0, 458, x1 - x0, 16, 'cross', 0.85, LW.sil * 0.8);
    chipPatches(g, ink, rnd, [x0 + 4, 460, x1 - 4, 472], 8, 8, 30);
    // inner end face (toward the recess) in deep shadow
    g.beginPath();
    if (inner === 'right') {
      g.moveTo(x1, 458);
      g.lineTo(x1 - 14, 430);
      g.lineTo(x1 - 14, 456);
      g.lineTo(x1, 474);
    } else {
      g.moveTo(x0, 458);
      g.lineTo(x0 + 14, 430);
      g.lineTo(x0 + 14, 456);
      g.lineTo(x0, 474);
    }
    g.closePath();
    g.fillStyle = deep;
    g.fill();
    g.strokeStyle = deep;
    g.lineWidth = 1;
    g.stroke();
  };
  slab(L, 560, 'right');
  slab(720, R, 'left');

  // engraved inscription, reserved in paper on the right slab front
  g.save();
  g.fillStyle = PAPER_LIGHT;
  g.font = 'italic 700 11px Georgia, "Times New Roman", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = '6px';
  g.fillText('ΕΡΜΗΣ · ΑΓΩΝ', 850, 466.5);
  g.restore();

  // outer ends in shadow
  g.save();
  g.fillStyle = P.dense;
  g.fillRect(R - 6, 486, 6, 76);
  g.restore();
  // a few long cracks
  g.save();
  g.globalAlpha = 0.9;
  crack(g, deep, rnd, 520, 487, 40, Math.PI / 2 + 0.3);
  crack(g, deep, rnd, 905, 487, 34, Math.PI / 2 - 0.2);
  crack(g, deep, rnd, 360, 459, 14, Math.PI / 2);
  g.restore();
  // heavy silhouette around the whole mass
  g.save();
  g.strokeStyle = deep;
  g.lineWidth = LW.sil;
  g.lineJoin = 'miter';
  g.beginPath();
  g.moveTo(L - 14, 472);
  g.lineTo(L - 14, 486);
  g.lineTo(L, 486);
  g.lineTo(L, 562);
  g.lineTo(L - 10, 562);
  g.lineTo(L - 10, 580);
  g.lineTo(L - 22, 580);
  g.lineTo(L - 22, 596);
  g.lineTo(L - 42, 596);
  g.lineTo(L - 42, 612);
  g.lineTo(L - 64, 612);
  g.lineTo(L - 64, 628);
  g.lineTo(R + 64, 628);
  g.lineTo(R + 64, 612);
  g.lineTo(R + 42, 612);
  g.lineTo(R + 42, 596);
  g.lineTo(R + 22, 596);
  g.lineTo(R + 22, 580);
  g.lineTo(R + 10, 580);
  g.lineTo(R + 10, 562);
  g.lineTo(R, 562);
  g.lineTo(R, 486);
  g.lineTo(R + 14, 486);
  g.lineTo(R + 14, 472);
  g.stroke();
  g.restore();
  return c;
}

function crack(g, ink, rnd, x, y, len, ang) {
  g.save();
  g.strokeStyle = ink;
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(x, y);
  let px = x;
  let py = y;
  let a = ang;
  const segs = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < segs; i++) {
    a += (rnd() - 0.5) * 1.1;
    px += Math.cos(a) * (len / segs);
    py += Math.sin(a) * (len / segs);
    g.lineTo(px, py);
  }
  g.stroke();
  g.restore();
}

// Floor plane in world space under the altar (wide enough for any camera).
function renderFloor(stage, scale = 1) {
  const x0 = -620;
  const y0 = 600;
  const w = 2520;
  const h = 760;
  const c = makeCanvas(w * scale, h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.translate(-x0, -y0);
  const ink = INK.blue;
  // fade from transparent at the top into paper
  const fade = g.createLinearGradient(0, y0, 0, y0 + 40);
  fade.addColorStop(0, 'rgba(230,233,230,0)');
  fade.addColorStop(1, PAPER);
  g.fillStyle = fade;
  g.fillRect(x0, y0, w, 40);
  g.fillStyle = PAPER;
  g.fillRect(x0, y0 + 40, w, h - 40);
  // horizontal engraving that tightens with depth
  g.strokeStyle = ink;
  for (let i = 0; i < 70; i++) {
    const t = i / 70;
    const y = 628 + Math.pow(t, 1.5) * (h - 40);
    g.globalAlpha = 0.08 + t * 0.22;
    g.lineWidth = 0.5 + t * 0.6;
    line(g, x0, y, x0 + w, y);
  }
  // perspective joints of floor slabs
  g.globalAlpha = 0.1;
  g.lineWidth = 0.8;
  for (let i = -14; i <= 14; i++) line(g, 640 + i * 60, 628, 640 + i * 260, y0 + h);
  g.globalAlpha = 1;
  // soft blue wash and contact shadow under the altar
  const sh = g.createRadialGradient(640, 640, 30, 640, 640, 560);
  sh.addColorStop(0, rgba(ink, 0.28));
  sh.addColorStop(1, rgba(ink, 0));
  g.save();
  g.translate(640, 640);
  g.scale(1, 0.16);
  g.translate(-640, -640);
  g.fillStyle = sh;
  g.fillRect(40, 80, 1200, 1120);
  g.restore();
  const P = inkPatterns(g, ink);
  g.fillStyle = P.dense;
  g.fillRect(232, 628, 816, 5);
  c.x0 = x0;
  c.y0 = y0;
  c.w = w;
  c.h = h;
  return c;
}

// Floating carved lintel platform.
function drawLintel(g, ink, p) {
  const P = inkPatterns(g, ink);
  const deep = deepInk(ink);
  const x0 = p.l;
  const x1 = p.r;
  const y = p.t;
  const rnd = mulberry32(Math.round(x0 * 7 + y));
  g.save();
  // top face
  const top = (q) => {
    q.moveTo(x0 + 8, y - 12);
    q.lineTo(x1 - 8, y - 12);
    q.lineTo(x1, y + 3);
    q.lineTo(x0, y + 3);
    q.closePath();
  };
  g.beginPath();
  top(g);
  g.fillStyle = PAPER_LIGHT;
  g.fill();
  g.save();
  g.globalAlpha = 0.65;
  g.fillStyle = P.horiz;
  g.fill();
  g.restore();
  g.save();
  g.beginPath();
  top(g);
  g.clip();
  chipPatches(g, ink, rnd, [x0 + 8, y - 10, x1 - 8, y + 2], 4, 8, 26);
  g.restore();
  // front face: dark ground with the meander reserved in paper
  g.beginPath();
  g.rect(x0, y + 3, x1 - x0, 16);
  g.fillStyle = PAPER;
  g.fill();
  g.fillStyle = P.cross;
  g.fill();
  meanderBand(g, PAPER_LIGHT, x0 + 5, x1 - 5, y + 5.5, 11, 2.4);
  meanderBand(g, ink, x0 + 5, x1 - 5, y + 5.5, 11, 0.8);
  // underside shadow
  g.fillStyle = P.dense;
  g.fillRect(x0 + 3, y + 19, x1 - x0 - 6, 5);
  // broken ends
  for (const [ex, dir] of [[x0, -1], [x1, 1]]) {
    g.beginPath();
    g.moveTo(ex, y - (dir > 0 ? 0 : 0) + 3);
    g.lineTo(ex + dir * 3, y + 7);
    g.lineTo(ex - dir * 1, y + 11);
    g.lineTo(ex + dir * 2, y + 15);
    g.lineTo(ex - dir * 2, y + 19);
    g.lineTo(ex - dir * 7, y + 19);
    g.lineTo(ex - dir * 7, y + 3);
    g.closePath();
    g.fillStyle = deep;
    g.fill();
  }
  // silhouette
  g.strokeStyle = deep;
  g.lineWidth = LW.sil * 0.85;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x0 + 8, y - 12);
  g.lineTo(x1 - 8, y - 12);
  g.lineTo(x1, y + 3);
  g.lineTo(x1 + 3, y + 7);
  g.lineTo(x1 - 1, y + 11);
  g.lineTo(x1 + 2, y + 15);
  g.lineTo(x1 - 2, y + 22);
  g.lineTo(x0 + 2, y + 22);
  g.lineTo(x0 - 2, y + 15);
  g.lineTo(x0 + 1, y + 11);
  g.lineTo(x0 - 3, y + 7);
  g.lineTo(x0, y + 3);
  g.closePath();
  g.stroke();
  g.restore();
}
