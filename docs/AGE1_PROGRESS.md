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
- Cloud sessions can't open *.vercel.app (egress proxy), so the live site has to be checked on a real browser.
- Shadows of swaying foliage are static (depth pass is not patched); not noticeable at battle distance.
- Headless verification runs in SwiftShader at ~1 fps, so the sim was fast-forwarded for screenshots; real-time feel still needs a check on real hardware.

## Test / build status (last run 2026-10-08)
- `npm test`: 103/103 pass (per-asset tests for the removed GLBs are gone; 12 new Age 1 tests). `npm run typecheck`: pass. `npm run build`: pass.

## Files changed recently
`src/render/age1/*` (new), `src/render/environment.ts`, `src/render/terrain.ts`, `src/render/BaseView.ts`, `src/render/GameRenderer.ts`, `src/render/ProjectileRenderer.ts`, `src/assets/{manifest,scenery,placeholders,AssetLibrary}.ts`, `src/config/projectiles.ts`, `tests/age1-structures.test.ts`, `tests/scenery-assets.test.ts`, `public/textures/age1/*`, `assets_src/pipeline/make_age1_textures.py`, `docs/*`.

## Blender / local-only tasks
See `docs/AGE1_LOCAL_TASKS.md`.
