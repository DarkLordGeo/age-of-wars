import { GAME } from '../config/game';
import type { Content } from '../config/schema';
import { currentAge, nextAge, unitUnlockXp } from '../sim/progression';
import type { World } from '../sim/World';

export interface HudHandlers {
  onEnqueue: (unitId: string) => void;
  onCancel: (queueIndex: number) => void;
  onUpgrade: (upgradeId: string) => void;
  onAdvanceAge: () => void;
  onRestart: () => void;
  onToggleFollow: () => void;
  onOverview: () => void;
}

export interface CameraState {
  follow: boolean;
  overview: boolean;
}

const REFRESH_HZ = 15;

const setText = (el: HTMLElement, s: string): void => {
  if (el.textContent !== s) el.textContent = s;
};

/** DOM overlay generated from content data. Reads the World; acts only through handlers. */
export class Hud {
  private readonly q: <T extends HTMLElement>(id: string) => T;
  private readonly unitBtns = new Map<string, HTMLButtonElement>();
  private readonly upgradeBtns = new Map<string, { btn: HTMLButtonElement; age: number }>();
  private readonly slots: HTMLElement[] = [];
  private readonly unitOrder: string[];
  private sinceRefresh = 1;
  private toastTimer = 0;

  constructor(
    root: HTMLElement,
    private readonly content: Content,
    handlers: HudHandlers,
  ) {
    this.unitOrder = Object.keys(content.units);
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-base player">
          <div class="hud-label">Your base <span data-id="pt"></span></div>
          <div class="bar"><div data-id="pf"></div></div>
        </div>
        <div class="hud-center">
          <div data-id="age" class="age"></div>
          <div data-id="res"></div>
          <div data-id="info" class="dim"></div>
        </div>
        <div class="hud-base enemy">
          <div class="hud-label">Enemy base <span data-id="et"></span></div>
          <div class="bar"><div data-id="ef"></div></div>
        </div>
      </div>
      <div class="toast" data-id="toast"></div>
      <div class="panel right">
        <button class="btn small" data-id="advance"></button>
        <div class="panel-title">Upgrades</div>
        <div data-id="upgrades"></div>
      </div>
      <div class="hud-bottom">
        <div class="queue" data-id="queue"></div>
        <div class="units" data-id="units"></div>
      </div>
      <div class="panel left">
        <button class="btn small" data-id="follow"></button>
        <button class="btn small" data-id="overview"></button>
        <div class="hint">A/D or drag: pan · wheel: zoom<br>1-${this.unitOrder.length}: train · click queue slot: cancel</div>
      </div>
      <div class="overlay" data-id="overlay"><h1 data-id="title"></h1>
        <button class="btn" data-id="restart">Play again</button></div>`;
    this.q = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-id="${id}"]`)!;

    const unitsEl = this.q('units');
    this.unitOrder.forEach((id, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn unit';
      btn.addEventListener('click', () => handlers.onEnqueue(id));
      unitsEl.appendChild(btn);
      this.unitBtns.set(id, btn);
      btn.dataset.hotkey = String(i + 1);
    });

    const queueEl = this.q('queue');
    for (let i = 0; i < GAME.economy.queueSize; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.innerHTML = '<span></span><i></i>';
      slot.addEventListener('click', () => handlers.onCancel(i));
      queueEl.appendChild(slot);
      this.slots.push(slot);
    }

    const upEl = this.q('upgrades');
    content.ages.forEach((age, ageIndex) => {
      for (const id of age.upgrades) {
        const btn = document.createElement('button');
        btn.className = 'btn small upgrade';
        btn.addEventListener('click', () => handlers.onUpgrade(id));
        upEl.appendChild(btn);
        this.upgradeBtns.set(id, { btn, age: ageIndex });
      }
    });

    this.q('advance').addEventListener('click', () => handlers.onAdvanceAge());
    this.q('follow').addEventListener('click', () => handlers.onToggleFollow());
    this.q('overview').addEventListener('click', () => handlers.onOverview());
    this.q('restart').addEventListener('click', () => handlers.onRestart());

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const digit = /^Digit([1-9])$/.exec(e.code);
      const id = digit ? this.unitOrder[Number(digit[1]) - 1] : undefined;
      if (id) handlers.onEnqueue(id);
      else if (e.code === 'KeyF') handlers.onToggleFollow();
      else if (e.code === 'KeyO') handlers.onOverview();
    });
  }

  toast(message: string): void {
    setText(this.q('toast'), message);
    this.toastTimer = 1.6;
  }

  /** `dt` is real elapsed seconds; DOM is refreshed at REFRESH_HZ and only where text changed. */
  update(world: World, cam: CameraState, dt: number): void {
    this.toastTimer = Math.max(0, this.toastTimer - dt);
    if (this.toastTimer === 0) setText(this.q('toast'), '');
    this.sinceRefresh += dt;
    if (this.sinceRefresh < 1 / REFRESH_HZ) return;
    this.sinceRefresh = 0;

    const c = this.content;
    const me = world.teams.player;
    const { player, enemy } = world.bases;

    this.q('pf').style.width = `${(player.health / player.maxHealth) * 100}%`;
    this.q('ef').style.width = `${(enemy.health / enemy.maxHealth) * 100}%`;
    setText(this.q('pt'), `${Math.ceil(player.health)} / ${player.maxHealth}`);
    setText(this.q('et'), `${Math.ceil(enemy.health)} / ${enemy.maxHealth}`);

    const age = currentAge(c, me);
    const next = nextAge(c, me);
    setText(this.q('age'), age.name);
    setText(this.q('res'), `Gold ${Math.floor(me.gold)}  ·  XP ${Math.floor(me.xp)}` + (next ? ` / ${next.xpRequired}` : ' (max age)'));
    setText(this.q('info'), `Units ${world.alive.player.length} vs ${world.alive.enemy.length}  ·  ${Math.floor(world.time)}s`);

    const playing = world.status === 'playing';
    this.unitOrder.forEach((id, i) => {
      const def = c.units[id]!;
      const btn = this.unitBtns.get(id)!;
      const unlockXp = unitUnlockXp(c, me, id);
      const unlocked = world.unitUnlocked('player', id);
      const label = unlocked
        ? `[${i + 1}] ${def.name} · ${def.cost}g · ${def.spawnTime}s`
        : `[${i + 1}] ${def.name} · unlocks at ${unlockXp ?? '?'} XP`;
      setText(btn, label);
      btn.disabled = !playing || !unlocked || me.gold < def.cost || me.queue.length >= GAME.economy.queueSize;
    });

    this.slots.forEach((slot, i) => {
      const item = me.queue[i];
      const label = slot.firstElementChild as HTMLElement;
      const prog = slot.lastElementChild as HTMLElement;
      setText(label, item ? c.units[item.defId]!.name : '');
      slot.classList.toggle('filled', !!item);
      prog.style.width = item && i === 0 ? `${(1 - item.remaining / item.total) * 100}%` : '0%';
    });

    const advance = this.q<HTMLButtonElement>('advance');
    setText(advance, next ? `Advance to ${next.name} (${next.xpRequired} XP)` : 'Max age reached');
    advance.disabled = !world.canAdvanceAge('player');

    for (const [id, { btn, age: ageIndex }] of this.upgradeBtns) {
      const up = c.upgrades[id]!;
      btn.hidden = ageIndex > me.ageIndex;
      const owned = me.upgrades.has(id);
      setText(btn, owned ? `✓ ${up.name}` : `${up.name} · ${up.cost}g`);
      btn.title = up.description;
      btn.disabled = !playing || owned || me.gold < up.cost;
    }

    setText(this.q('follow'), `Follow front [F]: ${cam.follow ? 'on' : 'off'}`);
    setText(this.q('overview'), `Overview [O]: ${cam.overview ? 'on' : 'off'}`);

    const overlay = this.q('overlay');
    overlay.classList.toggle('show', !playing);
    setText(this.q('title'), world.status === 'victory' ? 'Victory' : 'Defeat');
  }
}
