import { Vector3, type Mesh, type Object3D, type SkinnedMesh } from 'three';

const v = new Vector3();

/**
 * World-space height of the lowest point of `root` as currently posed: skinned meshes are
 * evaluated through their bones (CPU skinning of a vertex sample), so animated falls count.
 * Used to keep dying units on top of the ground whatever their death clip does.
 * `samples`: roughly how many vertices to test per mesh (accuracy vs. cost).
 */
export function lowestPoint(root: Object3D, samples = 1500): number {
  root.updateMatrixWorld(true);
  let low = Infinity;
  root.traverseVisible((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / samples));
    const skinned = (mesh as SkinnedMesh).isSkinnedMesh ? (mesh as SkinnedMesh) : null;
    for (let i = 0; i < pos.count; i += step) {
      if (skinned) skinned.getVertexPosition(i, v);
      else v.fromBufferAttribute(pos, i);
      v.applyMatrix4(mesh.matrixWorld);
      if (v.y < low) low = v.y;
    }
  });
  return low;
}
