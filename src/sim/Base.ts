import type { TurretDef } from '../config/schema';
import type { Team } from './types';

/** A turret built on one slot of a base's tower. */
export class Turret {
  /** Seconds to the next shot; null while no target has been in range (routine idle). */
  timer: number | null = null;

  constructor(
    readonly slot: number,
    readonly def: TurretDef,
    /** Muzzle position: lane x, height on the tower, lateral z. */
    readonly x: number,
    readonly y: number,
    readonly z: number,
  ) {}
}

export class Base {
  health: number;
  /** Number of turret slots bought (the first is free). */
  slots = 1;
  /** One entry per possible slot; null = empty (or not bought yet). */
  readonly turrets: Array<Turret | null> = [null, null, null, null];

  constructor(
    readonly team: Team,
    readonly x: number,
    readonly radius: number,
    public maxHealth: number,
  ) {
    this.health = maxHealth;
  }

  get destroyed(): boolean {
    return this.health <= 0;
  }
}
