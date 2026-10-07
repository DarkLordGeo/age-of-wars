import type { AgeDef, Content, UpgradeDef } from '../config/schema';
import type { TeamState } from './TeamState';

export function currentAge(content: Content, ts: TeamState): AgeDef {
  return content.ages[ts.ageIndex]!;
}

export function nextAge(content: Content, ts: TeamState): AgeDef | null {
  return content.ages[ts.ageIndex + 1] ?? null;
}

export function canAdvanceAge(content: Content, ts: TeamState): boolean {
  const next = nextAge(content, ts);
  return next !== null && ts.xp >= next.xpRequired;
}

/** XP needed to unlock `unitId`, or null if no reached age offers it. */
export function unitUnlockXp(content: Content, ts: TeamState, unitId: string): number | null {
  for (let i = 0; i <= ts.ageIndex; i++) {
    for (const u of content.ages[i]!.units) if (u.unitId === unitId) return u.unlockXp;
  }
  return null;
}

export function isUnitUnlocked(content: Content, ts: TeamState, unitId: string): boolean {
  const need = unitUnlockXp(content, ts, unitId);
  return need !== null && ts.xp >= need;
}

/** Upgrades offered by reached ages that are not yet owned and whose prerequisites are met. */
export function availableUpgrades(content: Content, ts: TeamState): UpgradeDef[] {
  const out: UpgradeDef[] = [];
  for (let i = 0; i <= ts.ageIndex; i++) {
    for (const id of content.ages[i]!.upgrades) {
      const up = content.upgrades[id];
      if (!up || ts.upgrades.has(id)) continue;
      if (up.requires && !up.requires.every((r) => ts.upgrades.has(r))) continue;
      out.push(up);
    }
  }
  return out;
}
