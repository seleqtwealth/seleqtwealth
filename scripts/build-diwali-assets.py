#!/usr/bin/env python3
"""
Diwali night assets for the photo heroes (run once; outputs are committed).

  images/diwali/gift-lights-a.webp   lit office windows for the GIFT City skyline
  images/diwali/gift-lights-b.webp   a second, sparser set used for a slow twinkle
  images/diwali/banyan-bark-lit.webp the photo's own bark texture in lamplight gold, fading out from
                                     diyas at the foot of the trunk: screened over the Family
                                     Office hero at night
  images/diwali/marigold-toran.webp  a seamless toran strip: real marigold heads (cut from a photo of
                                     garlands) strung bead by bead along swags, with drops at the joins
  images/diwali/rangoli.webp         a real flower rangoli ringed with lit diyas, cut out as a floor ellipse
  images/diwali/gold-leaf.webp       real gold leaf, evened out and re-toned to the house gold, for the
                                     gilded heading words

Every layer has the same size and framing as its hero photo, so it lines up with
object-fit: cover and the same object-position. Window shapes come from the
photo itself: by day the glass is darker than the frames and the sky, so the
dark panes inside each tower become the windows that light up at night.

The banyan plates come from the original photo, which is not kept in the repo
(Brandon Green, Unsplash, unsplash.com/photos/GEyXGTY2e9w, Unsplash licence). Pass it once:

  python3 scripts/build-diwali-assets.py --banyan /path/to/banyan.jpg
  -> images/heroes/family-office-banyan.webp, @2x   (cropped to 4:3 on the trunk, monochrome)
     images/diwali/banyan-bark-lit.webp              (the Diwali lamplight layer for that hero)

The decorations come from three Unsplash photos (Unsplash licence), also kept outside the repo:
marigolds by Ajmul H (unsplash.com/photos/kZQ1DmUauuI), rangoli by Suchandra Roy Chowdhury
(unsplash.com/photos/cM8X2DDvnGE), gold leaf by Colin Watts (unsplash.com/photos/zwMUC0o9_74):

  python3 scripts/build-diwali-assets.py --marigold m.jpg --rangoli r.jpg --gold g.jpg

Run: python3 scripts/build-diwali-assets.py   (needs Pillow + numpy)
"""
import sys
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "images", "diwali")
rng = np.random.default_rng(2083)          # Samvat 2083: fixed seed, stable output

# tower: x0, y0, x1, y1 (photo px), floor pitch, phase from y0, bay width, glass threshold
TOWERS = [
    (310, 680, 464, 952, 14.0, 6, 12, 100),
    (606, 480, 684, 1050, 19.0, 14, 13, 90),
    (686, 416, 926, 1026, 21.0, 18, 19, 105),
    (1469, 657, 1690, 1000, 23.5, 10, 16, 110),
    (1704, 654, 1984, 1060, 23.5, 1, 14, 105),
]
WARM = np.array([255, 178, 96], float)     # lamp amber
PALE = np.array([255, 222, 165], float)    # soft gold
COOL = np.array([200, 212, 235], float)    # the odd office on cool white, dimmer


def lights(lum, p_lit, b_range):
    h, w = lum.shape
    rgb = np.zeros((h, w, 3), float)
    alpha = np.zeros((h, w), float)
    for x0, y0, x1, y1, pitch, phase, bay, thr in TOWERS:
        reg = lum[y0:y1, x0:x1]
        glass = np.clip((thr - reg) / 35.0, 0, 1)          # soft edge below the threshold
        ys, xs = np.mgrid[0:y1 - y0, 0:x1 - x0]
        floor = np.floor((ys - phase) / pitch).astype(int)
        bayi = (xs // bay).astype(int)
        nf, nb = floor.max() + 2, bayi.max() + 1
        lit = np.zeros((nf + 1, nb), bool)
        for r in range(nf + 1):
            on_ = rng.random() < p_lit
            for c in range(nb):
                if rng.random() < 0.28:            # start or end an office run
                    on_ = rng.random() < p_lit
                lit[r, c] = on_
        bright = rng.uniform(*b_range, size=(nf + 1, nb))
        mixw = rng.random((nf + 1, nb))
        cool = rng.random((nf + 1, nb)) < 0.04
        f = np.clip(floor + 1, 0, nf)
        on = lit[f, bayi] * bright[f, bayi] * glass
        tone = (WARM[None, None] * (1 - mixw[f, bayi])[..., None] + PALE[None, None] * mixw[f, bayi][..., None])
        tone = np.where(cool[f, bayi][..., None], COOL[None, None], tone)
        rgb[y0:y1, x0:x1] = tone
        alpha[y0:y1, x0:x1] = np.maximum(alpha[y0:y1, x0:x1], on)
    # rooms are never evenly lit: a soft, low-contrast texture breaks up flat panes
    tex = rng.random((h, w))
    tex = np.asarray(Image.fromarray((tex * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2)), float) / 255
    alpha *= 0.72 + 0.56 * np.clip((tex - 0.5) * 4 + 0.5, 0, 1) * 0.5
    # a soft halo so lit windows bloom a little at night
    halo = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7)), float) / 255
    a = np.clip(np.maximum(alpha, halo * 0.35), 0, 1)
    out = np.dstack([rgb, a * 255]).astype(np.uint8)
    return Image.fromarray(out)


BANYAN_CROP = (265, 0, 5578, 3985)          # 4:3 box in the 5961 x 3985 original, centred on the trunk
LAMP = (0.5, 0.97)                           # diyas at the foot of the trunk, as fractions of the crop


def banyan_classes(rgb):
    """Per-pixel leaf, sky and bark weights from colour: leaves are green, sky gaps are bright and grey."""
    a = rgb / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    leaf = np.clip((g - np.maximum(r, b)) / np.maximum(mx, 1e-6) * 5 - 0.15, 0, 1)
    sky = np.clip((lum - 0.7) / 0.14, 0, 1) * np.clip((0.32 - sat) / 0.16, 0, 1)
    bark = np.clip(1 - leaf, 0, 1) * (1 - sky)
    return leaf, sky, bark, lum


def soft(x, radius):
    return np.asarray(Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)), float) / 255


def banyan_plates(src):
    im = Image.open(src).convert("RGB").crop(BANYAN_CROP)
    heroes = os.path.join(ROOT, "images", "heroes")
    # monochrome hero at full range; the brightest sky gaps held back a little so the trunk leads
    big = im.resize((2800, 2100), Image.LANCZOS)
    g = np.asarray(big.convert("L"), float)
    lo, hi = np.percentile(g, 0.5), np.percentile(g, 99.6)
    g = np.clip((g - lo) / (hi - lo), 0, 1)
    g = np.where(g > 0.8, 0.8 + (g - 0.8) * 0.45, g) ** 1.08 * 255
    mono = Image.fromarray(g.astype(np.uint8)).convert("RGB")
    mono.save(os.path.join(heroes, "family-office-banyan@2x.webp"), "WEBP", quality=80, method=6)
    mono.resize((1600, 1200), Image.LANCZOS).save(os.path.join(heroes, "family-office-banyan.webp"), "WEBP", quality=80, method=6)
    bark_lit(np.asarray(im.resize((1400, 1050), Image.LANCZOS), float)).save(
        os.path.join(OUT, "banyan-bark-lit.webp"), "WEBP", quality=78, method=6)


def bark_lit(rgb):
    """Lamplight from diyas at the foot of the trunk, on the bark only (leaves and sky stay dark)."""
    h, w = rgb.shape[:2]
    _, _, bark, lum = banyan_classes(rgb)
    bark = soft(bark, 0.8)
    ys, xs = np.mgrid[0:h, 0:w]
    d2 = ((xs / w - LAMP[0]) * 1.33 / 0.34) ** 2 + ((ys / h - LAMP[1]) / 0.3) ** 2
    alpha = np.clip(bark * np.exp(-d2 * 1.8) * 0.85, 0, 1)            # light from the ground reaches the lower roots only
    lit = np.clip((lum ** 0.9)[..., None] * np.array([1.0, 0.66, 0.3]) * 1.5, 0, 1)
    lit[alpha < 0.01] = 0                    # nothing to show there: keeps the file small
    return Image.fromarray(np.dstack([lit * 255, alpha * 255]).astype(np.uint8))


def _arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None


def _bilinear(img, ys, xs):
    """Sample img (h, w, c) at float coordinates, clamped to the edges."""
    h, w = img.shape[:2]
    ys, xs = np.clip(ys, 0, h - 1.001), np.clip(xs, 0, w - 1.001)
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = (ys - y0)[..., None], (xs - x0)[..., None]
    return (img[y0, x0] * (1 - fy) * (1 - fx) + img[y0, x0 + 1] * (1 - fy) * fx
            + img[y0 + 1, x0] * fy * (1 - fx) + img[y0 + 1, x0 + 1] * fy * fx)


def dw_half(img):
    return img.shape[1] / 2


def marigold_toran(src, out, tile=600, height=128, thick=34, top=17, depth=38):
    """A real strand of marigolds, traced out of a photo of hanging garlands and bent along swags,
    so its own petals run unbroken like a real toran; short drops of the same strand hang at the joins.
    Rendered over five tiles and cropped to the middle one, so it repeats seamlessly."""
    im = Image.open(src).convert("RGB").resize((1000, 1500), Image.LANCZOS)
    a = np.asarray(im, float) / 255
    mx, mn = a.max(-1), a.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    warm = np.clip((a[..., 0] - a[..., 2] - 0.2) / 0.1, 0, 1) * np.clip((sat - 0.4) / 0.1, 0, 1) * np.clip((mx - 0.22) / 0.08, 0, 1)
    # the leftmost strand: its left edge is clean against the dark fabric, its width ~160 px at this scale
    y0, y1, half = 330, 1400, 96                                             # starts below a spotted yellow flower
    raw = np.array([np.argmax(warm[y] > 0.5) for y in range(y0, y1)], float)
    k = np.ones(41) / 41
    edge = np.convolve(np.pad(raw, 20, mode="edge"), k, "valid")
    centre = edge + 80
    offs = np.arange(-half, half)
    rows = np.arange(y0, y1)
    xs = centre[:, None] + offs[None, :]
    rope = _bilinear(a, np.repeat(rows[:, None], len(offs), 1).astype(float), xs)
    w = _bilinear(warm[..., None], np.repeat(rows[:, None], len(offs), 1).astype(float), xs)[..., 0]
    # the far side touches the next strand, so it gets the near side's own bumpy outline, half a flower later
    dl = centre - raw                                                         # centre to the natural edge, flower by flower
    dr = np.roll(dl, 24)[:, None]
    cut = np.clip((dr - offs[None, :]) / 5, 0, 1)
    rope = np.dstack([rope, w * np.where(offs[None, :] > 0, cut, 1.0)])      # (length, thickness, 4)
    rope = rope.transpose(1, 0, 2)                                            # horizontal: (thickness, length, 4)
    sc = thick / rope.shape[0]
    rope = np.asarray(Image.fromarray((rope * 255).astype(np.uint8)).resize((round(rope.shape[1] * sc), thick), Image.LANCZOS), float) / 255
    # a long rope: the strand, then the same strand turned end for end, cross-faded where they meet
    L, fade = rope.shape[1], 24
    turned = rope[::-1, ::-1]
    parts = [rope, turned, rope, turned]
    total = L * len(parts) - fade * (len(parts) - 1)
    T = np.zeros((thick, total, 4))
    x = 0
    for n, part in enumerate(parts):
        ramp = np.ones(L)
        if n: ramp[:fade] = np.linspace(0, 1, fade)
        if n < len(parts) - 1: ramp[-fade:] = np.linspace(1, 0, fade)
        T[:, x:x + L] += part * ramp[None, :, None]
        x += L - fade
    # gentle cylinder shading, darker underneath, and a little night grade
    v = np.linspace(-1, 1, thick)[:, None, None]
    T[..., :3] *= (0.86 + 0.14 * np.cos(v * np.pi / 2)) * (1 - 0.12 * np.clip(v, 0, 1)) * 0.9
    W5 = tile * 5
    canvas = np.zeros((height, W5, 4))
    def over(dst, src):
        al = src[..., 3:4]
        dst[..., :3] = src[..., :3] * al + dst[..., :3] * (1 - al)
        dst[..., 3:4] = al + dst[..., 3:4] * (1 - al)
    xs_t = np.arange(tile)
    u = xs_t / tile
    yc = top + depth * (1 - (2 * u - 1) ** 2)
    slope = depth * (-4 * (2 * u - 1)) / tile
    arc = np.concatenate([[0], np.cumsum(np.sqrt(1 + slope[1:] ** 2))])
    cos_t = 1 / np.sqrt(1 + slope ** 2)
    for kk in range(5):                                                       # one swag per tile
        off = (kk * 97) % max(1, total - int(arc[-1]) - 1)                    # a different stretch of rope each time
        Y = np.arange(height)[:, None]
        n = (Y - yc[None, :]) * cos_t[None, :] + thick / 2
        S = arc[None, :] + off
        smp = _bilinear(T, np.broadcast_to(n, (height, tile)).astype(float), np.broadcast_to(S, (height, tile)).astype(float))
        inside = ((n >= 0) & (n <= thick - 1))[..., None]
        smp = smp * inside
        over(canvas[:, kk * tile:(kk + 1) * tile], smp)
    # drops: a short length of the strand hanging straight down from each join
    drop_len = 64
    dsrc = T[:, 40:40 + drop_len].transpose(1, 0, 2)                         # (length, thickness, 4), hanging
    dsrc = np.asarray(Image.fromarray((dsrc * 255).astype(np.uint8)).resize((int(thick * 0.82), drop_len), Image.LANCZOS), float) / 255
    dy = np.arange(drop_len)[:, None] - (drop_len - dw_half(dsrc))
    dx = np.arange(dsrc.shape[1])[None, :] - (dsrc.shape[1] - 1) / 2
    end = np.where(dy > 0, np.clip((dw_half(dsrc) - np.sqrt(dx ** 2 + dy ** 2)) / 3, 0, 1), 1.0)
    dsrc[..., 3] *= end                                                       # a rounded end, like the last flower
    dw = dsrc.shape[1]
    for kk in range(1, 5):
        x = kk * tile - dw // 2
        over(canvas[top - 4:top - 4 + drop_len, x:x + dw], dsrc)
    strip = canvas[:, 2 * tile:3 * tile]
    al = strip[..., 3]
    sh = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4)), float) / 255
    sh = np.roll(sh, 5, axis=0) * 0.45                                        # a soft shadow on the page
    out_a = al + sh * (1 - al)
    rgb = strip[..., :3] * (al / np.maximum(out_a, 1e-6))[..., None]
    Image.fromarray((np.dstack([np.clip(rgb, 0, 1), np.clip(out_a, 0, 1)]) * 255).astype(np.uint8)).save(out, "WEBP", quality=88, method=6)


def rangoli_cutout(src, out, cx=0.5, cy=0.49, rx=0.47, ry=0.445, width=600):
    """The rangoli lies on the floor at an angle, so it is cut out as an ellipse with a soft edge."""
    im = Image.open(src).convert("RGB")
    w, h = im.size
    box = (int((cx - rx) * w), int((cy - ry) * h), int((cx + rx) * w), int((cy + ry) * h))
    im = im.crop(box)
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    hh, ww = im.height, im.width
    ys, xs = np.mgrid[0:hh, 0:ww]
    d = np.sqrt(((xs - ww / 2) / (ww / 2)) ** 2 + ((ys - hh / 2) / (hh / 2)) ** 2)
    alpha = np.clip((1 - d) / 0.14, 0, 1) ** 1.2
    rgb = np.asarray(im, float) * (0.82 + 0.18 * np.clip(1 - d, 0, 1))[..., None]   # the floor falls into the dark
    Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)).save(out, "WEBP", quality=84, method=6)


def gold_leaf(src, out, box=(0.58, 0.02, 0.98, 0.5), size=(1000, 700)):
    """Real gold leaf with its crackle and seams; uneven light flattened, re-toned to the house gold."""
    im = Image.open(src).convert("RGB")
    w, h = im.size
    im = im.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h))).resize(size, Image.LANCZOS)
    a = np.asarray(im, float) / 255
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    low = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(60)), float) / 255
    detail = lum / np.maximum(low, 1e-3)                       # crackle and seams, evenly lit
    t = np.clip(0.55 + (detail - 1) * 3.6 + (low - low.mean()) * 0.6, 0, 1)
    stops = np.array([[0.0, 104, 70, 24], [0.45, 196, 150, 70], [0.75, 236, 200, 120], [1.0, 255, 244, 205]])   # metal: deep, gold, light, glint
    rgb = np.stack([np.interp(t, stops[:, 0], stops[:, c]) for c in (1, 2, 3)], -1)
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(out, "WEBP", quality=80, method=6)


def main():
    os.makedirs(OUT, exist_ok=True)
    gift = np.asarray(Image.open(os.path.join(ROOT, "images/heroes/gift-city-skyline.webp")).convert("L"), float)
    lights(gift, 0.5, (0.5, 0.95)).save(os.path.join(OUT, "gift-lights-a.webp"), "WEBP", quality=80, method=6)
    lights(gift, 0.22, (0.6, 1.0)).save(os.path.join(OUT, "gift-lights-b.webp"), "WEBP", quality=80, method=6)
    if "--banyan" in sys.argv:
        banyan_plates(sys.argv[sys.argv.index("--banyan") + 1])
    if _arg("--marigold"):
        marigold_toran(_arg("--marigold"), os.path.join(OUT, "marigold-toran.webp"))
    if _arg("--rangoli"):
        rangoli_cutout(_arg("--rangoli"), os.path.join(OUT, "rangoli.webp"))
    if _arg("--gold"):
        gold_leaf(_arg("--gold"), os.path.join(OUT, "gold-leaf.webp"))
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, "KB")


if __name__ == "__main__":
    main()
