import type { TurretDef } from '../config/schema';
import type { Team } from './types';

export class Turret {
  cooldown = 0;

  constructor(
    readonly index: number,
    readonly def: TurretDef,
    readonly x: number,
    readonly z: number,
  ) {}
}

export class Base {
  health: number;
  turrets: Turret[] = [];

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
