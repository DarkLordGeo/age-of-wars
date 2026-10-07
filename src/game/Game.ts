import type { AssetLibrary } from '../assets/AssetLibrary';
import { bindAudio, PlaceholderSoundBank } from '../audio/AudioHooks';
import { GAME } from '../config/game';
import type { EnqueueResult } from '../sim/types';
import { GameRenderer } from '../render/GameRenderer';
import { World } from '../sim/World';
import { Hud } from '../ui/Hud';
import { EventBus } from './EventBus';

const ENQUEUE_MESSAGES: Partial<Record<EnqueueResult, string>> = {
  unaffordable: 'Not enough gold',
  locked: 'Unit not unlocked yet',
  'queue-full': 'Production queue is full',
};

/** Composition root: owns the World and wires sim → bus → (renderer, audio) and HUD → sim. */
export class Game {
  world: World;
  readonly bus = new EventBus();
  readonly sound = new PlaceholderSoundBank();
  private readonly renderer: GameRenderer;
  private readonly hud: Hud;
  private accumulator = 0;
  private last = performance.now();

  constructor(
    canvasHost: HTMLElement,
    hudHost: HTMLElement,
    readonly assets: AssetLibrary,
    private readonly difficulty: string,
  ) {
    this.world = new World({ difficulty });
    this.renderer = new GameRenderer(canvasHost, assets, this.bus);
    this.renderer.setWorld(this.world);
    bindAudio(this.bus, this.sound);

    this.hud = new Hud(hudHost, this.world.content, {
      onEnqueue: (id) => {
        const msg = ENQUEUE_MESSAGES[this.world.enqueueUnit('player', id)];
        if (msg) this.hud.toast(msg);
      },
      onCancel: (i) => this.world.cancelQueued('player', i),
      onUpgrade: (id) => {
        if (this.world.purchaseUpgrade('player', id) === 'unaffordable') this.hud.toast('Not enough gold');
      },
      onAdvanceAge: () => this.world.advanceAge('player'),
      onRestart: () => this.restart(),
      onToggleFollow: () => this.renderer.rig.toggleFollow(),
      onOverview: () => this.renderer.rig.toggleOverview(),
    });
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  private restart(): void {
    this.world = new World({ difficulty: this.difficulty });
    this.renderer.setWorld(this.world);
  }

  private frame = (now: number): void => {
    const dt = Math.min((now - this.last) / 1000, GAME.maxFrameDelta);
    this.last = now;

    this.accumulator += dt;
    while (this.accumulator >= GAME.fixedStep) {
      this.world.step(GAME.fixedStep);
      this.accumulator -= GAME.fixedStep;
    }
    this.world.drainEvents(this.bus.dispatch);

    this.renderer.render(dt);
    const rig = this.renderer.rig;
    this.hud.update(this.world, { follow: rig.followEnabled, overview: rig.overview }, dt);
    requestAnimationFrame(this.frame);
  };
}
