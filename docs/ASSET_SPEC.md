# Model asset contract

Applies to every unit model (soldier first). The code form lives in `src/assets/contract.ts`;
a model that breaks it still loads but logs a warning listing what is wrong.

## Scene conventions

| Item | Rule |
| --- | --- |
| Scale | 1 unit = 1 metre. Soldier ≈ 1.8 m tall (archer 1.7, brute 2.6). |
| Up axis | +Y (glTF standard; the Blender exporter's "+Y Up" option, on by default). |
| Facing | Character faces **+X**. The game mirrors the model for the enemy team. |
| Origin | Centre of the feet, on the ground (lowest point at y = 0). |
| Transforms | Apply scale and rotation in Blender before export (no non-identity object transforms). |
| Root motion | None. Animate in place; the simulation moves the unit. |

## File format

- glTF 2.0 binary, `.glb`, in `public/models/`, registered in `src/assets/manifest.ts` via `url`.
- One skinned mesh on one armature is the expected shape. Textures embedded.
- Budget: ≤ 20,000 triangles per unit (checked), ≤ 2048² textures (by convention).
- Optional: a material named exactly `TeamColor` is cloned and recoloured per team
  (blue for the player, red for the enemy). Use it for cloth/banner areas.

## Animation clips

Names are case-insensitive. Blender's `Armature|walk` style also works (text after the last `|` counts).

| Clip | Playback | Used when |
| --- | --- | --- |
| `idle` | loops | waiting in line, or attacking between swings |
| `walk` | loops | advancing or closing on a target |
| `attack` | once | each time the unit swings or fires; keep it ≲ 0.8 s |
| `death` | once, holds the last frame | unit dies; the body lingers 1.6 s then is removed |

Blender export: Animation → "Always sample", enable "NLA tracks" or push each action to its own
NLA strip so all four export; Armature "Deform bones only"; Normals + Skinning on.

## Enabling a model

1. Export `soldier.glb` to `public/models/`.
2. In `src/assets/manifest.ts`: `lib.register('unit.soldier', { url: '/models/soldier.glb', placeholder: ..., expectedHeight: 1.8 })`.
3. `npm run dev` and read the browser console: warnings name every contract violation.
   If the file fails to load the game falls back to the placeholder.

Instances share geometry, textures and materials but each gets its own skeleton and animation
mixer, so any number of units can use one file.

## Scenery & props (free CC0 library)

Everything under `public/models/env/` (rocks, cliffs, plants, props, weapons, structures, caves) is catalogued in
`src/assets/scenery.ts` and registered through the normal manifest (`env.*` keys), so there is still one loader
(`AssetLibrary`). Licences/authors: [ASSET_LICENSES.md](ASSET_LICENSES.md). Originals: `assets_src/` (never edited).

| Item | Rule |
| --- | --- |
| Scale | Real-world metres as authored (a boulder is 1-3 m, a crate 0.5 m, a cliff section 8-20 m). Scale per instance in code. |
| Origin | Bottom-centre: lowest point y = 0, centred on x/z (checked by `tests/scenery-assets.test.ts`). |
| Kits | One GLB, several top-level nodes (`rock_moss_set`, `plant_*_kit`, `cave_rocks_kit`); each piece is grounded at the origin and found by node name. Kits share textures. |
| Budget | <= 8,000 triangles per piece (each entry's `maxPieceTris` is tested), textures 256-1024 px, embedded, JPEG (PNG only where alpha is needed). |
| Loading | `preload: true` entries are fetched at boot (the battlefield uses them); others are `lazy` - call `assets.loadModel(key, url)` first. |
| Using them | Never `instantiate()` scenery per object. `partsOf(assets, key, piece?)` (`src/render/sceneryInstancing.ts`) returns the shared geometry/material; `addInstances` builds one `InstancedMesh` per part (scale, rotation, per-instance tint = material variation). Foliage uses alpha-test (`foliage: true`). |
| Fallback | If a model fails to load the environment keeps its original procedural rocks/mountains; `partsOf` returns `[]`. |
| Base / turret | Age 1 `base.keep` and `turret.watchtower` are procedural, not GLBs (see "Age 1 procedural models" below). |

Re-processing: `assets_src/download_polyhaven.py <id...>` downloads a Poly Haven glTF pack (CC0, 1k) into `assets_src/polyhaven/<id>/`;
the Blender steps used (import, weld + decimate, ground, texture shrink, GLB export) are described in `assets_src/README.md`.

## Soldier (`public/models/soldier.glb`)

Skinned Soldier/Spear Fighter built from the base male rig: 31 deform bones, one skinned mesh (4 materials: `Skin`, `Eyes`, `Gear`, `TeamColor`),
~9.8k triangles, 1.8 m, +X facing, origin at the feet, clips `idle` (mocap loop with the spear-carry right arm), `walk` (16 frames,
brisk jog for 3.2 m/s), `attack` (18 frames spear thrust, 0.75 s), `death` (31 frames, supine). Registered in `manifest.ts`;
a procedural hide shield is parented to `LeftForeArm_012` at instantiate time (`AssetSpec.decorate`, `src/render/age1/gear.ts`).

## Age 1 procedural models (`src/render/age1/`)

Built in code so cloud sessions can iterate without Blender. Same conventions as GLBs: metres, facing +X, origin on the ground,
team-coloured parts use a material named `TeamColor`. Built with `PieceBuilder` (one merged mesh per material).

| Model | Builder | Notes |
| --- | --- | --- |
| `base.keep` | `createSettlement(tint, { variant })` | Palisade ring (centre x = -2, r = 12.5) with the gate on +X, great hut over the spawn point (units march out of its door), huts, hide tent, wood pile, drying rack, campfire (`FireFx`), banner + gate pennants. `userData.tick(dt)` animates fire and cloth; `BaseView` calls it. The enemy base is mirrored (`scale.x = -1`) so the low front of the palisade faces the camera for both teams. Clearances (gate, marching corridor, turret mount) are tested. |
| `turret.watchtower` | `createWatchtower(tint)` | Log tower, deck at 4.3 m, child `Weapon` (giant bow) at 5.5 m = `muzzleHeight`; `BaseView` recoils `Weapon` along local -X and hides `NockedArrow` until reload. |
| Trees | `buildConifer(seed)`, `buildDeadTree(seed)` | 1 m tall unit trees, instanced and scaled to 6-14 m. Frond cards use `conifer_frond_*.png`; wind sway in the vertex shader (`wind.ts`). |
| Ground | `createTerrainMaterial()` | Splat attribute `splat` = (dirt, rock, mud), grass is the remainder; weights from `groundSplat()` in `environment.ts`. Camps and the lane corridor are flat (`terrainHeight`). |
| Projectiles | `createArrowGeometry()` | 1 m arrow at `size` 0.12; the turret's giant arrow is the same mesh at `size` 0.2. |

Textures: `python assets_src/pipeline/make_age1_textures.py` -> `public/textures/age1/` (ground maps are Poly Haven CC0; the rest is procedural).

