import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Box3, Vector3, type Material, type Mesh, type Object3D, type SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { indexClips, MAX_UNIT_TRIANGLES, TEAM_COLOR_MATERIAL, validateModel } from '../src/assets/contract';
import { UNITS } from '../src/config/units';
import { createDinoRider } from '../src/render/age1/dino';

// Node has no image decoding: stub it so GLTFLoader can parse embedded textures (geometry checks only).
(globalThis as { self?: unknown }).self ??= globalThis;
(globalThis as { createImageBitmap?: unknown }).createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const PUBLIC = join(import.meta.dirname, '..', 'public');

async function load(url: string) {
  const buf = readFileSync(join(PUBLIC, url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(ab, '');
  return { scene: gltf.scene, clips: indexClips(gltf.animations), bytes: buf.byteLength };
}

function triangles(root: Object3D): number {
  let t = 0;
  root.traverse((o) => {
    const geo = (o as Mesh).geometry;
    if (geo) t += (geo.index ? geo.index.count : geo.attributes.position!.count) / 3;
  });
  return t;
}

function materials(root: Object3D): Material[] {
  const out: Material[] = [];
  root.traverse((o) => {
    const m = (o as Mesh).material;
    if (m) out.push(...(Array.isArray(m) ? m : [m]));
  });
  return out;
}

/** Is `node` (transitively) attached to a bone named `bone`? */
function under(node: Object3D, bone: string): boolean {
  for (let p = node.parent; p; p = p.parent) if (p.name === bone) return true;
  return false;
}

function skinned(root: Object3D): SkinnedMesh | undefined {
  let s: SkinnedMesh | undefined;
  root.traverse((o) => {
    if (!s && (o as SkinnedMesh).isSkinnedMesh) s = o as SkinnedMesh;
  });
  return s;
}

describe('clubman.glb (rigged Rodin caveman, model a)', () => {
  it('meets the unit contract: 1.8 m, feet at y=0, idle/walk/attack/death, triangle budget', async () => {
    const { scene, clips, bytes } = await load('/models/clubman.glb');
    assert.deepEqual(validateModel(scene, clips, { expectedHeight: 1.8, requireClips: true }), []);
    assert.ok(triangles(scene) <= MAX_UNIT_TRIANGLES);
    assert.ok(bytes < 1.5e6, `${bytes} bytes`);
  });

  it('is a real skinned rig (17 bones), not a rigid mesh', async () => {
    const { scene } = await load('/models/clubman.glb');
    const body = skinned(scene);
    assert.ok(body, 'skinned body mesh');
    assert.equal(body.skeleton.bones.length, 17);
    for (const b of ['Hips', 'Spine', 'Head', 'UpperArmR', 'HandR', 'ThighL', 'FootR']) assert.ok(scene.getObjectByName(b), b);
  });

  it('carries the club in the right hand and a team-colour belt; faces +X', async () => {
    const { scene } = await load('/models/clubman.glb');
    const club = scene.getObjectByName('Club');
    assert.ok(club && under(club, 'HandR'), 'club parented to the right hand bone');
    assert.ok(materials(scene).some((m) => m.name === TEAM_COLOR_MATERIAL), 'TeamColor material');
    // In the bind (T) pose the club points straight forward from the fist: +X in game space.
    scene.updateMatrixWorld(true);
    const hand = scene.getObjectByName('HandR')!.getWorldPosition(new Vector3());
    const c = new Box3().setFromObject(club).getCenter(new Vector3());
    assert.ok(c.x - hand.x > 0.15, `club centre ${c.x.toFixed(2)} ahead of the hand ${hand.x.toFixed(2)}`);
  });

  it('attack clip fits between two club hits', async () => {
    const { clips } = await load('/models/clubman.glb');
    assert.ok(clips.get('attack')!.duration < UNITS.clubman!.melee.interval);
    assert.ok(clips.get('death')!.duration <= 1.6, 'death finishes within the corpse linger');
    assert.ok(clips.get('hit')!.duration <= 0.5, 'short flinch');
  });
});

describe('dino_rider.glb (rigged Rodin rider, model g)', () => {
  it('is a skinned rider with idle and attack clips, a spear and a team belt', async () => {
    const { scene, clips } = await load('/models/dino_rider.glb');
    assert.ok(clips.has('idle') && clips.has('attack'));
    assert.ok(triangles(scene) <= MAX_UNIT_TRIANGLES);
    assert.equal(skinned(scene)?.skeleton.bones.length, 17);
    const spear = scene.getObjectByName('Spear');
    assert.ok(spear && under(spear, 'HandR'), 'spear parented to the right hand bone');
    assert.ok(materials(scene).some((m) => m.name === TEAM_COLOR_MATERIAL));
  });

  it('sits on the procedural dinosaur and its spear moves with the attack', async () => {
    const { scene, clips } = await load('/models/dino_rider.glb');
    const dino = createDinoRider(0xd04040, { model: scene, clips });
    assert.ok(dino.getObjectByName('Armature'), 'rider GLB mounted');
    const hand = dino.getObjectByName('HandR')!;
    const at = (attack: number): Vector3 => {
      dino.userData.animate(1, false, attack);
      dino.updateMatrixWorld(true);
      return hand.getWorldPosition(new Vector3());
    };
    const rest = at(0);
    const back = at(0.3);
    const thrust = at(0.45);
    assert.ok(rest.y > 1.8, `rider sits on the back (hand at y=${rest.y.toFixed(2)})`);
    assert.ok(back.distanceTo(rest) > 0.2, 'spear drawn back');
    assert.ok(thrust.x > back.x + 0.3, 'spear thrust forward (+X)');
  });
});
