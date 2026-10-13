"""Rig, animate and export the Rodin dinosaur with its rider seated on the saddle (headless Blender 5.2).

    blender -b --factory-startup -P assets_src/rodin/rig_dino.py -- <raw_dino.glb> <rider.glb> <out.glb>

<raw_dino.glb>: Rodin model d (quadruped, head toward -Y, Y-up glTF). <rider.glb>: the rigged rider
from rig_caveman.py (public/models/dino_rider.glb). Original quadruped skeleton (spine, neck, head,
3 tail bones, 4 x 3-bone legs), automatic weights, keyed idle/walk/attack/death. The rider's
armature is parented to the dinosaur's spine and its clips are re-timed to the dinosaur's, so the
exported glTF animations drive both. Faces +X, centred on the origin along the lane (the sim's
unit centre), feet at y=0, <=20k tris with the rider, 1024 px PBR textures.
"""
import bpy, bmesh, math, sys
from mathutils import Matrix, Quaternion, Vector

SRC, RIDER, OUT = sys.argv[sys.argv.index('--') + 1:][:3]
SCALE = 3.4  # raw model is ~1.89 long: ~6.4 m, back at ~2.7 m (UNITS.dino: 7.1 m footprint, 3.2 m tall)
TRI_BUDGET, TEX_SIZE, FPS = 10000, 1024, 30
RIDER_TRI_BUDGET = 9500  # dinosaur + rider stay inside the 20k unit budget (src/assets/contract.ts)
UP, FWD = Vector((0, 0, 1)), Vector((0, -1, 0))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS


def select_only(*objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


# ------------------------------------------------------------------ mesh
bpy.ops.import_scene.gltf(filepath=SRC)
body = next(o for o in scene.objects if o.type == 'MESH')
body.name = 'DinoBody'
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
cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2
cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
for v in body.data.vertices:
    v.co = Vector(((v.co.x - cx) * SCALE, (v.co.y - cy) * SCALE, (v.co.z - zmin) * SCALE))
body.data.update()
for img in bpy.data.images:
    if img.size[0] > TEX_SIZE:
        img.scale(TEX_SIZE, TEX_SIZE)


def P(x, y, z):
    """Raw-model coordinates (as measured on rodin_d) -> scaled, centred scene coordinates."""
    return Vector((x * SCALE, (y - cy) * SCALE, z * SCALE))


# ------------------------------------------------------------------ armature (raw-model landmarks)
J = {
    'hips': P(0, 0.16, 0.50), 'spine': P(0, -0.05, 0.52), 'chest': P(0, -0.32, 0.52), 'neck': P(0, -0.55, 0.47),
    'snout': P(0, -0.93, 0.38),
    't1': P(0, 0.24, 0.47), 't2': P(0, 0.47, 0.42), 't3': P(0, 0.70, 0.35), 't4': P(0, 0.94, 0.30),
}
for s_, sx in (('L', 1), ('R', -1)):
    for leg, y, top in (('F', -0.35, 0.44), ('B', 0.13, 0.46)):
        x = 0.176 * sx
        J[f'{leg}top.{s_}'] = P(x, y, top)
        J[f'{leg}knee.{s_}'] = P(x, y, 0.22)
        J[f'{leg}ankle.{s_}'] = P(x, y, 0.06)
        J[f'{leg}toe.{s_}'] = P(x, y - 0.07, 0.005)

arm_data = bpy.data.armatures.new('DinoRig')
arm = bpy.data.objects.new('DinoArmature', arm_data)
scene.collection.objects.link(arm)
select_only(arm)
bpy.ops.object.mode_set(mode='EDIT')
BONES = [
    ('Hips', 'hips', 'spine', None, False, UP), ('Spine', 'spine', 'chest', 'Hips', True, UP),
    ('Neck', 'chest', 'neck', 'Spine', True, UP), ('Head', 'neck', 'snout', 'Neck', True, UP),
    ('Tail1', 't1', 't2', 'Hips', False, UP), ('Tail2', 't2', 't3', 'Tail1', True, UP), ('Tail3', 't3', 't4', 'Tail2', True, UP),
]
for s_ in ('L', 'R'):
    for leg, parent in (('F', 'Spine'), ('B', 'Hips')):
        BONES += [
            (f'{leg}Upper.{s_}', f'{leg}top.{s_}', f'{leg}knee.{s_}', parent, False, FWD),
            (f'{leg}Lower.{s_}', f'{leg}knee.{s_}', f'{leg}ankle.{s_}', f'{leg}Upper.{s_}', True, FWD),
            (f'{leg}Foot.{s_}', f'{leg}ankle.{s_}', f'{leg}toe.{s_}', f'{leg}Lower.{s_}', True, UP),
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

select_only(arm, body)
body.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
unweighted = [v.index for v in body.data.vertices if not any(g.weight > 1e-4 for g in v.groups)]


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


for i in unweighted:
    p = body.data.vertices[i].co
    best = min(arm_data.bones, key=lambda b: seg_dist(p, b.head_local, b.tail_local))
    vg = body.vertex_groups.get(best.name) or body.vertex_groups.new(name=best.name)
    vg.add([i], 1.0, 'REPLACE')
print(f'WEIGHTS auto, {len(unweighted)} unweighted vertices assigned to the nearest bone')

# ------------------------------------------------------------------ posing (same scheme as rig_caveman.py)
select_only(arm)
bpy.ops.object.mode_set(mode='POSE')
PB = arm.pose.bones
for pb in PB:
    pb.rotation_mode = 'QUATERNION'


def rest_dir(n):
    return (REST[n].to_3x3() @ Vector((0, 1, 0))).normalized()


def rest_ref(n):
    return (REST[n].to_3x3() @ Vector((0, 0, 1))).normalized()


def apply_pose(pose, body_rot=Quaternion(), hips=None):
    for pb in PB:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    R = body_rot.to_matrix()
    for name in ORDER:
        pb = PB[name]
        d = Vector(pose[name]).normalized() if name in pose else rest_dir(name)
        ref = rest_dir(name).rotation_difference(d) @ rest_ref(name)
        y = (R @ d).normalized()
        x = y.cross(R @ ref).normalized()
        z = x.cross(y).normalized()
        m = Matrix((x, y, z)).transposed().to_4x4()
        if name == 'Hips':
            m.translation = hips if hips is not None else REST['Hips'].translation
        else:
            par = pb.parent
            m.translation = par.tail.copy() if arm_data.bones[name].use_connect else (
                par.matrix @ (arm_data.bones[name].parent.matrix_local.inverted() @ REST[name].translation))
        pb.matrix = m
        bpy.context.view_layer.update()


def bake(target, name, nframes, pose_fn):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    target.animation_data_create()
    target.animation_data.action = act
    prev = {}
    for f in range(nframes + 1):
        pose_fn(f / nframes)
        for pb in target.pose.bones:
            q = pb.rotation_quaternion.copy()
            if pb.name in prev:
                q.make_compatible(prev[pb.name])
                pb.rotation_quaternion = q
            prev[pb.name] = q
            pb.keyframe_insert('rotation_quaternion', frame=f, group=pb.name)
            pb.keyframe_insert('location', frame=f, group=pb.name)
    target.animation_data.action = None
    tr = target.animation_data.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    st.name = name
    print(f'CLIP {name}: {nframes / FPS:.2f}s')


def V(x, y, z):
    return Vector((x, y, z))


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


HIPS0 = REST['Hips'].translation.copy()


def legs(phase=None, amp=0.0, lift=0.0, kneel=0.0, splay=0.0):
    """Diagonal gait: front-left with back-right. `phase` in radians; `kneel` folds the legs."""
    out = {}
    for s_, sx in (('L', 1), ('R', -1)):
        for leg in ('F', 'B'):
            diag = (leg == 'F') == (s_ == 'L')
            a = (amp * math.sin(phase + (0 if diag else math.pi))) if phase is not None else 0.0
            swing = phase is not None and math.cos(phase + (0 if diag else math.pi)) > 0
            bend = (lift if swing else 0.0) + kneel
            out[f'{leg}Upper.{s_}'] = V(sx * splay, -math.sin(a + bend * 0.5), -math.cos(a + bend * 0.5))
            b = a - bend if leg == 'F' else a + bend
            out[f'{leg}Lower.{s_}'] = V(sx * splay, -math.sin(b), -math.cos(b))
            out[f'{leg}Foot.{s_}'] = V(0, -1, -0.25)
    return out


def spine(pitch=0.0, neck=0.0, head=0.0, tail=0.0, tail_lift=0.0):
    return {
        'Hips': V(0, -1, 0.07), 'Spine': V(0, -1, pitch), 'Neck': V(0, -1, -0.2 + neck), 'Head': V(0, -1, -0.25 + head),
        'Tail1': V(tail * 0.5, 1, -0.17 + tail_lift), 'Tail2': V(tail, 1, -0.3 + tail_lift), 'Tail3': V(tail * 1.6, 1, -0.25 + tail_lift),
    }


def idle(t):
    w = 2 * math.pi * t
    apply_pose(legs() | spine(0.01 * math.sin(w), 0.04 * math.sin(w + 1), 0.05 * math.sin(w * 2), 0.12 * math.sin(w)),
               hips=HIPS0 + V(0, 0, 0.02 * math.sin(w)))


def walk(t):
    w = 2 * math.pi * t
    apply_pose(legs(w, 0.42, 0.45) | spine(0.0, 0.06 * math.sin(2 * w), 0.05 * math.sin(2 * w + 1), 0.25 * math.sin(w)),
               hips=HIPS0 + V(0, 0, 0.06 * abs(math.cos(w))))


def attack(t):
    # Lower the horns (0-0.3), ram forward (0.3-0.45, impact ~0.32 s), recover.
    if t < 0.3:
        k = smooth(t / 0.3)
        lunge, neck, head = 0.0, -0.35 * k, -0.25 * k
    elif t < 0.45:
        k = smooth((t - 0.3) / 0.15)
        lunge, neck, head = 0.9 * k, -0.35 + 0.15 * k, -0.25 + 0.35 * k
    else:
        k = smooth((t - 0.45) / 0.55)
        lunge, neck, head = 0.9 * (1 - k), -0.2 * (1 - k), 0.1 * (1 - k)
    apply_pose(legs(kneel=0.15 * (1 - abs(lunge - 0.45) / 0.45)) | spine(-0.05, neck, head, 0.3 * lunge, 0.25 * lunge),
               hips=HIPS0 + V(0, -lunge, -0.08 * lunge))


def death(t):
    # Legs buckle, then the body rolls onto its left side.
    k1, k2 = smooth(t / 0.35), smooth((t - 0.25) / 0.55)
    rot = Quaternion(Vector((0, 1, 0)), -math.radians(78) * k2)
    hips = HIPS0 + V(0, 0, -0.5 * k1)
    pivot = V(0.6 * SCALE * 0.27, HIPS0.y, 0.0)
    hips = pivot + rot @ (hips - pivot)
    apply_pose(legs(kneel=0.9 * k1 * (1 - 0.6 * k2), splay=0.3 * k2) | spine(0, -0.5 * k2, -0.2 * k2, 0.1, -0.1 * k2), body_rot=rot, hips=hips)


LENGTH = {'idle': 60, 'walk': 24, 'attack': 24, 'death': 36}
bake(arm, 'idle', LENGTH['idle'], idle)
bake(arm, 'walk', LENGTH['walk'], walk)
bake(arm, 'attack', LENGTH['attack'], attack)
bake(arm, 'death', LENGTH['death'], death)
for pb in PB:
    pb.matrix_basis = Matrix.Identity(4)
bpy.ops.object.mode_set(mode='OBJECT')

# ------------------------------------------------------------------ rider on the saddle
before = set(bpy.data.objects)
acts_before = set(bpy.data.actions)
bpy.ops.import_scene.gltf(filepath=RIDER)
rider_objs = [o for o in bpy.data.objects if o not in before]
rider = next(o for o in rider_objs if o.type == 'ARMATURE')
rider.name = 'RiderArmature'
rider_acts = {a.name.split('|')[-1].split('.')[0].split('_')[0].lower(): a for a in bpy.data.actions if a not in acts_before}  # 'idle.001' -> idle
print('RIDER actions', sorted(rider_acts))
for o in rider_objs:  # decimate the rider's skinned body (vertex groups survive the collapse)
    if o.type == 'MESH' and sum(len(p.vertices) - 2 for p in o.data.polygons) > 2000:
        t = sum(len(p.vertices) - 2 for p in o.data.polygons)
        select_only(o)
        mods = [m for m in o.modifiers]
        dm = o.modifiers.new('Decimate', 'DECIMATE')
        dm.ratio = min(1.0, RIDER_TRI_BUDGET / t)
        while o.modifiers[0] != dm:  # decimate before the armature modifier
            bpy.ops.object.modifier_move_up(modifier=dm.name)
        bpy.ops.object.modifier_apply(modifier=dm.name)
rider.rotation_mode = 'XYZ'
rider.rotation_euler = (0, 0, 0)  # back to the authored -Y facing, like the dinosaur here
seat = P(0, -0.12, 0.80) - Vector((0, 0, 0.93 + 0.06))  # rider pelvis (0.93 m above its feet) on the saddle
rider.location = seat
bpy.context.view_layer.update()
mw = rider.matrix_world.copy()
rider.parent = arm
rider.parent_type = 'BONE'
rider.parent_bone = 'Spine'
spine_bone = arm.pose.bones['Spine']
rider.matrix_parent_inverse = (arm.matrix_world @ spine_bone.matrix @ Matrix.Translation((0, spine_bone.bone.length, 0))).inverted()
rider.matrix_world = mw
bpy.context.view_layer.update()

# Rider clips under the same names and lengths as the dinosaur's: one glTF animation drives both.
if rider.animation_data:
    for tr in list(rider.animation_data.nla_tracks):
        rider.animation_data.nla_tracks.remove(tr)
    rider.animation_data.action = None
rider.animation_data_create()


def fcurves(act):
    if getattr(act, 'layers', None):
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for slot in act.slots:
                    bag = strip.channelbag(slot)
                    if bag:
                        out.extend(bag.fcurves)
        return out
    return list(act.fcurves)


for name, frames in LENGTH.items():
    src = rider_acts.get(name) or rider_acts['idle']
    act = src.copy()
    act.name = f'rider_{name}'
    act.use_fake_user = True
    f0, f1 = src.frame_range
    k = frames / max(1e-6, (f1 - f0)) if name in ('idle', 'walk') else 1.0  # loops must match exactly
    for fc in fcurves(act):
        for kp in fc.keyframe_points:
            kp.co.x = (kp.co.x - f0) * k
            kp.handle_left.x = (kp.handle_left.x - f0) * k
            kp.handle_right.x = (kp.handle_right.x - f0) * k
        fc.update()
    tr = rider.animation_data.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    st.name = name

# ------------------------------------------------------------------ export
arm.rotation_mode = 'XYZ'
arm.rotation_euler = (0, 0, math.radians(90))  # -Y -> +X
export = [arm, body, rider] + [o for o in rider_objs if o is not rider]
select_only(*export)
tris = sum(len(p.vertices) - 2 for o in export if o.type == 'MESH' for p in o.data.polygons)
print(f'TRIS {tris} BONES {len(arm_data.bones)}+{len(rider.data.bones)}')
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_image_format='JPEG', export_jpeg_quality=85, export_skins=True, export_def_bones=False,
)
print('EXPORTED', OUT)
