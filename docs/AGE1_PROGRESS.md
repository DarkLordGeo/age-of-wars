# Age 1 progress

Single source of truth for Age 1 work. Read this first in every session, then `git log --oneline -15` and `git status`.

## Overall status
- **Phase:** Age 1 visual overhaul done (all 8 steps). Next: polish items below.
- **Vercel production:** https://age-of-wars.vercel.app (project `age-of-wars`, team `lashas-projects-63f3e6ef`, id `prj_4k5CossloKutrHc040Xutq1Rb9AL`)
- **Latest deployment:** `dpl_5rgvpRjHctKj5Je5Zb6pLZQ2RKeZ` (2026-10-08, from GitHub `main` @ d74b47e, Ready). Includes the Age 1 overhaul.
- **GitHub:** https://github.com/DarkLordGeo/age-of-wars (private, branch `main`)
- **Deploy route:** the Vercel project is connected to GitHub (2026-10-08). Pushes to `main` deploy to production; the Vercel MCP `create_deployment` with a `gitSource` also works from cloud sessions.

## Completed
- Soldier GLB (`public/models/soldier.glb`), registered, spawns/walks/attacks/dies; TeamColor tint. Now carries a procedural hide shield on the left forearm (`AssetSpec.decorate` -> `src/render/age1/gear.ts`).
- 2026-10-08 Age 1 overhaul (commit `age1: procedural Stone Age camp...`), all procedural in Three.js (`src/render/age1/`):
  1. Medieval assets removed (props, weapons, fort kit, stone keep, castle door, iron gate, camps, old Blender `age1/*_kit.glb`). Only the stone fire pit model is kept in the catalogue.
  2. `base.keep` = palisaded camp: gate toward the lane, great hut over the spawn point, 3 huts with thatch, hide tent, wood pile, drying rack, campfire, TeamColor banner pole + gate pennants (waving). Enemy camp mirrored + layout variant.
  3. `turret.watchtower` = lashed log tower with a giant bow on a swivel (`Weapon` recoils, `NockedArrow` hides until reload), thatch roof, team pennant.
  4. Procedural conifers (4 variants, frond cards) + dead snags in groves behind the lane and flanking the camps; cone trees gone.
  5. Splat terrain (Poly Haven leafy_grass / dirt_floor / brown_mud_dry / rocky_trail_02, colour-calibrated in the shader), meandering worn footpath, trampled camp yards, rock on steep/high ground. Lane planes and grey base pads gone.
  6. Grass tufts (new distance-friendly textures) framing the path and over the meadow; wind sway in the vertex shader; back faces keep up-normals.
  7. Campfire flames + smoke + flickering light (`fire.ts`), drifting dust motes over the lane (`dust.ts`).
  8. Arrow projectile mesh (1 m arrow; turret shoots a giant one), hide shield on the Soldier, curved bow + quiver on the archer placeholder, spear on the fallback soldier placeholder.
- Texture pipeline: `python assets_src/pipeline/make_age1_textures.py` -> `public/textures/age1/` (772 KB).
- Tests: `tests/age1-structures.test.ts` (gate/corridor/turret clearances, TeamColor, budgets, flat camps, path splat, trees, arrow).

- 2026-10-08 realism + HUD pass:
  - Base no longer shakes on hits; hit/miss/death bubbles removed (FxLayer deleted) until real effects exist.
  - Physical sky + clouds, PMREM image-based lighting (environmentIntensity 0.14; the Preetham sky is HDR-bright), horizon fog, softer shadows.
  - `src/render/post.ts`: MSAA, half-res GTAO, HDR bloom, grade + vignette. `?quality=low|medium|high`; auto steps down below ~42 fps. Foliage/particles/sky/health bars on `NO_AO_LAYER` (the shadow camera enables it).
  - Terrain normal maps (world-space, blended by splat weights) and drifting cloud shadows on terrain + grass (`clouds.ts`).
  - HUD restyled (wood/hide/rope, original design): framed unit cards with portraits rendered at boot from the unit models (`src/ui/portraits.ts`), coin costs, hotkeys, lock overlay with XP, portrait queue tokens with radial progress, coin-priced upgrade list. Fonts: IM Fell English SC + Alegreya Sans (Google Fonts).

- 2026-10-08 menu, camera, arena, HUD, music:
  - Main menu over a blurred AI-vs-AI battle; Esc pause menu; Options (quality, music/sfx volume).
  - Fixed camera beside the player camp (`src/config/camera.ts`: eye (-86, 27, 38), look-at (-10, 1.5, -4), ~16° down, FOV 40 / min horizontal 66). Look-at eases -8..+10 m toward the front line; no pan/zoom/orbit. Verified: whole player camp + watchtower, lane, enemy camp in frame.
  - Arena: cliff walls behind the lane and past the enemy camp, boulder bank front-right (cliff scans are open shells, they look wrong side-on), trees/grass/rocks kept inside the walls.
  - HUD in the classic layout: gold/XP plank (top-left), training bar + 5 queue squares (top-centre), Menu plank with framed icon buttons Units / Upgrades / Evolve / Pause (top-right), vertical base HP bars on the screen edges.
  - Music system (`src/audio/AudioMixer.ts`, `MusicPlayer.ts`, `src/config/music.ts`): music + sfx channels, preload, seamless loop, fade in/out, duck on pause, saved volumes. Age 1 track "Glorious Morning" by Waterflame is configured at `public/audio/music/glorious-morning.mp3` but **not included** (needs a licensed copy).
  - Research spec of the original Age 1: `docs/AGE1_SPEC.md`.

- 2026-10-08 (local session) turrets on the cave, campfire removed, music:
  - Turret slots now sit on the cave itself, as in the original (no separate log tower). `GAME.slotMounts` gives each slot its own mount on a natural ledge facing the battle camera (chosen by raycasting the cave from the gameplay camera); `World.slotPosition(team, slot)` replaces `towerPosition`. Slot heights unchanged (spec).
  - `createCaveMount` (`src/render/age1/turrets.ts`): lashed log deck per bought slot, on a dry-stone stack for small gaps or lashed legs above the cave top; team pennant. `BaseView` raycasts the rock height under each mount.
  - Campfire and wood pile removed from the cave base (procedural fallback camp keeps its own).
  - HUD tooltip shows training time rounded (was `0.975609756097561s`).
  - Age 1 music `public/audio/music/glorious-morning.mp3` added (owner-licensed, see `docs/ASSET_LICENSES.md`).
  - Verified in Chrome (RTX 3050): all 4 player and enemy slots visible on the caves from the battle camera, units spawn and march, team tints.

- 2026-10-08 (local session 2) visual pass from owner feedback:
  - Camera: removed the front-right boulder wall (scaled boulders reached z~23, the camera sits at z=25, so the view went white inside a boulder at the enemy end). Camera focus is now clamped to the lane and frame dt can't go negative.
  - Footpath meanders up to ~2.9 m and straightens into each camp; units and projectiles are drawn offset onto it and face along it (render-only, sim lane unchanged).
  - Ponds (`PONDS` in terrain.ts, `age1/water.ts`): carved basins, rim-level water with sky reflection and scrolling ripples, muddy shore splat, reed tufts.
  - Trees/logs/bushes are rejected where a downward ray hits rock or cliff (no more trees growing out of boulders) and kept off ponds.
  - Conifers: more whorls and three cards per branch, crown-shaped normals (no black back faces), inner-crown shading; ~1.2-1.4k tris each.
  - Meadow ground: Poly Haven rocky_terrain_02 broken up with forrest_ground_01 (replaces leafy_grass, which needed a neon green tint). Grass tufts regenerated (curved blades, dark roots, mixed dry blades) plus a meadow variant with seed heads.
  - HUD: bigger iron nail on the planks, hint text moved clear of it and enlarged.

## Next
- Unit readability: team-coloured ground ring under units (enemy/player read mainly by shield band / torso colour today).
- Archer and Brute are still box placeholders: give them GLBs (or reuse the Soldier rig with a bow / club via `decorate`).
- Cave entrance assembled from cliff/rock pieces at the back slope.
- Performance check on the RTX 3050: ~1.05M triangles/frame incl. the shadow pass (conifer fronds ~140k, terrain ~97k, cliffs/rocks the rest). If needed: fewer frond cards on far groves, drop shadows on the far cliff ridge.

## Decisions
- Age 1 only. No Age 2+ work.
- Procedural Three.js geometry over Blender for settlement/turret/trees so cloud sessions can iterate.
- Enemy base is mirrored (not rotated) so both palisades show their low front to the camera.
- Units spawn inside the great hut and march out of its door through the gate (eave raised to 2.45 m so heads clear it).
- Poly Haven grass/fern kits stay in the catalogue but are no longer preloaded (they read as dark specks); Age 1 uses its own tufts.
- Kept the wooden-handled stone fire pit model (fits a primitive camp); dropped the wooden bucket with the other medieval props.
- Quaternius rejected (non-CC0 licence + low-poly style); Kenney rejected (stylised). Poly Haven trees rejected (too heavy / looked dead when decimated).

## Known issues
- The Rodin cave's bright green tree reads stylised next to the conifers and hides the top turret slots a little.
- Cloud sessions can't open *.vercel.app (egress proxy), so the live site has to be checked on a real browser.
- Shadows of swaying foliage are static (depth pass is not patched); not noticeable at battle distance.
- Headless verification runs in SwiftShader at ~1 fps, so the sim was fast-forwarded for screenshots; real-time feel still needs a check on real hardware.

## Test / build status (last run 2026-10-08)
- `npm test`: 85/85 pass (2026-10-08 local session 2). Earlier: 103/103 pass (per-asset tests for the removed GLBs are gone; 12 new Age 1 tests). `npm run typecheck`: pass. `npm run build`: pass.

## Files changed recently
`src/render/age1/*` (new), `src/render/environment.ts`, `src/render/terrain.ts`, `src/render/BaseView.ts`, `src/render/GameRenderer.ts`, `src/render/ProjectileRenderer.ts`, `src/assets/{manifest,scenery,placeholders,AssetLibrary}.ts`, `src/config/projectiles.ts`, `tests/age1-structures.test.ts`, `tests/scenery-assets.test.ts`, `public/textures/age1/*`, `assets_src/pipeline/make_age1_textures.py`, `docs/*`.

## Blender / local-only tasks
See `docs/AGE1_LOCAL_TASKS.md`.
