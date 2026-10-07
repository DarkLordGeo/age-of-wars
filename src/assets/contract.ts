import { Box3, type AnimationClip, type Mesh, type Object3D } from 'three';

/**
 * The model contract, in code. Human-readable version: docs/ASSET_SPEC.md.
 * Keep the two in sync.
 */
export const CLIP_NAMES = ['idle', 'walk', 'attack', 'death'] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

/** A material with this name is cloned and recoloured per team at instantiate time. */
export const TEAM_COLOR_MATERIAL = 'TeamColor';

export const MAX_UNIT_TRIANGLES = 20000;
const HEIGHT_TOLERANCE = 0.25;
const ORIGIN_TOLERANCE = 0.15;

/**
 * Index a glTF's animations by contract name. Blender often exports actions as
 * "Armature|walk"; only the part after the last "|" counts, case-insensitively.
 */
export function indexClips(animations: readonly AnimationClip[]): Map<ClipName, AnimationClip> {
  const map = new Map<ClipName, AnimationClip>();
  for (const clip of animations) {
    const key = clip.name.split('|').pop()!.trim().toLowerCase();
    if ((CLIP_NAMES as readonly string[]).includes(key)) map.set(key as ClipName, clip);
  }
  return map;
}

export interface ValidateOptions {
  /** Expected standing height in metres; omit to skip the scale/origin check. */
  expectedHeight?: number;
  /** Animated models must provide every contract clip. */
  requireClips: boolean;
}

/** Returns human-readable contract violations (empty = conforms). Never throws. */
export function validateModel(scene: Object3D, clips: ReadonlyMap<ClipName, AnimationClip>, opts: ValidateOptions): string[] {
  const problems: string[] = [];

  if (opts.requireClips) {
    const missing = CLIP_NAMES.filter((n) => !clips.has(n));
    if (missing.length) problems.push(`missing animation clips: ${missing.join(', ')}`);
  }

  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  if (!box.isEmpty()) {
    if (opts.expectedHeight) {
      const h = box.max.y - box.min.y;
      if (Math.abs(h - opts.expectedHeight) > opts.expectedHeight * HEIGHT_TOLERANCE) {
        problems.push(`height ${h.toFixed(2)}m, expected ~${opts.expectedHeight}m (1 unit = 1 metre)`);
      }
      if (Math.abs(box.min.y) > ORIGIN_TOLERANCE) {
        problems.push(`origin should be at the feet; lowest point is at y=${box.min.y.toFixed(2)}`);
      }
    }
  }

  let triangles = 0;
  scene.traverse((o) => {
    const geo = (o as Mesh).geometry;
    if (geo) triangles += (geo.index ? geo.index.count : geo.attributes.position?.count ?? 0) / 3;
  });
  if (triangles > MAX_UNIT_TRIANGLES) problems.push(`${Math.round(triangles)} triangles exceeds budget ${MAX_UNIT_TRIANGLES}`);

  return problems;
}
