import { u } from './original';
import type { ProjectileDef } from './schema';

/**
 * Turret projectiles fly straight at 250 original units/s and hit the first enemy they touch
 * (docs/AGE1_SPEC.md section 8). `sling_stone` is the Slingshot Man's stone: a real projectile on
 * a ballistic arc (`speed` is its horizontal speed) that deals damage only if it hits. This is a
 * deliberate change from the original, where his ranged hits were instant.
 */
const TURRET_SPEED = u(250);

export const PROJECTILES: Record<string, ProjectileDef> = {
  rock: { id: 'rock', speed: TURRET_SPEED, size: 0.32, color: 0x8a8378, gravity: 0, shape: 'stone' },
  egg: { id: 'egg', speed: TURRET_SPEED, size: 0.24, color: 0xf3ead2, gravity: 0, shape: 'egg' },
  boulder: { id: 'boulder', speed: TURRET_SPEED, size: 0.7, color: 0x7d776c, gravity: 0, shape: 'boulder' },
  sling_stone: { id: 'sling_stone', speed: 14, size: 0.16, color: 0x8f877a, gravity: 9.8, shape: 'stone', persists: true },
};
