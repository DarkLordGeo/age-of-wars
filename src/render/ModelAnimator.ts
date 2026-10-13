import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import type { ClipName } from '../assets/contract';

const FADE = 0.12;

/**
 * One-shots only interrupt one-shots of equal or lower priority: a flinch never cuts a swing
 * short, and nothing interrupts a death.
 */
const PRIORITY: Partial<Record<ClipName, number>> = { hit: 1, attack: 2, death: 3 };

/**
 * Per-instance animation state for one cloned GLB: its own mixer and actions, so pooled
 * units never share playback state. Looping clips (idle/walk) crossfade; one-shots
 * (hit, attack, death) hold the model until finished. Death clamps on its last frame.
 * Purely visual: gameplay timing comes from the sim, never from clip events.
 */
export class ModelAnimator {
  private readonly mixer: AnimationMixer;
  /** Every variant per clip name ("death", "death_2", ...). */
  private readonly actions = new Map<ClipName, AnimationAction[]>();
  private current: ClipName | null = null;
  private currentAction: AnimationAction | null = null;
  private busy = false;
  private loopRate = 1;
  private attackRate = 1;

  /**
   * `variants` (optional) adds alternative takes per clip; one-shots pick one at random each
   * time they play (e.g. a different death per unit). Loops always use the first take.
   */
  constructor(
    root: Object3D,
    clips: ReadonlyMap<ClipName, AnimationClip>,
    variants?: ReadonlyMap<ClipName, readonly AnimationClip[]>,
    private random: () => number = Math.random,
  ) {
    this.mixer = new AnimationMixer(root);
    for (const [name, clip] of clips) {
      const takes = variants?.get(name)?.length ? variants.get(name)! : [clip];
      this.actions.set(name, takes.map((c) => this.mixer.clipAction(c)));
    }
    this.mixer.addEventListener('finished', (e) => {
      if (!this.actions.get('death')?.includes(e.action)) this.busy = false;
    });
  }

  /**
   * Per-unit variation (set on bind): loop playback rate and start phase, swing speed, and the
   * random source for picking takes. Keeps identical units from moving in lockstep.
   */
  vary(v: { loopRate?: number; attackRate?: number; random?: () => number }): void {
    this.loopRate = v.loopRate ?? 1;
    this.attackRate = v.attackRate ?? 1;
    if (v.random) this.random = v.random;
  }

  /** Name of the clip currently driving the model. */
  get playing(): ClipName | null {
    return this.current;
  }

  /** The clip (take) currently driving the model. */
  get playingClip(): AnimationClip | null {
    return this.currentAction?.getClip() ?? null;
  }

  has(name: ClipName): boolean {
    return this.actions.has(name);
  }

  /** Loop `name` unless a one-shot is still running. No-op if already playing. */
  playLoop(name: ClipName): void {
    if (this.busy || this.current === name) return;
    this.start(name, false);
  }

  /** Seconds into the take currently playing (clip time, not wall time). */
  get time(): number {
    return this.currentAction?.time ?? 0;
  }

  /**
   * Play `name` once, interrupting loops and lower-priority one-shots (see PRIORITY).
   * Death stays on its final pose.
   */
  playOnce(name: ClipName): boolean {
    if (this.current === name && this.busy) return false;
    if (this.busy && this.current && (PRIORITY[this.current] ?? 0) > (PRIORITY[name] ?? 0)) return false;
    return this.start(name, true);
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  /** Return to a clean state for pooling. */
  reset(): void {
    this.mixer.stopAllAction();
    this.current = null;
    this.currentAction = null;
    this.busy = false;
  }

  private start(name: ClipName, once: boolean): boolean {
    const takes = this.actions.get(name);
    if (!takes?.length) return false; // clip missing: keep whatever is playing
    const next = once && takes.length > 1 ? takes[Math.floor(this.random() * takes.length) % takes.length]! : takes[0]!;
    const prev = this.currentAction;
    next.reset();
    next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.timeScale = once ? (name === 'attack' ? this.attackRate : 1) : this.loopRate;
    if (!once) next.time = this.random() * next.getClip().duration; // random loop phase
    if (prev && prev !== next) {
      next.fadeIn(FADE).play();
      prev.fadeOut(FADE);
    } else {
      next.play();
    }
    this.current = name;
    this.currentAction = next;
    this.busy = once;
    return true;
  }
}
