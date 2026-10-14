"""Build a game GLB from a Mixamo-rigged caveman and Mixamo animation FBXs (headless Blender 5.2).

    blender -b --factory-startup -P assets_src/rodin/mixamo_build.py -- <out.glb> <rigged.fbx> <pbr_source.glb> clip=file.fbx[:start-end] ...

<rigged.fbx>: the character downloaded from Mixamo "With Skin" (the mesh from mixamo_prep.py,
auto-rigged). <pbr_source.glb>: the raw Rodin export, whose full PBR material (base colour,
metallic-roughness, normal) replaces the FBX's simplified one (same UVs). Each clip=... adds an
animation from a Mixamo FBX of the same character ("With Skin" or "Without Skin"), optionally
trimmed to frames start-end (Mixamo frame numbers, 30 fps), e.g. attack=stab.fbx:26-46.
Suffixes: `~` plays the range forward then back (a seamless loop from a short still), `!`
removes the hips' horizontal travel (root motion: the sim moves units; use it for loops, NOT
for `start=` (Start Walking), whose travel the game reads to drive it by distance), `@rate` time-scales the
clip, e.g. `walk=run.fbx:1-23!@1.25` so the stride matches the unit's speed. Variants of one clip
are named `death`, `death_2`, ...; the game picks one at random each time.

Adds the club on mixamorig:RightHand and the TeamColor belt on mixamorig:Hips (same props as
rig_caveman.py), turns the figure to face +X and exports with one glTF animation per clip.
Raw Mixamo FBX files are not committed (Mixamo licence: raw files must not be redistributed).
"""
import bpy, math, random, sys
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
OUT, RIGGED, PBR = args[0], args[1], args[2]
import re
SPEC = re.compile(r'^(?P<path>.+?)(?::(?P<a>\d+)-(?P<b>\d+))?(?P<flags>[~!]*)(?:@(?P<rate>[\d.]+))?$')
CLIPS = []
PROP = 'club'
for a in args[3:]:
    name, spec = a.split('=', 1)
    if name == 'prop':  # prop=club (right fist) or prop=sling (slingshot in the left fist)
        PROP = spec
        continue
    if spec.startswith('@'):  # generated clip, e.g. attack=@slingfire
        CLIPS.append((name, spec, None, 1.0, ''))
        continue
    m = SPEC.match(spec)
    rng = (int(m['a']), int(m['b'])) if m['a'] else None
    CLIPS.append((name, m['path'], rng, float(m['rate'] or 1.0), m['flags']))
REPO = OUT.replace('\\', '/').split('public/')[0]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30


def select_only(*objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def import_fbx(path):
    before = set(bpy.data.objects)
    acts = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    new = [o for o in bpy.data.objects if o not in before]
    return new, [a for a in bpy.data.actions if a not in acts]


objs, base_actions = import_fbx(RIGGED)
arm = next(o for o in objs if o.type == 'ARMATURE')
body = next(o for o in objs if o.type == 'MESH')
arm.name, body.name = 'Armature', 'Body'
print('RIG', len(arm.data.bones), 'bones; mesh', sum(len(p.vertices) - 2 for p in body.data.polygons), 'tris;',
      'body parent', body.parent.name if body.parent else None, 'local', [round(v, 3) for v in body.matrix_local.to_scale()])

# ------------------------------------------------------------------ full PBR material from the Rodin export
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=PBR)
src = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH')
mat = src.data.materials[0]
for n in mat.node_tree.nodes:
    if n.type == 'TEX_IMAGE' and n.image and n.image.size[0] > 1024:
        n.image.scale(1024, 1024)
body.data.materials.clear()
body.data.materials.append(mat)
bpy.data.objects.remove(src)

# ------------------------------------------------------------------ clips
arm.animation_data_create()
for a in base_actions:  # the rigged file's own action becomes available to clip=<rigged path>
    a.use_fake_user = True


def action_from(path):
    if path == RIGGED and base_actions:
        return base_actions[0]
    new, acts = import_fbx(path)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    return acts[0]


def fcurves(act):
    """F-curves of an action (Blender 5 layered actions, or the legacy list)."""
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


def trim(act, f0, f1, rate, pingpong=False, in_place=False):
    """Keep keys in [f0, f1], shift them to start at frame 0, optionally append the range
    reversed (pingpong), remove the hips' travel (in_place) and time-scale by 1/rate.
    Returns the rate used: nudged so the clip lasts a whole number of frames. The glTF exporter
    samples whole frames, so a cycle ending between two (22 frames at 1.25 = 17.6) lost its last
    part and the loop popped at the wrap (the Clubman's run)."""
    span = f1 - f0
    frames = span * (2 if pingpong else 1)
    rate = frames / max(1, round(frames / rate))
    for fc in fcurves(act):
        # Mixamo stores some channels (toes, fingers) with sparse keys: evaluate the curve at the
        # range ends so a trimmed cycle starts and ends on the true pose (no pop at the loop wrap).
        inner = [(k.co.x - f0, k.co.y) for k in fc.keyframe_points if f0 + 1e-3 < k.co.x < f1 - 1e-3]
        pts = [(0.0, fc.evaluate(f0))] + inner + [(float(span), fc.evaluate(f1))]
        if in_place and fc.data_path == 'pose.bones["mixamorig:Hips"].location' and len(pts) > 1:
            drift = pts[-1][1] - pts[0][1]
            pts = [(x, y - drift * x / span) for x, y in pts]  # linear travel out, bob/sway kept
        if pingpong:
            pts += [(2 * span - x, y) for x, y in reversed(pts[:-1])]
        fc.keyframe_points.clear()
        fc.keyframe_points.add(len(pts))
        for k, (x, y) in zip(fc.keyframe_points, pts):
            k.co = (x / rate, y)
            k.interpolation = 'LINEAR'
        fc.update()
    return rate


UPPER = ('Spine', 'Neck', 'Head', 'Shoulder', 'Arm', 'Hand')


def is_upper(bone):
    return any(k in bone for k in UPPER)


def aim(bone, d_world):
    """Swing a pose bone (minimal rotation about its head) so it points along d_world."""
    pb = arm.pose.bones['mixamorig:' + bone]
    m = pb.matrix.copy()
    d = (arm.matrix_world.to_3x3().inverted() @ Vector(d_world)).normalized()
    cur = (m.to_3x3() @ Vector((0, 1, 0))).normalized()
    r = cur.rotation_difference(d).to_matrix().to_4x4()
    t = Matrix.Translation(m.translation)
    pb.matrix = t @ r @ t.inverted() @ m
    bpy.context.view_layer.update()


def slingfire(name):
    """Keyed slingshot shot on the upper body only (the legs keep whatever loop is playing):
    raise the fork in the left fist, draw the pouch back to the cheek, release at frame 16
    (0.53 s, the manifest's `strike`), follow through and settle back to the stance.
    Directions are world space with the character facing -Y (its left is +X)."""
    stance = bpy.data.actions['idle']
    ad = arm.animation_data
    for tr in ad.nla_tracks:
        tr.mute = True
    draw = {'LeftArm': (-0.1, -1, 0.12), 'LeftForeArm': (-0.05, -1, 0.12), 'LeftHand': (0, -1, 0.08),
            'RightArm': (-0.6, 0.5, -0.1), 'RightForeArm': (0.82, -0.56, 0.17), 'RightHand': (0.4, -0.9, 0.1)}
    release = dict(draw, RightForeArm=(0.35, -0.93, 0.1), RightHand=(0.05, -1, 0.0))
    follow = dict(draw, LeftArm=(0.05, -1, -0.15), LeftForeArm=(0.05, -1, -0.1), RightArm=(-0.5, -0.3, -0.5),
                  RightForeArm=(0.2, -0.9, -0.3), RightHand=(0.1, -1, -0.2))
    timeline = [(0, None), (8, draw), (14, draw), (16, release), (19, follow), (27, None)]
    poses = []
    for frame, aims in timeline:
        ad.action = stance
        scene.frame_set(0)
        bpy.context.view_layer.update()
        if aims:
            for b in ('LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'):
                aim(b, aims[b])
        poses.append((frame, {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones if is_upper(pb.name)}))
    ad.action = None
    # Build the clip as a copy of the (imported) stance action, so it binds and exports like every
    # other Mixamo clip; then overwrite the upper-body rotations with the keyed shot. A brand-new
    # action keyed in place exported with wrong arm rotations (Blender 5 slotted actions).
    act = stance.copy()
    act.name = name
    act.use_fake_user = True
    last = timeline[-1][0]
    for fc in fcurves(act):
        bone = fc.data_path.split('"')[1] if fc.data_path.startswith('pose.bones["') else ''
        keyed = fc.data_path.endswith('rotation_quaternion') and bone in poses[0][1]
        pts = [(f, q[bone][fc.array_index]) for f, q in poses] if keyed else [(0, fc.keyframe_points[0].co.y), (last, fc.keyframe_points[0].co.y)]
        fc.keyframe_points.clear()
        fc.keyframe_points.add(len(pts))
        for k, (x, y) in zip(fc.keyframe_points, pts):
            k.co = (x, y)
            k.interpolation = 'BEZIER'
        fc.update()
    for tr in ad.nla_tracks:
        tr.mute = False
    return act


for name, path, rng, rate, flags in CLIPS:
    if path == '@slingfire':
        act = slingfire(name)
        tr = arm.animation_data.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 0, act)
        st.name = name
        print(f'CLIP {name}: generated slingshot shot (upper body, 0.90s, release 0.53s)')
        continue
    src_act = action_from(path)
    act = src_act.copy()
    act.name = name
    act.use_fake_user = True
    f0, f1 = rng if rng else (int(src_act.frame_range[0]), int(src_act.frame_range[1]))
    rate = trim(act, f0, f1, rate, pingpong='~' in flags, in_place='!' in flags)
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    st.name = name
    print(f'CLIP {name}: frames {f0}-{f1}{flags} ({(f1 - f0) * (2 if "~" in flags else 1) / 30 / rate:.2f}s at rate {rate})')

# ------------------------------------------------------------------ props (same as rig_caveman.py)
pose = {b.name: b for b in arm.pose.bones}


def bone_world(name):
    """Rest (bind) head/tail in world space: from the armature data, so the NLA clips added
    above can't pose it."""
    b = arm.data.bones[name]
    return arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local


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
    """Skin a rigid prop 100% to one bone (robust under Mixamo's 0.01-scaled armature, and
    exported as part of the same skin, so it can never drift from the hand)."""
    # Bake the geometry into the armature's own space (Mixamo: centimetres under a 0.01-scaled
    # object) with an identity local transform, like the FBX body: glTF ignores a skinned mesh's
    # node transform, so the vertices must already be where the skin's bind matrices expect.
    bpy.context.view_layer.update()  # matrix_world must include the location just set
    obj.data.transform(arm.matrix_world.inverted() @ obj.matrix_world)
    obj.parent = arm
    obj.parent_type = 'OBJECT'
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = Matrix.Identity(4)
    vg = obj.vertex_groups.new(name=bone)
    vg.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm


# Rest pose for placement (no action evaluated).
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()

vs = [body.matrix_world @ v.co for v in body.data.vertices]
H = max(v.z for v in vs) - min(v.z for v in vs)
hips_head, _ = bone_world('mixamorig:Hips')
bz = 0.555 * H
ring = [v for v in vs if abs(v.z - bz) < 0.025 and abs(v.x) < 0.3]
rx = max(abs(v.x) for v in ring) + 0.012
ry0, ry1 = min(v.y for v in ring) - 0.012, max(v.y for v in ring) + 0.012
bpy.ops.mesh.primitive_torus_add(major_radius=1, minor_radius=0.03, major_segments=24, minor_segments=6, location=(0, (ry0 + ry1) / 2, bz))
belt = bpy.context.active_object
belt.name = 'TeamBelt'
belt.scale = (rx, (ry1 - ry0) / 2, 0.85)
select_only(belt)
bpy.ops.object.transform_apply(scale=True)
belt.data.materials.append(material('TeamColor', (1, 1, 1), 0.85))
parent_to_bone(belt, 'mixamorig:Hips')

def fist(side):
    h0, h1 = bone_world(f'mixamorig:{side}Hand')
    mid = f'mixamorig:{side}HandMiddle1'
    return h0.lerp(h1, 0.9) if mid not in pose else h0.lerp(bone_world(mid)[0], 0.55)


def slingshot():
    """Forked stick (wood) with a leather band, grip at the origin. In the T-pose the handle is
    vertical and the prongs spread along Y, so with the left arm aimed forward (-Y) the fork
    stands upright with its prongs across the line of fire."""
    parts = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.015, depth=0.17, location=(0, 0, 0.035))
    parts.append(bpy.context.active_object)
    for sy in (1, -1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.012, depth=0.12, location=(0, sy * 0.03, 0.165))
        prong = bpy.context.active_object
        prong.rotation_euler = (math.radians(-22 * sy), 0, 0)
        parts.append(prong)
    for o in parts:
        select_only(o)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    wood = material('SlingWood', (1, 1, 1), 0.9, REPO + 'public/textures/age1/log.jpg')
    for o in parts:
        o.data.materials.append(wood)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.215))
    band = bpy.context.active_object
    band.scale = (0.012, 0.12, 0.008)
    select_only(band)
    bpy.ops.object.transform_apply(scale=True)
    band.data.materials.append(material('SlingBand', (0.33, 0.2, 0.11), 0.8))
    select_only(*parts, band)
    bpy.ops.object.join()
    sl = bpy.context.active_object
    sl.name = 'Slingshot'
    return sl


if PROP == 'sling':
    club = slingshot()
    club.location = fist('Left') + Vector((0, 0, -0.04))
    parent_to_bone(club, 'mixamorig:LeftHand')
else:
    club = None

# Club: grip in the right fist (between the hand bone and the middle-finger base).
if PROP == 'club':
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.026, radius2=0.062, depth=0.72, location=(0, 0, 0))
    club = bpy.context.active_object
    club.name = 'Club'
    club.rotation_euler = (math.radians(90), 0, 0)
    club.location = (0, -0.36 + 0.09, 0)
    select_only(club)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    rnd = random.Random(7)
    for v in club.data.vertices:
        t = (-v.co.y + 0.09) / 0.72
        if t > 0.55:
            r = Vector((v.co.x, 0, v.co.z))
            if r.length > 1e-4:
                v.co += r.normalized() * rnd.uniform(0.0, 0.02) * t
    # Mixamo's fist: in the T-pose the club must point backwards (+Y) so that it extends forward
    # and down past the fist in overhead strikes (checked on the Double Dagger Stab swing).
    for v in club.data.vertices:
        v.co.x, v.co.y = -v.co.x, -v.co.y
    bpy.ops.object.shade_smooth()
    club.data.materials.append(material('ClubWood', (1, 1, 1), 0.9, REPO + 'public/textures/age1/bark.jpg'))
    club.location = fist('Right') + Vector((0, 0, -0.015))
    parent_to_bone(club, 'mixamorig:RightHand')

# ------------------------------------------------------------------ export
arm.rotation_mode = 'XYZ'
arm.rotation_euler = (arm.rotation_euler.x, arm.rotation_euler.y, arm.rotation_euler.z + math.radians(90))
select_only(arm, body, belt, club)
tris = sum(len(p.vertices) - 2 for o in (body, belt, club) for p in o.data.polygons)
print(f'TRIS {tris}')
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_image_format='JPEG', export_jpeg_quality=85, export_skins=True, export_def_bones=True,
)
print('EXPORTED', OUT)
