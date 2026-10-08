# Age of Wars

[![CI](https://github.com/DarkLordGeo/age-of-wars/actions/workflows/ci.yml/badge.svg)](https://github.com/DarkLordGeo/age-of-wars/actions/workflows/ci.yml)

A realistic 3D browser lane-battler inspired by the Flash game *Age of War*: train units, build turrets on your cave and destroy the enemy base. Written in TypeScript with Three.js and Vite.

**Play:** https://age-of-wars.vercel.app

## Status

Early development. **Age 1 (Stone Age)** is playable:
- Clubman, Slingshot Man and Dino Rider units
- three turrets on four buyable slots on the cave base
- the original game's economy and enemy AI (numbers researched in [docs/AGE1_SPEC.md](docs/AGE1_SPEC.md))
- main and pause menus, plus music

Sound effects, proper character rigs and the special ability are still missing. Later ages come after Age 1 is finished.
Progress is tracked on the [project board](https://github.com/users/DarkLordGeo/projects/2) and in [Issues](https://github.com/DarkLordGeo/age-of-wars/issues), grouped by milestone.

## Controls

The game boots into the main menu, which runs over an AI-vs-AI battle.
- In a match, `1`-`3` (or the Menu panel's unit buttons) queue units; click a queue square to cancel it and get a refund.
- `Esc` opens the pause menu.
- URL options: `?play=easy|normal|hard` skips the menu, `?quality=low|medium|high` sets the render quality.

## Tech stack

TypeScript (strict) · Three.js r186 · Vite 8 · tests on Node's built-in test runner through tsx · deployed on Vercel. 3D assets are processed in Blender (scripts in `assets_src/`).

## Getting started

Requires Node.js 22 (see `.nvmrc`).

```bash
npm ci             # install exact versions from package-lock.json
npm run dev        # dev server on http://localhost:5173
npm run typecheck  # tsc --noEmit
npm test           # headless simulation, asset and audio tests
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

There is no linter or formatter configured; TypeScript runs in strict mode.

## Architecture

| Folder | Role | Depends on |
| --- | --- | --- |
| `src/config` | Pure data: units, turrets, projectiles, ages, AI profiles, camera, music, tunables. `schema.ts` defines the shapes and `content.ts` bundles them | nothing |
| `src/sim` | Game logic (`World`, `OriginalAi`, `TeamState`, progression). No Three.js or DOM; advanced in fixed steps; emits `SimEvent`s | `config` |
| `src/game` | `Game` composition root, fixed-step loop, `EventBus` | everything |
| `src/assets` | `AssetLibrary` (key → GLB with a code-built fallback), manifest, model contract | three |
| `src/render` | Draws the `World` in Three.js (terrain, environment, camera, post-processing); never changes it | `sim`, `assets` |
| `src/render/age1` | Code-built Age 1 art: cave turret mounts, turrets, conifers, grass, sky, clouds, Dino Rider, auto-rig | three |
| `src/audio` | Music player and mixer; sound-effect hooks | `game` |
| `src/ui` | DOM HUD and menus, generated from the content data | `sim` (read-only) |

`World` takes a `Content` bundle, so tests can swap the data without touching the logic. Model rules (scale, facing, origin, animation clips) are in [docs/ASSET_SPEC.md](docs/ASSET_SPEC.md).

## Development workflow

Work on a branch, open a pull request, let CI pass (typecheck, tests, build), then merge into `main`. Details are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Deployment

Vercel's GitHub integration builds every pull request into a preview deployment and deploys `main` to production at https://age-of-wars.vercel.app. Vercel runs `npm run build` and serves `dist/`. No deployment secrets live in this repository. Pushing a `v*.*.*` tag creates a GitHub Release (`.github/workflows/release.yml`).

## Licence

No licence has been chosen for the code yet, so all rights are reserved by default. Third-party assets keep their own licences, listed in [docs/ASSET_LICENSES.md](docs/ASSET_LICENSES.md). Some of those are still being confirmed (see the M1 milestone).
