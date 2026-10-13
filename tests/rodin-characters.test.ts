import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { AnimationMixer, Group, Vector3, type Material, type Mesh, type Object3D, type SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetLibrary } from '../src/assets/AssetLibrary';
import { ModelAnimator } from '../src/render/ModelAnimator';
import { clipVariants, indexClips, MAX_UNIT_TRIANGLES, TEAM_COLOR_MATERIAL, validateModel } from '../src/assets/contract';
import { GAME } from '../src/config/game';
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

describe('clubman.glb (Rodin caveman a, Mixamo rig and animations)', () => {
  it('meets the unit contract: 1.8 m, feet at y=0, idle/walk/attack/death, triangle budget', async () => {
    const { scene, clips, bytes } = await load('/models/clubman.glb');
    assert.deepEqual(validateModel(scene, clips, { expectedHeight: 1.8, requireClips: true }), []);
    assert.ok(triangles(scene) <= MAX_UNIT_TRIANGLES);
    assert.ok(bytes < 1.6e6, `${bytes} bytes`);
  });

  it('is a real skinned Mixamo rig, facing +X', async () => {
    const { scene } = await load('/models/clubman.glb');
    const body = skinned(scene);
    assert.ok(body, 'skinned body mesh');
    assert.equal(body.skeleton.bones.length, 65);
    scene.updateMatrixWorld(true);
    const foot = scene.getObjectByName('mixamorigLeftFoot')!.getWorldPosition(new Vector3());
    const toe = scene.getObjectByName('mixamorigLeftToeBase')!.getWorldPosition(new Vector3());
    assert.ok(toe.x - foot.x > 0.05, 'toes point along +X');
  });

  it('keeps the club in the right fist through the swing, and has a team-colour belt', async () => {
    const { scene, clips } = await load('/models/clubman.glb');
    assert.ok(materials(scene).some((m) => m.name === TEAM_COLOR_MATERIAL), 'TeamColor material');
    const club = scene.getObjectByName('Club') as SkinnedMesh;
    assert.ok(club?.isSkinnedMesh, 'club is skinned to the hand');
    const hand = scene.getObjectByName('mixamorigRightHand')!;
    const mixer = new AnimationMixer(scene);
    const attack = clips.get('attack')!;
    mixer.clipAction(attack).play();
    for (const t of [0, attack.duration * 0.5, attack.duration * 0.95]) {
      mixer.setTime(t);
      scene.updateMatrixWorld(true);
      const hp = hand.getWorldPosition(new Vector3());
      const pos = club.geometry.getAttribute('position');
      let nearest = Infinity;
      const v = new Vector3();
      for (let i = 0; i < pos.count; i++) {
        club.getVertexPosition(i, v);
        nearest = Math.min(nearest, v.applyMatrix4(club.matrixWorld).distanceTo(hp));
      }
      assert.ok(nearest < 0.15, `club ${nearest.toFixed(3)} m from the hand at t=${t.toFixed(2)}`);
    }
  });

  it('clip timing fits the game: swing between hits, deaths within the corpse linger, two death takes', async () => {
    const buf = readFileSync(join(PUBLIC, '/models/clubman.glb'));
    const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
    const variants = clipVariants(gltf.animations);
    assert.ok(variants.get('attack')![0]!.duration < UNITS.clubman!.melee.interval);
    assert.equal(variants.get('death')!.length, 2, 'death and death_2');
    for (const d of variants.get('death')!) assert.ok(d.duration <= GAME.corpseLinger, `${d.name} ${d.duration.toFixed(2)} s`);
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

describe('dino.glb (Rodin dinosaur d + seated rider, one set of clips)', () => {
  it('meets the unit contract (3.2 m class, idle/walk/attack/death, <=20k tris) with two skins', async () => {
    const { scene, clips } = await load('/models/dino.glb');
    assert.deepEqual(validateModel(scene, clips, { expectedHeight: 3.2, requireClips: true }), []);
    assert.ok(triangles(scene) <= MAX_UNIT_TRIANGLES);
    const skins = new Set<unknown>();
    scene.traverse((o) => (o as SkinnedMesh).isSkinnedMesh && skins.add((o as SkinnedMesh).skeleton));
    assert.equal(skins.size, 2, 'dinosaur and rider skeletons');
    assert.ok(scene.getObjectByName('Spear'), 'rider keeps the spear');
    assert.ok(materials(scene).some((m) => m.name === TEAM_COLOR_MATERIAL), 'rider belt takes the team colour');
    for (const name of ['idle', 'walk', 'attack', 'death'] as const) {
      const tracks = clips.get(name)!.tracks.map((t) => t.name.split('.')[0]!);
      assert.ok(tracks.some((n) => n.startsWith('Head')) && tracks.some((n) => n === 'HandR'), `${name} drives dinosaur and rider`);
    }
  });
});

describe('slingshot.glb (same Mixamo caveman, slingshot, Run Forward, layered shot)', () => {
  it('meets the unit contract and carries the slingshot skinned to the left fist', async () => {
    const { scene, clips } = await load('/models/slingshot.glb');
    assert.deepEqual(validateModel(scene, clips, { expectedHeight: 1.8, requireClips: true }), []);
    assert.ok(triangles(scene) <= MAX_UNIT_TRIANGLES);
    const sling = scene.getObjectByName('Slingshot');
    assert.ok(sling && skinned(sling), 'slingshot skinned (a multi-material mesh loads as a group of skinned parts)');
    assert.ok(materials(scene).some((m) => m.name === TEAM_COLOR_MATERIAL));
    assert.ok(clips.get('attack')!.duration < UNITS.slingshot!.ranged!.intervalStanding, 'shot fits between shots');
  });

  it('the shot layers over the run: legs keep running, arms aim, then the full run resumes', async () => {
    const lib = new AssetLibrary();
    lib.register('unit.slingshot', { placeholder: () => new Group(), expectedHeight: 1.8, partial: { attack: /Spine|Neck|Head|Shoulder|Arm|Hand/ } });
    const buf = readFileSync(join(PUBLIC, '/models/slingshot.glb'));
    lib.registerLoaded('unit.slingshot', (await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '')) as never);
    const model = lib.instantiate('unit.slingshot', 1);
    const anim = new ModelAnimator(model, lib.clipsFor('unit.slingshot'), lib.clipVariantsFor('unit.slingshot'), () => 0.5);
    const leg = model.getObjectByName('mixamorigLeftUpLeg')!;
    const arm = model.getObjectByName('mixamorigLeftArm')!;
    anim.playLoop('walk');
    anim.update(0.2);
    assert.equal(anim.playOnce('attack'), true);
    assert.equal(anim.playing, 'attack');
    assert.equal(anim.layered, true, 'upper-body shot layered over the run');
    const legAngles: number[] = [];
    for (let i = 0; i < 6; i++) {
      anim.update(0.08);
      legAngles.push(leg.quaternion.x);
    }
    assert.ok(Math.max(...legAngles) - Math.min(...legAngles) > 0.05, 'legs keep cycling while shooting');
    model.updateMatrixWorld(true);
    const a = arm.getWorldPosition(new Vector3());
    const f = model.getObjectByName('mixamorigLeftForeArm')!.getWorldPosition(new Vector3());
    const d = f.sub(a).normalize();
    assert.ok(d.x > 0.85, `left arm aims forward (+X) at the release: ${d.toArray().map((v) => v.toFixed(2))} t=${anim.time.toFixed(2)}`);
    for (let i = 0; i < 20; i++) anim.update(0.1);
    assert.equal(anim.playing, 'walk');
    assert.equal(anim.layered, false, 'full run back after the shot');
  });
});
