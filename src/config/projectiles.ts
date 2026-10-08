import { u } from './original';
import type { ProjectileDef } from './schema';

/**
 * Turret projectiles fly straight at 250 original units/s and hit the first enemy they touch
 * (docs/AGE1_SPEC.md section 8). `sling_stone` is the cosmetic stone of the Slingshot Man,
 * whose hits are instant.
 */
const TURRET_SPEED = u(250);

export const PROJECTILES: Record<string, ProjectileDef> = {
  rock: { id: 'rock', speed: TURRET_SPEED, size: 0.32, color: 0x8a8378, arcHeight: 0, shape: 'stone' },
  egg: { id: 'egg', speed: TURRET_SPEED, size: 0.24, color: 0xf3ead2, arcHeight: 0, shape: 'egg' },
  boulder: { id: 'boulder', speed: TURRET_SPEED, size: 0.7, color: 0x7d776c, arcHeight: 0, shape: 'boulder' },
  sling_stone: { id: 'sling_stone', speed: 24, size: 0.16, color: 0x8f877a, arcHeight: 1.0, shape: 'stone' },
};
