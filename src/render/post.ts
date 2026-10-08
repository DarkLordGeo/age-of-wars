import {
  HalfFloatType,
  PerspectiveCamera,
  Vector2,
  WebGLRenderTarget,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Render layer for things the ambient-occlusion pass must not see: alpha-cut foliage (the AO
 * normal pass ignores alpha and would turn every grass card into a dark square), particles,
 * the sky box and health bars. The main camera renders both layers.
 */
export const NO_AO_LAYER = 1;

export function excludeFromAO(obj: Object3D): void {
  obj.traverse((o) => o.layers.set(NO_AO_LAYER));
}

export type Quality = 'low' | 'medium' | 'high';

const QUALITY_KEY = 'aow.quality';
function savedQuality(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(QUALITY_KEY) : null;
  } catch {
    return null;
  }
}

/**
 * Post-processing: MSAA scene render -> GTAO ambient occlusion (high) -> subtle bloom ->
 * tone mapping/sRGB (OutputPass) -> colour grade + vignette.
 *
 * `?quality=low|medium|high` forces a level; otherwise it starts at high and steps down
 * automatically if the frame rate stays low (low = plain render, no composer).
 */
const GradeShader = {
  name: 'Age1Grade',
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.07 },
    saturation: { value: 1.08 },
    warmth: { value: 0.025 },
    vignette: { value: 0.32 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float contrast, saturation, warmth, vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      // gentle S-curve around mid grey, then saturation
      col = clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      // warm highlights, slightly cool shadows (sunny late morning)
      col += vec3(warmth, warmth * 0.4, -warmth) * smoothstep(0.35, 1.0, l);
      col += vec3(-0.01, 0.0, 0.015) * (1.0 - smoothstep(0.0, 0.35, l));
      // vignette
      vec2 d = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(col, c.a);
    }`,
};

export class PostFx {
  quality: Quality;
  private forced: boolean;
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  /** Camera clone for the AO pass that skips NO_AO_LAYER. */
  private readonly aoCamera = new PerspectiveCamera();
  private width = 1;
  private height = 1;
  private slowFor = 0;
  private acc = 0;
  private frames = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
  ) {
    camera.layers.enable(NO_AO_LAYER);
    this.aoCamera.layers.set(0);
    // ?quality= wins, then the Options menu choice saved in localStorage, else auto.
    const q = (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('quality') : null) ?? savedQuality();
    this.forced = q === 'low' || q === 'medium' || q === 'high';
    this.quality = this.forced ? (q as Quality) : 'high';
    this.build();
  }

  /** The current setting as the Options menu shows it. */
  get setting(): Quality | 'auto' {
    return this.forced ? this.quality : 'auto';
  }

  /** Options menu: pick a fixed level, or 'auto' (start high, step down when slow). Persisted. */
  setQuality(q: Quality | 'auto'): void {
    this.forced = q !== 'auto';
    this.quality = q === 'auto' ? 'high' : q;
    this.slowFor = 0;
    try {
      localStorage.setItem(QUALITY_KEY, q);
    } catch {
      /* storage unavailable: setting lasts for this session */
    }
    this.build();
  }

  private build(): void {
    this.composer?.dispose();
    this.composer = null;
    this.gtao = null;
    this.bloom = null;
    if (this.quality === 'low') return;

    const target = new WebGLRenderTarget(this.width, this.height, { type: HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality === 'high') {
      const gtao = new GTAOPass(this.scene, this.aoCamera, this.width, this.height);
      gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 2.5, scale: 1.1, samples: 12, distanceFallOff: 1 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      gtao.blendIntensity = 0.85;
      // Half-resolution AO: most of the cost, little visible difference after the denoise.
      const setSize = gtao.setSize.bind(gtao);
      gtao.setSize = (w: number, h: number) => setSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
      composer.addPass(gtao);
      this.gtao = gtao;
    }
    // HDR threshold: only the fire, sun glints and the sky near the sun bloom.
    this.bloom = new UnrealBloomPass(new Vector2(this.width, this.height), 0.14, 0.4, 2.2);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(GradeShader));
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(this.width, this.height);
    this.composer = composer;
  }

  setSize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.composer?.setSize(w, h);
  }

  render(dt: number): void {
    if (this.gtao) {
      // keep the AO camera in lock-step with the main camera (layers differ)
      this.aoCamera.copy(this.camera, false);
      this.aoCamera.layers.set(0);
      this.aoCamera.updateMatrixWorld();
    }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.adapt(dt);
  }

  /** Step quality down when the frame rate stays under budget for a few seconds. */
  private adapt(dt: number): void {
    if (this.forced || this.quality === 'low') return;
    this.acc += dt;
    this.frames++;
    if (this.acc < 1) return;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    this.slowFor = fps < 42 ? this.slowFor + 1 : 0;
    if (this.slowFor >= 4) {
      this.slowFor = 0;
      this.quality = this.quality === 'high' ? 'medium' : 'low';
      console.info(`[post] frame rate ${fps.toFixed(0)} fps: quality -> ${this.quality} (force with ?quality=high)`);
      this.build();
    }
  }
}
