import { BufferAttribute, CircleGeometry, CylinderGeometry, Group, Matrix4, Mesh, Quaternion, SkinnedMesh, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry, type Object3D } from 'three';
import { PieceBuilder } from './builder';
import { age1Material, teamClothMaterial } from './materials';

/**
 * Age 1 unit gear attached to rigged GLB units at instantiate time (AssetSpec.decorate).
 *
 * The Soldier's spear is part of its mesh; the hide shield is added here and parented to the
 * left forearm bone so it follows every animation clip. The bone-local transform was solved
 * from the idle pose (shield centred on the forearm, face pointing out to the unit's left).
 */
const SHIELD_BONE = 'LeftForeArm_012';
const SHIELD_LOCAL = {
  position: new Vector3(-0.0758, 0.1288, 0.0129),
  quaternion: new Quaternion(0.5068, 0.4798, 0.5636, -0.4419),
};

let shieldProto: Group | null = null;

/** Round hide shield on a bent-withy rim, with a wooden boss and a team-coloured band. */
function shieldPrototype(): Group {
  if (shieldProto) return shieldProto;
  const g = new Group();
  g.name = 'HideShield';
  const R = 0.3;
  // Disc axis is +Y (CylinderGeometry), so +Y is the shield's outer face.
  const face = new Mesh(new CylinderGeometry(R, R, 0.02, 18), age1Material('hide'));
  const rim = new Mesh(new TorusGeometry(R, 0.022, 5, 18), age1Material('log'));
  rim.rotation.x = Math.PI / 2;
  const boss = new Mesh(new SphereGeometry(0.07, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), age1Material('log'));
  boss.position.y = 0.01;
  g.add(face, rim, boss);
  for (const m of [face, rim, boss]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  shieldProto = g;
  return g;
}

export function createHideShield(tint: number): Object3D {
  const g = shieldPrototype().clone();
  // Painted team band across the face.
  const band = new Mesh(new CircleGeometry(0.2, 14, 0, Math.PI), teamClothMaterial(tint));
  band.name = 'TeamColor';
  band.rotation.x = -Math.PI / 2;
  band.position.y = 0.0115;
  g.add(band);
  return g;
}

/** AssetSpec.decorate for the Soldier: strap a hide shield to the left forearm. */
export function decorateSoldier(model: Object3D, tint: number): void {
  const bone = model.getObjectByName(SHIELD_BONE);
  if (!bone) return;
  const mount = new Group();
  mount.name = 'ShieldMount';
  mount.position.copy(SHIELD_LOCAL.position);
  mount.quaternion.copy(SHIELD_LOCAL.quaternion);
  const shield = createHideShield(tint);
  // The solved mount points +Y toward the unit's right; flip so the face looks outward (left).
  shield.rotation.x = Math.PI;
  mount.add(shield);
  bone.add(mount);
}

// ---------------------------------------------------------------------------------------------
// Clubman / Slingshot Man: the same rigged GLB as the Soldier with the spear removed.

const HAND_BONE = 'RightHand_022';
/** Hand-weighted vertices farther than this from the hand joint (bind pose) belong to the spear. */
const SPEAR_CUT = 0.2;

interface Stripped {
  geometry: BufferGeometry;
  /** Spear direction in hand-bone space (unit vector), when the spear was found. */
  axis: Vector3 | null;
}
const strippedCache = new WeakMap<BufferGeometry, Stripped>();

/**
 * Collapse the spear (and its pennant) out of a skinned primitive: vertices whose dominant
 * bone is the right hand and that sit far from the hand joint become degenerate. The cleaned
 * geometry is cached per source geometry, so every instance shares it.
 */
function stripSpear(mesh: SkinnedMesh): Stripped {
  const src = mesh.geometry;
  const hit = strippedCache.get(src);
  if (hit) return hit;
  const bones = mesh.skeleton.bones;
  const h = bones.findIndex((b) => b.name === HAND_BONE);
  const idx = src.getAttribute('skinIndex');
  const wgt = src.getAttribute('skinWeight');
  if (h < 0 || !idx || !wgt) {
    const r = { geometry: src, axis: null };
    strippedCache.set(src, r);
    return r;
  }
  const toBone = new Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[h]!, mesh.bindMatrix);
  const geo = src.clone();
  const pos = geo.getAttribute('position') as BufferAttribute;
  const v = new Vector3();
  const sum = new Vector3();
  let far: Vector3 | null = null;
  let farD = 0;
  let anchor: Vector3 | null = null;
  for (let i = 0; i < pos.count; i++) {
    let best = 0;
    let bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(i, k);
      if (w > bw) {
        bw = w;
        best = idx.getComponent(i, k);
      }
    }
    if (best !== h) continue;
    v.fromBufferAttribute(pos, i).applyMatrix4(toBone); // hand-local
    const d = v.length();
    if (d < SPEAR_CUT) continue;
    sum.add(v);
    if (d > farD) {
      farD = d;
      far = v.clone();
    }
    if (!anchor) anchor = new Vector3().fromBufferAttribute(pos, i);
    pos.setXYZ(i, anchor.x, anchor.y, anchor.z);
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
  // Spear head end = farthest vertex; the axis points that way.
  const axis = far ? far.normalize() : sum.lengthSq() > 0 ? sum.normalize() : null;
  const r = { geometry: geo, axis };
  strippedCache.set(src, r);
  return r;
}

/** Strip the spear from every primitive; returns the spear axis in hand space (if found). */
function removeSpear(model: Object3D): Vector3 | null {
  let axis: Vector3 | null = null;
  model.traverse((o) => {
    if (!(o as SkinnedMesh).isSkinnedMesh) return;
    const m = o as SkinnedMesh;
    const r = stripSpear(m);
    m.geometry = r.geometry;
    if (r.axis && !axis) axis = r.axis;
  });
  return axis;
}

let clubProto: Group | null = null;
/** A knobbed wooden club along +Y, grip at the origin. */
function clubPrototype(): Group {
  if (clubProto) return clubProto;
  const b = new PieceBuilder();
  b.log(age1Material('bark'), new Vector3(0, -0.12, 0), new Vector3(0, 0.62, 0), 0.07, { taper: 0.45, caps: true });
  b.place(age1Material('bark'), new SphereGeometry(0.1, 7, 5), new Vector3(0, 0.6, 0), 0, new Vector3(1, 1.3, 1));
  b.log(age1Material('rope'), new Vector3(0, -0.05, 0), new Vector3(0, 0.08, 0), 0.05, { sides: 6, taper: 1 });
  clubProto = b.build();
  clubProto.name = 'Club';
  return clubProto;
}

let slingProto: Group | null = null;
/** A forked-branch slingshot along +Y, grip at the origin, with a hide pouch. */
function slingPrototype(): Group {
  if (slingProto) return slingProto;
  const b = new PieceBuilder();
  const wood = age1Material('log');
  b.log(wood, new Vector3(0, -0.1, 0), new Vector3(0, 0.14, 0), 0.025, { taper: 0.9 });
  for (const s of [-1, 1]) b.log(wood, new Vector3(0, 0.13, 0), new Vector3(0.08 * s, 0.3, 0), 0.02, { taper: 0.8 });
  for (const s of [-1, 1]) b.log(age1Material('rope'), new Vector3(0.08 * s, 0.29, 0), new Vector3(0, 0.27, -0.12), 0.006, { sides: 4, taper: 1 });
  b.place(age1Material('hide'), new SphereGeometry(0.03, 6, 4), new Vector3(0, 0.27, -0.12));
  slingProto = b.build();
  slingProto.name = 'Slingshot';
  return slingProto;
}

/** Fallback hand-space direction when no spear was found (roughly along the fingers). */
const DEFAULT_AXIS = new Vector3(0, 1, 0);

function attachToHand(model: Object3D, item: Object3D, axis: Vector3 | null): void {
  const hand = model.getObjectByName(HAND_BONE);
  if (!hand) return;
  const mount = new Group();
  mount.name = 'HandMount';
  mount.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), axis ?? DEFAULT_AXIS);
  mount.add(item);
  hand.add(mount);
}

/** AssetSpec.decorate for the Clubman: spear swapped for a club; keeps the hide shield. */
export function decorateClubman(model: Object3D, tint: number): void {
  const axis = removeSpear(model);
  attachToHand(model, clubPrototype().clone(), axis);
  decorateSoldier(model, tint);
}

/** AssetSpec.decorate for the Slingshot Man: spear swapped for a slingshot; no shield. */
export function decorateSlingshot(model: Object3D): void {
  const axis = removeSpear(model);
  attachToHand(model, slingPrototype().clone(), axis);
}
