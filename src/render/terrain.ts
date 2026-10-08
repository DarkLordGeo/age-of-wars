import { MathUtils } from 'three';
import { GAME } from '../config/game';
import { SETTLEMENT } from './age1/settlement';

/** Half-width (m) of the flat, prop-free corridor around the lane. */
export const LANE_CLEARANCE = 9;

/** Half-width (m) of the worn footpath the units walk on (units spread +-GAME.laneHalfWidth). */
export const PATH_HALF_WIDTH = 3.1;

/** Radius (m) of each camp's palisade ring; ground inside is flat, trampled and prop-free. */
export const CAMP_RADIUS = SETTLEMENT.ringRadius;

/**
 * Centre line of the footpath: a real meander (up to ~3.3 m) that straightens out into each
 * camp. Render-only: units and projectiles are drawn offset by it (UnitView, ProjectileRenderer)
 * so they walk the path; the simulation lane stays straight.
 */
export function pathCenterZ(x: number): number {
  const envelope = 1 - MathUtils.smoothstep(Math.abs(x), 24, 34);
  return envelope * (2.4 * Math.sin(x * 0.085 + 0.9) + 0.9 * Math.sin(x * 0.19 + 2.3));
}

/** Slope dz/dx of the path centre line (for facing units along it). */
export function pathSlope(x: number): number {
  const h = 0.05;
  return (pathCenterZ(x + h) - pathCenterZ(x - h)) / (2 * h);
}

/**
 * Ponds (centre x/z, radius in metres): shallow basins carved into the meadow, clear of the
 * path and the camps. Water surface height is `pondLevel(p)`.
 */
// Ponds were tried and removed (owner's call); add entries here to bring them back.
export const PONDS: ReadonlyArray<{ x: number; z: number; r: number }> = [];

const pondLevels = new Map<object, number>();

/** Water surface height of a pond: just below the lowest point of its shore, so it never spills. */
export function pondLevel(p: { x: number; z: number; r: number }): number {
  let level = pondLevels.get(p);
  if (level === undefined) {
    level = Infinity;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      level = Math.min(level, baseHeight(p.x + Math.cos(a) * p.r, p.z + Math.sin(a) * p.r));
    }
    level -= 0.12;
    pondLevels.set(p, level);
  }
  return level;
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
  let h = baseHeight(x, z);
  for (const p of PONDS) {
    const d = Math.hypot(x - p.x, z - p.z) / p.r;
    if (d >= 1.35) continue;
    // Bowl under the water, easing back into the meadow just past the shore.
    const bowl = pondLevel(p) - 0.75 * Math.max(0, 1 - d * d) + 0.05;
    const t = MathUtils.smoothstep(d, 0.85, 1.35);
    h = Math.min(h, bowl * (1 - t) + h * t);
  }
  return h;
}

function baseHeight(x: number, z: number): number {
  const away = MathUtils.smoothstep(Math.abs(z), 7, 36);
  if (away === 0) return 0;
  const campFlat = MathUtils.smoothstep(campDistance(x, z), CAMP_RADIUS + 0.5, CAMP_RADIUS + 9);
  if (campFlat === 0) return 0;
  const side = z < 0 ? 1 : 0.3;
  const swell = 0.5 + 0.5 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.07);
  const bumps = Math.sin(x * 0.17 + z * 0.11) * 0.8 + Math.sin(x * 0.09 - z * 0.19) * 1.1;
  return campFlat * away * side * (7 * away + 4 * swell + bumps);
}
