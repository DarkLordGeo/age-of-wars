import type { ClipName } from '../assets/contract';

/**
 * Occasional idle variations (e.g. Mixamo's "Warming Up") per unit type. A unit plays one only
 * while it stands idle and out of combat (sim state `waiting`), and stops it (blending out) the
 * moment it has to move, attack, get hit or die.
 *
 * Frequency: after `minIdle` seconds standing idle, the clip starts with `chancePerSecond`
 * (a random decision every frame), at most once per cooldown, drawn per play from `cooldown`
 * (seconds, counted from the start of the previous play). Each unit has its own random stream
 * (seeded by its id) and starts with a random part of a cooldown already elapsed, so units that
 * spawn or stop together do not warm up together.
 */
export interface IdleVariation {
  clip: ClipName;
  minIdle: number;
  chancePerSecond: number;
  cooldown: [number, number];
}

export const IDLE_VARIATIONS: Record<string, IdleVariation> = {
  clubman: { clip: 'warmup', minIdle: 4, chancePerSecond: 0.08, cooldown: [30, 60] },
};
