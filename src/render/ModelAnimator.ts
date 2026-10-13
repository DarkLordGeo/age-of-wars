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
  private readonly actions = new Map<ClipName, AnimationAction>();
  private current: ClipName | null = null;
  private busy = false;

  constructor(root: Object3D, clips: ReadonlyMap<ClipName, AnimationClip>) {
    this.mixer = new AnimationMixer(root);
    for (const [name, clip] of clips) this.actions.set(name, this.mixer.clipAction(clip));
    this.mixer.addEventListener('finished', (e) => {
      if (this.actions.get('death') !== e.action) this.busy = false;
    });
  }

  /** Name of the clip currently driving the model. */
  get playing(): ClipName | null {
    return this.current;
  }

  has(name: ClipName): boolean {
    return this.actions.has(name);
  }

  /** Loop `name` unless a one-shot is still running. No-op if already playing. */
  playLoop(name: ClipName): void {
    if (this.busy || this.current === name) return;
    this.start(name, false);
  }

  /**
   * Play `name` once, interrupting loops and lower-priority one-shots (see PRIORITY).
   * Death stays on its final pose.
   */
  playOnce(name: ClipName): void {
    if (this.current === name && this.busy) return;
    if (this.busy && this.current && (PRIORITY[this.current] ?? 0) > (PRIORITY[name] ?? 0)) return;
    this.start(name, true);
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  /** Return to a clean state for pooling. */
  reset(): void {
    this.mixer.stopAllAction();
    this.current = null;
    this.busy = false;
  }

  private start(name: ClipName, once: boolean): void {
    const next = this.actions.get(name);
    if (!next) return; // clip missing: keep whatever is playing
    const prev = this.current ? this.actions.get(this.current) : undefined;
    next.reset();
    next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    if (prev && prev !== next) {
      next.fadeIn(FADE).play();
      prev.fadeOut(FADE);
    } else {
      next.play();
    }
    this.current = name;
    this.busy = once;
  }
}
