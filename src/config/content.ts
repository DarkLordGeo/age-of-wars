import { AGES } from './ages';
import { AI_PROFILES } from './ai';
import { PROJECTILES } from './projectiles';
import type { Content } from './schema';
import { TURRETS } from './turrets';
import { UNITS } from './units';
import { UPGRADES } from './upgrades';

/** The default content bundle. Tests and future modes can pass a different one to World. */
export const CONTENT: Content = {
  units: UNITS,
  projectiles: PROJECTILES,
  turrets: TURRETS,
  ages: AGES,
  upgrades: UPGRADES,
  ai: AI_PROFILES,
};
