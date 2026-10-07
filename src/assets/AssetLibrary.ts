import { type AnimationClip, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { indexClips, TEAM_COLOR_MATERIAL, validateModel, type ClipName } from './contract';

export interface AssetSpec {
  /** Path to a .glb under /public (e.g. '/models/soldier.glb'). When absent or failing, the placeholder is used. */
  url?: string;
  /** Builds a stand-in model. `tint` is the team colour. */
  placeholder: (tint: number) => Object3D;
  /** Standing height in metres, used to sanity-check imported scale and origin. */
  expectedHeight?: number;
  /** Skip during `preload()`; fetch on demand with `loadModel(key, url)`. For library assets the current scene doesn't use. */
  lazy?: boolean;
}

/** The part of a parsed glTF the library needs (lets tests feed parsed data directly). */
export interface LoadedGltf {
  scene: Object3D;
  animations: readonly AnimationClip[];
}

interface LoadedModel {
  scene: Object3D;
  clips: ReadonlyMap<ClipName, AnimationClip>;
}

const NO_CLIPS: ReadonlyMap<ClipName, AnimationClip> = new Map();

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
      return this.registerLoaded(key, await this.loader.loadAsync(url));
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
    const clips = indexClips(gltf.animations);
    const problems = validateModel(gltf.scene, clips, {
      expectedHeight: spec.expectedHeight,
      requireClips: spec.expectedHeight !== undefined, // unit-style assets are animated; scenery is not
    });
    if (problems.length) console.warn(`[assets] "${key}" does not meet the model contract:\n - ${problems.join('\n - ')}`);
    this.loaded.set(key, { scene: gltf.scene, clips });
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
