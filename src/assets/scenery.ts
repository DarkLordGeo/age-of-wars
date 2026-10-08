/**
 * Catalogue of the free (CC0) environment/prop library under public/models/env.
 * Licences and authors: docs/ASSET_LICENSES.md. Conventions: docs/ASSET_SPEC.md ("Scenery & props").
 *
 * - `single` assets are one object grounded at the origin (lowest point y = 0, centred on x/z).
 * - `kit` assets are one GLB holding several pieces, each a top-level node grounded at the
 *   origin and addressed by name; they share textures, so a kit costs one download.
 * - `preload: true` entries are fetched at boot because the battlefield uses them; the rest
 *   are registered as lazy and loaded with `AssetLibrary.loadModel(key, url)` when needed.
 */
export interface SceneryAsset {
  key: string;
  url: string;
  kind: 'single' | 'kit';
  /** Kit piece names (node names inside the GLB). */
  pieces?: readonly string[];
  /** Triangle count of the largest single piece; checked by tests. */
  maxPieceTris: number;
  preload?: boolean;
}

const E = '/models/env/';

const seq = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}_${String(i).padStart(2, '0')}`);

export const SCENERY: readonly SceneryAsset[] = [
  // Rocks (real-world metres; the small ones are 0.1-0.3 m and meant to be scaled up)
  { key: 'env.rock.boulder_01', url: `${E}rocks/rock_boulder_01.glb`, kind: 'single', maxPieceTris: 1400, preload: true },
  { key: 'env.rock.boulder_02', url: `${E}rocks/rock_boulder_02.glb`, kind: 'single', maxPieceTris: 1800, preload: true },
  { key: 'env.rock.boulder_03', url: `${E}rocks/rock_boulder_03.glb`, kind: 'single', maxPieceTris: 2000, preload: true },
  { key: 'env.rock.boulder_04', url: `${E}rocks/rock_boulder_04.glb`, kind: 'single', maxPieceTris: 1200, preload: true },
  { key: 'env.rock.small_01', url: `${E}rocks/rock_small_01.glb`, kind: 'single', maxPieceTris: 700, preload: true },
  { key: 'env.rock.small_02', url: `${E}rocks/rock_small_02.glb`, kind: 'single', maxPieceTris: 600, preload: true },
  { key: 'env.rock.pebble_01', url: `${E}rocks/rock_pebble_01.glb`, kind: 'single', maxPieceTris: 400, preload: true },
  { key: 'env.kit.rock_moss', url: `${E}rocks/rock_moss_set.glb`, kind: 'kit', pieces: seq('rock_moss', 6), maxPieceTris: 900, preload: true },

  // Cliffs / mountain sections (decimated photogrammetry; meant to be scaled x4-x10 as backdrops)
  { key: 'env.cliff.face_01', url: `${E}cliffs/cliff_face_01.glb`, kind: 'single', maxPieceTris: 4000 },
  { key: 'env.cliff.face_02', url: `${E}cliffs/cliff_face_02.glb`, kind: 'single', maxPieceTris: 3500 },
  { key: 'env.cliff.mountainside_01', url: `${E}cliffs/cliff_mountainside_01.glb`, kind: 'single', maxPieceTris: 6000, preload: true },
  { key: 'env.cliff.ridge_01', url: `${E}cliffs/cliff_ridge_01.glb`, kind: 'single', maxPieceTris: 6000, preload: true },
  { key: 'env.cliff.ridge_02', url: `${E}cliffs/cliff_ridge_02.glb`, kind: 'single', maxPieceTris: 8000, preload: true },

  // Caves (3TD Cave Pack Pro): cave-themed rocks and formations
  {
    key: 'env.kit.cave_rocks',
    url: `${E}caves/cave_rocks_kit.glb`,
    kind: 'kit',
    pieces: [
      'cave_boulder_01',
      'cave_cliff_01',
      'cave_cliff_edge_01',
      'cave_cube_rock_01',
      'cave_pit_rock_01',
      'cave_rock_face_01',
      'cave_rock_modular_01',
      'cave_rock_pile_01',
      'cave_rubble_01',
      'cave_stalactite_01',
      'cave_stalagmite_01',
      'cave_stone_01',
    ],
    maxPieceTris: 1400,
  },

  // Dead wood
  { key: 'env.tree.log_fallen_01', url: `${E}trees/log_fallen_01.glb`, kind: 'single', maxPieceTris: 1800, preload: true },
  { key: 'env.tree.log_fallen_02', url: `${E}trees/log_fallen_02.glb`, kind: 'single', maxPieceTris: 900, preload: true },
  { key: 'env.tree.stump_01', url: `${E}trees/tree_stump_01.glb`, kind: 'single', maxPieceTris: 1500, preload: true },

  // Vegetation (alpha-cut cards; kits of individual plants). Grass/fern kits are not preloaded:
  // they read as dark specks at battle distance, so Age 1 uses its own grass tufts (src/render/age1/grass.ts).
  { key: 'env.kit.fern', url: `${E}plants/plant_fern_kit.glb`, kind: 'kit', pieces: seq('fern', 4), maxPieceTris: 700 },
  { key: 'env.kit.grass', url: `${E}plants/plant_grass_kit.glb`, kind: 'kit', pieces: seq('grass', 11), maxPieceTris: 340 },
  { key: 'env.kit.bush_dry', url: `${E}plants/plant_bush_dry_kit.glb`, kind: 'kit', pieces: seq('bush', 5), maxPieceTris: 900, preload: true },
  { key: 'env.kit.shrub', url: `${E}plants/plant_shrub_kit.glb`, kind: 'kit', pieces: seq('shrub', 4), maxPieceTris: 1500, preload: true },
  { key: 'env.kit.branches', url: `${E}plants/plant_branches_kit.glb`, kind: 'kit', pieces: seq('branch', 3), maxPieceTris: 700 },
  { key: 'env.plant.shrub_tuft_01', url: `${E}plants/plant_shrub_tuft_01.glb`, kind: 'single', maxPieceTris: 2500 },

  // Props (Age 1 keeps only the stone fire pit; the medieval props were removed)
  { key: 'env.prop.firepit_01', url: `${E}props/prop_firepit_01.glb`, kind: 'single', maxPieceTris: 1600, preload: true },
];
