import { Vector3, type Camera } from 'three';
import type { EventBus } from '../game/EventBus';
import type { Team } from '../sim/types';
import { COIN } from '../ui/icons';

/** The reward text, exactly as the HUD shows it: "Coin 25 +". */
export function coinText(amount: number): string {
  return `Coin ${amount} +`;
}

/** Timing and layout of the floating reward indicators. */
export const REWARD_POPUP = {
  /** Seconds on screen; it fades in over `fadeIn` and out over the last `fadeOut`. */
  life: 1.6,
  fadeIn: 0.15,
  fadeOut: 0.6,
  /** Metres it floats up over its life. */
  rise: 0.9,
  /** Reused entries (the oldest is recycled if all are busy). */
  pool: 16,
  /** Rewards close in time and place stack this far apart (m) so each stays readable. */
  stagger: 0.45,
  staggerWindow: 0.6,
  staggerRadius: 2.5,
};

export interface RewardPopup {
  active: boolean;
  amount: number;
  text: string;
  /** World anchor (above the dying unit) and extra height from staggering. */
  x: number;
  y: number;
  z: number;
  lift: number;
  age: number;
  seq: number;
}

/** Pooled floating "Coin N +" indicators: pure state, drawn by RewardPopupsView. */
export class RewardPopups {
  readonly popups: RewardPopup[] = [];
  /** Indicators started so far (tests, debugging). */
  spawned = 0;

  constructor(private readonly cfg = REWARD_POPUP) {}

  spawn(amount: number, x: number, y: number, z: number): RewardPopup {
    const c = this.cfg;
    let p = this.popups.find((q) => !q.active);
    if (!p && this.popups.length < c.pool) this.popups.push((p = { active: false, amount: 0, text: '', x: 0, y: 0, z: 0, lift: 0, age: 0, seq: 0 }));
    if (!p) p = this.popups.reduce((a, b) => (b.seq < a.seq ? b : a)); // all busy: recycle the oldest
    // Stack above recent indicators nearby so simultaneous rewards do not overlap.
    let stack = 0;
    for (const q of this.popups) {
      if (q !== p && q.active && q.age < c.staggerWindow && Math.hypot(q.x - x, q.z - z) < c.staggerRadius) stack = Math.max(stack, q.lift / c.stagger + 1);
    }
    Object.assign(p, { active: true, amount, text: coinText(amount), x, y, z, lift: stack * c.stagger, age: 0, seq: ++this.spawned });
    return p;
  }

  /** Advance by `dt` (0 while paused); expired indicators go back to the pool. */
  update(dt: number): void {
    for (const p of this.popups) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= this.cfg.life) p.active = false;
    }
  }

  get active(): number {
    return this.popups.filter((p) => p.active).length;
  }

  /** 0..1: fades in, holds, fades out. */
  opacity(p: RewardPopup): number {
    const c = this.cfg;
    if (!p.active) return 0;
    return Math.max(0, Math.min(1, p.age / c.fadeIn, (c.life - p.age) / c.fadeOut));
  }

  /** Current world height of the indicator (eases upward). */
  height(p: RewardPopup): number {
    const k = Math.min(1, p.age / this.cfg.life);
    return p.y + p.lift + this.cfg.rise * (1 - (1 - k) * (1 - k));
  }

  clear(): void {
    for (const p of this.popups) p.active = false;
  }
}

/**
 * Show an indicator whenever a death credits coins to `team` (the player): the amount comes from
 * the sim's death event (the reward actually added), so nothing is recomputed or counted twice.
 * `where` gives the dying unit's drawn head position (null: no view, nothing shown).
 */
export function bindRewardPopups(
  bus: EventBus,
  popups: RewardPopups,
  where: (unitId: number) => { x: number; y: number; z: number } | null,
  team: Team = 'player',
): void {
  bus.on('death', (e) => {
    if (e.killerTeam !== team || e.gold <= 0) return;
    const at = where(e.unitId);
    if (at) popups.spawn(e.gold, at.x, at.y, at.z);
  });
}

const V = new Vector3();

/** Draws the indicators as a fixed set of absolutely positioned DOM elements over the canvas. */
export class RewardPopupsView {
  private readonly layer: HTMLDivElement;
  private readonly items: Array<{ el: HTMLDivElement; label: HTMLSpanElement }> = [];

  constructor(host: HTMLElement, size = REWARD_POPUP.pool) {
    this.layer = document.createElement('div');
    this.layer.className = 'reward-pops';
    host.appendChild(this.layer);
    for (let i = 0; i < size; i++) {
      const el = document.createElement('div');
      el.className = 'coin-pop';
      el.innerHTML = `<i class="coin">${COIN}</i><span></span>`;
      el.style.opacity = '0';
      this.layer.appendChild(el);
      this.items.push({ el, label: el.querySelector('span')! });
    }
  }

  sync(popups: RewardPopups, camera: Camera, width: number, height: number): void {
    for (let i = 0; i < this.items.length; i++) {
      const { el, label } = this.items[i]!;
      const p = popups.popups[i];
      const o = p ? popups.opacity(p) : 0;
      if (!p || o <= 0) {
        if (el.style.opacity !== '0') el.style.opacity = '0';
        continue;
      }
      V.set(p.x, popups.height(p), p.z).project(camera);
      if (V.z > 1) {
        el.style.opacity = '0'; // behind the camera
        continue;
      }
      if (label.textContent !== p.text) label.textContent = p.text;
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate(${((V.x + 1) / 2) * width}px, ${((1 - V.y) / 2) * height}px) translate(-50%, -100%)`;
    }
  }

  clear(): void {
    for (const { el } of this.items) el.style.opacity = '0';
  }
}
