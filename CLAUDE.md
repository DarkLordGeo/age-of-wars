# Age of Wars: instructions for Claude Code

A realistic 3D browser game inspired by *Age of War* (Three.js + TypeScript + Vite). Only **Age 1 (Stone Age)** is in scope until Age 1 is signed off.
Repo `DarkLordGeo/age-of-wars` · live https://age-of-wars.vercel.app

## Source of truth for progress
- **GitHub is the task tracker**: Issues + Project "Age of Wars — Age 1 Roadmap" (https://github.com/users/DarkLordGeo/projects/2), milestones M1–M8.
- Never rely on earlier conversation context or memory for task status. Check GitHub at the start of every session.
- Don't keep task status in this file or in any other doc. `docs/AGE1_PROGRESS.md` and `docs/AGE1_LOCAL_TASKS.md` are history and setup notes. Where they conflict with GitHub, GitHub wins.
- For the full session workflow, use the skill `.claude/skills/age-of-wars-project-management/SKILL.md`.

## Choosing and doing work
1. Before choosing work, read the board: statuses, blockers ("Blocked by #N" in the issue body, `blocked` label), and recently closed issues.
2. Take the **highest-priority Ready issue whose blockers are all closed** (P0 before P1, and so on). Skip `needs: owner` issues unless the owner has supplied what they need.
3. Work on one issue at a time and keep the diff to that issue's scope. File new findings as new issues instead of fixing them on the side.
4. Never mark an issue Done or close it until every Definition of Done item has been verified. Move it to Review / QA when it's implemented but still needs validation (for example on the owner's PC).
5. When finished, comment on the issue with: what changed, the commands run and their results, and any remaining limitations. Only change Project status when the work justifies it.
6. If GitHub is unreachable, do only work that is safe without it, and say clearly that the board was **not** synchronized.
7. Only ask the owner about decisions that need them: unresolved licensing, major design tradeoffs, or local-only tools and accounts. Routine, reversible development steps covered here need no approval.
8. Never claim a test, build, commit, push, board update or deployment succeeded unless you ran and checked it.

## Commands
- `npm run typecheck`: `tsc --noEmit`
- `npm test`: node:test via tsx, `tests/**/*.test.ts`
- `npm run build`: typecheck + `vite build` into `dist/` (gitignored)
- Dev server: `npm run dev` (port 5173, `.claude/launch.json` name `dev`)
- GLB check: `scripts/validate-glb.mts`

## Commits, PRs and deployment
- Every push to `main` deploys to production on Vercel, and every PR gets a Vercel preview deployment.
- Flow: work on a branch (naming in `CONTRIBUTING.md`), then open a PR. CI (`.github/workflows/ci.yml`: typecheck, tests, build, hygiene) must pass before merging. Commit and push only when the session's instructions allow it; otherwise leave the changes uncommitted and say so.
- Commit messages use the `age1: <what changed>` style and reference the issue with `Refs #N`. Close issues by hand after verification, not with `Closes #N`.
- Other automation: CodeQL, Dependabot (npm weekly, Actions monthly), and a GitHub Release when a `v*.*.*` tag is pushed. Don't add deploy workflows; Vercel's Git integration handles deployment.
- Cloud sessions can't open `*.vercel.app`, so the live site has to be checked in a real browser.

## Architecture (stable facts)
- `src/sim/`: pure simulation with no Three.js or DOM (`World.ts`, `OriginalAi.ts`), advanced in fixed steps, events go to the renderer. Gameplay numbers live in `src/config/` and follow `docs/AGE1_SPEC.md` (CONFIRMED values come from the original game; record INFERRED or UNKNOWN as such).
- `src/render/`: draws the sim state; `src/render/age1/` holds code-built Stone Age geometry (trees, turrets, cave mounts, dino, sky).
- `src/assets/`: `AssetLibrary` + `manifest.ts` map keys to GLBs with code-built fallbacks. Use this loader only; don't add a second one. The model rules are in `docs/ASSET_SPEC.md` and `src/assets/contract.ts` (+X facing, origin at the feet, ≤20k tris, idle/walk/attack/death clips, `TeamColor` material).
- The sim lane is one-dimensional. The winding road and unit z positions are visual only.

## Assets and licensing
- Every third-party file needs a row in `docs/ASSET_LICENSES.md` (source, author, licence, URL, local path) **before** it is committed. CC0 is preferred. Ask the owner when a licence is unclear; never guess.
- Don't run `assets_src/make_licenses.py` until #4 is fixed: it overwrites hand-written sections.
- Never overwrite source files (`male_character_base_rigged.glb`, `assets_src/` originals). Processed copies go to `public/`.
- Style is realistic Stone Age, not cartoon or medieval. Quaternius (licence) and Kenney (style) were rejected.
- Blender work needs the owner's PC with Blender 5.2 and the Blender MCP addon. Pipeline scripts are in `assets_src/pipeline/`, Rodin baking in `assets_src/rodin/`.
