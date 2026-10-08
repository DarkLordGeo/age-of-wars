// Bake baseColor texture into vertex colours, weld by position, simplify, write a small GLB.
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [,, input, output, targetTris] = process.argv;
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const src = await io.read(input);
const prim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray();
const UV = prim.getAttribute('TEXCOORD_0').getArray();
const I = prim.getIndices().getArray();
const tex = prim.getMaterial().getBaseColorTexture();
const { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const srgb2lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
// weld by quantized position
const q = 2e-4, map = new Map(), remap = new Uint32Array(P.length / 3);
const pos = [], col = [], cnt = [];
for (let v = 0; v < P.length / 3; v++) {
  const key = `${Math.round(P[v*3]/q)},${Math.round(P[v*3+1]/q)},${Math.round(P[v*3+2]/q)}`;
  let id = map.get(key);
  if (id === undefined) { id = pos.length / 3; map.set(key, id); pos.push(P[v*3], P[v*3+1], P[v*3+2]); col.push(0,0,0); cnt.push(0); }
  remap[v] = id;
  const x = Math.min(W-1, Math.max(0, Math.floor(UV[v*2] * W))), y = Math.min(H-1, Math.max(0, Math.floor(UV[v*2+1] * H)));
  const o = (y * W + x) * 3;
  col[id*3] += srgb2lin(data[o]); col[id*3+1] += srgb2lin(data[o+1]); col[id*3+2] += srgb2lin(data[o+2]); cnt[id]++;
}
for (let i = 0; i < cnt.length; i++) for (let k = 0; k < 3; k++) col[i*3+k] /= cnt[i];
let idx = new Uint32Array(I.length); for (let i = 0; i < I.length; i++) idx[i] = remap[I[i]];
if (process.argv[5] === 'largest') {
  // keep only the largest connected piece (drops stray fragments copied from the reference image)
  const n = pos.length / 3, par = new Int32Array(n).map((_, i) => i);
  const f = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < idx.length; t += 3) { const a = f(idx[t]); par[f(idx[t+1])] = a; par[f(idx[t+2])] = a; }
  const size = new Map(); for (let t = 0; t < idx.length; t += 3) { const r = f(idx[t]); size.set(r, (size.get(r) ?? 0) + 1); }
  const best = [...size].sort((a, b) => b[1] - a[1])[0][0];
  const keep = []; for (let t = 0; t < idx.length; t += 3) if (f(idx[t]) === best) keep.push(idx[t], idx[t+1], idx[t+2]);
  console.log(`kept ${keep.length / 3} of ${idx.length / 3} tris`);
  idx = new Uint32Array(keep);
}
const positions = new Float32Array(pos), colors = new Float32Array(col);
const [simp, err] = MeshoptSimplifier.simplifyWithAttributes(idx, positions, 3, colors, 3, [0.5, 0.5, 0.5], null, Number(targetTris) * 3, 0.2, []);
// compact
const used = new Map(), np = [], nc = [], ni = new Uint32Array(simp.length);
for (let i = 0; i < simp.length; i++) { let n = used.get(simp[i]); if (n === undefined) { n = np.length / 3; used.set(simp[i], n); const s = simp[i]; np.push(positions[s*3], positions[s*3+1], positions[s*3+2]); nc.push(colors[s*3], colors[s*3+1], colors[s*3+2], 1); } ni[i] = n; }
// smooth normals
const nn = new Float32Array(np.length);
for (let t = 0; t < ni.length; t += 3) {
  const [a,b,c] = [ni[t], ni[t+1], ni[t+2]];
  const ux = np[b*3]-np[a*3], uy = np[b*3+1]-np[a*3+1], uz = np[b*3+2]-np[a*3+2];
  const vx = np[c*3]-np[a*3], vy = np[c*3+1]-np[a*3+1], vz = np[c*3+2]-np[a*3+2];
  const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
  for (const v of [a,b,c]) { nn[v*3]+=nx; nn[v*3+1]+=ny; nn[v*3+2]+=nz; }
}
for (let v = 0; v < nn.length / 3; v++) { const l = Math.hypot(nn[v*3], nn[v*3+1], nn[v*3+2]) || 1; nn[v*3]/=l; nn[v*3+1]/=l; nn[v*3+2]/=l; }
const doc = new Document(); const buf = doc.createBuffer();
const acc = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buf);
const mat = doc.createMaterial('Body').setBaseColorFactor([1,1,1,1]).setRoughnessFactor(0.85).setMetallicFactor(0);
const p2 = doc.createPrimitive().setAttribute('POSITION', acc(new Float32Array(np), 'VEC3')).setAttribute('NORMAL', acc(nn, 'VEC3'))
  .setAttribute('COLOR_0', acc(new Float32Array(nc), 'VEC4')).setIndices(acc(ni, 'SCALAR')).setMaterial(mat);
const node = doc.createNode('model').setMesh(doc.createMesh('model').addPrimitive(p2));
doc.createScene('Scene').addChild(node);
await new NodeIO().write(output, doc);
console.log(`${I.length/3} tris, welded ${cnt.length} verts -> ${ni.length/3} tris (err ${err.toFixed(3)}), ${np.length/3} verts`);
