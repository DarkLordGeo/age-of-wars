/**
 * Physical feel per unit type (lightweight, no physics engine). Values are tunable here only.
 *
 * - `accel` / `decel` (m/s^2): the sim ramps a unit's walking speed up to its spec speed and brakes
 *   so it still stops exactly at the spacing gap (it never overshoots). Light cavemen reach full
 *   speed almost at once; the Dino Rider takes about a second. This is real sim movement.
 * - `turnRate` (rad/s): how fast the model turns to face its target (render).
 * - `knockResist` (0..1): share of a blow's knock-back the unit ignores (render-only push; the sim's
 *   lane position never changes on hits, as in the original game).
 * - `mass` (kg) is descriptive: it is what the other numbers were chosen from.
 * - `walk` (optional, melee units): a walking gait for short approaches. Units run over long
 *   distances and drop to a walk when the free room ahead is short and what is ahead is not
 *   running away (the enemy front, a stopped or walking ally in the queue, the enemy base).
 */
export interface UnitPhysics {
  mass: number;
  accel: number;
  decel: number;
  turnRate: number;
  knockResist: number;
  walk?: Gait;
}

/**
 * Walking gait (sim): `speed` (m/s) while walking. A runner drops to a walk when the free room
 * ahead falls below `enter` (m) and runs again once it exceeds `exit` (m) or the ally ahead runs
 * off; `exit` > `enter` plus the minimum `hold` (s) in a gait keep it from flickering at the
 * threshold. Speed changes between gaits use the unit's accel/decel, so the switch is smooth.
 */
export interface Gait {
  speed: number;
  enter: number;
  exit: number;
  hold: number;
}

export const UNIT_PHYSICS: Record<string, UnitPhysics> = {
  clubman: { mass: 70, accel: 18, decel: 22, turnRate: 9, knockResist: 0, walk: { speed: 1.5, enter: 2.4, exit: 4, hold: 0.4 } },
  slingshot: { mass: 65, accel: 20, decel: 24, turnRate: 9.5, knockResist: 0 },
  dino: { mass: 1200, accel: 3.6, decel: 4.5, turnRate: 3, knockResist: 0.85 },
};

/** Fallback for unit types without an entry (instant start/stop, like the original game). */
export const DEFAULT_PHYSICS: UnitPhysics = { mass: 70, accel: Infinity, decel: Infinity, turnRate: 7, knockResist: 0 };

export function physicsOf(unitId: string): UnitPhysics {
  return UNIT_PHYSICS[unitId] ?? DEFAULT_PHYSICS;
}

/**
 * Knock-back (m) a blow of `damage` gives a unit with `knockResist`: grows with the blow's
 * strength (a Dino Rider's 40 shoves a caveman ~0.35 m; a club's 16 ~0.2 m), capped, then reduced
 * by the target's resistance.
 */
export const KNOCKBACK = { perSqrtDamage: 0.055, max: 0.38 };

export function knockbackFor(damage: number, knockResist: number): number {
  return Math.min(KNOCKBACK.max, KNOCKBACK.perSqrtDamage * Math.sqrt(Math.max(0, damage))) * (1 - knockResist);
}
