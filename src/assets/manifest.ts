import { Group } from 'three';
import { AssetLibrary } from './AssetLibrary';
import { decorateSoldier } from '../render/age1/gear';
import { createSettlement } from '../render/age1/settlement';
import { createWatchtower } from '../render/age1/watchtower';
import { createArcherPlaceholder, createBrutePlaceholder, createSoldierPlaceholder } from './placeholders';
import { SCENERY } from './scenery';

/**
 * Every model the game can show. To replace a placeholder with a Blender export, drop the
 * .glb in /public/models and add `url: '/models/soldier.glb'` to its entry
 * (contract: docs/ASSET_SPEC.md; `expectedHeight` enables the scale/origin check).
 */
export function createAssetLibrary(): AssetLibrary {
  const lib = new AssetLibrary();
  lib.register('unit.soldier', { url: '/models/soldier.glb', placeholder: createSoldierPlaceholder, expectedHeight: 1.8, decorate: decorateSoldier });
  lib.register('unit.archer', { placeholder: createArcherPlaceholder, expectedHeight: 1.7 });
  lib.register('unit.brute', { placeholder: createBrutePlaceholder, expectedHeight: 2.6 });
  // Age 1 base and turret are procedural (src/render/age1): no GLB, the builder is the model.
  lib.register('base.keep', { placeholder: (tint) => createSettlement(tint, { variant: tint % 2 }) });
  lib.register('turret.watchtower', { placeholder: (tint) => createWatchtower(tint, tint % 2) });
  // Environment/prop library (docs/ASSET_LICENSES.md). No placeholder: the environment falls
  // back to its procedural scenery when a model is missing. Unused entries are lazy.
  for (const a of SCENERY) lib.register(a.key, { url: a.url, placeholder: () => new Group(), lazy: !a.preload });
  return lib;
}
