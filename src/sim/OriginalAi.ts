import type { AiProfile } from '../config/schema';
import { createRng } from './rng';
import { currentAge } from './progression';
import type { Team } from './types';
import type { World } from './World';

/**
 * The original game's opponent (docs/AGE1_SPEC.md section 10): each `rollInterval` seconds a
 * `spawnChance` roll trains a random unit among the tiers unlocked so far, but only while it has
 * fewer than `maxUnits` on the field; turrets follow a fixed script. It does not spend gold
 * (units and turrets are free for it). Works for either team, so the menu's background battle
 * can run two of them.
 */
export class OriginalAi {
  private readonly rng: () => number;
  /** Seconds into the current age. */
  private ageTime = 0;
  private rollTimer: number;
  private nextScript = 0;

  constructor(
    private readonly world: World,
    readonly profile: AiProfile,
    readonly team: Team = 'enemy',
  ) {
    this.rng = createRng(profile.seed);
    this.rollTimer = profile.rollInterval;
  }

  update(dt: number): void {
    const w = this.world;
    const p = this.profile;
    this.ageTime += dt;

    // Scripted turrets.
    while (this.nextScript < p.turretScript.length && p.turretScript[this.nextScript]!.at <= this.ageTime) {
      const step = p.turretScript[this.nextScript++]!;
      if (step.action === 'sell') w.sellTurret(this.team, step.slot, { refund: false });
      else w.buildTurret(this.team, step.turretId, step.slot, { free: true });
    }

    // Spawn rolls.
    this.rollTimer -= dt;
    if (this.rollTimer > 0) return;
    this.rollTimer += p.rollInterval;
    const roll = this.rng();
    if (roll >= p.spawnChance || w.alive[this.team].length >= p.maxUnits) return;
    const units = currentAge(w.content, w.teams[this.team]).units;
    let unlocked = 0;
    for (let i = 0; i < units.length; i++) if (this.ageTime >= (p.tierUnlock[i] ?? Infinity)) unlocked = i;
    const id = units[Math.floor(this.rng() * (unlocked + 1))];
    if (id) w.enqueueUnit(this.team, id, { free: true });
  }
}
