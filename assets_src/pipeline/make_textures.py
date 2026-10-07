"""Procedural Age 1 textures (no third-party images): conifer frond, grass tufts, thatch.
Run: python assets_src/pipeline/make_textures.py  -> assets_src/generated/*.png"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'generated')
os.makedirs(OUT, exist_ok=True)


def frond(seed=1, W=512, H=256, S=2):
    """A fir/spruce branch seen from above: woody stem with dense needles on both sides."""
    rnd = random.Random(seed)
    img = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0, x1, cy = 8 * S, (W - 6) * S, H * S // 2
    # side twigs first
    twigs = []
    for i in range(30):
        t = 0.04 + i / 31
        sx = x0 + (x1 - x0) * t
        side = 1 if i % 2 else -1
        ang = math.radians(rnd.uniform(30, 50)) * side
        L = (H * S * 0.47) * (1 - 0.6 * t) * rnd.uniform(0.75, 1.05)
        ex, ey = sx + math.cos(ang) * L * 0.9, cy + math.sin(ang) * L
        twigs.append((sx, cy, ex, ey, 1 - 0.6 * t))
    stems = [(x0, cy, x1, cy, 1.0)] + twigs
    # needles along every stem
    for (ax, ay, bx, by, w) in stems:
        length = math.hypot(bx - ax, by - ay)
        n = int(length / (1.3 * S))
        dirx, diry = (bx - ax) / length, (by - ay) / length
        for k in range(n):
            t = k / n
            px, py = ax + (bx - ax) * t, ay + (by - ay) * t
            for side in (-1, 1):
                a = math.atan2(diry, dirx) + side * math.radians(rnd.uniform(50, 75))
                nl = S * rnd.uniform(11, 19) * (0.55 + 0.45 * w) * (1 - 0.35 * t)
                g = rnd.uniform(0.55, 1.0)
                col = (int(28 * g + rnd.uniform(0, 12)), int(58 * g + rnd.uniform(0, 18)), int(26 * g + rnd.uniform(0, 8)), 255)
                d.line([(px, py), (px + math.cos(a) * nl, py + math.sin(a) * nl)], fill=col, width=max(1, int(1.6 * S)))
    for (ax, ay, bx, by, w) in stems:
        d.line([(ax, ay), (bx, by)], fill=(70, 50, 32, 255), width=max(1, int(S * 2.5 * w)))
    img = img.resize((W, H), Image.LANCZOS)
    return img


def tuft(seed=3, dry=False, W=256, H=256, S=2):
    """Grass clump: blades rising from the bottom centre, slightly curved."""
    rnd = random.Random(seed)
    img = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for _ in range(140 if not dry else 110):
        bx = W * S * (0.5 + rnd.gauss(0, 0.13))
        h = H * S * rnd.uniform(0.45, 0.97)
        lean = rnd.gauss(0, 0.35)
        pts = []
        for k in range(9):
            t = k / 8
            pts.append((bx + lean * h * t * t * 0.6, H * S - h * t))
        if dry:
            g = rnd.uniform(0.6, 1.0)
            base = (int(150 * g), int(128 * g), int(70 * g))
            tip = (int(205 * g), int(182 * g), int(118 * g))
        else:
            g = rnd.uniform(0.55, 1.0)
            base = (int(40 * g), int(70 * g), int(24 * g))
            tip = (int(120 * g), int(140 * g), int(60 * g)) if rnd.random() < 0.35 else (int(70 * g), int(110 * g), int(38 * g))
        for k in range(8):
            t = k / 7
            col = tuple(int(base[i] + (tip[i] - base[i]) * t) for i in range(3)) + (255,)
            wdt = max(1, int(S * 3.2 * (1 - 0.85 * t)))
            d.line([pts[k], pts[k + 1]], fill=col, width=wdt)
    img = img.resize((W, H), Image.LANCZOS)
    return img


def thatch(seed=5, W=512, H=512):
    """Bundled straw/reed thatch, strokes running down the roof."""
    rnd = np.random.default_rng(seed)
    img = Image.new('RGB', (W, H), (92, 76, 44))
    d = ImageDraw.Draw(img)
    r = random.Random(seed)
    for _ in range(9000):
        x = r.uniform(0, W)
        y = r.uniform(-20, H)
        L = r.uniform(18, 60)
        g = r.uniform(0.55, 1.15)
        col = (min(255, int(150 * g)), min(255, int(124 * g)), min(255, int(72 * g)))
        d.line([(x, y), (x + r.uniform(-3, 3), y + L)], fill=col, width=r.choice((1, 1, 2)))
    # horizontal binding bands
    for yb in range(40, H, 128):
        d.rectangle([0, yb, W, yb + 6], fill=(70, 55, 32))
    arr = np.asarray(img).astype(np.float32)
    arr *= (0.85 + 0.3 * rnd.random((H, W, 1)))
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).filter(ImageFilter.SMOOTH)


if __name__ == '__main__':
    frond(1).save(os.path.join(OUT, 'conifer_frond_a.png'))
    frond(7).save(os.path.join(OUT, 'conifer_frond_b.png'))
    tuft(3).save(os.path.join(OUT, 'grass_tuft_green.png'))
    tuft(11, dry=True).save(os.path.join(OUT, 'grass_tuft_dry.png'))
    thatch().save(os.path.join(OUT, 'thatch.png'))
    print('ok', os.listdir(OUT))
