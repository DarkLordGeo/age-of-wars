import {
  Bone,
  Box3,
  BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  TorusGeometry,
  Uint16BufferAttribute,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { teamClothMaterial } from './materials';

/**
 * Auto-rig for static AI-generated characters (Rodin exports have no skeleton).
 *
 * `prepareBiped` runs once on the loaded GLB: it bakes the model into game space (faces +X,
 * feet on y = 0, `height` tall, centred), then skins it to five bones found from the shape:
 * Root > Hips > { LegFront, LegBack, Torso }. Legs are split by which foot a vertex sits
 * over (the models are posed mid-stride), with a soft blend up to the hips; everything above
 * the waist follows the torso. `decorateBiped` then gives each instance a team-coloured belt
 * and a `userData.animate(phase, moving, attack)` hook that UnitView calls: scissoring legs
 * and a bob while walking, a torso swing on attacks, a slow breath when idle.
 */
export interface BipedOptions {
  /** Standing height in metres. */
  height: number;
  /** Rotation about Y that turns the source model to face +X (Rodin models face +Z). */
  turnY?: number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function prepareBiped(scene: Object3D, opts: BipedOptions): Object3D {
  let src: Mesh | null = null;
  scene.traverse((o) => {
    if (!src && (o as Mesh).isMesh) src = o as Mesh;
  });
  if (!src) return scene;
  const mesh = src as Mesh;
  mesh.updateWorldMatrix(true, false);
  const geo = (mesh.geometry as BufferGeometry).clone().applyMatrix4(mesh.matrixWorld);
  geo.rotateY(opts.turnY ?? Math.PI / 2);
  // Normalise: feet on the ground, centred on x/z, scaled to the requested height.
  geo.computeBoundingBox();
  let bb = geo.boundingBox!;
  const s = opts.height / (bb.max.y - bb.min.y);
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.scale(s, s, s);
  geo.computeBoundingBox();
  bb = geo.boundingBox!;
  const H = opts.height;
  const pos = geo.getAttribute('position') as BufferAttribute;
  const n = pos.count;

  // Feet: the lowest vertices form two clusters along X (front / back foot of the stride).
  const low: number[] = [];
  for (let i = 0; i < n; i++) if (pos.getY(i) < H * 0.06) low.push(pos.getX(i));
  let a = Math.min(...low);
  let b = Math.max(...low);
  for (let it = 0; it < 8; it++) {
    const mid = (a + b) / 2;
    let sa = 0, na = 0, sb = 0, nb = 0;
    for (const x of low) if (x < mid) { sa += x; na++; } else { sb += x; nb++; }
    if (na) a = sa / na;
    if (nb) b = sb / nb;
  }
  const split = (a + b) / 2;

  const hipY = H * 0.5;
  const waistY = H * 0.56;
  const bones = {
    root: new Bone(),
    hips: new Bone(),
    front: new Bone(),
    back: new Bone(),
    torso: new Bone(),
  };
  bones.root.name = 'Root';
  bones.hips.name = 'Hips';
  bones.front.name = 'LegFront';
  bones.back.name = 'LegBack';
  bones.torso.name = 'Torso';
  bones.hips.position.set(split, hipY, 0);
  bones.front.position.set(0.06 * H * Math.sign(b - a || 1), -0.02 * H, 0);
  bones.back.position.set(-0.06 * H * Math.sign(b - a || 1), -0.02 * H, 0);
  bones.torso.position.set(0, waistY - hipY, 0);
  bones.root.add(bones.hips);
  bones.hips.add(bones.front, bones.back, bones.torso);
  const order = [bones.root, bones.hips, bones.front, bones.back, bones.torso];
  const FRONT = 2, BACK = 3, TORSO = 4, HIPS = 1;

  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // leg share: full below 0.3H, none above the hip joint
    const leg = 1 - smooth(H * 0.3, hipY, y);
    // torso share: none below the hip joint, full above the waist + a bit
    const torso = smooth(hipY, waistY + 0.04 * H, y);
    const legBone = x >= split ? FRONT : BACK;
    const hips = Math.max(0, 1 - leg - torso);
    si.set([legBone, TORSO, HIPS, 0], i * 4);
    sw.set([leg, torso, hips, 0], i * 4);
  }
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new BufferAttribute(sw, 4));
  geo.computeBoundingSphere();

  const mat = (mesh.material as MeshStandardMaterial).clone();
  mat.vertexColors = geo.hasAttribute('color');
  const skinned = new SkinnedMesh(geo, mat);
  skinned.name = 'Body';
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.frustumCulled = false; // bones move the body beyond the bind-pose bounds
  const out = new Group();
  out.name = 'AutoRig';
  out.add(bones.root, skinned);
  out.updateMatrixWorld(true);
  skinned.bind(new Skeleton(order));
  out.userData.biped = { hipY, waistY, height: H, bounds: new Box3().copy(bb) };
  return out;
}

const tmp = new Vector3();

/** Per instance: team belt on the hips and the procedural animation hook. */
export function decorateBiped(model: Object3D, tint: number, style: { swing: number }): void {
  const hips = model.getObjectByName('Hips');
  const front = model.getObjectByName('LegFront');
  const back = model.getObjectByName('LegBack');
  const torso = model.getObjectByName('Torso');
  const root = model.getObjectByName('Root');
  const info = model.userData.biped as { hipY: number; waistY: number; height: number; bounds: Box3 } | undefined;
  if (!hips || !front || !back || !torso || !root || !info) return;

  // Team belt: a flattened ring around the waist, sized from the body's girth there.
  const body = model.getObjectByName('Body') as SkinnedMesh | undefined;
  let girth = 0.16 * info.height;
  if (body) {
    const p = body.geometry.getAttribute('position') as BufferAttribute;
    let maxR = 0;
    const y0 = info.hipY + 0.02 * info.height;
    for (let i = 0; i < p.count; i++) {
      tmp.fromBufferAttribute(p, i);
      if (Math.abs(tmp.y - y0) < 0.03 * info.height) maxR = Math.max(maxR, Math.hypot(tmp.x - hips.position.x, tmp.z));
    }
    if (maxR > 0) girth = Math.min(maxR, 0.2 * info.height) * 0.92;
  }
  const belt = new Mesh(new TorusGeometry(girth, 0.022 * info.height, 5, 18), teamClothMaterial(tint));
  belt.name = 'TeamColor';
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.85, 1);
  belt.position.set(0, 0.03 * info.height, 0);
  belt.castShadow = true;
  hips.add(belt);

  const rest = { hipsY: hips.position.y };
  model.userData.animate = (phase: number, moving: boolean, attack = 0): void => {
    const stride = moving ? Math.sin(phase * 0.8) * 0.42 : 0;
    front.rotation.z = stride;
    back.rotation.z = -stride;
    hips.position.y = rest.hipsY + (moving ? Math.abs(Math.cos(phase * 0.8)) * 0.03 * info.height : 0);
    const breathe = moving ? Math.sin(phase * 1.6) * 0.03 : Math.sin(phase * 0.25) * 0.02;
    // attack (progress 0..1): lean into the strike and back (negative z tips the top toward +X)
    const swing = attack > 0 ? Math.sin(attack * Math.PI) : 0;
    torso.rotation.z = breathe - swing * style.swing;
  };
}
