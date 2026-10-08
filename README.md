# Age of Wars (working title)

Original 3D lane-battler. TypeScript + Three.js + Vite.

```
npm install
npm run dev        # play
npm run build      # typecheck + production build
npm test           # headless simulation tests
```

Boots into the main menu (over an AI-vs-AI battle). In a match: `1`-`3` or the Menu panel's unit buttons
queue units (click a queue square to cancel + refund) · `Esc` pause menu. The camera is fixed beside your
camp (`src/config/camera.ts`). URL options: `?play=easy|normal|hard` skips the menu, `?quality=low|medium|high`.

Music: drop `glorious-morning.mp3` into `public/audio/music/` (see the README there); the game is silent
without it. Music and sound effects have separate volume sliders in Options.

## Architecture

| Folder | Role | Depends on |
| --- | --- | --- |
| `src/config` | Pure data: units, projectiles, turrets, ages, upgrades, AI profiles, camera, tunables (`schema.ts` defines the shapes, `content.ts` bundles them) | nothing |
| `src/sim` | Game logic (`World`, `TeamState`, `EnemyAi`, progression). No Three.js/DOM. Emits `SimEvent`s | `config` |
| `src/game` | `Game` composition root + fixed-step loop, `EventBus` | everything |
| `src/assets` | `AssetLibrary` (key → model, GLB with placeholder fallback), manifest, placeholders | three |
| `src/render` | Mirrors the `World` into Three.js (pooled views, instanced projectiles); never mutates it | `sim`, `assets` |
| `src/render/age1` | Procedural Age 1 art: camp, watchtower, conifers, splat terrain, grass, fire, dust, unit gear | three |
| `src/audio` | Sound-cue hooks (placeholder bank) | `game` |
| `src/ui` | DOM HUD generated from content; acts through handlers | `sim` (read-only) |

`World` takes a `Content` bundle, so tests and future modes can swap data without touching logic.

Real models: see [docs/ASSET_SPEC.md](docs/ASSET_SPEC.md) for the scale/facing/origin/clip contract and how to enable a GLB.
