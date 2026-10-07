import bpy, bmesh, math, random
from mathutils import Vector
import eq
from eq import *


def _box(bm, c, sx, sy, sz):
    r = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=r['verts'])
    bmesh.ops.translate(bm, vec=Vector(c), verts=r['verts'])


def clear_eq():
    for o in [o for o in bpy.data.objects if o.name.startswith("EQ_")]:
        bpy.data.objects.remove(o, do_unlink=True)


def build_all():
    clear_eq()
    body = bpy.data.objects["Soldier"]
    atlas = eq.build_atlas(); cloth = eq.build_cloth()
    gear = eq.make_mat("Gear", atlas, 0.82)
    team = eq.make_mat("TeamColor", cloth, 0.9)
    bvh, _bm = eq.body_bvh(body)
    out = []

    # --- hair + chin beard
    def hair_pred(c):
        if c.z < 1.63 + 0.64 * (c.x + 0.12): return False
        if abs(c.y) > 0.07 and c.z < 1.715: return False
        return c.z > 1.60
    out.append(shell_from_body(body, hair_pred, 0.012, "EQ_Hair", gear, HAIR, 0.12, jitter=0.010, seed=5))

    # --- leather jerkin
    out.append(shell_from_body(body, lambda c: 1.0 < c.z < 1.40 and abs(c.y) < 0.172, 0.007, "EQ_Jerkin", gear, LEATHER, 0.25))
    # --- team-colour bandolier across the chest (closed diagonal band around the torso)
    bm = bmesh.new()
    N = 24
    top, bot = [], []
    for i in range(N):
        t = 2 * math.pi * i / N
        y = 0.162 * math.sin(t)
        x = -0.06 + 0.128 * math.cos(t)
        zc = 1.19 - 1.25 * y
        top.append(bm.verts.new((x, y * 1.0, zc + 0.034)))
        bot.append(bm.verts.new((x, y * 1.0, zc - 0.034)))
    for i in range(N):
        j = (i + 1) % N
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bm.normal_update()
    box_uv(bm, 0, 0.3, grid=1)
    out.append(new_object("EQ_Sash", bm, team))
    # --- bracers (forearms)
    for sgn, nm in ((1, "L"), (-1, "R")):
        out.append(shell_from_body(body, lambda c, s=sgn: 0.50 < c.y * s < 0.69, 0.007, f"EQ_Bracer{nm}", gear, DARK, 0.2, jitter=0.002, seed=11))
    # --- shin wraps
    out.append(shell_from_body(body, lambda c: 0.115 < c.z < 0.40 and abs(c.y) > 0.05, 0.007, "EQ_Wraps", gear, ROPE, 0.12, jitter=0.002, seed=13))
    # --- fur mantle on the left shoulder
    sh = Vector((-0.066, 0.20, 1.455))
    out.append(shell_from_body(body, lambda c: (c - sh).length < 0.118 and c.y > 0.095, 0.022, "EQ_Mantle", gear, FUR, 0.3, jitter=0.016, seed=17))

    # --- belt, buckle, pouch
    cx = -0.065
    bm = loft([ring((cx, 0, 0.965), 0.114, 0.174), ring((cx, 0, 1.015), 0.113, 0.172), ring((cx, 0, 1.045), 0.108, 0.168)], 20)
    box_uv(bm, DARK, 0.25)
    out.append(new_object("EQ_Belt", bm, gear))
    bm = bmesh.new(); _box(bm, (0.058, 0.0, 0.998), 0.022, 0.055, 0.05)
    _box(bm, (-0.178, 0.08, 0.93), 0.05, 0.085, 0.085)    # back pouch
    bm.normal_update(); box_uv(bm, BONE, 0.12)
    out.append(new_object("EQ_Buckle", bm, gear))

    # --- hide kilt + fur hem
    def kilt_rings():
        return [ring((-0.05, 0, 0.64), 0.145, 0.222), ring((-0.058, 0, 0.80), 0.138, 0.205), ring((-0.07, 0, 0.93), 0.122, 0.182), ring((-0.07, 0, 0.99), 0.116, 0.176)]
    bm = loft(kilt_rings(), 20)
    box_uv(bm, LEATHER, 0.3)
    k = new_object("EQ_Kilt", bm, gear)
    out.append(k)
    rnd = random.Random(4)
    bm = loft([ring((-0.05, 0, 0.585), 0.158, 0.234), ring((-0.05, 0, 0.64), 0.153, 0.230), ring((-0.05, 0, 0.69), 0.149, 0.226)], 20)
    for v in bm.verts:
        v.co += Vector(((rnd.random() - .5) * .01, (rnd.random() - .5) * .01, (rnd.random() - .5) * .02))
    bm.normal_update(); box_uv(bm, FUR, 0.3)
    kf = new_object("EQ_KiltFur", bm, gear)
    out.append(kf)

    def kilt_w(co):
        wh = min(1, max(0, (co.z - 0.66) / 0.30))
        wl = 0.5 + 0.5 * max(-1, min(1, co.y / 0.12))
        d = {"Hips_01": wh}
        d["LeftUpLeg_03"] = (1 - wh) * wl
        d["RightUpLeg_027"] = (1 - wh) * (1 - wl)
        return {k_: v_ for k_, v_ in d.items() if v_ > 0}
    for ob in (k, kf):
        skin_manual(ob, body, kilt_w)

    # --- headband with two tails (team colour)
    bm = loft([ring((-0.03, 0, 1.706), 0.114, 0.103), ring((-0.03, 0, 1.746), 0.110, 0.098)], 20)
    for sy, yaw in ((0.025, 0.25), (-0.025, -0.25)):
        pts = []
        for i in range(4):
            t = i / 3
            base = Vector((-0.142 - 0.03 * t, sy + yaw * 0.12 * t, 1.725 - 0.17 * t))
            pts.append((bm.verts.new(base + Vector((0, -0.024, 0))), bm.verts.new(base + Vector((0, 0.024, 0)))))
        for i in range(3):
            bm.faces.new((pts[i][0], pts[i][1], pts[i + 1][1], pts[i + 1][0]))
    box_uv(bm, 0, 0.3, grid=1)
    out.append(new_object("EQ_Headband", bm, team))

    # skin everything that is not manually weighted
    for ob in out:
        if len(ob.vertex_groups) == 0 or all(len(v.groups) == 0 for v in ob.data.vertices):
            skin_nearest(ob, body, bvh)
    arm = bpy.data.objects['Armature']
    for ob in out:
        md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = arm
    return out


def build_spear(axis_xy=(0.245, -0.168), length=1.95, hand_bone="RightHand_022"):
    """Build the spear in the *current posed* world frame (vertical, butt at ground) and map it
    back into bind space through the hand bone so it is rigidly skinned to the hand."""
    for n in ("EQ_Spear", "EQ_SpearHead", "EQ_SpearBind", "EQ_Pennant"):
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    body = bpy.data.objects["Soldier"]
    gear = bpy.data.materials["Gear"]; team = bpy.data.materials["TeamColor"]
    a = bpy.data.objects["Armature"]
    pb = a.pose.bones[hand_bone]
    M = pb.matrix @ a.data.bones[hand_bone].matrix_local.inverted()
    Minv = M.inverted()
    x0, y0 = axis_xy
    objs = []

    def finish(name, bm, mat, tile, mpt, grid=GRID):
        box_uv(bm, tile, mpt, grid=grid)
        bmesh.ops.transform(bm, matrix=Minv, verts=bm.verts)
        ob = new_object(name, bm, mat)
        ensure_groups(ob, body)
        ob.vertex_groups[hand_bone].add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
        md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = a
        objs.append(ob)

    # shaft
    L = length
    rings = [ring((x0, y0, z), r, r) for z, r in ((0.0, 0.0145), (0.4, 0.0155), (1.0, 0.0160), (1.5, 0.0150), (L - 0.22, 0.0135))]
    bm = loft(rings, 10, cap_start=True, cap_end=True)
    bm.normal_update()
    uvcustom = lambda co, ax: (co.z / 0.8, math.atan2(co.y - y0, co.x - x0) / (2 * math.pi) * 0.9)
    box_uv(bm, WOOD, 0.4, custom=uvcustom)
    bmesh.ops.transform(bm, matrix=Minv, verts=bm.verts)
    ob = new_object("EQ_Spear", bm, gear); ensure_groups(ob, body)
    ob.vertex_groups[hand_bone].add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    md = ob.modifiers.new('Armature', 'ARMATURE'); md.object = a; objs.append(ob)

    # stone blade (diamond cross-section, lofted)
    zb = L - 0.26
    prof = [(zb, 0.014, 0.012), (zb + 0.03, 0.027, 0.008), (zb + 0.09, 0.034, 0.0065), (zb + 0.17, 0.021, 0.004), (zb + 0.26, 0.0015, 0.0015)]
    bm = loft([ring((x0, y0, z), ra, rb) for z, ra, rb in prof], 4, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    finish("EQ_SpearHead", bm, gear, STONE, 0.12)

    # lashing + grip wraps
    bm = bmesh.new()
    def band(z0, z1, r, n=2):
        zs = [z0 + (z1 - z0) * i / n for i in range(n + 1)]
        b = loft([ring((x0, y0, z), r, r) for z in zs], 10)
        me = bpy.data.meshes.new("tmp"); b.to_mesh(me); b.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    band(zb - 0.05, zb + 0.03, 0.0215)
    band(1.02, 1.20, 0.0185, 3)
    bm.normal_update()
    finish("EQ_SpearBind", bm, gear, ROPE, 0.1)

    # team pennant tied under the blade
    bm = bmesh.new()
    zt = zb - 0.06
    pts = []
    for i in range(5):
        t = i / 4
        w = 0.045 * (1 - 0.55 * t)
        z = zt - 0.30 * t
        pts.append((bm.verts.new((x0 + 0.018, y0 - 0.002 * t, z)), bm.verts.new((x0 + 0.018 + w + 0.02 * t, y0 - 0.002 * t, z))))
    for i in range(4):
        bm.faces.new((pts[i][0], pts[i][1], pts[i + 1][1], pts[i + 1][0]))
    # swallow-tail: pull the two lowest verts apart
    finish("EQ_Pennant", bm, team, 0, 0.3, grid=1)
    return objs
