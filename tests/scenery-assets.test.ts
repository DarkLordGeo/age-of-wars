import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Box3, type Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { indexClips, MAX_UNIT_TRIANGLES, validateModel } from '../src/assets/contract';
import { SCENERY, type SceneryAsset } from '../src/assets/scenery';

// Node has no image decoding: stub it so GLTFLoader can parse embedded textures (geometry checks only).
(globalThis as { self?: unknown }).self ??= globalThis;
(globalThis as { createImageBitmap?: unknown }).createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const PUBLIC = join(import.meta.dirname, '..', 'public');
const fileOf = (url: string): string => join(PUBLIC, url);

async function load(url: string): Promise<{ scene: Object3D; animations: ReadonlyArray<{ name: string }>; bytes: number }> {
  const buf = readFileSync(fileOf(url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(ab, '');
  return { scene: gltf.scene, animations: gltf.animations, bytes: buf.byteLength };
}

function triangles(root: Object3D): number {
  let t = 0;
  root.traverse((o) => {
    const geo = (o as Mesh).geometry;
    if (geo) t += (geo.index ? geo.index.count : geo.attributes.position!.count) / 3;
  });
  return t;
}

function jsonChunk(url: string): { images?: Array<{ uri?: string }> } {
  const b = readFileSync(fileOf(url));
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

/** Nodes to check: the whole scene for a single asset, each named piece for a kit. */
function subjects(a: SceneryAsset, scene: Object3D): Array<{ name: string; node: Object3D }> {
  if (a.kind === 'single') return [{ name: a.key, node: scene }];
  return (a.pieces ?? []).map((p) => ({ name: `${a.key}/${p}`, node: scene.getObjectByName(p) as Object3D }));
}

describe('scenery library (public/models/env)', () => {
  it('has unique keys and every file exists', () => {
    assert.equal(new Set(SCENERY.map((a) => a.key)).size, SCENERY.length);
    for (const a of SCENERY) assert.ok(existsSync(fileOf(a.url)), `${a.key}: missing ${a.url}`);
  });

  it('boot payload stays small', () => {
    const boot = SCENERY.filter((a) => a.preload).reduce((sum, a) => sum + statSync(fileOf(a.url)).size, 0);
    assert.ok(boot < 30e6, `preloaded GLBs total ${(boot / 1e6).toFixed(1)} MB`);
  });

  for (const a of SCENERY) {
    it(`${a.key}: embedded textures, triangle budget, grounded origin`, async () => {
      const images = jsonChunk(a.url).images ?? [];
      assert.ok(images.every((i) => i.uri === undefined), 'textures must be embedded in the GLB');
      const { scene, bytes } = await load(a.url);
      assert.ok(bytes < 12e6, `${(bytes / 1e6).toFixed(1)} MB`);
      scene.updateMatrixWorld(true);
      for (const { name, node } of subjects(a, scene)) {
        assert.ok(node, `${name}: piece not found`);
        const tris = triangles(node);
        assert.ok(tris > 0 && tris <= a.maxPieceTris * 1.05, `${name}: ${tris} triangles (budget ${a.maxPieceTris})`);
        assert.ok(tris <= MAX_UNIT_TRIANGLES);
        const box = new Box3().setFromObject(node);
        const h = Math.max(box.max.y - box.min.y, 1e-3);
        assert.ok(Math.abs(box.min.y) <= Math.max(0.02 * h, 0.03), `${name}: lowest point y=${box.min.y.toFixed(3)} (origin should sit on the ground)`);
        assert.ok(Math.abs((box.min.x + box.max.x) / 2) <= 0.02 + 0.05 * (box.max.x - box.min.x), `${name}: not centred on x`);
      }
    });
  }
});

describe('soldier.glb (production unit)', () => {
  const url = '/models/soldier.glb';
  it('meets the unit contract: height, origin, 4 clips, triangle budget', async () => {
    if (!existsSync(fileOf(url))) return; // not exported yet
    const { scene, animations } = await load(url);
    const clips = indexClips(animations as never);
    assert.deepEqual(validateModel(scene, clips, { expectedHeight: 1.8, requireClips: true }), []);
    assert.ok(triangles(scene) < 12000);
  });
});
