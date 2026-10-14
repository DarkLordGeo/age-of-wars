import type { UnitDef } from '../config/schema';
import type { Team, UnitState } from './types';

/**
 * One soldier on the lane. `x` is the unit's FRONT (the end facing the enemy); its body extends
 * `def.length` behind it. Attack timers are null while the corresponding routine is idle,
 * mirroring the original game's coroutines (docs/AGE1_SPEC.md section 9).
 */
export class Unit {
  health: number;
  state: UnitState = 'advancing';
  /** True while walking this tick (ranged units use the slower walking fire rate). */
  moving = true;
  /** Current walking speed (m/s): ramps up/down with the unit's acceleration (config/physics.ts). */
  vel = 0;
  /** Locomotion gait (units with a walking gait in config/physics.ts; others always run). */
  gait: 'run' | 'walk' = 'run';
  /** Seconds in the current gait (decides immediately at spawn). */
  gaitFor = Infinity;
  /** Seconds left to wait at the base door before setting off (config/variation.ts). */
  departIn = 0;
  /** Per-unit variation (config/variation.ts): acceleration, braking and body size factors. */
  accelScale = 1;
  decelScale = 1;
  bodyScale = 1;
  /** Seconds to the next melee hit / ranged shot; null when that routine is not running. */
  meleeTimer: number | null = null;
  rangedTimer: number | null = null;
  /** Seconds since death (only meaningful when state === 'dead'). */
  deadFor = 0;
  /** Position in the team's lane-sorted list (maintained by World). */
  laneIndex = 0;

  constructor(
    readonly id: number,
    readonly def: UnitDef,
    readonly team: Team,
    public x: number,
    readonly z: number,
    readonly maxHealth: number,
    /** Damage multiplier (difficulty for the AI side, upgrades). */
    readonly damageMultiplier = 1,
  ) {
    this.health = maxHealth;
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** Lane x of the body centre (for aiming and visuals). */
  centerX(dir: 1 | -1): number {
    return this.x - (dir * this.def.length) / 2;
  }
}
