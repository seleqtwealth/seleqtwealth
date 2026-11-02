#!/usr/bin/env python3
"""
Diwali night assets for the photo heroes (run once; outputs are committed).

  images/diwali/gift-lights-a.webp   lit office windows for the GIFT City skyline
  images/diwali/gift-lights-b.webp   a second, sparser set used for a slow twinkle
  images/diwali/jali-light-mask.webp the openings of the Sidi Saiyyed jali, used as
                                     a CSS mask so lamplight shows through the stone

Every layer has the same size and framing as its hero photo, so it lines up with
object-fit: cover and the same object-position. Window shapes come from the
photo itself: by day the glass is darker than the frames and the sky, so the
dark panes inside each tower become the windows that light up at night.

Run: python3 scripts/build-diwali-assets.py   (needs Pillow + numpy)
"""
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
    return Image.fromarray(out, "RGBA")


def jali_mask(lum):
    h, w = lum.shape
    dark = (lum < 70).astype(float)
    dens = np.asarray(Image.fromarray((dark * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(18)), float) / 255
    region = (dens > 0.28).astype(np.uint8) * 255
    region = Image.fromarray(region).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(15))
    region = np.asarray(region.filter(ImageFilter.GaussianBlur(6)), float) / 255
    ys, xs = np.mgrid[0:h, 0:w]
    arch = Image.new("L", (w, h), 0)
    pts = [(90, 530), (92, 420), (110, 330), (150, 250), (210, 190), (280, 146), (350, 124), (405, 116),
           (460, 124), (530, 146), (600, 190), (660, 250), (700, 330), (718, 420), (722, 530)]
    ImageDraw.Draw(arch).polygon([(x * w / 800, y * h / 603) for x, y in pts], fill=255)
    region *= np.asarray(arch.filter(ImageFilter.MinFilter(5)), float) / 255
    opening = np.clip((95 - lum) / 60.0, 0, 1)
    m = np.clip(opening * region, 0, 1)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), float)
    a = np.zeros((h, w, 4), np.uint8)
    a[..., :3] = 255
    a[..., 3] = m.astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def main():
    os.makedirs(OUT, exist_ok=True)
    gift = np.asarray(Image.open(os.path.join(ROOT, "images/heroes/gift-city-skyline.webp")).convert("L"), float)
    lights(gift, 0.5, (0.5, 0.95)).save(os.path.join(OUT, "gift-lights-a.webp"), "WEBP", quality=80, method=6)
    lights(gift, 0.22, (0.6, 1.0)).save(os.path.join(OUT, "gift-lights-b.webp"), "WEBP", quality=80, method=6)
    jali = np.asarray(Image.open(os.path.join(ROOT, "images/heroes/family-office-jali.webp")).convert("L"), float)
    jali_mask(jali).save(os.path.join(OUT, "jali-light-mask.webp"), "WEBP", quality=80, method=6)
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, "KB")


if __name__ == "__main__":
    main()
