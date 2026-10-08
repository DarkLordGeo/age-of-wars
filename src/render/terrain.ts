import { MathUtils } from 'three';
import { GAME } from '../config/game';
import { SETTLEMENT } from './age1/settlement';

/** Half-width (m) of the flat, prop-free corridor around the lane. */
export const LANE_CLEARANCE = 9;

/** Half-width (m) of the worn footpath the units walk on (units spread +-GAME.laneHalfWidth). */
export const PATH_HALF_WIDTH = 3.1;

/** Radius (m) of each camp's palisade ring; ground inside is flat, trampled and prop-free. */
export const CAMP_RADIUS = SETTLEMENT.ringRadius;

/** Centre line of the footpath: a gentle meander that stays well inside the unit lane. */
export function pathCenterZ(x: number): number {
  return 0.45 * Math.sin(x * 0.07 + 0.4) + 0.2 * Math.sin(x * 0.19 + 1.1);
}

/** Distance from (x, z) to the nearer camp's ring centre (the ring sits behind each base). */
export function campDistance(x: number, z: number): number {
  const cx = GAME.baseOffset - SETTLEMENT.ringX; // ring centre is ringX "forward" of the base, i.e. behind it
  return Math.min(Math.hypot(x + cx, z), Math.hypot(x - cx, z));
}

/**
 * Ground height at (x, z). The lane corridor and both camps are dead flat so gameplay, the
 * procedural buildings and camera framing stay predictable; terrain rises with distance, much
 * more steeply behind the lane (-z, away from the camera) than in front.
 */
export function terrainHeight(x: number, z: number): number {
  const away = MathUtils.smoothstep(Math.abs(z), 7, 36);
  if (away === 0) return 0;
  const campFlat = MathUtils.smoothstep(campDistance(x, z), CAMP_RADIUS + 0.5, CAMP_RADIUS + 9);
  if (campFlat === 0) return 0;
  const side = z < 0 ? 1 : 0.3;
  const swell = 0.5 + 0.5 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.07);
  const bumps = Math.sin(x * 0.17 + z * 0.11) * 0.8 + Math.sin(x * 0.09 - z * 0.19) * 1.1;
  return campFlat * away * side * (7 * away + 4 * swell + bumps);
}
