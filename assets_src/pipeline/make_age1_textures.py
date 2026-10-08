"""Game-ready Age 1 textures -> public/textures/age1/.

Run: python assets_src/pipeline/make_age1_textures.py
(needs Pillow + numpy; run make_textures.py first for the frond/grass/thatch sources)

- Ground: Poly Haven CC0 diffuse maps (assets_src/polyhaven_textures) downsized to 512 px.
- Conifer fronds/thatch: copies of assets_src/generated/* (original, procedural).
- Grass tufts: procedural here, tuned for RTS distance (airy, bright tips).
- Bark, log wood, hide, wattle: procedural here (original work, no third-party images).
"""
import os
import shutil

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SRC_PH = os.path.join(ROOT, 'assets_src', 'polyhaven_textures')
SRC_GEN = os.path.join(ROOT, 'assets_src', 'generated')
OUT = os.path.join(ROOT, 'public', 'textures', 'age1')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1)


def save_jpg(arr, name, q=86):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name), quality=q, optimize=True)


def tileable_noise(size, scale, octaves=4, seed=0):
    """Periodic value noise in [0,1] built from wrapped, upsampled random grids."""
    r = np.random.default_rng(seed)
    acc = np.zeros((size, size))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = max(2, int(scale * 2 ** o))
        grid = r.random((n, n))
        img = Image.fromarray((grid * 255).astype(np.uint8)).resize((n * 4, n * 4), Image.BICUBIC)
        # wrap: tile 3x3 then crop the centre so edges match, then resize to size
        big = np.tile(np.asarray(img, dtype=float) / 255, (3, 3))
        c = big[n * 4: n * 8, n * 4: n * 8]
        layer = np.asarray(Image.fromarray((c * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC), dtype=float) / 255
        acc += layer * amp
        tot += amp
        amp *= 0.5
    return acc / tot


def ground():
    for name in ['leafy_grass', 'dirt_floor', 'rocky_trail_02', 'brown_mud_dry']:
        src = os.path.join(SRC_PH, name, f'{name}_diff_1k.jpg')
        Image.open(src).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, f'ground_{name}.jpg'), quality=86, optimize=True)


def copies():
    for f in ['conifer_frond_a.png', 'conifer_frond_b.png']:
        shutil.copy(os.path.join(SRC_GEN, f), os.path.join(OUT, f))
    Image.open(os.path.join(SRC_GEN, 'thatch.png')).convert('RGB').resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, 'thatch.jpg'), quality=86)


def bark(size=256):
    """Rough conifer bark: vertical plates and fissures. Tiles in both directions."""
    x = np.linspace(0, 1, size, endpoint=False)
    n_cols = tileable_noise(size, 6, 4, seed=3)
    n_fine = tileable_noise(size, 24, 3, seed=4)
    # vertical fissures: stretch noise vertically
    fiss = np.asarray(Image.fromarray((tileable_noise(size, 10, 3, seed=5) * 255).astype(np.uint8)).resize((size, size // 8)).resize((size, size), Image.BICUBIC), dtype=float) / 255
    plates = np.abs(np.sin((x[None, :] * 9 + fiss * 1.6) * np.pi))
    speck = rng.random((size, size))
    v = 0.25 + 0.55 * np.clip(plates * 1.6, 0, 1) ** 0.7 + 0.25 * n_fine - 0.2 * n_cols + 0.12 * (speck - 0.5)
    base = np.array([92, 66, 46], dtype=float)
    col = base[None, None, :] * (0.55 + 0.75 * v[..., None])
    col[..., 2] *= 0.95
    save_jpg(col, 'bark.jpg')


def log_wood(size=256):
    """Debarked log/pole: pale wood with long grain and a few knots and bark scraps (U along length)."""
    y = np.linspace(0, 1, size, endpoint=False)
    grain_n = tileable_noise(size, 8, 3, seed=7)
    grain = 0.5 + 0.5 * np.sin((y[:, None] * 40 + grain_n * 6) * np.pi)
    scraps = tileable_noise(size, 5, 4, seed=8)
    v = 0.75 + 0.18 * grain + 0.1 * tileable_noise(size, 30, 2, seed=9)
    col = np.array([150, 116, 78], dtype=float)[None, None, :] * v[..., None]
    bark_mask = np.clip((scraps - 0.62) * 8, 0, 1)[..., None]
    col = col * (1 - bark_mask) + np.array([70, 50, 36], dtype=float)[None, None, :] * bark_mask * (0.8 + 0.4 * grain_n[..., None])
    save_jpg(col, 'log.jpg')


def hide(size=256):
    """Tanned animal hide: tan/brown mottling, faint wrinkles, darker stitched seams."""
    n1 = tileable_noise(size, 4, 5, seed=11)
    n2 = tileable_noise(size, 16, 3, seed=12)
    wr = np.abs(tileable_noise(size, 9, 2, seed=13) - 0.5) * 2
    v = 0.78 + 0.25 * (n1 - 0.5) + 0.1 * (n2 - 0.5) - 0.12 * (wr < 0.08)
    col = np.array([168, 128, 88], dtype=float)[None, None, :] * v[..., None]
    # seams every quarter, with stitch dashes
    yy, xx = np.mgrid[0:size, 0:size]
    seam = (np.abs((xx % (size // 2)) - 2) < 2)
    col[seam] *= 0.6
    stitch = (np.abs((xx % (size // 2)) - 5) < 1) & ((yy // 6) % 2 == 0)
    col[stitch] = [70, 50, 32]
    save_jpg(col, 'hide.jpg')


def wattle(size=256):
    """Wattle-and-daub wall: horizontal woven withies under patchy clay daub."""
    yy, xx = np.mgrid[0:size, 0:size] / size
    weave = 0.5 + 0.5 * np.sin(yy * 2 * np.pi * 10 + np.sin(xx * 2 * np.pi * 8) * 1.2)
    clay_n = tileable_noise(size, 5, 5, seed=21)
    daub = np.clip((clay_n - 0.42) * 5, 0, 1)
    wood = np.array([112, 84, 56], dtype=float) * (0.65 + 0.45 * weave[..., None])
    clay = np.array([150, 128, 98], dtype=float) * (0.8 + 0.3 * tileable_noise(size, 20, 2, seed=22)[..., None])
    col = wood * (1 - daub[..., None]) + clay * daub[..., None]
    save_jpg(col, 'wattle.jpg')


def grass_tuft(name, base_col, tip_col, seed, blades=34, size=256, S=3):
    """A grass tuft made for RTS viewing distance: fewer, wider blades, dark roots fading to
    bright tips, clear gaps between blades (so minified mips stay airy instead of a dark blob)."""
    from PIL import ImageDraw
    r = np.random.default_rng(seed)
    W = size * S
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    order = sorted(range(blades), key=lambda _: r.random())
    for _ in order:
        x0 = W * (0.5 + r.normal(0, 0.13))
        h = W * r.uniform(0.45, 0.97)
        lean = r.normal(0, 0.22) * h
        width = W * r.uniform(0.012, 0.022)
        steps = 14
        shade = r.uniform(0.8, 1.15)
        for k in range(steps):
            t0, t1 = k / steps, (k + 1) / steps
            def pt(t):
                return (x0 + lean * t * t, W - h * t)
            (ax, ay), (bx, by) = pt(t0), pt(t1)
            w0, w1 = width * (1 - t0 * 0.9), width * (1 - t1 * 0.9)
            c = [int(min(255, (base_col[i] + (tip_col[i] - base_col[i]) * t0 ** 0.8) * shade)) for i in range(3)]
            d.polygon([(ax - w0, ay), (ax + w0, ay), (bx + w1, by), (bx - w1, by)], fill=(*c, 255))
    img = img.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(OUT, name), optimize=True)


if __name__ == '__main__':
    ground()
    copies()
    bark()
    log_wood()
    hide()
    wattle()
    grass_tuft('grass_tuft_green.png', (58, 82, 28), (176, 196, 92), seed=31)
    grass_tuft('grass_tuft_dry.png', (110, 98, 52), (226, 208, 140), seed=32)
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)))
