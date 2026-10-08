import type { ProjectileDef } from '../config/schema';
import type { Team } from './types';

/**
 * In-flight projectile, pooled by World (fields reset in World).
 * - Turret projectiles (`physical`) fly in a straight line and hit the first enemy unit whose
 *   body they touch; they never hit bases, and vanish after GAME.projectileLifetime.
 * - Cosmetic projectiles (the Slingshot Man's stone, whose damage is instant) arc from the
 *   shooter to a fixed point and simply land.
 */
export class Projectile {
  id = 0;
  def!: ProjectileDef;
  team: Team = 'player';
  physical = true;
  damage = 0;
  x = 0;
  y = 0;
  z = 0;
  /** Velocity (m/s), also used by renderers to orient the projectile. */
  vx = 0;
  vy = 0;
  vz = 0;
  age = 0;
  // cosmetic flight
  sx = 0;
  sy = 0;
  sz = 0;
  tx = 0;
  ty = 0;
  tz = 0;
  /** Seconds the cosmetic flight takes. */
  flight = 1;
}
