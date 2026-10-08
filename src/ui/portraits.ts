import {
  AmbientLight,
  AnimationMixer,
  Box3,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  ACESFilmicToneMapping,
} from 'three';
import type { AssetLibrary } from '../assets/AssetLibrary';
import type { UnitDef } from '../config/schema';

/**
 * Unit portraits for the HUD cards, rendered from the game's own unit models (so they always
 * match what walks on the battlefield, GLB or placeholder): head-and-shoulders, 3/4 view, warm
 * key light + cool rim, transparent background. One short-lived offscreen renderer, run once at
 * boot. Returns data URLs keyed by unit id.
 */
export function renderPortraits(assets: AssetLibrary, units: readonly UnitDef[], tint: number, size = 160): Record<string, string> {
  const out: Record<string, string> = {};
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out; // no WebGL: cards fall back to their glyph
  }
  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  scene.add(new AmbientLight(0xbfd2e6, 0.9));
  const key = new DirectionalLight(0xffe2b8, 3.2);
  key.position.set(3, 4, 3);
  const rim = new DirectionalLight(0x9cc2ff, 2.2);
  rim.position.set(-3, 2.5, -2.5);
  scene.add(key, rim);
  const camera = new PerspectiveCamera(30, 1, 0.05, 50);

  for (const def of units) {
    const model = assets.instantiate(def.modelKey, tint);
    const clips = assets.clipsFor(def.modelKey);
    const idle = clips.get('idle');
    if (idle) {
      const mixer = new AnimationMixer(model);
      mixer.clipAction(idle).play();
      mixer.setTime(0.2);
    }
    // Face the camera at 3/4: models face +X; the camera sits front-right.
    model.rotation.y = -0.55;
    scene.add(model);
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    // Frame the upper ~55% of the figure (head, shoulders, weapon hand).
    const focus = new Vector3((box.min.x + box.max.x) / 2, box.min.y + h * 0.72, (box.min.z + box.max.z) / 2);
    const dist = h * 1.25;
    camera.position.set(focus.x + dist * 0.95, focus.y + h * 0.08, focus.z + dist * 0.35);
    camera.lookAt(focus);
    renderer.render(scene, camera);
    out[def.id] = renderer.domElement.toDataURL('image/png');
    scene.remove(model);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
