import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Color, Mesh, Object3D, SkinnedMesh, type Material } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetLibrary, type LoadedGltf } from '../src/assets/AssetLibrary';
import { CLIP_NAMES, indexClips } from '../src/assets/contract';
import { createSoldierPlaceholder } from '../src/assets/placeholders';
import { ModelAnimator } from '../src/render/ModelAnimator';
import { UnitView } from '../src/render/UnitView';
import { makeWorld } from './helpers';
import { buildTestRigGlb, type TestRigOptions } from './fixtures/testRig';

const KEY = 'unit.clubman';

function parse(opts?: TestRigOptions): Promise<LoadedGltf> {
  return new GLTFLoader().parseAsync(buildTestRigGlb(opts), '') as Promise<LoadedGltf>;
}

async function libraryWithRig(opts?: TestRigOptions): Promise<{ lib: AssetLibrary; problems: string[] }> {
  const lib = new AssetLibrary();
  lib.register(KEY, { placeholder: createSoldierPlaceholder, expectedHeight: 1.8 });
  const problems = lib.registerLoaded(KEY, await parse(opts));
  return { lib, problems };
}

const skinned = (root: Object3D): SkinnedMesh => {
  let found: SkinnedMesh | undefined;
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) found = o as SkinnedMesh;
  });
  assert.ok(found, 'model has a skinned mesh');
  return found;
};

describe('model contract', () => {
  it('a conforming GLB loads with no warnings and exposes all four clips', async () => {
    const { lib, problems } = await libraryWithRig();
    assert.deepEqual(problems, []);
    assert.ok(lib.hasModel(KEY));
    assert.deepEqual([...lib.clipsFor(KEY).keys()].sort(), [...CLIP_NAMES].sort());
  });

  it('flags missing clips, wrong scale and a floating origin', async () => {
    const missing = await libraryWithRig({ clipNames: ['idle', 'walk'] });
    assert.ok(missing.problems.some((p) => p.includes('attack') && p.includes('death')));
    const tiny = await libraryWithRig({ height: 0.5 });
    assert.ok(tiny.problems.some((p) => p.includes('height')));
    const floating = await libraryWithRig({ yOffset: 1 });
    assert.ok(floating.problems.some((p) => p.includes('origin')));
  });

  it('accepts Blender-style clip names ("Armature|Walk")', async () => {
    const { lib, problems } = await libraryWithRig({ clipNames: ['Armature|Idle', 'Armature|Walk', 'Armature|Attack', 'Armature|Death'] });
    assert.deepEqual(problems, []);
    assert.equal(lib.clipsFor(KEY).size, 4);
    assert.equal(indexClips([]).size, 0);
  });

  it('falls back to the placeholder when no model is loaded', () => {
    const lib = new AssetLibrary();
    lib.register(KEY, { placeholder: createSoldierPlaceholder });
    assert.equal(lib.hasModel(KEY), false);
    assert.equal(lib.clipsFor(KEY).size, 0);
    assert.ok(lib.instantiate(KEY, 0x2f6fdb).children.length > 0);
    assert.throws(() => lib.instantiate('nope', 0), /Unregistered/);
  });
});

describe('cloning and reuse', () => {
  it('instances have independent skeletons but share geometry', async () => {
    const { lib } = await libraryWithRig();
    const a = skinned(lib.instantiate(KEY, 0x2f6fdb));
    const b = skinned(lib.instantiate(KEY, 0x2f6fdb));
    assert.notEqual(a.skeleton, b.skeleton);
    assert.notEqual(a.skeleton.bones[1], b.skeleton.bones[1]);
    assert.equal(a.geometry, b.geometry, 'geometry is shared');
    a.skeleton.bones[1]!.rotation.z = 1;
    assert.notEqual(b.skeleton.bones[1]!.rotation.z, 1, 'bones are not shared');
  });

  it('keeps shadow flags on every instance', async () => {
    const { lib } = await libraryWithRig();
    const root = lib.instantiate(KEY, 0x2f6fdb);
    const meshes: Mesh[] = [];
    root.traverse((o) => (o as Mesh).isMesh && meshes.push(o as Mesh));
    assert.ok(meshes.length > 0);
    for (const m of meshes) assert.ok(m.castShadow && m.receiveShadow);
  });

  it('tints the TeamColor material per team without touching the source', async () => {
    const { lib } = await libraryWithRig();
    const mat = (t: number): Material => skinned(lib.instantiate(KEY, t)).material as Material;
    const blue = mat(0x2f6fdb);
    const red = mat(0xd23a32);
    assert.notEqual(blue, red);
    assert.equal((blue as unknown as { color: Color }).color.getHex(), new Color(0x2f6fdb).getHex());
    assert.equal((red as unknown as { color: Color }).color.getHex(), new Color(0xd23a32).getHex());
    assert.equal(mat(0x2f6fdb), blue, 'team materials are cached');
  });

  it('animators on separate instances do not share playback state', async () => {
    const { lib } = await libraryWithRig();
    const clips = lib.clipsFor(KEY);
    const ra = lib.instantiate(KEY, 1);
    const rb = lib.instantiate(KEY, 1);
    const a = new ModelAnimator(ra, clips);
    const b = new ModelAnimator(rb, clips);
    a.playLoop('walk');
    b.playLoop('idle');
    a.update(0.5);
    b.update(0.5);
    assert.equal(a.playing, 'walk');
    assert.equal(b.playing, 'idle');
    const spine = (r: Object3D) => r.getObjectByName('Spine')!.rotation.z;
    assert.notEqual(spine(ra), spine(rb), 'different clips drive different poses');
  });
});

describe('animation switching', () => {
  it('plays loops, one-shots, and holds the death pose', async () => {
    const { lib } = await libraryWithRig();
    const root = lib.instantiate(KEY, 1);
    const anim = new ModelAnimator(root, lib.clipsFor(KEY));

    anim.playLoop('idle');
    assert.equal(anim.playing, 'idle');
    anim.playLoop('walk');
    assert.equal(anim.playing, 'walk');

    anim.playOnce('attack');
    assert.equal(anim.playing, 'attack');
    anim.playLoop('walk'); // ignored while the swing is running
    assert.equal(anim.playing, 'attack');
    for (let i = 0; i < 20; i++) anim.update(0.1); // clip is 1s long
    anim.playLoop('walk');
    assert.equal(anim.playing, 'walk', 'resumes after the one-shot finishes');

    anim.playOnce('death');
    for (let i = 0; i < 30; i++) anim.update(0.1);
    const pose = root.getObjectByName('Spine')!.rotation.z;
    anim.playLoop('idle'); // dead units stay dead
    anim.update(1);
    assert.equal(anim.playing, 'death');
    assert.ok(Math.abs(pose - 1.4) < 1e-3, `death clamps on its last frame (${pose})`);

    anim.reset();
    assert.equal(anim.playing, null);
    anim.playLoop('idle');
    assert.equal(anim.playing, 'idle');
  });

  it('missing clips are ignored safely', async () => {
    const { lib } = await libraryWithRig({ clipNames: ['idle', 'walk'] });
    const anim = new ModelAnimator(lib.instantiate(KEY, 1), lib.clipsFor(KEY));
    anim.playLoop('walk');
    anim.playOnce('attack');
    assert.equal(anim.playing, 'walk');
  });
});

describe('UnitView with an animated model', () => {
  it('drives clips from sim state and survives pooling', async () => {
    const { lib } = await libraryWithRig();
    const w = makeWorld();
    const unit = w.spawnUnit('player', 'clubman');
    const view = new UnitView('k', lib.instantiate(KEY, 1), lib.clipsFor(KEY));
    assert.ok(view.animator);

    unit.state = 'waiting';
    unit.moving = false;
    view.bind(unit);
    assert.equal(view.animator.playing, 'idle', 'waiting → idle');
    unit.state = 'advancing';
    unit.moving = true;
    view.update(0.016, null);
    assert.equal(view.animator.playing, 'walk', 'advancing → walk');

    unit.state = 'attacking';
    unit.moving = false;
    view.triggerAttack();
    assert.equal(view.animator.playing, 'attack');
    for (let i = 0; i < 20; i++) view.update(0.1, null);
    assert.equal(view.animator.playing, 'idle', 'attacking with no swing running → idle');

    unit.state = 'dead';
    view.update(0.016, null);
    assert.equal(view.animator.playing, 'death');

    // Reuse the same view for a different unit, as the pool does.
    const next = w.spawnUnit('enemy', 'clubman');
    next.state = 'waiting';
    next.moving = false;
    view.bind(next);
    assert.equal(view.animator.playing, 'idle', 'pooled view is reset');
    assert.equal(view.root.position.x, next.centerX(-1));
  });

  it('placeholder models keep the procedural path', () => {
    const lib = new AssetLibrary();
    lib.register(KEY, { placeholder: createSoldierPlaceholder });
    const view = new UnitView('k', lib.instantiate(KEY, 1), lib.clipsFor(KEY));
    assert.equal(view.animator, null);
    const w = makeWorld();
    const unit = w.spawnUnit('player', 'clubman');
    view.bind(unit);
    view.triggerAttack();
    view.update(0.05, null);
    assert.doesNotThrow(() => view.update(0.05, null));
  });
});
