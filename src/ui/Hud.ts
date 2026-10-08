import { GAME } from '../config/game';
import type { Content } from '../config/schema';
import { currentAge } from '../sim/progression';
import type { World } from '../sim/World';
import { ICONS } from './icons';

export interface HudHandlers {
  onEnqueue: (unitId: string) => void;
  onCancel: (queueIndex: number) => void;
  onBuildTurret: (turretId: string) => void;
  onSellTurret: (slot: number) => void;
  onBuySlot: () => void;
  onAdvanceAge: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  /** Open the pause menu. */
  onPause: () => void;
}

type Row = 'main' | 'units' | 'turrets' | 'sell';
const ROW_TITLE: Record<Row, string> = { main: 'Menu', units: 'Units', turrets: 'Turrets', sell: 'Sell turret' };

const REFRESH_HZ = 15;

const setText = (el: HTMLElement, s: string): void => {
  if (el.textContent !== s) el.textContent = s;
};

/**
 * In-game HUD, laid out like the classic lane battler:
 * - top-left plank: gold and XP;
 * - top-centre: training progress bar + one square per queue slot (click a filled square to cancel);
 * - top-right "Menu" plank: framed icon buttons (Units, Upgrades, Evolve, Pause). Units/Upgrades
 *   swap the row to their buttons with a Back button; hovering shows name and price;
 * - base health as vertical bars on the left (you) and right (enemy) screen edges.
 * Reads the World; acts only through handlers. Hidden while a menu is open.
 */
export class Hud {
  private readonly q: <T extends HTMLElement>(id: string) => T;
  private readonly unitBtns = new Map<string, HTMLButtonElement>();
  private readonly turretBtns = new Map<string, HTMLButtonElement>();
  private readonly sellBtns: HTMLButtonElement[] = [];
  private readonly slots: HTMLElement[] = [];
  private readonly unitOrder: string[];
  private readonly turretOrder: string[];
  private portraits: Record<string, string> = {};
  private sinceRefresh = 1;
  /** Last world seen by update(), for tooltips. */
  private world0: World | null = null;
  private toastTimer = 0;
  /** False while a menu is open: the HUD is hidden and ignores hotkeys. */
  private active = true;

  constructor(
    private readonly root: HTMLElement,
    private readonly content: Content,
    handlers: HudHandlers,
  ) {
    this.unitOrder = Object.keys(content.units);
    this.turretOrder = Object.keys(content.turrets);
    root.innerHTML = `
      <div class="topbar">
      <div class="plank purse">
        <div class="gold"><i class="coin"></i><span data-id="gold"></span></div>
        <div class="exp">Exp: <b data-id="xp"></b><small data-id="xpnext"></small></div>
        <div class="age" data-id="age"></div>
      </div>
      <div class="train">
        <div class="trainbar"><div data-id="progress"></div><span data-id="training"></span></div>
        <div class="squares" data-id="queue"></div>
      </div>
      <div class="plank menu-plank">
        <div class="menu-title" data-id="menutitle">Menu</div>
        <div class="menu-row" data-id="row-main">
          <button class="ibtn" data-id="cat-units">${ICONS.units}</button>
          <button class="ibtn" data-id="cat-turrets">${ICONS.turret}</button>
          <button class="ibtn" data-id="cat-sell">${ICONS.sell}</button>
          <button class="ibtn" data-id="slot">${ICONS.slot}</button>
          <button class="ibtn" data-id="evolve">${ICONS.evolve}</button>
          <button class="ibtn" data-id="pause">${ICONS.pause}</button>
        </div>
        <div class="menu-row" data-id="row-units" hidden></div>
        <div class="menu-row" data-id="row-turrets" hidden></div>
        <div class="menu-row" data-id="row-sell" hidden></div>
        <div class="tip" data-id="tip"></div>
      </div>
      </div>
      <div class="hpbar player"><div class="fill" data-id="pf"></div><span data-id="pt"></span></div>
      <div class="hpbar enemy"><div class="fill" data-id="ef"></div><span data-id="et"></span></div>
      <div class="toast" data-id="toast"></div>
      <div class="overlay" data-id="overlay"><h1 data-id="title"></h1>
        <div class="overlay-actions"><button class="btn" data-id="restart">Play again</button>
        <button class="btn" data-id="mainmenu">Main menu</button></div></div>`;
    this.q = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-id="${id}"]`)!;

    const tip = (el: HTMLElement, text: () => string): void => {
      el.addEventListener('mouseenter', () => {
        el.dataset.hover = '1';
        setText(this.q('tip'), text());
      });
      el.addEventListener('mouseleave', () => {
        delete el.dataset.hover;
        setText(this.q('tip'), '');
      });
    };

    // Category row
    this.q('cat-units').addEventListener('click', () => this.showRow('units'));
    this.q('cat-turrets').addEventListener('click', () => this.showRow('turrets'));
    this.q('cat-sell').addEventListener('click', () => this.showRow('sell'));
    this.q('slot').addEventListener('click', () => handlers.onBuySlot());
    this.q('evolve').addEventListener('click', () => handlers.onAdvanceAge());
    this.q('pause').addEventListener('click', () => handlers.onPause());
    tip(this.q('cat-units'), () => 'Train units');
    tip(this.q('cat-turrets'), () => 'Build turrets');
    tip(this.q('cat-sell'), () => 'Sell a turret (50% refund)');
    tip(this.q('slot'), () => this.slotTip());
    tip(this.q('evolve'), () => this.evolveTip());
    tip(this.q('pause'), () => 'Menu (Esc)');

    // Units row
    const unitsRow = this.q('row-units');
    this.unitOrder.forEach((id, i) => {
      const def = content.units[id]!;
      const btn = document.createElement('button');
      btn.className = 'ibtn unit';
      btn.innerHTML = `<span class="glyph">${def.name[0]}</span><img alt="" hidden><span class="hk">${i + 1}</span><span class="lock">🔒</span>`;
      btn.addEventListener('click', () => handlers.onEnqueue(id));
      tip(btn, () => this.unitTip(id));
      unitsRow.appendChild(btn);
      this.unitBtns.set(id, btn);
    });
    unitsRow.appendChild(this.backButton(tip));

    // Turrets row (builds into the first free slot)
    const turRow = this.q('row-turrets');
    for (const id of this.turretOrder) {
      const def = content.turrets[id]!;
      const btn = document.createElement('button');
      btn.className = 'ibtn upgrade';
      btn.innerHTML = `${ICONS.turret}<span class="hk">${def.name.split(' ').map((w) => w[0]).join('')}</span>`;
      btn.addEventListener('click', () => handlers.onBuildTurret(id));
      tip(btn, () => `${def.name} - ${def.cost} gold`);
      turRow.appendChild(btn);
      this.turretBtns.set(id, btn);
    }
    turRow.appendChild(this.backButton(tip));

    // Sell row: one button per slot
    const sellRow = this.q('row-sell');
    for (let s = 0; s < GAME.slotCosts.length + 1; s++) {
      const btn = document.createElement('button');
      btn.className = 'ibtn upgrade';
      btn.innerHTML = `${ICONS.sell}<span class="hk">${s + 1}</span>`;
      btn.addEventListener('click', () => handlers.onSellTurret(s));
      tip(btn, () => this.sellTip(s));
      sellRow.appendChild(btn);
      this.sellBtns.push(btn);
    }
    sellRow.appendChild(this.backButton(tip));
    this.world0 = null;

    // Training queue squares
    const queueEl = this.q('queue');
    for (let i = 0; i < GAME.economy.queueSize; i++) {
      const slot = document.createElement('div');
      slot.className = 'sq';
      slot.innerHTML = '<img alt="" hidden>';
      slot.addEventListener('click', () => handlers.onCancel(i));
      queueEl.appendChild(slot);
      this.slots.push(slot);
    }

    this.q('restart').addEventListener('click', () => handlers.onRestart());
    this.q('mainmenu').addEventListener('click', () => handlers.onMainMenu());

    window.addEventListener('keydown', (e) => {
      if (e.repeat || !this.active) return;
      const digit = /^Digit([1-9])$/.exec(e.code);
      const id = digit ? this.unitOrder[Number(digit[1]) - 1] : undefined;
      if (id) handlers.onEnqueue(id);
    });
    this.showRow('units');
  }

  private backButton(tip: (el: HTMLElement, text: () => string) => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'ibtn back';
    b.innerHTML = ICONS.back;
    b.addEventListener('click', () => this.showRow('main'));
    tip(b, () => 'Back');
    return b;
  }

  private showRow(row: Row): void {
    this.q('row-main').hidden = row !== 'main';
    this.q('row-units').hidden = row !== 'units';
    this.q('row-turrets').hidden = row !== 'turrets';
    this.q('row-sell').hidden = row !== 'sell';
    setText(this.q('menutitle'), ROW_TITLE[row]);
    setText(this.q('tip'), '');
    this.sinceRefresh = 1;
  }

  private unitTip(id: string): string {
    const def = this.content.units[id]!;
    return `${def.name} - ${def.cost} gold, ${def.spawnTime}s`;
  }

  private slotTip(): string {
    const cost = this.world0?.nextSlotCost('player');
    return cost == null ? 'All turret slots bought' : `Add turret slot - ${cost} gold`;
  }

  private evolveTip(): string {
    const need = this.world0?.xpToEvolve('player');
    return need == null ? 'Final age reached' : `Evolve (${need} XP)`;
  }

  private sellTip(slot: number): string {
    const t = this.world0?.bases.player.turrets[slot];
    if (!t) return `Slot ${slot + 1}: empty`;
    return `Sell ${t.def.name} - +${Math.floor(t.def.cost * GAME.turretSellRefund)} gold`;
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
  update(world: World, dt: number): void {
    this.toastTimer = Math.max(0, this.toastTimer - dt);
    if (this.toastTimer === 0) setText(this.q('toast'), '');
    this.sinceRefresh += dt;
    if (this.sinceRefresh < 1 / REFRESH_HZ) return;
    this.sinceRefresh = 0;

    this.world0 = world;
    const c = this.content;
    const me = world.teams.player;
    const { player, enemy } = world.bases;
    const playing = world.status === 'playing';

    // Purse
    const need = world.xpToEvolve('player');
    setText(this.q('gold'), String(Math.floor(me.gold)));
    setText(this.q('xp'), String(Math.floor(me.xp)));
    setText(this.q('xpnext'), need != null ? ` / ${need}` : '');
    setText(this.q('age'), currentAge(c, me).name);

    // Base health (vertical bars)
    this.q('pf').style.height = `${Math.max(0, player.health / player.maxHealth) * 100}%`;
    this.q('ef').style.height = `${Math.max(0, enemy.health / enemy.maxHealth) * 100}%`;
    setText(this.q('pt'), String(Math.max(0, Math.ceil(player.health))));
    setText(this.q('et'), String(Math.max(0, Math.ceil(enemy.health))));

    // Training bar + queue squares
    const head = me.queue[0];
    this.q('progress').style.width = head ? `${(1 - head.remaining / head.total) * 100}%` : '0%';
    setText(this.q('training'), head ? `Training ${c.units[head.defId]!.name}` : '');
    this.slots.forEach((slot, i) => {
      const item = me.queue[i];
      const img = slot.firstElementChild as HTMLImageElement;
      const src = item ? this.portraits[item.defId] : undefined;
      if (src && img.getAttribute('src') !== src) img.src = src;
      img.hidden = !src;
      slot.classList.toggle('filled', !!item);
      slot.title = item ? `${c.units[item.defId]!.name} (click to cancel)` : '';
    });

    // Menu buttons
    const evolve = this.q<HTMLButtonElement>('evolve');
    evolve.disabled = !world.canAdvanceAge('player');

    for (const [id, btn] of this.unitBtns) {
      const def = c.units[id]!;
      const unlocked = world.unitUnlocked('player', id);
      btn.classList.toggle('locked', !unlocked);
      btn.classList.toggle('poor', unlocked && me.gold < def.cost);
      btn.disabled = !playing || !unlocked || me.gold < def.cost || me.queue.length >= GAME.economy.queueSize;
    }
    const base = world.bases.player;
    const freeSlot = base.turrets.slice(0, base.slots).some((t) => !t);
    for (const [id, btn] of this.turretBtns) {
      const def = c.turrets[id]!;
      btn.classList.toggle('poor', me.gold < def.cost);
      btn.disabled = !playing || !freeSlot || me.gold < def.cost;
    }
    this.sellBtns.forEach((btn, s) => {
      btn.hidden = s >= base.slots;
      btn.disabled = !playing || !base.turrets[s];
    });
    const slotCost = world.nextSlotCost('player');
    this.q<HTMLButtonElement>('slot').disabled = !playing || slotCost == null || me.gold < slotCost;

    const overlay = this.q('overlay');
    overlay.classList.toggle('show', !playing);
    setText(this.q('title'), world.status === 'victory' ? 'Victory' : 'Defeat');
  }
}
