import type { AudioMixer, BufferLike } from './AudioMixer';
import type { EventBus } from '../game/EventBus';
import { SFX, UNIT_WEAPON, type SfxDef } from '../config/sfx';

export type SoundCue =
  | 'club_swing'
  | 'spear_swing'
  | 'club_hit'
  | 'spear_hit'
  | 'unit_hurt'
  | 'sling_fire'
  | 'turret_fire'
  | 'stone_hit'
  | 'stone_miss'
  | 'structure_hit'
  | 'unit_death'
  | 'unit_spawn'
  | 'age_up'
  | 'victory'
  | 'defeat';

/** Implement this with real audio later (WebAudio, howler-style mixer, ...). */
export interface SoundBank {
  play(cue: SoundCue): void;
}

/** Placeholder bank: just counts cues so hooks can be verified without any audio assets. */
export class PlaceholderSoundBank implements SoundBank {
  readonly counts: Partial<Record<SoundCue, number>> = {};

  play(cue: SoundCue): void {
    this.counts[cue] = (this.counts[cue] ?? 0) + 1;
  }
}

/** Unit def id for a sim unit id (the attacker of an `attack` event). */
export type UnitLookup = (unitId: number) => string | undefined;

/**
 * Map simulation events to sound cues. A melee blow plays its weapon's impact at the damage
 * moment (the swing whoosh comes from the renderer when the swing starts, see `swingCue`);
 * projectiles thwack on units and thud on the ground; base hits use the heavier rock impact.
 */
export function bindAudio(bus: EventBus, bank: SoundBank, unitOf: UnitLookup = () => undefined): void {
  bus.on('attack', (e) => {
    if (e.sourceKind === 'turret') return bank.play('turret_fire');
    if (e.mode === 'ranged') return bank.play('sling_fire');
    bank.play(UNIT_WEAPON[unitOf(e.sourceId) ?? ''] === 'spear' ? 'spear_hit' : 'club_hit');
  });
  bus.on('projectileImpact', (e) => bank.play(e.hit ? 'stone_hit' : 'stone_miss'));
  bus.on('hit', (e) => e.targetKind === 'unit' && e.damage > 0 && bank.play('unit_hurt'));
  bus.on('death', () => bank.play('unit_death'));
  bus.on('baseDamage', () => bank.play('structure_hit'));
  bus.on('spawn', () => bank.play('unit_spawn'));
  bus.on('ageAdvanced', () => bank.play('age_up'));
  bus.on('victory', () => bank.play('victory'));
  bus.on('defeat', () => bank.play('defeat'));
}

/** Whoosh for a unit's swing (played by the renderer when the swing animation starts). */
export function swingCue(unitDefId: string): SoundCue {
  return UNIT_WEAPON[unitDefId] === 'spear' ? 'spear_swing' : 'club_swing';
}

/**
 * Sound bank on the mixer's sfx channel (separate from music), mixed per cue (src/config/sfx.ts):
 * cue volume, a random (or alternating) take and a random pitch and level per play, at most
 * `maxVoices` copies at once and no repeat within `minGap` seconds, so big fights stay readable. Cues without loaded files are only
 * counted, so gameplay works before any effect files exist.
 */
export class MixerSoundBank extends PlaceholderSoundBank {
  /** Decoded takes per cue, at their index in the cue's `files` (holes until loaded). */
  private readonly sounds = new Map<SoundCue, Array<BufferLike | undefined>>();
  private readonly turn = new Map<SoundCue, number>();
  private readonly voices = new Map<SoundCue, number>();
  private readonly lastPlayed = new Map<SoundCue, number>();
  /** Plays actually started (after voice limiting), for tests and debugging. */
  readonly started: Partial<Record<SoundCue, number>> = {};

  constructor(
    private readonly mixer: AudioMixer,
    private readonly defs: Record<SoundCue, SfxDef> = SFX,
    private readonly random: () => number = Math.random,
  ) {
    super();
  }

  /** Load every file listed in the sfx config. */
  async loadAll(fetcher: typeof fetch = fetch): Promise<void> {
    await Promise.all(Object.entries(this.defs).flatMap(([cue, def]) => def.files.map((f, i) => this.load(cue as SoundCue, f, fetcher, i))));
  }

  /** Decode `url` as take `index` of `cue` (default: appended), whatever order loads finish in. */
  async load(cue: SoundCue, url: string, fetcher: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }> = fetch, index?: number): Promise<void> {
    const ctx = this.mixer.context();
    if (!ctx) return;
    try {
      const res = await fetcher(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      const takes = this.sounds.get(cue) ?? [];
      takes[index ?? takes.length] = buf;
      this.sounds.set(cue, takes);
    } catch (err) {
      console.warn(`[sfx] ${cue}: could not load ${url} (${(err as Error).message})`);
    }
  }

  override play(cue: SoundCue): void {
    super.play(cue);
    const takes = this.sounds.get(cue)?.filter((b): b is BufferLike => b !== undefined);
    const ctx = this.mixer.context();
    const bus = this.mixer.bus('sfx');
    if (!takes?.length || !ctx || !bus || ctx.state !== 'running') return;
    const def = this.defs[cue];
    const now = ctx.currentTime;
    if ((this.voices.get(cue) ?? 0) >= def.maxVoices) return;
    if (now - (this.lastPlayed.get(cue) ?? -Infinity) < def.minGap) return;
    this.lastPlayed.set(cue, now);
    this.voices.set(cue, (this.voices.get(cue) ?? 0) + 1);
    this.started[cue] = (this.started[cue] ?? 0) + 1;

    const src = ctx.createBufferSource();
    let take: number;
    if (def.order === 'alternate') {
      take = (this.turn.get(cue) ?? 0) % takes.length;
      this.turn.set(cue, take + 1);
    } else {
      take = Math.floor(this.random() * takes.length) % takes.length;
    }
    src.buffer = takes[take]!;
    if (src.playbackRate) src.playbackRate.value = 1 + (this.random() * 2 - 1) * def.pitch;
    const gain = ctx.createGain();
    gain.gain.value = def.volume * (1 + (this.random() * 2 - 1) * (def.volumeJitter ?? 0));
    src.connect(gain);
    gain.connect(bus);
    src.onended = () => {
      this.voices.set(cue, Math.max(0, (this.voices.get(cue) ?? 1) - 1));
      gain.disconnect();
    };
    src.start();
  }
}
