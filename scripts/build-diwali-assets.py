#!/usr/bin/env python3
"""
Diwali night assets for the photo heroes (run once; outputs are committed).

  images/diwali/gift-lights-a.webp   lit office windows for the GIFT City skyline
  images/diwali/gift-lights-b.webp   a second, sparser set used for a slow twinkle
  images/diwali/haveli-brass-mask.webp the brass bands, studs and rings on the haveli door, used by
                                     Strings of Light so they catch the lamplight while the
                                     dark wood and stone do not
  images/diwali/haveli-brass-lit.webp the door's own brass, warmed and fading upward from lamps
                                     on the step: screened over the Family Office hero at night

Every layer has the same size and framing as its hero photo, so it lines up with
object-fit: cover and the same object-position. Window shapes come from the
photo itself: by day the glass is darker than the frames and the sky, so the
dark panes inside each tower become the windows that light up at night.

The haveli door plates come from the original photo, which is not kept in the repo
("Haveli Door.JPG", Sarthak Shah, Wikimedia Commons, CC BY-SA 3.0). Pass it once:

  python3 scripts/build-diwali-assets.py --haveli /path/to/Haveli_Door.JPG
  -> images/heroes/family-office-haveli.webp, @2x   (cropped to 4:3, monochrome)
     images/diwali/haveli-door.webp, -small.webp     (cropped to 4:3, colour, for the WebGL scene)

Run: python3 scripts/build-diwali-assets.py   (needs Pillow + numpy)
"""
import sys
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

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


HAVELI_CROP = (0, 420, 2736, 2472)          # 4:3 box in the original: the elephant arch down to the door rings


def haveli_plates(src):
    im = Image.open(src).convert("RGB").crop(HAVELI_CROP)
    heroes = os.path.join(ROOT, "images", "heroes")
    im.resize((2400, 1800), Image.LANCZOS).save(os.path.join(OUT, "haveli-door.webp"), "WEBP", quality=82, method=6)
    im.resize((1400, 1050), Image.LANCZOS).save(os.path.join(OUT, "haveli-door-small.webp"), "WEBP", quality=82, method=6)
    # monochrome hero, stretched to the same full tonal range as the GIFT City hero
    g = np.asarray(im.convert("L"), float)
    lo, hi = np.percentile(g, 0.5), np.percentile(g, 99.6)
    g = np.clip((g - lo) / (hi - lo), 0, 1) ** 1.12 * 255
    mono = Image.fromarray(g.astype(np.uint8)).convert("RGB")
    mono.save(os.path.join(heroes, "family-office-haveli@2x.webp"), "WEBP", quality=80, method=6)
    mono.resize((1600, 1200), Image.LANCZOS).save(os.path.join(heroes, "family-office-haveli.webp"), "WEBP", quality=80, method=6)


def brass_lit(rgb, mask):
    """Lamplight on the brass: the photo's own (sharp) texture in gold, inside the band mask, lit from below."""
    h, w = mask.shape
    ys = np.mgrid[0:h, 0:w][0] / h
    fall = np.clip((ys - 0.43) / 0.57, 0, 1) ** 2.2 * 0.9 + 0.1            # much stronger towards the step
    lum = (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]) / 255.0
    lit = np.clip((lum ** 0.9)[..., None] * np.array([1.0, 0.7, 0.34]) * 2.1, 0, 1)    # lamplight gold, the metal's own texture
    out = np.dstack([lit * 255, np.clip(mask * fall * 1.8, 0, 1) * 255]).astype(np.uint8)
    return Image.fromarray(out)


def brass_mask(rgb):
    """Brass is saturated yellow-gold; the stone is pale and the wood is dark and dull."""
    a = rgb / 255.0
    mx, mn = a.max(-1), a.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    yellow = np.clip((g - b) / np.maximum(mx - mn, 1e-6), 0, 1) * (r >= g * 0.92)
    m = np.clip((sat - 0.24) / 0.18, 0, 1) * np.clip((mx - 0.34) / 0.18, 0, 1) * yellow
    h, w = m.shape
    ys, xs = np.mgrid[0:h, 0:w]
    door = ((xs > 0.262 * w) & (xs < 0.787 * w) & (ys > 0.43 * h)).astype(float)   # the two door leaves only
    m *= np.asarray(Image.fromarray((door * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4)), float) / 255
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(3)), float) / 255
    # tarnish breaks the bands into patches; light runs along polished metal, so smooth along each band
    k = np.ones(11) / 11
    m = np.maximum(m, np.apply_along_axis(lambda r: np.convolve(r, k, "same"), 1, m) * 1.5)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.9)), float)
    a = np.zeros(rgb.shape[:2] + (4,), np.uint8)
    a[..., :3] = 255
    a[..., 3] = np.clip(m * 1.3, 0, 255).astype(np.uint8)
    return Image.fromarray(a)


def main():
    os.makedirs(OUT, exist_ok=True)
    gift = np.asarray(Image.open(os.path.join(ROOT, "images/heroes/gift-city-skyline.webp")).convert("L"), float)
    lights(gift, 0.5, (0.5, 0.95)).save(os.path.join(OUT, "gift-lights-a.webp"), "WEBP", quality=80, method=6)
    lights(gift, 0.22, (0.6, 1.0)).save(os.path.join(OUT, "gift-lights-b.webp"), "WEBP", quality=80, method=6)
    if "--haveli" in sys.argv:
        haveli_plates(sys.argv[sys.argv.index("--haveli") + 1])
    door = Image.open(os.path.join(OUT, "haveli-door.webp")).convert("RGB").resize((1600, 1200), Image.LANCZOS)
    rgb = np.asarray(door, float)
    mask = brass_mask(rgb)
    mask.save(os.path.join(OUT, "haveli-brass-mask.webp"), "WEBP", quality=80, method=6)
    brass_lit(rgb, np.asarray(mask, float)[..., 3] / 255).save(os.path.join(OUT, "haveli-brass-lit.webp"), "WEBP", quality=84, method=6)
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, "KB")


if __name__ == "__main__":
    main()
