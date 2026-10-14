import type { IdleVariation } from '../config/idle';

/**
 * Decides when one unit plays its idle variation (config/idle.ts). Pure and deterministic for a
 * given random source, so tests can replay it.
 */
export class IdleScheduler {
  /** Seconds the unit has stood idle (reset by anything else). */
  private idleFor = 0;
  /** Seconds until the variation may play again. */
  private wait: number;

  constructor(
    readonly cfg: IdleVariation,
    private readonly random: () => number,
  ) {
    // A random share of a cooldown has already passed: units bound together are out of step.
    this.wait = random() * cfg.cooldown[1];
  }

  /** Advance by `dt`; true when the variation should start now. `idle`: standing idle, nothing else playing. */
  update(dt: number, idle: boolean): boolean {
    this.wait -= dt;
    if (!idle) {
      this.idleFor = 0;
      return false;
    }
    this.idleFor += dt;
    if (this.idleFor < this.cfg.minIdle || this.wait > 0) return false;
    if (this.random() >= 1 - Math.exp(-this.cfg.chancePerSecond * dt)) return false;
    const [lo, hi] = this.cfg.cooldown;
    this.wait = lo + this.random() * (hi - lo);
    this.idleFor = 0;
    return true;
  }
}
