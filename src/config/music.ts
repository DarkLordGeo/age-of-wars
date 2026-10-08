/**
 * Soundtrack configuration. To change a track, drop the file under public/audio/music/ and edit
 * its entry here; nothing else needs to change.
 *
 * Files are NOT bundled with the repo: the game runs silently (and logs the expected path) when a
 * file is missing. Only add music you have the rights to use.
 */
export interface TrackDef {
  /** URL under /public. */
  url: string;
  title: string;
  artist: string;
  /**
   * Seamless-loop window in seconds. MP3 encoders pad the start/end with silence, which leaves an
   * audible gap when looping the whole buffer; set these to the musical loop points (or leave
   * undefined to loop the whole file, which is gapless for WAV/OGG/M4A without padding).
   */
  loopStart?: number;
  loopEnd?: number;
  /** Track gain relative to the music channel (0..1) for loudness matching between tracks. */
  gain?: number;
}

export const MUSIC = {
  /** Age 1 gameplay music. Expected file: public/audio/music/glorious-morning.mp3 */
  age1: {
    url: '/audio/music/glorious-morning.mp3',
    title: 'Glorious Morning',
    artist: 'Waterflame',
    gain: 1,
  },
} satisfies Record<string, TrackDef>;

export type TrackId = keyof typeof MUSIC;

/** Default channel volumes (0..1) before the player changes them in Options. */
export const DEFAULT_VOLUME = { music: 0.55, sfx: 0.8 } as const;

/** Fade times (s). */
export const MUSIC_FADE = { in: 1.2, out: 0.8, duckTo: 0.35, duck: 0.4 } as const;
