# Asset licenses

Every third-party asset in the repository is listed here. Regenerate the Poly Haven rows with `python assets_src/make_licenses.py`.
Originals are kept untouched under `assets_src/` (downloads); processed, game-ready copies live in `public/models/env/`.

## Licence terms in use

- **Poly Haven**: all assets are CC0 1.0 (public domain). Commercial use allowed, no attribution required ("You do not need to give credit"). Source: https://polyhaven.com/license (checked 2026-10-08). The site's own logos, renders and text are not CC0 and are not used.
- **Freesound**: each sound has its own licence; the three used here are all CC0 1.0 (public domain dedication: commercial use allowed, no attribution required), each checked on its sound page on 2026-10-14.
- **OpenGameArt, 3TD Cave Pack Pro**: CC0 1.0, released by Ron Kapaun / 3TD Studios. No attribution required (crediting is appreciated). Source page: https://opengameart.org/content/3td-cave-pack-pro-v10 (checked 2026-10-08).
- **Hyper3D Rodin** (AI-generated models): generated and downloaded by the project owner on the Hyper3D **Creator** plan (confirmed by the owner, 2026-10-13, issue #2; the owner regards the generated models as theirs). Terms of Use (https://hyper3d.ai/legal/terms, checked 2026-10-13): §5(b) for Rodin output, "we will not limit your use of such Output, subject to any restrictions set forth in these Agreements"; §2, export "for private or commercial use depending on your subscription plan"; §5 also says Hyper3D makes no representation that Output is copyrightable. Pricing page (https://hyper3d.ai/pricing, checked 2026-10-13): Creator plan lists "Unlimited export and any use". No attribution requirement is stated. This records what the terms say; it is not a legal opinion, and the terms can change.

- **Mixamo (Adobe)**: used for the Clubman's and Slingshot Man's rig and animations (auto-rigged from our own Rodin mesh; clips "Double Dagger Stab", "Slow Run", "Run Forward", "Death From Right", "Death From The Front", downloaded by the owner with their Adobe account, 2026-10-13; "Walking", "Start Walking" and "Warming Up", 2026-10-14). Adobe's Mixamo FAQ (as reposted by Adobe's community moderators, 2022-09-29; the live helpx FAQ was not reachable on 2026-10-13): free "for unlimited commercial or non commercial use", video games allowed, no credit to Adobe/Mixamo required, and "the only thing you can't do is distribute the raw character and animation files" (also excluded: asset packs/templates that redistribute them, and machine-learning training). The raw Mixamo FBX files are not committed (`assets_src/rodin/mixamo/**/*.fbx` is ignored); only the processed game GLB is, by the owner's decision to push it (2026-10-13), although this repository is public. Sources: https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400 and the Adobe Terms of Use.

## Attribution requirements

None of the assets below require attribution (Hyper3D's terms state none for Rodin output). Optional courtesy credit: Poly Haven and its artists (named in the table), and Ron Kapaun / 3TD Studios.

## Assets

| Asset | Source | Author | License | Source URL | Local file | Attribution required | Processing note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Clubman (caveman, T-pose, model a) | Hyper3D Rodin (AI-generated) mesh + Mixamo (Adobe) rig and animations | Lasha Ergeshidze (prompt) | Hyper3D Creator plan (owner-confirmed 2026-10-13, #2): Rodin output usable without limits under the Hyper3D Terms (see Licence terms in use); Mixamo per the Mixamo note above | Rodin workspace (per-model link not recorded); https://www.mixamo.com | `public/models/clubman.glb` | none stated | Mixamo auto-rig (65 bones) of the ~15k-tri Rodin mesh, clips trimmed/time-scaled (idle from the Double Dagger Stab stance, walk = Slow Run in place, attack = Double Dagger Stab 26-46, death/death_2 = Death From Right/Front), Rodin PBR textures at 1024 px, original club and TeamColor belt (`assets_src/rodin/mixamo_build.py`) |
| Dino Rider rider (helmeted caveman, model g) | Hyper3D Rodin (AI-generated) | Lasha Ergeshidze (prompt) | Hyper3D Creator plan (owner-confirmed 2026-10-13, #2): Rodin output usable without limits under the Hyper3D Terms (see Licence terms in use) | Rodin workspace (per-model link not recorded) | `public/models/dino_rider.glb` | none stated | rigged in Blender, original spear prop, seated idle and spear-thrust clips, 1024 px PBR textures, ~15.3k tris (`assets_src/rodin/rig_caveman.py`) |
| Dinosaur (model d) + seated rider | Hyper3D Rodin (AI-generated) | Lasha Ergeshidze (prompt) | Hyper3D Creator plan (owner-confirmed 2026-10-13, #2): Rodin output usable without limits under the Hyper3D Terms (see Licence terms in use) | Rodin workspace (per-model link not recorded) | `public/models/dino.glb` | none stated | rigged in Blender (19-bone quadruped skeleton, automatic weights), keyed idle/walk/attack/death; the rider (`dino_rider.glb`) is seated on the spine and re-timed so one set of clips drives both; ~19.9k tris together, 1024 px PBR textures (`assets_src/rodin/rig_dino.py`) |
| Slingshot Man (same caveman, model a) | Hyper3D Rodin (AI-generated) mesh + Mixamo (Adobe) rig and animations | Lasha Ergeshidze (prompt) | Hyper3D Creator plan (owner-confirmed 2026-10-13, #2): Rodin output usable without limits under the Hyper3D Terms (see Licence terms in use); Mixamo per the Mixamo note above | Rodin workspace (per-model link not recorded); https://www.mixamo.com | `public/models/slingshot.glb` | none stated | the Clubman's Mixamo-rigged mesh (65 bones) with an original slingshot prop and TeamColor belt; walk = Mixamo "Run Forward" in place, idle/deaths shared with the Clubman, attack = original keyed upper-body slingshot shot (`assets_src/rodin/mixamo_build.py prop=sling`); replaces the 2026-10-08 `caveman_slingshot.glb` |
| Stone hut | Hyper3D Rodin (AI-generated) | Lasha Ergeshidze (prompt) | Hyper3D Creator plan (owner-confirmed 2026-10-13, #2): Rodin output usable without limits under the Hyper3D Terms (see Licence terms in use) | https://hyper3d.ai/workspace/rodin/ded815de-a63a-4913-90a1-21bb21e589b3 | `public/models/stone_hut.glb` | see Hyper3D terms | baked to vertex colours, ~14k tris (assets_src/rodin) |
| Rodin batch 2026-10-10 (7 raw exports: Age 1 characters, dinosaur, cave, turrets; identities in `assets_src/rodin/raw/2026-10-10/README.md`) | Hyper3D Rodin (AI-generated) | Lasha Ergeshidze (prompt) | Hyper3D Creator plan (owner-confirmed 2026-10-13, #2): Rodin output usable without limits under the Hyper3D Terms (see Licence terms in use) | Rodin workspace (per-model links not recorded) | `assets_src/rodin/raw/2026-10-10/rodin_a..g.glb` (kept locally, not in git; see that folder's README) | none stated | untouched source exports (PBR, unrigged, 17k-36k tris); not deployed |
| Boulder 01 | Poly Haven | Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/boulder_01 | `public/models/env/rocks/rock_boulder_01.glb` | none |  |
| Namaqualand Boulder 02 | Poly Haven | Greg Zaal (Photography), Rico Cilliers (modeling) | CC0 1.0 | https://polyhaven.com/a/namaqualand_boulder_02 | `public/models/env/rocks/rock_boulder_02.glb` | none |  |
| Namaqualand Boulder 03 | Poly Haven | Jenelle van Heerden (modeling), Dario Barresi (Photography) | CC0 1.0 | https://polyhaven.com/a/namaqualand_boulder_03 | `public/models/env/rocks/rock_boulder_03.glb` | none |  |
| Namaqualand Boulder 05 | Poly Haven | Jenelle van Heerden (modeling), Dario Barresi (Photography) | CC0 1.0 | https://polyhaven.com/a/namaqualand_boulder_05 | `public/models/env/rocks/rock_boulder_04.glb` | none |  |
| Rock 07 | Poly Haven | Jenelle van Heerden | CC0 1.0 | https://polyhaven.com/a/rock_07 | `public/models/env/rocks/rock_small_01.glb` | none |  |
| Rock 09 | Poly Haven | Jenelle van Heerden | CC0 1.0 | https://polyhaven.com/a/rock_09 | `public/models/env/rocks/rock_small_02.glb` | none |  |
| Stone 01 | Poly Haven | Dario Barresi (Photography), Rico Cilliers (photography, processing) | CC0 1.0 | https://polyhaven.com/a/stone_01 | `public/models/env/rocks/rock_pebble_01.glb` | none |  |
| Rock Moss Set 01 | Poly Haven | Kless Gyzen | CC0 1.0 | https://polyhaven.com/a/rock_moss_set_01 | `public/models/env/rocks/rock_moss_set.glb` | none | 6 rocks split into one kit |
| Rock Face 01 | Poly Haven | Dario Barresi | CC0 1.0 | https://polyhaven.com/a/rock_face_01 | `public/models/env/cliffs/cliff_face_01.glb` | none |  |
| Rock Face 02 | Poly Haven | Dario Barresi, Rico Cilliers (processing) | CC0 1.0 | https://polyhaven.com/a/rock_face_02 | `public/models/env/cliffs/cliff_face_02.glb` | none |  |
| Mountainside | Poly Haven | Dario Barresi (Photography), Rico Cilliers (processing) | CC0 1.0 | https://polyhaven.com/a/mountainside | `public/models/env/cliffs/cliff_mountainside_01.glb` | none |  |
| Namaqualand Cliff 01 | Poly Haven | Jenelle van Heerden (Photography), Rico Cilliers (modeling) | CC0 1.0 | https://polyhaven.com/a/namaqualand_cliff_01 | `public/models/env/cliffs/cliff_ridge_01.glb` | none |  |
| Namaqualand Cliff 02 | Poly Haven | Dario Barresi (Photography), Rico Cilliers (modeling) | CC0 1.0 | https://polyhaven.com/a/namaqualand_cliff_02 | `public/models/env/cliffs/cliff_ridge_02.glb` | none |  |
| Dead Tree Trunk 02 | Poly Haven | Jenelle van Heerden (Photography), Rico Cilliers (processing) | CC0 1.0 | https://polyhaven.com/a/dead_tree_trunk_02 | `public/models/env/trees/log_fallen_01.glb` | none |  |
| Dead Tree Trunk | Poly Haven | Rob Tuytel | CC0 1.0 | https://polyhaven.com/a/dead_tree_trunk | `public/models/env/trees/log_fallen_02.glb` | none |  |
| Tree Stump 01 | Poly Haven | Rob Tuytel | CC0 1.0 | https://polyhaven.com/a/tree_stump_01 | `public/models/env/trees/tree_stump_01.glb` | none |  |
| Fern 02 | Poly Haven | Rob Tuytel (scanning), Rico Cilliers (modeling) | CC0 1.0 | https://polyhaven.com/a/fern_02 | `public/models/env/plants/plant_fern_kit.glb` | none | 4 ferns split into one kit |
| Grass Medium 01 | Poly Haven | Rob Tuytel (Photography), Rico Cilliers (Modeling) | CC0 1.0 | https://polyhaven.com/a/grass_medium_01 | `public/models/env/plants/plant_grass_kit.glb` | none | 17 clumps split into one kit |
| Wild Rooibos Bush | Poly Haven | James Ray Cock (modeling), Jenelle van Heerden (photography) | CC0 1.0 | https://polyhaven.com/a/wild_rooibos_bush | `public/models/env/plants/plant_bush_dry_kit.glb` | none | 5 bushes split into one kit |
| Shrub 02 | Poly Haven | Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/shrub_02 | `public/models/env/plants/plant_shrub_kit.glb` | none | 4 shrubs split into one kit |
| Dry Branches Medium 01 | Poly Haven | Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/dry_branches_medium_01 | `public/models/env/plants/plant_branches_kit.glb` | none | 3 branches split into one kit |
| Shrub 04 | Poly Haven | Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/shrub_04 | `public/models/env/plants/plant_shrub_tuft_01.glb` | none |  |
| Stone Fire Pit | Poly Haven | Sebastian Platen | CC0 1.0 | https://polyhaven.com/a/stone_fire_pit | `public/models/env/props/prop_firepit_01.glb` | none |  |
| Rocky Terrain 02 (texture) | Poly Haven | Amal Kumar | CC0 1.0 | https://polyhaven.com/a/rocky_terrain_02 | `public/textures/age1/ground_rocky_terrain_02.jpg` (+ `_nor`) | none | meadow base; diffuse + OpenGL normal, 1k -> 512 px (assets_src/pipeline/make_age1_textures.py) |
| Forrest Ground 01 (texture) | Poly Haven | Rob Tuytel | CC0 1.0 | https://polyhaven.com/a/forrest_ground_01 | `public/textures/age1/ground_forrest_ground_01.jpg` | none | meadow patches; diffuse, 1k -> 512 px |
| Dirt Floor (texture) | Poly Haven | eye-candy.xyz | CC0 1.0 | https://polyhaven.com/a/dirt_floor | `public/textures/age1/ground_dirt_floor.jpg` | none | diffuse only, 1k -> 512 px (assets_src/pipeline/make_age1_textures.py) |
| Rocky Trail 02 (texture) | Poly Haven | Amal Kumar | CC0 1.0 | https://polyhaven.com/a/rocky_trail_02 | `public/textures/age1/ground_rocky_trail_02.jpg` | none | diffuse only, 1k -> 512 px (assets_src/pipeline/make_age1_textures.py) |
| Brown Mud Dry (texture) | Poly Haven | Rob Tuytel | CC0 1.0 | https://polyhaven.com/a/brown_mud_dry | `public/textures/age1/ground_brown_mud_dry.jpg` | none | diffuse only, 1k -> 512 px (assets_src/pipeline/make_age1_textures.py) |
| 3TD Cave Pack Pro (12 pieces: cliff, cliff edge, rock face, modular rock, rock pile, boulder, pit rock, stone, cube rock, stalagmite, stalactite, rubble) | OpenGameArt | Ron Kapaun / 3TD Studios | CC0 1.0 | https://opengameart.org/content/3td-cave-pack-pro-v10 | `public/models/env/caves/cave_rocks_kit.glb` (original zip: `assets_src/opengameart/3td_cave_pack_pro/`) | none | Collada converted with a custom reader, highest LOD only, collision meshes dropped, rescaled to metres, textures re-encoded |

## Music

| Track | Artist | Licence | Source | Local file | Notes |
| --- | --- | --- | --- | --- | --- |
| Glorious Morning | Waterflame | Licensed to the project owner for this game (owner's licence, 2026-10-08) | https://www.youtube.com/watch?v=7T_YtklLyyo | `public/audio/music/glorious-morning.mp3` | Fetched with `yt-dlp -x --audio-format mp3` at the owner's request; Age 1 gameplay track (`src/config/music.ts`). |

## Sound effects

Downloaded by the owner from Freesound (2026-10-14); originals stay in the owner's Downloads folder, only the processed copies are committed. Processing: ffmpeg, mono 44.1 kHz, MP3 (LAME VBR q3), trimmed with short fades and levelled so the two hit takes match. Wired in `src/config/sfx.ts`.

| Sound | Author | Licence | Source | Local file | Notes |
| --- | --- | --- | --- | --- | --- |
| Death sound (male) | Replix | CC0 1.0 | https://freesound.org/s/173126/ | `public/audio/sfx/death-male.mp3` | `173126__replix__death-sound-male.wav`; leading silence trimmed (0.47-1.36 s), +3 dB. Cue `unit_death`. |
| Grunts_Various Male | SnowFightStudios | CC0 1.0 | https://freesound.org/s/643670/ | `public/audio/sfx/hit-grunt.mp3` | One grunt (2.11-2.45 s) cut from the 16 s, 14-grunt `643670__snowfightstudios__grunts_various-male.mp3`, +1.6 dB. Cue `unit_hurt` (take 1). |
| hammer 1.aif | zinzan_101 | CC0 1.0 | https://freesound.org/s/91045/ | `public/audio/sfx/hit-hammer.mp3` | `91045__zinzan_101__hammer-1.aiff` (AIFF, which Chrome cannot decode) converted, +9.1 dB to match the grunt. Cue `unit_hurt` (take 2). |

## Original work

- `public/models/soldier.glb`: Soldier unit, built in Blender from the project's own `male_character_base_rigged.glb` (equipment, spear, textures, the `walk`/`attack`/`death` clips and the spear-carry `idle` are original). **Provenance of the base mesh:** `male_character_base_rigged.glb` was supplied by the project owner and carries Sketchfab-style node names; its original licence is not recorded in this repository. Record it here before shipping.
- The `Gear` and `TeamColor` textures on the Soldier are procedurally generated (no third-party images).
- Age 1 settlement, watchtower, conifers, hide shield, bow and arrow (`src/render/age1/`, `src/render/ProjectileRenderer.ts`) are procedural Three.js geometry written for this project.
- `public/textures/age1/` bark, log, hide, wattle, thatch, conifer fronds and grass tufts are procedurally generated (`assets_src/pipeline/make_textures.py`, `make_age1_textures.py`); only the four `ground_*` maps are third-party (listed above).

## Considered and rejected

- **Quaternius** packs: use the Quaternius Asset License (QAL) v1.0, which is not CC0 and restricts redistributing the assets themselves; also stylised low-poly (visual mismatch).
- **Kenney** (CC0): castle and nature kits are flat-shaded stylised low-poly, rejected for the realistic look.
- Poly Haven `pine_tree_01` (958 MB), `fir_tree_01` (487 MB), `jacaranda_tree`, `island_tree_*`, `pine_sapling_medium`: far too heavy. The saplings that were processed (`fir_sapling`, `fir_sapling_medium`, `tree_small_02`) lost their foliage when decimated to RTS budgets and looked dead/skeletal, so they were dropped.
- 3TD cave chambers and tunnels (`Cave_01/02`, `L_Curve`, `T_Junction`, `Y_Tube`) and `CaveRock13`: smooth low-res blobs / stretched UVs when seen from outside (they are meant to be viewed from inside).
- Removed in the Age 1 overhaul (2026-10-08) as medieval/off-theme: Poly Haven crates, bucket, barrels, lantern, chest, cannon, ladder, pickaxe, kite shield, axes, estoc, modular fort (and the stone keep built from it), castle door, iron gate.
- Dinosaurs and other creatures: the only CC0 options found were stylised low-poly or FBX-only; nothing realistic enough.
