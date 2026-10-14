import { IcosahedronGeometry, Quaternion, Vector3, type BufferGeometry } from 'three';
import { createRng } from '../sim/rng';

/** Number of distinct rock meshes the stones are drawn with. */
export const STONE_VARIANTS = 8;

/**
 * An irregular rock of unit diameter: an icosahedron whose vertices are pushed in or out by smooth
 * noise over the sphere (a function of the vertex direction, so shared corners move together and
 * the faces never tear). Deterministic per variant.
 */
export function rockGeometry(variant: number): BufferGeometry {
  const g = new IcosahedronGeometry(0.5, 1);
  const rng = createRng(9001 + variant * 7919);
  const waves = Array.from({ length: 5 }, () => ({
    axis: new Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize(),
    freq: 1.5 + rng() * 2.5,
    phase: rng() * Math.PI * 2,
    amp: 0.05 + rng() * 0.07,
  }));
  const pos = g.attributes.position!;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = v.clone().normalize();
    let k = 1;
    for (const w of waves) k += w.amp * Math.sin(w.freq * d.dot(w.axis) * Math.PI + w.phase);
    v.multiplyScalar(Math.min(1.12, Math.max(0.72, k)));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** How one stone looks and tumbles, derived from its seed (projectile id). */
export interface StoneLook {
  variant: number;
  /** Per-axis scale on top of the projectile size (proportions: a little flat, a little long). */
  scale: Vector3;
  /** Orientation at release. */
  rot: Quaternion;
  /** Tumbling in flight: unit axis and rate (rad/s). */
  spinAxis: Vector3;
  spinRate: number;
}

export function stoneLook(seed: number): StoneLook {
  const rng = createRng(seed * 2654435761 + 12345);
  const size = 0.85 + rng() * 0.3;
  const scale = new Vector3(size * (0.9 + rng() * 0.3), size * (0.7 + rng() * 0.25), size * (0.85 + rng() * 0.3));
  const axis = () => new Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
  const rot = new Quaternion().setFromAxisAngle(axis(), rng() * Math.PI * 2);
  return { variant: Math.floor(rng() * STONE_VARIANTS) % STONE_VARIANTS, scale, rot, spinAxis: axis(), spinRate: 6 + rng() * 14 };
}

/** Orientation of a tumbling stone `age` seconds after release. */
export function stoneRotation(look: StoneLook, age: number, out = new Quaternion()): Quaternion {
  return out.setFromAxisAngle(look.spinAxis, look.spinRate * age).multiply(look.rot);
}

/** Collision radius of a stone of projectile `size` (m): the mean of its scaled half-extents. */
export function stoneRadius(look: StoneLook, size: number): number {
  return (size / 2) * ((look.scale.x + look.scale.y + look.scale.z) / 3);
}
