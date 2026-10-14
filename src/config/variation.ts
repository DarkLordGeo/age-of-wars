import { createRng } from '../sim/rng';

/**
 * Small per-unit differences so a stream of identical units does not move as one machine:
 * each unit leaves its base door after its own short delay, accelerates and brakes a little
 * differently, and is a little taller or shorter (its walk and run cadence follow its size, so
 * strides stay matched to the ground). Top speed, health and combat are not varied.
 *
 * Deterministic: derived from the match seed and the unit's id only (its own random stream, so
 * the world's and the AI's random draws are untouched and replays match).
 */
export const UNIT_VARIATION = {
  /** Seconds a unit may wait at the door before it sets off (0..departMax). */
  departMax: 1.5,
  /** Acceleration and braking: x (1 +- this). */
  accel: 0.1,
  decel: 0.1,
  /** Body size (and so stride length): x (1 +- this). */
  bodyScale: 0.03,
};

export interface UnitVariation {
  departDelay: number;
  accelScale: number;
  decelScale: number;
  bodyScale: number;
}

export function unitVariation(seed: number, unitId: number, cfg = UNIT_VARIATION): UnitVariation {
  const r = createRng(((seed * 2654435761) ^ (unitId * 40503 + 0x7f4a7c15)) >>> 0);
  const spread = (k: number) => 1 + (r() * 2 - 1) * k;
  return { departDelay: r() * cfg.departMax, accelScale: spread(cfg.accel), decelScale: spread(cfg.decel), bodyScale: spread(cfg.bodyScale) };
}
