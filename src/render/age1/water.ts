import {
  CircleGeometry,
  Color,
  DataTexture,
  LinearMipmapLinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  RepeatWrapping,
  RGBAFormat,
  type Scene,
  Vector2,
} from 'three';
import { PONDS, pondLevel } from '../terrain';

/**
 * Pond water: a flat disc per pond with a still, slightly murky surface that reflects the sky
 * (the scene's PMREM environment) and a slow ripple from a procedural, tileable normal map
 * scrolled in two directions. One shared material; `update(dt)` animates the ripples.
 */
export interface Ponds {
  update(dt: number): void;
}

/** Tileable ripple normal map from a few summed sine waves (no texture download). */
function rippleNormals(size = 128): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const waves: Array<[number, number, number, number]> = [
    // kx, ky (integer cycles across the tile so it tiles), amplitude, phase
    [3, 1, 1, 0.3],
    [-2, 4, 0.8, 1.7],
    [5, -3, 0.5, 2.9],
    [1, 7, 0.35, 0.8],
    [-7, -2, 0.3, 4.1],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const [kx, ky, a, ph] of waves) {
        const t = ((kx * x + ky * y) / size) * Math.PI * 2 + ph;
        const c = Math.cos(t) * a;
        dx += c * kx;
        dy += c * ky;
      }
      const s = 0.035;
      const nx = -dx * s;
      const ny = -dy * s;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function addPonds(scene: Scene): Ponds {
  const normalMap = rippleNormals();
  normalMap.repeat.set(3, 3);
  const mat = new MeshPhysicalMaterial({
    name: 'PondWater',
    color: new Color(0x2c3f36),
    roughness: 0.06,
    metalness: 0,
    envMapIntensity: 1.6,
    normalMap,
    normalScale: new Vector2(0.35, 0.35),
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  for (const p of PONDS) {
    const geo = new CircleGeometry(p.r * 1.06, 40);
    geo.rotateX(-Math.PI / 2);
    const water = new Mesh(geo, mat);
    water.position.set(p.x, pondLevel(p), p.z);
    water.receiveShadow = true;
    water.renderOrder = 1;
    water.name = 'Pond';
    scene.add(water);
  }
  let t = 0;
  return {
    update(dt: number): void {
      t += dt;
      normalMap.offset.set(t * 0.012, t * 0.007);
    },
  };
}
