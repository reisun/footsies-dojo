import { FRAME_MS, CANVAS_W } from "./types";
import { InputHandler } from "./input";
import { Game } from "./game";
import { Renderer } from "./renderer";

const README_URL = "https://github.com/reisun/footsies-dojo#readme";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new InputHandler();
const game = new Game();

// Title click → open README
canvas.addEventListener("click", (e) => {
  if (game.screen !== "title") return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;
  // Title text area: centered at (CANVAS_W/2, 140), approx 500x60
  const titleW = 500;
  const titleH = 60;
  if (
    cx >= CANVAS_W / 2 - titleW / 2 &&
    cx <= CANVAS_W / 2 + titleW / 2 &&
    cy >= 140 - titleH / 2 &&
    cy <= 140 + titleH / 2
  ) {
    window.open(README_URL, "_blank");
  }
});

// Pointer cursor on title hover
canvas.addEventListener("mousemove", (e) => {
  if (game.screen !== "title") {
    canvas.style.cursor = "default";
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;
  const titleW = 500;
  const titleH = 60;
  if (
    cx >= CANVAS_W / 2 - titleW / 2 &&
    cx <= CANVAS_W / 2 + titleW / 2 &&
    cy >= 140 - titleH / 2 &&
    cy <= 140 + titleH / 2
  ) {
    canvas.style.cursor = "pointer";
  } else {
    canvas.style.cursor = "default";
  }
});

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
      game.updateBattle(input.getPlayerInput(game.player.facing));
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
