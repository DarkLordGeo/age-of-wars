import type { UnitDef } from '../config/schema';
import type { Team, UnitState } from './types';

export class Unit {
  health: number;
  /** Seconds until the next attack is allowed. */
  cooldown = 0;
  state: UnitState = 'advancing';
  /** Seconds since death (only meaningful when state === 'dead'). */
  deadFor = 0;
  /** Team that last damaged this unit; receives the kill reward. */
  lastHitBy: Team | null = null;
  /** Position in the team's lane-sorted list (maintained by World). */
  laneIndex = 0;

  constructor(
    readonly id: number,
    readonly def: UnitDef,
    readonly team: Team,
    public x: number,
    readonly z: number,
    readonly maxHealth: number,
  ) {
    this.health = maxHealth;
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }
}
