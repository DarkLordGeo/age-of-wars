import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AudioMixer, type AudioCtxLike, type BufferLike, type GainLike, type ParamLike, type SourceLike } from '../src/audio/AudioMixer';
import { MusicPlayer } from '../src/audio/MusicPlayer';
import { MUSIC, MUSIC_FADE } from '../src/config/music';

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
  async decodeAudioData(): Promise<BufferLike> {
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
