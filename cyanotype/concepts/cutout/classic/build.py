#!/usr/bin/env python3
"""Cutout puppet of the Classical Messenger, sliced straight from the mockup.

    cd /home/claude/hermes-arena && python3 concepts/cutout/classic/build.py [--debug DIR]

Reads concepts/refs/classic-34.png and writes
  concepts/cutout/classic/<part>.png        viewable RGBA part (paper + own ink)
  concepts/cutout/classic/maps/<part>.png   the embedded map: one grey PNG, ink coverage on top,
                                            paper coverage below (so the runtime can re-ink it)
  concepts/cutout-classic.js                the concept (parts embedded as data URIs)

How a part is made
  POLY   the part's full shape in source pixels, visible AND hidden extent. Along any edge where
         this part lies on top of a part drawn earlier it must follow the real contour (that edge
         is the cut); where it runs under a part drawn later it is the guessed hidden outline.
  Pixels of POLY that are covered by parts drawn later (their POLY inside the figure, eroded a
  little) are not taken from the source: they are rebuilt by RECON ops (extend the limb along an
  axis, tile a patch of the cloak's halftone, ...) and get an ink outline along POLY's edge, so
  moving parts reveal plausible body instead of a hole or a ghost of the part in front.
  KEEP lists later parts whose source pixels are the real continuation of this part (thigh under
  the shin, upper arm under the forearm), so the original pixels are kept there.
  The cut edges are feathered (FEATHER px); a later part's feather always falls on pixels the
  earlier part still owns, so seams never become see-through.
"""
import base64, io, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SRC = os.path.join(ROOT, 'concepts/refs/classic-34.png')
OUT_DIR = os.path.join(ROOT, 'concepts/cutout/classic')
OUT_JS = os.path.join(ROOT, 'concepts/cutout-classic.js')

# ---------------------------------------------------------------------------------------------
# DATA: landmarks, paper/ink, slicing polygons, pivots (all in source pixels of classic-34.png)
# ---------------------------------------------------------------------------------------------
PAPER = (244, 238, 233)          # paper of the sheet (sampled, corners)
INK_DARK = (8, 56, 152)          # darkest ink (median of saturated strokes)
GROUND_Y = 459                   # sole bottoms
CROWN_Y = 43                     # top of the petasos crown (wing tips reach ~22)
FEET_X = 196                     # midway between the two sandals
HEIGHT = 182                     # world units feet -> crown
FEET_BOXES = [(95, 153), (228, 309)]   # x ranges of the soles on the ground rows
INK_WALL = 0.45                  # ink density that blocks the background flood fill
FEATHER = 0.8                    # gaussian sigma of cut edges
COVER_ERODE = 1                  # px a later part must overlap before pixels are rebuilt
GRAIN = 0.7                      # share of the sheet's paper grain kept on the figure
MIN_ISLAND = 12                  # px of alpha: smaller islands of a part's mask are specks

# knee joints: centre (= pivot) and radius = half the leg's width across the knee (measured on
# the silhouette mask, so the shin's disc stays inside the drawn leg)
KNEE_B = (141, 345, 18)
KNEE_F = (232, 342, 17)
WAIST = (200, 210)                # middle of the belt's lower edge
ANKLE_B = (124, 426)              # ankle centres (the sandals turn about them)
ANKLE_F = (251, 426)
BROOCH_B = (110, 422)             # heel-wing brooches
BROOCH_F = (245, 422)
HATWING = (185, 57)               # root of the hat wing
WRIST = (268, 240)                # middle of the free wrist band's lower edge

# draw order is list order (back to front)
PARTS = [
    dict(name='cloak', parent='torso', pivot=(126, 152),   # hangs from the back shoulder
         poly=[(130, 128), (140, 121), (150, 118), (163, 121), (175, 134), (184, 160), (193, 200),
               (204, 250), (215, 290), (196, 302), (186, 334), (168, 346), (140, 349), (118, 356),
               (96, 360), (40, 356), (12, 300), (12, 268), (38, 212), (76, 186), (90, 190), (106, 168), (118, 150), (124, 142)],
         recon=[('halftone', dict(origin=(126, 140), base=0.66, amp=0.2, amp2=0.06, folds=9, angle=33, cell=3.6), {})], outline=2.2),
    dict(name='staff', parent='armB_lo', pivot=(108, 170),
         poly=[(40, 28), (126, 28), (131, 38), (134, 46), (131, 58), (124, 70), (126, 100), (121, 126),
               (113, 140), (110, 150), (93, 152), (86, 128), (72, 105), (64, 74), (40, 62),
               ('shaft', 110.5, 192, 0.127, 3.9, 128, 259)],
         recon=[('extend', (0.127, 1.0))], outline=0,
         # a hard butt: the last 14 px solid, closed by a 2.4 px ink ferrule
         cap=(110.5, 192, 0.127, 3.9, 259, 14, 2.4)),
    # legs. Knees are round joints: the shin is drawn first and owns a full disc of radius R
    # (the leg's half width) centred on the knee pivot, which is the centre of the knee; the
    # thigh lies on top and ends in a slightly smaller disc on the same centre. The disc is
    # rotation-invariant, so whatever the knee does the joint stays a closed circle; the shin's
    # disc keeps its original pixels under the thigh and gets an ink rim (the KEEP band), which
    # is the knee contour on the outside of the bend. The sandal is its own part so the feet
    # stay flat and planted whatever the knees do (the ankle strap hides that seam).
    # legs. Knees are round joints: the shin is drawn first and owns a full disc of radius R
    # (the leg's half width) centred on the knee pivot, which is the centre of the knee; the
    # thigh lies on top and ends in a slightly smaller disc on the same centre. The disc is
    # rotation-invariant, so whatever the knee does the joint stays a closed circle; the shin's
    # disc keeps its original pixels under the thigh and gets an ink rim (the KEEP band), which
    # is the knee contour on the outside of the bend.
    # Ankles: the sandal (foot) is drawn FIRST and the shin, which runs on down through the
    # ankle cuff and the cross straps to the instep strap, lies on top of it, so the foot can
    # turn about the ankle under the straps. The heel wing (talaria) is its own part, pinned at
    # its brooch on the ankle, so it can flap.
    dict(name='footB', parent='legB_lo', pivot=ANKLE_B,
         poly=[(96, 436), (104, 426), (114, 421), (126, 419), (140, 421), (146, 428), (153, 436),
               (160, 445), (160, 462), (90, 462), (91, 446)],
         recon=[('extend', (0, 1))], outline=1.6),
    dict(name='legB_lo', parent='legB_up', pivot=KNEE_B[:2],
         poly=[(121, 344), (164, 344), (164, 352), (162, 360), (157, 370), (151, 377), (146, 385),
               (142, 393), (141, 402), (141, 414), (142, 425), (141, 431), (132, 434), (122, 435),
               (113, 433), (107, 428), (107, 414), (108, 400), (109, 391), (111, 380), (114, 366),
               (118, 351), ('disc',) + KNEE_B],
         keep=['legB_up'], solid=[('disc',) + KNEE_B],
         recon=[('extend', (1, 0), 'wingB'), ('extend', (0, -1))], outline=0),
    dict(name='legB_up', parent='pelvis', pivot=(176, 272),
         # its front edge takes the dark shadow between the legs (the thigh's own shaded front)
         poly=[(146, 258), (195, 258), (205, 297), (217, 301), (215, 305), (201, 309), (198, 315),
               (197, 321), (195, 327), (192, 333), (187, 339), (170, 345), (164, 345),
               (122, 344), (131, 333), (136, 328), (141, 313), (145, 298),
               ('disc', KNEE_B[0], KNEE_B[1], KNEE_B[2] - 2)],
         recon=[('reflect', (0, 1))], outline=0),
    dict(name='wingB', parent='legB_lo', pivot=BROOCH_B,
         poly=[(78, 376), (86, 371), (100, 381), (110, 392), (114, 402), (115, 414), (116, 424),
               (111, 431), (101, 432), (89, 424), (81, 412), (77, 395)],
         recon=[], outline=0),
    dict(name='footF', parent='legF_lo', pivot=ANKLE_F,
         poly=[(226, 438), (234, 426), (246, 421), (262, 420), (275, 418), (300, 428), (312, 444),
               (312, 462), (224, 462), (222, 448)],
         recon=[('extend', (0, 1))], outline=1.6),
    dict(name='legF_lo', parent='legF_up', pivot=KNEE_F[:2],
         poly=[(213, 343), (256, 343), (258, 360), (258, 385), (259, 397), (261, 410), (264, 422),
               (265, 430), (256, 435), (246, 436), (239, 434), (238, 426), (237, 412), (233, 398), (225, 391),
               (220, 385), (214, 375), (210, 366), (209, 356), (210, 348), ('disc',) + KNEE_F],
         keep=['legF_up'], solid=[('disc',) + KNEE_F],
         recon=[('extend', (1, 0), 'wingF'), ('extend', (0, -1))], outline=0),
    dict(name='legF_up', parent='pelvis', pivot=(228, 272),
         # the hidden top is kept narrow at the front: a thigh swung forward must not push its
         # front contour out past the chiton's front edge
         poly=[(205, 258), (236, 258), (248, 282), (257, 300), (256, 330), (255, 343), (213, 343), (209, 322),
               (207, 302), ('disc', KNEE_F[0], KNEE_F[1], KNEE_F[2] - 2)],
         recon=[('reflect', (0, 1))], outline=0),
    dict(name='wingF', parent='legF_lo', pivot=BROOCH_F,
         poly=[(201, 384), (208, 377), (222, 383), (236, 392), (246, 401), (251, 411), (252, 424),
               (248, 432), (238, 435), (224, 430), (211, 419), (203, 401)],
         recon=[], outline=0),
    # the chiton skirt (belt down, with the bag) hangs from the waist as its own part, so in a
    # lunge it can swing forward with the stepping thigh while the chest leans; the torso's
    # belt lies over its top edge
    dict(name='skirt', parent='pelvis', pivot=WAIST,
         poly=[(170, 188), (246, 188), (247, 211), (252, 235), (259, 268), (262, 296), (256, 302),
               (252, 302), (232, 303), (213, 306), (200, 303), (190, 301), (176, 299), (156, 297),
               (140, 293), (131, 288), (131, 216), (142, 207), (160, 205), (164, 198)],
         # under the belt: tunic folds mirrored up from below the belt; behind the bag, which
         # mirrored would grow a second flap, plain cloth
         recon=[('paper', 0.05, 'armF'), ('paper', 0.04, 'torso', {'box': (0, 0, 188, 260)}),
                ('reflect', (0, 1), 'torso'), ('extend', (0, 1), '', 3)],
         outline=2.2),
    dict(name='torso', parent='pelvis', pivot=(200, 272),
         poly=[(150, 142), (168, 130), (200, 130), (232, 138), (242, 158), (243, 185), (246, 208),
               (247, 210), (168, 210), (161, 203), (156, 194), (149, 178), (147, 160), (150, 142)],
         recon=[('paper', 0.05, 'armF'), ('reflect', (1, 0), 'armB'), ('extend', (0, 1), '', 3)], outline=2.2),
    dict(name='armB_up', parent='torso', pivot=(160, 152),
         # its inner edge is the cut on top of the torso: it runs down the outer rim of the dark
         # armhole, so the armhole travels with the arm and the torso is rebuilt as tunic under it
         # the top runs under the mantle as a round deltoid cap with an inked rim, so a raised
         # arm shows a shoulder, not a cut end, where it swings out from under the mantle
         poly=[(122, 168), (130, 152), (140, 143), (150, 138), (160, 136), (169, 138), (175, 143),
               (173, 150), (171, 160),
               (171, 170), (167, 180), (160, 187), (152, 190), (138, 194), (126, 192), (119, 182)],
         keep=['armB_lo'], recon=[('extend', (-0.7, 0.7))], outline=2.0),
    dict(name='armB_lo', parent='armB_up', pivot=(128, 179),
         poly=[(90, 172), (91, 158), (94, 152), (100, 150), (107, 149), (110, 146), (119, 146),
               (122, 152), (122, 166), (130, 168), (137, 172), (141, 182), (140, 192), (133, 200),
               (121, 200), (116, 194), (111, 191), (100, 192), (92, 188)],
         recon=[], outline=0),
    # the head; its big hat wing is a part of its own (it flaps a little with pose.wing), so
    # the head's crown under the wing root is rebuilt from the crown beside it
    dict(name='head', parent='torso', pivot=(204, 122),
         poly=[(184, 38), (192, 33), (205, 26), (214, 22), (226, 28), (236, 46),
               (251, 57), (256, 72), (241, 81), (236, 84), (234, 100), (226, 108), (223, 118),
               (213, 130), (195, 136), (176, 132), (168, 116), (158, 110), (150, 100), (156, 90),
               (150, 84), (146, 74), (146, 64), (156, 57), (168, 51), (178, 46)],
         recon=[('extend', (1, 0), 'hatwing', 4), ('extend', (0, -1))], outline=1.4),
    dict(name='hatwing', parent='head', pivot=HATWING,
         poly=[(121, 18), (130, 15), (150, 25), (170, 34), (183, 39), (188, 46), (190, 56),
               (189, 66), (178, 69), (165, 67), (150, 61), (137, 53), (126, 41), (120, 28)],
         recon=[], outline=0),
    dict(name='armF_up', parent='torso', pivot=(246, 166),
         poly=[(236, 159), (244, 152), (253, 152), (261, 158), (264, 168), (270, 188), (275, 202),
               (277, 212), (273, 223), (265, 229), (254, 230), (245, 226), (239, 216), (235, 192),
               (233, 170)],
         keep=['foreF'], recon=[('extend', (0.15, 1), '', 6)], outline=2.0),
    # the free fist is drawn under the wrist band, so it can be swapped for an open hand
    dict(name='fistF', parent='foreF', pivot=WRIST,
         poly=[(254, 241), (281, 231), (287, 244), (293, 262), (290, 281), (268, 282), (256, 271),
               (256, 252)],
         recon=[('extend', (0, 1))], outline=1.6),
    dict(name='foreF', parent='armF_up', pivot=(257, 210),
         poly=[(240, 212), (243, 201), (250, 195), (258, 193), (266, 196), (272, 203), (275, 210),
               (280, 222), (282, 234), (259, 246), (255, 241), (250, 234), (245, 229), (240, 218)],
         recon=[], outline=0),
    dict(name='mantle', parent='torso', pivot=(185, 132),
         # the back end stops at the staff fist, which lies on top of it
         poly=[(111, 147), (112, 140), (116, 134), (127, 119), (145, 108), (165, 104), (176, 107), (181, 115),
               (192, 123), (204, 126), (214, 121), (222, 114), (233, 114), (246, 122), (257, 137),
               (264, 155), (264, 173), (252, 175), (242, 168), (232, 161), (219, 154), (205, 146),
               (192, 140), (184, 141), (176, 141), (167, 137), (152, 138), (139, 145), (129, 155),
               (124, 158), (122, 152), (119, 147)],
         recon=[], outline=0),
]

# joints used by the runtime rig (source px)
JOINTS = dict(hip=(200, 272), waist=WAIST, ankleB=ANKLE_B, ankleF=ANKLE_F, grip=(108, 170),
              staffTip=(96, 40))

# art landmarks for the skeleton skin (src/skins/classic.js): the rest segments every part is
# carried along. B = the trailing (back) leg of the drawing, F = the front leg; the free arm's
# parts serve both of the skeleton's arms.
ART = dict(
    hipC=(201, 264), hipB=(177, 264), hipF=(226, 264), kneeB=KNEE_B[:2], kneeF=KNEE_F[:2],
    ankleB=ANKLE_B, ankleF=ANKLE_F, broochB=BROOCH_B, broochF=BROOCH_F, ground=GROUND_Y,
    shoulder=(248, 160), elbow=(260, 209), wrist=WRIST, fist=(274, 260),
    top=(200, 130), neck=(204, 128), headC=(212, 84), crown=CROWN_Y, hatwing=HATWING,
    eye=(219, 77), mouth=(224, 94), cloakPin=(126, 152), waist=WAIST,
    staffButt=(119, 259), staffTip=(96, 40), grip=(108, 170))


# ---------------------------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------------------------
def load():
    a = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
    return a


def ink_density(a):
    """Unmix each pixel into paper + ink coverage along the paper->ink line (least squares)."""
    p = np.array(PAPER, np.float32)
    k = np.array(INK_DARK, np.float32)
    v = p - k
    d = ((p - a) @ v) / float(v @ v)
    return np.clip(d, 0, 1)


def flood_background(d):
    H, W = d.shape
    wall = d > INK_WALL
    wall[GROUND_Y + 1:] = False                 # the printed ground line is not part of him
    for y in range(GROUND_Y - 4, GROUND_Y + 1):
        row = np.zeros(W, bool)
        for x0, x1 in FEET_BOXES:
            row[x0:x1] = True
        wall[y] &= row
    pas = ~wall
    r = np.zeros((H, W), bool)
    r[0] = r[-1] = True
    r[:, 0] = r[:, -1] = True
    r &= pas
    while True:
        n = r.copy()
        n[1:] |= r[:-1]; n[:-1] |= r[1:]; n[:, 1:] |= r[:, :-1]; n[:, :-1] |= r[:, 1:]
        n &= pas
        if n.sum() == r.sum():
            break
        r = n
    return ~r


def to_img(m):
    return Image.fromarray(np.clip(m * 255 + 0.5, 0, 255).astype(np.uint8), 'L')


def from_img(im):
    return np.asarray(im).astype(np.float32) / 255


def blur(m, s):
    if s <= 0:
        return m
    return from_img(to_img(m).filter(ImageFilter.GaussianBlur(s)))


def morph(m, r, grow):
    """binary dilate (grow) or erode with a (2r+1) square, on a 0..1 map thresholded at 0.5"""
    if r <= 0:
        return (m > 0.5).astype(np.float32)
    im = to_img((m > 0.5).astype(np.float32))
    im = im.filter(ImageFilter.MaxFilter(2 * r + 1) if grow else ImageFilter.MinFilter(2 * r + 1))
    return from_img(im)


def poly_points(poly):
    pts = []
    for p in poly:
        if isinstance(p[0], str):
            continue
        pts.append(p)
    return pts


def raster(poly, H, W, ss=4):
    """antialiased polygon coverage; ('shaft', x0, y0, slope, halfw, ya, yb) adds a slanted strip,
    ('disc', cx, cy, r) a round knee cap"""
    im = Image.new('L', (W * ss, H * ss), 0)
    dr = ImageDraw.Draw(im)
    pts = poly_points(poly)
    if len(pts) >= 3:
        dr.polygon([(x * ss, y * ss) for x, y in pts], fill=255)
    for p in poly:
        if p[0] == 'disc':
            _, cx, cy, r = p
            dr.ellipse([(cx - r) * ss, (cy - r) * ss, (cx + r) * ss, (cy + r) * ss], fill=255)
        if p[0] == 'shaft':
            _, x0, y0, sl, hw, ya, yb = p
            xa, xb = x0 + sl * (ya - y0), x0 + sl * (yb - y0)
            q = [(xa - hw, ya), (xa + hw, ya), (xb + hw, yb), (xb - hw, yb)]
            dr.polygon([(x * ss, y * ss) for x, y in q], fill=255)
    return from_img(im.resize((W, H), Image.BOX))


# ---------------------------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------------------------
def build(debug_dir=None):
    a = load()
    H, W = a.shape[:2]
    d_raw = ink_density(a)
    # clean paper grain: anything under ~6% ink is paper
    d = np.clip((d_raw - 0.06) / 0.88, 0, 1)
    fig = flood_background(d)
    # ...but keep a faint trace of the sheet's own grain on the figure's paper, so the cutout
    # is not flatter than the textured sheet it was printed on
    d = np.where(fig & (d <= 0), np.clip(d_raw, 0, 0.06) * GRAIN, d).astype(np.float32)
    figf = fig.astype(np.float32)
    # antialiased silhouette: background pixels next to the figure keep their ink as pure ink
    near = morph(figf, 2, True) > 0.5
    edge = near & ~fig
    ink0 = np.where(fig, d, np.where(edge, d, 0)).astype(np.float32)
    pap0 = figf * (1 - d)          # premultiplied: paper share + ink share = coverage

    names = [p['name'] for p in PARTS]
    polys = {p['name']: raster(p['poly'], H, W) for p in PARTS}
    out = {}
    for i, part in enumerate(PARTS):
        P = polys[part['name']]
        PF = blur(P, FEATHER)
        keep = set(part.get('keep', []))
        above = [n for n in names[i + 1:] if n not in keep]
        cov = np.zeros((H, W), np.float32)
        for n in above:
            cov = np.maximum(cov, polys[n])
        cov = morph(cov * figf, COVER_ERODE, False)
        covb = blur(cov, 0.8)
        w_orig = PF * (1 - covb)
        w_rec = PF * covb
        # ---- reconstruction of the hidden pixels
        Pb = P > 0.5
        known = (w_orig > 0.6 * PF) & fig & Pb
        rec_ink = np.zeros((H, W), np.float32)
        todo = (w_rec > 0.01)
        filled = np.zeros((H, W), bool)
        clear = np.zeros((H, W), bool)
        for op in part.get('recon', []):
            box = None
            if isinstance(op[-1], dict):         # options: box=(x0, y0, x1, y1) limits the op
                box = op[-1].get('box')
                op = op[:-1]
            boxm = np.ones((H, W), bool)
            if box:
                boxm[:] = False
                boxm[box[1]:box[3], box[0]:box[2]] = True
            if op[0] in ('extend', 'reflect'):
                # extend: copy the first known pixel along (dx, dy) (+ a few px in);
                # reflect: mirror the known texture across the boundary (keeps halftone/folds)
                dx, dy = op[1]
                L = (dx * dx + dy * dy) ** 0.5
                dx, dy = dx / L, dy / L
                region = todo & ~filled & boxm
                if len(op) > 2:     # restrict to pixels hidden by the named parts
                    m = np.zeros((H, W), np.float32)
                    for n in names[i + 1:]:
                        if n.startswith(op[2]):
                            m = np.maximum(m, polys[n])
                    region &= morph(m, 1, True) > 0.5
                ys, xs = np.nonzero(region)
                val = np.full(len(ys), -1.0, np.float32)
                for k in range(1, 140):
                    un = val < 0
                    if not un.any():
                        break
                    sx = np.round(xs[un] + dx * k).astype(int)
                    sy = np.round(ys[un] + dy * k).astype(int)
                    ok = (sx >= 0) & (sx < W) & (sy >= 0) & (sy < H)
                    got = np.zeros(un.sum(), bool)
                    got[ok] = known[sy[ok], sx[ok]]
                    # the ray left the limb before meeting its drawing: this pixel lies outside
                    # the limb's hidden outline, so it stays empty rather than becoming paper
                    out_ = np.ones(un.sum(), bool)
                    out_[ok] = ~(fig[sy[ok], sx[ok]] & Pb[sy[ok], sx[ok]])
                    out_ &= ~got
                    val[np.nonzero(un)[0][out_]] = -2
                    idx = np.nonzero(un)[0][got]
                    sk = op[3] if len(op) > 3 else 3
                    tx = np.clip(np.round(sx[got] + dx * sk).astype(int), 0, W - 1)
                    ty = np.clip(np.round(sy[got] + dy * sk).astype(int), 0, H - 1)
                    if op[0] == 'reflect':
                        tx = np.clip(np.round(xs[idx] + dx * (2 * k - 1)).astype(int), 0, W - 1)
                        ty = np.clip(np.round(ys[idx] + dy * (2 * k - 1)).astype(int), 0, H - 1)
                    okk = known[ty, tx]
                    val[idx] = np.where(okk, ink0[ty, tx], ink0[sy[got], sx[got]])
                good = val >= 0
                rec_ink[ys[good], xs[good]] = val[good]
                filled[ys[good], xs[good]] = True
                gone = val == -2
                clear[ys[gone], xs[gone]] = True
                filled[ys[gone], xs[gone]] = True
            elif op[0] == 'paper':      # plain cloth/skin tone (+ the outline below)
                region = todo & ~filled & boxm
                if len(op) > 2:
                    m = np.zeros((H, W), np.float32)
                    for n in names[i + 1:]:
                        if n.startswith(op[2]):
                            m = np.maximum(m, polys[n])
                    region &= morph(m, 1, True) > 0.5
                rec_ink[region] = op[1]
                filled |= region
            elif op[0] == 'halftone':
                # a synthetic halftone cloth: paper dots on a rotated grid, their size following
                # fold shading that fans out from an origin (the cloak's pin), so a hidden stretch
                # of cloak reads as the same printed fabric without repeating tiles
                o = op[1]
                yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
                ox, oy = o['origin']
                phi = np.arctan2(xx - ox, yy - oy)
                dist = np.hypot(xx - ox, yy - oy)
                dens = o['base'] + o['amp'] * np.sin(phi * o['folds'] + o.get('phase', 0) + 0.004 * dist) \
                    + o.get('amp2', 0) * np.sin(phi * o['folds'] * 2.3 + 1.7)
                dens = np.clip(dens, 0.05, 0.95)
                ss = 4
                Y, X = np.mgrid[0:H * ss, 0:W * ss].astype(np.float32)
                X = (X + 0.5) / ss; Y = (Y + 0.5) / ss
                ca, sa = np.cos(np.radians(o['angle'])), np.sin(np.radians(o['angle']))
                u = (X * ca + Y * sa) / o['cell']; v = (-X * sa + Y * ca) / o['cell']
                du = u - np.round(u); dv = v - np.round(v)
                rr = np.hypot(du, dv)                 # in cells
                Dd = np.repeat(np.repeat(dens, ss, 0), ss, 1)
                rad_ = np.sqrt(np.clip(1 - Dd, 0, 1) / np.pi)   # paper dot radius, cells
                paper_hit = (rr < rad_).astype(np.float32)
                cov = 1 - paper_hit.reshape(H, ss, W, ss).mean(axis=(1, 3))
                region = todo & ~filled & boxm
                rec_ink[region] = cov[region]
                filled |= region
            elif op[0] == 'texture':
                x0, y0, x1, y1 = op[1]
                patch = ink0[y0:y1, x0:x1]
                ph, pw = patch.shape
                yy, xx = np.mgrid[0:H, 0:W]
                tex = patch[(yy - y0) % ph, (xx - x0) % pw]
                region = todo & ~filled & boxm
                rec_ink[region] = tex[region]
                filled |= region
        # anything still unfilled: plain paper with the average ink of the part
        # outline along the hidden edge of POLY
        if part.get('outline', 0):
            ow = part['outline']
            band = Pb.astype(np.float32) - morph(P, int(round(ow)), False)
            band = blur(band, 0.6)
            rec_ink = np.maximum(rec_ink, np.clip(band * 1.4, 0, 1) * (w_rec > 0.01))
        w_rec = w_rec * (1 - blur(clear.astype(np.float32), 0.6))
        inkA = w_orig * ink0 + w_rec * rec_ink
        papA = w_orig * pap0 + w_rec * (1.0 - rec_ink)
        if keep:
            # the cap that runs on under the next limb segment gets a contour too, so a bent
            # joint shows a closed outline instead of a pale stub
            km = np.zeros((H, W), np.float32)
            for n in keep:
                km = np.maximum(km, polys[n])
            zone = blur(morph(km * figf, 2, False), 0.6)
            band = blur(Pb.astype(np.float32) - morph(P, 2, False), 0.6)
            k = np.clip(band * 1.4, 0, 1) * zone
            A = np.clip(inkA + papA, 0, 1)
            inkA = np.maximum(inkA, k * A)
            papA = A - inkA
        if part.get('solid'):
            # shapes that must be opaque whatever the drawing has there (a knee disc reaching a
            # pixel past the drawn contour): fill the gap with paper and ink the shape's rim
            # (never past the silhouette grown by 1 px: there it would show in the drawing)
            Sm = raster(part['solid'], H, W) * blur(morph(figf, 1, True), 0.5)
            A = np.clip(inkA + papA, 0, 1)
            gap = np.clip(Sm - A, 0, 1)
            rim = blur(np.clip(Sm - morph(Sm, 2, False), 0, 1), 0.6)
            rim = np.clip(rim * 1.4, 0, 1)
            inkA = inkA + gap * rim
            papA = papA + gap * (1 - rim)
        if part.get('cap'):
            inkA, papA = cap_shaft(part['cap'], inkA, papA, H, W)
        out[part['name']] = clean_mask(part['name'], inkA, papA)
    return a, d, fig, polys, out


def cap_shaft(cap, inkA, papA, H, W):
    """a hard end on a slanted shaft ('shaft' strip x0, y0, slope, halfw, ya, yb): the last
    `soft` px of the strip become fully opaque (no feathered fade where the drawing ran under
    the cloak), closed by an ink cap `ink` px deep with rounded corners"""
    x0, y0, sl, hw, yb, soft, ink = cap
    L = (1 + sl * sl) ** 0.5
    ux, uy = sl / L, 1 / L                 # along the shaft, toward the butt
    nx, ny = uy, -ux                       # across
    cx, cy = x0 + sl * (yb - y0), yb       # butt centre

    def quad(a0, a1, w):
        return [(cx + ux * a0 + nx * w, cy + uy * a0 + ny * w), (cx + ux * a1 + nx * w, cy + uy * a1 + ny * w),
                (cx + ux * a1 - nx * w, cy + uy * a1 - ny * w), (cx + ux * a0 - nx * w, cy + uy * a0 - ny * w)]
    body = raster(quad(-soft, -ink + 0.5, hw), H, W)
    # the cap: a short ink band, its outer corners rounded by a disc on the end
    capm = np.maximum(raster(quad(-ink, -hw * 0.6, hw), H, W),
                      raster([('disc', cx - ux * hw * 0.6, cy - uy * hw * 0.6, hw)], H, W))
    A = np.clip(inkA + papA, 0, 1)
    A2 = np.maximum(A, body)
    # coverage the drawing lacked (its fade under the cloak): ink edges, the paper core
    core = raster(quad(-soft, -ink + 0.5, max(0.4, hw - 1.5)), H, W)
    inkB = inkA + (A2 - A) * (1 - core)
    inkB = np.clip(np.maximum(inkB, capm), 0, 1)
    A3 = np.maximum(A2, capm)
    papB = np.clip(A3 - inkB, 0, 1)
    return inkB.astype(np.float32), papB.astype(np.float32)


def clean_mask(name, inkA, papA):
    """Drop specks a part only shows once it moves: islands of its mask under MIN_ISLAND px of
    alpha, and 1 px hairs (an erode-then-dilate by 1 px decides what is a hair; anything the
    opening keeps, plus 1 px around it, stays, so contours and AA edges are not thinned)."""
    from scipy import ndimage as ndi
    A = np.clip(inkA + papA, 0, 1)
    m = A > 0.06
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    if n > 1:
        size = ndi.sum(A, lab, index=np.arange(1, n + 1))
        small = np.zeros(n + 1, bool)
        small[1:] = size < MIN_ISLAND
        m &= ~small[lab]
    op = ndi.binary_opening(m, structure=np.ones((3, 3)))
    keep = ndi.binary_dilation(op, structure=np.ones((3, 3)), iterations=2)
    # the low-alpha fringe (AA) next to what is kept stays too
    keep = blur(keep.astype(np.float32), 0.5)
    dropped = float((A * (1 - keep)).sum())
    if dropped > 0.5:
        print('  clean %-8s dropped %.0f px of alpha' % (name, dropped))
    return inkA * keep, papA * keep


def paint_palm(H, W):
    """An open hand (there is none in the mockups), engraved in the sheet's manner: paper palm
    and four spread fingers with a thumb, a heavy outline, finger creases and a few hatch
    strokes on the shadow side. Painted in the free hand's place (wrist at WRIST, along the
    forearm's direction), so it swaps in for fistF with the same pivot."""
    ss = 4
    import math
    ex, ey = 259, 203
    wx, wy = WRIST
    L = math.hypot(wx - ex, wy - ey)
    v = ((wx - ex) / L, (wy - ey) / L)       # along the forearm (down the hand)
    u = (-v[1], v[0])                         # across (toward the back of the figure)

    def P(a, b):                              # hand frame (a across, b along) -> super px
        return ((wx + u[0] * a + v[0] * b) * ss, (wy + u[1] * a + v[1] * b) * ss)

    fill = Image.new('L', (W * ss, H * ss), 0)
    ink = Image.new('L', (W * ss, H * ss), 0)
    df, di = ImageDraw.Draw(fill), ImageDraw.Draw(ink)
    lw = int(2.2 * ss)
    # fingers: (base across, angle off the hand axis, length, half width)
    fingers = [(-6.0, -12, 15.5, 2.2), (-2.0, -4, 18.0, 2.3), (2.2, 4, 17.0, 2.2), (6.0, 13, 13.5, 2.0)]
    shapes = []
    for a0, ang, ln, hw in fingers:
        ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        b0 = 13.0
        tip = (a0 + sa * ln, b0 + ca * ln)
        pts = []
        for t in [i / 10 for i in range(11)]:
            pa, pb = a0 + sa * ln * t, b0 + ca * ln * t
            w = hw * (1 - 0.25 * t)
            pts.append(((pa - ca * w, pb + sa * w), (pa + ca * w, pb - sa * w)))
        poly = [p[0] for p in pts] + [p[1] for p in reversed(pts)]
        shapes.append(('finger', poly, tip, hw * 0.75))
    # thumb, on the forward side (-across), angled out
    ta = math.radians(-38)
    tb0 = (-6.5, 4.0)
    tln, thw = 11.0, 2.5
    tpts = []
    for t in [i / 10 for i in range(11)]:
        pa, pb = tb0[0] + math.sin(ta) * tln * t, tb0[1] + math.cos(ta) * tln * t
        w = thw * (1 - 0.2 * t)
        tpts.append(((pa - math.cos(ta) * w, pb + math.sin(ta) * w), (pa + math.cos(ta) * w, pb - math.sin(ta) * w)))
    tpoly = [p[0] for p in tpts] + [p[1] for p in reversed(tpts)]
    ttip = (tb0[0] + math.sin(ta) * tln, tb0[1] + math.cos(ta) * tln)
    shapes.append(('finger', tpoly, ttip, thw * 0.8))
    palm = [(-7.5, -1), (7.5, -1), (8.5, 8), (8.0, 15), (-8.0, 15), (-8.5, 6)]
    # outline pass (thick), then paper pass (inset) -> ink = outline ring
    for kind, poly, tip, r in shapes:
        di.polygon([P(*q) for q in poly], fill=255)
        c = P(*tip); rr = (r + 2.2) * ss
        di.ellipse([c[0] - rr, c[1] - rr, c[0] + rr, c[1] + rr], fill=255)
    di.polygon([P(*q) for q in palm], fill=255)
    for kind, poly, tip, r in shapes:
        di.line([P(*q) for q in poly] + [P(*poly[0])], fill=255, width=lw * 2)
    di.line([P(*q) for q in palm] + [P(*palm[0])], fill=255, width=lw * 2)
    inner = Image.new('L', (W * ss, H * ss), 0)
    dn = ImageDraw.Draw(inner)
    for kind, poly, tip, r in shapes:
        dn.polygon([P(*q) for q in poly], fill=255)
        c = P(*tip); rr = r * ss
        dn.ellipse([c[0] - rr, c[1] - rr, c[0] + rr, c[1] + rr], fill=255)
    dn.polygon([P(*q) for q in palm], fill=255)
    inner = inner.filter(ImageFilter.MinFilter(3))
    # creases and hatching (ink) inside the paper
    hatch = Image.new('L', (W * ss, H * ss), 0)
    dh = ImageDraw.Draw(hatch)
    for a in (-4.0, 0.1, 4.1):              # finger roots
        dh.line([P(a, 11.5), P(a + 0.3, 15.5)], fill=255, width=int(1.1 * ss))
    dh.line([P(-5, 6), P(1, 10), P(6, 9)], fill=255, width=int(1.0 * ss))   # palm crease
    for i in range(6):                        # shadow side hatching (back edge)
        b = 1 + i * 2.4
        dh.line([P(5.0, b), P(8.0, b + 1.2)], fill=255, width=int(0.9 * ss))
    for a0, ang, ln, hw in fingers[2:]:
        ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        for t in (0.35, 0.6):
            pa, pb = a0 + sa * ln * t, 13 + ca * ln * t
            dh.line([P(pa - 0.2, pb), P(pa + hw * 0.9, pb + 0.5)], fill=255, width=int(0.8 * ss))
    inner_np = np.asarray(inner).astype(np.float32) / 255
    ink_np = np.asarray(ink).astype(np.float32) / 255
    hat_np = np.asarray(hatch).astype(np.float32) / 255
    cover = np.maximum(ink_np, inner_np)
    inkm = np.clip(np.maximum(cover - inner_np, hat_np * inner_np * 0.85), 0, 1)
    def down(m):
        return from_img(to_img(m).resize((W, H), Image.BOX))
    A = down(cover)
    inkA = np.minimum(down(inkm), A)
    return inkA, A - inkA


def crop_part(inkA, papA, pad=2):
    m = (inkA > 0.004) | (papA > 0.004)
    ys, xs = np.nonzero(m)
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, m.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, m.shape[1])
    return x0, y0, x1, y1


def compose(out, H, W, bg=(255, 255, 255), order=None):
    c = np.ones((H, W, 3), np.float32) * np.array(bg, np.float32)
    alpha = np.zeros((H, W), np.float32)
    p = np.array(PAPER, np.float32)
    k = np.array(INK_DARK, np.float32)
    for part in PARTS:
        inkA, papA = out[part['name']]
        A = np.clip(papA + inkA, 0, 1)
        c = c * (1 - A[..., None]) + p * papA[..., None] + k * inkA[..., None]
        alpha = 1 - (1 - alpha) * (1 - A)
    return c, alpha


def main():
    dbg = None
    if '--debug' in sys.argv:
        dbg = sys.argv[sys.argv.index('--debug') + 1]
        os.makedirs(dbg, exist_ok=True)
    a, d, fig, polys, out = build(dbg)
    H, W = d.shape
    os.makedirs(os.path.join(OUT_DIR, 'maps'), exist_ok=True)
    meta = []
    pc = np.array(PAPER, np.float32)
    kc = np.array(INK_DARK, np.float32)
    for part in PARTS:
        inkA, papA = out[part['name']]
        x0, y0, x1, y1 = crop_part(inkA, papA)
        ik, pp = inkA[y0:y1, x0:x1], papA[y0:y1, x0:x1]
        # viewable part
        A = np.clip(pp + ik, 0, 1)
        col = (pc * pp[..., None] + kc * ik[..., None]) / np.maximum(A, 1e-4)[..., None]
        rgba = np.dstack([np.clip(col, 0, 255), A * 255]).astype(np.uint8)
        Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT_DIR, part['name'] + '.png'), optimize=True)
        # embedded map: ink coverage stacked over paper coverage, one grey PNG
        stack = np.vstack([ik, pp])
        buf = io.BytesIO()
        to_img(stack).save(buf, 'PNG', optimize=True)
        raw = buf.getvalue()
        with open(os.path.join(OUT_DIR, 'maps', part['name'] + '.png'), 'wb') as f:
            f.write(raw)
        meta.append(dict(name=part['name'], parent=part['parent'], pivot=list(part['pivot']),
                         x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0),
                         src='data:image/png;base64,' + base64.b64encode(raw).decode()))
    # extra parts (not in the drawing): the painted open hand
    inkA, papA = paint_palm(H, W)
    x0, y0, x1, y1 = crop_part(inkA, papA)
    ik, pp = inkA[y0:y1, x0:x1], papA[y0:y1, x0:x1]
    A = np.clip(pp + ik, 0, 1)
    col = (pc * pp[..., None] + kc * ik[..., None]) / np.maximum(A, 1e-4)[..., None]
    Image.fromarray(np.dstack([np.clip(col, 0, 255), A * 255]).astype(np.uint8), 'RGBA').save(
        os.path.join(OUT_DIR, 'palm.png'), optimize=True)
    buf = io.BytesIO()
    to_img(np.vstack([ik, pp])).save(buf, 'PNG', optimize=True)
    raw = buf.getvalue()
    with open(os.path.join(OUT_DIR, 'maps', 'palm.png'), 'wb') as f:
        f.write(raw)
    meta.append(dict(name='palm', parent='foreF', pivot=list(WRIST), extra=True,
                     x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0),
                     src='data:image/png;base64,' + base64.b64encode(raw).decode()))
    if dbg:
        c, alpha = compose(out, H, W)
        miss = fig & (alpha < 0.985)
        Image.fromarray(np.clip(c, 0, 255).astype(np.uint8)).save(os.path.join(dbg, 'compose.png'))
        ink0 = np.where(morph(fig.astype(np.float32), 2, True) > 0.5, d, 0)
        ref = np.ones((H, W, 3), np.float32) * 255
        p0 = fig * (1 - d)
        ref = ref * (1 - np.clip(p0 + ink0, 0, 1)[..., None]) + pc * p0[..., None] + kc * ink0[..., None]
        Image.fromarray(np.clip(ref, 0, 255).astype(np.uint8)).save(os.path.join(dbg, 'ref.png'))
        diff = np.abs(c - ref).max(-1)
        mv = np.zeros((H, W, 3), np.uint8); mv[fig] = 60; mv[miss] = (255, 0, 0)
        Image.fromarray(mv).resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(dbg, 'miss.png'))
        miss = fig & (alpha < 0.985)
        pc = np.array(PAPER, np.float32); kc = np.array(INK_DARK, np.float32)
        print('max diff inside fig', float(diff[fig].max()), 'mean', float(diff[fig].mean()),
              'pixels >40:', int((diff[fig] > 40).sum()), 'see-through px:', int(miss.sum()))
        dv = np.clip(diff * 4, 0, 255).astype(np.uint8)
        Image.fromarray(dv).save(os.path.join(dbg, 'diff.png'))
        # polygon overlay
        big = Image.fromarray(a.astype(np.uint8)).resize((W * 3, H * 3), Image.LANCZOS)
        dr = ImageDraw.Draw(big)
        cols = [(255, 0, 0), (0, 170, 0), (255, 120, 0), (200, 0, 200), (0, 150, 150), (120, 80, 0),
                (255, 0, 120), (0, 90, 255), (0, 0, 0), (180, 160, 0), (0, 200, 90), (150, 0, 0),
                (90, 0, 170)]
        for i, part in enumerate(PARTS):
            pts = poly_points(part['poly'])
            if len(pts) > 2:
                dr.line([(x * 3, y * 3) for x, y in pts + [pts[0]]], fill=cols[i % len(cols)], width=2)
            px, py = part['pivot']
            dr.ellipse([px * 3 - 5, py * 3 - 5, px * 3 + 5, py * 3 + 5], outline=cols[i % len(cols)], width=3)
        big.save(os.path.join(dbg, 'polys.png'))
        bad = (miss | (fig & (diff > 40)))
        ba = np.asarray(big).copy()
        bb = np.repeat(np.repeat(bad, 3, 0), 3, 1)
        ba[bb] = (255, 0, 255)
        Image.fromarray(ba).save(os.path.join(dbg, 'problems.png'))
        for part in PARTS:
            inkA, papA = out[part['name']]
            cc = np.ones((H, W, 3), np.float32) * np.array([255, 220, 120], np.float32)
            AA = np.clip(papA + inkA, 0, 1)
            cc = cc * (1 - AA[..., None]) + pc * papA[..., None] + kc * inkA[..., None]
            x0, y0, x1, y1 = crop_part(inkA, papA, 6)
            Image.fromarray(np.clip(cc[y0:y1, x0:x1], 0, 255).astype(np.uint8)).resize(
                ((x1 - x0) * 3, (y1 - y0) * 3), Image.NEAREST).save(os.path.join(dbg, 'part_' + part['name'] + '.png'))
    write_js(meta)


def write_js(meta):
    tpl = open(os.path.join(OUT_DIR, 'runtime.js')).read()
    s = HEIGHT / (GROUND_Y - CROWN_Y)
    rig = dict(scale=s, origin=[FEET_X, GROUND_Y], joints={k: list(v) for k, v in JOINTS.items()},
               art={k: (list(v) if isinstance(v, tuple) else v) for k, v in ART.items()},
               paper='#%02x%02x%02x' % PAPER, ink='#%02x%02x%02x' % INK_DARK, height=HEIGHT)
    js = tpl.replace('/*@RIG@*/null', json.dumps(rig)).replace('/*@PARTS@*/[]', json.dumps(meta))
    with open(OUT_JS, 'w') as f:
        f.write(js)
    print('wrote', OUT_JS, os.path.getsize(OUT_JS), 'bytes')


if __name__ == '__main__':
    main()
