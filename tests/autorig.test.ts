import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, type SkinnedMesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { decorateBiped, prepareBiped } from '../src/render/age1/autorig';

/** A crude mid-stride figure facing +Z (like Rodin exports): two legs apart along Z, a body. */
function figure(): Group {
  const legA = new BoxGeometry(0.15, 0.9, 0.15, 1, 6, 1).translate(0, 0.45, 0.25);
  const legB = new BoxGeometry(0.15, 0.9, 0.15, 1, 6, 1).translate(0, 0.45, -0.25);
  const body = new BoxGeometry(0.4, 1.0, 0.3, 1, 6, 1).translate(0, 1.4, 0);
  const g = new Group();
  g.add(new Mesh(mergeGeometries([legA, legB, body])!, new MeshStandardMaterial()));
  return g;
}

describe('auto-rig for static characters', () => {
  it('bakes to game space and skins legs and torso', () => {
    const rig = prepareBiped(figure(), { height: 1.8 });
    const body = rig.getObjectByName('Body') as SkinnedMesh;
    assert.ok(body.isSkinnedMesh);
    for (const n of ['Root', 'Hips', 'LegFront', 'LegBack', 'Torso']) assert.ok(rig.getObjectByName(n), n);
    body.geometry.computeBoundingBox();
    const b = body.geometry.boundingBox!;
    assert.ok(Math.abs(b.max.y - 1.8) < 1e-3 && Math.abs(b.min.y) < 1e-3);
    // stride now runs along X (faces +X)
    assert.ok(b.max.x - b.min.x > b.max.z - b.min.z);
  });

  it('animates: legs scissor while walking, torso leans on attack, team belt added', () => {
    const rig = prepareBiped(figure(), { height: 1.8 });
    decorateBiped(rig, 0x2f6fdb, { swing: 0.5 });
    assert.ok(rig.getObjectByName('TeamColor'));
    const animate = rig.userData.animate as (p: number, m: boolean, a?: number) => void;
    animate(1, true, 0);
    const f = rig.getObjectByName('LegFront')!.rotation.z;
    const k = rig.getObjectByName('LegBack')!.rotation.z;
    assert.ok(Math.abs(f) > 0.1 && Math.abs(f + k) < 1e-9);
    animate(0, false, 0.5);
    assert.ok(rig.getObjectByName('Torso')!.rotation.z < -0.3);
    rig.updateMatrixWorld(true);
    assert.ok(new Box3().setFromObject(rig).max.y > 1.5);
  });
});
