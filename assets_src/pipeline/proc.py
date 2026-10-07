import bpy, bmesh, os, math
from mathutils import Vector, Matrix

PROJ = r"C:\Users\mrerg\Desktop\AgeOfWars"
SRC = os.path.join(PROJ, "assets_src", "polyhaven")
OUT = os.path.join(PROJ, "public", "models", "env")


def proc_scene():
    sc = bpy.data.scenes.get("proc") or bpy.data.scenes.new("proc")
    bpy.context.window.scene = sc
    return sc


def clear():
    sc = proc_scene()
    for o in list(sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions, bpy.data.cameras, bpy.data.lights):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def tri_count(o):
    me = o.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def import_ph(aid):
    clear()
    p = os.path.join(SRC, aid, f"{aid}_1k.gltf")
    before = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=p)
    return [o for o in bpy.data.objects if o.name not in before]


def flatten(objs, join=True):
    """Bake world transforms into mesh data, drop everything but meshes, optionally join."""
    bpy.context.view_layer.update()
    meshes = [o for o in objs if o.type == 'MESH']
    for o in meshes:
        if o.data.shape_keys:
            o.shape_key_clear()
        for m in list(o.modifiers):
            o.modifiers.remove(m)
        o.vertex_groups.clear()
        mw = o.matrix_world.copy()
        o.parent = None
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
    for o in objs:
        if o.type != 'MESH' and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    if join and len(meshes) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        meshes = [bpy.context.view_layer.objects.active]
    return meshes


def weld(o, dist=1e-5):
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(o.data); bm.free()


def decimate(o, target):
    weld(o)
    t = tri_count(o)
    for _ in range(5):
        if t <= target * 1.1:
            break
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        md = o.modifiers.new("Dec", 'DECIMATE')
        md.decimate_type = 'COLLAPSE'
        md.ratio = max(0.002, target / t)
        md.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier="Dec")
        t = tri_count(o)
    return t


def ground(o, center=True):
    """Origin at bottom-centre (lowest point z=0, bbox centre at x=y=0)."""
    vs = [v.co for v in o.data.vertices]
    mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    off = Vector((-(mn.x + mx.x) / 2 if center else 0, -(mn.y + mx.y) / 2 if center else 0, -mn.z))
    o.data.transform(Matrix.Translation(off))
    return mx - mn


def shrink_textures(size):
    for img in bpy.data.images:
        if img.users and img.size[0] > size:
            img.scale(size, size)


def export(o, name, sub, image_format='JPEG'):
    d = os.path.join(OUT, sub)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, name + ".glb")
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    o.name = name
    o.data.name = name
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_image_format=image_format, export_image_quality=80,
                              export_animations=False, export_skins=False, export_extras=False)
    return path, os.path.getsize(path)


def run(aid, name, sub, tris, tex=1024, join=True, image_format='JPEG', rotate_z=0.0, center=True):
    objs = import_ph(aid)
    ms = flatten(objs, join)
    out = []
    for i, o in enumerate(ms):
        if rotate_z:
            o.data.transform(Matrix.Rotation(math.radians(rotate_z), 4, 'Z'))
        before = tri_count(o)
        after = decimate(o, tris)
        dims = ground(o, center)
        shrink_textures(tex)
        nm = name if len(ms) == 1 else f"{name}_{i:02d}"
        path, size = export(o, nm, sub, image_format)
        out.append((nm, before, after, tuple(round(x, 2) for x in dims), size // 1000))
    return out


def run_kit(aid, sub, kitname, tris, tex=1024, rename=None, image_format='JPEG', center=True, keep=None):
    """Import a multi-object asset and export all its pieces (each decimated + grounded at the origin)
    as ONE glb so the pieces share their textures. Returns per-piece stats."""
    objs = import_ph(aid)
    ms = flatten(objs, join=False)
    if keep:
        drop = [o for o in ms if not keep(o.name, tri_count(o))]
        for o in drop:
            bpy.data.objects.remove(o, do_unlink=True)
        ms = [o for o in ms if o not in drop]
    stats = []
    for i, o in enumerate(ms):
        nm = rename(o.name, i) if rename else f"{kitname}_{i:02d}"
        before = tri_count(o)
        tgt = tris(nm, before) if callable(tris) else tris
        after = decimate(o, tgt)
        dims = ground(o, center)
        o.name = nm; o.data.name = nm
        stats.append((nm, before, after, tuple(round(x, 2) for x in dims)))
    shrink_textures(tex)
    d = os.path.join(OUT, sub); os.makedirs(d, exist_ok=True)
    path = os.path.join(d, kitname + ".glb")
    bpy.ops.object.select_all(action='DESELECT')
    for o in ms:
        o.select_set(True)
    bpy.context.view_layer.objects.active = ms[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_image_format=image_format, export_image_quality=80,
                              export_animations=False, export_skins=False, export_extras=False)
    return stats, os.path.getsize(path) // 1000
