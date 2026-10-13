"""Export a Rodin caveman as an FBX for Mixamo's auto-rigger (headless Blender 5.2).

    blender -b --factory-startup -P assets_src/rodin/mixamo_prep.py -- <raw.glb> <out.fbx>

Same mesh preparation as rig_caveman.py (weld, decimate to ~15k tris, 1.8 m, feet at z=0,
1024 px textures), so the skinned mesh Mixamo sends back is the one the game ships. Facing -Y in
Blender (its front view), which the default FBX axes turn into Mixamo's front. No skeleton, no
props: Mixamo rigs the bare body; the club, spear and TeamColor belt are added after download.
"""
import bpy, bmesh, sys
from mathutils import Vector

SRC, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
HEIGHT, TRI_BUDGET, TEX_SIZE = 1.8, 15000, 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
body.name = 'Body'
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
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
for img in bpy.data.images:
    if img.size[0] > TEX_SIZE:
        img.scale(TEX_SIZE, TEX_SIZE)
    img.pack()  # FBX embed needs the pixels in the .blend, not just in the glb importer's memory
print('TRIS', sum(len(p.vertices) - 2 for p in body.data.polygons))
bpy.ops.export_scene.fbx(filepath=OUT, use_selection=True, object_types={'MESH'}, path_mode='COPY',
                         embed_textures=True, apply_unit_scale=True, add_leaf_bones=False)
print('EXPORTED', OUT)
