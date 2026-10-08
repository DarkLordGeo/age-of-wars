import { Color, PMREMGenerator, Scene, Vector3, type Camera, type WebGLRenderer } from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { excludeFromAO } from '../post';

/**
 * Physical sky (Preetham scattering + the built-in cloud layer) matched to the sun light, and an
 * image-based lighting environment baked from it with PMREM. The IBL is what makes PBR materials
 * (bark, thatch, rock, the Soldier) pick up believable sky fill and soft bounce instead of the flat
 * hemisphere ambient.
 */
export interface SkySystem {
  /** Keep the sky box centred on the camera and drift the clouds. */
  update(dt: number, camera: Camera): void;
  /** Colour to use for distance fog so the terrain melts into the horizon. */
  readonly horizon: Color;
}

export const SKY = {
  turbidity: 5.5,
  rayleigh: 1.6,
  mieCoefficient: 0.004,
  mieDirectionalG: 0.82,
  cloudCoverage: 0.38,
  cloudDensity: 0.45,
  /** Box half-size must stay inside the camera far plane (700). */
  scale: 1000,
};

function makeSky(sunDir: Vector3): Sky {
  const sky = new Sky();
  sky.scale.setScalar(SKY.scale);
  const u = sky.material.uniforms;
  u.turbidity!.value = SKY.turbidity;
  u.rayleigh!.value = SKY.rayleigh;
  u.mieCoefficient!.value = SKY.mieCoefficient;
  u.mieDirectionalG!.value = SKY.mieDirectionalG;
  u.cloudCoverage!.value = SKY.cloudCoverage;
  u.cloudDensity!.value = SKY.cloudDensity;
  u.showSunDisc!.value = 1;
  (u.sunPosition!.value as Vector3).copy(sunDir).normalize();
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

export function createSky(scene: Scene, renderer: WebGLRenderer | null, sunDir: Vector3): SkySystem {
  const sky = makeSky(sunDir);
  excludeFromAO(sky);
  scene.add(sky);

  if (renderer) {
    // Bake the environment from a cloud-free copy (clouds would add noise to the reflections).
    const envScene = new Scene();
    const envSky = makeSky(sunDir);
    envSky.material.uniforms.cloudCoverage!.value = 0;
    envSky.material.uniforms.showSunDisc!.value = 0;
    envScene.add(envSky);
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    // The Preetham sky is HDR-bright; a small factor gives sky fill without washing out shadows.
    scene.environmentIntensity = 0.14;
    pmrem.dispose();
  }

  const horizon = new Color(0xb4c6d4);
  let time = 0;
  return {
    horizon,
    update(dt: number, camera: Camera): void {
      time += dt;
      sky.position.copy(camera.position);
      sky.material.uniforms.time!.value = time;
    },
  };
}
