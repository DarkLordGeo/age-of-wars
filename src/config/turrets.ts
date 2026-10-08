import { u } from './original';
import type { TurretDef } from './schema';

/**
 * Age 1 turrets (docs/AGE1_SPEC.md sections 5-7, source: Age-of-war-unity-clone Data.cs /
 * Turret.cs). Fire interval = speed + additional / (41 * 2); the clone's author notes these
 * were partly tuned by eye, so treat them as approximate.
 */
export const TURRETS: Record<string, TurretDef> = {
  rock_slingshot: {
    id: 'rock_slingshot',
    name: 'Rock Slingshot',
    modelKey: 'turret.rock_slingshot',
    cost: 100,
    damage: 12,
    range: u(350),
    firstShot: 0.1,
    interval: 0.8 + 30 / 82,
    projectileId: 'rock',
  },
  egg_automatic: {
    id: 'egg_automatic',
    name: 'Egg Automatic',
    modelKey: 'turret.egg_automatic',
    cost: 200,
    damage: 5,
    range: u(300),
    firstShot: 0,
    interval: 0.25 + 11 / 82,
    projectileId: 'egg',
  },
  primitive_catapult: {
    id: 'primitive_catapult',
    name: 'Primitive Catapult',
    modelKey: 'turret.primitive_catapult',
    cost: 500,
    damage: 25,
    range: u(380),
    firstShot: 0.17,
    interval: 1.37 + 20 / 82,
    projectileId: 'boulder',
    minAimDistanceSlot0: u(70),
  },
};
