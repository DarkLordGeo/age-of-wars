import type { AiProfile, Role, UnitDef } from '../config/schema';
import { createRng } from './rng';
import type { World } from './World';

/**
 * Opponent controller. Uses exactly the public commands the player has (enqueueUnit,
 * purchaseUpgrade, advanceAge) and spends its own gold; behaviour is driven by an AiProfile.
 */
export class EnemyAi {
  private timer: number;
  private readonly rng: () => number;
  private readonly counts: Record<Role, number> = { melee: 0, ranged: 0, tank: 0 };

  constructor(
    private readonly world: World,
    readonly profile: AiProfile,
  ) {
    this.rng = createRng(profile.seed);
    this.timer = profile.thinkInterval;
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.profile.thinkInterval * (0.85 + 0.3 * this.rng());
    this.think();
  }

  private think(): void {
    const w = this.world;
    const p = this.profile;
    const me = w.teams.enemy;

    if (w.canAdvanceAge('enemy')) w.advanceAge('enemy');

    const myPower = power(w.alive.enemy);
    const foePower = power(w.alive.player);
    const foeFront = w.alive.player[w.alive.player.length - 1];
    const myBase = w.bases.enemy;
    const threatened = !!foeFront && foeFront.x > myBase.x - myBase.radius - p.threatDistance;
    const winning = myPower / (foePower + 1) >= p.aggressionRatio && foePower > 0;

    if (p.buyUpgrades && !threatened) {
      for (const up of w.availableUpgrades('enemy')) {
        if (me.gold >= up.cost + p.goldReserve) {
          w.purchaseUpgrade('enemy', up.id);
          break;
        }
      }
    }

    const reserve = threatened ? 0 : p.goldReserve;
    for (let guard = 0; guard < p.maxQueue && me.queue.length < p.maxQueue; guard++) {
      const def = this.pickUnit(threatened, winning);
      if (!def || me.gold < def.cost + reserve) break;
      if (w.enqueueUnit('enemy', def.id) !== 'ok') break;
    }
  }

  /** Score unlocked units by how far each role is under its desired share, plus the situation. */
  private pickUnit(threatened: boolean, winning: boolean): UnitDef | null {
    const w = this.world;
    const p = this.profile;
    const me = w.teams.enemy;

    this.counts.melee = this.counts.ranged = this.counts.tank = 0;
    let total = 1;
    for (const u of w.alive.enemy) {
      this.counts[u.def.role]++;
      total++;
    }
    for (const q of me.queue) {
      this.counts[w.content.units[q.defId]!.role]++;
      total++;
    }

    const unlocked = Object.values(w.content.units).filter((u) => w.unitUnlocked('enemy', u.id));
    const pool = threatened ? unlocked.filter((u) => u.cost <= me.gold) : unlocked;
    if (pool.length === 0) return null;

    const minSpawn = Math.min(...pool.map((u) => u.spawnTime));
    const maxCost = Math.max(...pool.map((u) => u.cost));
    let best: UnitDef | null = null;
    let bestScore = -Infinity;
    for (const u of pool) {
      let score = p.roleMix[u.role] - this.counts[u.role] / total;
      if (threatened) score += p.reactivity * (minSpawn / u.spawnTime);
      else if (winning) score += p.reactivity * (u.cost / maxCost);
      score += p.randomness * this.rng();
      if (score > bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return best;
  }
}

function power(units: readonly { health: number }[]): number {
  let sum = 0;
  for (const u of units) sum += u.health;
  return sum;
}

