#!/usr/bin/env python3
"""
Diwali night assets for the photo heroes (run once; outputs are committed).

  images/diwali/gift-lights-a.webp   lit office windows for the GIFT City skyline
  images/diwali/gift-lights-b.webp   a second, sparser set used for a slow twinkle
  images/diwali/banyan-bark-lit.webp the photo's own bark texture in lamplight gold, fading out from
                                     diyas at the foot of the trunk: screened over the Family
                                     Office hero at night

Every layer has the same size and framing as its hero photo, so it lines up with
object-fit: cover and the same object-position. Window shapes come from the
photo itself: by day the glass is darker than the frames and the sky, so the
dark panes inside each tower become the windows that light up at night.

The banyan plates come from the original photo, which is not kept in the repo
(Brandon Green, Unsplash, unsplash.com/photos/GEyXGTY2e9w, Unsplash licence). Pass it once:

  python3 scripts/build-diwali-assets.py --banyan /path/to/banyan.jpg
  -> images/heroes/family-office-banyan.webp, @2x   (cropped to 4:3 on the trunk, monochrome)
     images/diwali/banyan-bark-lit.webp              (the Diwali lamplight layer for that hero)

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


def main():
    os.makedirs(OUT, exist_ok=True)
    gift = np.asarray(Image.open(os.path.join(ROOT, "images/heroes/gift-city-skyline.webp")).convert("L"), float)
    lights(gift, 0.5, (0.5, 0.95)).save(os.path.join(OUT, "gift-lights-a.webp"), "WEBP", quality=80, method=6)
    lights(gift, 0.22, (0.6, 1.0)).save(os.path.join(OUT, "gift-lights-b.webp"), "WEBP", quality=80, method=6)
    if "--banyan" in sys.argv:
        banyan_plates(sys.argv[sys.argv.index("--banyan") + 1])
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, "KB")


if __name__ == "__main__":
    main()
