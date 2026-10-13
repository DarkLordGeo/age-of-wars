import { Box3, type AnimationClip, type Mesh, type Object3D } from 'three';

/**
 * The model contract, in code. Human-readable version: docs/ASSET_SPEC.md.
 * Keep the two in sync.
 */
/** Clips every animated unit must ship. */
export const REQUIRED_CLIPS = ['idle', 'walk', 'attack', 'death'] as const;
/** Every clip name the game plays; `hit` (a short flinch when struck) is optional. */
export const CLIP_NAMES = [...REQUIRED_CLIPS, 'hit'] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

/** A material with this name is cloned and recoloured per team at instantiate time. */
export const TEAM_COLOR_MATERIAL = 'TeamColor';

export const MAX_UNIT_TRIANGLES = 20000;
const HEIGHT_TOLERANCE = 0.25;
const ORIGIN_TOLERANCE = 0.15;

/** "death", "death_2", "Armature|death.3" -> ["death", 2|3|undefined]; null if not a contract clip. */
function parseClipName(name: string): [ClipName, number] | null {
  const m = /^([a-z]+)(?:[_.\- ]?(\d+))?$/.exec(name.split('|').pop()!.trim().toLowerCase());
  if (!m || !(CLIP_NAMES as readonly string[]).includes(m[1]!)) return null;
  return [m[1] as ClipName, m[2] ? Number(m[2]) : 1];
}

/**
 * Index a glTF's animations by contract name. Blender often exports actions as
 * "Armature|walk"; only the part after the last "|" counts, case-insensitively.
 * Numbered variants ("death_2") are left to clipVariants(); this returns the first one.
 */
export function indexClips(animations: readonly AnimationClip[]): Map<ClipName, AnimationClip> {
  const map = new Map<ClipName, AnimationClip>();
  for (const [name, list] of clipVariants(animations)) map.set(name, list[0]!);
  return map;
}

/**
 * Every variant of each contract clip, in variant order: "death", "death_2", ... The animator
 * picks one at random each time it plays a one-shot (e.g. a different fall per unit).
 */
export function clipVariants(animations: readonly AnimationClip[]): Map<ClipName, AnimationClip[]> {
  const found: Array<[ClipName, number, AnimationClip]> = [];
  for (const clip of animations) {
    const parsed = parseClipName(clip.name);
    if (parsed) found.push([parsed[0], parsed[1], clip]);
  }
  found.sort((a, b) => a[1] - b[1]);
  const map = new Map<ClipName, AnimationClip[]>();
  for (const [name, , clip] of found) map.set(name, [...(map.get(name) ?? []), clip]);
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
    const missing = REQUIRED_CLIPS.filter((n) => !clips.has(n));
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
