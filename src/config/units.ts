import { frames, u } from './original';
import type { UnitDef } from './schema';

/**
 * Age 1 roster, from the original game's data (docs/AGE1_SPEC.md sections 2-4, source:
 * erupturatis/Age-of-war-unity-clone Data.cs / Troop.cs). Distances converted with `u()`,
 * frame counts with `frames()`. Hit interval = melee_speed + attack_pause / 41.
 */

/** Every unit walks at 40 original units/s. */
const SPEED = u(40);

export const UNITS: Record<string, UnitDef> = {
  clubman: {
    id: 'clubman',
    name: 'Clubman',
    role: 'melee',
    modelKey: 'unit.clubman',
    cost: 15,
    spawnTime: frames(40),
    maxHealth: 55,
    speed: SPEED,
    length: u(20),
    height: 1.8,
    melee: { damage: 16, range: u(20), firstHit: 0.43, interval: 1 + frames(20) },
  },
  slingshot: {
    id: 'slingshot',
    name: 'Slingshot Man',
    role: 'ranged',
    modelKey: 'unit.slingshot',
    cost: 25,
    spawnTime: frames(40),
    maxHealth: 42,
    speed: SPEED,
    length: u(20),
    height: 1.8,
    melee: { damage: 10, range: u(20), firstHit: 0.43, interval: 1 + frames(20) },
    ranged: {
      damage: 8,
      range: u(100),
      intervalStanding: 0.8 + frames(20),
      intervalWalking: 1.07 + frames(20),
      projectileId: 'sling_stone',
    },
  },
  dino: {
    id: 'dino',
    name: 'Dino Rider',
    role: 'tank',
    modelKey: 'unit.dino',
    cost: 100,
    spawnTime: frames(100),
    maxHealth: 160,
    speed: SPEED,
    length: u(80),
    height: 3.2,
    melee: { damage: 40, range: u(20), firstHit: 0.32, interval: 1.12 + frames(45) },
  },
};
