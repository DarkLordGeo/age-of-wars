# Age 1: tasks that need the owner's PC or accounts

Nothing here blocks development; work continues procedurally in Three.js.

## Needs a one-time authorization
- [ ] **Vercel GitHub app access to `DarkLordGeo/age-of-wars`** (GitHub -> Settings -> Applications -> Vercel -> Configure -> Repository access -> add `age-of-wars`). After that, the agent links the repo with the Vercel MCP `create_git_project` and every push to `main` deploys to https://age-of-wars.vercel.app. Until then only the local CLI (`vercel deploy --prod`) can deploy.

## Needs local Blender (optional polish, not required for Age 1)
- [ ] Re-export `public/models/age1/trees_kit.glb` with the denser conifer settings in `assets_src/pipeline/age1.py` (the last run crashed Blender mid-export). Procedural trees in code supersede this.
- [ ] Soldier: clean up the jagged edges of the jerkin/sash shells (`assets_src/soldier/soldier_production.blend`).
- [ ] Record the original licence of `male_character_base_rigged.glb` in `docs/ASSET_LICENSES.md`.

## Local-only source files (gitignored, re-downloadable)
- `assets_src/polyhaven/`: `python assets_src/download_polyhaven.py <id>...`
- `assets_src/opengameart/3td_cave_pack_pro/`: https://opengameart.org/content/3td-cave-pack-pro-v10
