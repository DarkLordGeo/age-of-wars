import { AnimationClip, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { clipVariants, indexClips, TEAM_COLOR_MATERIAL, validateModel, type ClipName } from './contract';

export interface AssetSpec {
  /** Path to a .glb under /public (e.g. '/models/soldier.glb'). When absent or failing, the placeholder is used. */
  url?: string;
  /** Builds a stand-in model. `tint` is the team colour. */
  placeholder: (tint: number) => Object3D;
  /** Standing height in metres, used to sanity-check imported scale and origin. */
  expectedHeight?: number;
  /** Skip during `preload()`; fetch on demand with `loadModel(key, url)`. For library assets the current scene doesn't use. */
  lazy?: boolean;
  /** Adds extra parts (e.g. gear parented to a bone) to every instance of the loaded GLB. */
  decorate?: (model: Object3D, tint: number) => void;
  /** Seconds into the GLB's attack clip where the blow lands / the shot is released. */
  strike?: number;
  /**
   * Clips that should only drive some bones (matched by node name), e.g. an upper-body shot
   * layered over the running legs. glTF exporters write every bone into every clip, so the
   * other tracks are dropped at load.
   */
  partial?: Partial<Record<ClipName, RegExp>>;
  /** Runs once on the loaded GLB scene before it is used (e.g. auto-rigging a static model). */
  prepare?: (scene: Object3D) => Object3D;
}

/** The part of a parsed glTF the library needs (lets tests feed parsed data directly). */
export interface LoadedGltf {
  scene: Object3D;
  animations: readonly AnimationClip[];
}

interface LoadedModel {
  scene: Object3D;
  clips: ReadonlyMap<ClipName, AnimationClip>;
  variants: ReadonlyMap<ClipName, readonly AnimationClip[]>;
}

const NO_CLIPS: ReadonlyMap<ClipName, AnimationClip> = new Map();
const NO_VARIANTS: ReadonlyMap<ClipName, readonly AnimationClip[]> = new Map();

/**
 * Single door through which the renderer obtains models. Game logic only knows string
 * keys; swapping a placeholder for a Blender GLB is a manifest change (set `url`).
 * Contract: docs/ASSET_SPEC.md.
 */
export class AssetLibrary {
  private readonly specs = new Map<string, AssetSpec>();
  private readonly loaded = new Map<string, LoadedModel>();
  private readonly teamMaterials = new Map<string, Material>();
  private readonly loader = new GLTFLoader();
  private readonly byUrl = new Map<string, Promise<LoadedGltf>>();

  register(key: string, spec: AssetSpec): void {
    this.specs.set(key, spec);
  }

  /** Load every registered GLB. Failures degrade to placeholders instead of throwing. */
  async preload(): Promise<void> {
    await Promise.all(
      [...this.specs].map(([key, spec]) => (spec.url && !spec.lazy ? this.loadModel(key, spec.url) : undefined)),
    );
  }

  /** Load one GLB and make it the model for `key`. Returns contract warnings ([] = clean). */
  async loadModel(key: string, url: string): Promise<string[]> {
    try {
      // Keys may share a GLB (e.g. two units dressed differently): fetch/parse each URL once.
      let p = this.byUrl.get(url);
      if (!p) this.byUrl.set(url, (p = this.loader.loadAsync(url)));
      return this.registerLoaded(key, await p);
    } catch (err) {
      console.warn(`[assets] "${key}" failed to load from ${url}; using placeholder`, err);
      return [`failed to load ${url}`];
    }
  }

  /**
   * Adopt an already-parsed glTF for `key`. Contract violations are logged but do not
   * block the model: a slightly-off asset is still more useful than the placeholder.
   */
  registerLoaded(key: string, gltf: LoadedGltf): string[] {
    const spec = this.specs.get(key);
    if (!spec) throw new Error(`Unregistered asset key: ${key}`);
    gltf.scene.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    const scene = spec.prepare ? spec.prepare(gltf.scene) : gltf.scene;
    const animations = gltf.animations.map((clip) => partialClip(clip, spec.partial));
    const clips = indexClips(animations);
    const problems = validateModel(scene, clips, {
      expectedHeight: spec.expectedHeight,
      // unit-style assets are animated (prepared models animate procedurally); scenery is not
      requireClips: spec.expectedHeight !== undefined && !spec.prepare,
    });
    if (problems.length) console.warn(`[assets] "${key}" does not meet the model contract:\n - ${problems.join('\n - ')}`);
    this.loaded.set(key, { scene, clips, variants: clipVariants(animations) });
    return problems;
  }

  hasModel(key: string): boolean {
    return this.loaded.has(key);
  }

  /**
   * The loaded (not cloned) scene for `key`, or undefined when only the placeholder exists.
   * Read-only: use it to pull shared geometry/materials for InstancedMesh (scenery, props)
   * or to find a named piece of a kit GLB. Never add it to a scene or mutate its transforms.
   */
  prototype(key: string): Object3D | undefined {
    return this.loaded.get(key)?.scene;
  }

  /** Contract clips for `key` (empty for placeholders). Clips are immutable and shared. */
  clipsFor(key: string): ReadonlyMap<ClipName, AnimationClip> {
    return this.loaded.get(key)?.clips ?? NO_CLIPS;
  }

  /** Strike time of `key`'s attack clip, when its GLB (not the placeholder) is loaded. */
  strikeTimeFor(key: string): number | undefined {
    return this.loaded.has(key) ? this.specs.get(key)?.strike : undefined;
  }

  /** Every variant of each clip for `key` ("death", "death_2", ...); empty for placeholders. */
  clipVariantsFor(key: string): ReadonlyMap<ClipName, readonly AnimationClip[]> {
    return this.loaded.get(key)?.variants ?? NO_VARIANTS;
  }

  /**
   * A fresh, independent instance for `key`. GLB instances get their own skeleton and
   * bones (SkeletonUtils.clone); geometry, textures and materials are shared. Materials
   * named "TeamColor" are swapped for a per-team tinted copy.
   */
  instantiate(key: string, tint: number): Object3D {
    const spec = this.specs.get(key);
    if (!spec) throw new Error(`Unregistered asset key: ${key}`);
    const loaded = this.loaded.get(key);
    if (!loaded) return spec.placeholder(tint);
    const obj = cloneSkinned(loaded.scene);
    obj.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => this.teamMaterial(m, tint))
        : this.teamMaterial(mesh.material, tint);
    });
    spec.decorate?.(obj, tint);
    return obj;
  }

  private teamMaterial(mat: Material, tint: number): Material {
    if (mat.name !== TEAM_COLOR_MATERIAL) return mat;
    const id = `${mat.uuid}|${tint}`;
    let tinted = this.teamMaterials.get(id);
    if (!tinted) {
      tinted = mat.clone();
      (tinted as MeshStandardMaterial).color?.setHex(tint);
      this.teamMaterials.set(id, tinted);
    }
    return tinted;
  }
}

/** `clip` restricted to the bones its `partial` pattern matches (unchanged when none applies). */
function partialClip(clip: AnimationClip, partial: AssetSpec['partial']): AnimationClip {
  const key = clip.name.split('|').pop()!.trim().toLowerCase().replace(/[_.\- ]?\d+$/, '') as ClipName;
  const pattern = partial?.[key];
  if (!pattern) return clip;
  const tracks = clip.tracks.filter((t) => pattern.test(t.name.slice(0, t.name.lastIndexOf('.'))));
  const partialClip = new AnimationClip(clip.name, clip.duration, tracks);
  partialClip.userData = { full: clip }; // the authored pose of the rest of the body (ModelAnimator)
  return partialClip;
}
