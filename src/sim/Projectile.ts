import type { ProjectileDef } from '../config/schema';
import type { Unit } from './Unit';
import type { Team } from './types';

/**
 * In-flight projectile. Homes on its target's position each tick; if a unit target dies in
 * flight it flies on to the last known point and lands as a miss. Instances are pooled by
 * World, so fields are reset in `World.launchProjectile`.
 */
export class Projectile {
  id = 0;
  def!: ProjectileDef;
  team: Team = 'player';
  damage = 0;
  x = 0;
  y = 0;
  z = 0;
  /** Velocity (m/s), exposed so renderers can orient the projectile. */
  vx = 0;
  vy = 0;
  vz = 0;
  startY = 0;
  /** Horizontal distance to the target at launch (for arc progress). */
  d0 = 1;
  /** Last known aim point. */
  tx = 0;
  ty = 0;
  tz = 0;
  targetUnit: Unit | null = null;
  targetBase: Team | null = null;
  /** True once the original target is gone. */
  lost = false;
}
