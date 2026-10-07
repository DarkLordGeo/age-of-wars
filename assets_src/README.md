# assets_src

Untouched originals and the scripts used to turn them into game assets. Nothing here is served by the game.

- `polyhaven/<id>/` - Poly Haven glTF 1k downloads (CC0) + `info.json` (author/licence metadata). Fetch more with `python assets_src/download_polyhaven.py <id>...`.
- `opengameart/3td_cave_pack_pro/` - original zip and extracted Collada files (CC0).
- `soldier/soldier_production.blend` - Blender source of `public/models/soldier.glb`.
- `_catalog/` - API catalogue dumps and download logs.
- `make_licenses.py` - regenerates `docs/ASSET_LICENSES.md`.

## Processing recipe (done in Blender 5.2 via the MCP)

1. Import the glTF (or Collada through a small custom reader, because Blender 5 has no Collada importer).
2. Bake node transforms into the meshes, drop non-mesh nodes, remove shape keys/modifiers/vertex groups.
3. Weld vertices (`remove_doubles`), then iterate the Decimate (collapse) modifier until the triangle budget is met.
4. Move the origin to bottom-centre; rescale where the source was not in metres.
5. Shrink textures (256-1024 px), export GLB with embedded JPEG textures (`AUTO` when alpha is needed).
6. Multi-object sources (rock sets, plants, fort pieces) are exported as one kit GLB with one named node per piece.
- `pipeline/` - the Blender Python used (Soldier equipment/animation: eq*.py, anim*.py; environment assets: proc.py, dae.py). They run inside Blender through the MCP.
