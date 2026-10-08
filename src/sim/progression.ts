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

/** Units of every reached age are trainable (the original has no XP unlocks inside an age). */
export function isUnitUnlocked(content: Content, ts: TeamState, unitId: string): boolean {
  for (let i = 0; i <= ts.ageIndex; i++) if (content.ages[i]!.units.includes(unitId)) return true;
  return false;
}

/** Turrets of the current age can be built. */
export function isTurretAvailable(content: Content, ts: TeamState, turretId: string): boolean {
  return currentAge(content, ts).turrets.includes(turretId);
}

/** XP needed to leave the current age (null in the last age, where evolving is not possible). */
export function xpToEvolve(content: Content, ts: TeamState, fallback: number | null): number | null {
  return nextAge(content, ts)?.xpRequired ?? fallback;
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
