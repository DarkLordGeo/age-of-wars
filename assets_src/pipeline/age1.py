"""Age 1 (Stone Age) models built in Blender from simple geometry + CC0/procedural textures.
Runs inside Blender (via the MCP). Every build_* function exports one GLB to public/models/age1/.

Textures used (all local):
  bark   : Poly Haven fir_sapling_medium branches (CC0)      -> conifer trunks
  log    : Poly Haven dead_tree_trunk (CC0)                   -> palisade, huts, tower, piles
  stone  : Poly Haven boulder_01 (CC0)                        -> stone piles, tools, hearths
  gear   : procedural atlas from the Soldier (leather/fur/rope/dark leather)
  team   : procedural TeamColor cloth (recoloured per team at runtime)
  frond / grass / thatch : procedural (assets_src/pipeline/make_textures.py)
"""
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

PROJ = r"C:\Users\mrerg\Desktop\AgeOfWars"
SRC = os.path.join(PROJ, "assets_src")
GEN = os.path.join(SRC, "generated")
OUT = os.path.join(PROJ, "public", "models", "age1")
GEAR = os.path.join(GEN, "gear_atlas.png")      # copied from the Soldier build
TEAM = os.path.join(GEN, "teamcolor_cloth.png")
GRID = 4
LEATHER, DARK, FUR, WOOD, STONE, HAIR, ROPE, BONE = range(8)


# ------------------------------------------------------------------ scene / materials
def scene():
    sc = bpy.data.scenes.get("age1") or bpy.data.scenes.new("age1")
    bpy.context.window.scene = sc
    return sc


def clear():
    sc = scene()
    for o in list(sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def _img(path, noncolor=False):
    im = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        im.colorspace_settings.name = 'Non-Color'
    return im


_MATS = {}


def mat(name, diff, nrm=None, rough=0.9, alpha=False, color=None):
    if name in _MATS and _MATS[name].name in bpy.data.materials:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = 0.0
    if diff:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = _img(diff)
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
        if alpha:
            nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    if color:
        b.inputs['Base Color'].default_value = (*color, 1)
    if nrm:
        t2 = nt.nodes.new('ShaderNodeTexImage'); t2.image = _img(nrm, True)
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 0.8
        nt.links.new(t2.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    _MATS[name] = m
    return m


def P(*parts):
    return os.path.join(SRC, *parts)


def M_bark():
    return mat("Bark", P("polyhaven", "fir_sapling_medium", "textures", "fir_sapling_medium_branches_diff_1k.jpg"),
               P("polyhaven", "fir_sapling_medium", "textures", "fir_sapling_medium_branches_nor_gl_1k.jpg"), 0.95)


def M_log():
    return mat("Log", P("polyhaven", "dead_tree_trunk", "textures", "dead_tree_trunk_diff_1k.jpg"),
               P("polyhaven", "dead_tree_trunk", "textures", "dead_tree_trunk_nor_gl_1k.jpg"), 0.9)


def M_stone():
    return mat("Stone", P("polyhaven", "boulder_01", "textures", "boulder_01_diff_1k.jpg"),
               P("polyhaven", "boulder_01", "textures", "boulder_01_nor_gl_1k.jpg"), 0.95)


def M_frond(v='a'):
    return mat(f"Needles_{v}", os.path.join(GEN, f"conifer_frond_{v}.png"), None, 0.85, alpha=True)


def M_grass(kind):
    return mat(f"Grass_{kind}", os.path.join(GEN, f"grass_tuft_{kind}.png"), None, 0.9, alpha=True)


def M_thatch():
    return mat("Thatch", os.path.join(GEN, "thatch.png"), None, 0.95)


def M_gear():
    return mat("Gear", GEAR, None, 0.85)


def M_team():
    return mat("TeamColor", TEAM, None, 0.9)


def M_dark():
    return mat("Shadow", None, None, 1.0, color=(0.02, 0.018, 0.015))


def tile(t):
    tx, ty = t % GRID, t // GRID
    m = 0.03 / GRID
    return (tx / GRID + m, ty / GRID + m, (tx + 1) / GRID - m, (ty + 1) / GRID - m)


# ------------------------------------------------------------------ mesh builder
class B:
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.mats = []
        self.custom = {}   # vert -> custom normal

    def slot(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def face(self, verts, uvs, m, smooth=True):
        f = self.bm.faces.new(verts)
        f.material_index = self.slot(m)
        f.smooth = smooth
        for l, uv in zip(f.loops, uvs):
            l[self.uv].uv = uv
        return f

    def log(self, p0, p1, r0, r1=None, m=None, segs=7, tip=0.0, cap=True, vscale=1.5, rect=None, rough=0.0, rng=None):
        """Tapered cylinder p0->p1 (optional pointed tip). UVs wrap around (u) and run along (v)."""
        r1 = r0 if r1 is None else r1
        p0, p1 = Vector(p0), Vector(p1)
        ax = (p1 - p0)
        L = ax.length
        d = ax.normalized()
        a = d.orthogonal().normalized()
        b2 = d.cross(a).normalized()
        rings = []
        ts = [0.0, 0.5, 1.0] if L > 1.2 else [0.0, 1.0]
        for t in ts:
            c = p0 + ax * t
            r = r0 + (r1 - r0) * t
            ring = []
            for i in range(segs):
                ang = 2 * math.pi * i / segs
                jr = r * (1 + (rng.uniform(-rough, rough) if rng else 0))
                ring.append(self.bm.verts.new(c + (a * math.cos(ang) + b2 * math.sin(ang)) * jr))
            rings.append((ring, t * L))
        u0, v0, u1, v1 = rect or (0, 0, 1, 1)
        fit = rect is not None

        def U(i):
            return u0 + (u1 - u0) * (i / segs)

        def V(l):
            return v0 + (v1 - v0) * min(1.0, l / L) if fit else l / vscale

        for (ra, la), (rb, lb) in zip(rings, rings[1:]):
            for i in range(segs):
                j = (i + 1) % segs
                self.face([ra[i], ra[j] if j else ra[0], rb[j], rb[i]],
                          [(U(i), V(la)), (U(i + 1), V(la)), (U(i + 1), V(lb)), (U(i), V(lb))], m)
        if tip > 0:
            apex = self.bm.verts.new(p1 + d * tip)
            ra = rings[-1][0]
            for i in range(segs):
                j = (i + 1) % segs
                self.face([ra[i], ra[j], apex], [(U(i), V(L)), (U(i + 1), V(L)), ((U(i) + U(i + 1)) / 2, V(L) + 0.15)], m)
        elif cap:
            ra = rings[-1][0]
            self.face(list(ra), [(0.5 + 0.4 * math.cos(2 * math.pi * i / segs), 0.5 + 0.4 * math.sin(2 * math.pi * i / segs)) for i in range(segs)], m, smooth=False)
        if cap:
            ra = rings[0][0]
            self.face(list(reversed(ra)), [(0.5, 0.5)] * segs, m, smooth=False)

    def card(self, spine, widths, side, m, up_normal=None, uvs_rect=(0, 0, 1, 1), normal_fn=None):
        """A bent strip along `spine` (list of points), width along `side` (vector or per-point list)."""
        n = len(spine)
        u0, v0, u1, v1 = uvs_rect
        left, right = [], []
        for k, p in enumerate(spine):
            s = side[k] if isinstance(side, list) else side
            w = widths[k]
            vl = self.bm.verts.new(Vector(p) + s * (w / 2))
            vr = self.bm.verts.new(Vector(p) - s * (w / 2))
            left.append(vl); right.append(vr)
            if normal_fn:
                self.custom[vl] = normal_fn(vl.co); self.custom[vr] = normal_fn(vr.co)
        for k in range(n - 1):
            t0, t1 = k / (n - 1), (k + 1) / (n - 1)
            self.face([right[k], right[k + 1], left[k + 1], left[k]],
                      [(u0 + (u1 - u0) * t0, v0), (u0 + (u1 - u0) * t1, v0), (u0 + (u1 - u0) * t1, v1), (u0 + (u1 - u0) * t0, v1)], m)

    def rock(self, c, size, m, seed=0, sub=1, flat=0.7):
        rng = random.Random(seed)
        r = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=1.0)
        vs = r['verts']
        for v in vs:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2] * flat)) * (1 + rng.uniform(-0.18, 0.18))
            v.co += Vector(c)
        fs = {f for v in vs for f in v.link_faces}
        for f in fs:
            f.material_index = self.slot(m)
            f.smooth = False
            for l in f.loops:
                co = l.vert.co
                l[self.uv].uv = (co.x * 0.6 + co.z * 0.3, co.y * 0.6 + co.z * 0.3)

    def cone(self, c, r, h, m, segs=14, open_top=0.0, uv_scale=(2.0, 1.0), skirt=0.0):
        """Conical roof/tent shell (outside facing), UV: u around, v down the slope."""
        c = Vector(c)
        base = [self.bm.verts.new(c + Vector((math.cos(2 * math.pi * i / segs) * r, math.sin(2 * math.pi * i / segs) * r, -skirt))) for i in range(segs)]
        rt = r * open_top
        top = [self.bm.verts.new(c + Vector((math.cos(2 * math.pi * i / segs) * rt, math.sin(2 * math.pi * i / segs) * rt, h))) for i in range(segs)]
        for i in range(segs):
            j = (i + 1) % segs
            self.face([base[i], base[j], top[j], top[i]],
                      [(uv_scale[0] * i / segs, 0), (uv_scale[0] * (i + 1) / segs, 0), (uv_scale[0] * (i + 1) / segs, uv_scale[1]), (uv_scale[0] * i / segs, uv_scale[1])], m)
        return base, top

    def finish(self, name):
        me = bpy.data.meshes.new(name)
        self.bm.normal_update()
        cust = self.custom
        idx = {v: i for i, v in enumerate(self.bm.verts)}
        self.bm.to_mesh(me)
        for mm in self.mats:
            me.materials.append(mm)
        if cust:
            normals = [tuple(v.normal) for v in me.vertices]
            for v, nrm in cust.items():
                normals[idx[v]] = tuple(Vector(nrm).normalized())
            me.normals_split_custom_set_from_vertices(normals)
        self.bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def ground(ob):
    vs = [v.co for v in ob.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    ob.data.transform(Matrix.Translation((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)))


def shrink(size):
    for im in bpy.data.images:
        if im.users and im.size[0] > size:
            im.scale(size, max(1, int(im.size[1] * size / im.size[0])))


def export(objs, name, fmt='AUTO'):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_image_format=fmt, export_image_quality=82, export_animations=False,
                              export_skins=False, export_extras=False, export_normals=True)
    tris = 0
    for o in objs:
        o.data.calc_loop_triangles(); tris += len(o.data.loop_triangles)
    return name, len(objs), tris, os.path.getsize(path) // 1000


# ------------------------------------------------------------------ vegetation
def conifer(name, seed, H, base_r, crown0, whorls, nb0, Lmax, frond='a', dead_low=0):
    rng = random.Random(seed)
    b = B()
    bark, needles = M_bark(), M_frond(frond)
    b.log((0, 0, -0.3), (0, 0, H * 0.96), base_r, 0.035, bark, segs=8, cap=False, vscale=1.6)
    # root flare
    for i in range(5):
        ang = 2 * math.pi * i / 5 + rng.uniform(-0.3, 0.3)
        b.log((0, 0, 0.35), (math.cos(ang) * base_r * 2.6, math.sin(ang) * base_r * 2.6, -0.1), base_r * 0.45, base_r * 0.15, bark, segs=5, cap=False, vscale=1.0)

    def nfn(p):
        rad = Vector((p.x, p.y, 0))
        return (rad.normalized() * 0.55 if rad.length > 1e-4 else Vector()) + Vector((0, 0, 0.9))

    for k in range(whorls):
        t = k / (whorls - 1)
        h = crown0 + (H * 0.93 - crown0) * t + rng.uniform(-0.15, 0.15)
        L = Lmax * (1 - t) ** 0.85 + 0.35
        nb = max(3, round(nb0 - (nb0 - 4) * t))
        tr = base_r * (1 - h / H) + 0.04
        for j in range(nb):
            yaw = j * 2 * math.pi / nb + k * 0.77 + rng.uniform(-0.25, 0.25)
            dvec = Vector((math.cos(yaw), math.sin(yaw), 0))
            droop = rng.uniform(0.12, 0.3) + 0.1 * (1 - t)
            dead = k < dead_low
            spine = []
            for s in range(4):
                u = s / 3
                spine.append(dvec * (tr + L * u) + Vector((0, 0, h + 0.15 * L * u - droop * L * u * u)))
            side = Vector((0, 0, 1)).cross(dvec).normalized()
            if dead:
                b.log(spine[0], spine[-1], 0.03, 0.01, bark, segs=4, cap=False)
                continue
            w = L * 0.78
            b.card(spine, [w * 0.55, w, w * 0.9, w * 0.45], side, needles, normal_fn=nfn)
            side3 = (side * math.cos(-0.9) + Vector((0, 0, 1)) * math.sin(-0.9)).normalized()
            sp3 = [p + Vector((0, 0, 0.06 * L)) for p in spine]
            b.card(sp3, [w * 0.35, w * 0.7, w * 0.6, w * 0.25], side3, needles, normal_fn=nfn)
            # a second, rolled card under the first gives the branch volume from low angles
            side2 = (side * math.cos(1.1) + Vector((0, 0, 1)) * math.sin(1.1)).normalized()
            sp2 = [p - Vector((0, 0, 0.08 * L)) for p in spine]
            b.card(sp2, [w * 0.4, w * 0.75, w * 0.65, w * 0.3], side2, needles, normal_fn=nfn)
    # leader
    top = H * 0.96
    for ang in (0, math.pi / 2):
        s = Vector((math.cos(ang), math.sin(ang), 0))
        b.card([Vector((0, 0, top - 1.2)), Vector((0, 0, top - 0.5)), Vector((0, 0, top + 0.25))], [0.8, 0.55, 0.12], s, needles,
               uvs_rect=(0, 0, 1, 1), normal_fn=lambda p: Vector((0, 0, 1)))
    ob = b.finish(name)
    ground(ob)
    return ob


def dead_tree(name, seed, H):
    rng = random.Random(seed)
    b = B()
    bark = M_bark()
    b.log((0, 0, -0.3), (0.2, 0.1, H), 0.26, 0.04, bark, segs=8, cap=False, vscale=1.6, rough=0.08, rng=rng)
    for i in range(5):
        ang = 2 * math.pi * i / 5 + rng.uniform(-0.3, 0.3)
        b.log((0, 0, 0.35), (math.cos(ang) * 0.75, math.sin(ang) * 0.75, -0.1), 0.12, 0.04, bark, segs=5, cap=False)
    for k in range(9):
        h = H * (0.35 + 0.6 * k / 9)
        yaw = rng.uniform(0, 2 * math.pi)
        L = (H - h) * 0.45 + 0.4
        p0 = Vector((0.2 * h / H, 0.1 * h / H, h))
        p1 = p0 + Vector((math.cos(yaw) * L, math.sin(yaw) * L, L * rng.uniform(0.1, 0.6)))
        b.log(p0, p1, 0.07 * (1 - h / H) + 0.02, 0.012, bark, segs=5, cap=False)
    ob = b.finish(name)
    ground(ob)
    return ob


def tuft(name, kind, w, h, seed=0, n=3):
    rng = random.Random(seed)
    b = B()
    m = M_grass(kind)
    for i in range(n):
        ang = math.pi * i / n + rng.uniform(-0.2, 0.2)
        s = Vector((math.cos(ang), math.sin(ang), 0))
        lean = Vector((-s.y, s.x, 0)) * rng.uniform(-0.12, 0.12)
        b.card([Vector((0, 0, 0)), lean * h * 0.5 + Vector((0, 0, h * 0.5)), lean * h + Vector((0, 0, h))], [w, w * 1.04, w * 1.08], s, m,
               uvs_rect=(0, 0, 1, 1), normal_fn=lambda p: Vector((0, 0, 1)))
    # card UVs run along the spine (u) -> rotate so the texture's bottom sits on the ground
    ob = b.finish(name)
    for loop in ob.data.loops:
        pass
    uv = ob.data.uv_layers[0]
    for d in uv.data:
        u, v = d.uv
        d.uv = (v, u)
    ground(ob)
    return ob


def build_vegetation():
    clear()
    objs = [
        conifer("conifer_01", 1, 13.0, 0.32, 2.2, 22, 8, 3.2, 'a', dead_low=2),
        conifer("conifer_02", 2, 9.5, 0.26, 1.0, 18, 8, 2.8, 'b', dead_low=1),
        conifer("conifer_03", 3, 6.5, 0.17, 0.5, 14, 7, 2.0, 'a'),
        dead_tree("dead_tree_01", 4, 8.0),
    ]
    shrink(512)
    r1 = export(objs, "trees_kit")
    clear()
    objs = [tuft("grass_green_a", "green", 0.7, 0.55, 1), tuft("grass_green_b", "green", 1.0, 0.8, 2, n=4),
            tuft("grass_dry_a", "dry", 0.8, 0.65, 3), tuft("grass_dry_b", "dry", 0.55, 0.45, 4)]
    r2 = export(objs, "grass_kit")
    return r1, r2
