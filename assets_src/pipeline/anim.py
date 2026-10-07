import bpy, math
from mathutils import Vector, Quaternion, Matrix, Euler

ARM = None


def arm():
    return bpy.data.objects["Armature"]


def bones_ordered():
    a = arm()
    out = []
    def rec(b):
        out.append(b.name)
        for c in b.children:
            rec(c)
    for b in a.data.bones:
        if b.parent is None:
            rec(b)
    return out


def rest_rot(name):
    return arm().data.bones[name].matrix_local.to_3x3()


def parent_of(name):
    p = arm().data.bones[name].parent
    return p.name if p else None


def read_pose():
    """Current evaluated local basis of every pose bone: {name: (quat, loc)}"""
    d = {}
    for pb in arm().pose.bones:
        d[pb.name] = (pb.rotation_quaternion.copy(), pb.location.copy())
    return d


def fk(basis):
    """basis {name:(quat,loc)} -> armature-space rotation matrices Q {name: 3x3}"""
    Q = {}
    for n in bones_ordered():
        R = rest_rot(n)
        p = parent_of(n)
        b = basis[n][0].to_matrix()
        if p is None:
            Q[n] = R @ b
        else:
            Q[n] = Q[p] @ rest_rot(p).inverted() @ R @ b
    return Q


def basis_for_Q(name, Qp, Qn):
    """local basis quaternion that gives bone `name` the absolute orientation Qn given parent absolute Qp"""
    R = rest_rot(name)
    p = parent_of(name)
    if p is None:
        m = R.inverted() @ Qn
    else:
        m = (Qp @ rest_rot(p).inverted() @ R).inverted() @ Qn
    return m.to_quaternion()


def apply_deltas(base, deltas):
    """base: basis dict. deltas: {bone: Matrix3 delta (armature-space axes, applied before parent's delta)}
    returns new basis dict where each bone gets Q = A_parent * d * Qbase."""
    Qb = fk(base)
    out = {}
    Qnew = {}
    for n in bones_ordered():
        p = parent_of(n)
        d = deltas.get(n)
        if p is None:
            Qp_new = None
        else:
            Qp_new = Qnew[p]
        if p is None:
            Anew_p = Matrix.Identity(3)
        else:
            Anew_p = Qnew[p] @ Qb[p].inverted()
        Qn = Anew_p @ (d if d is not None else Matrix.Identity(3)) @ Qb[n]
        Qnew[n] = Qn
        q = basis_for_Q(n, Qnew[p] if p else None, Qn)
        out[n] = (q, base[n][1].copy())
    return out


def rot(axis, deg):
    return Matrix.Rotation(math.radians(deg), 3, axis)


def set_pose(basis):
    for pb in arm().pose.bones:
        q, l = basis[pb.name]
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = q
        pb.location = l


def aim_Q(name, target_dir, roll_deg=0.0):
    R = rest_rot(name)
    rest_dir = R.col[1].normalized()
    mr = rest_dir.rotation_difference(Vector(target_dir).normalized()).to_matrix()
    Q = mr @ R
    if roll_deg:
        Q = Matrix.Rotation(math.radians(roll_deg), 3, Vector(target_dir).normalized()) @ Q
    return Q


def ik2(S, H, l1, l2, pole):
    d = H - S
    D = min(d.length, (l1 + l2) * 0.999)
    dn = d.normalized()
    a = (l1 * l1 - l2 * l2 + D * D) / (2 * D)
    h = math.sqrt(max(l1 * l1 - a * a, 1e-9))
    pp = (Vector(pole) - dn * Vector(pole).dot(dn)).normalized()
    return S + dn * a + pp * h


def carry_base(base, side="Right", hand_off=(0.27, 0.01, -0.335), roll_fore=55, roll_hand=90, curl=(55, 75)):
    """Return a basis dict where the (right) arm holds a vertical spear planted in front of the body."""
    sgn = -1 if side == "Right" else 1
    names = dict(arm=f"{side}Arm_020" if side == "Right" else "LeftArm_011",
                 fore=f"{side}ForeArm_021" if side == "Right" else "LeftForeArm_012",
                 hand=f"{side}Hand_022" if side == "Right" else "LeftHand_013",
                 fb=f"{side}FingerBase_024" if side == "Right" else "LeftFingerBase_015",
                 f1=f"{side}HandFinger1_025" if side == "Right" else "LeftHandFinger1_016")
    a = arm()
    set_pose(base)
    bpy.context.view_layer.update()
    pbs = a.pose.bones
    S = pbs[names['arm']].head.copy()
    l1 = (a.data.bones[names['fore']].head_local - a.data.bones[names['arm']].head_local).length
    l2 = (a.data.bones[names['hand']].head_local - a.data.bones[names['fore']].head_local).length
    H = S + Vector(hand_off)
    E = ik2(S, H, l1, l2, (-0.4, 0.8 * sgn, -0.4))
    u = (E - S).normalized(); f = (H - E).normalized()
    hdir = Vector((1, 0.10 * -sgn * -1, -0.10)).normalized()
    Qb = fk(base)
    out = dict(base)
    Qn = dict(Qb)
    chain = ["arm", "fore", "hand"]
    Qt = {
        names['arm']: aim_Q(names['arm'], u),
        names['fore']: aim_Q(names['fore'], f, roll_fore * (-sgn)),
        names['hand']: aim_Q(names['hand'], hdir, roll_hand * (-sgn)),
    }
    for n in bones_ordered():
        p = parent_of(n)
        if n in Qt:
            q = basis_for_Q(n, Qn[p], Qt[n])
            out[n] = (q, base[n][1].copy())
            Qn[n] = Qt[n]
        elif p is not None and p in Qt or (p is not None and Qn[p] is not Qb[p]):
            # descendants keep their local basis, so recompute their absolute Q
            R = rest_rot(n)
            Qn[n] = Qn[p] @ rest_rot(p).inverted() @ R @ base[n][0].to_matrix()
    # finger curl via deltas about vertical axis
    carry = out
    deltas = {names['fb']: Matrix.Rotation(math.radians(curl[0] * -sgn), 3, 'Z'),
              names['f1']: Matrix.Rotation(math.radians(curl[1] * -sgn), 3, 'Z')}
    return carry, deltas, names
