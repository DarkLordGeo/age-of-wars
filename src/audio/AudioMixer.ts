import { DEFAULT_VOLUME } from '../config/music';

export type Channel = 'music' | 'sfx';

/**
 * The minimal slice of the Web Audio API the mixer and music player use. Typed separately so
 * tests can drive them with a fake context.
 */
export interface AudioCtxLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<BufferLike>;
}
export interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  cancelScheduledValues(t: number): unknown;
}
export interface GainLike {
  gain: ParamLike;
  connect(dest: unknown): unknown;
  disconnect(): void;
}
export interface BufferLike {
  readonly duration: number;
}
export interface SourceLike {
  buffer: BufferLike | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  connect(dest: unknown): unknown;
  disconnect(): void;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

const STORE_KEY = 'aow.volume';

/**
 * Two independent channels, music and sfx, each with its own gain into the output, so the
 * soundtrack can never drown or duck the effects unless the player turns it up. Volumes are
 * remembered in localStorage. The AudioContext is created lazily and resumed on the first user
 * gesture (browsers block audio until then).
 */
export class AudioMixer {
  private ctx: AudioCtxLike | null = null;
  private readonly buses = new Map<Channel, GainLike>();
  private readonly volume: Record<Channel, number>;

  constructor(private readonly makeContext: () => AudioCtxLike | null = defaultContext) {
    this.volume = { ...DEFAULT_VOLUME, ...loadVolumes() };
    if (typeof window !== 'undefined') {
      const unlock = (): void => {
        void this.context()?.resume();
      };
      window.addEventListener('pointerdown', unlock, { capture: true });
      window.addEventListener('keydown', unlock, { capture: true });
    }
  }

  /** The audio context (null when Web Audio is unavailable, e.g. in Node tests without a fake). */
  context(): AudioCtxLike | null {
    if (!this.ctx) {
      this.ctx = this.makeContext();
      if (this.ctx) {
        for (const ch of ['music', 'sfx'] as const) {
          const g = this.ctx.createGain();
          g.gain.value = this.volume[ch];
          g.connect(this.ctx.destination);
          this.buses.set(ch, g);
        }
      }
    }
    return this.ctx;
  }

  /** Node to connect a channel's sources to. */
  bus(ch: Channel): GainLike | null {
    this.context();
    return this.buses.get(ch) ?? null;
  }

  getVolume(ch: Channel): number {
    return this.volume[ch];
  }

  setVolume(ch: Channel, v: number): void {
    this.volume[ch] = Math.min(1, Math.max(0, v));
    const bus = this.buses.get(ch);
    const ctx = this.ctx;
    if (bus && ctx) {
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
      bus.gain.linearRampToValueAtTime(this.volume[ch], ctx.currentTime + 0.05);
    }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.volume));
    } catch {
      /* storage unavailable */
    }
  }
}

function defaultContext(): AudioCtxLike | null {
  const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  return Ctor ? (new Ctor() as unknown as AudioCtxLike) : null;
}

function loadVolumes(): Partial<Record<Channel, number>> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
    const v = raw ? (JSON.parse(raw) as Partial<Record<Channel, number>>) : {};
    const out: Partial<Record<Channel, number>> = {};
    for (const ch of ['music', 'sfx'] as const) if (typeof v[ch] === 'number') out[ch] = Math.min(1, Math.max(0, v[ch]!));
    return out;
  } catch {
    return {};
  }
}
