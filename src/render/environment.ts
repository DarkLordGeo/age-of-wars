import {
  BufferAttribute,
  CircleGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import type { AssetLibrary } from '../assets/AssetLibrary';
import { GAME } from '../config/game';
import { createRng } from '../sim/rng';
import { addInstances, partsOf, type Placement } from './sceneryInstancing';
import { LANE_CLEARANCE, terrainHeight } from './terrain';

const SKY = 0xa7c8e6;

/**
 * Sky, lights, terrain, lane and scenery. Decorative only; nothing here affects gameplay.
 * Scenery comes from the free asset library (src/assets/scenery.ts) via instancing; whatever
 * fails to load falls back to the original procedural shapes.
 */
export function buildEnvironment(scene: Scene, assets: AssetLibrary): void {
  scene.background = new Color(SKY);
  scene.fog = new Fog(SKY, 130, 330);

  scene.add(new HemisphereLight(0xcfe6ff, 0x4a5a3a, 0.9));

  const sun = new DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(-40, 60, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -95;
  cam.right = 95;
  cam.top = 55;
  cam.bottom = -55;
  cam.near = 1;
  cam.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);

  scene.add(buildTerrain());
  buildLane(scene);
  addTrees(scene);
  addRocks(scene, assets);
  addMountains(scene, assets);
  addGroundCover(scene, assets);
  addDeadwood(scene, assets);
  addCamps(scene, assets);
}

function buildTerrain(): Mesh {
  const geo = new PlaneGeometry(420, 260, 140, 87);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -50);
  const pos = geo.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const grass = new Color(0x5f8a3e);
  const dry = new Color(0x7d8a45);
  const rock = new Color(0x77766c);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const h = terrainHeight(pos.getX(i), pos.getZ(i));
    pos.setY(i, h);
    c.copy(grass).lerp(dry, Math.min(1, h / 6)).lerp(rock, Math.max(0, Math.min(1, (h - 8) / 8)));
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

function buildLane(scene: Scene): void {
  const flat = (w: number, d: number, color: number, y: number): Mesh => {
    const m = new Mesh(new PlaneGeometry(w, d), new MeshStandardMaterial({ color, roughness: 1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    return m;
  };
  scene.add(flat(2 * GAME.baseOffset + 14, 9, 0x6e5f44, 0.02)); // worn verge
  scene.add(flat(2 * GAME.baseOffset + 10, 6.5, 0x8a7352, 0.04)); // the lane itself
  for (const sx of [-1, 1]) {
    const pad = new Mesh(new CircleGeometry(9, 28), new MeshStandardMaterial({ color: 0x8c8a80, roughness: 1 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(sx * GAME.baseOffset, 0.06, 0);
    pad.receiveShadow = true;
    scene.add(pad);
  }
}

/** Living trees are still procedural cones: no free tree met the quality/triangle budget (docs/ASSET_LICENSES.md). */
function addTrees(scene: Scene): void {
  const rng = createRng(7);
  const count = 150;
  const trunks = new InstancedMesh(new ConeGeometry(0.25, 1.6, 6), new MeshStandardMaterial({ color: 0x5b3a22 }), count);
  const crowns = new InstancedMesh(new ConeGeometry(1.4, 3.6, 8), new MeshStandardMaterial({ color: 0x2f6b34, roughness: 1 }), count);
  trunks.castShadow = crowns.castShadow = true;
  const m = new Matrix4();
  const q = new Quaternion();
  const pos = new Vector3();
  const scl = new Vector3();
  for (let i = 0; i < count; i++) {
    const x = (rng() * 2 - 1) * 150;
    // Trees only behind the lane so they never block the camera's view of the fight.
    const z = -(LANE_CLEARANCE + 1 + Math.pow(rng(), 0.8) * 70);
    const s = 0.8 + rng() * 0.9;
    const y = terrainHeight(x, z);
    scl.setScalar(s);
    m.compose(pos.set(x, y + 0.8 * s, z), q, scl);
    trunks.setMatrixAt(i, m);
    m.compose(pos.set(x, y + 3.3 * s, z), q, scl);
    crowns.setMatrixAt(i, m);
  }
  scene.add(trunks, crowns);
}

interface RockKind {
  key: string;
  /** Uniform scale range; library rocks are real-world sized (the small ones are 0.1-0.3 m). */
  scale: [number, number];
}

const BACK_ROCKS: RockKind[] = [
  { key: 'env.rock.boulder_01', scale: [1.0, 2.6] },
  { key: 'env.rock.boulder_02', scale: [0.9, 2.2] },
  { key: 'env.rock.boulder_03', scale: [0.5, 1.7] },
  { key: 'env.rock.boulder_04', scale: [1.2, 3.0] },
];
const FRONT_ROCKS: RockKind[] = [
  { key: 'env.rock.small_01', scale: [2.5, 5] },
  { key: 'env.rock.small_02', scale: [5, 10] },
  { key: 'env.rock.pebble_01', scale: [5, 9] },
];

function addRocks(scene: Scene, assets: AssetLibrary): void {
  const back = BACK_ROCKS.filter((k) => assets.hasModel(k.key));
  const front = FRONT_ROCKS.filter((k) => assets.hasModel(k.key));
  if (back.length === 0 || front.length === 0) {
    addRocksProcedural(scene);
    return;
  }
  const rng = createRng(13);
  const byKey = new Map<string, Placement[]>();
  const tint = new Color();
  for (let i = 0; i < 90; i++) {
    const x = (rng() * 2 - 1) * 120;
    const isFront = rng() < 0.25;
    // Front rocks stay small and close to the lane so the foreground reads without hiding units.
    const z = isFront ? LANE_CLEARANCE + rng() * 5 : -(LANE_CLEARANCE + rng() * 45);
    const pool = isFront ? front : back;
    const kind = pool[Math.floor(rng() * pool.length)]!;
    const s = kind.scale[0] + rng() * (kind.scale[1] - kind.scale[0]);
    // Desaturate/darken the warm sandstone textures a little, differently per rock.
    const v = 0.7 + rng() * 0.3;
    tint.setRGB(v * 0.96, v * 0.98, v * 1.04);
    let list = byKey.get(kind.key);
    if (!list) byKey.set(kind.key, (list = []));
    list.push({
      x,
      y: terrainHeight(x, z) - 0.04 * s,
      z,
      rotY: rng() * Math.PI * 2,
      scaleX: s,
      scaleY: s * (0.8 + rng() * 0.4),
      scaleZ: s,
      tint: tint.clone(),
    });
  }
  for (const [key, list] of byKey) addInstances(scene, partsOf(assets, key), list, { castShadow: true });
}

function addRocksProcedural(scene: Scene): void {
  const rng = createRng(13);
  const count = 90;
  const rocks = new InstancedMesh(new DodecahedronGeometry(1, 0), new MeshStandardMaterial({ color: 0x85837a, roughness: 1, flatShading: true }), count);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  const m = new Matrix4();
  const q = new Quaternion();
  const pos = new Vector3();
  const scl = new Vector3();
  for (let i = 0; i < count; i++) {
    const x = (rng() * 2 - 1) * 120;
    const front = rng() < 0.25;
    // Front rocks stay small and close to the lane so the foreground reads without hiding units.
    const z = front ? LANE_CLEARANCE + rng() * 5 : -(LANE_CLEARANCE + rng() * 45);
    const s = (front ? 0.3 : 0.6) + rng() * (front ? 0.5 : 1.8);
    q.setFromAxisAngle(new Vector3(0, 1, 0), rng() * Math.PI * 2);
    scl.set(s * 1.2, s * 0.8, s);
    m.compose(pos.set(x, terrainHeight(x, z) + s * 0.3, z), q, scl);
    rocks.setMatrixAt(i, m);
  }
  scene.add(rocks);
}

interface CliffKind {
  key: string;
  /** Uniform scale range. Library cliffs are 8-20 m wide sections; scaled up they form the far ridge. */
  scale: [number, number];
}

const CLIFFS: CliffKind[] = [
  { key: 'env.cliff.ridge_02', scale: [6, 9] },
  { key: 'env.cliff.mountainside_01', scale: [5, 8] },
  { key: 'env.cliff.ridge_01', scale: [7, 11] },
];

/** A ridge of scaled/rotated cliff sections along the back of the map (one draw call per section type). */
function addMountains(scene: Scene, assets: AssetLibrary): void {
  const kinds = CLIFFS.filter((k) => assets.hasModel(k.key));
  if (kinds.length === 0) {
    addMountainsProcedural(scene);
    return;
  }
  const rng = createRng(21);
  const byKey = new Map<string, Placement[]>();
  const tint = new Color();
  const step = 34;
  for (let i = 0, x = -250; x < 250; i++, x += step) {
    const kind = kinds[i % kinds.length]!;
    const s = kind.scale[0] + rng() * (kind.scale[1] - kind.scale[0]);
    const px = x + (rng() - 0.5) * 14;
    const pz = -150 - rng() * 28;
    const v = 0.62 + rng() * 0.2;
    tint.setRGB(v * 0.94, v * 0.97, v * 1.05);
    let list = byKey.get(kind.key);
    if (!list) byKey.set(kind.key, (list = []));
    // Sunk into the slope so the base never shows; alternate facing for variety.
    list.push({
      x: px,
      y: terrainHeight(px, pz) - 1.2 * s,
      z: pz,
      rotY: (i % 2 ? Math.PI : 0) + (rng() - 0.5) * 0.5,
      scaleX: s,
      scaleY: s * (0.9 + rng() * 0.5),
      scaleZ: s,
      tint: tint.clone(),
    });
  }
  for (const [key, list] of byKey) addInstances(scene, partsOf(assets, key), list, { castShadow: false });
}

function addMountainsProcedural(scene: Scene): void {
  const mat = new MeshStandardMaterial({ color: 0x6d7f8a, roughness: 1, flatShading: true });
  const rng = createRng(21);
  for (let i = 0; i < 9; i++) {
    const h = 35 + rng() * 40;
    const peak = new Mesh(new ConeGeometry(24 + rng() * 18, h, 6), mat);
    peak.position.set(-170 + i * 42 + rng() * 14, h / 2 - 2, -150 - rng() * 30);
    scene.add(peak);
  }
}

interface Cover {
  key: string;
  piece?: string;
  count: number;
  scale: [number, number];
  /** Share of instances allowed in front of the lane (kept low and short so units stay visible). */
  front: number;
  shadow?: boolean;
}

const COVER: Cover[] = [
  { key: 'env.kit.grass', piece: 'grass_00', count: 80, scale: [3, 5], front: 0.15 },
  { key: 'env.kit.grass', piece: 'grass_01', count: 80, scale: [3, 5], front: 0.15 },
  { key: 'env.kit.grass', piece: 'grass_02', count: 60, scale: [3, 5], front: 0.1 },
  { key: 'env.kit.fern', piece: 'fern_01', count: 30, scale: [1.2, 2.2], front: 0.1 },
  { key: 'env.kit.fern', piece: 'fern_02', count: 30, scale: [1.2, 2.2], front: 0.1 },
  { key: 'env.kit.bush_dry', piece: 'bush_00', count: 18, scale: [2.5, 4], front: 0 },
  { key: 'env.kit.bush_dry', piece: 'bush_01', count: 18, scale: [3, 5], front: 0 },
  { key: 'env.kit.shrub', piece: 'shrub_02', count: 16, scale: [1.2, 2], front: 0, shadow: true },
  { key: 'env.kit.shrub', piece: 'shrub_00', count: 16, scale: [1.2, 2], front: 0, shadow: true },
];

/** Grass, ferns, bushes and shrubs (alpha cards). Behind the lane; a few low tufts in front. */
function addGroundCover(scene: Scene, assets: AssetLibrary): void {
  const rng = createRng(31);
  const tint = new Color();
  for (const c of COVER) {
    const parts = partsOf(assets, c.key, c.piece);
    if (parts.length === 0) continue;
    const list: Placement[] = [];
    for (let i = 0; i < c.count; i++) {
      const x = (rng() * 2 - 1) * 150;
      const isFront = rng() < c.front;
      const z = isFront ? LANE_CLEARANCE + 0.5 + rng() * 12 : -(LANE_CLEARANCE + 0.5 + Math.pow(rng(), 0.9) * 75);
      const s = c.scale[0] + rng() * (c.scale[1] - c.scale[0]);
      tint.setRGB(1.0 + rng() * 0.35, 1.05 + rng() * 0.3, 0.9 + rng() * 0.3);
      list.push({
        x,
        y: terrainHeight(x, z) - 0.02,
        z,
        rotY: rng() * Math.PI * 2,
        scaleX: s,
        scaleY: s * (0.85 + rng() * 0.4),
        scaleZ: s,
        tint: tint.clone(),
      });
    }
    addInstances(scene, parts, list, { foliage: true, castShadow: c.shadow ?? false });
  }
}

/** Fallen logs and stumps behind the lane. */
function addDeadwood(scene: Scene, assets: AssetLibrary): void {
  const rng = createRng(41);
  const spec: Array<{ key: string; count: number; scale: [number, number] }> = [
    { key: 'env.tree.log_fallen_01', count: 9, scale: [0.9, 1.5] },
    { key: 'env.tree.log_fallen_02', count: 9, scale: [1.2, 2.2] },
    { key: 'env.tree.stump_01', count: 12, scale: [0.9, 1.6] },
  ];
  const tint = new Color();
  for (const d of spec) {
    const parts = partsOf(assets, d.key);
    if (parts.length === 0) continue;
    const list: Placement[] = [];
    for (let i = 0; i < d.count; i++) {
      const x = (rng() * 2 - 1) * 130;
      const z = -(LANE_CLEARANCE + 2 + rng() * 55);
      const s = d.scale[0] + rng() * (d.scale[1] - d.scale[0]);
      const v = 0.75 + rng() * 0.25;
      tint.setRGB(v, v, v);
      list.push({ x, y: terrainHeight(x, z) - 0.03 * s, z, rotY: rng() * Math.PI * 2, scaleX: s, scaleY: s, scaleZ: s, tint: tint.clone() });
    }
    addInstances(scene, parts, list, { castShadow: true });
  }
}

/** Supply props (crates, barrels, buckets, a fire pit) behind each base, clear of the lane corridor. */
function addCamps(scene: Scene, assets: AssetLibrary): void {
  const rng = createRng(51);
  const spec: Array<{ key: string; count: number; scale: [number, number] }> = [
    { key: 'env.prop.crate_01', count: 3, scale: [1.5, 1.9] },
    { key: 'env.prop.crate_02', count: 3, scale: [1.4, 1.8] },
    { key: 'env.prop.barrel_01', count: 4, scale: [1.5, 1.9] },
    { key: 'env.prop.bucket_01', count: 2, scale: [1.6, 2] },
    { key: 'env.prop.firepit_01', count: 1, scale: [1.2, 1.4] },
  ];
  for (const d of spec) {
    const parts = partsOf(assets, d.key);
    if (parts.length === 0) continue;
    const list: Placement[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < d.count; i++) {
        const x = side * (GAME.baseOffset + 9 + rng() * 9);
        const z = (rng() * 2 - 1) * 8;
        const s = d.scale[0] + rng() * (d.scale[1] - d.scale[0]);
        list.push({ x, y: terrainHeight(x, z), z, rotY: rng() * Math.PI * 2, scaleX: s, scaleY: s, scaleZ: s });
      }
    }
    addInstances(scene, parts, list, { castShadow: true });
  }
}
