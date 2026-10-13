"""Build a game GLB from a Mixamo-rigged caveman and Mixamo animation FBXs (headless Blender 5.2).

    blender -b --factory-startup -P assets_src/rodin/mixamo_build.py -- <out.glb> <rigged.fbx> <pbr_source.glb> clip=file.fbx[:start-end] ...

<rigged.fbx>: the character downloaded from Mixamo "With Skin" (the mesh from mixamo_prep.py,
auto-rigged). <pbr_source.glb>: the raw Rodin export, whose full PBR material (base colour,
metallic-roughness, normal) replaces the FBX's simplified one (same UVs). Each clip=... adds an
animation from a Mixamo FBX of the same character ("With Skin" or "Without Skin"), optionally
trimmed to frames start-end (Mixamo frame numbers, 30 fps), e.g. attack=stab.fbx:26-46.
A clip may also be `walk=run.fbx:1-22@1.25` to time-scale it (playback rate) so the stride
matches the unit's speed.

Adds the club on mixamorig:RightHand and the TeamColor belt on mixamorig:Hips (same props as
rig_caveman.py), turns the figure to face +X and exports with one glTF animation per clip.
Raw Mixamo FBX files are not committed (Mixamo licence: raw files must not be redistributed).
"""
import bpy, math, random, sys
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
OUT, RIGGED, PBR = args[0], args[1], args[2]
CLIPS = []
for a in args[3:]:
    name, spec = a.split('=', 1)
    rate = 1.0
    if '@' in spec:
        spec, r = spec.rsplit('@', 1)
        rate = float(r)
    path, rng = (spec.rsplit(':', 1) if ':' in spec[2:] else (spec, None))
    CLIPS.append((name, path, tuple(int(x) for x in rng.split('-')) if rng else None, rate))
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


def trim(act, f0, f1, rate):
    """Keep keys in [f0, f1], shift them to start at frame 0 and time-scale by 1/rate."""
    for fc in fcurves(act):
        pts = [(k.co.x, k.co.y) for k in fc.keyframe_points if f0 - 1e-3 <= k.co.x <= f1 + 1e-3]
        fc.keyframe_points.clear()
        fc.keyframe_points.add(len(pts))
        for k, (x, y) in zip(fc.keyframe_points, pts):
            k.co = ((x - f0) / rate, y)
            k.interpolation = 'LINEAR'
        fc.update()


for name, path, rng, rate in CLIPS:
    src_act = action_from(path)
    act = src_act.copy()
    act.name = name
    act.use_fake_user = True
    f0, f1 = rng if rng else (int(src_act.frame_range[0]), int(src_act.frame_range[1]))
    trim(act, f0, f1, rate)
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    st.name = name
    print(f'CLIP {name}: frames {f0}-{f1} ({(f1 - f0) / 30 / rate:.2f}s at rate {rate})')

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

# Club: grip in the right fist (between the hand bone and the middle-finger base).
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
h0, h1 = bone_world('mixamorig:RightHand')
fist = h0.lerp(h1, 0.9) if 'mixamorig:RightHandMiddle1' not in pose else h0.lerp(bone_world('mixamorig:RightHandMiddle1')[0], 0.55)
club.location = fist + Vector((0, 0, -0.015))
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
