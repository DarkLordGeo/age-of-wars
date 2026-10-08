import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Points, PointsMaterial, type Scene } from 'three';
import { excludeFromAO } from '../post';
import { rng32 } from './builder';

/**
 * Faint drifting dust motes over the battlefield (sunlit specks). One Points draw; positions
 * advance on the CPU (a few hundred floats per frame) and wrap inside a box around the lane.
 */
export class DustMotes {
  private readonly points: Points | null = null;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private t = 0;

  constructor(
    scene: Scene,
    private readonly box: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number },
    count = 420,
  ) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    const rnd = rng32(0xd057);
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = box.minX + rnd() * (box.maxX - box.minX);
      this.pos[i * 3 + 1] = 0.2 + rnd() * box.maxY;
      this.pos[i * 3 + 2] = box.minZ + rnd() * (box.maxZ - box.minZ);
      this.vel[i * 3] = 0.25 + rnd() * 0.35;
      this.vel[i * 3 + 1] = (rnd() - 0.5) * 0.06;
      this.vel[i * 3 + 2] = (rnd() - 0.5) * 0.15;
    }
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,240,210,1)');
    grad.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    const mat = new PointsMaterial({
      map: new CanvasTexture(c),
      size: 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: AdditiveBlending,
      color: 0xfff0d0,
    });
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false;
    excludeFromAO(this.points);
    scene.add(this.points);
  }

  update(dt: number): void {
    if (!this.points) return;
    this.t += dt;
    const { minX, maxX, minZ, maxZ, maxY } = this.box;
    const p = this.pos;
    const v = this.vel;
    for (let i = 0; i < p.length; i += 3) {
      p[i] = p[i]! + v[i]! * dt;
      p[i + 1] = p[i + 1]! + (v[i + 1]! + Math.sin(this.t * 0.7 + i) * 0.05) * dt;
      p[i + 2] = p[i + 2]! + v[i + 2]! * dt;
      if (p[i]! > maxX) p[i] = minX;
      if (p[i + 1]! > maxY || p[i + 1]! < 0.1) v[i + 1] = -v[i + 1]!;
      if (p[i + 2]! > maxZ) p[i + 2] = minZ;
      else if (p[i + 2]! < minZ) p[i + 2] = maxZ;
    }
    (this.points.geometry.attributes.position as BufferAttribute).needsUpdate = true;
  }
}
