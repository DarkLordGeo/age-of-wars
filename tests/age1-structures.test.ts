import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Box3, Vector3, type BufferAttribute, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { GAME } from '../src/config/game';
import { UNITS } from '../src/config/units';
import { createDinoRider } from '../src/render/age1/dino';
import { createEggAutomatic, createPrimitiveCatapult, createRockSlingshot, createCaveMount, deckY, TURRET_MUZZLE } from '../src/render/age1/turrets';
import { createSettlement, SETTLEMENT } from '../src/render/age1/settlement';
import { buildConifer, buildDeadTree } from '../src/render/age1/trees';
import { groundSplat } from '../src/render/environment';
import { campDistance, CAMP_RADIUS, pathCenterZ, PATH_HALF_WIDTH, terrainHeight } from '../src/render/terrain';

const TINT = 0x2f6fdb;

function meshes(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

function triangles(root: Object3D): number {
  return meshes(root).reduce((t, m) => {
    const g = m.geometry;
    return t + (g.index ? g.index.count : g.attributes.position!.count) / 3;
  }, 0);
}

/** World-space vertices of every mesh under root that fall inside the box. */
function verticesInside(root: Object3D, box: Box3): number {
  let n = 0;
  const v = new Vector3();
  for (const m of meshes(root)) {
    const pos = m.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (box.containsPoint(v)) n++;
    }
  }
  return n;
}

const teamColored = (root: Object3D): Mesh[] =>
  meshes(root).filter((m) => (m.material as MeshStandardMaterial).name === 'TeamColor');

describe('Age 1 settlement (base.keep)', () => {
  const camp = createSettlement(TINT, { fx: false });

  it('carries team-coloured banners in the team tint', () => {
    const tc = teamColored(camp);
    assert.ok(tc.length >= 3, `TeamColor meshes: ${tc.length}`);
    for (const m of tc) assert.equal((m.material as MeshStandardMaterial).color.getHex(), TINT);
  });

  it('keeps the gate open for the lane', () => {
    const gx = SETTLEMENT.ringX + Math.cos(Math.asin(SETTLEMENT.gateHalfWidth / SETTLEMENT.ringRadius)) * SETTLEMENT.ringRadius;
    const gate = new Box3(new Vector3(gx - 0.8, 0.05, -(SETTLEMENT.gateHalfWidth - 0.45)), new Vector3(gx + 0.8, 3.4, SETTLEMENT.gateHalfWidth - 0.45));
    assert.equal(verticesInside(camp, gate), 0);
  });

  it('leaves the marching corridor from the great-hut door to the gate clear', () => {
    const corridor = new Box3(new Vector3(1.6, 0.05, -GAME.laneHalfWidth - 0.3), new Vector3(SETTLEMENT.ringX + SETTLEMENT.ringRadius + 1, 2.2, GAME.laneHalfWidth + 0.3));
    assert.equal(verticesInside(camp, corridor), 0);
  });

  it('fits the camp footprint and a modest triangle / draw-call budget', () => {
    const box = new Box3().setFromObject(camp);
    assert.ok(box.max.x - box.min.x < 2 * SETTLEMENT.ringRadius + 3);
    assert.ok(box.max.y < 12);
    const tris = triangles(camp);
    assert.ok(tris < 60000, `${tris} triangles`);
    assert.ok(meshes(camp).length < 20, `${meshes(camp).length} meshes`);
  });

  it('variants differ and both build', () => {
    const other = createSettlement(0xd23a32, { fx: false, variant: 1 });
    assert.notEqual(triangles(other), 0);
    assert.notDeepEqual(new Box3().setFromObject(other), new Box3().setFromObject(camp));
  });
});

describe('Age 1 cave turret mounts and turrets', () => {
  it('puts each slot deck just below the sim muzzle height, on stones or lashed legs', () => {
    for (let i = 0; i < GAME.slotHeights.length; i++) {
      for (const rockY of [0, deckY(i) - 0.6, deckY(i) - 3]) {
        const mount = createCaveMount(TINT, i, Math.max(0, rockY));
        const box = new Box3().setFromObject(mount);
        assert.ok(Math.abs(box.max.y - (deckY(i) + 1.5)) < 0.2, `slot ${i}: top ${box.max.y}`); // pennant pole
        assert.ok(box.min.y > Math.max(0, rockY) - 0.5, `slot ${i}: bottom ${box.min.y}`);
        assert.ok(teamColored(mount).length >= 1);
        assert.ok(triangles(mount) < 6000);
      }
    }
    assert.ok(Math.abs(deckY(0) + TURRET_MUZZLE - GAME.slotHeights[0]!) < 1e-9);
  });

  it('spreads the slot mounts over the cave without overlapping, and keeps the low slot off the lane', () => {
    const m = GAME.slotMounts;
    for (let i = 0; i < m.length; i++) {
      for (let j = i + 1; j < m.length; j++) {
        assert.ok(Math.hypot(m[i]!.forward - m[j]!.forward, m[i]!.side - m[j]!.side) > 1.8, `slots ${i}/${j}`);
      }
    }
    assert.ok(Math.abs(m[0]!.side) - 0.9 > GAME.laneHalfWidth, 'ground slot must not stand in the marching lane');
  });

  it('every Age 1 turret has a Weapon near the muzzle height and stays small', () => {
    for (const make of [createRockSlingshot, () => createEggAutomatic(TINT), createPrimitiveCatapult]) {
      const t = make();
      const weapon = t.getObjectByName('Weapon');
      assert.ok(weapon, t.name);
      assert.ok(Math.abs(weapon.position.y - TURRET_MUZZLE) < 0.2, t.name);
      const box = new Box3().setFromObject(t);
      assert.ok(box.max.y < 2 && Math.abs(box.min.y) < 0.2, `${t.name} ${box.min.y}..${box.max.y}`);
      assert.ok(triangles(t) < 6000);
    }
  });

  it('the Dino Rider matches its sim footprint', () => {
    const d = createDinoRider(TINT);
    const box = new Box3().setFromObject(d);
    const len = box.max.x - box.min.x;
    assert.ok(Math.abs(len - UNITS.dino!.length) < 1.2, `length ${len}`);
    assert.ok(Math.abs(box.max.y - UNITS.dino!.height) < 0.6, `height ${box.max.y}`);
    assert.equal(typeof d.userData.animate, 'function');
  });
});

describe('Age 1 terrain', () => {
  it('is flat inside both camps and along the lane', () => {
    for (const sx of [-1, 1]) {
      const cx = sx * (GAME.baseOffset - SETTLEMENT.ringX);
      for (let a = 0; a < Math.PI * 2; a += 0.3) {
        for (const r of [0, 6, CAMP_RADIUS]) assert.equal(terrainHeight(cx + Math.cos(a) * r, Math.sin(a) * r), 0);
      }
    }
    for (let x = -GAME.baseOffset; x <= GAME.baseOffset; x += 4) assert.equal(terrainHeight(x, pathCenterZ(x)), 0);
  });

  it('paints the footpath as dirt and keeps it inside the lane', () => {
    for (let x = -GAME.baseOffset; x <= GAME.baseOffset; x += 5) {
      assert.ok(Math.abs(pathCenterZ(x)) + GAME.laneHalfWidth < PATH_HALF_WIDTH);
      assert.ok(groundSplat(x, pathCenterZ(x), 0, 0, 0.5)[0] > 0.9);
    }
    // open meadow far from the path and camps stays grass (low dirt, rock and mud)
    const [d, r, m] = groundSplat(0, 25, 0.3, 0.02, 0.4);
    assert.ok(d < 0.2 && r < 0.2 && m < 0.2, `${d} ${r} ${m}`);
    assert.ok(campDistance(0, 25) > CAMP_RADIUS);
  });
});

describe('Age 1 trees', () => {
  it('conifers are ~1 m tall unit trees within budget', () => {
    for (let s = 0; s < 4; s++) {
      const t = buildConifer(s);
      assert.ok(t.tris < 1200, `variant ${s}: ${t.tris}`);
      // lowest skirt branches may dip slightly into the ground, like real spruces
      t.fronds!.computeBoundingBox();
      const b = t.fronds!.boundingBox!;
      assert.ok(b.max.y > 0.9 && b.max.y < 1.15 && b.min.y > -0.1, `crown y ${b.min.y}..${b.max.y}`);
    }
    assert.ok(buildDeadTree(0).tris < 600);
  });

});
