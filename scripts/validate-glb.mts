import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { indexClips, validateModel } from '../src/assets/contract';
import { Box3, SkinnedMesh } from 'three';

// Node has no browser image decoding: stub it so GLTFLoader can parse embedded textures (geometry/animation checks only).
(globalThis as any).self ??= globalThis;
(globalThis as any).createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
const path = process.argv[2];
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const gltf: any = await new GLTFLoader().parseAsync(ab, '');
const clips = indexClips(gltf.animations);
console.log('clips', [...clips.keys()], gltf.animations.map((c: any) => `${c.name}:${c.duration.toFixed(3)}s/${c.tracks.length}tr`));
console.log('problems', validateModel(gltf.scene, clips, { expectedHeight: 1.8, requireClips: true }));
gltf.scene.updateMatrixWorld(true);
const box = new Box3().setFromObject(gltf.scene);
console.log('bbox', box.min.toArray().map((n: number) => +n.toFixed(3)), box.max.toArray().map((n: number) => +n.toFixed(3)));
let skinned = 0, meshes = 0, tris = 0, bones = 0;
const mats = new Set<string>();
gltf.scene.traverse((o: any) => {
  if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => mats.add(`${m.name}:${m.map ? 'map' : 'nomap'}`)); }
  if (o.isSkinnedMesh) { skinned++; bones = (o as SkinnedMesh).skeleton.bones.length; }
});
console.log({ meshes, skinned, tris, bones, mats: [...mats] });
// root motion: bone position tracks of Hips across clips
for (const c of gltf.animations) {
  const t = c.tracks.filter((k: any) => k.name.endsWith('.position'));
  console.log(c.name, 'position tracks:', t.map((k: any) => k.name.split('.')[0] + `(${k.values.length / 3})`).join(','));
}
