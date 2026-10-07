import bpy, math
from mathutils import Vector, Matrix, Quaternion
import anim
from anim import rot, set_pose, fk, apply_deltas, read_pose, basis_for_Q, aim_Q, ik2, rest_rot, parent_of, bones_ordered, arm

N = dict(Hips='Hips_01', LB='LowerBack_07', Sp='Spine_08', Sp1='Spine1_09', Neck='Neck_00', Neck1='Neck1_017', Head='Head_018',
         LHip='LeftUpLeg_03', LKnee='LeftLeg_04', LFoot='LeftFoot_05', RHip='RightUpLeg_027', RKnee='RightLeg_028', RFoot='RightFoot_029',
         LSh='LeftArm_011', LEl='LeftForeArm_012', LHand='LeftHand_013', RSh='RightArm_020', REl='RightForeArm_021', RHand='RightHand_022',
         RFB='RightFingerBase_024', RF1='RightHandFinger1_025')
RIGHT_ARM_CHAIN = [N['RSh'], N['REl'], N['RHand'], N['RFB'], N['RF1']]
RA = ['RightArm_020', 'RightForeArm_021', 'RightHand_022', 'RightFingerBase_024', 'RightHandFinger1_025']


class P:
    """Accumulates armature-space rotation deltas (+ hips translation)."""
    def __init__(self):
        self.d = {}
        self.hips = Vector((0, 0, 0))

    def add(self, key, axis, deg):
        b = N.get(key, key)
        self.d[b] = rot(axis, deg) @ self.d.get(b, Matrix.Identity(3))

    def leg(self, side, theta, knee, extra=0.0):
        h, k, f = (N['LHip'], N['LKnee'], N['LFoot']) if side == 'L' else (N['RHip'], N['RKnee'], N['RFoot'])
        self.add(h, 'Y', -theta)
        self.add(k, 'Y', knee)
        self.add(f, 'Y', theta - knee + extra)


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lerp_keys(keys, f):
    """keys: sorted [(frame, {param: value})]; smoothstep interpolation of every param."""
    if f <= keys[0][0]:
        return dict(keys[0][1])
    for (f0, a), (f1, b) in zip(keys, keys[1:]):
        if f0 <= f <= f1:
            t = smooth((f - f0) / (f1 - f0)) if f1 > f0 else 1.0
            return {k: a[k] + (b[k] - a[k]) * t for k in a}
    return dict(keys[-1][1])


def with_hips_offset(base, p):
    out = {k: (v[0].copy(), v[1].copy()) for k, v in base.items()}
    b = apply_deltas(base, p.d)
    hb = N['Hips']
    loc = base[hb][1] + rest_rot(hb).inverted() @ p.hips
    b[hb] = (b[hb][0], loc)
    return b


def arm_ik(basis, carry_info, offset, shaft, roll_fore=55.0):
    """Reposition the right arm chain so the hand is at shoulder+offset and the spear points along `shaft`."""
    a = arm()
    set_pose(basis)
    bpy.context.view_layer.update()
    S = a.pose.bones['RightArm_020'].head.copy()
    l1 = (a.data.bones['RightForeArm_021'].head_local - a.data.bones['RightArm_020'].head_local).length
    l2 = (a.data.bones['RightHand_022'].head_local - a.data.bones['RightForeArm_021'].head_local).length
    H = S + Vector(offset)
    E = ik2(S, H, l1, l2, (-0.4, -0.8, -0.4))
    u = (E - S).normalized(); f = (H - E).normalized()
    Qb = fk(basis)
    q_h_carry = carry_info['Qhand']
    mr = Vector((0, 0, 1)).rotation_difference(Vector(shaft).normalized()).to_matrix()
    Qt = {
        'RightArm_020': aim_Q('RightArm_020', u),
        'RightForeArm_021': aim_Q('RightForeArm_021', f, roll_fore),
        'RightHand_022': mr @ q_h_carry,
    }
    out = dict(basis)
    Qn = dict(Qb)
    for n in ['RightArm_020', 'RightForeArm_021', 'RightHand_022']:
        p = parent_of(n)
        q = basis_for_Q(n, Qn[p], Qt[n])
        out[n] = (q, basis[n][1].copy())
        Qn[n] = Qt[n]
    return out


def bake(name, frames, basis_fn, fps=24):
    a = arm()
    if name in bpy.data.actions:
        bpy.data.actions.remove(bpy.data.actions[name])
    act = bpy.data.actions.new(name)
    ad = a.animation_data
    ad.action = act
    prev = {}
    for f in frames:
        basis = basis_fn(f)
        for pb in a.pose.bones:
            q, l = basis[pb.name]
            q = q.copy()
            if pb.name in prev:
                q.make_compatible(prev[pb.name])
            prev[pb.name] = q
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = q
            pb.location = l
            pb.keyframe_insert('rotation_quaternion', frame=f, group=pb.name)
            pb.keyframe_insert('location', frame=f, group=pb.name)
    ad.action = None
    for t in [t for t in ad.nla_tracks if t.name == name]:
        ad.nla_tracks.remove(t)
    tr = ad.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, int(frames[0]), act); st.name = name
    return act
