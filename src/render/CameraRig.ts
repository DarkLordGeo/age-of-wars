import { Box3, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { CAMERA } from '../config/camera';

const DEG = Math.PI / 180;
const P = CAMERA.pan;
const Z = CAMERA.zoom;
const corner = new Vector3();

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
  /** Current and wanted zoom (offset scale), and the default the match starts at. */
  private zoom = 1;
  private zoomGoal = 1;
  private defaultZoom = 1;
  /** World bounds of the player's cave, framed by the default zoom. */
  private frame: Box3 | null = null;

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
        const scale = e.deltaMode === 1 ? 16 : 1;
        // Vertical wheel and trackpad pinch (ctrl+wheel) zoom; horizontal scroll pans the lane.
        if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) this.zoomBy(Math.exp(e.deltaY * scale * Z.wheel));
        else this.nudge(e.deltaX * scale * P.wheel);
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
    window.addEventListener('keydown', (e) => {
      key(e, true);
      if (this.menu) return;
      if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoomBy(1 / Z.keyStep);
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoomBy(Z.keyStep);
    });
    window.addEventListener('keyup', (e) => key(e, false));
  }

  /** Back to the player's base (new match), at the default zoom (the menu keeps zoom 1). */
  snapTo(_x = 0): void {
    this.focus = this.goal = P.start;
    this.zoom = this.zoomGoal = this.menu ? 1 : this.defaultZoom;
    this.apply();
  }

  /** The player's cave bounds: the default zoom keeps CAMERA.zoom.caveVisible of it in view. */
  setFraming(caveBounds: Box3): void {
    this.frame = caveBounds.clone();
    this.refreshDefaultZoom();
  }

  /** Current zoom factor (1 = menu framing; smaller is closer). */
  get zoomLevel(): number {
    return this.zoom;
  }

  /** Default gameplay zoom for the current cave bounds and viewport. */
  get defaultZoomLevel(): number {
    return this.defaultZoom;
  }

  /** Multiply the wanted zoom (smooth), within CAMERA.zoom.min..max. */
  zoomBy(factor: number): void {
    this.zoomGoal = MathUtils.clamp(this.zoomGoal * factor, Z.min, Z.max);
  }

  /**
   * Share of `box` (its 8 corners projected to the screen, as a rectangle) inside the viewport
   * when the camera looks at `focus` with `zoom`. Restores the camera afterwards.
   */
  visibleFraction(box: Box3, focus: number, zoom: number): number {
    const saved = { focus: this.focus, zoom: this.zoom };
    this.focus = focus;
    this.zoom = zoom;
    this.apply();
    this.camera.updateMatrixWorld(true);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(this.camera);
      x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x);
      y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
    }
    this.focus = saved.focus;
    this.zoom = saved.zoom;
    this.apply();
    const area = (x1 - x0) * (y1 - y0);
    const ix = Math.max(0, Math.min(1, x1) - Math.max(-1, x0));
    const iy = Math.max(0, Math.min(1, y1) - Math.max(-1, y0));
    return area > 0 ? (ix * iy) / area : 0;
  }

  /** Solve the zoom (bisection; the visible share grows with distance) that frames the cave. */
  private refreshDefaultZoom(): void {
    const box = this.frame;
    if (!box) return;
    const keepUser = this.zoomGoal !== this.defaultZoom;
    let lo: number = Z.min;
    let hi: number = 1;
    if (this.visibleFraction(box, P.start, lo) >= Z.caveVisible) hi = lo;
    else if (this.visibleFraction(box, P.start, hi) <= Z.caveVisible) lo = hi;
    for (let i = 0; i < 24 && hi - lo > 1e-4; i++) {
      const mid = (lo + hi) / 2;
      if (this.visibleFraction(box, P.start, mid) < Z.caveVisible) lo = mid;
      else hi = mid;
    }
    this.defaultZoom = (lo + hi) / 2;
    if (!this.menu && !keepUser) this.zoom = this.zoomGoal = this.defaultZoom;
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
    this.refreshDefaultZoom(); // the visible share depends on the aspect
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
    this.focus += (this.goal - this.focus) * (1 - Math.exp(-P.ease * Math.max(0, dt)));
    if (this.menu) this.zoomGoal = 1;
    this.zoom += (this.zoomGoal - this.zoom) * (1 - Math.exp(-Z.ease * Math.max(0, dt)));
    // Never let the eye leave the lane: past the ends it would sit inside the arena's rock walls.
    this.focus = MathUtils.clamp(this.focus, Math.min(P.min, -CAMERA.menuSweep.amplitude), Math.max(P.max, CAMERA.menuSweep.amplitude));
    this.apply();
  }

  private nudge(dx: number): void {
    this.goal = MathUtils.clamp(this.goal + dx, P.min, P.max);
  }

  /** Lane metres per screen pixel at the focus distance (so drags track the cursor). */
  private metresPerPixel(): number {
    const o = CAMERA.offset;
    const dist = Math.hypot(o.x, o.y - CAMERA.lookY, o.z) * this.zoom;
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * DEG) / 2) * this.camera.aspect);
    return (2 * dist * Math.tan(hfov / 2)) / this.width;
  }

  private apply(): void {
    const o = CAMERA.offset;
    const z = this.zoom;
    // Same viewing direction at any zoom: the eye slides along its offset from the look point.
    this.camera.position.set(this.focus + o.x * z, CAMERA.lookY + (o.y - CAMERA.lookY) * z, o.z * z);
    this.camera.lookAt(this.focus, CAMERA.lookY, 0);
  }
}
