import { Group } from 'three';
import { AssetLibrary } from './AssetLibrary';
import { decorateClubman, decorateSlingshot } from '../render/age1/gear';
import { createDinoRider } from '../render/age1/dino';
import { createEggAutomatic, createPrimitiveCatapult, createRockSlingshot } from '../render/age1/turrets';
import { createSettlement } from '../render/age1/settlement';
import { createArcherPlaceholder, createSoldierPlaceholder } from './placeholders';
import { SCENERY } from './scenery';

/**
 * Every model the game can show. To replace a placeholder with a Blender export, drop the
 * .glb in /public/models and add `url: '/models/soldier.glb'` to its entry
 * (contract: docs/ASSET_SPEC.md; `expectedHeight` enables the scale/origin check).
 */
export function createAssetLibrary(): AssetLibrary {
  const lib = new AssetLibrary();
  // Clubman and Slingshot Man share the rigged soldier GLB (loaded once), dressed differently.
  lib.register('unit.clubman', { url: '/models/soldier.glb', placeholder: createSoldierPlaceholder, expectedHeight: 1.8, decorate: decorateClubman });
  lib.register('unit.slingshot', { url: '/models/soldier.glb', placeholder: createArcherPlaceholder, expectedHeight: 1.8, decorate: (m) => decorateSlingshot(m) });
  // Age 1 dino, base, tower and turrets are procedural (src/render/age1): the builder is the model.
  lib.register('unit.dino', { placeholder: createDinoRider });
  lib.register('base.keep', { placeholder: (tint) => createSettlement(tint, { variant: tint % 2 }) });
  lib.register('turret.rock_slingshot', { placeholder: () => createRockSlingshot() });
  lib.register('turret.egg_automatic', { placeholder: createEggAutomatic });
  lib.register('turret.primitive_catapult', { placeholder: () => createPrimitiveCatapult() });
  // Environment/prop library (docs/ASSET_LICENSES.md). No placeholder: the environment falls
  // back to its procedural scenery when a model is missing. Unused entries are lazy.
  for (const a of SCENERY) lib.register(a.key, { url: a.url, placeholder: () => new Group(), lazy: !a.preload });
  return lib;
}
