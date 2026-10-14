import { Group } from 'three';
import { AssetLibrary } from './AssetLibrary';
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
  // Clubman: Rodin (Hyper3D) caveman auto-rigged by Mixamo, with Mixamo clips, a club in the right
  // fist and a TeamColor belt (assets_src/rodin/mixamo_build.py).
  lib.register('unit.clubman', {
    url: '/models/clubman.glb',
    placeholder: createSoldierPlaceholder,
    expectedHeight: 1.8,
    strike: 0.3, // attack clip: the club comes down ~9 frames in (Double Dagger Stab 26-46)
    // Walking: 1.701 m per 31-frame cycle at 0.912x; Slow Run: 2.115 m per 22 frames at 1.222x
    // (mixamo_build.py rates, snapped to whole frames). `start` is Mixamo's Start Walking.
    gaitSpeed: { walk: 1.5, run: 3.526 },
  });
  // Slingshot Man: the same Mixamo-rigged caveman with a slingshot in the left fist, the Run
  // Forward run, and a keyed upper-body shot layered over the running/idling legs
  // (assets_src/rodin/mixamo_build.py prop=sling, attack=@slingfire).
  lib.register('unit.slingshot', {
    url: '/models/slingshot.glb',
    placeholder: createArcherPlaceholder,
    expectedHeight: 1.8,
    // Same rig as the Clubman: Walking (0.912x) and Start Walking; Run Forward 2.999 m per
    // 27-frame cycle at 1.08x (25 frames) = 3.598 m/s.
    gaitSpeed: { walk: 1.5, run: 3.598 },
    strike: 0.53, // the pouch is released at frame 16 of the shot
    meleeStrike: 0.45, // Mixamo "Fist Fight A" 16-40 (right cross): the fist is furthest forward at 0.45 s
    partial: { attack: /Spine|Neck|Head|Shoulder|Arm|Hand/ },
  });
  // Dino Rider: procedural dinosaur; the rider is the rigged Rodin caveman (model g, seated pose
  // and spear) when it loads, else the procedural rider.
  lib.register('char.dino_rider', { url: '/models/dino_rider.glb', placeholder: () => new Group() });
  lib.register('unit.dino', {
    // Rodin dinosaur rigged in Blender with the rider seated on it, one set of clips for both
    // (assets_src/rodin/rig_dino.py). Without it, the procedural dinosaur below is the fallback.
    url: '/models/dino.glb',
    expectedHeight: 3.2,
    strike: 0.34, // attack clip: the horns connect as the ram peaks (rig_dino.py)
    placeholder: (tint) =>
      createDinoRider(
        tint,
        lib.hasModel('char.dino_rider') ? { model: lib.instantiate('char.dino_rider', tint), clips: lib.clipsFor('char.dino_rider') } : undefined,
      ),
  });
  // The base is Lasha's stone cave (Rodin); without it the procedural camp is the fallback.
  lib.register('prop.stone_hut', { url: '/models/stone_hut.glb', placeholder: () => new Group() });
  lib.register('base.keep', {
    placeholder: (tint) =>
      createSettlement(tint, {
        variant: tint % 2,
        cave: lib.hasModel('prop.stone_hut') ? lib.instantiate('prop.stone_hut', tint) : undefined,
      }),
  });
  lib.register('turret.rock_slingshot', { placeholder: () => createRockSlingshot() });
  lib.register('turret.egg_automatic', { placeholder: createEggAutomatic });
  lib.register('turret.primitive_catapult', { placeholder: () => createPrimitiveCatapult() });
  // Environment/prop library (docs/ASSET_LICENSES.md). No placeholder: the environment falls
  // back to its procedural scenery when a model is missing. Unused entries are lazy.
  for (const a of SCENERY) lib.register(a.key, { url: a.url, placeholder: () => new Group(), lazy: !a.preload });
  return lib;
}
