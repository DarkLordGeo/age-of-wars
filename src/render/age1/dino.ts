import { AnimationMixer, Box3, Group, SphereGeometry, ConeGeometry, Vector3, type AnimationClip, type Object3D } from 'three';
import type { ClipName } from '../../assets/contract';
import { age1Material, teamClothMaterial } from './materials';
import { PieceBuilder } from './builder';
import { UNITS } from '../../config/units';

/**
 * Dino Rider (original design): a heavy, horned green dinosaur with a skull-masked rider
 * holding a spear. Procedural; ~7.1 m long (UNITS.dino.length), ~3.2 m tall, centred on the
 * origin, facing +X. Legs and tail are named pivots; `userData.animate(phase, moving)` swings
 * them (UnitView calls it during its procedural animation).
 *
 * `rider`: a rigged rider GLB (public/models/dino_rider.glb, clips idle/attack) to seat on the
 * saddle instead of the procedural one. Its clips are driven from the same animate() call:
 * idle loops on the unit's phase, attack follows the lunge progress.
 */
const SKIN = 0x4f7a3a;
/** Top of the body ellipsoid (1.75 + 1.05) before the footprint fit: the rider sits on it. */
const BACK_TOP = 2.82;
/** Pelvis height of the rider GLB in its seated pose (0.515 x 1.8 m, assets_src/rodin/rig_caveman.py). */
const RIDER_HIPS = 0.93;

export interface RiderModel {
  model: Object3D;
  clips: ReadonlyMap<ClipName, AnimationClip>;
}

export function createDinoRider(tint: number, rider?: RiderModel): Group {
  const root = new Group();
  root.name = 'DinoRider';
  const skin = age1Material('hide').clone();
  skin.color.setHex(SKIN);
  const belly = age1Material('hide').clone();
  belly.color.setHex(0x9fae6a);
  const horn = age1Material('wattle').clone();
  horn.color.setHex(0xe8dcc0);

  // Body: an elongated ellipsoid, hips higher than the shoulders.
  const body = new PieceBuilder();
  body.place(skin, new SphereGeometry(1, 14, 10), new Vector3(0, 1.75, 0), 0, new Vector3(2.3, 1.05, 0.95));
  body.place(belly, new SphereGeometry(1, 12, 8), new Vector3(0.2, 1.45, 0), 0, new Vector3(1.9, 0.75, 0.82));
  // Neck and head with a bony frill and three horns.
  body.log(skin, new Vector3(1.8, 1.9, 0), new Vector3(2.7, 1.75, 0), 0.55, { taper: 0.75 });
  body.place(skin, new SphereGeometry(1, 12, 8), new Vector3(3.05, 1.65, 0), 0, new Vector3(0.75, 0.48, 0.45));
  body.place(horn, new SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new Vector3(2.65, 1.9, 0), 0, new Vector3(0.18, 0.95, 0.85));
  const hornGeo = new ConeGeometry(0.09, 0.7, 7);
  hornGeo.rotateZ(-Math.PI / 2.6);
  for (const z of [-0.22, 0.22]) body.place(horn, hornGeo, new Vector3(3.15, 2.05, z));
  const nose = new ConeGeometry(0.08, 0.4, 7);
  nose.rotateZ(-Math.PI / 3);
  body.place(horn, nose, new Vector3(3.6, 1.82, 0));
  // Back plates.
  for (let i = 0; i < 5; i++) {
    const g = new ConeGeometry(0.16, 0.35, 5);
    body.place(horn, g, new Vector3(-1.3 + i * 0.6, 2.75 - Math.abs(i - 2) * 0.05, 0));
  }
  // Saddle blanket (team colour) and straps.
  body.place(teamClothMaterial(tint), new SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, 0.55), new Vector3(0.1, 1.85, 0), 0, new Vector3(0.95, 0.95, 1.0));
  root.add(body.build());

  // Legs: pivot at the hip/shoulder, swing about Z.
  const legs: Object3D[] = [];
  for (const [x, z, len] of [[1.3, 0.62, 1.35], [1.3, -0.62, 1.35], [-1.2, 0.62, 1.45], [-1.2, -0.62, 1.45]] as const) {
    const pivot = new Group();
    pivot.name = 'Leg';
    pivot.position.set(x, len + 0.1, z);
    const b = new PieceBuilder();
    b.log(skin, new Vector3(0, 0, 0), new Vector3(0, -len, 0), 0.34, { taper: 0.7 });
    b.place(skin, new SphereGeometry(0.3, 8, 5), new Vector3(0.05, -len, 0), 0, new Vector3(1.2, 0.5, 1));
    pivot.add(b.build());
    root.add(pivot);
    legs.push(pivot);
  }
  // Tail: a tapering cone, pivot at the hips, swings about Y.
  const tail = new Group();
  tail.name = 'Tail';
  tail.position.set(-2.0, 1.9, 0);
  const tb = new PieceBuilder();
  tb.log(skin, new Vector3(0, 0, 0), new Vector3(-1.55, -0.55, 0), 0.5, { taper: 0.12, caps: true });
  tail.add(tb.build());
  root.add(tail);

  // Rider: skull mask, hide tunic, spear.
  const riderParts = new PieceBuilder();
  const flesh = age1Material('hide').clone();
  flesh.color.setHex(0xb07a55);
  riderParts.log(teamClothMaterial(tint), new Vector3(0.1, 2.55, 0), new Vector3(0.15, 3.25, 0), 0.22, { taper: 0.8 });
  for (const z of [-0.3, 0.3]) riderParts.log(flesh, new Vector3(0.1, 2.75, z * 0.6), new Vector3(0.35, 2.3, z * 1.1), 0.07, { taper: 0.8 });
  riderParts.place(horn, new SphereGeometry(0.17, 9, 7), new Vector3(0.18, 3.45, 0), 0, new Vector3(1.1, 1, 0.95));
  for (const z of [-0.07, 0.07]) riderParts.place(age1Material('charred'), new SphereGeometry(0.04, 5, 4), new Vector3(0.34, 3.47, z));
  riderParts.log(age1Material('log'), new Vector3(-0.4, 2.8, 0.3), new Vector3(1.9, 3.3, 0.3), 0.035, { taper: 1 });
  const tip = new ConeGeometry(0.06, 0.28, 5);
  tip.rotateZ(-Math.PI / 2 + 0.2);
  riderParts.place(age1Material('stone'), tip, new Vector3(2.0, 3.32, 0.3));
  const procRider = riderParts.build();
  root.add(procRider);

  // Fit the sim footprint (UNITS.dino.length x height): squash along the lane, keep it centred.
  const box = new Box3().setFromObject(root);
  const sx = UNITS.dino!.length / (box.max.x - box.min.x);
  const sy = UNITS.dino!.height / box.max.y;
  for (const c of root.children) {
    c.position.x = (c.position.x - (box.max.x + box.min.x) / 2) * sx;
    c.position.y *= sy;
    c.scale.set(c.scale.x * sx, c.scale.y * sy, c.scale.z);
  }
  root.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  const drive = rider ? seatRider(root, procRider, rider, (0.1 - (box.max.x + box.min.x) / 2) * sx, BACK_TOP * sy) : null;
  root.userData.animate = (phase: number, moving: boolean, attack = 0): void => {
    const a = moving ? 0.38 : 0;
    legs.forEach((l, i) => (l.rotation.z = Math.sin(phase * 0.55 + (i === 0 || i === 3 ? 0 : Math.PI)) * a));
    tail.rotation.y = Math.sin(phase * 0.3) * (moving ? 0.25 : 0.08);
    drive?.(phase, attack);
  };
  return root;
}

/**
 * Swap the procedural rider for the rigged GLB: seat its pelvis at (x, y) on the saddle and
 * return a driver that poses it each frame (idle on the unit's phase, attack on the lunge).
 */
function seatRider(root: Group, procRider: Object3D, rider: RiderModel, x: number, y: number): (phase: number, attack: number) => void {
  root.remove(procRider);
  const m = rider.model;
  m.position.set(x, y - RIDER_HIPS, 0);
  m.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  root.add(m);
  const mixer = new AnimationMixer(m);
  const idleClip = rider.clips.get('idle');
  const attackClip = rider.clips.get('attack');
  const idle = idleClip ? mixer.clipAction(idleClip).play() : null;
  const strike = attackClip ? mixer.clipAction(attackClip).play() : null;
  return (phase, attack) => {
    // UnitView advances `phase` by 9 per second.
    if (idle && idleClip) {
      idle.time = (phase / 9) % idleClip.duration;
      idle.setEffectiveWeight(attack > 0 && strike ? 0 : 1);
    }
    if (strike && attackClip) {
      strike.time = Math.min(attack, 0.999) * attackClip.duration;
      strike.setEffectiveWeight(attack > 0 ? 1 : 0);
    }
    mixer.update(0);
  };
}
