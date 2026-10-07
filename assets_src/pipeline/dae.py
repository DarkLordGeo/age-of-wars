"""Minimal Collada (.dae) reader -> Blender meshes (Blender 5.x ships without the Collada importer).
Handles <triangles>/<polylist>/<polygons>, node matrices, up-axis, one diffuse (+optional normal) map per material."""
import bpy, os, re
import xml.etree.ElementTree as ET
from mathutils import Matrix, Vector

NS = {'c': 'http://www.collada.org/2005/11/COLLADASchema'}


def _floats(el):
    return [float(x) for x in el.text.split()]


def _read_materials_cs(folder):
    out = {}
    p = os.path.join(folder, 'materials.cs')
    if not os.path.exists(p):
        return out
    txt = open(p, encoding='utf-8', errors='ignore').read()
    for blk in re.split(r'singleton Material', txt)[1:]:
        m = re.search(r'mapTo\s*=\s*"([^"]+)"', blk)
        d = re.search(r'diffuseMap\[0\]\s*=\s*"([^"]+)"', blk)
        n = re.search(r'normalMap\[0\]\s*=\s*"([^"]+)"', blk)
        if m:
            out[m.group(1)] = (d.group(1) if d else None, n.group(1) if n else None)
    return out


def _find_file(folder, name, search):
    if not name:
        return None
    base = os.path.basename(name.replace('file:///', '').replace('\\', '/'))
    for d in [folder] + search:
        for f in os.listdir(d):
            if f.lower() == base.lower():
                return os.path.join(d, f)
    return None


def load_dae(path, search_dirs=(), skip_collision=True):
    folder = os.path.dirname(path)
    root = ET.parse(path).getroot()
    up = (root.findtext('.//c:up_axis', default='Y_UP', namespaces=NS) or 'Y_UP').strip()
    unit = float(root.find('.//c:unit', NS).get('meter', '1')) if root.find('.//c:unit', NS) is not None else 1.0
    cs = _read_materials_cs(folder)

    # images / effects / materials
    images = {i.get('id'): (i.findtext('c:init_from', namespaces=NS) or '') for i in root.iterfind('.//c:library_images/c:image', NS)}
    effects = {}
    for e in root.iterfind('.//c:library_effects/c:effect', NS):
        tex = e.find('.//c:diffuse/c:texture', NS)
        img = None
        if tex is not None:
            samp = tex.get('texture')
            # sampler -> surface -> image id
            for ns_ in e.iterfind('.//c:newparam', NS):
                if ns_.get('sid') == samp:
                    srcs = ns_.findtext('.//c:source', namespaces=NS)
                    for ns2 in e.iterfind('.//c:newparam', NS):
                        if ns2.get('sid') == srcs:
                            img = ns2.findtext('.//c:init_from', namespaces=NS)
        effects[e.get('id')] = img
    mats = {}
    for m in root.iterfind('.//c:library_materials/c:material', NS):
        inst = m.find('c:instance_effect', NS)
        eff = inst.get('url').lstrip('#') if inst is not None else None
        mats[m.get('id')] = (m.get('name'), effects.get(eff))

    bl_mats = {}

    def get_material(symbol_or_id, target_mat_id):
        key = target_mat_id
        if key in bl_mats:
            return bl_mats[key]
        name, img_id = mats.get(target_mat_id, (target_mat_id, None))
        diff_name = images.get(img_id, '') if img_id else ''
        norm_name = None
        dpath = _find_file(folder, diff_name, list(search_dirs))
        for k, (d, n) in cs.items():
            if k == name or name.endswith(k) or k in (name or ''):
                norm_name = n
                alt = _find_file(folder, d, list(search_dirs)) if d else None
                if alt and not dpath:
                    dpath = alt
        if not dpath and diff_name:
            dpath = _find_file(folder, diff_name, list(search_dirs))
        npath = _find_file(folder, norm_name, list(search_dirs))
        mat = bpy.data.materials.new(name or target_mat_id)
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Roughness'].default_value = 0.9
        if dpath:
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(dpath, check_existing=True)
            nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        if npath:
            t2 = nt.nodes.new('ShaderNodeTexImage'); t2.image = bpy.data.images.load(npath, check_existing=True)
            t2.image.colorspace_settings.name = 'Non-Color'
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nt.links.new(t2.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        bl_mats[key] = mat
        return mat

    # geometries
    geoms = {}
    for g in root.iterfind('.//c:library_geometries/c:geometry', NS):
        mesh = g.find('c:mesh', NS)
        if mesh is None:
            continue
        sources = {}
        for s in mesh.iterfind('c:source', NS):
            fa = s.find('c:float_array', NS)
            acc = s.find('.//c:accessor', NS)
            stride = int(acc.get('stride', '3')) if acc is not None else 3
            sources[s.get('id')] = (_floats(fa), stride)
        vmap = {}
        for v in mesh.iterfind('c:vertices', NS):
            for inp in v.iterfind('c:input', NS):
                if inp.get('semantic') == 'POSITION':
                    vmap[v.get('id')] = inp.get('source').lstrip('#')
        prims = []
        for kind in ('triangles', 'polylist', 'polygons'):
            for p in mesh.iterfind(f'c:{kind}', NS):
                inputs = []
                for inp in p.iterfind('c:input', NS):
                    inputs.append((inp.get('semantic'), inp.get('source').lstrip('#'), int(inp.get('offset')), int(inp.get('set', '0'))))
                stride = max(i[2] for i in inputs) + 1
                if kind == 'triangles':
                    idx = [int(x) for x in p.findtext('c:p', namespaces=NS).split()]
                    faces = [idx[i:i + 3 * stride] for i in range(0, len(idx), 3 * stride)]
                    faces = [[f[j * stride:(j + 1) * stride] for j in range(3)] for f in faces]
                elif kind == 'polylist':
                    vc = [int(x) for x in p.findtext('c:vcount', namespaces=NS).split()]
                    idx = [int(x) for x in p.findtext('c:p', namespaces=NS).split()]
                    faces = []; pos = 0
                    for n in vc:
                        faces.append([idx[pos + j * stride: pos + (j + 1) * stride] for j in range(n)]); pos += n * stride
                else:
                    faces = []
                    for pe in p.iterfind('c:p', NS):
                        idx = [int(x) for x in pe.text.split()]
                        faces.append([idx[j * stride:(j + 1) * stride] for j in range(len(idx) // stride)])
                prims.append((p.get('material'), inputs, faces))
        geoms[g.get('id')] = (sources, vmap, prims)

    def build(gid, mat_binding, world):
        sources, vmap, prims = geoms[gid]
        verts = []; vindex = {}
        polys = []; uvs = []; matidx = []; slot = []
        for mname, inputs, faces in prims:
            tgt = mat_binding.get(mname)
            if skip_collision and tgt and 'col' in (mats.get(tgt, ('',))[0] or '').lower():
                return None
            if tgt not in slot:
                slot.append(tgt)
            si = slot.index(tgt)
            vin = next(i for i in inputs if i[0] == 'VERTEX')
            tin = next((i for i in inputs if i[0] == 'TEXCOORD'), None)
            pos_src, pstride = sources[vmap[vin[1]]]
            for f in faces:
                ids = []
                for corner in f:
                    pi = corner[vin[2]]
                    if pi not in vindex:
                        vindex[pi] = len(verts)
                        verts.append(Vector(pos_src[pi * pstride:pi * pstride + 3]))
                    ids.append(vindex[pi])
                polys.append(ids); matidx.append(si)
                if tin:
                    tsrc, tstride = sources[tin[1]]
                    uvs.append([(tsrc[c[tin[2]] * tstride], tsrc[c[tin[2]] * tstride + 1]) for c in f])
                else:
                    uvs.append([(0, 0)] * len(f))
        me = bpy.data.meshes.new(gid)
        me.from_pydata([tuple(v) for v in verts], [], polys)
        me.update()
        uvl = me.uv_layers.new(name='UVMap')
        li = 0
        for pidx, poly in enumerate(me.polygons):
            for k in range(poly.loop_total):
                uvl.data[li].uv = uvs[pidx][k]; li += 1
        for pidx, poly in enumerate(me.polygons):
            poly.material_index = matidx[pidx]; poly.use_smooth = True
        for t in slot:
            me.materials.append(get_material(None, t) if t else bpy.data.materials.new('none'))
        me.transform(world)
        return me

    # visual scene walk
    objs = []
    base = Matrix.Identity(4)
    if up == 'Y_UP':
        base = Matrix.Rotation(1.5707963, 4, 'X')
    base = Matrix.Scale(unit, 4) @ base

    def mat_of(node):
        m = Matrix.Identity(4)
        for ch in node:
            tag = ch.tag.split('}')[1]
            if tag == 'matrix':
                v = _floats(ch)
                m = m @ Matrix([v[0:4], v[4:8], v[8:12], v[12:16]])
        return m

    def walk(node, parent_m):
        m = parent_m @ mat_of(node)
        name = node.get('name', '')
        for ig in node.iterfind('c:instance_geometry', NS):
            gid = ig.get('url').lstrip('#')
            binding = {}
            for im in ig.iterfind('.//c:instance_material', NS):
                binding[im.get('symbol')] = im.get('target').lstrip('#')
            if skip_collision and re.search(r'(^|[-_])col(lision)?', name.lower()):
                continue
            me = build(gid, binding, m)
            if me is not None and len(me.polygons):
                o = bpy.data.objects.new(name or gid, me)
                bpy.context.scene.collection.objects.link(o)
                objs.append(o)
        for ch in node.iterfind('c:node', NS):
            walk(ch, m)

    for vs in root.iterfind('.//c:library_visual_scenes/c:visual_scene', NS):
        for n in vs.iterfind('c:node', NS):
            walk(n, base)
    return objs
