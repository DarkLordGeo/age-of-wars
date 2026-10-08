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

/** A recurved self-bow held upright: limbs arc back toward the archer, plus the string. */
function bowParts(gripX: number, gripY: number, z: number): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8 - 0.5; // -0.5 (bottom tip) .. 0.5 (top tip)
    pts.push([gripX - 0.22 * (2 * t) ** 2, gripY + t * 1.25]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const seg = new BoxGeometry(0.05, len, 0.05);
    seg.rotateZ(-Math.atan2(x1 - x0, y1 - y0));
    parts.push(part(seg, 0x7a5a30, (x0 + x1) / 2, (y0 + y1) / 2, z));
  }
  const string = new BoxGeometry(0.012, 1.25, 0.012);
  parts.push(part(string, 0xe8dcc0, gripX - 0.22, gripY, z));
  return parts;
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
    if (o.weapon === 'sword') {
      // Age 1: a wooden spear with a knapped stone head (the GLB Soldier carries the real one).
      parts.push(part(new BoxGeometry(1.9, 0.05, 0.05), 0x8a6a44, 0.35, 1.2, 0.5 * b));
      parts.push(part(new BoxGeometry(0.22, 0.1, 0.03), 0x6b6862, 1.38, 1.2, 0.5 * b));
    }
    if (o.weapon === 'club') parts.push(part(new BoxGeometry(1.0, 0.22, 0.22), 0x6b4a2b, 0.5, 1.3, 0.55 * b));
    if (o.weapon === 'bow') parts.push(...bowParts(0.4, 1.2, 0.45), part(new CylinderGeometry(0.09, 0.08, 0.6, 7), 0x6e4a2c, -0.26, 1.35, 0));
    return parts;
  });
  g.add(mesh);
  g.scale.setScalar(o.scale);
  return g;
}

export const createSoldierPlaceholder = (tint: number) => createHumanoid(tint, { scale: 1, bulk: 1, weapon: 'sword' });
export const createArcherPlaceholder = (tint: number) => createHumanoid(tint, { scale: 0.95, bulk: 0.8, weapon: 'bow' });
export const createBrutePlaceholder = (tint: number) => createHumanoid(tint, { scale: 1.45, bulk: 1.5, weapon: 'club' });
