import type { Quality } from '../render/post';

export interface MenuHandlers {
  /** Start a new match against the given AI difficulty. */
  onPlay: (difficulty: string) => void;
  onResume: () => void;
  onRestart: () => void;
  /** Leave the match for the main menu (background battle resumes). */
  onQuit: () => void;
  onQuality: (q: Quality | 'auto') => void;
  getQuality: () => Quality | 'auto';
}

type Page = 'main' | 'play' | 'how' | 'options' | 'credits' | 'pause';

const DIFFICULTIES: Array<{ id: string; name: string; blurb: string }> = [
  { id: 'easy', name: 'Easy', blurb: 'Earns less gold and never buys upgrades.' },
  { id: 'normal', name: 'Normal', blurb: 'Same income as you; buys upgrades.' },
  { id: 'hard', name: 'Hard', blurb: 'Starts richer, earns 30% more and reacts fast.' },
];

const QUALITIES: Array<{ id: Quality | 'auto'; name: string; blurb: string }> = [
  { id: 'auto', name: 'Auto', blurb: 'Starts at High, steps down if the frame rate drops' },
  { id: 'high', name: 'High', blurb: 'Ambient occlusion, bloom, colour grade' },
  { id: 'medium', name: 'Medium', blurb: 'Bloom and colour grade, no ambient occlusion' },
  { id: 'low', name: 'Low', blurb: 'No post-processing' },
];

/**
 * Main menu and pause menu: a framed wooden panel over the live battle, which the page blurs
 * behind it (`backdrop-filter`). Main menu shows an AI-vs-AI fight; the pause menu shows the
 * frozen match.
 */
export class Menu {
  private readonly root: HTMLElement;
  private page: Page = 'main';
  private visible = false;

  constructor(
    host: HTMLElement,
    private readonly h: MenuHandlers,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    host.appendChild(this.root);
  }

  /** Esc while the menu is open: resume from pause, or go back one page. */
  escape(): void {
    if (!this.visible) return;
    if (this.page === 'pause') this.h.onResume();
    else if (this.page !== 'main') this.show(this.inGame ? 'pause' : 'main');
  }

  private inGame = false;

  get isOpen(): boolean {
    return this.visible;
  }

  /** Show the main menu (no match running). */
  openMain(): void {
    this.inGame = false;
    this.show('main');
  }

  /** Show the pause menu over a running match. */
  openPause(): void {
    this.inGame = true;
    this.show('pause');
  }

  close(): void {
    this.visible = false;
    this.root.classList.remove('show');
    document.body.classList.remove('menu-open');
  }

  private show(page: Page): void {
    this.page = page;
    this.visible = true;
    this.root.classList.add('show');
    document.body.classList.add('menu-open');
    this.root.innerHTML = `<div class="menu-panel wood">${this.render(page)}</div>`;
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-go]')) {
      el.addEventListener('click', () => this.act(el.dataset.go!));
    }
    this.root.querySelector<HTMLElement>('[data-go]')?.focus();
  }

  private act(go: string): void {
    const [cmd, arg] = go.split(':');
    switch (cmd) {
      case 'page':
        this.show(arg as Page);
        break;
      case 'play':
        this.h.onPlay(arg!);
        break;
      case 'resume':
        this.h.onResume();
        break;
      case 'restart':
        this.h.onRestart();
        break;
      case 'quit':
        this.h.onQuit();
        break;
      case 'quality':
        this.h.onQuality(arg as Quality | 'auto');
        this.show('options');
        break;
      case 'back':
        this.show(this.inGame ? 'pause' : 'main');
        break;
    }
  }

  private render(page: Page): string {
    const back = `<button class="mbtn ghost" data-go="back">Back</button>`;
    switch (page) {
      case 'main':
        return `
          <div class="title"><span class="t1">Age of Wars</span><span class="t2">Dawn of the Tribes</span></div>
          <div class="mlist">
            <button class="mbtn big" data-go="page:play">Start Game</button>
            <button class="mbtn" data-go="page:how">How to Play</button>
            <button class="mbtn" data-go="page:options">Options</button>
            <button class="mbtn" data-go="page:credits">Credits</button>
          </div>`;
      case 'pause':
        return `
          <div class="title small"><span class="t1">Paused</span></div>
          <div class="mlist">
            <button class="mbtn big" data-go="resume">Resume</button>
            <button class="mbtn" data-go="restart">Restart Match</button>
            <button class="mbtn" data-go="page:how">How to Play</button>
            <button class="mbtn" data-go="page:options">Options</button>
            <button class="mbtn" data-go="quit">Main Menu</button>
          </div>`;
      case 'play':
        return `
          <div class="title small"><span class="t1">Choose your foe</span></div>
          <div class="mlist">
            ${DIFFICULTIES.map((d) => `<button class="mbtn choice" data-go="play:${d.id}"><b>${d.name}</b><small>${d.blurb}</small></button>`).join('')}
            ${back}
          </div>`;
      case 'how':
        return `
          <div class="title small"><span class="t1">How to Play</span></div>
          <div class="mtext">
            <p>Destroy the enemy camp before they destroy yours.</p>
            <ul>
              <li><b>Train units</b> with the cards at the bottom or keys <kbd>1</kbd>-<kbd>3</kbd>. They march down the path and fight on their own.</li>
              <li><b>Gold</b> comes in over time and for every enemy you kill. <b>XP</b> from kills unlocks the Archer and the Brute.</li>
              <li><b>Upgrades</b> on the right make your units, walls and watchtower stronger.</li>
              <li>Click a unit in the <b>training queue</b> to cancel it and get your gold back.</li>
              <li><b>Camera:</b> <kbd>A</kbd>/<kbd>D</kbd> or drag to pan, mouse wheel to zoom, <kbd>F</kbd> follow the front, <kbd>O</kbd> overview.</li>
              <li><kbd>Esc</kbd> pauses the game.</li>
            </ul>
          </div>
          <div class="mlist">${back}</div>`;
      case 'options': {
        const cur = this.h.getQuality();
        return `
          <div class="title small"><span class="t1">Options</span></div>
          <div class="mtext"><p class="label">Graphics quality</p></div>
          <div class="mlist">
            ${QUALITIES.map((q) => `<button class="mbtn choice${q.id === cur ? ' on' : ''}" data-go="quality:${q.id}"><b>${q.name}</b><small>${q.blurb}</small></button>`).join('')}
            ${back}
          </div>`;
      }
      case 'credits':
        return `
          <div class="title small"><span class="t1">Credits</span></div>
          <div class="mtext">
            <p>A lane battler made with Three.js.</p>
            <ul>
              <li>Camps, watchtower, trees, gear and HUD: original procedural work for this game.</li>
              <li>Rocks, cliffs, plants and ground textures: <b>Poly Haven</b> artists (CC0).</li>
              <li>Cave rocks: <b>Ron Kapaun / 3TD Studios</b> (CC0).</li>
            </ul>
          </div>
          <div class="mlist">${back}</div>`;
    }
  }
}
