import {
  BufferAttribute,
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
import { DustMotes } from './age1/dust';
import { addGrassTufts, type TuftPlacement } from './age1/grass';
import { createTerrainMaterial } from './age1/terrainMaterial';
import { addTreeInstances, buildConifer, buildDeadTree, type TreePlacement } from './age1/trees';
import { WIND } from './age1/wind';
import { addInstances, partsOf, type Placement } from './sceneryInstancing';
import { campDistance, CAMP_RADIUS, LANE_CLEARANCE, pathCenterZ, PATH_HALF_WIDTH, terrainHeight } from './terrain';

const SKY = 0xa7c8e6;

export interface Environment {
  /** Advances wind, dust and other ambient animation. */
  update(dt: number): void;
}

/**
 * Sky, lights, terrain, the worn footpath and scenery. Decorative only; nothing here affects
 * gameplay. Age 1 look: splat-blended meadow/dirt/rock ground, procedural conifers, swaying grass
 * tufts and drifting dust (src/render/age1), plus CC0 rocks/cliffs/shrubs from the asset library
 * (src/assets/scenery.ts) via instancing; library assets that fail to load fall back to
 * procedural shapes.
 */
export function buildEnvironment(scene: Scene, assets: AssetLibrary): Environment {
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
  addTrees(scene);
  addGrass(scene);
  addRocks(scene, assets);
  addMountains(scene, assets);
  addGroundCover(scene, assets);
  addDeadwood(scene, assets);

  const dust = new DustMotes(scene, { minX: -70, maxX: 70, minZ: -14, maxZ: 12, maxY: 5 });
  return {
    update(dt: number): void {
      WIND.time.value += dt;
      dust.update(dt);
    },
  };
}

/** Splat weights (dirt, rock, mud) for a ground point; grass is the remainder. */
export function groundSplat(x: number, z: number, height: number, slope: number, noise: number): [number, number, number] {
  // Worn footpath along the lane, ending in each camp's trampled yard.
  const dz = Math.abs(z - pathCenterZ(x));
  const onLane = Math.abs(x) <= GAME.baseOffset ? 1 : 0;
  const path = onLane * (1 - smooth(PATH_HALF_WIDTH - 0.6, PATH_HALF_WIDTH + 1.8 + noise * 1.5, dz));
  const verge = onLane * (1 - smooth(PATH_HALF_WIDTH + 1, PATH_HALF_WIDTH + 5, dz)) * 0.35;
  const camp = campDistance(x, z);
  const yard = 1 - smooth(CAMP_RADIUS - 5, CAMP_RADIUS + 1.5, camp);
  const mud = (1 - smooth(0, CAMP_RADIUS - 4, camp)) * 0.75 + yard * 0.15 * noise;
  // Scattered bare patches in the meadow.
  const patches = Math.max(0, noise - 0.72) * 2.2;
  const dirt = Math.min(1, Math.max(path, verge, yard * 0.9, patches));
  const rock = Math.min(1, smooth(0.32, 0.55, slope) + smooth(11, 18, height) * 0.8);
  return [dirt, rock, Math.min(1, mud)];
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, z: number): number {
  const h = (i: number, j: number): number => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const w = fz * fz * (3 - 2 * fz);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - w) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * w;
}

function buildTerrain(): Mesh {
  const geo = new PlaneGeometry(420, 260, 280, 174);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -50);
  const pos = geo.attributes.position as BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const splat = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const n = valueNoise(x * 0.11, z * 0.11) * 0.7 + valueNoise(x * 0.4, z * 0.4) * 0.3;
    const [d, r, m] = groundSplat(x, z, h, 1 - nrm.getY(i), n);
    splat[i * 3] = d;
    splat[i * 3 + 1] = r;
    splat[i * 3 + 2] = m;
    // Gentle tint: the far slopes go cooler/darker, which helps depth.
    const far = Math.max(0, Math.min(1, (-z - 30) / 90));
    const v = 0.94 + n * 0.12;
    c.setRGB(v * (1 - far * 0.12), v * (1 - far * 0.06), v * (1 - far * 0.02));
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.setAttribute('splat', new BufferAttribute(splat, 3));
  const mesh = new Mesh(geo, createTerrainMaterial());
  mesh.receiveShadow = true;
  mesh.name = 'Terrain';
  return mesh;
}

/** Conifer groves behind the lane and around the camps, plus a few dead snags. */
function addTrees(scene: Scene): void {
  const rng = createRng(7);
  const variants = [0, 1, 2, 3].map(buildConifer);
  const dead = [0, 1].map(buildDeadTree);
  const byVariant: TreePlacement[][] = variants.map(() => []);
  const deadPl: TreePlacement[][] = dead.map(() => []);
  const tint = new Color();

  // Grove centres: mostly behind the lane, denser toward the back slope.
  const groves: Array<{ x: number; z: number; r: number; n: number }> = [];
  for (let i = 0; i < 18; i++) {
    groves.push({ x: (rng() * 2 - 1) * 170, z: -(LANE_CLEARANCE + 6 + Math.pow(rng(), 0.7) * 85), r: 8 + rng() * 14, n: 8 + Math.floor(rng() * 14) });
  }
  // Flank groves beyond the camps frame the battlefield on both sides.
  for (const sx of [-1, 1]) groves.push({ x: sx * (GAME.baseOffset + 32), z: -6, r: 14, n: 22 });
  const placed: Array<{ x: number; z: number }> = [];
  for (const g of groves) {
    for (let k = 0; k < g.n; k++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * g.r;
      const x = g.x + Math.cos(a) * d;
      const z = g.z + Math.sin(a) * d;
      if (z > -LANE_CLEARANCE - 1 && Math.abs(x) < GAME.baseOffset + 18) continue; // keep the lane view clear
      if (z > 4) continue;
      if (campDistance(x, z) < CAMP_RADIUS + 4) continue;
      if (placed.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 4.5)) continue;
      placed.push({ x, z });
      const isDead = rng() < 0.05;
      const height = isDead ? 7 + rng() * 6 : 6.5 + rng() * 7 + Math.max(0, -z - 40) * 0.05;
      const hue = rng();
      tint.setRGB(0.85 + hue * 0.25, 0.92 + rng() * 0.15, 0.8 + hue * 0.15);
      const p = { x, y: terrainHeight(x, z) - 0.15, z, height, rotY: rng() * Math.PI * 2, tint: tint.clone() };
      if (isDead) deadPl[Math.floor(rng() * dead.length)]!.push(p);
      else byVariant[Math.floor(rng() * variants.length)]!.push(p);
    }
  }
  variants.forEach((v, i) => addTreeInstances(scene, v, byVariant[i]!));
  dead.forEach((v, i) => addTreeInstances(scene, v, deadPl[i]!));
}

/** Grass tufts framing the footpath and scattered over the meadow (green and dry). */
function addGrass(scene: Scene): void {
  const rng = createRng(17);
  const green: TuftPlacement[] = [];
  const dry: TuftPlacement[] = [];
  const tryPlace = (x: number, z: number, height: number, dryChance: number): void => {
    const dz = Math.abs(z - pathCenterZ(x));
    if (Math.abs(x) <= GAME.baseOffset + 2 && dz < PATH_HALF_WIDTH + 0.25 + rng() * 0.6) return; // keep the path bare
    const camp = campDistance(x, z);
    if (camp < CAMP_RADIUS - 1.2) return; // trampled yards
    if (camp < CAMP_RADIUS + 0.6 && rng() < 0.6) return;
    const y = terrainHeight(x, z);
    if (y > 12) return;
    const isDry = rng() < dryChance;
    const v = 0.85 + rng() * 0.3;
    const tint = isDry ? new Color(v, v * 0.97, v * 0.9) : new Color(v * (0.92 + rng() * 0.12), v, v * 0.85);
    (isDry ? dry : green).push({ x, y: y - 0.03, z, height, rotY: rng() * Math.PI, tint });
  };
  // Dense band along both path edges (the verge), taller right at the edge.
  for (let i = 0; i < 2600; i++) {
    const x = (rng() * 2 - 1) * (GAME.baseOffset + 14);
    const side = rng() < 0.5 ? -1 : 1;
    const off = PATH_HALF_WIDTH + 0.3 + Math.pow(rng(), 1.8) * 6;
    tryPlace(x, pathCenterZ(x) + side * off, 0.35 + rng() * 0.45 * (1 - (off - PATH_HALF_WIDTH) / 7), 0.3);
  }
  // Meadow in front of the lane (toward the camera): low, so units stay readable.
  for (let i = 0; i < 1700; i++) tryPlace((rng() * 2 - 1) * 130, LANE_CLEARANCE - 4 + rng() * 34, 0.3 + rng() * 0.3, 0.35);
  // Behind the lane: taller and denser near the trees.
  for (let i = 0; i < 2600; i++) tryPlace((rng() * 2 - 1) * 150, -(4 + Math.pow(rng(), 1.3) * 70), 0.4 + rng() * 0.55, 0.25);
  addGrassTufts(scene, 'grass_tuft_green.png', green);
  addGrassTufts(scene, 'grass_tuft_dry.png', dry);
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
    if (campDistance(x, z) < CAMP_RADIUS + 1.5) continue;
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
      if (campDistance(x, z) < CAMP_RADIUS + 1) continue;
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
      if (campDistance(x, z) < CAMP_RADIUS + 2) continue;
      const v = 0.75 + rng() * 0.25;
      tint.setRGB(v, v, v);
      list.push({ x, y: terrainHeight(x, z) - 0.03 * s, z, rotY: rng() * Math.PI * 2, scaleX: s, scaleY: s, scaleZ: s, tint: tint.clone() });
    }
    addInstances(scene, parts, list, { castShadow: true });
  }
}
