import { MathUtils, PerspectiveCamera } from 'three';
import { CAMERA } from '../config/camera';

const DEG = Math.PI / 180;

/**
 * 3/4 diagonal RTS camera (perspective). The focus point slides along the lane (X axis);
 * pan/zoom are smoothed with exponential damping. Optionally tracks the front line.
 */
export class CameraRig {
  readonly camera = new PerspectiveCamera(CAMERA.fov, 1, 0.5, 700);
  followEnabled: boolean = CAMERA.follow.enabledByDefault;
  /** True while zoomed all the way out so both bases are visible. */
  overview = false;
  /** Menu background: slow, low, swaying shot that follows the fight; ignores player input. */
  private cinematic = false;
  private cineT = 0;

  private focusX = 0;
  private targetX = 0;
  private distance: number = CAMERA.distance.initial;
  private targetDistance: number = CAMERA.distance.initial;
  private savedDistance: number = CAMERA.distance.initial;
  private followPausedFor = 0;
  private readonly keys = new Set<string>();
  private dragging = false;

  private readonly limit: number;
  private readonly sinAz = Math.sin(CAMERA.azimuth * DEG);
  private readonly cosAz = Math.cos(CAMERA.azimuth * DEG);
  private readonly sinEl = Math.sin(CAMERA.elevation * DEG);
  private readonly cosEl = Math.cos(CAMERA.elevation * DEG);

  constructor(dom: HTMLElement, laneHalfLength: number) {
    this.limit = laneHalfLength + CAMERA.panMargin;
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    dom.addEventListener(
      'wheel',
      (e) => {
        if (this.cinematic) return;
        this.overview = false;
        this.setZoom(this.targetDistance * (1 + Math.sign(e.deltaY) * CAMERA.zoomStep));
      },
      { passive: true },
    );
    dom.addEventListener('pointerdown', () => (this.dragging = true));
    window.addEventListener('pointerup', () => (this.dragging = false));
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.cinematic) return;
      this.pan(-e.movementX * CAMERA.pan.dragSpeed * this.distance);
    });
    this.apply();
  }

  /** Jump (no smoothing) to a lane position. */
  snapTo(x: number): void {
    this.focusX = this.targetX = MathUtils.clamp(x, -this.limit, this.limit);
    this.apply();
  }

  /** Menu background camera on/off. */
  setCinematic(on: boolean): void {
    this.cinematic = on;
    this.overview = false;
    this.followPausedFor = 0;
    this.followEnabled = on || CAMERA.follow.enabledByDefault;
    this.targetDistance = on ? 30 : CAMERA.distance.initial;
    this.distance = this.targetDistance;
  }

  toggleFollow(): void {
    this.followEnabled = !this.followEnabled;
    this.followPausedFor = 0;
  }

  /** Zoom out to show both bases; call again to return to the previous zoom. */
  toggleOverview(): void {
    this.overview = !this.overview;
    if (this.overview) {
      this.savedDistance = this.targetDistance;
      this.targetDistance = CAMERA.distance.max;
      this.targetX = 0;
      this.followPausedFor = CAMERA.follow.resumeDelay;
    } else {
      this.targetDistance = this.savedDistance;
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** `frontlineX` is the sim's battle position; null when nothing should be tracked. */
  update(dt: number, frontlineX: number | null): void {
    if (this.cinematic) {
      this.cineT += dt;
    } else {
      const speed = CAMERA.pan.keySpeed * (this.distance / CAMERA.distance.initial);
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.pan(-speed * dt);
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.pan(speed * dt);
    }

    this.followPausedFor = Math.max(0, this.followPausedFor - dt);
    if (this.followEnabled && !this.overview && this.followPausedFor === 0 && frontlineX !== null) {
      const off = frontlineX - this.targetX;
      if (Math.abs(off) > CAMERA.follow.deadzone) {
        const k = 1 - Math.exp(-CAMERA.follow.rate * dt);
        this.targetX = MathUtils.clamp(this.targetX + off * k, -this.limit, this.limit);
      }
    }

    this.focusX += (this.targetX - this.focusX) * (1 - Math.exp(-CAMERA.smoothing.pan * dt));
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-CAMERA.smoothing.zoom * dt));
    this.apply();
  }

  private pan(dx: number): void {
    this.overview = false;
    this.followPausedFor = CAMERA.follow.resumeDelay;
    this.targetX = MathUtils.clamp(this.targetX + dx, -this.limit, this.limit);
  }

  private setZoom(d: number): void {
    this.targetDistance = MathUtils.clamp(d, CAMERA.distance.min, CAMERA.distance.max);
  }

  private apply(): void {
    const d = this.distance;
    let sinAz = this.sinAz;
    let cosAz = this.cosAz;
    let sinEl = this.sinEl;
    let cosEl = this.cosEl;
    if (this.cinematic) {
      // lower, slowly swaying shot for the menu background
      const az = (CAMERA.azimuth + Math.sin(this.cineT * 0.12) * 14) * DEG;
      const el = (24 + Math.sin(this.cineT * 0.09) * 4) * DEG;
      sinAz = Math.sin(az);
      cosAz = Math.cos(az);
      sinEl = Math.sin(el);
      cosEl = Math.cos(el);
    }
    this.camera.position.set(this.focusX + d * cosEl * sinAz, d * sinEl, d * cosEl * cosAz);
    this.camera.lookAt(this.focusX, CAMERA.focusHeight, 0);
  }
}
