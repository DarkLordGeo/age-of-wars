import { nextAge } from '../sim/progression';
import type { Team } from '../sim/types';
import type { World } from '../sim/World';

/**
 * Evolve button tooltip. While the current age is the last one defined (Age 1 is the only
 * playable age so far), say that the next age isn't available instead of offering an evolve
 * that can never happen; the XP target from the spec is still shown as progress.
 */
export function evolveTip(world: World, team: Team = 'player'): string {
  const ts = world.teams[team];
  const next = nextAge(world.content, ts);
  if (next) return ts.xp >= next.xpRequired ? `Evolve to ${next.name}` : `Evolve to ${next.name} (${next.xpRequired} XP)`;
  const need = world.xpToEvolve(team);
  return need == null ? 'Final age reached' : `Next age not available yet (${Math.floor(ts.xp)} / ${need} XP)`;
}
