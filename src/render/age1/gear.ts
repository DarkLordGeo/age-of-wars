import { CircleGeometry, CylinderGeometry, Group, Mesh, Quaternion, SphereGeometry, TorusGeometry, Vector3, type Object3D } from 'three';
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
