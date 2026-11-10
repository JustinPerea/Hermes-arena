#!/usr/bin/env python3
"""Onion-skin a concept's idle render over its reference, aligned on ground and head height.

Usage:
  python3 tools/overlay.py <render-zoom.png> <ref.png> <out.png>
      --ref-ground Y --ref-top Y --ref-x X [--top 182] [--zoom 4]

- render-zoom.png: the *-zoom.png written by tools/idle-render.cjs. In it the figure's
  feet point (0,0) sits at x = 0.45 * width, y = height - 30, and 1 world unit = --zoom px.
- --top: the render's head top in world units above the feet (the height you are
  matching, e.g. the top of the hat/helmet crown, not wing tips).
- --ref-ground / --ref-top / --ref-x: in the reference image, the y of the ground line
  under the feet, the y of the same head-top landmark, and the x of the point midway
  between the feet (the render's x = 0).

Output: render ink in red, reference ink in blue, overlap in dark purple, on white.
Where only red shows, the render has a line the reference lacks; only blue, the
render is missing it. Also prints the scale used.
"""
import argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('render'); ap.add_argument('ref'); ap.add_argument('out')
ap.add_argument('--ref-ground', type=float, required=True)
ap.add_argument('--ref-top', type=float, required=True)
ap.add_argument('--ref-x', type=float, required=True)
ap.add_argument('--top', type=float, default=182)
ap.add_argument('--zoom', type=float, default=4)
a = ap.parse_args()

R = Image.open(a.render).convert('L')
F = Image.open(a.ref).convert('L')
gx, gy = 0.45 * R.width, R.height - 30
s = (a.top * a.zoom) / (a.ref_ground - a.ref_top)  # ref px -> render px
F2 = F.resize((max(1, round(F.width * s)), max(1, round(F.height * s))), Image.LANCZOS)
canvas = Image.new('L', R.size, 255)
ox, oy = round(gx - a.ref_x * s), round(gy - a.ref_ground * s)
canvas.paste(F2, (ox, oy))

def inkmap(im):
    v = np.asarray(im).astype(float)
    bg = np.percentile(v, 90)
    return np.clip((bg - v) / max(1.0, bg - v.min()), 0, 1)

r, f = inkmap(R), inkmap(canvas)
out = np.ones(r.shape + (3,))
out[..., 0] -= f * 0.85
out[..., 1] -= np.maximum(r, f) * 0.85
out[..., 2] -= r * 0.85
Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(a.out)
print(f'scale {s:.3f} ref px -> render px; ref offset ({ox}, {oy})')
