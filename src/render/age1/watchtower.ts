import { BufferAttribute, ConeGeometry, Group, Mesh, PlaneGeometry, TubeGeometry, Vector3, QuadraticBezierCurve3, type Object3D } from 'three';
import { age1Material, teamClothMaterial } from './materials';
import { PieceBuilder, rng32 } from './builder';

/**
 * Age 1 turret: a lashed log watchtower with a giant bow on a swivel post.
 *
 * Local space: origin on the ground at the tower centre, facing +X. The bow assembly is a child
 * named "Weapon" (pivot at the swivel, ~5.5 m = TURRETS.watchtower.muzzleHeight); BaseView
 * kicks it back along -X when the turret fires and hides the nocked arrow ("NockedArrow")
 * until it is reloaded.
 */
export const WATCHTOWER = {
  platformY: 4.3,
  muzzleY: 5.5,
  halfWidth: 1.25,
} as const;

export function createWatchtower(tint: number, variant = 0): Group {
  const rnd = rng32(0x7043 + variant * 31);
  const bark = age1Material('bark');
  const log = age1Material('log');
  const rope = age1Material('rope');
  const b = new PieceBuilder();
  const { platformY: P, halfWidth: H } = WATCHTOWER;

  // Four splayed legs.
  const legs: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of legs) {
    const foot = new Vector3(sx * (H + 0.45), -0.2, sz * (H + 0.45));
    const top = new Vector3(sx * H, P + 1.3, sz * H);
    b.log(bark, foot, top, 0.2, { taper: 0.75, uvLen: 2.5 });
  }
  // Cross bracing on every side (X braces) at two levels, lashed with rope.
  const legAt = (sx: number, sz: number, y: number): Vector3 => {
    const k = (y + 0.2) / (P + 1.5);
    const w = H + 0.45 - 0.45 * k;
    return new Vector3(sx * w, y, sz * w);
  };
  for (let i = 0; i < 4; i++) {
    const [ax, az] = legs[i]!;
    const [bx, bz] = legs[(i + 1) % 4]!;
    for (const [y0, y1] of [[0.4, 2.3], [2.3, P - 0.1]] as const) {
      b.log(log, legAt(ax, az, y0), legAt(bx, bz, y1), 0.08, { taper: 1 });
      b.log(log, legAt(bx, bz, y0), legAt(ax, az, y1), 0.08, { taper: 1 });
    }
    b.log(log, legAt(ax, az, 2.3), legAt(bx, bz, 2.3), 0.09, { taper: 1 });
    for (const y of [2.3, P - 0.1]) b.log(rope, legAt(ax, az, y - 0.12), legAt(ax, az, y + 0.12), 0.24, { sides: 6, taper: 1 });
  }
  // Ladder on the back side (-X).
  const lx = -(H + 0.55);
  for (const dz of [-0.35, 0.35]) b.log(log, new Vector3(lx - 0.5, 0, dz), new Vector3(lx + 0.05, P + 0.1, dz), 0.05, { taper: 1 });
  for (let y = 0.35; y < P; y += 0.42) {
    const x = lx - 0.5 + (y / (P + 0.1)) * 0.55;
    b.log(log, new Vector3(x, y, -0.4), new Vector3(x, y, 0.4), 0.035, { taper: 1, sides: 5 });
  }
  // Platform: a deck of split logs.
  const deckW = H + 0.35;
  for (let z = -deckW; z <= deckW + 1e-3; z += 0.26) {
    b.log(log, new Vector3(-deckW - 0.1, P, z), new Vector3(deckW + 0.1 + rnd() * 0.15, P, z), 0.13, { taper: 0.95, sides: 6, caps: true });
  }
  // Railing: posts + two rails, open at the back for the ladder.
  for (const [sx, sz] of legs) b.log(bark, new Vector3(sx * H, P, sz * H), new Vector3(sx * H, P + 1.3, sz * H), 0.13);
  for (let i = 0; i < 4; i++) {
    const [ax, az] = legs[i]!;
    const [bx, bz] = legs[(i + 1) % 4]!;
    if (ax === -1 && bx === -1) continue;
    for (const y of [P + 0.55, P + 1.15]) b.log(log, new Vector3(ax * H, y, az * H), new Vector3(bx * H, y, bz * H), 0.06, { taper: 1 });
    // hide panels hung on the front rails as cover
    if (ax === 1 || bx === 1 || az === 1 || bz === 1) {
      const panel = new PlaneGeometry(Math.hypot((bx - ax) * H, (bz - az) * H) * 0.8, 0.55, 3, 1);
      const pp = panel.attributes.position as BufferAttribute;
      for (let k = 0; k < pp.count; k++) pp.setZ(k, (rnd() - 0.5) * 0.05);
      panel.computeVertexNormals();
      const mid = new Vector3(((ax + bx) / 2) * H * 1.03, P + 0.83, ((az + bz) / 2) * H * 1.03);
      b.place(age1Material('hide'), panel, mid, Math.atan2(-(bz - az), bx - ax));
    }
  }
  // Roof: four thin poles carrying a small thatch cone.
  for (const [sx, sz] of legs) b.log(log, new Vector3(sx * H * 0.95, P + 1.25, sz * H * 0.95), new Vector3(sx * H * 0.8, P + 2.6, sz * H * 0.8), 0.06);
  const roof = new ConeGeometry(H * 1.75, 1.5, 4, 1, true);
  roof.rotateY(Math.PI / 4);
  const ruv = roof.attributes.uv!;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * 4, ruv.getY(i) * 1.2);
  b.place(age1Material('thatch'), roof, new Vector3(0, P + 3.15, 0));

  const group = b.build();
  group.name = 'Watchtower';

  // Team pennant on a pole above the roof.
  const pole = new PieceBuilder();
  pole.log(log, new Vector3(0, P + 3.6, 0), new Vector3(0, P + 5.0, 0), 0.04, { taper: 1 });
  const poleMesh = pole.build();
  group.add(poleMesh);
  const flagGeo = new PlaneGeometry(1.1, 0.5);
  flagGeo.translate(0.55, -0.25, 0);
  const flag = new Mesh(flagGeo, teamClothMaterial(tint));
  flag.name = 'TeamColor';
  flag.position.set(0, P + 5.0, 0);
  flag.rotation.y = Math.PI; // streams back
  flag.castShadow = true;
  group.add(flag);

  group.add(createGiantBow());
  return group;
}

/**
 * The "Weapon" child: a swivel post with a cross-stock, a big composite bow lashed to the front,
 * a bowstring and a nocked arrow. Pivot at the stock, which sits at the muzzle height.
 */
function createGiantBow(): Object3D {
  const log = age1Material('log');
  const bark = age1Material('bark');
  const rope = age1Material('rope');
  const weapon = new Group();
  weapon.name = 'Weapon';
  weapon.position.set(0.15, WATCHTOWER.muzzleY, 0);

  const b = new PieceBuilder();
  // swivel post down to the deck, and the stock (along +X)
  b.log(bark, new Vector3(0, -(WATCHTOWER.muzzleY - WATCHTOWER.platformY), 0), new Vector3(0, -0.12, 0), 0.14, { taper: 0.9 });
  b.log(log, new Vector3(-1.2, 0, 0), new Vector3(1.3, 0, 0), 0.11, { taper: 0.85, caps: true });
  b.log(rope, new Vector3(-0.1, 0, 0), new Vector3(0.12, 0, 0), 0.16, { sides: 6, taper: 1 });
  // Bow limbs: a bent wooden arc through the stock tip, curving back toward the shooter.
  const tipX = 1.2;
  const span = 1.7;
  for (const s of [-1, 1]) {
    const curve = new QuadraticBezierCurve3(new Vector3(tipX, 0, 0), new Vector3(tipX + 0.15, 0.04 * s, span * 0.6 * s), new Vector3(tipX - 0.45, 0, span * s));
    b.add(bark, new TubeGeometry(curve, 8, 0.075, 5, false));
    b.log(rope, new Vector3(tipX - 0.45, 0, span * s * 0.98), new Vector3(tipX - 0.5, 0, span * s * 1.02), 0.09, { sides: 5, taper: 1 });
  }
  // String, drawn back to the trigger notch.
  const nockX = -0.7;
  for (const s of [-1, 1]) b.log(rope, new Vector3(tipX - 0.48, 0, span * s), new Vector3(nockX, 0.02, 0), 0.022, { sides: 4, taper: 1 });
  const body = b.build();
  weapon.add(body);

  // Nocked arrow (hidden after a shot until reload).
  const ab = new PieceBuilder();
  ab.log(log, new Vector3(nockX, 0.12, 0), new Vector3(1.75, 0.12, 0), 0.045, { taper: 1, sides: 5 });
  ab.log(age1Material('stone'), new Vector3(1.75, 0.12, 0), new Vector3(2.15, 0.12, 0), 0.1, { cone: true, sides: 4 });
  const fletch = new PlaneGeometry(0.45, 0.16);
  ab.place(age1Material('hide'), fletch, new Vector3(nockX + 0.3, 0.2, 0));
  const arrow = ab.build();
  arrow.name = 'NockedArrow';
  weapon.add(arrow);
  return weapon;
}
