"""Regenerates docs/ASSET_LICENSES.md from assets_src/polyhaven/*/info.json.
Run: python assets_src/make_licenses.py"""
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

# (file under public/models/env, polyhaven id, processing note)
PH = [
    ('rocks/rock_boulder_01.glb', 'boulder_01', ''),
    ('rocks/rock_boulder_02.glb', 'namaqualand_boulder_02', ''),
    ('rocks/rock_boulder_03.glb', 'namaqualand_boulder_03', ''),
    ('rocks/rock_boulder_04.glb', 'namaqualand_boulder_05', ''),
    ('rocks/rock_small_01.glb', 'rock_07', ''),
    ('rocks/rock_small_02.glb', 'rock_09', ''),
    ('rocks/rock_pebble_01.glb', 'stone_01', ''),
    ('rocks/rock_moss_set.glb', 'rock_moss_set_01', '6 rocks split into one kit'),
    ('cliffs/cliff_face_01.glb', 'rock_face_01', ''),
    ('cliffs/cliff_face_02.glb', 'rock_face_02', ''),
    ('cliffs/cliff_mountainside_01.glb', 'mountainside', ''),
    ('cliffs/cliff_ridge_01.glb', 'namaqualand_cliff_01', ''),
    ('cliffs/cliff_ridge_02.glb', 'namaqualand_cliff_02', ''),
    ('trees/log_fallen_01.glb', 'dead_tree_trunk_02', ''),
    ('trees/log_fallen_02.glb', 'dead_tree_trunk', ''),
    ('trees/tree_stump_01.glb', 'tree_stump_01', ''),
    ('plants/plant_fern_kit.glb', 'fern_02', '4 ferns split into one kit'),
    ('plants/plant_grass_kit.glb', 'grass_medium_01', '17 clumps split into one kit'),
    ('plants/plant_bush_dry_kit.glb', 'wild_rooibos_bush', '5 bushes split into one kit'),
    ('plants/plant_shrub_kit.glb', 'shrub_02', '4 shrubs split into one kit'),
    ('plants/plant_branches_kit.glb', 'dry_branches_medium_01', '3 branches split into one kit'),
    ('plants/plant_shrub_tuft_01.glb', 'shrub_04', ''),
    ('props/prop_crate_01.glb', 'wooden_crate_01', ''),
    ('props/prop_crate_02.glb', 'wooden_crate_02', ''),
    ('props/prop_bucket_01.glb', 'wooden_bucket_01', ''),
    ('props/prop_barrel_01.glb', 'wine_barrel_01', ''),
    ('props/props_barrels_kit.glb', 'wooden_barrels_01', 'barrels + stacked pieces kit'),
    ('props/prop_lantern_01.glb', 'wooden_lantern_01', ''),
    ('props/prop_chest_01.glb', 'treasure_chest', ''),
    ('props/prop_cannon_01.glb', 'cannon_01', 'rig/shape keys removed (static)'),
    ('props/prop_ladder_01.glb', 'wooden_ladder', ''),
    ('props/prop_pickaxe_01.glb', 'picke_dirty_01', ''),
    ('props/prop_firepit_01.glb', 'stone_fire_pit', ''),
    ('weapons/weapon_shield_kite_01.glb', 'kite_shield', ''),
    ('weapons/weapon_axe_wooden_01.glb', 'wooden_axe_02', ''),
    ('weapons/weapon_hatchet_01.glb', 'hatchet', ''),
    ('weapons/weapon_estoc_01.glb', 'antique_estoc', ''),
    ('structures/fort_kit.glb', 'modular_fort_01', '22 modular pieces split into one kit'),
    ('structures/keep_stone_01.glb', 'modular_fort_01', 'assembled base keep (tower + rampart + TeamColor banner) from fort pieces'),
    ('structures/struct_castle_door_01.glb', 'large_castle_door', ''),
    ('structures/struct_iron_gate_01.glb', 'large_iron_gate', ''),
]


def info(asset_id):
    with open(os.path.join(ROOT, 'polyhaven', asset_id, 'info.json'), encoding='utf-8') as fh:
        return json.load(fh)


rows = []
for f, i, note in PH:
    d = info(i)
    authors = ', '.join(a if r == 'All' else f'{a} ({r})' for a, r in d['authors'].items())
    rows.append(f"| {d['name']} | Poly Haven | {authors} | CC0 1.0 | https://polyhaven.com/a/{i} | `public/models/env/{f}` | none | {note} |")

out = [
    '# Asset licenses',
    '',
    'Every third-party asset in the repository is listed here. Regenerate the Poly Haven rows with `python assets_src/make_licenses.py`.',
    'Originals are kept untouched under `assets_src/` (downloads); processed, game-ready copies live in `public/models/env/`.',
    '',
    '## Licence terms in use',
    '',
    "- **Poly Haven**: all assets are CC0 1.0 (public domain). Commercial use allowed, no attribution required (\"You do not need to give credit\"). Source: https://polyhaven.com/license (checked 2026-10-08). The site's own logos, renders and text are not CC0 and are not used.",
    '- **OpenGameArt, 3TD Cave Pack Pro**: CC0 1.0, released by Ron Kapaun / 3TD Studios. No attribution required (crediting is appreciated). Source page: https://opengameart.org/content/3td-cave-pack-pro-v10 (checked 2026-10-08).',
    '',
    '## Attribution requirements',
    '',
    'None of the assets below require attribution. Optional courtesy credit: Poly Haven and its artists (named in the table), and Ron Kapaun / 3TD Studios.',
    '',
    '## Assets',
    '',
    '| Asset | Source | Author | License | Source URL | Local file | Attribution required | Processing note |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
]
out += rows
out.append(
    '| 3TD Cave Pack Pro (12 pieces: cliff, cliff edge, rock face, modular rock, rock pile, boulder, pit rock, stone, cube rock, stalagmite, stalactite, rubble) '
    '| OpenGameArt | Ron Kapaun / 3TD Studios | CC0 1.0 | https://opengameart.org/content/3td-cave-pack-pro-v10 '
    '| `public/models/env/caves/cave_rocks_kit.glb` (original zip: `assets_src/opengameart/3td_cave_pack_pro/`) | none '
    '| Collada converted with a custom reader, highest LOD only, collision meshes dropped, rescaled to metres, textures re-encoded |'
)
out += [
    '',
    '## Original work',
    '',
    "- `public/models/soldier.glb`: Soldier unit, built in Blender from the project's own `male_character_base_rigged.glb` (equipment, spear, textures, the `walk`/`attack`/`death` clips and the spear-carry `idle` are original). **Provenance of the base mesh:** `male_character_base_rigged.glb` was supplied by the project owner and carries Sketchfab-style node names; its original licence is not recorded in this repository. Record it here before shipping.",
    '- The `Gear` and `TeamColor` textures on the Soldier are procedurally generated (no third-party images).',
    '',
    '## Considered and rejected',
    '',
    '- **Quaternius** packs: use the Quaternius Asset License (QAL) v1.0, which is not CC0 and restricts redistributing the assets themselves; also stylised low-poly (visual mismatch).',
    '- **Kenney** (CC0): castle and nature kits are flat-shaded stylised low-poly, rejected for the realistic look.',
    '- Poly Haven `pine_tree_01` (958 MB), `fir_tree_01` (487 MB), `jacaranda_tree`, `island_tree_*`, `pine_sapling_medium`: far too heavy. The saplings that were processed (`fir_sapling`, `fir_sapling_medium`, `tree_small_02`) lost their foliage when decimated to RTS budgets and looked dead/skeletal, so they were dropped.',
    '- 3TD cave chambers and tunnels (`Cave_01/02`, `L_Curve`, `T_Junction`, `Y_Tube`) and `CaveRock13`: smooth low-res blobs / stretched UVs when seen from outside (they are meant to be viewed from inside).',
    '- Dinosaurs and other creatures: the only CC0 options found were stylised low-poly or FBX-only; nothing realistic enough.',
]
with open(os.path.join(ROOT, '..', 'docs', 'ASSET_LICENSES.md'), 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(out) + '\n')
print('wrote', len(rows) + 1, 'rows')
