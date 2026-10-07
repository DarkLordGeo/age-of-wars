import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Shared by every placeholder unit: one material, geometry merged per (kind, tint). */
const vertexColorMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const geometryCache = new Map<string, BufferGeometry>();

type Shape = BoxGeometry | SphereGeometry | CylinderGeometry;

function part(geo: Shape, color: number, x: number, y: number, z = 0): BufferGeometry {
  geo.translate(x, y, z);
  const c = new Color(color);
  const n = geo.attributes.position!.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geo;
}

function mergedMesh(key: string, build: () => BufferGeometry[]): Mesh {
  let geo = geometryCache.get(key);
  if (!geo) {
    geo = mergeGeometries(build(), false);
    geometryCache.set(key, geo);
  }
  const mesh = new Mesh(geo, vertexColorMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

interface HumanoidOpts {
  /** Overall size multiplier. */
  scale: number;
  /** Torso width multiplier. */
  bulk: number;
  weapon: 'sword' | 'bow' | 'club';
}

/** One-draw-call humanoid, ~1.8m tall at scale 1, facing +X, origin at the feet. */
function createHumanoid(tint: number, o: HumanoidOpts): Group {
  const g = new Group();
  const mesh = mergedMesh(`humanoid:${o.weapon}:${o.scale}:${o.bulk}:${tint}`, () => {
    const b = o.bulk;
    const parts = [
      part(new BoxGeometry(0.25, 0.8, 0.28), 0x333333, 0, 0.4, -0.15), // legs
      part(new BoxGeometry(0.25, 0.8, 0.28), 0x333333, 0, 0.4, 0.15),
      part(new BoxGeometry(0.4, 0.7, 0.7 * b), tint, 0, 1.15, 0), // torso
      part(new SphereGeometry(0.25, 10, 8), 0xe0b090, 0, 1.75, 0), // head
    ];
    if (o.weapon === 'sword') parts.push(part(new BoxGeometry(1.1, 0.07, 0.07), 0xaaaaaa, 0.5, 1.2, 0.5 * b));
    if (o.weapon === 'club') parts.push(part(new BoxGeometry(1.0, 0.22, 0.22), 0x6b4a2b, 0.5, 1.3, 0.55 * b));
    if (o.weapon === 'bow') parts.push(part(new BoxGeometry(0.06, 1.2, 0.06), 0x7a5a30, 0.35, 1.2, 0.45));
    return parts;
  });
  g.add(mesh);
  g.scale.setScalar(o.scale);
  return g;
}

export const createSoldierPlaceholder = (tint: number) => createHumanoid(tint, { scale: 1, bulk: 1, weapon: 'sword' });
export const createArcherPlaceholder = (tint: number) => createHumanoid(tint, { scale: 0.95, bulk: 0.8, weapon: 'bow' });
export const createBrutePlaceholder = (tint: number) => createHumanoid(tint, { scale: 1.45, bulk: 1.5, weapon: 'club' });

function solid(geo: Shape, color: number, x: number, y: number, z = 0): Mesh {
  const mesh = new Mesh(geo, new MeshStandardMaterial({ color, roughness: 0.85 }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Keep + corner towers silhouette. Only two exist, so it is not merged. */
export function createBasePlaceholder(tint: number): Group {
  const g = new Group();
  g.add(solid(new BoxGeometry(5, 4, 6), 0x7a7468, 0, 2, 0));
  g.add(solid(new BoxGeometry(5.4, 0.6, 6.4), tint, 0, 4.3, 0));
  for (const [x, z] of [[-2.6, -3.2], [2.6, -3.2], [-2.6, 3.2], [2.6, 3.2]] as const) {
    g.add(solid(new CylinderGeometry(0.7, 0.8, 6, 10), 0x8b8478, x, 3, z));
    g.add(solid(new CylinderGeometry(0.9, 0.7, 0.8, 10), tint, x, 6.3, z));
  }
  g.add(solid(new CylinderGeometry(0.06, 0.06, 4, 6), 0x444444, 0, 7, 0));
  g.add(solid(new BoxGeometry(0.05, 1, 1.6), tint, 0, 8.4, 0.8));
  return g;
}

/** Freestanding tower with a barrel pointing along +X (toward the enemy for the player). */
export function createTurretPlaceholder(tint: number): Object3D {
  const g = new Group();
  g.add(solid(new CylinderGeometry(1.1, 1.5, 4.5, 10), 0x5c5a52, 0, 2.25, 0));
  g.add(solid(new CylinderGeometry(1.7, 1.3, 0.9, 10), tint, 0, 4.9, 0));
  g.add(solid(new BoxGeometry(2.6, 0.55, 0.55), 0x222222, 1.2, 5.5, 0));
  return g;
}
