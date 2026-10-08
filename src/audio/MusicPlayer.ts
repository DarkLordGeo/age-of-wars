import { MUSIC, MUSIC_FADE, type TrackDef, type TrackId } from '../config/music';
import type { AudioMixer, BufferLike, GainLike, SourceLike } from './AudioMixer';

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; headers?: { get(name: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }>;

interface Playing {
  id: TrackId;
  source: SourceLike;
  gain: GainLike;
  ducked: boolean;
}

/**
 * Background music on the mixer's music channel.
 * - `preload(id)` fetches and decodes a track once (cached), so starting it later is instant.
 * - `play(id)` fades the track in and loops it sample-accurately (AudioBufferSourceNode.loop, with
 *   optional loopStart/loopEnd from config to skip encoder padding). Playing the track that is
 *   already on just un-ducks it.
 * - `stop()` fades out and stops; `duck(true)` lowers it (pause menu) without stopping.
 * A missing file is reported once with the exact expected path and otherwise ignored.
 */
export class MusicPlayer {
  private readonly buffers = new Map<TrackId, Promise<BufferLike | null>>();
  private current: Playing | null = null;
  /** Track requested most recently (null after stop); guards against late async starts. */
  private wanted: TrackId | null = null;
  readonly missing = new Set<TrackId>();

  constructor(
    private readonly mixer: AudioMixer,
    private readonly fetcher: Fetcher = (url) => fetch(url),
    private readonly tracks: Record<TrackId, TrackDef> = MUSIC,
  ) {}

  /** Id of the track currently sounding (or fading in), null when silent. */
  get playing(): TrackId | null {
    return this.current?.id ?? null;
  }

  preload(id: TrackId): Promise<BufferLike | null> {
    let p = this.buffers.get(id);
    if (!p) {
      p = this.load(id);
      this.buffers.set(id, p);
    }
    return p;
  }

  private async load(id: TrackId): Promise<BufferLike | null> {
    const def = this.tracks[id];
    const ctx = this.mixer.context();
    if (!ctx) return null;
    try {
      const res = await this.fetcher(def.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // SPA hosts/dev servers answer unknown paths with index.html (200): that is a missing file too.
      if ((res.headers?.get('content-type') ?? '').includes('text/html')) throw new Error('file not found');
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (err) {
      this.missing.add(id);
      console.warn(
        `[music] "${def.title}" by ${def.artist} is not available (${(err as Error).message}). ` +
          `Expected file: public${def.url}. The game runs without music until it is added.`,
      );
      return null;
    }
  }

  async play(id: TrackId): Promise<void> {
    this.wanted = id;
    if (this.current?.id === id) {
      this.duck(false);
      return;
    }
    const buffer = await this.preload(id);
    if (this.wanted !== id || !buffer) return; // superseded while loading, or no file
    const ctx = this.mixer.context();
    const bus = this.mixer.bus('music');
    if (!ctx || !bus) return;
    this.fadeOutCurrent(MUSIC_FADE.out);

    const def = this.tracks[id];
    const gain = ctx.createGain();
    gain.connect(bus);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(def.gain ?? 1, now + MUSIC_FADE.in);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    if (def.loopStart !== undefined) source.loopStart = def.loopStart;
    if (def.loopEnd !== undefined) source.loopEnd = def.loopEnd;
    source.connect(gain);
    source.start(now, 0);
    this.current = { id, source, gain, ducked: false };
  }

  /** Fade out and stop whatever is playing. */
  stop(fade: number = MUSIC_FADE.out): void {
    this.wanted = null;
    this.fadeOutCurrent(fade);
  }

  /** Lower (pause menu) or restore the current track without stopping it. */
  duck(on: boolean): void {
    const cur = this.current;
    const ctx = this.mixer.context();
    if (!cur || !ctx || cur.ducked === on) return;
    cur.ducked = on;
    const full = this.tracks[cur.id].gain ?? 1;
    const now = ctx.currentTime;
    cur.gain.gain.cancelScheduledValues(now);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, now);
    cur.gain.gain.linearRampToValueAtTime(on ? full * MUSIC_FADE.duckTo : full, now + MUSIC_FADE.duck);
  }

  private fadeOutCurrent(fade: number): void {
    const cur = this.current;
    const ctx = this.mixer.context();
    this.current = null;
    if (!cur || !ctx) return;
    const now = ctx.currentTime;
    cur.gain.gain.cancelScheduledValues(now);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, now);
    cur.gain.gain.linearRampToValueAtTime(0, now + fade);
    cur.source.stop(now + fade + 0.05);
    setTimeout(() => {
      cur.source.disconnect();
      cur.gain.disconnect();
    }, (fade + 0.2) * 1000);
  }
}
