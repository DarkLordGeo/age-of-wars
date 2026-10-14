import { AnimationClip, Quaternion, Vector3, VectorKeyframeTrack, type Interpolant, type KeyframeTrack, type Object3D } from 'three';

/** Loops a start clip can hand over to. */
export type GaitLoop = 'walk' | 'run';

/**
 * A "start moving" clip (e.g. Mixamo's Start Walking) prepared for distance-driven playback.
 * Its root (hips) travel is taken out of the clip, so the clip plays in place, and kept as a
 * curve: the renderer sets the clip time from how far the unit has really moved, so a planted
 * foot stays planted whatever the sim's acceleration. `handoff` gives, for each sample time,
 * the phase of each loop whose legs match the start pose best (same foot forward), so it can
 * hand over to the walk or run cycle at any point without a pose jump.
 */
export interface StartClip {
  /** The clip with its forward root travel removed (vertical bob and sway kept). */
  clip: AnimationClip;
  /** Sample times (s), every 1/30 s from 0 to the clip's duration. */
  times: Float32Array;
  /** Forward travel (m) at each sample time, non-decreasing. */
  travel: Float32Array;
  /** Latest time to hand over to the walk loop: the best pose match late in the clip. */
  exit: number;
  handoff: Partial<Record<GaitLoop, { phase: Float32Array; error: Float32Array }>>;
}

const STEP = 1 / 30;

/** A track's own interpolant (slerp for quaternions); missing from three's typings. */
function interpolant(t: KeyframeTrack): Interpolant {
  return (t as unknown as { createInterpolant(): Interpolant }).createInterpolant();
}
const PHASES = 64;
/** Bones compared when matching poses: pelvis and legs decide which foot is where. */
const LEG = /(Hips|UpLeg|Leg|Foot|ToeBase)\.quaternion$/;

/**
 * Prepare `start` on `scene` (the loaded model, for the root bone's scale in metres).
 * Null when the clip has no root travel to drive it by.
 */
export function prepareStartClip(scene: Object3D, start: AnimationClip, loops: Partial<Record<GaitLoop, AnimationClip>>): StartClip | null {
  // The root track is the position track that travels furthest; its largest-changing axis is forward.
  let root: KeyframeTrack | null = null;
  let axis = 0;
  let best = 0;
  for (const t of start.tracks) {
    if (!t.name.endsWith('.position')) continue;
    const v = t.values;
    const last = v.length - 3;
    for (let a = 0; a < 3; a++) {
      const d = Math.abs(v[last + a]! - v[a]!);
      if (d > best) [best, root, axis] = [d, t, a];
    }
  }
  if (!root || best <= 0) return null;
  const node = scene.getObjectByName(root.name.slice(0, root.name.lastIndexOf('.')));
  if (!node?.parent) return null;
  scene.updateWorldMatrix(true, true);
  const scale = node.parent.getWorldScale(new Vector3()).x / scene.getWorldScale(new Vector3()).x;
  const v = root.values;
  const sign = Math.sign(v[v.length - 3 + axis]! - v[axis]!);

  // Travel curve (monotone: a hip sway backwards never makes the clip run backwards).
  const n = Math.floor(start.duration / STEP + 1e-6) + 1;
  const times = new Float32Array(n);
  const travel = new Float32Array(n);
  const pos = interpolant(root);
  const v0 = v[axis]!;
  let max = 0;
  for (let i = 0; i < n; i++) {
    times[i] = Math.min(start.duration, i * STEP);
    const p = pos.evaluate(times[i]!) as Float32Array;
    max = Math.max(max, (p[axis]! - v0) * sign * scale);
    travel[i] = max;
  }

  // In place: hold the root's forward coordinate at its first value.
  const inPlace = Float32Array.from(v);
  for (let i = axis; i < inPlace.length; i += 3) inPlace[i] = v0;
  const tracks = start.tracks.map((t) => (t === root ? new VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(inPlace)) : t));
  const clip = new AnimationClip(start.name, start.duration, tracks);

  const handoff: StartClip['handoff'] = {};
  for (const name of ['walk', 'run'] as const) {
    const loop = loops[name];
    if (loop) handoff[name] = matchPhases(start, loop, times);
  }
  // Hand over to the walk at its best match in the second half of the clip.
  let exit = start.duration;
  const walk = handoff.walk;
  if (walk) {
    let e = Infinity;
    for (let i = Math.floor(n * 0.4); i < n - 1; i++) {
      if (walk.error[i]! < e) [e, exit] = [walk.error[i]!, times[i]!];
    }
  }
  return { clip, times, travel, exit, handoff };
}

/** For each of `times` in `a`, the phase (0..1) of loop `b` whose leg pose is closest, and the summed angle (rad). */
function matchPhases(a: AnimationClip, b: AnimationClip, times: Float32Array): { phase: Float32Array; error: Float32Array } {
  const pairs = a.tracks
    .filter((t) => LEG.test(t.name))
    .flatMap((t) => {
      const u = b.tracks.find((x) => x.name === t.name);
      return u ? [[interpolant(t), interpolant(u)] as const] : [];
    });
  // Loop poses at PHASES points of its cycle.
  const loopPose = Array.from({ length: PHASES }, (_, k) => pairs.map(([, ib]) => quat(ib.evaluate((k / PHASES) * b.duration))));
  const phase = new Float32Array(times.length);
  const error = new Float32Array(times.length);
  for (let i = 0; i < times.length; i++) {
    const pose = pairs.map(([ia]) => quat(ia.evaluate(times[i]!)));
    let bestK = 0;
    let bestE = Infinity;
    for (let k = 0; k < PHASES; k++) {
      let e = 0;
      for (let j = 0; j < pose.length; j++) e += angle(pose[j]!, loopPose[k]![j]!);
      if (e < bestE) [bestE, bestK] = [e, k];
    }
    phase[i] = bestK / PHASES;
    error[i] = bestE;
  }
  return { phase, error };
}

function quat(v: ArrayLike<number>): Quaternion {
  return new Quaternion(v[0], v[1], v[2], v[3]);
}

function angle(p: Quaternion, q: Quaternion): number {
  return 2 * Math.acos(Math.min(1, Math.abs(p.dot(q))));
}

/** Clip time at which the start clip has travelled `d` metres (clamped to the clip). */
export function startTimeAt(s: StartClip, d: number): number {
  const { times, travel } = s;
  if (d <= 0) return 0;
  for (let i = 1; i < travel.length; i++) {
    if (travel[i]! >= d) {
      const span = travel[i]! - travel[i - 1]!;
      return span > 1e-9 ? times[i - 1]! + ((d - travel[i - 1]!) / span) * (times[i]! - times[i - 1]!) : times[i]!;
    }
  }
  return times[times.length - 1]!;
}

/** The start clip's own forward speed (m/s) around time `t` (over +-2 samples). */
export function startSpeedAt(s: StartClip, t: number): number {
  const i = Math.min(s.times.length - 1, Math.max(0, Math.round(t / STEP)));
  const a = Math.max(0, i - 2);
  const b = Math.min(s.times.length - 1, i + 2);
  return b > a ? (s.travel[b]! - s.travel[a]!) / (s.times[b]! - s.times[a]!) : 0;
}

/** Loop phase (0..1) to continue in `loop` from start-clip time `t`, and the pose error there. */
export function handoffAt(s: StartClip, loop: GaitLoop, t: number): { phase: number; error: number } | null {
  const h = s.handoff[loop];
  if (!h) return null;
  const i = Math.min(s.times.length - 1, Math.max(0, Math.round(t / STEP)));
  return { phase: h.phase[i]!, error: h.error[i]! };
}
