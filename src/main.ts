import { createAssetLibrary } from './assets/manifest';
import { CONTENT } from './config/content';
import { GAME } from './config/game';
import { Game } from './game/Game';

async function boot(): Promise<void> {
  const assets = createAssetLibrary();
  await assets.preload();

  // ?difficulty=easy|normal|hard
  const requested = new URLSearchParams(location.search).get('difficulty') ?? GAME.defaultDifficulty;
  const difficulty = requested in CONTENT.ai ? requested : GAME.defaultDifficulty;

  const game = new Game(document.getElementById('app')!, document.getElementById('hud')!, assets, difficulty);
  game.start();
  // Debug handle for manual poking in the console.
  (window as unknown as { game: Game }).game = game;
}

void boot();
