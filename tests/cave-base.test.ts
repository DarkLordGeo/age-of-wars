import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Box3, Raycaster, Vector3, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MAX_UNIT_TRIANGLES } from '../src/assets/contract';
import { GAME } from '../src/config/game';
import { CAVE_BASE, createSettlement } from '../src/render/age1/settlement';
import { deckY } from '../src/render/age1/turrets';

(globalThis as { self?: unknown }).self ??= globalThis;
(globalThis as { createImageBitmap?: unknown }).createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

async function cave(): Promise<Object3D> {
  const buf = readFileSync(join(import.meta.dirname, '..', 'public', 'models', 'stone_hut.glb'));
  return (await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '')).scene;
}

/** Rock surface height under base-local (x, z), as BaseView.rockHeight measures it. */
const rockAt = (base: Object3D, x: number, z: number) =>
  new Raycaster(new Vector3(x, 60, z), new Vector3(0, -1, 0)).intersectObject(base, true).find((h) => !h.object.name.startsWith('TeamColor'))?.point.y ?? 0;

describe('cave base model (stone_hut.glb, #45)', () => {
  it('is a single textured PBR mesh within the triangle budget, origin on the ground', async () => {
    const scene = await cave();
    let tris = 0;
    const mats: MeshStandardMaterial[] = [];
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position!.count) / 3;
      mats.push(m.material as MeshStandardMaterial);
    });
    assert.ok(tris > 5000 && tris <= MAX_UNIT_TRIANGLES, `${tris} triangles`);
    assert.equal(mats.length, 1);
    assert.equal(mats[0]!.name, 'CaveStone');
    assert.ok(mats[0]!.map && mats[0]!.normalMap && mats[0]!.roughnessMap, 'colour, normal and roughness maps');
    const box = new Box3().setFromObject(scene);
    assert.ok(Math.abs(box.min.y) < 1e-3, 'stands on y = 0');
  });

  it('becomes the base: scaled to its height, turret decks on the rock (not inside it), lane clear', async () => {
    const base = createSettlement(0x2f6fdb, { variant: 0, cave: await cave() });
    base.updateMatrixWorld(true);
    const box = new Box3().setFromObject(base.getObjectByName('CaveBase')!.children[0]!);
    assert.ok(Math.abs(box.max.y - box.min.y - CAVE_BASE.height) < 0.05);
    for (let i = 1; i < GAME.slotMounts.length; i++) {
      const m = GAME.slotMounts[i]!;
      const gap = deckY(i) - rockAt(base, m.forward, m.side);
      assert.ok(gap > -0.05, `slot ${i}: deck ${(-gap).toFixed(2)} m inside the rock`);
      assert.ok(gap < 6, `slot ${i}: deck ${gap.toFixed(2)} m above the rock`); // top slot: on log legs
    }
    let lane = 0;
    for (let x = 0; x <= 8; x++) for (const z of [-GAME.laneHalfWidth, 0, GAME.laneHalfWidth]) lane = Math.max(lane, rockAt(base, x, z));
    assert.ok(lane < 1, `rock ${lane.toFixed(2)} m high over the marching lane in front of the base`);
  });

  it('without the model the procedural camp is still the fallback', () => {
    const camp = createSettlement(0x2f6fdb, { variant: 0 });
    assert.equal(camp.getObjectByName('CaveBase'), undefined);
    assert.ok(new Box3().setFromObject(camp).max.y > 2, 'a built camp');
  });
});
