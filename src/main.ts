import { FRAME_MS, InputState } from "./types";
import { InputHandler } from "./input";
import { Game } from "./game";
import { Renderer } from "./renderer";
import { NetworkClient } from "./network";

document.getElementById("how-to-play")?.addEventListener("click", (e) => {
  (e.target as HTMLElement).blur();
});

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new InputHandler();
const game = new Game();

// --- Online networking ---

// Online state managed here (outside Game for separation)
let onlineState: "idle" | "creating" | "waiting" | "joining" | "ready" | "playing" | "disconnected" = "idle";
let roomCode = "";
let joinCode = "";
let onlineMessage = "";
let onlineError = "";
let lobbySelection = 0; // 0=Create, 1=Join
let myPlayerNumber: 1 | 2 = 1;

// Input sync for online
const INPUT_DELAY = 3;
const localInputBuffer = new Map<number, InputState>();
const remoteInputBuffer = new Map<number, InputState>();
let onlineGameFrame = 0;

let network: NetworkClient | null = null;

function emptyInput(): InputState {
  return { left: false, right: false, down: false, dash: false, light: false, medium: false, heavy: false };
}

function initNetwork(): NetworkClient {
  if (network) {
    network.disconnect();
  }
  const net = new NetworkClient({
    onRoomCreated: (code) => {
      roomCode = code;
      onlineState = "waiting";
      onlineMessage = "";
      onlineError = "";
    },
    onRoomJoined: (code, player) => {
      roomCode = code;
      myPlayerNumber = player;
    },
    onOpponentJoined: () => {
      onlineMessage = "OPPONENT FOUND!";
    },
    onGameStart: (player, _seed) => {
      myPlayerNumber = player;
      onlineState = "playing";
      onlineMessage = "";
      onlineGameFrame = 0;
      localInputBuffer.clear();
      remoteInputBuffer.clear();
      game.startOnlineBattle(player);
    },
    onRemoteInput: (frame, inputData) => {
      remoteInputBuffer.set(frame, inputData);
    },
    onOpponentDisconnected: () => {
      onlineState = "disconnected";
      onlineMessage = "OPPONENT DISCONNECTED";
    },
    onError: (msg) => {
      onlineError = msg;
    },
  });
  network = net;
  return net;
}

// --- Game loop ---

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
      // If game switched to online_lobby, init network
      if ((game.screen as string) === "online_lobby") {
        onlineState = "idle";
        roomCode = "";
        joinCode = "";
        onlineMessage = "";
        onlineError = "";
        lobbySelection = 0;
      }
      break;

    case "online_lobby":
      handleOnlineLobby();
      break;

    case "online_waiting":
      handleOnlineWaiting();
      break;

    case "online_join":
      handleOnlineJoin();
      break;

    case "battle":
      if (game.gameMode === "online") {
        handleOnlineBattle();
      } else {
        game.updateBattle(input.getPlayerInput(game.player.facing));
      }
      break;

    case "result":
      handleResult();
      break;
  }
}

function handleOnlineLobby(): void {
  if (input.wasPressed("escape")) {
    game.screen = "title";
    if (network) {
      network.disconnect();
      network = null;
    }
    onlineState = "idle";
    return;
  }

  if (input.wasPressed("w") || input.wasPressed("arrowup")) {
    lobbySelection = 0;
  }
  if (input.wasPressed("s") || input.wasPressed("arrowdown")) {
    lobbySelection = 1;
  }

  if (input.wasPressed("enter") || input.wasPressed("j")) {
    if (lobbySelection === 0) {
      // Create room
      const net = initNetwork();
      net.connect();
      onlineState = "creating";
      onlineMessage = "CONNECTING...";
      onlineError = "";
      // Wait for connection, then create room
      const checkConnected = setInterval(() => {
        if (net.state === "connected") {
          clearInterval(checkConnected);
          net.createRoom();
        } else if (net.state === "error") {
          clearInterval(checkConnected);
          onlineState = "idle";
          onlineError = net.errorMessage || "CONNECTION FAILED";
        }
      }, 100);
      game.screen = "online_waiting";
    } else {
      // Join room
      joinCode = "";
      onlineError = "";
      onlineMessage = "";
      game.screen = "online_join";
    }
  }
}

function handleOnlineWaiting(): void {
  if (input.wasPressed("escape")) {
    if (network) {
      network.disconnect();
      network = null;
    }
    onlineState = "idle";
    onlineMessage = "";
    game.screen = "online_lobby";
    return;
  }
  // State transitions happen via network callbacks
}

function handleOnlineJoin(): void {
  if (input.wasPressed("escape")) {
    onlineState = "idle";
    joinCode = "";
    game.screen = "online_lobby";
    return;
  }

  // Type room code
  if (input.wasPressed("backspace") && joinCode.length > 0) {
    joinCode = joinCode.slice(0, -1);
    return;
  }

  // Check for letter keys
  const letters = "abcdefghijklmnopqrstuvwxyz";
  for (const ch of letters) {
    if (input.wasPressed(ch) && joinCode.length < 4) {
      joinCode += ch.toUpperCase();
      break;
    }
  }

  // Submit
  if (input.wasPressed("enter") && joinCode.length === 4) {
    const net = initNetwork();
    net.connect();
    onlineState = "joining";
    onlineMessage = "CONNECTING...";
    onlineError = "";

    const code = joinCode;
    const checkConnected = setInterval(() => {
      if (net.state === "connected") {
        clearInterval(checkConnected);
        onlineMessage = "JOINING...";
        net.joinRoom(code);
      } else if (net.state === "error") {
        clearInterval(checkConnected);
        onlineState = "idle";
        onlineError = net.errorMessage || "CONNECTION FAILED";
      }
    }, 100);
  }
}

function handleOnlineBattle(): void {
  if (onlineState === "disconnected") {
    // Opponent left, show message then go back
    if (input.wasPressed("enter") || input.wasPressed("escape")) {
      game.screen = "title";
      game.gameMode = "cpu";
      if (network) {
        network.disconnect();
        network = null;
      }
      onlineState = "idle";
    }
    return;
  }

  // Get local input
  const facing = myPlayerNumber === 1 ? game.player.facing : game.cpu.facing;
  const localInput = input.getPlayerInput(facing);

  // Store local input with delay
  const sendFrame = onlineGameFrame + INPUT_DELAY;
  localInputBuffer.set(sendFrame, localInput);

  // Send to remote
  if (network) {
    network.sendInput(sendFrame, localInput);
  }

  // Try to advance game with both inputs
  const targetFrame = onlineGameFrame;
  const myInput = localInputBuffer.get(targetFrame) ?? emptyInput();
  const theirInput = remoteInputBuffer.get(targetFrame);

  if (theirInput === undefined && targetFrame >= INPUT_DELAY) {
    // Waiting for remote input
    game.waitingForRemote = true;
    return;
  }

  game.waitingForRemote = false;
  const remoteInput = theirInput ?? emptyInput();

  // Map inputs to P1/P2
  let p1Input: InputState;
  let p2Input: InputState;
  if (myPlayerNumber === 1) {
    p1Input = myInput;
    p2Input = remoteInput;
  } else {
    p1Input = remoteInput;
    p2Input = myInput;
  }

  game.updateBattleOnline(p1Input, p2Input);

  // Clean old buffers
  if (onlineGameFrame > 120) {
    const cleanBefore = onlineGameFrame - 120;
    for (const key of localInputBuffer.keys()) {
      if (key < cleanBefore) localInputBuffer.delete(key);
    }
    for (const key of remoteInputBuffer.keys()) {
      if (key < cleanBefore) remoteInputBuffer.delete(key);
    }
  }

  onlineGameFrame++;
}

function handleResult(): void {
  game.handleResultInput((key) => input.wasPressed(key));
  // If online and going back to lobby, clean up
  if (game.screen === "online_lobby") {
    if (network) {
      network.disconnect();
      network = null;
    }
    onlineState = "idle";
    roomCode = "";
    joinCode = "";
    onlineMessage = "";
    onlineError = "";
  }
}

function render(): void {
  renderer.clear();

  switch (game.screen) {
    case "title":
      renderer.drawTitleScreen(game.selectedTitleOption, game.selectedDifficulty);
      break;

    case "online_lobby":
      renderer.drawOnlineLobby(lobbySelection, onlineError);
      break;

    case "online_waiting":
      renderer.drawOnlineWaiting(roomCode, onlineState, onlineMessage, onlineError);
      break;

    case "online_join":
      renderer.drawOnlineJoin(joinCode, onlineMessage, onlineError);
      break;

    case "battle":
      renderer.drawBackground();
      renderer.drawFighter(game.player, "#4488cc", game.showHitboxes, false);
      renderer.drawFighter(game.cpu, "#cc4444", game.showHitboxes, true);
      renderer.drawHUD(game);
      if (game.roundMessage) {
        renderer.drawRoundMessage(game.roundMessage);
      }
      if (game.waitingForRemote) {
        renderer.drawWaitingIndicator();
      }
      if (onlineState === "disconnected") {
        renderer.drawDisconnected();
      }
      break;

    case "result": {
      renderer.drawBackground();
      renderer.drawFighter(game.player, "#4488cc", false, false);
      renderer.drawFighter(game.cpu, "#cc4444", false, true);
      renderer.drawHUD(game);

      if (game.gameMode === "online") {
        // Determine if local player won
        const iWon =
          (myPlayerNumber === 1 && game.matchWinner === "player") ||
          (myPlayerNumber === 2 && game.matchWinner === "cpu");
        renderer.drawResultScreen(iWon);
      } else {
        renderer.drawResultScreen(game.matchWinner === "player");
      }
      break;
    }
  }
}

// Start
requestAnimationFrame((ts) => {
  lastTime = ts;
  requestAnimationFrame(gameLoop);
});
