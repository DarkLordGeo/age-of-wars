import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { AudioMixer, type AudioCtxLike, type BufferLike, type GainLike, type ParamLike, type SourceLike } from '../src/audio/AudioMixer';
import { MusicPlayer } from '../src/audio/MusicPlayer';
import { bindAudio, MixerSoundBank, PlaceholderSoundBank, swingCue, type SoundCue } from '../src/audio/AudioHooks';
import { SFX } from '../src/config/sfx';
import { EventBus } from '../src/game/EventBus';
import { MUSIC, MUSIC_FADE } from '../src/config/music';
import { GAME } from '../src/config/game';
import { World } from '../src/sim/World';

const ROOT = join(import.meta.dirname, '..');

/** Records every node and automation call so tests can inspect the audio graph. */
class FakeParam implements ParamLike {
  value = 1;
  events: Array<[string, number, number]> = [];
  setValueAtTime(v: number, t: number): void {
    this.events.push(['set', v, t]);
    this.value = v;
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.events.push(['ramp', v, t]);
    this.value = v;
  }
  cancelScheduledValues(t: number): void {
    this.events.push(['cancel', 0, t]);
  }
}
class FakeGain implements GainLike {
  gain = new FakeParam();
  out: unknown = null;
  connect(d: unknown): unknown {
    this.out = d;
    return d;
  }
  disconnect(): void {
    this.out = null;
  }
}
class FakeSource implements SourceLike {
  buffer: BufferLike | null = null;
  playbackRate = new FakeParam();
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  out: unknown = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  connect(d: unknown): unknown {
    this.out = d;
    return d;
  }
  disconnect(): void {
    this.out = null;
  }
  start(when = 0): void {
    this.startedAt = when;
  }
  stop(when = 0): void {
    this.stoppedAt = when;
  }
}
class FakeCtx implements AudioCtxLike {
  currentTime = 10;
  state = 'running';
  destination = { name: 'speakers' };
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  decoded = 0;
  async resume(): Promise<void> {}
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  async decodeAudioData(_data?: ArrayBuffer): Promise<BufferLike> {
    this.decoded++;
    return { duration: 120 };
  }
}

const okFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) });
const missingFetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });

function setup(fetcher = okFetch) {
  const ctx = new FakeCtx();
  const mixer = new AudioMixer(() => ctx);
  const music = new MusicPlayer(mixer, fetcher);
  return { ctx, mixer, music };
}

describe('audio: soundtrack', () => {
  it('Age 1 is configured as Glorious Morning by Waterflame', () => {
    assert.equal(MUSIC.age1.title, 'Glorious Morning');
    assert.equal(MUSIC.age1.artist, 'Waterflame');
    assert.equal(MUSIC.age1.url, '/audio/music/glorious-morning.mp3');
  });

  it('plays on the music channel, looping, with a fade-in', async () => {
    const { ctx, mixer, music } = setup();
    await music.play('age1');
    assert.equal(music.playing, 'age1');
    const src = ctx.sources[0]!;
    assert.equal(src.loop, true);
    assert.equal(src.startedAt, ctx.currentTime);
    const trackGain = src.out as FakeGain;
    assert.equal(trackGain.out, mixer.bus('music'));
    assert.notEqual(trackGain.out, mixer.bus('sfx'));
    assert.deepEqual(trackGain.gain.events.slice(0, 2), [
      ['set', 0, 10],
      ['ramp', 1, 10 + MUSIC_FADE.in],
    ]);
  });

  it('decodes once (preload cache) and replaying the same track does not restart it', async () => {
    const { ctx, music } = setup();
    await music.preload('age1');
    await music.play('age1');
    await music.play('age1');
    assert.equal(ctx.decoded, 1);
    assert.equal(ctx.sources.length, 1);
  });

  it('stop() fades out and stops the source', async () => {
    const { ctx, music } = setup();
    await music.play('age1');
    const src = ctx.sources[0]!;
    music.stop(0.8);
    assert.equal(music.playing, null);
    const g = (src.out as FakeGain).gain;
    assert.deepEqual(g.events.at(-1), ['ramp', 0, 10.8]);
    assert.ok(src.stoppedAt !== null && src.stoppedAt >= 10.8);
  });

  it('duck() lowers and restores without stopping', async () => {
    const { ctx, music } = setup();
    await music.play('age1');
    const g = (ctx.sources[0]!.out as FakeGain).gain;
    music.duck(true);
    assert.equal(g.value, MUSIC_FADE.duckTo);
    music.duck(false);
    assert.equal(g.value, 1);
    assert.equal(ctx.sources[0]!.stoppedAt, null);
  });

  it('a stop() while the file is still loading wins (no late start)', async () => {
    const { ctx, music } = setup();
    const p = music.play('age1');
    music.stop();
    await p;
    assert.equal(ctx.sources.length, 0);
    assert.equal(music.playing, null);
  });

  it('a missing file is reported and the game stays silent', async () => {
    const warn = console.warn;
    const logs: string[] = [];
    console.warn = (m: string) => logs.push(m);
    try {
      const { ctx, music } = setup(missingFetch);
      await music.play('age1');
      assert.equal(music.playing, null);
      assert.equal(ctx.sources.length, 0);
      assert.ok(music.missing.has('age1'));
      assert.match(logs.join('\n'), /public\/audio\/music\/glorious-morning\.mp3/);
    } finally {
      console.warn = warn;
    }
  });
});

describe('audio: mixer channels', () => {
  it('music and sfx have independent volumes', () => {
    const { mixer } = setup();
    mixer.setVolume('music', 0.2);
    mixer.setVolume('sfx', 0.9);
    assert.equal(mixer.getVolume('music'), 0.2);
    assert.equal(mixer.getVolume('sfx'), 0.9);
    assert.equal((mixer.bus('music') as FakeGain).gain.value, 0.2);
    assert.equal((mixer.bus('sfx') as FakeGain).gain.value, 0.9);
    mixer.setVolume('music', 3);
    assert.equal(mixer.getVolume('music'), 1);
  });
});

describe('audio: sound effects', () => {
  it('maps game events to distinct cues (weapon-specific melee impacts)', () => {
    const bus = new EventBus();
    const bank = new PlaceholderSoundBank();
    const defs: Record<number, string> = { 1: 'clubman', 2: 'dino' };
    bindAudio(bus, bank, (id) => defs[id]);
    bus.dispatch({ type: 'attack', team: 'player', sourceKind: 'unit', sourceId: 1, mode: 'melee' });
    bus.dispatch({ type: 'attack', team: 'player', sourceKind: 'unit', sourceId: 2, mode: 'melee' });
    bus.dispatch({ type: 'attack', team: 'player', sourceKind: 'unit', sourceId: 3, mode: 'ranged' });
    bus.dispatch({ type: 'attack', team: 'player', sourceKind: 'turret', sourceId: 0, mode: 'ranged' });
    bus.dispatch({ type: 'projectileImpact', projectileId: 1, defId: 'rock', hit: true, x: 0, y: 1, z: 0 });
    bus.dispatch({ type: 'projectileImpact', projectileId: 2, defId: 'rock', hit: false, x: 0, y: 0, z: 0 });
    bus.dispatch({ type: 'hit', targetKind: 'unit', targetId: 1, team: 'enemy', damage: 5, x: 0, y: 1, z: 0 });
    bus.dispatch({ type: 'baseDamage', team: 'enemy', damage: 16, health: 400 });
    bus.dispatch({ type: 'death', unitId: 1, team: 'enemy', killerTeam: 'player' });
    assert.deepEqual(bank.counts, {
      club_hit: 1, spear_hit: 1, sling_fire: 1, turret_fire: 1, stone_hit: 1, stone_miss: 1, unit_hurt: 1, structure_hit: 1, unit_death: 1,
    });
    assert.equal(swingCue('clubman'), 'club_swing');
    assert.equal(swingCue('dino'), 'spear_swing');
  });

  it('mixes per cue: volume, voice cap, repeat gap, random take and pitch', async () => {
    const ctx = new FakeCtx();
    const mixer = new AudioMixer(() => ctx);
    const defs = { ...SFX, club_hit: { files: [], volume: 0.7, maxVoices: 2, minGap: 0.05, pitch: 0.1 } };
    const bank = new MixerSoundBank(mixer, defs as typeof SFX, () => 0.75);
    await bank.load('club_hit', 'a.ogg', okFetch);
    await bank.load('club_hit', 'b.ogg', okFetch);
    const play = (cue: SoundCue, at: number): void => {
      ctx.currentTime = at;
      bank.play(cue);
    };
    play('club_hit', 1);
    play('club_hit', 1.01); // too soon after the last one: dropped
    play('club_hit', 1.2);
    play('club_hit', 1.4); // two still sounding (fakes never end): voice cap
    assert.equal(bank.started.club_hit, 2);
    assert.equal(bank.counts.club_hit, 4, 'every cue is still counted');
    const gains = ctx.gains.filter((g) => g.gain.value === 0.7);
    assert.equal(gains.length, 2, 'played at the cue volume');
    play('unit_hurt', 2); // no files: silent, no error
    assert.equal(bank.started.unit_hurt, undefined);
  });

  it('every configured effect file exists under public/ and is listed in docs/ASSET_LICENSES.md', () => {
    const licences = readFileSync(join(ROOT, 'docs', 'ASSET_LICENSES.md'), 'utf8');
    const files = Object.values(SFX).flatMap((d) => d.files);
    assert.deepEqual(files.sort(), ['/audio/sfx/death-male.mp3', '/audio/sfx/hit-grunt.mp3', '/audio/sfx/hit-hammer.mp3']);
    for (const f of files) {
      assert.ok(existsSync(join(ROOT, 'public', f)), `${f} missing`);
      assert.ok(licences.includes(`public${f}`), `${f} has no licence row`);
    }
  });

  it('hits alternate grunt / hammer whatever order the files finish loading in, with varied pitch and level', async () => {
    const ctx = new FakeCtx();
    const mixer = new AudioMixer(() => ctx);
    let r = 0;
    const rolls = [0, 1, 0.5, 0.25, 0.9, 0.1, 0.6, 0.4];
    const bank = new MixerSoundBank(mixer, SFX, () => rolls[r++ % rolls.length]!);
    // Distinct buffers per URL; the hammer finishes decoding first.
    const buffers: Record<string, BufferLike> = {};
    ctx.decodeAudioData = async () => ({ duration: 0.3 });
    const fetchOf = (url: string) => async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(url.length) });
    const decode = ctx.decodeAudioData;
    ctx.decodeAudioData = async (d: ArrayBuffer) => (buffers[d.byteLength] ??= await decode(d));
    const [grunt, hammer] = SFX.unit_hurt.files as [string, string];
    await bank.load('unit_hurt', hammer, fetchOf(hammer), 1);
    await bank.load('unit_hurt', grunt, fetchOf(grunt), 0);
    const played: BufferLike[] = [];
    for (let i = 0; i < 4; i++) {
      ctx.currentTime = 20 + i; // spaced out: no gap or voice limit
      ctx.sources.forEach((s) => (s as unknown as { onended?: () => void }).onended?.());
      bank.play('unit_hurt');
      played.push(ctx.sources.at(-1)!.buffer!);
    }
    const g = buffers[grunt.length]!;
    const h = buffers[hammer.length]!;
    assert.notEqual(g, h);
    assert.deepEqual(played.map((b) => (b === g ? 'grunt' : b === h ? 'hammer' : '?')), ['grunt', 'hammer', 'grunt', 'hammer']);
    const def = SFX.unit_hurt;
    const levels = ctx.gains.slice(-4).map((x) => x.gain.value);
    for (const v of levels) assert.ok(v >= def.volume * (1 - def.volumeJitter!) - 1e-9 && v <= def.volume * (1 + def.volumeJitter!) + 1e-9);
    assert.ok(new Set(levels).size > 1, 'level varies');
    const rates = ctx.sources.slice(-4).map((s) => s.playbackRate.value);
    assert.ok(new Set(rates).size > 1, 'pitch varies');
    for (const v of rates) assert.ok(Math.abs(v - 1) <= def.pitch + 1e-9);
  });

  it('only blows that deal damage play a hit; each death plays once', () => {
    const bus = new EventBus();
    const bank = new PlaceholderSoundBank();
    bindAudio(bus, bank);
    bus.dispatch({ type: 'hit', targetKind: 'unit', targetId: 1, team: 'enemy', damage: 0, x: 0, y: 1, z: 0 });
    bus.dispatch({ type: 'hit', targetKind: 'base', targetId: -1, team: 'enemy', damage: 9, x: 0, y: 1, z: 0 });
    assert.equal(bank.counts.unit_hurt, undefined);
    // A real fight: one unit_hurt per damaging hit on a unit, one unit_death per unit death.
    const w = new World({ ai: false });
    for (let i = 0; i < 4; i++) w.spawnUnit('player', 'clubman', -6 - i * 2);
    for (let i = 0; i < 4; i++) w.spawnUnit('enemy', 'clubman', 6 + i * 2);
    let hits = 0;
    let deaths = 0;
    for (let i = 0; i < Math.round(40 / GAME.fixedStep); i++) {
      w.step(GAME.fixedStep);
      w.drainEvents((e) => {
        if (e.type === 'hit' && e.targetKind === 'unit' && e.damage > 0) hits++;
        if (e.type === 'death') deaths++;
        bus.dispatch(e);
      });
    }
    assert.ok(deaths >= 4, `deaths ${deaths}`);
    assert.equal(bank.counts.unit_death, deaths);
    assert.equal(bank.counts.unit_hurt, hits);
  });

  it('a big fight cannot stack hit or death sounds past their voice caps', async () => {
    const ctx = new FakeCtx();
    const bank = new MixerSoundBank(new AudioMixer(() => ctx), SFX, () => 0.5);
    for (const [cue, def] of [['unit_hurt', SFX.unit_hurt], ['unit_death', SFX.unit_death]] as const) {
      for (const [i, f] of def.files.entries()) await bank.load(cue, f, okFetch, i);
      for (let i = 0; i < 50; i++) {
        ctx.currentTime = 30 + i * 0.2; // far apart, but none of the (fake) voices ever end
        bank.play(cue);
      }
      assert.equal(bank.started[cue], def.maxVoices);
    }
  });
});
