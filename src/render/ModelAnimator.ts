import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import type { ClipName } from '../assets/contract';

const FADE = 0.12;

/**
 * Per-instance animation state for one cloned GLB: its own mixer and actions, so pooled
 * units never share playback state. Looping clips (idle/walk) crossfade; one-shots
 * (attack, death) hold the model until finished. Death clamps on its last frame.
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

  /** Play `name` once, interrupting whatever is running. Death stays on its final pose. */
  playOnce(name: ClipName): void {
    if (this.current === name && this.busy) return;
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
