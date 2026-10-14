import type { ProjectileDef } from '../config/schema';
import type { Team } from './types';

/**
 * In-flight projectile, pooled by World (fields reset in World). Every projectile is physical:
 * it moves each step (straight for turrets, a ballistic arc under `def.gravity` for the Slingshot
 * Man's stone) and deals its damage once, to the first enemy hitbox its path crosses (swept, so a
 * fast shot cannot skip through a unit). A miss lands on the ground and deals nothing.
 * Turret shots never hit bases (docs/AGE1_SPEC.md section 8); unit shots can.
 */
export class Projectile {
  id = 0;
  def!: ProjectileDef;
  team: Team = 'player';
  damage = 0;
  /** Unit shots can hit the enemy base; turret shots cannot. */
  hitsBase = false;
  x = 0;
  y = 0;
  z = 0;
  /** Velocity (m/s), also used by renderers to orient the projectile. */
  vx = 0;
  vy = 0;
  vz = 0;
  age = 0;
}
