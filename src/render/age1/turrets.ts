import { BoxGeometry, ConeGeometry, DodecahedronGeometry, Group, Mesh, PlaneGeometry, SphereGeometry, Vector3, type Object3D } from 'three';
import { GAME } from '../../config/game';
import { age1Material, teamClothMaterial } from './materials';
import { PieceBuilder, rng32 } from './builder';

/**
 * Age 1 turrets and the cave mounts they sit on (original designs).
 *
 * Turret local space: origin on the platform deck, facing +X. The firing part is a child named
 * "Weapon" with its pivot at TURRET_MUZZLE above the deck, so BaseView places a turret at
 * (slot height - TURRET_MUZZLE) and its muzzle lines up with the sim's muzzle height.
 */
export const TURRET_MUZZLE = 0.6;

/** Deck height of slot `i` (the sim's muzzle height minus TURRET_MUZZLE). */
export const deckY = (i: number): number => GAME.slotHeights[i]! - TURRET_MUZZLE;

const H = 0.75; // mount deck half width

/**
 * A turret mount on the cave: a small lashed-log deck at the slot's deck height, set on the rock.
 * `rockY` is the rock surface under the mount (local ground = 0). Small gaps are filled with a
 * stack of flat stones; larger ones (the top slot rises above the cave) get lashed log legs.
 * Origin on the ground below the mount centre; the deck top is at `deckY(slot)`.
 */
export function createCaveMount(tint: number, slot: number, rockY: number): Group {
  const rnd = rng32(0x51a7 + slot * 31);
  const log = age1Material('log');
  const bark = age1Material('bark');
  const rope = age1Material('rope');
  const stone = age1Material('stone');
  const b = new PieceBuilder();
  const y = deckY(slot);
  const gap = y - rockY;
  if (gap > 1.6) {
    // Lashed legs splayed onto the rock, with X bracing.
    const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of corners) {
      b.log(bark, new Vector3(sx * (H + 0.3), rockY - 0.3, sz * (H + 0.3)), new Vector3(sx * H, y + 0.05, sz * H), 0.13, { taper: 0.85, uvLen: 2.5 });
    }
    for (const sz of [-1, 1]) {
      b.log(log, new Vector3(-H, rockY + 0.3, sz * H), new Vector3(H, y - 0.2, sz * H), 0.05, { taper: 1 });
      b.log(log, new Vector3(H, rockY + 0.3, sz * H), new Vector3(-H, y - 0.2, sz * H), 0.05, { taper: 1 });
    }
  } else if (gap > 0.08) {
    // Dry-stone stack under the deck.
    const geo = new DodecahedronGeometry(1, 0);
    for (let h = rockY - 0.15; h < y - 0.15; h += 0.32) {
      for (let i = 0; i < 3; i++) {
        const a = rnd() * Math.PI * 2;
        const r = 0.15 + rnd() * 0.35;
        b.place(stone, geo.clone(), new Vector3(Math.cos(a) * r, h + 0.12, Math.sin(a) * r), rnd() * Math.PI, new Vector3(0.55 + rnd() * 0.25, 0.2, 0.5 + rnd() * 0.25));
      }
    }
  }
  // Deck of split logs, lashed at the ends.
  for (let z = -H; z <= H + 1e-3; z += 0.24) b.log(log, new Vector3(-H - 0.15, y - 0.11, z), new Vector3(H + 0.15 + rnd() * 0.1, y - 0.11, z), 0.11, { taper: 0.95, sides: 6, caps: true });
  for (const sx of [-1, 1]) b.log(rope, new Vector3(sx * H, y - 0.11, -H - 0.12), new Vector3(sx * H, y - 0.11, H + 0.12), 0.13, { sides: 6, taper: 1 });
  const g = b.build();
  g.name = `CaveMount${slot}`;
  // Team pennant on a short pole at the back corner.
  const pole = new PieceBuilder().log(bark, new Vector3(-H, y - 0.1, -H), new Vector3(-H, y + 1.5, -H), 0.04, { taper: 1 }).build();
  g.add(pole);
  const flagGeo = new PlaneGeometry(0.7, 0.34);
  flagGeo.translate(0.35, -0.17, 0);
  const flag = new Mesh(flagGeo, teamClothMaterial(tint));
  flag.name = 'TeamColor';
  flag.position.set(-H, y + 1.5, -H);
  flag.castShadow = true;
  g.add(flag);
  return g;
}

function weaponGroup(): Group {
  const w = new Group();
  w.name = 'Weapon';
  w.position.set(0, TURRET_MUZZLE, 0);
  return w;
}

function finish(root: Group, name: string): Group {
  root.name = name;
  root.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return root;
}

/** Rock Slingshot: a big forked branch with a hide band, a pile of rocks at its foot. */
export function createRockSlingshot(): Group {
  const root = new Group();
  const base = new PieceBuilder();
  for (let i = 0; i < 5; i++) base.place(age1Material('stone'), new SphereGeometry(0.13 + (i % 2) * 0.04, 6, 4), new Vector3(-0.5 + (i % 3) * 0.15, 0.1, -0.4 + i * 0.18));
  root.add(base.build());
  const w = weaponGroup();
  const b = new PieceBuilder();
  const wood = age1Material('bark');
  b.log(wood, new Vector3(0, -TURRET_MUZZLE, 0), new Vector3(0, 0.2, 0), 0.1, { taper: 0.85 });
  for (const s of [-1, 1]) b.log(wood, new Vector3(0, 0.15, 0), new Vector3(0.15, 0.85, 0.42 * s), 0.07, { taper: 0.7 });
  for (const s of [-1, 1]) b.log(age1Material('hide'), new Vector3(0.15, 0.8, 0.42 * s), new Vector3(-0.35, 0.55, 0.05 * s), 0.025, { sides: 4, taper: 1 });
  b.place(age1Material('hide'), new SphereGeometry(0.09, 6, 4), new Vector3(-0.38, 0.55, 0), 0, new Vector3(1, 0.6, 1.4));
  w.add(b.build());
  const stone = new Mesh(new SphereGeometry(0.1, 6, 4), age1Material('stone'));
  stone.name = 'NockedArrow';
  stone.position.set(-0.36, 0.58, 0);
  w.add(stone);
  root.add(w);
  return finish(root, 'RockSlingshot');
}

/** Egg Automatic: a crate cage with a big angry bird inside; the bird is the weapon. */
export function createEggAutomatic(tint: number): Group {
  const root = new Group();
  const b = new PieceBuilder();
  const log = age1Material('log');
  const S = 0.5;
  for (const [x, z] of [[-S, -S], [S, -S], [S, S], [-S, S]] as const) b.log(log, new Vector3(x, 0, z), new Vector3(x, 1.1, z), 0.05, { taper: 1 });
  for (const y of [0.05, 1.1]) {
    for (const [ax, az, bx, bz] of [[-S, -S, S, -S], [S, -S, S, S], [S, S, -S, S], [-S, S, -S, -S]] as const) b.log(log, new Vector3(ax, y, az), new Vector3(bx, y, bz), 0.045, { taper: 1 });
  }
  b.place(age1Material('thatch'), new BoxGeometry(0.9, 0.08, 0.9), new Vector3(0, 0.1, 0));
  root.add(b.build());
  const w = weaponGroup();
  const bird = new PieceBuilder();
  const feathers = age1Material('hide').clone();
  feathers.color.setHex(0x8a5a2e);
  bird.place(feathers, new SphereGeometry(0.32, 10, 8), new Vector3(-0.05, 0, 0), 0, new Vector3(1.15, 0.95, 0.9));
  bird.place(feathers, new SphereGeometry(0.2, 9, 7), new Vector3(0.3, 0.25, 0));
  const beak = new ConeGeometry(0.07, 0.25, 6);
  beak.rotateZ(-Math.PI / 2);
  const beakMat = age1Material('wattle').clone();
  beakMat.color.setHex(0xe0a020);
  bird.place(beakMat, beak, new Vector3(0.56, 0.22, 0));
  bird.place(teamClothMaterial(tint), new ConeGeometry(0.08, 0.25, 5), new Vector3(0.28, 0.5, 0));
  for (const z of [-0.09, 0.09]) bird.place(age1Material('charred'), new SphereGeometry(0.03, 5, 4), new Vector3(0.45, 0.31, z));
  w.add(bird.build());
  root.add(w);
  return finish(root, 'EggAutomatic');
}

/** Primitive Catapult: a bone-and-log frame with a throwing arm and a boulder in its cup. */
export function createPrimitiveCatapult(): Group {
  const root = new Group();
  const b = new PieceBuilder();
  const log = age1Material('log');
  const bone = age1Material('wattle').clone();
  bone.color.setHex(0xe8dcc0);
  for (const z of [-0.45, 0.45]) {
    b.log(log, new Vector3(-0.8, 0.08, z), new Vector3(0.8, 0.08, z), 0.08, { taper: 1, caps: true });
    b.log(bone, new Vector3(-0.3, 0.08, z), new Vector3(0, 0.75, z), 0.05, { taper: 0.8 });
    b.log(bone, new Vector3(0.3, 0.08, z), new Vector3(0, 0.75, z), 0.05, { taper: 0.8 });
  }
  b.log(log, new Vector3(0, 0.72, -0.5), new Vector3(0, 0.72, 0.5), 0.06, { taper: 1 });
  root.add(b.build());
  const w = weaponGroup();
  w.position.y = 0.72;
  const arm = new PieceBuilder();
  arm.log(bone, new Vector3(0.4, -0.15, 0), new Vector3(-1.0, 0.45, 0), 0.06, { taper: 0.7 });
  arm.place(age1Material('hide'), new SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new Vector3(-1.0, 0.5, 0));
  w.add(arm.build());
  const rock = new Mesh(new SphereGeometry(0.2, 7, 5), age1Material('stone'));
  rock.name = 'NockedArrow';
  rock.position.set(-1.0, 0.6, 0);
  w.add(rock);
  root.add(w);
  return finish(root, 'PrimitiveCatapult');
}

export type TurretFactory = (tint: number) => Object3D;
