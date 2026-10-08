import { MathUtils, PerspectiveCamera } from 'three';
import { CAMERA } from '../config/camera';

const DEG = Math.PI / 180;
const P = CAMERA.pan;

/**
 * Battlefield camera (src/config/camera.ts): a fixed-angle shot that slides along the lane.
 * The player pans with mouse drag, the wheel / trackpad, A-D or the arrow keys, or by holding
 * the pointer at the left/right screen edge. In the main menu it sweeps slowly by itself.
 */
export class CameraRig {
  readonly camera = new PerspectiveCamera(CAMERA.fov, 16 / 9, 0.5, 700);
  /** Current and wanted focus x on the lane. */
  private focus: number = P.start;
  private goal: number = P.start;
  private menu = false;
  private t = 0;
  private keys = 0; // -1 / 0 / +1
  private readonly held = new Set<string>();
  private edge = 0;
  private drag: { id: number; x: number } | null = null;
  private width = 1;

  /** Listen for pan input on the battlefield canvas (and keys on the window). */
  attachInput(canvas: HTMLElement): void {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      if (this.menu || e.button !== 0) return;
      this.drag = { id: e.pointerId, x: e.clientX };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointerup', (e) => {
      if (this.drag?.id === e.pointerId) this.drag = null;
      canvas.style.cursor = '';
    });
    canvas.addEventListener('pointercancel', () => {
      this.drag = null;
      canvas.style.cursor = '';
    });
    window.addEventListener('pointermove', (e) => {
      if (this.drag && this.drag.id === e.pointerId) {
        const dx = e.clientX - this.drag.x;
        this.drag.x = e.clientX;
        this.nudge(-dx * this.metresPerPixel());
      }
      // Edge scroll (not in the top HUD band, not while dragging).
      const h = window.innerHeight;
      const inBand = e.clientY > h * 0.22 && e.clientY < h * 0.97;
      this.edge = this.drag || !inBand ? 0 : e.clientX < P.edgePx ? -1 : e.clientX > window.innerWidth - P.edgePx ? 1 : 0;
    });
    document.addEventListener('pointerleave', () => (this.edge = 0));
    window.addEventListener('blur', () => {
      this.edge = 0;
      this.held.clear();
      this.keys = 0;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.menu) return;
        e.preventDefault();
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        this.nudge(d * (e.deltaMode === 1 ? 16 : 1) * P.wheel);
      },
      { passive: false },
    );
    const key = (e: KeyboardEvent, down: boolean): void => {
      const dir = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : 0;
      if (!dir) return;
      if (down) this.held.add(e.code);
      else this.held.delete(e.code);
      let k = 0;
      for (const c of this.held) k += c === 'ArrowLeft' || c === 'KeyA' ? -1 : 1;
      this.keys = Math.sign(k);
    };
    window.addEventListener('keydown', (e) => key(e, true));
    window.addEventListener('keyup', (e) => key(e, false));
  }

  /** Back to the player's base (new match). */
  snapTo(_x = 0): void {
    this.focus = this.goal = P.start;
    this.apply();
  }

  /** Main-menu background: slow automatic sweep, input ignored. */
  setCinematic(on: boolean): void {
    this.menu = on;
    this.t = 0;
    this.drag = null;
    this.snapTo();
  }

  /** Current focus x (for a HUD position indicator). */
  get focusX(): number {
    return this.focus;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    const vFromH = (2 * Math.atan(Math.tan((CAMERA.minHorizontalFov * DEG) / 2) / aspect)) / DEG;
    this.camera.fov = Math.max(CAMERA.fov, vFromH);
    this.camera.updateProjectionMatrix();
    this.apply();
  }

  update(dt: number, _frontlineX?: number | null): void {
    this.t += dt;
    if (this.menu) {
      const s = CAMERA.menuSweep;
      this.goal = Math.sin((this.t / s.period) * Math.PI * 2 - Math.PI / 2) * s.amplitude;
    } else {
      const v = this.keys * P.keySpeed + this.edge * P.edgeSpeed;
      if (v) this.nudge(v * dt);
    }
    this.focus += (this.goal - this.focus) * (1 - Math.exp(-P.ease * dt));
    this.apply();
  }

  private nudge(dx: number): void {
    this.goal = MathUtils.clamp(this.goal + dx, P.min, P.max);
  }

  /** Lane metres per screen pixel at the focus distance (so drags track the cursor). */
  private metresPerPixel(): number {
    const o = CAMERA.offset;
    const dist = Math.hypot(o.x, o.y - CAMERA.lookY, o.z);
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * DEG) / 2) * this.camera.aspect);
    return (2 * dist * Math.tan(hfov / 2)) / this.width;
  }

  private apply(): void {
    const o = CAMERA.offset;
    this.camera.position.set(this.focus + o.x, o.y, o.z);
    this.camera.lookAt(this.focus, CAMERA.lookY, 0);
  }
}
