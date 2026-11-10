#!/usr/bin/env python3
"""Cutout puppet of the Masked Herald, sliced straight from the mockup.

Usage (from the project root):  python3 concepts/cutout/masked/build.py [--debug]

Reads concepts/refs/masked-34.png, cuts the figure off the paper, slices it into
rigged parts (with reconstructed hidden pixels under every occluder), writes one
PNG per part next to this script and generates concepts/cutout-masked.js, which
embeds the parts as data URIs. --debug also writes concepts/out/cutout-masked-labels.png
(the ownership map) and concepts/out/cutout-masked-parts.png (every layer on a grid).

All coordinates below are SOURCE pixels of masked-34.png (500 x 1024). The mockup
faces LEFT (-x); the JS mirrors it to face +x.
"""
import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

# ----------------------------------------------------------------------------- data
SRC = 'concepts/refs/masked-34.png'
GROUND_Y = 975          # ground line under the near boot sole
CROWN_Y = 75            # top of the helmet dome (the wing tips reach y 15)
FEET_X = 240            # midway between the two sole centres (160 and 320)
HEIGHT = 182            # world units from the feet to the crown at game scale
PAPER_TOL = 24          # colour distance from the paper that still counts as paper
# enclosed pockets of paper inside the figure that are really background
# (snake loops of the caduceus); any enclosed paper pocket over BIG_HOLE px goes too
HOLE_SEEDS = [(64, 203), (102, 202), (72, 249), (94, 249)]
# (80, 223) used to be a seed too, but it lies on the pale belly of the snake where
# the two snakes cross the shaft: it punched a transparent slash through the staff
BIG_HOLE = 2000
ISLAND = 200           # detached alpha islands smaller than this (px) are dropped
                       # (cloak specks of 42 / 78 px floated between the legs)
EDGE_BAND = 2.5         # px inside the silhouette that are un-mixed from the paper

def arc(cx, cy, r, a0, a1, n=9):
    """points on a circle (degrees, y down): round joint caps that stay hidden when turned"""
    return [(round(cx + r * np.cos(np.radians(a))), round(cy + r * np.sin(np.radians(a))))
            for a in np.linspace(a0, a1, n)]


WING_F = [(196, 30), (232, 20), (247, 40), (247, 66), (240, 80), (228, 92), (218, 106),
          (198, 113), (192, 90)]
WING_N = [(278, 62), (300, 36), (345, 22), (378, 6), (384, 30), (378, 96), (350, 114),
          (330, 122), (304, 122), (301, 103), (291, 91), (280, 82)]
# the helmet dome under the wings (upper half ellipse); rebuilt there, nowhere else
DOME = [(round(252 + 49 * np.cos(np.radians(a))), round(110 + 37 * np.sin(np.radians(a))))
        for a in np.linspace(180, 360, 19)]

# the front skirt flap: the front kilt section plus the laurel panel, from under the
# belt to the hem, cut along the panel's rear border. The skin shears it forward with
# the forward thigh so the hem covers the thigh's top when a knee comes up.
KILT = [(149, 432), (236, 432), (236, 607), (200, 646), (163, 606), (136, 600), (140, 560),
        (148, 445)]

# Parts in DRAW ORDER (back to front). Ownership: each figure pixel belongs to the
# front-most part whose 'own' polygon contains it.
#   own     polygon claiming the visible pixels
#   full    plausible complete shape (own + what is hidden behind front parts); default own
#   pivot   joint the part rotates about; parent: rig parent
#   fill    directions used to rebuild hidden pixels (mirror-extension from own pixels)
#   cont    {part: band}: pixels of that neighbour within band px of own count as the
#           same material (joint continuation) and are copied, not rebuilt
#   fade    [x0, y0, nx, ny, width]: alpha fades out past the line through (x0, y0)
#           along the unit normal (nx, ny) over width px (a soft joint cut)
PARTS = [
    dict(name='cloak', parent='torso', pivot=(300, 240),
         own=[(0, 0), (500, 0), (500, 1024), (0, 1024)],
         full=[(126, 236), (150, 205), (330, 195), (425, 225), (470, 420), (485, 600),
               (480, 840), (420, 835), (385, 812), (350, 836), (318, 820), (290, 840),
               (262, 848), (240, 840), (215, 815), (190, 800), (160, 790), (130, 800),
               (110, 790), (98, 600), (104, 420), (118, 330)],
         fill='shift', erode=5, shade=0.12),
    dict(name='ground', parent='root', pivot=(240, 975),
         own=[(0, 957), (500, 957), (500, 1024), (0, 1024)], fill=None),
    # the boot is split at the ankle strap: the foot (drawn BEHIND the shin) turns about
    # the ankle; its round cap rebuilds the boot leather hidden under the strap
    dict(name='footF', parent='shinF', pivot=(193, 896),
         own=[(150, 892), (242, 902), (244, 976), (78, 976), (84, 940), (126, 916)],
         full=arc(193, 899, 33, 180, 360) + [(240, 905), (240, 975), (78, 976), (84, 940),
                                              (126, 916), (150, 897)],
         fill='v', shade=0.2),
    dict(name='shinF', parent='thighF', pivot=(185, 702),
         own=[(153, 704), (230, 704), (234, 766), (232, 800), (252, 828), (252, 899), (242, 902),
              (150, 892), (150, 880), (155, 762)],
         full=[(153, 672), (230, 672), (234, 766), (232, 800), (252, 828), (252, 899), (242, 902),
               (150, 892), (150, 880), (155, 762)],
         cont={'thighF': 22}, fill='v'),
    dict(name='thighF', parent='pelvis', pivot=(192, 586),
         own=[(148, 540), (236, 540), (233, 600), (230, 706), (153, 706), (149, 640)],
         full=arc(192, 590, 42, 180, 360) + [(234, 600), (230, 716), (153, 716), (149, 640)],
         cont={'shinF': 12}, fade=[0, 700, 0, 1, 12], fill='v', shade=0.12, erode=6,
         # the round top cap fades out (no hard edge when it turns out of the kilt)
         capfade=(192, 590, 28, 44)),
    dict(name='footN', parent='shinN', pivot=(345, 899),
         own=[(284, 893), (374, 904), (380, 980), (262, 980), (266, 950), (280, 930)],
         full=arc(340, 901, 33, 180, 360) + [(380, 915), (380, 980), (262, 980), (266, 950),
                                              (280, 930), (300, 905)],
         fill='v', shade=0.2),
    dict(name='shinN', parent='thighN', pivot=(298, 698),
         own=[(266, 700), (334, 700), (346, 740), (355, 752), (352, 775), (348, 826), (392, 832),
              (398, 880), (374, 904), (284, 893), (284, 880), (286, 790), (280, 752), (270, 722)],
         full=[(264, 668), (336, 668), (346, 760), (350, 826), (392, 832), (398, 880),
               (374, 904), (284, 893), (284, 880), (286, 790), (278, 750), (268, 720)],
         cont={'thighN': 22}, fill='v'),
    dict(name='thighN', parent='pelvis', pivot=(290, 584),
         own=[(244, 540), (346, 540), (344, 640), (334, 702), (264, 702), (252, 660),
              (246, 610)],
         full=arc(293, 590, 48, 180, 360) + [(342, 640), (334, 714), (264, 714), (252, 660),
                                              (246, 610)],
         cont={'shinN': 12}, fade=[0, 697, 0, 1, 12], fill='v', shade=0.12, erode=6,
         capfade=(293, 590, 32, 50)),
    dict(name='uarmF', parent='torso', pivot=(176, 290), elbow=(158, 393),
         # the far upper arm is entirely hidden in the mockup (those pixels are cloak
         # feathers): the whole part is the finished near upper arm, mirrored, scaled
         # so shoulder and elbow land on this arm's joints, and inked a little deeper
         own=None, fill=None,
         # only the arm itself (no dark tunic/cloak strips beside it), with a fresh contour
         borrow_part=dict(part='uarmN', ink=0.18, outline=1.4,
                          mask=[(298, 262), (340, 262), (343, 320), (351, 350), (356, 380),
                                (358, 412), (330, 424), (302, 416), (298, 380), (295, 330)]),
         # the borrowed arm's top (a dark jagged sliver of tunic) fades out under the
         # pauldron, and dark tunic strips along its sides are trimmed
         fade=[0, 290, 0, -1, 18], trim_dark=True),
    dict(name='staff', parent='farmF', pivot=(83, 372),
         own=[(0, 85), (176, 85), (176, 176), (136, 180), (136, 312), (100, 322),
              (96, 340), (96, 405), (100, 780), (64, 780), (70, 405), (70, 340),
              (64, 322), (28, 312), (28, 176), (0, 176)],
         full=[(0, 85), (176, 85), (176, 176), (136, 180), (136, 312), (100, 322),
               (94, 336), (94, 410), (100, 780), (64, 780), (72, 410), (72, 336),
               (64, 322), (28, 312), (28, 176), (0, 176)],
         fill='v',
         # the shaft under the fist is rebuilt by repeating a clean stretch of shaft
         # (rows y0..y1 <- src0.. periodically), alpha included, in columns x0..x1
         grip=dict(y0=336, y1=406, src0=410, period=40, x0=60, x1=112),
         # the outer wing tip touches the mockup's left edge: complete it with the
         # mirror image of the intact wing across the shaft axis (axis, rows, pad px)
         wing_mirror=(84.5, 85, 180, 10)),
    dict(name='farmF', parent='uarmF', pivot=(158, 393),
         # drawn under the torso: the elbow goes behind the tunic's edge.
         # top edge follows the bracer rim (the cloak scraps above it stay with the
         # cloak); the hidden elbow end is rebuilt as a round cap
         own=[(54, 346), (70, 338), (74, 344), (94, 343), (100, 340), (108, 367), (125, 362),
              (145, 357), (160, 359), (168, 362), (174, 395), (167, 421), (142, 424), (120, 422),
              (100, 413), (95, 401), (74, 401), (54, 400)],
         full=[(54, 346), (70, 338), (74, 344), (94, 343), (100, 340), (108, 367), (125, 362),
               (145, 357)] + arc(156, 391, 31, -95, 85) + [(142, 424), (120, 422), (100, 413),
               (95, 401), (74, 401), (54, 400)],
         fill='h', outline=1.4, shade=0.3),
    # the staff fist on its own (the skin turns it a little with the staff); its cuff
    # overlaps the bracer
    dict(name='fistF', parent='farmF', pivot=(83, 372),
         own=[(52, 346), (70, 338), (74, 344), (94, 343), (100, 340), (108, 367), (117, 365),
              (119, 401), (100, 413), (95, 401), (74, 401), (52, 400)],
         fill=None),
    dict(name='torso', parent='pelvis', pivot=(240, 560),
         # (under the kilt flap the hem is flat and the panel rebuilt as plain skirt
         # fabric, shifted in from behind: it shows when the flap swings forward)
         # the near hem line runs a few px under the light hem band, so no hem pixels
         # are left to the thigh (which would show a second hem when it turns)
         own=[(176, 168), (330, 168), (332, 300), (306, 312), (302, 500), (350, 540),
              (366, 618), (345, 616), (325, 609), (300, 598), (250, 586), (241, 602), (200, 646), (163, 606),
              (136, 600), (140, 560), (149, 430), (160, 396), (163, 300), (150, 240)],
         full=[(176, 160), (330, 160), (326, 300), (314, 330), (311, 420), (316, 500), (345, 540),
               (366, 618), (345, 616), (325, 609), (300, 598), (250, 586), (241, 598), (200, 600), (163, 600),
               (136, 600), (140, 560), (149, 430), (158, 396), (160, 300), (150, 240)],
         cont={'head': 12}, fill='v2h',
         # under the near fist the skirt hem runs across on a slant: rebuild it by
         # translating the visible hem along that slant
         fill_regions=[([(270, 290), (340, 290), (340, 488), (270, 488)], 'h'),
                       ([(266, 488), (352, 488), (352, 578), (266, 578)], 'slant'),
                       (KILT, ('tile', (238, 488, 272, 552), 0.25))],
         # under the near arm the mockup shows cloak pixels where the torso's back edge
         # really is: rebuild over them (the arm covers this area in the idle)
         rebuild_over=[(286, 300), (330, 300), (318, 420), (322, 500), (300, 500)]),
    dict(name='kilt', parent='torso', pivot=(192, 432), own=KILT, fill=None),
    dict(name='pauldronF', parent='torso', pivot=(172, 268),
         own=[(136, 240), (165, 230), (194, 244), (196, 290), (172, 302), (150, 330),
              (134, 352), (122, 346), (124, 300), (134, 276)],
         fill='v2h'),
    dict(name='uarmN', parent='torso', pivot=(318, 292),
         own=[(296, 300), (312, 298), (346, 312), (358, 350), (357, 398), (346, 414),
              (308, 414), (300, 380), (297, 340)],
         full=[(284, 268), (342, 268), (362, 350), (366, 412), (338, 426), (304, 422),
               (292, 380), (284, 330)],
         cont={'farmN': 12}, fill='v'),
    dict(name='farmN', parent='uarmN', pivot=(337, 410),
         own=[(304, 402), (345, 396), (356, 410), (353, 452), (347, 495), (343, 512),
              (339, 560), (320, 572), (284, 564), (275, 532), (285, 508), (298, 496),
              (306, 450)],
         full=[(304, 394), (345, 388), (356, 404), (353, 452), (347, 495), (343, 512),
               (339, 560), (320, 572), (284, 564), (275, 532), (285, 508), (298, 496),
               (306, 450)],
         cont={'uarmN': 10}, fill='v'),
    dict(name='pauldronN', parent='torso', pivot=(322, 268),
         own=[(246, 240), (284, 220), (352, 220), (390, 248), (396, 292), (362, 330),
              (340, 336), (310, 324), (284, 312), (268, 296), (248, 282)],
         fill='v2h'),
    # full-length bracer for the staff arm (the mockup's far forearm is foreshortened):
    # the near bracer copied as is, inked a little deeper, fresh contour. Skin only.
    dict(name='braceF', parent='uarmF', pivot=(337, 410), skip=True, own=None, fill=None,
         copy_part=dict(part='farmN', ink=0.16, outline=1.4,
                        mask=[(300, 393), (352, 391), (358, 420), (355, 480), (348, 500),
                              (346, 515), (298, 515), (296, 480), (298, 420)]), trim_dark=True),
    # the near bracer alone (no fist), for the open near hand. Skin only.
    dict(name='braceN', parent='uarmN', pivot=(337, 410), skip=True, own=None, fill=None,
         copy_part=dict(part='farmN', ink=0, outline=1.4,
                        mask=[(300, 393), (352, 391), (358, 420), (355, 480), (348, 500),
                              (346, 509), (298, 509), (296, 480), (298, 420)]), trim_dark=True),
    # OPEN hands (pose.handB / handF = 1): the near fist with its curled fingers drawn
    # out straight (rows below the knuckles stretched), in the near forearm's source
    # frame (wrist at the cuff). openF is the same hand inked like the staff arm. Skin only.
    dict(name='openN', parent='farmN', pivot=(318, 507), skip=True, own=None, fill=None,
         open_hand=dict(part='farmN', ink=0, knuckle=541, stretch=2.4,
                        mask=[(290, 499), (332, 499), (339, 512), (337, 535), (334, 552),
                              (328, 563), (310, 568), (292, 567), (283, 561), (275, 548),
                              (275, 532), (281, 517)])),
    dict(name='openF', parent='braceF', pivot=(318, 507), skip=True, own=None, fill=None,
         open_hand=dict(part='farmN', ink=0.16, knuckle=541, stretch=2.4,
                        mask=[(290, 499), (332, 499), (339, 512), (337, 535), (334, 552),
                              (328, 563), (310, 568), (292, 567), (283, 561), (275, 548),
                              (275, 532), (281, 517)])),
    dict(name='head', parent='torso', pivot=(243, 202),
         own=[(180, 0), (400, 0), (400, 168), (330, 170), (314, 188), (288, 199),
              (256, 205), (224, 203), (204, 199), (194, 186), (174, 170), (174, 100)],
         full=[(180, 0), (400, 0), (400, 168), (332, 172), (318, 196), (290, 210),
               (256, 214), (222, 212), (200, 206), (190, 188), (174, 170), (174, 100)],
         cont={'torso': 12}, fade=[0, 197, 0, 1, 9], fill='v2h',
         # the helmet wings are their own parts (they beat with pose.wing): the dome
         # under them is rebuilt, the sky around them is not
         exclude=[WING_F, WING_N], rebuild_over=DOME),
    dict(name='wingF', parent='head', pivot=(216, 100), own=WING_F, fill=None),
    dict(name='wingN', parent='head', pivot=(289, 104), own=WING_N, fill=None),
    # the near boot's heel wing on its own, for the skin's talaria prop. Skin only.
    dict(name='talaria', parent='shinN', pivot=(352, 885), skip=True, own=None, fill=None,
         copy_part=dict(part='shinN', ink=0, outline=0,
                        mask=[(343, 874), (356, 846), (384, 826), (402, 828), (402, 880),
                              (374, 896), (350, 892)])),
]
FILL_DIRS = {
    'v': [(0, 1, 1.0), (0, -1, 1.0)],
    'h': [(1, 0, 1.0), (-1, 0, 1.0)],
    'v2h': [(0, 1, 1.0), (0, -1, 1.0), (1, 0, 1.6), (-1, 0, 1.6)],
}
SHIFT_RUN = 34          # 'shift' fill: whole tiles of own texture translated by n * this
MIRROR_RUN = 22         # px of own texture reflected into the holes before repeating

# ----------------------------------------------------------------------------- helpers
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def poly_mask(poly, shape):
    im = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(im).polygon([tuple(p) for p in poly], fill=255)
    return np.array(im) > 127


def blur(a, sigma):
    """separable gaussian blur (numpy only)"""
    if sigma <= 0:
        return a
    r = int(np.ceil(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(a, r, mode='edge')
    p = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 0, p)
    p = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 1, p)
    return p


def dilate(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r + 0.5:
                out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def components(mask):
    """4-connected labelling with an iterative flood (no scipy/cv2 dependency)"""
    try:
        import cv2
        n, lab = cv2.connectedComponents(mask.astype(np.uint8), connectivity=4)
        return lab
    except Exception:
        pass
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    cur = 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        cur += 1
        st = [(y0, x0)]
        lab[y0, x0] = cur
        while st:
            y, x = st.pop()
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = cur
                    st.append((yy, xx))
    return lab


def dist_from(mask, maxd=40):
    """approximate euclidean distance (px) to the nearest True pixel, capped at maxd"""
    try:
        import cv2
        return cv2.distanceTransform((~mask).astype(np.uint8), cv2.DIST_L2, 5)
    except Exception:
        d = np.where(mask, 0.0, maxd)
        cur = mask.copy()
        for r in range(1, maxd):
            nxt = dilate(cur, 1)
            d[nxt & ~cur] = r
            cur = nxt
        return d


def dir_fill(img, known, hole, dirs, run=MIRROR_RUN, maxk=500):
    """Rebuild hole pixels by mirroring the nearest known texture along the given
    directions (keeps engraved hatching and outlines continuous across the cut)."""
    H, W = known.shape
    ys, xs = np.nonzero(hole)
    if not len(ys):
        return img
    best = np.full(len(ys), np.inf)
    sy_b = ys.copy()
    sx_b = xs.copy()
    for dx, dy, wgt in dirs:
        t = np.zeros(len(ys), np.int32)
        open_ = np.ones(len(ys), bool)
        for k in range(1, maxk):
            qx = xs + dx * k
            qy = ys + dy * k
            inb = (qx >= 0) & (qx < W) & (qy >= 0) & (qy < H)
            open_ &= inb
            if not open_.any():
                break
            hit = open_ & known[qy.clip(0, H - 1), qx.clip(0, W - 1)]
            t[hit] = k
            open_ &= ~hit
        ok = t > 0
        # length of the known run behind the boundary (capped), so the mirror
        # never reads outside the part's own texture
        rl = np.zeros(len(ys), np.int32)
        live = ok.copy()
        for j in range(run):
            qx = xs + dx * (t + j)
            qy = ys + dy * (t + j)
            inb = (qx >= 0) & (qx < W) & (qy >= 0) & (qy < H)
            live &= inb & known[qy.clip(0, H - 1), qx.clip(0, W - 1)]
            rl += live
        rr = np.maximum(rl, 1)
        m = (t - 1) % (2 * rr)
        m = np.where(m < rr, m, 2 * rr - 1 - m)
        sx = xs + dx * (t + m)
        sy = ys + dy * (t + m)
        score_pen = np.where(rl < 4, 3.0, 1.0)   # thin slivers make streaks: avoid
        score = np.where(ok, t * wgt * score_pen, np.inf)
        better = score < best
        best[better] = score[better]
        sx_b[better] = sx[better]
        sy_b[better] = sy[better]
    out = img.copy()
    found = np.isfinite(best)
    out[ys[found], xs[found]] = img[sy_b[found], sx_b[found]]
    return out


def shift_fill(img, known, hole, step=SHIFT_RUN, maxn=14,
               dirs=((0, 1, 1.0), (0, -1, 1.0), (1, 0, 1.25), (-1, 0, 1.25))):
    """Rebuild hole pixels by translating own texture by whole steps (keeps the
    slant of feathers, unlike a mirror); nearest step in any of 4 directions,
    vertical preferred."""
    H, W = known.shape
    ys, xs = np.nonzero(hole)
    best = np.full(len(ys), np.inf)
    sy_b, sx_b = ys.copy(), xs.copy()
    for dx, dy, wgt in dirs:
        open_ = np.ones(len(ys), bool)
        for n in range(1, maxn):
            qx = xs + int(round(dx * n * step))
            qy = ys + int(round(dy * n * step))
            inb = (qx >= 0) & (qx < W) & (qy >= 0) & (qy < H)
            hit = open_ & inb & known[qy.clip(0, H - 1), qx.clip(0, W - 1)]
            sc = n * wgt
            upd = hit & (sc < best)
            best[upd] = sc
            sx_b[upd], sy_b[upd] = qx[upd], qy[upd]
            open_ &= ~hit
    out = img.copy()
    f = np.isfinite(best)
    out[ys[f], xs[f]] = img[sy_b[f], sx_b[f]]
    return out


def copy_part(p, layers, paper, H, W):
    """A part copied from another finished part at the same source position, masked to
    a polygon, ink deepened by c['ink'] and given a fresh contour."""
    b = p['copy_part']
    crop, x0, y0 = layers[b['part']]
    alpha = np.zeros((H, W), np.float32)
    img = np.tile(paper.astype(np.float32), (H, W, 1))
    h, w = crop.shape[:2]
    alpha[y0:y0 + h, x0:x0 + w] = crop[..., 3] / 255.0
    img[y0:y0 + h, x0:x0 + w] = crop[..., :3]
    m = poly_mask(b['mask'], (H, W)).astype(np.float32)
    alpha = alpha * np.clip(blur(m, 0.6) * 1.1, 0, 1)
    img = paper + (img - paper) * (1 + b.get('ink', 0))
    if b.get('outline'):
        d = dist_from(alpha < 0.5)
        line = np.clip(1.0 - np.abs(d - 1.2) / b['outline'], 0, 1)[..., None] * 0.85
        img = img * (1 - line) + np.array([24, 52, 89], np.float32) * line
    return img.clip(0, 255), alpha


def borrow_part(p, layers, paper, H, W):
    """A part rebuilt entirely from another (finished) part: mirrored left-right and
    scaled so that part's pivot and child joint land on this part's pivot and
    'elbow'. Resampled premultiplied (no dark fringe), ink deepened by b['ink']."""
    b = p['borrow_part']
    q = next(x for x in PARTS if x['name'] == b['part'])
    child = next(x for x in PARTS if x['parent'] == q['name'])
    crop, x0, y0 = layers[q['name']]
    pN, eN = np.array(q['pivot'], float), np.array(child['pivot'], float)
    pF, eF = np.array(p['pivot'], float), np.array(p['elbow'], float)
    sc = np.linalg.norm(eF - pF) / np.linalg.norm(eN - pN)
    # output q -> input s: s.x = pN.x - (q.x - pF.x) / sc, s.y = pN.y + (q.y - pF.y) / sc
    aff = (-1 / sc, 0, pN[0] - x0 + pF[0] / sc, 0, 1 / sc, pN[1] - y0 - pF[1] / sc)
    crop = crop.copy()
    if b.get('mask'):
        m = poly_mask([(x - x0, y - y0) for x, y in b['mask']], crop.shape[:2]).astype(np.float32)
        crop[..., 3] = (crop[..., 3] * np.clip(blur(m, 0.6) * 1.1, 0, 1)).astype(np.uint8)
    im = Image.fromarray(crop).convert('RGBa')
    out = im.transform((W, H), Image.AFFINE, aff, resample=Image.BICUBIC).convert('RGBA')
    arr = np.array(out).astype(np.float32)
    img = paper + (arr[..., :3] - paper) * (1 + b.get('ink', 0))
    alpha = arr[..., 3] / 255.0
    if b.get('outline'):
        d = dist_from(alpha < 0.5)
        line = np.clip(1.0 - np.abs(d - 1.2) / b['outline'], 0, 1)[..., None] * 0.85
        img = img * (1 - line) + np.array([24, 52, 89], np.float32) * line
    return img.clip(0, 255), alpha


def open_hand(p, layers, paper, H, W):
    """An open hand made from a finished fist: masked to the hand, the rows below the
    knuckle line stretched by `stretch` (the curled fingers drawn out straight), ink
    deepened by c['ink'], fresh contour. Stays in the source part's frame above the
    knuckles, so the same matrix places it."""
    b = p['open_hand']
    crop, x0, y0 = layers[b['part']]
    alpha = np.zeros((H, W), np.float32)
    img = np.tile(paper.astype(np.float32), (H, W, 1))
    h, w = crop.shape[:2]
    alpha[y0:y0 + h, x0:x0 + w] = crop[..., 3] / 255.0
    img[y0:y0 + h, x0:x0 + w] = crop[..., :3]
    m = poly_mask(b['mask'], (H, W)).astype(np.float32)
    alpha = alpha * np.clip(blur(m, 0.6) * 1.1, 0, 1)
    # stretch rows below the knuckles (linear row interpolation, premultiplied)
    kn, st = b['knuckle'], b['stretch']
    pre = img * alpha[..., None]
    ys = np.arange(H, dtype=np.float32)
    sy = np.where(ys < kn, ys, kn + (ys - kn) / st)
    i0 = np.clip(np.floor(sy).astype(int), 0, H - 1)
    i1 = np.clip(i0 + 1, 0, H - 1)
    t = (sy - i0)[:, None]
    alpha = alpha[i0] * (1 - t) + alpha[i1] * t
    pre = pre[i0] * (1 - t[..., None]) + pre[i1] * t[..., None]
    img = np.where(alpha[..., None] > 1e-3, pre / np.maximum(alpha, 1e-3)[..., None], paper)
    img = paper + (img - paper) * (1 + b.get('ink', 0))
    d = dist_from(alpha < 0.5)
    line = np.clip(1.0 - np.abs(d - 1.2) / 1.4, 0, 1)[..., None] * 0.85
    img = img * (1 - line) + np.array([24, 52, 89], np.float32) * line
    return img.clip(0, 255), alpha


def trim_dark(img, alpha, thr=118, sigma=1.6):
    """Remove dark background (tunic / cloak strips) that a copied part carries along its
    edges: blurred-dark pixels connected to the part's outside are cut away, then a
    fresh contour is drawn on the new edge."""
    lum = blur(img @ np.array([0.3, 0.59, 0.11], np.float32), sigma)
    inside = alpha > 0.1
    dark = (lum < thr) | ~inside
    lab = components(np.pad(dark, 1, constant_values=True))
    outer = lab[0, 0]
    cut = (lab == outer)[1:-1, 1:-1] & inside
    a = np.where(cut, 0, alpha)
    # keep only the main body (the cut can leave a detached scrap, e.g. the top of the
    # hand under a bracer's cuff)
    lab2 = components(a > 0.1)
    ids, cnt = np.unique(lab2[a > 0.1], return_counts=True)
    if len(ids) > 1:
        a = np.where(dilate(lab2 == ids[np.argmax(cnt)], 1), a, 0)
    # soften the new edge a little and give it the engraved contour
    a = np.minimum(a, np.clip(blur((a > 0.1).astype(np.float32), 0.6) * 1.2, 0, 1))
    d = dist_from(a < 0.5)
    line = np.clip(1.0 - np.abs(d - 1.2) / 1.4, 0, 1)[..., None] * 0.85 * (cut.any())
    img = img * (1 - line) + np.array([24, 52, 89], np.float32) * line
    return img, a


def apply_fades(p, alpha, H, W):
    if p.get('fade'):
        x0, y0, nx, ny, w = p['fade']
        yy, xx = np.mgrid[0:H, 0:W]
        s = ((xx - x0) * nx + (yy - y0) * ny) / w
        alpha = alpha * np.clip(1 - s, 0, 1)
    if p.get('capfade'):
        # radial fade of the round top cap (above the pivot row only)
        cx, cy, r0, r1 = p['capfade']
        yy, xx = np.mgrid[0:H, 0:W]
        r = np.hypot(xx - cx, yy - cy)
        f = np.clip((r1 - r) / (r1 - r0), 0, 1)
        alpha = alpha * np.where(yy < cy, f, 1)
    return alpha


def enclosed_holes(name, crop, x0, y0, min_px=6):
    """Build check: composite the part over magenta and find transparent pockets
    enclosed by it (not connected to the outside). The only allowed pockets are the
    declared see-through ones: a HOLE_SEEDS pocket (snake loops) or a paper pocket
    over BIG_HOLE px. Anything else is a hole punched by an overlapping mask and
    would show the background through the part: the build fails."""
    a = np.pad(crop[..., 3] > 127, 1)
    lab = components(~a)
    outer = lab[0, 0]
    out = []
    for i in np.unique(lab[~a]):
        if i == outer:
            continue
        m = lab == i
        n = int(m.sum())
        if n < min_px or n > BIG_HOLE:
            continue
        if any(0 <= y - y0 + 1 < m.shape[0] and 0 <= x - x0 + 1 < m.shape[1] and m[y - y0 + 1, x - x0 + 1]
               for x, y in HOLE_SEEDS):
            continue
        ys, xs = np.nonzero(m)
        out.append('  %s: enclosed transparent pocket of %d px around source (%d, %d)' % (
            name, n, xs.mean() + x0 - 1, ys.mean() + y0 - 1))
    return out


def png_bytes(arr):
    b = io.BytesIO()
    Image.fromarray(arr).save(b, 'PNG', optimize=True)
    return b.getvalue()


EMBED_QUALITY = 92      # parts are embedded as WebP (lossy colour, lossless alpha)


def webp_bytes(arr):
    b = io.BytesIO()
    Image.fromarray(arr).save(b, 'WEBP', quality=EMBED_QUALITY, method=6, alpha_quality=100)
    return b.getvalue()


# ----------------------------------------------------------------------------- build
def main():
    debug = '--debug' in sys.argv
    os.chdir(ROOT)
    src = np.array(Image.open(SRC).convert('RGB')).astype(np.float32)
    H, W, _ = src.shape
    paper = np.median(np.concatenate([src[:40, :40].reshape(-1, 3), src[-30:, :].reshape(-1, 3),
                                      src[:, -20:].reshape(-1, 3)]), 0)
    cdist = np.sqrt(((src - paper) ** 2).sum(2))

    # 1. figure mask: flood the paper from the image border through a slightly
    #    thickened ink barrier, then give the barrier width back
    barrier = dilate(cdist > PAPER_TOL, 1)
    lab = components(~barrier)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    for x, y in HOLE_SEEDS:
        if lab[y, x]:
            bg |= lab == lab[y, x]
    ids, counts = np.unique(lab[~bg & (lab > 0)], return_counts=True)
    for i, c in zip(ids, counts):
        if c > BIG_HOLE:
            bg |= lab == i
    bg = dilate(bg, 1) & (cdist <= PAPER_TOL * 2.2) | bg
    fig = ~bg
    # drop specks
    flab = components(fig)
    ids, counts = np.unique(flab[fig], return_counts=True)
    for i, c in zip(ids, counts):
        if c < 12:
            fig &= flab != i
    fig0 = fig

    # 2. edge alpha: un-mix the outermost pixels from the paper (no cream halo)
    din = dist_from(~fig)                    # distance to the background, inside the figure
    lum = src @ np.array([0.3, 0.59, 0.11], np.float32)
    lp = float(paper @ np.array([0.3, 0.59, 0.11]))
    ink_l = 70.0
    dens = np.clip((lp - lum) / (lp - ink_l), 0, 1)
    edge = fig & (din <= EDGE_BAND)
    a_edge = np.clip(dens * 1.6, 0, 1)
    fig_a = np.where(edge, np.maximum(a_edge, np.clip(din - EDGE_BAND + 1, 0, 1)), fig.astype(np.float32))
    fig_a = np.where(fig, fig_a, 0)
    col = src.copy()
    safe = np.maximum(fig_a, 0.05)[..., None]
    unmix = paper + (src - paper) / safe
    col = np.where((edge & (fig_a > 0))[..., None], np.clip(unmix, 0, 255), col)

    # 3. ownership labels
    names = [p['name'] for p in PARTS]
    owner = np.full((H, W), -1, np.int32)
    for i, p in enumerate(PARTS):
        if p.get('own'):
            owner[poly_mask(p['own'], (H, W)) & fig] = i
    # 4. layers
    meta = []
    layers = {}
    def build_part(p, i, own):
        full = poly_mask(p.get('full', p['own']), (H, W)) | own
        fig = fig0
        known = own.copy()
        if p.get('cont'):
            dd = dist_from(own)
            for q, band in p['cont'].items():
                known |= (owner == names.index(q)) & (dd <= band) & full
        if p['fill'] is None:
            full = own.copy()
        ext = full & fig
        if p['name'] != 'staff':
            ext &= owner != names.index('staff')   # nothing hides behind the caduceus
        # never rebuild over pixels that a part drawn BEHIND this one shows in the
        # mockup: those rebuilt pixels would be visible in idle (seams of light
        # flecks along an edge). Hidden areas exist only under parts drawn in front.
        behind = (owner >= 0) & (owner < i)
        ext &= ~behind | known
        for poly in p.get('exclude', []):
            ext &= ~poly_mask(poly, (H, W))
        if p.get('rebuild_over'):
            ext |= poly_mask(p['rebuild_over'], (H, W)) & full & fig
        hole = ext & ~known
        # texture sources: own pixels, minus a 3 px fringe next to other parts so
        # stray outline pixels of the occluder are not copied into the holes
        srck = known & fig & ~(dist_from(fig0 & ~known) <= p.get('erode', 3))
        if p['fill'] == 'shift':
            img = shift_fill(col, srck, hole)
            left = hole & np.all(img == col, 2)
            img = dir_fill(img, srck | (hole & ~left), left, FILL_DIRS['v2h'])
        elif p['fill']:
            img = dir_fill(col, srck, hole, FILL_DIRS[p['fill']])
            for poly, mode in p.get('fill_regions', []):
                rh = hole & poly_mask(poly, (H, W))
                if isinstance(mode, tuple) and mode[0] == 'tile':
                    # plain fabric tiled from a clean patch, a little shaded (the
                    # skirt under the kilt flap)
                    (tx0, ty0, tx1, ty1), shd = mode[1], mode[2]
                    yy_, xx_ = np.nonzero(rh)
                    sx_ = tx0 + (xx_ - tx0) % (tx1 - tx0)
                    sy_ = ty0 + (yy_ - ty0) % (ty1 - ty0)
                    img2 = img.copy()
                    img2[yy_, xx_] = col[sy_, sx_] * (1 - shd) + np.array([36, 64, 99], np.float32) * shd
                elif mode == 'hshift':
                    img2 = shift_fill(col, srck, rh, step=30, dirs=((-1, 0, 1.0), (1, 0, 1.3)))
                elif mode == 'slant':
                    # translate along the hem's own slant so the band stays continuous
                    img2 = shift_fill(col, srck, rh, step=28,
                                      dirs=((-1, -0.42, 1.0), (1, 0.42, 1.0), (-1, 0, 1.6), (1, 0, 1.8)))
                else:
                    img2 = dir_fill(col, srck, rh, FILL_DIRS[mode])
                img[rh] = img2[rh]
        else:
            img = col
        if p.get('shade'):
            # hidden areas sit in shadow: deepen the rebuilt pixels with depth
            depth = np.clip(dist_from(~hole) / 14.0, 0, 1)[..., None] * hole[..., None]
            k = p['shade'] * depth
            img = img * (1 - k) + np.array([36, 64, 99], np.float32) * k
        if p.get('outline'):
            dd_in = dist_from(~full)
            line = np.clip(1.0 - np.abs(dd_in - 1.0) / p['outline'], 0, 1)[..., None] * hole[..., None]
            deep = np.array([24, 52, 89], np.float32)
            img = img * (1 - line * 0.85) + deep * line * 0.85
        # the soft edge sits OUTSIDE the part's area (1 px grown, showing the mockup's
        # own pixels there), so every part is fully opaque up to its boundary and a
        # neighbour's rebuilt pixels never shine through a half-transparent seam
        fullg = dilate(full, 1)
        a = blur(fullg.astype(np.float32), 0.7)
        a = np.minimum(a, 1.0) * np.where(fullg | (a > 0), 1, 0)
        alpha = fig_a * np.clip(a * 1.15, 0, 1)
        alpha = np.where(dilate(ext, 1), alpha, 0)
        return img, alpha, hole
    problems = []
    order = sorted(range(len(PARTS)), key=lambda i: bool(PARTS[i].get('borrow_part') or PARTS[i].get('copy_part')
                                                         or PARTS[i].get('open_hand')))
    for i in order:
        p = PARTS[i]
        own = owner == i
        hole = np.zeros((H, W), bool)
        if p.get('borrow_part'):
            img, alpha = borrow_part(p, layers, paper, H, W)
        elif p.get('copy_part'):
            img, alpha = copy_part(p, layers, paper, H, W)
        elif p.get('open_hand'):
            img, alpha = open_hand(p, layers, paper, H, W)
        else:
            img, alpha, hole = build_part(p, i, own)
        if p.get('trim_dark'):
            img, alpha = trim_dark(img, alpha)
        alpha = apply_fades(p, alpha, H, W)
        if p.get('grip'):
            gp = p['grip']
            ys_ = np.arange(gp['y0'], gp['y1'])
            src_rows = gp['src0'] + (ys_ - gp['y0']) % gp['period']
            xs_ = slice(gp['x0'], gp['x1'])
            keep = own[gp['y0']:gp['y1'], xs_] & (alpha[gp['y0']:gp['y1'], xs_] > 0.99)
            for arr in (img, alpha):
                arr[gp['y0']:gp['y1'], xs_] = np.where(keep if arr.ndim == 2 else keep[..., None],
                                                       arr[gp['y0']:gp['y1'], xs_], arr[src_rows, xs_])
            hole[gp['y0']:gp['y1'], xs_] |= ~keep
        if p['name'] != 'ground':
            # drop detached specks (< ISLAND px): they float in the air once the
            # part turns away from whatever they were touching in the mockup
            al = components(dilate(alpha > 0.1, 1))
            ids, cnt = np.unique(al[alpha > 0.1], return_counts=True)
            small = ids[cnt < ISLAND]
            if len(small):
                alpha = np.where(np.isin(al, small), 0, alpha)
        rgba = np.dstack([img, alpha[..., None] * 255]).clip(0, 255)
        pad = 0
        if p.get('wing_mirror'):
            ax, wy0, wy1, pad = p['wing_mirror']
            rgba = np.concatenate([np.zeros((H, pad, 4), np.float32), rgba], 1)
            for x in range(-pad, 4):
                mx = int(round(2 * ax - x))
                srcc, dst = rgba[wy0:wy1, mx + pad], rgba[wy0:wy1, x + pad]
                take = srcc[:, 3] > dst[:, 3] + 8
                dst[take] = srcc[take]
        rgba = rgba.astype(np.uint8)
        ys, xs = np.nonzero(rgba[..., 3] > 1)
        x0b, x1b, y0b, y1b = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        crop = rgba[y0b:y1b, x0b:x1b]
        x0b, x1b = x0b - pad, x1b - pad
        problems += enclosed_holes(p['name'], crop, x0b, y0b)
        crop[crop[..., 3] == 0, :3] = 0
        data = png_bytes(crop)
        emb = webp_bytes(crop)
        with open(os.path.join(OUT_DIR, p['name'] + '.png'), 'wb') as f:
            f.write(data)
        layers[p['name']] = (crop, x0b, y0b)
        meta.append(dict(name=p['name'], parent=p['parent'], x=int(x0b), y=int(y0b), skip=bool(p.get('skip')),
                         w=int(x1b - x0b), h=int(y1b - y0b), pivot=list(p['pivot']),
                         src='data:image/webp;base64,' + base64.b64encode(emb).decode()))
        print('%-10s %4dx%-4d  own %6d  rebuilt %6d  png %6.1f KB  webp %6.1f KB' % (
            p['name'], x1b - x0b, y1b - y0b, own.sum(), hole.sum(), len(data) / 1024, len(emb) / 1024))

    meta.sort(key=lambda m: names.index(m['name']))
    if problems:
        print('\n'.join(problems))
        sys.exit('build check failed: enclosed transparent holes over inked source pixels')
    if debug:
        rng = np.random.RandomState(3)
        pal = rng.randint(40, 255, (len(PARTS), 3))
        dbg = (src * 0.5).astype(np.uint8)
        m = owner >= 0
        dbg[m] = (src[m] * 0.45 + pal[owner[m]] * 0.55).astype(np.uint8)
        Image.fromarray(dbg).save('concepts/out/cutout-masked-labels.png')
        n = len(PARTS)
        cols = 5
        rows = (n + cols - 1) // cols
        sheet = Image.new('RGB', (cols * 260, rows * 520), (60, 70, 60))
        for k, p in enumerate(PARTS):
            crop, _, _ = layers[p['name']]
            im = Image.fromarray(crop)
            im.thumbnail((250, 510))
            sheet.paste(im, ((k % cols) * 260 + 5, (k // cols) * 520 + 5), im)
        sheet.save('concepts/out/cutout-masked-parts.png')

    write_js(meta, paper)


def hexc(c):
    return '#%02x%02x%02x' % tuple(int(round(v)) for v in c)


def write_js(meta, paper):
    k = HEIGHT / (GROUND_Y - CROWN_Y)
    js = JS_TEMPLATE
    js = js.replace('__PARTS__', json.dumps(meta, separators=(',', ':')).replace('},{', '},\n{'))
    js = js.replace('__RIG__', json.dumps(dict(k=round(k, 6), fx=FEET_X, gy=GROUND_Y,
                                               paper=hexc(paper))))
    with open('concepts/cutout-masked.js', 'w') as f:
        f.write(js)
    print('wrote concepts/cutout-masked.js  %.1f KB' % (len(js) / 1024))


JS_TEMPLATE = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'template.js')).read() \
    if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'template.js')) else ''

if __name__ == '__main__':
    main()
