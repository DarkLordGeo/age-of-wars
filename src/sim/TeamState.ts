import type { Content, ModScope, ModStat } from '../config/schema';
import type { Team } from './types';

export interface QueueItem {
  defId: string;
  remaining: number;
  total: number;
}

interface StatMod {
  add: number;
  mul: number;
}

const SCOPES: ModScope[] = ['units', 'turrets', 'base'];
const STATS: ModStat[] = ['damage', 'maxHealth', 'speed', 'range', 'cooldown', 'income'];

/** Everything one side owns that is not on the battlefield: economy, progression, production. */
export class TeamState {
  gold: number;
  xp = 0;
  ageIndex = 0;
  /** Only the head item progresses; the rest wait their turn. */
  readonly queue: QueueItem[] = [];
  readonly upgrades = new Set<string>();
  private readonly mods = {} as Record<ModScope, Record<ModStat, StatMod>>;

  constructor(
    readonly team: Team,
    startGold: number,
    readonly incomeMultiplier: number,
  ) {
    this.gold = startGold;
    this.resetMods();
  }

  /** Apply owned-upgrade modifiers to a base stat value. */
  stat(scope: ModScope, stat: ModStat, base: number): number {
    const m = this.mods[scope][stat];
    return (base + m.add) * m.mul;
  }

  rebuildModifiers(content: Content): void {
    this.resetMods();
    for (const id of this.upgrades) {
      const def = content.upgrades[id];
      if (!def) continue;
      for (const e of def.effects) {
        const m = this.mods[e.scope][e.stat];
        if (e.op === 'add') m.add += e.value;
        else m.mul *= e.value;
      }
    }
  }

  private resetMods(): void {
    for (const scope of SCOPES) {
      const row = {} as Record<ModStat, StatMod>;
      for (const stat of STATS) row[stat] = { add: 0, mul: 1 };
      this.mods[scope] = row;
    }
  }
}
