"""Build the base cave GLB from a Hyper3D Rodin OBJ export (headless Blender 5.2).

    blender -b --factory-startup -P assets_src/rodin/cave_build.py -- <export_dir> <out.glb> [mouth=-Y] [tris=19000] [tex=1024]

<export_dir> holds Rodin's `base.obj` and `texture_{diffuse,roughness,metallic,normal}.png`
(the raw export stays local, like the other Rodin sources). The cave is turned so its doorway
(`mouth`: the side it faces after import, Blender axes) faces -X, the convention
`createCaveBase` (src/render/age1/settlement.ts) expects; decimated to `tris` triangles (unit/model
budget 20k); origin at the ground centre; one PBR material with the textures resized to `tex`
pixels (JPEG in the GLB). The game scales the cave to CAVE_BASE.height at load.
"""
import bpy, math, sys
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[0].rstrip('/\\'), args[1]
opts = dict(a.split('=', 1) for a in args[2:])
MOUTH = opts.get('mouth', '-Y')
TRIS = int(opts.get('tris', 19000))
TEX = int(opts.get('tex', 1024))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=f'{SRC}/base.obj')
ob = next(o for o in bpy.data.objects if o.type == 'MESH')
ob.name = ob.data.name = 'Cave'
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Doorway to -X: rotate about the vertical axis.
turn = {'-X': 0, '+Y': math.pi / 2, '+X': math.pi, '-Y': -math.pi / 2}[MOUTH]
ob.rotation_euler = (0, 0, turn)
bpy.ops.object.transform_apply(rotation=True)

before = sum(len(p.vertices) - 2 for p in ob.data.polygons)
if before > TRIS:
    dec = ob.modifiers.new('decimate', 'DECIMATE')
    dec.ratio = TRIS / before
    bpy.ops.object.modifier_apply(modifier=dec.name)
after = sum(len(p.vertices) - 2 for p in ob.data.polygons)

# Origin on the ground at the centre of the footprint.
bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
cx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2
cy = (min(v.y for v in bb) + max(v.y for v in bb)) / 2
z0 = min(v.z for v in bb)
ob.data.transform(Matrix.Translation((-cx, -cy, -z0)))
bpy.ops.object.shade_smooth()

def image(name, color):
    im = bpy.data.images.load(f'{SRC}/texture_{name}.png')
    im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    if im.size[0] > TEX:
        im.scale(TEX, TEX)
    return im

mat = bpy.data.materials.new('CaveStone')
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
def tex(name, color):
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = image(name, color)
    return n
nt.links.new(tex('diffuse', True).outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(tex('roughness', False).outputs['Color'], bsdf.inputs['Roughness'])
nt.links.new(tex('metallic', False).outputs['Color'], bsdf.inputs['Metallic'])
nm = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(tex('normal', False).outputs['Color'], nm.inputs['Color'])
nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
ob.data.materials.clear()
ob.data.materials.append(mat)

bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
size = [max(v[i] for v in bb) - min(v[i] for v in bb) for i in range(3)]
print(f'CAVE tris {before} -> {after}; size x {size[0]:.3f} y {size[1]:.3f} z {size[2]:.3f}; mouth {MOUTH} -> -X')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=85, export_animations=False)
print('EXPORTED', OUT)
