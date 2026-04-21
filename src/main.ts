import { FRAME_MS } from "./types";
import { InputHandler } from "./input";
import { Game } from "./game";
import { Renderer } from "./renderer";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new InputHandler();
const game = new Game();

let lastTime = 0;
let accumulator = 0;

function gameLoop(timestamp: number): void {
  const delta = timestamp - lastTime;
  lastTime = timestamp;
  accumulator += delta;

  // Fixed timestep updates
  while (accumulator >= FRAME_MS) {
    accumulator -= FRAME_MS;
    update();
  }

  render();
  requestAnimationFrame(gameLoop);
}

function update(): void {
  input.update();

  // Toggle hitboxes
  if (input.wasPressed("h")) {
    game.showHitboxes = !game.showHitboxes;
  }

  switch (game.screen) {
    case "title":
      game.handleTitleInput((key) => input.wasPressed(key));
      break;

    case "battle":
      game.updateBattle(input.getPlayerInput());
      break;

    case "result":
      game.handleResultInput((key) => input.wasPressed(key));
      break;
  }
}

function render(): void {
  renderer.clear();

  switch (game.screen) {
    case "title":
      renderer.drawTitleScreen(game.selectedDifficulty);
      break;

    case "battle":
      renderer.drawBackground();
      renderer.drawFighter(game.player, "#4488cc", game.showHitboxes, false);
      renderer.drawFighter(game.cpu, "#cc4444", game.showHitboxes, true);
      renderer.drawHUD(game);
      if (game.roundMessage) {
        renderer.drawRoundMessage(game.roundMessage);
      }
      break;

    case "result":
      renderer.drawBackground();
      renderer.drawFighter(game.player, "#4488cc", false, false);
      renderer.drawFighter(game.cpu, "#cc4444", false, true);
      renderer.drawHUD(game);
      renderer.drawResultScreen(game.matchWinner === "player");
      break;
  }
}

// Start
requestAnimationFrame((ts) => {
  lastTime = ts;
  requestAnimationFrame(gameLoop);
});
