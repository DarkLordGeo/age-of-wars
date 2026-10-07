import type { ProjectileDef } from './schema';

export const PROJECTILES: Record<string, ProjectileDef> = {
  arrow: { id: 'arrow', speed: 26, arcHeight: 2.2, size: 0.12, color: 0xf2e4b0 },
  bolt: { id: 'bolt', speed: 32, arcHeight: 1.2, size: 0.2, color: 0xffb347 },
};
