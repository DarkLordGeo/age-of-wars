# Age 1 progress

Single source of truth for Age 1 work. Read this first in every session, then `git log --oneline -15` and `git status`.

## Overall status
- **Phase:** Age 1 visual overhaul in progress. Game is playable and deployed.
- **Vercel production:** https://age-of-wars.vercel.app (project `age-of-wars`, team `lashas-projects-63f3e6ef`, id `prj_4k5CossloKutrHc040Xutq1Rb9AL`)
- **Latest deployment:** `dpl_7eRUC2yQeKpRrJYDX6Gda2qNT78G` (2026-10-08, from the local CLI, status Ready). Verified in Chrome (RTX 3050): game boots, Soldier GLB and keep load.
- **GitHub:** https://github.com/DarkLordGeo/age-of-wars (private, branch `main`)
- **Deploy route:** local `vercel deploy --prod` works. Git-push auto-deploy needs the Vercel GitHub app to be given access to `age-of-wars` (see AGE1_LOCAL_TASKS.md). Once granted: `create_git_project` (Vercel MCP) links the repo and every push to `main` deploys.
- **Email updates:** a Gmail connector exists but no update emails have been sent. Progress is recorded here instead.

## Completed
- Soldier GLB (`public/models/soldier.glb`): 1.795 m, 9,773 tris, 31 bones, idle/walk/attack/death, no root motion, passes `validateModel`.
- Soldier registered in `src/assets/manifest.ts` (`url: '/models/soldier.glb'`). Seen in the running game: spawns, walks, faces correctly, team colours via `TeamColor`.
- Free CC0 scenery library in `public/models/env/` with catalogue `src/assets/scenery.ts`; instancing helper `src/render/sceneryInstancing.ts`; `AssetLibrary` gained `lazy` + `prototype()`.
- Environment (`src/render/environment.ts`): real rocks, cliff-ridge backdrop, ground cover, deadwood, camps (camps are now marked for removal).
- Tests: `tests/scenery-assets.test.ts` (budgets, grounding, embedded textures, Soldier contract).
- Procedural Age 1 textures: `assets_src/pipeline/make_textures.py` -> `assets_src/generated/` (conifer fronds, green/dry grass tufts, thatch, plus copies of the Soldier gear atlas and TeamColor cloth).

## Current task
Age 1 overhaul, done **procedurally in Three.js** (no Blender dependency):
1. Remove medieval/irrelevant assets: barrels, crates, chest, cannon, lantern, ladder, pickaxe, kite shield, axes, estoc, castle door, iron gate, fort kit, stone keep. Drop camps.
2. Primitive bases (player + enemy variant): palisade ring with an open gate facing the lane, huts with thatch roofs, hide tent, wood pile, campfire, a TeamColor banner pole. Replace `base.keep`.
3. Primitive turret: log watchtower with a mounted giant bow (`Weapon` child recoils on fire). Replace `turret.watchtower`.
4. Trees: procedural conifers (bark trunk + alpha needle-frond cards from `conifer_frond_*.png`) + a dead tree, instanced; remove the cone trees.
5. Terrain: splat-blended dirt/grass/rock ground (Poly Haven `sparse_grass`, `dirt_floor`, `rocky_trail_02`), lane as a worn dirt path instead of flat planes.
6. Grass tufts (`grass_tuft_green/dry.png`) framing the lane edges; wind sway in the vertex shader.
7. Atmosphere: campfire flames + smoke sprites, faint dust.
8. Age 1 weapons: spear (exists on the Soldier), hide shield, bow, arrows; arrow mesh for projectiles.

## Next
- Cave entrance assembled from cliff/rock pieces at the back slope.
- Unit readability: team-coloured ground ring.
- Re-verify in the deployed game (spawn, walk, attack, death, turret fire, zoom/pan).

## Decisions
- Age 1 only. No Age 2+ work.
- Procedural Three.js geometry over Blender for settlement/turret/trees so cloud sessions can iterate.
- Quaternius rejected (non-CC0 licence + low-poly style); Kenney rejected (stylised).
- Poly Haven trees rejected (0.4-2M tris; decimated versions looked dead).

## Known issues
- Deploy from a cloud session needs either the Vercel GitHub app access (preferred) or a `VERCEL_TOKEN` secret.
- Grass/ferns from Poly Haven read as dark specks at gameplay distance.
- Cone trees still present (being replaced).
- `public/models/age1/trees_kit.glb` / `grass_kit.glb` are an early Blender test export (sparse); superseded by the procedural trees.

## Test / build status (last run 2026-10-08)
- `npm test`: 109/109 pass. `npm run typecheck`: pass. `npm run build`: pass.

## Files changed recently
`src/assets/manifest.ts`, `src/assets/AssetLibrary.ts`, `src/assets/scenery.ts`, `src/render/environment.ts`, `src/render/sceneryInstancing.ts`, `src/render/GameRenderer.ts`, `tests/scenery-assets.test.ts`, `docs/*`, `.vercelignore`, `.gitignore`.

## Blender / local-only tasks
See `docs/AGE1_LOCAL_TASKS.md`.
