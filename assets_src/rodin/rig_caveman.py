"""Rig, animate and export a Rodin T/A-pose caveman for the game (headless Blender 5.2).

    blender -b --factory-startup -P assets_src/rodin/rig_caveman.py -- <raw.glb> <out.glb> <variant>

variant: "club" (Clubman, model a: club prop on the right hand) or "rider" (Dino Rider rider,
model g: seated pose, spear). Everything here is original work: the skeleton, the weights
(Blender automatic weights with a nearest-bone fallback), the props and the keyframed clips.

Output contract (docs/ASSET_SPEC.md): metres, +Y up, facing +X, feet at y=0, <=20k tris,
clips idle/walk/attack/death + optional hit (rider: idle/attack/death; it is carried by the dinosaur),
one `TeamColor` material (the belt), textures 1024 px.
"""
import bpy, bmesh, math, sys
from mathutils import Matrix, Vector, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, VARIANT = argv[0], argv[1], argv[2]
HEIGHT = 1.8
TRI_BUDGET = 15000
FPS = 30
TEX_SIZE = 1024
UP, FWD = Vector((0, 0, 1)), Vector((0, -1, 0))  # authored facing -Y (Blender front); turned to +X at export

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS


def select_only(*objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


# ------------------------------------------------------------------ mesh: import, clean, scale
bpy.ops.import_scene.gltf(filepath=SRC)
body = next(o for o in scene.objects if o.type == 'MESH')
body.name = 'Body'
select_only(body)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bm = bmesh.new()
bm.from_mesh(body.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0004)
bm.to_mesh(body.data)
bm.free()
tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
dec = body.modifiers.new('Decimate', 'DECIMATE')
dec.ratio = min(1.0, TRI_BUDGET / tris)
bpy.ops.object.modifier_apply(modifier=dec.name)

vs = [v.co for v in body.data.vertices]
zmin = min(v.z for v in vs)
s = HEIGHT / (max(v.z for v in vs) - zmin)
cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2
for v in body.data.vertices:
    v.co = Vector(((v.co.x - cx) * s, v.co.y * s, (v.co.z - zmin) * s))
body.data.update()
vs = [v.co.copy() for v in body.data.vertices]

# Textures: 1024 px, keep the PBR set (base colour, metallic-roughness, normal).
for img in bpy.data.images:
    if img.size[0] > TEX_SIZE:
        img.scale(TEX_SIZE, TEX_SIZE)

# ------------------------------------------------------------------ landmarks
H = HEIGHT


def ymid(z, x=None, dz=0.04, dx=0.08):
    pts = [v for v in vs if abs(v.z - z) < dz and (x is None or abs(v.x - x) < dx)]
    return sum(v.y for v in pts) / len(pts) if pts else 0.0


reach = max(abs(v.x) for v in vs)
far = [v for v in vs if abs(v.x) > 0.75 * reach]
hand_z = sorted(v.z for v in far)[len(far) // 2]
feet = [v for v in vs if v.z < 0.06 * H and v.x > 0]
foot_x = sum(v.x for v in feet) / len(feet)
foot_y = sum(v.y for v in feet) / len(feet)
toe_y = min(v.y for v in feet)
if VARIANT == 'club':
    # T-pose: arms horizontal at shoulder height.
    sh_z = hand_z
else:
    # A-pose: arms slope down from the shoulder (no arm vertices above ~0.7 H on model g).
    sh_z = 0.70 * H
sh_x = 0.165 * H / 1.8 * 1.0
hip_z, knee_z, ankle_z = 0.515 * H, 0.27 * H, 0.065 * H
hand_tip = Vector((reach, ymid(hand_z, reach, 0.08, 0.1), hand_z))
shoulder = Vector((sh_x, ymid(sh_z, sh_x, 0.06, 0.06), sh_z))
wrist = shoulder.lerp(hand_tip, 0.80)
elbow = shoulder.lerp(wrist, 0.52)
if VARIANT == 'club':
    elbow.y += 0.02  # a slight natural bend keeps the IK-free poses readable

J = {  # joint positions (armature space; left side is +X)
    'pelvis': Vector((0, ymid(hip_z, 0), hip_z)),
    'spine': Vector((0, ymid(0.6 * H, 0), 0.6 * H)),
    'chest': Vector((0, ymid(0.68 * H, 0), 0.68 * H)),
    'neck': Vector((0, ymid(sh_z + 0.03 * H, 0), max(sh_z, 0.76 * H) + 0.03 * H)),
    'head': Vector((0, ymid(0.84 * H, 0), 0.84 * H)),
    'top': Vector((0, ymid(0.84 * H, 0), H)),
    'hip.L': Vector((0.09 * H / 1.8 * 1.0 + 0.01, ymid(hip_z - 0.04, 0.1), hip_z - 0.035 * H)),
    'knee.L': Vector((foot_x * 0.95, ymid(knee_z, foot_x) - 0.01, knee_z)),
    'ankle.L': Vector((foot_x, foot_y + 0.03, ankle_z)),
    'toe.L': Vector((foot_x, toe_y + 0.03, 0.025)),
    'shoulder.L': shoulder, 'elbow.L': elbow, 'wrist.L': wrist, 'hand.L': hand_tip,
}
for k in list(J):
    if k.endswith('.L'):
        p = J[k]
        J[k[:-2] + '.R'] = Vector((-p.x, p.y, p.z))

# ------------------------------------------------------------------ armature
arm_data = bpy.data.armatures.new('Rig')
arm = bpy.data.objects.new('Armature', arm_data)
scene.collection.objects.link(arm)
select_only(arm)
bpy.ops.object.mode_set(mode='EDIT')
BONES = [  # name, head, tail, parent, connected, roll reference (local Z)
    ('Hips', 'pelvis', 'spine', None, False, FWD),
    ('Spine', 'spine', 'chest', 'Hips', True, FWD),
    ('Chest', 'chest', 'neck', 'Spine', True, FWD),
    ('Neck', 'neck', 'head', 'Chest', True, FWD),
    ('Head', 'head', 'top', 'Neck', True, FWD),
]
for s_ in ('L', 'R'):
    BONES += [
        (f'UpperArm.{s_}', f'shoulder.{s_}', f'elbow.{s_}', 'Chest', False, FWD),
        (f'ForeArm.{s_}', f'elbow.{s_}', f'wrist.{s_}', f'UpperArm.{s_}', True, FWD),
        (f'Hand.{s_}', f'wrist.{s_}', f'hand.{s_}', f'ForeArm.{s_}', True, FWD),
        (f'Thigh.{s_}', f'hip.{s_}', f'knee.{s_}', 'Hips', False, FWD),
        (f'Shin.{s_}', f'knee.{s_}', f'ankle.{s_}', f'Thigh.{s_}', True, FWD),
        (f'Foot.{s_}', f'ankle.{s_}', f'toe.{s_}', f'Shin.{s_}', True, UP),
    ]
for name, h, t, parent, conn, ref in BONES:
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = J[h], J[t]
    eb.align_roll(ref)
    if parent:
        eb.parent = arm_data.edit_bones[parent]
        eb.use_connect = conn
bpy.ops.object.mode_set(mode='OBJECT')
ORDER = [b[0] for b in BONES]
REST = {b.name: b.matrix_local.copy() for b in arm_data.bones}

# ------------------------------------------------------------------ weights
select_only(body, arm)
body.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
groups = {g.index: g.name for g in body.vertex_groups}
unweighted = [v.index for v in body.data.vertices if not any(g.weight > 1e-4 for g in v.groups)]


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


for i in unweighted:  # bone-heat fails on open Rodin shells: nearest bone segment instead
    p = body.data.vertices[i].co
    best = min(arm_data.bones, key=lambda b: seg_dist(p, b.head_local, b.tail_local))
    vg = body.vertex_groups.get(best.name) or body.vertex_groups.new(name=best.name)
    vg.add([i], 1.0, 'REPLACE')
print(f'WEIGHTS auto, {len(unweighted)} unweighted vertices assigned to the nearest bone')

# ------------------------------------------------------------------ team belt + props


def material(name, color, rough=0.8, image=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    if image:
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(image)
        m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def parent_to_bone(obj, bone):
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    # keep the world transform it was modelled at (bone-parenting is relative to the bone tail)
    pb = arm.pose.bones[bone]
    obj.matrix_parent_inverse = (arm.matrix_world @ pb.matrix @ Matrix.Translation((0, pb.bone.length, 0))).inverted()


# Belt at the waist, sized from the body there (a flattened ring), rigidly on the hips.
bz = 0.555 * H
ring = [v for v in vs if abs(v.z - bz) < 0.025 and abs(v.x) < 0.3]
rx = max(abs(v.x) for v in ring) + 0.012
ry0, ry1 = min(v.y for v in ring) - 0.012, max(v.y for v in ring) + 0.012
bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=0.03, major_segments=24, minor_segments=6,
                                 location=(0, (ry0 + ry1) / 2, bz))
belt = bpy.context.active_object
belt.name = 'TeamBelt'
belt.scale = (rx, (ry1 - ry0) / 2, 0.85)
select_only(belt)
bpy.ops.object.transform_apply(scale=True)
belt.data.materials.append(material('TeamColor', (1, 1, 1), 0.85))
parent_to_bone(belt, 'Hips')

REPO = SRC.split('assets_src')[0]


def club():
    """A knotted wooden club, ~0.8 m, grip at the origin, axis along -Y (forward)."""
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.026, radius2=0.062, depth=0.72, location=(0, 0, 0))
    c = bpy.context.active_object
    c.name = 'Club'
    c.rotation_euler = (math.radians(90), 0, 0)  # +Z axis -> -Y
    c.location = (0, -0.36 + 0.09, 0)  # the handle butt sticks out 9 cm behind the fist
    select_only(c)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Knots: push a few head vertices outward.
    import random
    rnd = random.Random(7)
    for v in c.data.vertices:
        t = (-v.co.y + 0.09) / 0.72
        if t > 0.55:
            r = Vector((v.co.x, 0, v.co.z))
            if r.length > 1e-4:
                v.co += r.normalized() * rnd.uniform(0.0, 0.02) * t
    bpy.ops.object.shade_smooth()
    c.data.materials.append(material('ClubWood', (1, 1, 1), 0.9, REPO + 'public/textures/age1/bark.jpg'))
    return c


def spear():
    """A spear for the rider, ~1.9 m, grip at the origin, axis along -Y."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.018, depth=1.9, location=(0, 0, 0))
    shaft = bpy.context.active_object
    shaft.rotation_euler = (math.radians(90), 0, 0)
    shaft.location = (0, -0.35, 0)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.045, radius2=0.0, depth=0.24, location=(0, -1.42, 0))
    tip = bpy.context.active_object
    tip.rotation_euler = (math.radians(-90), 0, 0)
    for o in (shaft, tip):
        select_only(o)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    shaft.data.materials.append(material('SpearWood', (1, 1, 1), 0.9, REPO + 'public/textures/age1/log.jpg'))
    tip.data.materials.append(material('SpearStone', (0.33, 0.32, 0.3), 0.75))
    select_only(shaft, tip)
    bpy.ops.object.join()
    shaft.name = 'Spear'
    bpy.ops.object.shade_smooth()
    return shaft


prop = club() if VARIANT == 'club' else spear()
fist = J['wrist.R'].lerp(J['hand.R'], 0.45)
prop.location = fist + Vector((0, 0, -0.01))
parent_to_bone(prop, 'Hand.R')

# ------------------------------------------------------------------ posing helpers
select_only(arm)
bpy.ops.object.mode_set(mode='POSE')
PB = arm.pose.bones
for pb in PB:
    pb.rotation_mode = 'QUATERNION'


def rest_dir(name):
    return (REST[name].to_3x3() @ Vector((0, 1, 0))).normalized()


def rest_ref(name):
    return (REST[name].to_3x3() @ Vector((0, 0, 1))).normalized()


def apply_pose(pose, body_rot=Quaternion(), hips=None):
    """pose: {bone: dir or (dir, zref)} in the body frame; body_rot turns the whole figure
    (falls); hips: world position of the pelvis. Missing bones keep their rest direction."""
    for pb in PB:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    R = body_rot.to_matrix()
    for name in ORDER:
        pb = PB[name]
        spec = pose.get(name)
        if spec is None:
            d, ref = rest_dir(name), None
        elif isinstance(spec, tuple):
            d, ref = Vector(spec[0]).normalized(), Vector(spec[1]).normalized()
        else:
            d, ref = Vector(spec).normalized(), None
        if ref is None:  # carry the rest roll along with the minimal swing
            ref = rest_dir(name).rotation_difference(d) @ rest_ref(name)
        y = (R @ d).normalized()
        z = (R @ ref)
        x = y.cross(z).normalized()
        z = x.cross(y).normalized()
        m = Matrix((x, y, z)).transposed().to_4x4()
        if name == 'Hips':
            m.translation = hips if hips is not None else REST['Hips'].translation
        else:
            par = PB[name].parent
            m.translation = par.tail.copy() if arm_data.bones[name].use_connect else (
                par.matrix @ (arm_data.bones[name].parent.matrix_local.inverted() @ REST[name].translation))
        pb.matrix = m
        bpy.context.view_layer.update()


def key_all(frame):
    for pb in PB:
        pb.keyframe_insert('rotation_quaternion', frame=frame, group=pb.name)
        pb.keyframe_insert('location', frame=frame, group=pb.name)


def bake(name, nframes, pose_fn, loop=True):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    prev = {}
    for f in range(nframes + 1):
        pose_fn(f / nframes)
        for pb in PB:
            q = pb.rotation_quaternion.copy()
            if pb.name in prev:
                q.make_compatible(prev[pb.name])
                pb.rotation_quaternion = q
            prev[pb.name] = q
        key_all(f)
    arm.animation_data.action = None
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    st.name = name
    print(f'CLIP {name}: {nframes / FPS:.2f}s')


def V(x, y, z):
    return Vector((x, y, z))


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def blendp(p0, p1, t):
    """Blend two poses (bone -> dir) by t."""
    out = {}
    for k in set(p0) | set(p1):
        a = Vector(p0.get(k, rest_dir(k)) if not isinstance(p0.get(k), tuple) else p0[k][0])
        b = Vector(p1.get(k, rest_dir(k)) if not isinstance(p1.get(k), tuple) else p1[k][0])
        d = a.lerp(b, t)
        ra = p0.get(k) if isinstance(p0.get(k), tuple) else None
        rb = p1.get(k) if isinstance(p1.get(k), tuple) else None
        if ra or rb:
            za = Vector(ra[1]) if ra else rest_ref(k)
            zb = Vector(rb[1]) if rb else rest_ref(k)
            out[k] = (d, za.lerp(zb, t))
        else:
            out[k] = d
    return out


HIPS0 = REST['Hips'].translation.copy()
down = V(0, 0, -1)


def legs_stand(spread=0.06):
    return {f'Thigh.{s_}': V(sx * spread, 0.02, -1) for s_, sx in (('L', 1), ('R', -1))} | {
        f'Shin.{s_}': V(sx * spread * 0.5, 0.04, -1) for s_, sx in (('L', 1), ('R', -1))} | {
        f'Foot.{s_}': (V(sx * 0.12, -1, -0.35), V(0, -0.3, 1)) for s_, sx in (('L', 1), ('R', -1))}


def leg(side, swing, knee, lift=0.0):
    """Thigh pitched `swing` rad forward, shin bent back by `knee` rad."""
    sx = 1 if side == 'L' else -1
    th = V(sx * 0.05, -math.sin(swing), -math.cos(swing))
    a = swing - knee
    sh = V(sx * 0.03, -math.sin(a), -math.cos(a))
    f = swing - knee + math.radians(70) + lift
    foot = V(sx * 0.1, -math.sin(f), -math.cos(f))
    return {f'Thigh.{side}': th, f'Shin.{side}': sh, f'Foot.{side}': (foot, V(0, -0.3, 1))}


def spine(lean=0.0, twist=0.0, side=0.0):
    d = V(side, -math.sin(lean), math.cos(lean))
    return {'Hips': V(0, -math.sin(lean * 0.4), math.cos(lean * 0.4)), 'Spine': d, 'Chest': d,
            'Neck': V(side * 0.5, -math.sin(lean * 0.5) - twist, 1), 'Head': V(0, -math.sin(lean * 0.3), 1)}


# ------------------------------------------------------------------ clips (Clubman)
if VARIANT == 'club':
    # Club carried on the right shoulder; left arm hangs.
    CARRY = {
        'UpperArm.R': V(-0.22, -0.45, -0.85), 'ForeArm.R': V(-0.05, -0.25, 1.0),
        'Hand.R': (V(0.1, 0.1, 1), V(0.25, 0.8, 0.55)),  # zref = where the club points: back over the shoulder... see below
        'UpperArm.L': V(0.2, 0.05, -1), 'ForeArm.L': V(0.12, -0.25, -1), 'Hand.L': V(0.1, -0.3, -1),
    }

    def club_hand(handdir, clubdir):
        # The club runs along the hand's rest -Y... i.e. its rest ref is FWD (zref = -Y at rest
        # for Hand.R, see BONES). So pointing the hand's zref at `clubdir` aims the club.
        return (handdir, clubdir)

    CARRY['Hand.R'] = club_hand(V(-0.05, 0.15, 1), V(0.15, 0.75, 0.65))

    def idle(t):
        b = math.sin(t * 2 * math.pi)
        p = legs_stand() | spine(0.04 + 0.015 * b) | CARRY
        p['Hand.L'] = V(0.1, -0.3 + 0.05 * b, -1)
        apply_pose(p, hips=HIPS0 + V(0, 0, -0.005 + 0.004 * b))

    def walk(t):
        w = 2 * math.pi * t
        p = spine(0.12, side=0.0) | CARRY
        p |= leg('L', 0.55 * math.sin(w), 0.15 + 0.75 * max(0.0, math.sin(w + math.pi * 0.55)))
        p |= leg('R', 0.55 * math.sin(w + math.pi), 0.15 + 0.75 * max(0.0, math.sin(w + math.pi * 1.55)))
        sw = math.sin(w + math.pi)
        p['UpperArm.L'] = V(0.18, -0.55 * sw, -1)
        p['ForeArm.L'] = V(0.1, -0.5 - 0.35 * sw, -0.9)
        p['Hand.L'] = V(0.1, -0.6 - 0.3 * sw, -0.8)
        bob = 0.035 * abs(math.cos(w))
        apply_pose(p, hips=HIPS0 + V(0, 0, -0.03 + bob))

    UP_SWING = {  # club raised behind the head
        'UpperArm.R': V(-0.25, 0.25, 1), 'ForeArm.R': V(-0.05, 0.75, 0.55),
        'Hand.R': club_hand(V(0, 0.8, -0.2), V(0.05, 0.45, -0.9)),
    }
    STRIKE = {  # club smashed down in front
        'UpperArm.R': V(-0.12, -1.0, -0.25), 'ForeArm.R': V(-0.02, -1.0, -0.55),
        'Hand.R': club_hand(V(0, -1, -0.6), V(0.05, -0.55, -0.85)),
    }

    def attack(t):
        # 0-0.2 wind up, 0.2-0.38 strike (lands at ~0.27 s), then back to the carry.
        if t < 0.22:
            k, a, b = smooth(t / 0.22), CARRY, UP_SWING
            lean = lerp(0.04, -0.12, k)
        elif t < 0.38:
            k, a, b = smooth((t - 0.22) / 0.16), UP_SWING, STRIKE
            lean = lerp(-0.12, 0.38, k)
        else:
            k, a, b = smooth((t - 0.38) / 0.62), STRIKE, CARRY
            lean = lerp(0.38, 0.04, k)
        p = legs_stand(0.08) | leg('L', 0.35 * (lean > 0.1) * min(1, lean / 0.38), 0.2) | spine(lean) | blendp(a, b, k)
        p['UpperArm.L'] = V(0.35, -0.3, -0.9)
        p['ForeArm.L'] = V(0.3, -0.6, -0.5)
        apply_pose(p, hips=HIPS0 + V(0, -0.06 * max(0, lean) / 0.38, -0.04 * max(0, lean) / 0.38))

    def death(t):
        # Knees buckle (0-0.3), then the body topples backwards around the heels and lands.
        k1 = smooth(t / 0.3)
        k2 = smooth((t - 0.25) / 0.5)
        p = spine(lerp(0.04, -0.35, k1)) | leg('L', lerp(0, 0.5, k1) - 0.5 * k2, lerp(0, 0.9, k1) * (1 - k2)) | leg(
            'R', lerp(0, 0.3, k1) - 0.3 * k2, lerp(0, 0.6, k1) * (1 - k2))
        p |= blendp(CARRY, {'UpperArm.R': V(-1, 0.2, 0.4), 'ForeArm.R': V(-1, 0.1, 0.2), 'Hand.R': club_hand(V(-1, 0, 0.2), V(0, 0, -1)),  # club ends flat on the ground
                            'UpperArm.L': V(1, 0.2, 0.4), 'ForeArm.L': V(1, 0.1, 0.1)}, k1)
        rot = Quaternion(Vector((1, 0, 0)), -math.radians(84) * k2)
        pivot = V(0, 0.05, 0.16)
        hips = HIPS0 + V(0, 0.04 * k1, -0.22 * k1)
        hips = pivot + rot @ (hips - pivot)
        apply_pose(p, body_rot=rot, hips=hips)

    def hit(t):
        # Short flinch: rock back from the blow and recover (optional `hit` clip, 0.4 s).
        k = math.sin(math.pi * t)
        p = legs_stand() | spine(lerp(0.04, -0.28, k)) | blendp(
            CARRY, CARRY | {'UpperArm.L': V(0.45, -0.45, -0.55), 'ForeArm.L': V(0.2, -0.85, 0.25)}, k)
        apply_pose(p, hips=HIPS0 + V(0, 0.06 * k, -0.025 * k))

    bake('idle', 60, idle)
    bake('walk', 18, walk)
    bake('attack', 21, attack, loop=False)
    bake('death', 36, death, loop=False)
    bake('hit', 12, hit, loop=False)

# ------------------------------------------------------------------ clips (rider)
else:
    SEAT = {
        'Thigh.L': V(0.75, -0.75, -0.3), 'Shin.L': V(0.35, 0.1, -1), 'Foot.L': (V(0.2, -1, -0.3), V(0, -0.3, 1)),
        'Thigh.R': V(-0.75, -0.75, -0.3), 'Shin.R': V(-0.35, 0.1, -1), 'Foot.R': (V(-0.2, -1, -0.3), V(0, -0.3, 1)),
        'UpperArm.L': V(0.3, -0.5, -0.8), 'ForeArm.L': V(0.05, -1, -0.15), 'Hand.L': V(0, -1, -0.2),
    }
    # Fist grip: the hand points across the shaft (inward), its zref is the spear direction.
    HOLD = {'UpperArm.R': V(-0.35, -0.2, -0.9), 'ForeArm.R': V(-0.1, -1, 0.1),
            'Hand.R': (V(1, -0.25, 0), V(0, -1, 0.12))}  # spear level, pointing forward
    DRAW = {'UpperArm.R': V(-0.35, 0.8, -0.35), 'ForeArm.R': V(-0.05, -0.2, 1),
            'Hand.R': (V(1, 0, 0.25), V(0, -1, 0.3))}  # pulled back over the shoulder
    THRUST = {'UpperArm.R': V(-0.2, -1, 0.1), 'ForeArm.R': V(-0.05, -1, 0.05),
              'Hand.R': (V(1, -0.2, 0), V(0, -1, -0.2))}  # driven forward and down

    def idle(t):
        b = math.sin(t * 2 * math.pi)
        p = SEAT | HOLD | spine(0.08 + 0.02 * b)
        apply_pose(p, hips=HIPS0 + V(0, 0, 0.008 * b))

    def attack(t):
        if t < 0.25:
            k, a, b = smooth(t / 0.25), HOLD, DRAW
            lean = lerp(0.08, -0.1, k)
        elif t < 0.42:
            k, a, b = smooth((t - 0.25) / 0.17), DRAW, THRUST
            lean = lerp(-0.1, 0.35, k)
        else:
            k, a, b = smooth((t - 0.42) / 0.58), THRUST, HOLD
            lean = lerp(0.35, 0.08, k)
        apply_pose(SEAT | spine(lean) | blendp(a, b, k), hips=HIPS0)

    def death(t):
        k = smooth(t / 0.5)
        p = SEAT | spine(lerp(0.08, -0.6, k)) | blendp(HOLD, {'UpperArm.R': V(-1, 0.3, 0.6), 'ForeArm.R': V(-1, 0.2, 0.3),
                                                               'UpperArm.L': V(1, 0.3, 0.6), 'ForeArm.L': V(1, 0.2, 0.3)}, k)
        apply_pose(p, hips=HIPS0)

    bake('idle', 60, idle)
    bake('walk', 60, idle)  # carried by the dinosaur: same as idle
    bake('attack', 24, attack, loop=False)
    bake('death', 30, death, loop=False)

# ------------------------------------------------------------------ export
for pb in PB:
    pb.matrix_basis = Matrix.Identity(4)
bpy.ops.object.mode_set(mode='OBJECT')
arm.rotation_mode = 'XYZ'
arm.rotation_euler = (0, 0, math.radians(90))  # authored facing -Y -> +X in the game
for o in (body, belt, prop):
    o.select_set(True)
select_only(arm, body, belt, prop)
tris = sum(len(p.vertices) - 2 for o in (body, belt, prop) for p in o.data.polygons)
print(f'TRIS {tris} BONES {len(arm_data.bones)}')
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_image_format='JPEG', export_jpeg_quality=85, export_skins=True, export_def_bones=False,
)
print('EXPORTED', OUT)
