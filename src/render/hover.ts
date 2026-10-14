import { Box3, Vector3, type Ray } from 'three';

/** Something the pointer can hover: an id and its world-space box (null: not hoverable now). */
export interface Hoverable {
  id: number;
  hoverBox(out: Box3): Box3 | null;
}

const BOX = new Box3();
const HIT = new Vector3();

/**
 * The id of the hoverable whose box the ray enters first, or null. Boxes only (no mesh
 * raycasts), no allocation: cheap enough to run every frame with many units.
 */
export function pickHovered(ray: Ray, items: Iterable<Hoverable>): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const it of items) {
    if (!it.hoverBox(BOX)) continue;
    if (!ray.intersectBox(BOX, HIT)) continue;
    const d = HIT.distanceToSquared(ray.origin);
    if (d < bestDist) {
      bestDist = d;
      best = it.id;
    }
  }
  return best;
}
