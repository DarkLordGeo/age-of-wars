import type { AssetLibrary } from '../assets/AssetLibrary';
import { AudioMixer } from '../audio/AudioMixer';
import { bindAudio, MixerSoundBank } from '../audio/AudioHooks';
import { MusicPlayer } from '../audio/MusicPlayer';
import { GAME } from '../config/game';
import type { EnqueueResult } from '../sim/types';
import { GameRenderer, TEAM_TINT } from '../render/GameRenderer';
import { World } from '../sim/World';
import { Hud } from '../ui/Hud';
import { Menu } from '../ui/Menu';
import { renderPortraits } from '../ui/portraits';
import { EventBus } from './EventBus';

const ENQUEUE_MESSAGES: Partial<Record<EnqueueResult, string>> = {
  unaffordable: 'Not enough gold',
  locked: 'Unit not unlocked yet',
  'queue-full': 'Production queue is full',
};

/** AI profile both sides use in the main menu's background battle. */
const ATTRACT_PROFILE = 'normal';
/** Seconds the finished background battle lingers before a new one starts. */
const ATTRACT_RESTART_DELAY = 4;
/** Evenly matched AIs can stalemate; start a fresh battle after this long anyway. */
const ATTRACT_MAX_TIME = 6 * 60;

/**
 * - `menu`: main menu over a live AI-vs-AI battle (blurred behind the panel), HUD hidden.
 * - `playing`: a match against the chosen difficulty.
 * - `paused`: the match is frozen, pause menu over it.
 */
type Mode = 'menu' | 'playing' | 'paused';

/** Composition root: owns the World and wires sim → bus → (renderer, audio) and HUD → sim. */
export class Game {
  world: World;
  mode: Mode = 'menu';
  readonly bus = new EventBus();
  /** Two-channel audio: music and sfx have independent volumes (Options menu). */
  readonly mixer = new AudioMixer();
  readonly sound = new MixerSoundBank(this.mixer);
  readonly music = new MusicPlayer(this.mixer);
  private matchOverHandled = false;
  private readonly renderer: GameRenderer;
  private readonly hud: Hud;
  private readonly menu: Menu;
  private difficulty: string;
  private accumulator = 0;
  private last = performance.now();
  private attractEndedFor = 0;

  constructor(
    canvasHost: HTMLElement,
    hudHost: HTMLElement,
    readonly assets: AssetLibrary,
    /** Starting difficulty; `startInMenu = false` jumps straight into a match (e.g. ?play=hard). */
    difficulty: string,
    startInMenu = true,
  ) {
    this.difficulty = difficulty;
    this.world = startInMenu ? this.attractWorld() : new World({ difficulty });
    this.renderer = new GameRenderer(canvasHost, assets, this.bus);
    this.renderer.setWorld(this.world);
    bindAudio(this.bus, this.sound);

    this.hud = new Hud(hudHost, this.world.content, {
      onEnqueue: (id) => {
        const msg = ENQUEUE_MESSAGES[this.world.enqueueUnit('player', id)];
        if (msg) this.hud.toast(msg);
      },
      onCancel: (i) => this.world.cancelQueued('player', i),
      onBuildTurret: (id) => {
        const r = this.world.buildTurret('player', id);
        if (r === 'unaffordable') this.hud.toast('Not enough gold');
        else if (r === 'no-free-slot') this.hud.toast('No free turret slot');
      },
      onSellTurret: (slot) => this.world.sellTurret('player', slot),
      onBuySlot: () => {
        const r = this.world.buySlot('player');
        if (r === 'unaffordable') this.hud.toast('Not enough gold');
        else if (r === 'max-slots') this.hud.toast('All slots bought');
      },
      onAdvanceAge: () => this.world.advanceAge('player'),
      onRestart: () => this.startMatch(this.difficulty),
      onMainMenu: () => this.toMainMenu(),
      onPause: () => {
        if (this.mode === 'playing' && this.world.status === 'playing') this.pause();
      },
    });
    // Card portraits come from the same models the battlefield uses (player colours).
    this.hud.setPortraits(renderPortraits(assets, Object.values(this.world.content.units), TEAM_TINT.player));

    // Decode the gameplay soundtrack in the background so starting a match never stutters.
    void this.music.preload('age1');

    const post = this.renderer.post;
    this.menu = new Menu(document.body, {
      onPlay: (d) => this.startMatch(d),
      onResume: () => this.resume(),
      onRestart: () => this.startMatch(this.difficulty),
      onQuit: () => this.toMainMenu(),
      onQuality: (q) => post.setQuality(q),
      getQuality: () => post.setting,
      getVolume: (ch) => this.mixer.getVolume(ch),
      onVolume: (ch, v) => this.mixer.setVolume(ch, v),
    });

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.repeat) return;
      if (this.menu.isOpen) this.menu.escape();
      else if (this.mode === 'playing' && this.world.status === 'playing') this.pause();
    });

    if (startInMenu) this.toMainMenu();
    else {
      this.mode = 'playing';
      void this.music.play('age1');
    }
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  private attractWorld(): World {
    // Different seed per battle so the background fight doesn't repeat exactly.
    return new World({ difficulty: ATTRACT_PROFILE, autoPlayer: ATTRACT_PROFILE, seed: Math.floor(Math.random() * 1e9) });
  }

  private toMainMenu(): void {
    this.mode = 'menu';
    this.attractEndedFor = 0;
    this.world = this.attractWorld();
    this.renderer.setWorld(this.world);
    this.renderer.rig.setCinematic(true);
    this.hud.setActive(false);
    this.music.stop();
    this.menu.openMain();
  }

  private startMatch(difficulty: string): void {
    this.difficulty = difficulty;
    this.world = new World({ difficulty });
    this.renderer.setWorld(this.world);
    this.renderer.rig.setCinematic(false);
    this.menu.close();
    this.hud.setActive(true);
    this.mode = 'playing';
    this.matchOverHandled = false;
    // Age 1 gameplay music (the match always starts in age 1).
    void this.music.play('age1');
  }

  private pause(): void {
    this.mode = 'paused';
    this.hud.setActive(false);
    this.music.duck(true);
    this.menu.openPause();
  }

  private resume(): void {
    this.menu.close();
    this.hud.setActive(true);
    this.mode = 'playing';
    this.music.duck(false);
    this.last = performance.now();
  }

  private frame = (now: number): void => {
    const dt = Math.max(0, Math.min((now - this.last) / 1000, GAME.maxFrameDelta));
    this.last = now;

    if (this.mode !== 'paused') {
      this.accumulator += dt;
      while (this.accumulator >= GAME.fixedStep) {
        this.world.step(GAME.fixedStep);
        this.accumulator -= GAME.fixedStep;
      }
    } else {
      this.accumulator = 0;
    }
    this.world.drainEvents(this.bus.dispatch);

    // Match over: let the music fade out under the victory/defeat screen.
    if (this.mode === 'playing' && this.world.status !== 'playing' && !this.matchOverHandled) {
      this.matchOverHandled = true;
      this.music.stop(2.5);
    }

    // Background battle: when one side wins (or it drags on), start a fresh one after a short pause.
    if (this.mode === 'menu' && (this.world.status !== 'playing' || this.world.time > ATTRACT_MAX_TIME)) {
      this.attractEndedFor += dt;
      if (this.attractEndedFor > ATTRACT_RESTART_DELAY) {
        this.attractEndedFor = 0;
        this.world = this.attractWorld();
        this.renderer.setWorld(this.world);
      }
    }

    // Paused: keep rendering (fire, wind, clouds still move) but the battle is frozen.
    this.renderer.render(dt, this.mode === 'paused');
    if (this.mode === 'playing') this.hud.update(this.world, dt);
    requestAnimationFrame(this.frame);
  };
}
