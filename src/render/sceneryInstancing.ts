import {
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Scene,
} from 'three';
import type { AssetLibrary } from '../assets/AssetLibrary';

/** One drawable of a library asset: shared geometry + material and its transform inside the asset. */
export interface ScenePart {
  geometry: BufferGeometry;
  material: Material;
  matrix: Matrix4;
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** Multiplies the texture colour (material variation without extra materials). */
  tint?: Color;
}

export interface InstanceOptions {
  castShadow?: boolean;
  /** Alpha-cut cards (leaves, grass): forces alpha-test + two-sided instead of sorted blending. */
  foliage?: boolean;
}

/**
 * The meshes of asset `key` (or of one named kit piece) as instancing parts. Returns [] when the
 * model is not loaded, so callers can fall back to procedural scenery. Geometry and materials are
 * the library's shared objects: nothing is cloned.
 */
export function partsOf(assets: AssetLibrary, key: string, piece?: string): ScenePart[] {
  const root = assets.prototype(key);
  if (!root) return [];
  root.updateMatrixWorld(true);
  const node = piece ? root.getObjectByName(piece) : root;
  if (!node) return [];
  const parts: ScenePart[] = [];
  node.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) parts.push({ geometry: mesh.geometry, material: mesh.material as Material, matrix: mesh.matrixWorld.clone() });
  });
  return parts;
}

function prepareFoliage(material: Material): void {
  const m = material as MeshStandardMaterial;
  if (m.userData.foliageReady) return;
  m.userData.foliageReady = true;
  if (m.transparent) {
    // glTF BLEND cards sort badly in a crowd; cut them out instead.
    m.transparent = false;
    m.depthWrite = true;
    m.alphaTest = 0.5;
  }
  if (m.alphaTest === 0 && m.alphaMap === null && m.map) m.alphaTest = 0.5;
  m.side = DoubleSide;
}

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpP = new Vector3();
const tmpS = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Adds one InstancedMesh per part, all sharing the asset's geometry and material. */
export function addInstances(scene: Scene, parts: readonly ScenePart[], placements: readonly Placement[], opts: InstanceOptions = {}): void {
  if (placements.length === 0) return;
  for (const part of parts) {
    if (opts.foliage) prepareFoliage(part.material);
    const mesh = new InstancedMesh(part.geometry, part.material, placements.length);
    mesh.castShadow = opts.castShadow ?? false;
    mesh.receiveShadow = true;
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]!;
      tmpQ.setFromAxisAngle(UP, p.rotY);
      tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(p.scaleX, p.scaleY, p.scaleZ));
      mesh.setMatrixAt(i, tmpM.multiply(part.matrix));
      if (p.tint) mesh.setColorAt(i, p.tint);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }
}
