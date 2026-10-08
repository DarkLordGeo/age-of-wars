import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  NormalBlending,
  PointLight,
  Sprite,
  SpriteMaterial,
  type Texture,
} from 'three';

/**
 * Campfire flames + rising smoke + a flickering light, as pooled sprites. Cheap: ~25 sprites
 * per fire, no per-frame allocation. Without a DOM (tests) it builds an empty group.
 */
let flameTex: Texture | null | undefined;
let smokeTex: Texture | null | undefined;

function radialTexture(stops: Array<[number, string]>, size = 64): Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  return tex;
}

function flameTexture(): Texture | null {
  if (flameTex === undefined) {
    flameTex = radialTexture([
      [0, 'rgba(255,250,220,1)'],
      [0.25, 'rgba(255,200,90,0.9)'],
      [0.55, 'rgba(255,110,30,0.45)'],
      [1, 'rgba(255,60,10,0)'],
    ]);
  }
  return flameTex;
}

function smokeTexture(): Texture | null {
  if (smokeTex === undefined) {
    smokeTex = radialTexture([
      [0, 'rgba(255,255,255,0.55)'],
      [0.5, 'rgba(255,255,255,0.25)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  }
  return smokeTex;
}

interface Particle {
  sprite: Sprite;
  age: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
}

export interface FireOptions {
  flames: number;
  smoke: number;
  scale: number;
  light?: boolean;
}

export class FireFx {
  readonly root = new Group();
  private readonly flames: Particle[] = [];
  private readonly smoke: Particle[] = [];
  private readonly light: PointLight | null = null;
  private t = Math.random() * 10;
  private seed = Math.random() * 1000;

  constructor(
    at: { x: number; y: number; z: number },
    private readonly opts: FireOptions,
  ) {
    this.root.name = 'FireFx';
    this.root.position.set(at.x, at.y, at.z);
    const ft = flameTexture();
    const st = smokeTexture();
    if (!ft || !st) return;
    const flameMat = new SpriteMaterial({ map: ft, blending: AdditiveBlending, depthWrite: false, transparent: true, color: new Color(1, 0.85, 0.6) });
    for (let i = 0; i < opts.flames; i++) {
      const p = this.make(flameMat.clone());
      p.age = Math.random() * 0.6;
      this.flames.push(p);
    }
    const smokeMat = new SpriteMaterial({ map: st, blending: NormalBlending, depthWrite: false, transparent: true, color: new Color(0.55, 0.53, 0.5) });
    for (let i = 0; i < opts.smoke; i++) {
      const p = this.make(smokeMat.clone());
      p.age = Math.random() * 4;
      p.life = 4;
      this.smoke.push(p);
    }
    if (opts.light !== false) {
      this.light = new PointLight(0xff9a40, 6 * opts.scale, 9 * opts.scale, 1.6);
      this.light.position.y = 0.8 * opts.scale;
      this.root.add(this.light);
    }
  }

  private make(mat: SpriteMaterial): Particle {
    const sprite = new Sprite(mat);
    sprite.renderOrder = 5;
    this.root.add(sprite);
    return { sprite, age: 0, life: 0.6, vx: 0, vy: 0, vz: 0, size: 1 };
  }

  private rand(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  update(dt: number): void {
    this.t += dt;
    const s = this.opts.scale;
    for (const p of this.flames) {
      p.age += dt;
      if (p.age >= p.life) {
        p.age = 0;
        p.life = 0.35 + this.rand() * 0.35;
        p.sprite.position.set((this.rand() - 0.5) * 0.45 * s, 0.1 * s, (this.rand() - 0.5) * 0.45 * s);
        p.vy = (1.4 + this.rand() * 1.0) * s;
        p.vx = (this.rand() - 0.5) * 0.3 * s;
        p.vz = (this.rand() - 0.5) * 0.3 * s;
        p.size = (0.55 + this.rand() * 0.45) * s;
      }
      const k = p.age / p.life;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      const sz = p.size * (1 - k * 0.7);
      p.sprite.scale.set(sz * 0.8, sz * 1.25, 1);
      (p.sprite.material as SpriteMaterial).opacity = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.95;
    }
    for (const p of this.smoke) {
      p.age += dt;
      if (p.age >= p.life) {
        p.age = 0;
        p.life = 3.2 + this.rand() * 1.6;
        p.sprite.position.set((this.rand() - 0.5) * 0.3 * s, 0.9 * s, (this.rand() - 0.5) * 0.3 * s);
        p.vy = (0.9 + this.rand() * 0.5) * s;
        p.vx = (0.25 + this.rand() * 0.25) * s; // drifts with the breeze
        p.vz = (this.rand() - 0.5) * 0.2 * s;
        p.size = (0.6 + this.rand() * 0.4) * s;
      }
      const k = p.age / p.life;
      p.sprite.position.x += p.vx * dt * (0.3 + k);
      p.sprite.position.y += p.vy * dt * (1 - k * 0.4);
      p.sprite.position.z += p.vz * dt;
      const sz = p.size * (1 + k * 3.2);
      p.sprite.scale.set(sz, sz, 1);
      (p.sprite.material as SpriteMaterial).opacity = Math.sin(Math.min(1, k * 1.1) * Math.PI) * 0.45;
    }
    if (this.light) this.light.intensity = (5 + Math.sin(this.t * 13) * 0.8 + Math.sin(this.t * 7.3) * 0.9) * s;
  }
}
