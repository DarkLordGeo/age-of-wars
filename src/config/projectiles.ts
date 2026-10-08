import type { ProjectileDef } from './schema';

/** Age 1: both are arrows (ProjectileRenderer); `size` scales the 1 m arrow (0.12 = 1 m), `color` tints it. */
export const PROJECTILES: Record<string, ProjectileDef> = {
  arrow: { id: 'arrow', speed: 26, arcHeight: 2.2, size: 0.12, color: 0xffffff },
  bolt: { id: 'bolt', speed: 32, arcHeight: 1.2, size: 0.2, color: 0xfff4e0 },
};
