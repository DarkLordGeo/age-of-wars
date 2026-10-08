import { createAssetLibrary } from './assets/manifest';
import { CONTENT } from './config/content';
import { GAME } from './config/game';
import { Game } from './game/Game';

async function boot(): Promise<void> {
  const assets = createAssetLibrary();
  await assets.preload();

  // Boots into the main menu. ?play=easy|normal|hard skips it straight into a match
  // (?difficulty= is still accepted as an alias).
  const params = new URLSearchParams(location.search);
  const requested = params.get('play') ?? params.get('difficulty');
  const difficulty = requested && requested in CONTENT.ai ? requested : GAME.defaultDifficulty;

  const game = new Game(document.getElementById('app')!, document.getElementById('hud')!, assets, difficulty, !requested);
  game.start();
  // Debug handle for manual poking in the console.
  (window as unknown as { game: Game }).game = game;
}

void boot();
