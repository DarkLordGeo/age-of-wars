import { MathUtils } from 'three';

/** Half-width (m) of the flat, prop-free corridor around the lane. */
export const LANE_CLEARANCE = 9;

/**
 * Ground height at (x, z). The lane corridor is dead flat so gameplay and camera
 * framing stay predictable; terrain rises with distance, much more steeply behind the
 * lane (-z, away from the camera) than in front.
 */
export function terrainHeight(x: number, z: number): number {
  const away = MathUtils.smoothstep(Math.abs(z), 7, 36);
  if (away === 0) return 0;
  const side = z < 0 ? 1 : 0.3;
  const swell = 0.5 + 0.5 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.07);
  const bumps = Math.sin(x * 0.17 + z * 0.11) * 0.8 + Math.sin(x * 0.09 - z * 0.19) * 1.1;
  return away * side * (7 * away + 4 * swell + bumps);
}
