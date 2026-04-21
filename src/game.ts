import {
  CANVAS_W,
  GROUND_Y,
  CHAR_W,
  MAX_HP,
  ROUND_TIME,
  ROUNDS_TO_WIN,
  FPS,
  ScreenType,
  Difficulty,
  GameMode,
  InputState,
  STAGE_LEFT,
  STAGE_RIGHT,
} from "./types";
import { Fighter } from "./fighter";
import { CpuAI } from "./cpu";
import { resolveAttacks, resolvePush, checkAutoThrow, resolveThrow, checkDashBounce } from "./collision";

const P1_START_X = CANVAS_W * 0.35;
const P2_START_X = CANVAS_W * 0.65;

type BattlePhase = "intro" | "fight" | "roundEnd" | "matchEnd";

export class Game {
  player: Fighter;
  cpu: Fighter; // Also used as P2 in online mode
  cpuAI: CpuAI;

  screen: ScreenType = "title";
  difficulty: Difficulty = "normal";
  selectedDifficulty = 1; // 0=easy, 1=normal, 2=hard
  selectedTitleOption = 0; // 0=VS CPU, 1=ONLINE

  gameMode: GameMode = "cpu";

  // Battle state
  timer = ROUND_TIME;
  round = 1;
  hitStop = 0;
  battlePhase: BattlePhase = "intro";
  phaseTimer = 0;
  roundMessage = "";
  matchWinner: "player" | "cpu" | null = null;
  showHitboxes = false;

  // Set tracking (online continuous play)
  p1Sets = 0;
  p2Sets = 0;

  // Online state
  onlinePlayerNumber: 1 | 2 = 1;
  gameFrame = 0; // Frame counter for online sync
  waitingForRemote = false;

  private frameAccumulator = 0;

  constructor() {
    this.player = new Fighter(P1_START_X, 1);
    this.cpu = new Fighter(P2_START_X, -1);
    this.cpuAI = new CpuAI(this.difficulty);
  }

  startBattle(): void {
    this.screen = "battle";
    this.round = 1;
    this.player.roundsWon = 0;
    this.cpu.roundsWon = 0;
    this.p1Sets = 0;
    this.p2Sets = 0;
    this.gameFrame = 0;
    this.waitingForRemote = false;
    if (this.gameMode === "cpu") {
      this.cpuAI.setDifficulty(this.difficulty);
    }
    this.startRound();
  }

  startOnlineBattle(playerNumber: 1 | 2): void {
    this.gameMode = "online";
    this.onlinePlayerNumber = playerNumber;
    this.startBattle();
  }

  private startRound(): void {
    this.player.reset(P1_START_X, 1);
    this.cpu.reset(P2_START_X, -1);
    this.timer = ROUND_TIME;
    this.hitStop = 0;
    this.battlePhase = "intro";
    this.phaseTimer = 90; // 1.5 seconds intro
    this.roundMessage = `ROUND ${this.round}`;
  }

  updateBattle(playerInput: InputState): void {
    // Hit stop freeze
    if (this.hitStop > 0) {
      this.hitStop--;
      return;
    }

    switch (this.battlePhase) {
      case "intro":
        this.phaseTimer--;
        if (this.phaseTimer === 30) {
          this.roundMessage = "FIGHT!";
        }
        if (this.phaseTimer <= 0) {
          this.battlePhase = "fight";
          this.roundMessage = "";
        }
        break;

      case "fight":
        this.updateFight(playerInput);
        break;

      case "roundEnd":
        this.phaseTimer--;
        // Still update physics for knockback etc
        this.player.update();
        this.cpu.update();
        resolvePush(this.player, this.cpu);
        if (this.phaseTimer <= 0) {
          this.checkMatchEnd();
        }
        break;

      case "matchEnd":
        this.phaseTimer--;
        if (this.phaseTimer <= 0) {
          this.screen = "result";
        }
        break;
    }
  }

  /** Online mode: update with both inputs already provided */
  updateBattleOnline(p1Input: InputState, p2Input: InputState): void {
    // Hit stop freeze
    if (this.hitStop > 0) {
      this.hitStop--;
      return;
    }

    switch (this.battlePhase) {
      case "intro":
        this.phaseTimer--;
        if (this.phaseTimer === 30) {
          this.roundMessage = "FIGHT!";
        }
        if (this.phaseTimer <= 0) {
          this.battlePhase = "fight";
          this.roundMessage = "";
        }
        this.gameFrame++;
        break;

      case "fight":
        this.updateFightOnline(p1Input, p2Input);
        break;

      case "roundEnd":
        this.phaseTimer--;
        this.player.update();
        this.cpu.update();
        resolvePush(this.player, this.cpu);
        if (this.phaseTimer <= 0) {
          this.checkMatchEnd();
        }
        this.gameFrame++;
        break;

      case "matchEnd":
        this.phaseTimer--;
        if (this.phaseTimer <= 0) {
          this.startNewSet();
        }
        this.gameFrame++;
        break;
    }
  }

  private updateFight(playerInput: InputState): void {
    // Timer
    this.frameAccumulator++;
    if (this.frameAccumulator >= FPS) {
      this.frameAccumulator = 0;
      this.timer--;
      if (this.timer <= 0) {
        this.timer = 0;
        this.endRound();
        return;
      }
    }

    // Get CPU input
    const cpuInput = this.cpuAI.getInput(this.cpu, this.player);

    // Handle inputs
    this.player.handleInput(playerInput, this.cpu.x);
    this.cpu.handleInput(cpuInput, this.player.x);

    // Update fighters
    this.player.update();
    this.cpu.update();

    // Push resolution (prevent overlapping)
    resolvePush(this.player, this.cpu);

    // Dash bounce check (before throw check — dash should bounce away, not throw)
    checkDashBounce(this.player, this.cpu);
    checkDashBounce(this.cpu, this.player);

    // Auto-throw check: walking forward into guarding opponent at close range
    if (checkAutoThrow(this.player, this.cpu)) {
      this.player.startThrow();
    }
    if (checkAutoThrow(this.cpu, this.player)) {
      this.cpu.startThrow();
    }

    // Resolve active throws
    const throwA = resolveThrow(this.player, this.cpu);
    const throwB = resolveThrow(this.cpu, this.player);

    // Attack collision
    const { hitA, hitB } = resolveAttacks(this.player, this.cpu);

    if (hitA || hitB || throwA || throwB) {
      this.hitStop = hitA && hitB ? 8 : 6;
    }

    // Check KO
    if (this.player.hp <= 0 || this.cpu.hp <= 0) {
      this.endRound();
    }
  }

  private updateFightOnline(p1Input: InputState, p2Input: InputState): void {
    // Timer
    this.frameAccumulator++;
    if (this.frameAccumulator >= FPS) {
      this.frameAccumulator = 0;
      this.timer--;
      if (this.timer <= 0) {
        this.timer = 0;
        this.endRound();
        this.gameFrame++;
        return;
      }
    }

    // Handle inputs (player is always P1 fighter, cpu is always P2 fighter)
    this.player.handleInput(p1Input, this.cpu.x);
    this.cpu.handleInput(p2Input, this.player.x);

    // Update fighters
    this.player.update();
    this.cpu.update();

    // Push resolution
    resolvePush(this.player, this.cpu);

    // Dash bounce check
    checkDashBounce(this.player, this.cpu);
    checkDashBounce(this.cpu, this.player);

    // Auto-throw check
    if (checkAutoThrow(this.player, this.cpu)) {
      this.player.startThrow();
    }
    if (checkAutoThrow(this.cpu, this.player)) {
      this.cpu.startThrow();
    }

    // Resolve active throws
    const throwA = resolveThrow(this.player, this.cpu);
    const throwB = resolveThrow(this.cpu, this.player);

    // Attack collision
    const { hitA, hitB } = resolveAttacks(this.player, this.cpu);

    if (hitA || hitB || throwA || throwB) {
      this.hitStop = hitA && hitB ? 8 : 6;
    }

    // Check KO
    if (this.player.hp <= 0 || this.cpu.hp <= 0) {
      this.endRound();
    }

    this.gameFrame++;
  }

  private endRound(): void {
    this.battlePhase = "roundEnd";
    this.phaseTimer = 90;

    // Determine round winner
    if (this.player.hp > this.cpu.hp) {
      this.player.roundsWon++;
      if (this.gameMode === "online") {
        this.roundMessage = "P1 WINS";
      } else {
        this.roundMessage = "PLAYER WINS";
      }
    } else if (this.cpu.hp > this.player.hp) {
      this.cpu.roundsWon++;
      if (this.gameMode === "online") {
        this.roundMessage = "P2 WINS";
      } else {
        this.roundMessage = "CPU WINS";
      }
    } else {
      // Draw - both get a point
      this.player.roundsWon++;
      this.cpu.roundsWon++;
      this.roundMessage = "DRAW";
    }
  }

  private checkMatchEnd(): void {
    if (this.player.roundsWon >= ROUNDS_TO_WIN || this.cpu.roundsWon >= ROUNDS_TO_WIN) {
      this.battlePhase = "matchEnd";
      this.matchWinner = this.player.roundsWon >= ROUNDS_TO_WIN ? "player" : "cpu";
      if (this.gameMode === "online") {
        this.phaseTimer = 150;
        this.roundMessage = this.matchWinner === "player" ? "P1 WINS SET!" : "P2 WINS SET!";
      } else {
        this.phaseTimer = 60;
        this.roundMessage = "K.O.!";
      }
    } else {
      this.round++;
      this.startRound();
    }
  }

  private startNewSet(): void {
    if (this.matchWinner === "player") {
      this.p1Sets++;
    } else {
      this.p2Sets++;
    }
    this.round = 1;
    this.player.roundsWon = 0;
    this.cpu.roundsWon = 0;
    this.matchWinner = null;
    this.startRound();
  }

  handleTitleInput(wasPressed: (key: string) => boolean): void {
    if (wasPressed("w") || wasPressed("arrowup")) {
      this.selectedTitleOption = Math.max(0, this.selectedTitleOption - 1);
    }
    if (wasPressed("s") || wasPressed("arrowdown")) {
      this.selectedTitleOption = Math.min(1, this.selectedTitleOption + 1);
    }
    if (wasPressed("enter") || wasPressed("j")) {
      if (this.selectedTitleOption === 0) {
        // VS CPU - go to difficulty select
        this.screen = "title"; // stays on title, but we need a sub-state
        // For simplicity, we use the old difficulty selection flow
        this.gameMode = "cpu";
        // Start battle with current difficulty
        const diffs: Difficulty[] = ["easy", "normal", "hard"];
        this.difficulty = diffs[this.selectedDifficulty];
        this.startBattle();
      } else {
        // ONLINE
        this.gameMode = "online";
        this.screen = "online_lobby";
      }
    }
    // Difficulty sub-selection (left/right to change difficulty when VS CPU is highlighted)
    if (this.selectedTitleOption === 0) {
      if (wasPressed("a") || wasPressed("arrowleft")) {
        this.selectedDifficulty = Math.max(0, this.selectedDifficulty - 1);
      }
      if (wasPressed("d") || wasPressed("arrowright")) {
        this.selectedDifficulty = Math.min(2, this.selectedDifficulty + 1);
      }
    }
  }

  handleResultInput(wasPressed: (key: string) => boolean): void {
    if (wasPressed("enter") || wasPressed("j")) {
      if (this.gameMode === "online") {
        // In online, return to lobby instead of restarting
        this.screen = "online_lobby";
      } else {
        this.startBattle();
      }
    }
    if (wasPressed("escape")) {
      this.screen = "title";
      this.gameMode = "cpu";
    }
  }
}
