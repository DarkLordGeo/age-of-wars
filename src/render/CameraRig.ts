import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { CAMERA } from '../config/camera';

const DEG = Math.PI / 180;

/**
 * Fixed battlefield camera (src/config/camera.ts). The eye never moves during play; the look-at
 * point eases a few metres along the lane toward the front line so pushes on either base stay
 * framed. In the main menu the same shot drifts slowly. No user input.
 */
export class CameraRig {
  readonly camera = new PerspectiveCamera(CAMERA.fov, 16 / 9, 0.5, 700);
  private readonly eye = new Vector3(CAMERA.position.x, CAMERA.position.y, CAMERA.position.z);
  private readonly target = new Vector3(CAMERA.target.x, CAMERA.target.y, CAMERA.target.z);
  /** Current look-at offset along the lane (m), smoothed. */
  private shift = 0;
  private shiftGoal = 0;
  private menu = false;
  private t = 0;

  /** Jump the look-at offset back to the default framing (new match). */
  snapTo(_x = 0): void {
    this.shift = this.shiftGoal = 0;
    this.apply();
  }

  /** Main-menu background: same composition with a slow drift. */
  setCinematic(on: boolean): void {
    this.menu = on;
    this.t = 0;
    this.snapTo();
  }

  resize(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    // Keep at least the designed horizontal field so the enemy camp never leaves the frame.
    const vFromH = (2 * Math.atan(Math.tan((CAMERA.minHorizontalFov * DEG) / 2) / aspect)) / DEG;
    this.camera.fov = Math.max(CAMERA.fov, vFromH);
    this.camera.updateProjectionMatrix();
    this.apply();
  }

  /** `frontlineX` is the sim's battle position; null when the lane is empty. */
  update(dt: number, frontlineX: number | null): void {
    this.t += dt;
    const tr = CAMERA.track;
    if (frontlineX !== null) {
      const want = MathUtils.clamp(frontlineX - CAMERA.target.x, tr.min, tr.max);
      if (Math.abs(want - this.shiftGoal) > tr.deadzone) this.shiftGoal = want;
    } else {
      this.shiftGoal = 0;
    }
    this.shift += (this.shiftGoal - this.shift) * (1 - Math.exp(-tr.rate * dt));
    this.apply();
  }

  private apply(): void {
    this.camera.position.copy(this.eye);
    let tx = this.target.x + this.shift;
    if (this.menu) {
      const s = CAMERA.menuSway;
      const phase = (this.t / s.period) * Math.PI * 2;
      tx += Math.sin(phase) * Math.tan(s.yawDeg * DEG) * 70;
      this.camera.position.y += Math.sin(phase * 0.7) * s.heightM;
    }
    this.camera.lookAt(tx, this.target.y, this.target.z);
  }
}
