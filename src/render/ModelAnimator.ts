import { AnimationClip, AnimationMixer, LoopOnce, LoopRepeat, Quaternion, type AnimationAction, type Object3D } from 'three';
import type { ClipName } from '../assets/contract';

const FADE = 0.12;

/**
 * One-shots only interrupt one-shots of equal or lower priority: a flinch never cuts a swing
 * short, and nothing interrupts a death.
 */
const PRIORITY: Partial<Record<ClipName, number>> = { hit: 1, attack: 2, death: 3 };

const qa = new Quaternion();
const qb = new Quaternion();
const qc = new Quaternion();

/** Scene-node names a clip animates ("mixamorigLeftArm.quaternion" -> "mixamorigLeftArm"). */
function nodesOf(clip: AnimationClip): Set<string> {
  return new Set(clip.tracks.map((t) => t.name.slice(0, t.name.lastIndexOf('.'))));
}

/**
 * Per-instance animation state for one cloned GLB: its own mixer and actions, so pooled
 * units never share playback state. Looping clips (idle/walk) crossfade; one-shots
 * (hit, attack, death) hold the model until finished. Death clamps on its last frame.
 *
 * Partial one-shots (a clip that animates only some of the bones the loops drive, e.g. an
 * upper-body slingshot shot) layer over the running loop: the loop keeps playing on the other
 * bones (the legs keep running or idling, no sliding) and may still switch between idle and
 * walk underneath. Purely visual: gameplay timing comes from the sim, never from clip events.
 */
export class ModelAnimator {
  private readonly mixer: AnimationMixer;
  /** Every variant per clip name ("death", "death_2", ...). */
  private readonly actions = new Map<ClipName, AnimationAction[]>();
  private loopName: ClipName | null = null;
  private loopAction: AnimationAction | null = null;
  private shotName: ClipName | null = null;
  private shotAction: AnimationAction | null = null;
  /** Nodes driven by the running partial one-shot (null: none, or a full-body one-shot). */
  private mask: Set<string> | null = null;
  /** A finished full-body one-shot holding its last frame until the next clip takes over. */
  private lingering: AnimationAction | null = null;
  private readonly loopNodes: Set<string>;
  /**
   * For the running layered one-shot: each masked bone whose parent is driven by the loop, with
   * the parent's local rotation as authored in the one-shot's full clip. update() re-bases those
   * bones so the layered upper body keeps its authored facing whatever the loop does with the
   * hips (e.g. a shot authored on a side-on stance, layered over a straight run).
   */
  private anchors: Array<{ bone: Object3D; parentRef: Quaternion; base: Quaternion; out: Quaternion | null }> = [];
  private readonly complements = new Map<string, AnimationAction>();
  private loopRate = 1;
  private attackRate = 1;

  /**
   * `variants` (optional) adds alternative takes per clip; one-shots pick one at random each
   * time they play (e.g. a different death per unit). Loops always use the first take.
   */
  constructor(
    private readonly root: Object3D,
    clips: ReadonlyMap<ClipName, AnimationClip>,
    variants?: ReadonlyMap<ClipName, readonly AnimationClip[]>,
    private random: () => number = Math.random,
  ) {
    this.mixer = new AnimationMixer(root);
    for (const [name, clip] of clips) {
      const takes = variants?.get(name)?.length ? variants.get(name)! : [clip];
      this.actions.set(name, takes.map((c) => this.mixer.clipAction(c)));
    }
    const loop = clips.get('idle') ?? clips.get('walk');
    this.loopNodes = loop ? nodesOf(loop) : new Set();
    this.mixer.addEventListener('finished', (e) => this.onFinished(e.action as AnimationAction));
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

  /** Name of the clip currently driving the model (a running one-shot wins over the loop). */
  get playing(): ClipName | null {
    return this.shotName ?? this.loopName;
  }

  /** The clip (take) currently driving the model. */
  get playingClip(): AnimationClip | null {
    return (this.shotAction ?? this.loopAction)?.getClip() ?? null;
  }

  /** Seconds into the take currently playing (clip time, not wall time). */
  get time(): number {
    return (this.shotAction ?? this.loopAction)?.time ?? 0;
  }

  /** True while a one-shot layers over the loop on part of the body only. */
  get layered(): boolean {
    return this.mask !== null;
  }

  has(name: ClipName): boolean {
    return this.actions.has(name);
  }

  /** Loop `name` unless a full-body one-shot is still running. No-op if already playing. */
  playLoop(name: ClipName): void {
    if ((this.shotName && !this.mask) || this.loopName === name) return;
    const take = this.actions.get(name)?.[0];
    if (!take) return;
    this.swapLoop(this.mask ? this.complement(name, take) : take, name, false);
  }

  /**
   * Play `name` once, interrupting loops and lower-priority one-shots (see PRIORITY).
   * Death stays on its final pose. Returns false if it did not start.
   */
  playOnce(name: ClipName): boolean {
    if (this.shotName === name) return false;
    if (this.shotName && (PRIORITY[this.shotName] ?? 0) > (PRIORITY[name] ?? 0)) return false;
    const takes = this.actions.get(name);
    if (!takes?.length) return false; // clip missing: keep whatever is playing
    const next = takes.length > 1 ? takes[Math.floor(this.random() * takes.length) % takes.length]! : takes[0]!;
    const nodes = nodesOf(next.getClip());
    const partial = this.loopAction !== null && this.loopName !== null && nodes.size < this.loopNodes.size &&
      [...nodes].every((n) => this.loopNodes.has(n));

    this.shotAction?.fadeOut(FADE);
    this.releaseLingering(next);
    next.reset();
    next.setLoop(LoopOnce, 1);
    next.clampWhenFinished = true;
    next.timeScale = name === 'attack' ? this.attackRate : 1;
    next.fadeIn(this.loopAction || this.shotAction ? FADE : 0).play();
    if (partial) {
      const wasMasked = this.mask !== null;
      this.mask = nodes;
      this.anchors = this.anchorsFor(next.getClip(), nodes);
      if (!wasMasked) this.swapLoop(this.complement(this.loopName!, this.actions.get(this.loopName!)![0]!), this.loopName!, true);
    } else {
      this.mask = null;
      this.loopAction?.fadeOut(FADE);
      this.loopAction = null;
      this.loopName = null;
    }
    this.shotName = name;
    this.shotAction = next;
    return true;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    if (!this.mask || !this.shotAction) return;
    const w = Math.min(1, this.shotAction.getEffectiveWeight());
    for (const a of this.anchors) {
      const parent = a.bone.parent!;
      // The mixer only rewrites a property when its animated value changes, so a constant track
      // leaves our last correction in place: always correct from the mixer's own value.
      if (!a.out || !a.bone.quaternion.equals(a.out)) a.base.copy(a.bone.quaternion);
      // local' = inverse(parent now) * parent as authored * local, blended in with the shot.
      qa.copy(parent.quaternion).invert().multiply(a.parentRef);
      qb.copy(qa).multiply(a.base);
      qc.copy(a.base).slerp(qb, w);
      a.bone.quaternion.copy(qc);
      a.out = (a.out ?? new Quaternion()).copy(qc);
    }
  }

  private anchorsFor(clip: AnimationClip, nodes: Set<string>): ModelAnimator['anchors'] {
    const full = (clip.userData as { full?: AnimationClip } | undefined)?.full;
    if (!full) return [];
    const out: ModelAnimator['anchors'] = [];
    for (const name of nodes) {
      const bone = this.root.getObjectByName(name);
      const parent = bone?.parent;
      if (!bone || !parent || nodes.has(parent.name)) continue;
      const track = full.tracks.find((t) => t.name === `${parent.name}.quaternion`);
      if (!track) continue;
      const v = track.values;
      out.push({ bone, parentRef: new Quaternion(v[0], v[1], v[2], v[3]), base: bone.quaternion.clone(), out: null });
    }
    return out;
  }

  /** Return to a clean state for pooling. */
  reset(): void {
    this.mixer.stopAllAction();
    this.loopName = this.shotName = null;
    this.loopAction = this.shotAction = this.lingering = null;
    this.mask = null;
    this.anchors = [];
  }

  private releaseLingering(next: AnimationAction): void {
    if (this.lingering && this.lingering !== next) this.lingering.fadeOut(FADE);
    this.lingering = null;
  }

  private onFinished(action: AnimationAction): void {
    if (action !== this.shotAction || this.shotName === 'death') return;
    this.shotName = null;
    this.shotAction = null;
    if (this.mask && this.loopName) {
      // Hand the upper body back to the full loop, at the same point of its cycle.
      this.mask = null;
      action.fadeOut(FADE);
      this.swapLoop(this.actions.get(this.loopName)![0]!, this.loopName, true);
    } else {
      this.lingering = action; // holds its last frame until the next loop fades in over it
    }
    this.mask = null;
  }

  /** Crossfade the loop to `next` (a full take or a complement), optionally keeping the phase. */
  private swapLoop(next: AnimationAction, name: ClipName, keepPhase: boolean): void {
    const prev = this.loopAction;
    if (prev === next) return;
    this.releaseLingering(next);
    const phase = prev && keepPhase ? prev.time : this.random() * next.getClip().duration; // random loop phase
    next.reset();
    next.setLoop(LoopRepeat, Infinity);
    next.timeScale = this.loopRate;
    next.time = phase;
    if (prev) {
      next.fadeIn(FADE).play();
      prev.fadeOut(FADE);
    } else {
      next.play();
    }
    this.loopAction = next;
    this.loopName = name;
  }

  /** `loop`'s take without the tracks of the running partial one-shot (cached). */
  private complement(name: ClipName, take: AnimationAction): AnimationAction {
    const mask = this.mask!;
    const key = `${name}|${[...mask].sort().join(',')}`;
    let action = this.complements.get(key);
    if (!action) {
      const clip = take.getClip();
      const tracks = clip.tracks.filter((t) => !mask.has(t.name.slice(0, t.name.lastIndexOf('.'))));
      action = this.mixer.clipAction(new AnimationClip(`${clip.name}~lower`, clip.duration, tracks));
      this.complements.set(key, action);
    }
    return action;
  }
}
