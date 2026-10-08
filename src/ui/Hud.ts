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
  onMainMenu: () => void;
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
  private portraits: Record<string, string> = {};
  private readonly upgradeBtns = new Map<string, { btn: HTMLButtonElement; age: number }>();
  private readonly slots: HTMLElement[] = [];
  private readonly unitOrder: string[];
  private sinceRefresh = 1;
  /** False while a menu is open: the HUD is hidden and ignores hotkeys. */
  private active = true;
  private toastTimer = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly content: Content,
    handlers: HudHandlers,
  ) {
    this.unitOrder = Object.keys(content.units);
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-base player wood">
          <div class="hud-label">Your camp <span data-id="pt"></span></div>
          <div class="bar"><div data-id="pf"></div></div>
        </div>
        <div class="hud-center wood lashed">
          <div data-id="age" class="age"></div>
          <div class="res"><b><i class="coin"></i><span data-id="gold"></span></b><b class="xp" data-id="xp"></b></div>
          <div data-id="info" class="dim"></div>
        </div>
        <div class="hud-base enemy wood">
          <div class="hud-label">Enemy camp <span data-id="et"></span></div>
          <div class="bar"><div data-id="ef"></div></div>
        </div>
      </div>
      <div class="toast" data-id="toast"></div>
      <div class="panel right wood">
        <button class="btn small" data-id="advance"></button>
        <div class="panel-title">Upgrades</div>
        <div data-id="upgrades" class="upgrades"></div>
      </div>
      <div class="hud-bottom">
        <div class="queue wood" data-id="queue"><span class="label">Training</span></div>
        <div class="tray wood lashed" data-id="units"></div>
      </div>
      <div class="panel left">
        <button class="btn small" data-id="follow"></button>
        <button class="btn small" data-id="overview"></button>
        <div class="hint">A/D or drag: pan · wheel: zoom<br>1-${this.unitOrder.length}: train · click queue slot: cancel</div>
      </div>
      <div class="overlay" data-id="overlay"><h1 data-id="title"></h1>
        <div class="overlay-actions"><button class="btn" data-id="restart">Play again</button>
        <button class="btn" data-id="mainmenu">Main menu</button></div></div>`;
    this.q = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-id="${id}"]`)!;

    const unitsEl = this.q('units');
    this.unitOrder.forEach((id, i) => {
      const def = content.units[id]!;
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.innerHTML = `
        <span class="frame"><span class="glyph">${def.name[0]}</span><img alt="" hidden>
          <span class="hotkey">${i + 1}</span><span class="time">${def.spawnTime}s</span>
          <span class="lock"><i>🔒</i><span data-l></span></span></span>
        <span class="name">${def.name}</span>
        <span class="cost"><i class="coin"></i>${def.cost}</span>`;
      btn.addEventListener('click', () => handlers.onEnqueue(id));
      unitsEl.appendChild(btn);
      this.unitBtns.set(id, btn);
      btn.dataset.hotkey = String(i + 1);
    });

    const queueEl = this.q('queue');
    for (let i = 0; i < GAME.economy.queueSize; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.innerHTML = '<img alt="" hidden><i></i>';
      slot.addEventListener('click', () => handlers.onCancel(i));
      queueEl.appendChild(slot);
      this.slots.push(slot);
    }

    const upEl = this.q('upgrades');
    content.ages.forEach((age, ageIndex) => {
      for (const id of age.upgrades) {
        const btn = document.createElement('button');
        btn.className = 'btn small upgrade';
        btn.innerHTML = '<span></span><b></b>';
        btn.addEventListener('click', () => handlers.onUpgrade(id));
        upEl.appendChild(btn);
        this.upgradeBtns.set(id, { btn, age: ageIndex });
      }
    });

    this.q('advance').addEventListener('click', () => handlers.onAdvanceAge());
    this.q('follow').addEventListener('click', () => handlers.onToggleFollow());
    this.q('overview').addEventListener('click', () => handlers.onOverview());
    this.q('restart').addEventListener('click', () => handlers.onRestart());
    this.q('mainmenu').addEventListener('click', () => handlers.onMainMenu());

    window.addEventListener('keydown', (e) => {
      if (e.repeat || !this.active) return;
      const digit = /^Digit([1-9])$/.exec(e.code);
      const id = digit ? this.unitOrder[Number(digit[1]) - 1] : undefined;
      if (id) handlers.onEnqueue(id);
      else if (e.code === 'KeyF') handlers.onToggleFollow();
      else if (e.code === 'KeyO') handlers.onOverview();
    });
  }

  /** Show/hide the HUD (hidden while the main or pause menu is open). */
  setActive(active: boolean): void {
    this.active = active;
    this.root.classList.toggle('hidden', !active);
  }

  /** Unit portraits (data URLs by unit id), rendered once the models are loaded. */
  setPortraits(portraits: Record<string, string>): void {
    this.portraits = portraits;
    for (const [id, btn] of this.unitBtns) {
      const src = portraits[id];
      if (!src) continue;
      const img = btn.querySelector('img')!;
      img.src = src;
      img.hidden = false;
      (btn.querySelector('.glyph') as HTMLElement).hidden = true;
    }
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
    setText(this.q('gold'), String(Math.floor(me.gold)));
    setText(this.q('xp'), `XP ${Math.floor(me.xp)}` + (next ? ` / ${next.xpRequired}` : ''));
    setText(this.q('info'), `Units ${world.alive.player.length} vs ${world.alive.enemy.length}  ·  ${Math.floor(world.time)}s`);

    const playing = world.status === 'playing';
    this.unitOrder.forEach((id) => {
      const def = c.units[id]!;
      const btn = this.unitBtns.get(id)!;
      const unlockXp = unitUnlockXp(c, me, id);
      const unlocked = world.unitUnlocked('player', id);
      btn.classList.toggle('locked', !unlocked);
      btn.classList.toggle('poor', unlocked && me.gold < def.cost);
      setText(btn.querySelector<HTMLElement>('[data-l]')!, `${unlockXp ?? '?'} XP`);
      btn.title = unlocked ? `${def.name}: ${def.cost} gold, ${def.spawnTime}s to train` : `${def.name}: unlocks at ${unlockXp ?? '?'} XP`;
      btn.disabled = !playing || !unlocked || me.gold < def.cost || me.queue.length >= GAME.economy.queueSize;
    });

    this.slots.forEach((slot, i) => {
      const item = me.queue[i];
      const img = slot.firstElementChild as HTMLImageElement;
      const prog = slot.lastElementChild as HTMLElement;
      const src = item ? this.portraits[item.defId] : undefined;
      if (src && img.getAttribute('src') !== src) img.src = src;
      img.hidden = !src;
      slot.title = item ? `${c.units[item.defId]!.name} (click to cancel)` : '';
      slot.classList.toggle('filled', !!item);
      // first slot: radial progress; waiting slots stay dimmed
      const p = !item ? 100 : i === 0 ? (1 - item.remaining / item.total) * 100 : 0;
      prog.style.setProperty('--p', `${p}%`);
    });

    const advance = this.q<HTMLButtonElement>('advance');
    setText(advance, next ? `Advance to ${next.name} (${next.xpRequired} XP)` : 'Max age reached');
    advance.disabled = !world.canAdvanceAge('player');

    for (const [id, { btn, age: ageIndex }] of this.upgradeBtns) {
      const up = c.upgrades[id]!;
      btn.hidden = ageIndex > me.ageIndex;
      const owned = me.upgrades.has(id);
      setText(btn.firstElementChild as HTMLElement, owned ? `✓ ${up.name}` : up.name);
      const price = btn.lastElementChild as HTMLElement;
      if (owned) setText(price, '');
      else if (price.dataset.cost !== String(up.cost)) {
        price.dataset.cost = String(up.cost);
        price.innerHTML = `<i class="coin"></i>${up.cost}`;
      }
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
