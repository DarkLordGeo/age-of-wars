import {
  DoubleSide,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';

/**
 * Shared Age 1 textures and materials (public/textures/age1, built by
 * assets_src/pipeline/make_age1_textures.py). Everything is created once and shared by every
 * settlement, tower and tree, so the whole Age 1 set costs a handful of materials.
 *
 * Textures load asynchronously; materials render with their base colour until they arrive.
 * In Node (tests) there is no `document`, so textures are skipped and only geometry is built.
 */
const DIR = '/textures/age1/';
const canLoad = typeof document !== 'undefined';
const loader = canLoad ? new TextureLoader() : null;
const cache = new Map<string, Texture | null>();

export function age1Texture(file: string, repeat = 1): Texture | null {
  const id = `${file}|${repeat}`;
  if (cache.has(id)) return cache.get(id)!;
  let tex: Texture | null = null;
  if (loader) {
    tex = loader.load(DIR + file);
    tex.colorSpace = SRGBColorSpace;
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = 4;
  }
  cache.set(id, tex);
  return tex;
}

type MatKey = 'bark' | 'log' | 'thatch' | 'hide' | 'wattle' | 'rope' | 'charred' | 'stone';

const matCache = new Map<MatKey, MeshStandardMaterial>();

/** Opaque surface materials used by the procedural Age 1 structures. */
export function age1Material(key: MatKey): MeshStandardMaterial {
  let m = matCache.get(key);
  if (m) return m;
  switch (key) {
    case 'bark':
      m = new MeshStandardMaterial({ name: 'Bark', map: age1Texture('bark.jpg'), color: 0xd8d0c8, roughness: 0.95 });
      break;
    case 'log':
      m = new MeshStandardMaterial({ name: 'Log', map: age1Texture('log.jpg'), color: 0xffffff, roughness: 0.9 });
      break;
    case 'thatch':
      m = new MeshStandardMaterial({ name: 'Thatch', map: age1Texture('thatch.jpg'), color: 0xe8dcc0, roughness: 1 });
      break;
    case 'hide':
      m = new MeshStandardMaterial({ name: 'Hide', map: age1Texture('hide.jpg'), color: 0xffffff, roughness: 0.85, side: DoubleSide });
      break;
    case 'wattle':
      m = new MeshStandardMaterial({ name: 'Wattle', map: age1Texture('wattle.jpg'), color: 0xffffff, roughness: 1 });
      break;
    case 'rope':
      m = new MeshStandardMaterial({ name: 'Rope', color: 0x8a7650, roughness: 1 });
      break;
    case 'charred':
      m = new MeshStandardMaterial({ name: 'Charred', color: 0x2a2420, roughness: 1 });
      break;
    case 'stone':
      m = new MeshStandardMaterial({ name: 'Stone', color: 0x77726a, roughness: 1, flatShading: true });
      break;
  }
  matCache.set(key, m);
  return m;
}

/**
 * A team-coloured cloth/painted-hide material. Named "TeamColor" like the GLB convention
 * (docs/ASSET_SPEC.md), cached per tint.
 */
const teamCache = new Map<number, MeshStandardMaterial>();
export function teamClothMaterial(tint: number): MeshStandardMaterial {
  let m = teamCache.get(tint);
  if (!m) {
    // No texture: the team colour must read clearly at gameplay distance.
    m = new MeshStandardMaterial({ name: 'TeamColor', color: tint, roughness: 0.9, side: DoubleSide });
    teamCache.set(tint, m);
  }
  return m;
}
