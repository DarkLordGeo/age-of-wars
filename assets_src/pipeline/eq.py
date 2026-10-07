import bpy, bmesh, math, random, os
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc

SCR = os.path.dirname(os.path.abspath(__file__))
GRID = 4
TILE = 256
# atlas tile slots
LEATHER, DARK, FUR, WOOD, STONE, HAIR, ROPE, BONE = range(8)


# ---------------------------------------------------------------- textures
def _noise(rng, n, gy, gx):
    g = rng.random((gy, gx))
    ys = np.linspace(0, gy, n, endpoint=False)
    xs = np.linspace(0, gx, n, endpoint=False)
    y0 = np.floor(ys).astype(int); fy = (ys - y0)[:, None]
    x0 = np.floor(xs).astype(int); fx = (xs - x0)[None, :]
    y1 = (y0 + 1) % gy; x1 = (x0 + 1) % gx
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]; b = g[y0][:, x1]; c = g[y1][:, x0]; d = g[y1][:, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(rng, n, octs, aniso=(1, 1)):
    out = np.zeros((n, n)); amp = 1.0; tot = 0.0
    for g in octs:
        out += amp * _noise(rng, n, max(2, g * aniso[0]), max(2, g * aniso[1])); tot += amp; amp *= 0.55
    return out / tot


def _col(c, v):
    return np.array(c)[None, None, :] * v[:, :, None]


def make_tile(kind, n=TILE, seed=1):
    rng = np.random.default_rng(seed)
    if kind == LEATHER:
        v = 0.75 + 0.5 * fbm(rng, n, [3, 6, 12, 48])
        v *= 1 - 0.22 * (np.abs(fbm(rng, n, [6, 14]) - 0.5) < 0.02)
        v += (rng.random((n, n)) - 0.5) * 0.08
        return _col((0.36, 0.22, 0.12), v)
    if kind == DARK:
        v = 0.6 + 0.8 * fbm(rng, n, [3, 8, 32])
        v += (rng.random((n, n)) - 0.5) * 0.08
        return _col((0.19, 0.115, 0.07), v)
    if kind == FUR:
        base = 0.65 + 0.7 * fbm(rng, n, [3, 6], (1, 1))
        streak = fbm(rng, n, [4, 8], (1, 24))
        spots = fbm(rng, n, [5, 10])
        col = _col((0.50, 0.37, 0.22), base * (0.7 + 0.6 * streak))
        dark = (spots > 0.62)[:, :, None]
        col = np.where(dark, col * 0.45, col)
        cream = (fbm(rng, n, [8], (1, 20)) > 0.62)[:, :, None]
        col = np.where(cream, col * 1.35 + 0.03, col)
        return col
    if kind == WOOD:
        v = 0.55 + 0.8 * fbm(rng, n, [2, 4], (16, 1)) * 0.7 + 0.5 * fbm(rng, n, [3], (40, 1)) * 0.3
        return _col((0.47, 0.32, 0.17), v)
    if kind == STONE:
        v = 0.55 + 0.9 * fbm(rng, n, [4, 16, 64])
        v *= 1 + 0.35 * (rng.random((n, n)) > 0.985)
        return _col((0.30, 0.30, 0.31), v)
    if kind == HAIR:
        v = 0.5 + 0.9 * fbm(rng, n, [3, 6], (1, 1)) * 0.5 + 0.8 * fbm(rng, n, [3], (3, 40)) * 0.5
        return _col((0.12, 0.08, 0.05), v)
    if kind == ROPE:
        u = np.linspace(0, 1, n)[None, :]; w = np.linspace(0, 1, n)[:, None]
        v = 0.7 + 0.3 * np.sin((u + w) * 2 * math.pi * 14) + (fbm(rng, n, [8, 32]) - 0.5) * 0.3
        return _col((0.62, 0.50, 0.32), v)
    if kind == BONE:
        v = 0.85 + 0.2 * fbm(rng, n, [3, 10])
        return _col((0.78, 0.72, 0.58), v)
    raise ValueError(kind)


def build_atlas(name="gear_atlas"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    N = GRID * TILE
    px = np.ones((N, N, 4), dtype=np.float32)
    for k in range(8):
        tx, ty = k % GRID, k // GRID
        t = np.clip(make_tile(k, seed=10 + k), 0, 1)
        px[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE, :3] = t
    for k in range(8, GRID * GRID):
        tx, ty = k % GRID, k // GRID
        px[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE, :3] = 0.3
    img = bpy.data.images.new(name, N, N, alpha=False)
    img.pixels.foreach_set(px.ravel())
    path = os.path.join(SCR, name + ".png")
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    img.pack()
    return img


def build_cloth(name="teamcolor_cloth"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    n = 256
    rng = np.random.default_rng(99)
    u = np.linspace(0, 1, n)[None, :]; w = np.linspace(0, 1, n)[:, None]
    weave = 0.5 + 0.5 * np.sin(u * 2 * math.pi * 48) * np.sin(w * 2 * math.pi * 48)
    v = 0.80 + 0.10 * weave + 0.12 * (fbm(rng, n, [4, 16]) - 0.5)
    px = np.ones((n, n, 4), dtype=np.float32)
    px[:, :, :3] = np.clip(v, 0, 1)[:, :, None]
    img = bpy.data.images.new(name, n, n, alpha=False)
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = os.path.join(SCR, name + ".png"); img.file_format = 'PNG'; img.save(); img.pack()
    return img


def make_mat(name, img, rough=0.8):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = 0.0
    return m


# ---------------------------------------------------------------- geometry
def loft(rings, segs=12, cap_start=False, cap_end=False):
    """rings: list of (center, a, b, ra, rb); ordered along +(a x b). Open shell unless capped."""
    bm = bmesh.new()
    vr = []
    for c, a, b, ra, rb in rings:
        row = []
        for i in range(segs):
            t = 2 * math.pi * i / segs
            row.append(bm.verts.new(c + a * (math.cos(t) * ra) + b * (math.sin(t) * rb)))
        vr.append(row)
    for j in range(len(vr) - 1):
        for i in range(segs):
            i2 = (i + 1) % segs
            bm.faces.new((vr[j][i], vr[j][i2], vr[j + 1][i2], vr[j + 1][i]))
    if cap_start:
        bm.faces.new(list(reversed(vr[0])))
    if cap_end:
        bm.faces.new(vr[-1])
    return bm


def ring(c, ra, rb, axis='z'):
    c = Vector(c)
    if axis == 'z':
        return (c, Vector((1, 0, 0)), Vector((0, 1, 0)), ra, rb)
    if axis == 'y':   # a x b = +Y
        return (c, Vector((0, 0, 1)), Vector((1, 0, 0)), ra, rb)
    if axis == 'x':
        return (c, Vector((0, 1, 0)), Vector((0, 0, 1)), ra, rb)
    raise ValueError(axis)


def box_uv(bm, tile, mpt=0.25, custom=None, grid=GRID):
    """Box-project UVs into one atlas tile. mpt = metres covered by one tile."""
    uv = bm.loops.layers.uv.verify()
    tx, ty = tile % grid, tile // grid
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        i1, i2 = [(1, 2), (0, 2), (0, 1)][ax]
        raw = [((l.vert.co[i1]) / mpt, (l.vert.co[i2]) / mpt) if custom is None else custom(l.vert.co, ax) for l in f.loops]
        mu = sum(r[0] for r in raw) / len(raw); mv = sum(r[1] for r in raw) / len(raw)
        fu, fv = math.floor(mu), math.floor(mv)
        for l, r in zip(f.loops, raw):
            u = min(max(r[0] - fu, 0.03), 0.97); v = min(max(r[1] - fv, 0.03), 0.97)
            l[uv].uv = ((tx + u) / grid, (ty + v) / grid)


def body_bvh(body):
    bm = bmesh.new(); bm.from_mesh(body.data)
    return BVHTree.FromBMesh(bm), bm


def body_weights_at(body, bvh, p):
    loc, nrm, idx, dist = bvh.find_nearest(p)
    poly = body.data.polygons[idx]
    vs = [body.data.vertices[i] for i in poly.vertices]
    bw = poly_3d_calc([v.co for v in vs], loc)
    acc = {}
    for v, w in zip(vs, bw):
        for g in v.groups:
            acc[g.group] = acc.get(g.group, 0) + g.weight * w
    return acc


def new_object(name, bm, mat=None, link=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if mat is not None:
        me.materials.append(mat)
    return ob


def ensure_groups(ob, body):
    for vg in body.vertex_groups:
        if vg.name not in ob.vertex_groups:
            ob.vertex_groups.new(name=vg.name)


def skin_nearest(ob, body, bvh):
    ensure_groups(ob, body)
    names = {vg.index: vg.name for vg in body.vertex_groups}
    for v in ob.data.vertices:
        acc = body_weights_at(body, bvh, v.co)
        items = sorted(acc.items(), key=lambda kv: -kv[1])[:4]
        tot = sum(w for _, w in items) or 1
        for g, w in items:
            if w / tot > 0.005:
                ob.vertex_groups[names[g]].add([v.index], w / tot, 'REPLACE')


def skin_manual(ob, body, fn):
    """fn(co) -> {bone_name: weight}"""
    ensure_groups(ob, body)
    for v in ob.data.vertices:
        d = fn(v.co)
        tot = sum(d.values()) or 1
        for k, w in d.items():
            if w / tot > 0.005:
                ob.vertex_groups[k].add([v.index], w / tot, 'REPLACE')


def shell_from_body(body, pred, offset, name, mat, tile, mpt=0.25, jitter=0.0, seed=0, grid=GRID):
    """Duplicate body faces whose centre passes pred(centre) and push them out along vertex normals."""
    bm = bmesh.new(); bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    kill = [f for f in bm.faces if not pred(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    rnd = random.Random(seed)
    for v in bm.verts:
        v.co += v.normal * (offset + (rnd.random() - 0.5) * jitter)
    box_uv(bm, tile, mpt, grid=grid)
    ob = new_object(name, bm, mat)
    ensure_groups(ob, body)
    return ob
