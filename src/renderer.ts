import {
  CANVAS_W,
  CANVAS_H,
  GROUND_Y,
  CHAR_W,
  CHAR_H,
  MAX_HP,
  STAGE_LEFT,
  STAGE_RIGHT,
  Difficulty,
} from "./types";
import { Fighter } from "./fighter";
import { Game } from "./game";

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    this.ctx = canvas.getContext("2d")!;
  }

  clear(): void {
    this.ctx.fillStyle = "#1a1a2e";
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  drawBackground(): void {
    const ctx = this.ctx;

    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    grad.addColorStop(0, "#0f0c29");
    grad.addColorStop(0.5, "#302b63");
    grad.addColorStop(1, "#24243e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, GROUND_Y);

    // Ground
    ctx.fillStyle = "#3a3a5c";
    ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);

    // Ground line
    ctx.strokeStyle = "#5a5a8c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(CANVAS_W, GROUND_Y);
    ctx.stroke();

    // Stage boundaries
    ctx.strokeStyle = "#ff4444aa";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(STAGE_LEFT, GROUND_Y - 100);
    ctx.lineTo(STAGE_LEFT, GROUND_Y);
    ctx.moveTo(STAGE_RIGHT, GROUND_Y - 100);
    ctx.lineTo(STAGE_RIGHT, GROUND_Y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawFighter(fighter: Fighter, color: string, showHitboxes: boolean, isEnemy: boolean = false): void {
    const ctx = this.ctx;
    const x = fighter.x;
    const y = GROUND_Y;
    const f = fighter.facing;

    // Body offset for states
    let bodyOffsetY = 0;
    let bodyOffsetX = 0;
    let squish = 1.0;

    let isCrouching = fighter.state === "crouch" || fighter.state === "crouchGuard";

    switch (fighter.state) {
      case "crouch":
      case "crouchGuard":
        bodyOffsetY = 16;
        squish = 1.1;
        break;
      case "hitstun":
        bodyOffsetX = -f * 4;
        break;
      case "blockstun":
        bodyOffsetX = -f * 3;
        squish = 0.95;
        break;
      case "knockdown": {
        const t = fighter.stateTimer / 30;
        bodyOffsetY = -20 * Math.sin(t * Math.PI);
        bodyOffsetX = -f * 8 * (1 - t);
        break;
      }
      case "getup":
        bodyOffsetY = -5 * (fighter.stateTimer / 15);
        break;
      case "dash":
        bodyOffsetX = f * 3;
        break;
      case "throw":
        // Lean forward during throw
        bodyOffsetX = f * 6;
        break;
      case "thrown":
        // Being thrown: lifted up slightly
        bodyOffsetY = -12;
        bodyOffsetX = -f * 4;
        break;
      case "attack":
        // Heavy attack windup: lean back
        if (fighter.attackData && fighter.attackData.type === "heavy" && fighter.attackFrame < fighter.attackData.startup) {
          const windupProgress = fighter.attackFrame / fighter.attackData.startup;
          if (windupProgress < 0.6) {
            bodyOffsetX = -f * 6 * (windupProgress / 0.6);
          } else {
            bodyOffsetX = -f * 6 * (1 - (windupProgress - 0.6) / 0.4);
          }
        }
        break;
    }

    const bx = x + bodyOffsetX;
    const by = y + bodyOffsetY;

    ctx.save();

    // Knockdown: tilt the character
    if (fighter.state === "knockdown") {
      ctx.translate(bx, by - CHAR_H / 2);
      ctx.rotate((-f * Math.PI) / 6);
      ctx.translate(-bx, -(by - CHAR_H / 2));
    }

    // --- Draw body ---
    const bodyW = CHAR_W * squish;
    const bodyH = isCrouching ? CHAR_H * 0.7 : CHAR_H;

    // Torso
    ctx.fillStyle = color;
    ctx.fillRect(bx - bodyW / 2, by - bodyH, bodyW, bodyH * 0.6);

    // Legs
    const legColor = shadeColor(color, -30);
    ctx.fillStyle = legColor;
    if (isCrouching) {
      // Crouching: wider, bent legs
      ctx.fillRect(bx - bodyW / 2 - 4, by - bodyH * 0.4, bodyW * 0.45, bodyH * 0.4);
      ctx.fillRect(bx + bodyW * 0.05 + 4, by - bodyH * 0.4, bodyW * 0.45, bodyH * 0.4);
    } else {
      ctx.fillRect(bx - bodyW / 2, by - bodyH * 0.4, bodyW * 0.4, bodyH * 0.4);
      ctx.fillRect(bx + bodyW * 0.1, by - bodyH * 0.4, bodyW * 0.4, bodyH * 0.4);
    }

    // Walking animation
    if (fighter.state === "walkForward" || fighter.state === "walkBack") {
      const legAnim = Math.sin(Date.now() / 80) * 4;
      ctx.fillStyle = legColor;
      ctx.fillRect(bx - bodyW / 2, by - bodyH * 0.4 + legAnim, bodyW * 0.4, bodyH * 0.4);
    }

    // Head
    const headSize = 16;
    ctx.fillStyle = "#ddb892";
    ctx.fillRect(bx - headSize / 2, by - bodyH - headSize + 4, headSize, headSize);

    // Eyes
    ctx.fillStyle = "#222";
    const eyeX = bx + f * 3;
    ctx.fillRect(eyeX - 1, by - bodyH - headSize + 10, 3, 3);

    // --- Draw arms / attack / throw ---
    if (fighter.state === "throw") {
      // Throw animation: both arms reaching forward to grab
      const armY = by - bodyH * 0.65;
      const grabExtend = fighter.throwHitConfirmed ? 20 : 14;
      const armColor = fighter.throwHitConfirmed ? "#ffcc44" : "#ffffff";
      ctx.fillStyle = armColor;
      // Both arms reaching forward
      const armStartX = bx + f * (bodyW / 2 - 4);
      const armEndX = armStartX + f * grabExtend;
      const ax = Math.min(armStartX, armEndX);
      const aw = Math.abs(armEndX - armStartX);
      ctx.fillRect(ax, armY - 6, aw || 4, 8);
      ctx.fillRect(ax, armY + 2, aw || 4, 8);
      // Grab effect circle
      if (fighter.throwHitConfirmed) {
        ctx.fillStyle = "#ffcc4466";
        ctx.beginPath();
        ctx.arc(armEndX, armY, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (fighter.state === "thrown") {
      // Being thrown: arms flailing
      const armY = by - bodyH * 0.5;
      ctx.fillStyle = "#cc6666";
      ctx.fillRect(bx - 8, armY - 10, 6, 14);
      ctx.fillRect(bx + 2, armY - 6, 6, 10);
    } else if (fighter.state === "attack" && fighter.attackData) {
      const ad = fighter.attackData;
      const total = ad.startup + ad.active + ad.recovery;
      const frame = fighter.attackFrame;

      let armExtend = 0;
      let armColor = color;

      if (frame < ad.startup) {
        // Windup - heavier attacks pull back further
        const windupAmount = ad.type === "heavy" ? 28 : ad.type === "medium" ? 14 : 10;
        const windupProgress = frame / ad.startup;
        if (windupProgress < 0.6) {
          // Pull back phase
          armExtend = -(windupAmount * (windupProgress / 0.6));
        } else {
          // Start moving forward
          armExtend = -windupAmount + windupAmount * ((windupProgress - 0.6) / 0.4);
        }
        armColor = ad.type === "heavy" ? "#ffaa44" : shadeColor(color, 20);
      } else if (frame < ad.startup + ad.active) {
        // Active - full extension
        armExtend = ad.range * 0.8;
        armColor = "#ffffff";
      } else {
        // Recovery - retracting
        const recFrame = frame - ad.startup - ad.active;
        armExtend = ad.range * 0.8 * (1 - recFrame / ad.recovery);
        armColor = shadeColor(color, -20);
      }

      // Arm thickness based on attack type
      let armThick = 6;
      if (ad.type === "medium") armThick = 8;
      if (ad.type === "heavy") armThick = 12;

      const armStartX = bx + f * (bodyW / 2 - 4);
      const armEndX = armStartX + f * armExtend;
      const armY = by - bodyH * 0.65;

      ctx.fillStyle = armColor;
      const ax = Math.min(armStartX, armEndX);
      const aw = Math.abs(armEndX - armStartX);
      ctx.fillRect(ax, armY - armThick / 2, aw || 4, armThick);

      // Fist
      if (frame >= ad.startup && frame < ad.startup + ad.active) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(armEndX - 5, armY - 5, 10, 10);
      }
    } else {
      // Idle arms
      const armY = by - bodyH * 0.65;
      ctx.fillStyle = shadeColor(color, -10);
      // Enemy has both hands extended further toward opponent (by ~1 head width)
      const handOffset = isEnemy ? headSize : 0;
      // Front arm
      ctx.fillRect(bx + f * (bodyW / 2 - 6 + handOffset), armY - 3, 12, 6);
      // Back arm
      ctx.fillRect(bx - f * (bodyW / 2 + 2 - handOffset), armY + 2, 10, 5);
    }

    // Guard indicator (on the side facing the opponent)
    if (fighter.state === "walkBack") {
      ctx.fillStyle = "#4488ffaa";
      ctx.fillRect(bx + f * (bodyW / 2), by - bodyH + 5, 4, bodyH - 10);
    }
    if (fighter.state === "crouchGuard") {
      ctx.fillStyle = "#4488ffaa";
      ctx.fillRect(bx + f * (bodyW / 2), by - bodyH + 5, 4, bodyH - 10);
      // Small shield icon above
      ctx.fillStyle = "#4488ff66";
      ctx.beginPath();
      ctx.arc(bx + f * (bodyW / 2 + 6), by - bodyH + bodyH / 2, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    if (fighter.state === "blockstun") {
      ctx.fillStyle = "#4488ffcc";
      ctx.beginPath();
      ctx.arc(bx, by - bodyH / 2, bodyW * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a1a2e";
      ctx.beginPath();
      ctx.arc(bx, by - bodyH / 2, bodyW * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // --- Hitbox visualization ---
    if (showHitboxes) {
      // Hurtbox (green)
      const hb = fighter.hurtbox;
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 1;
      ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);

      // Attack hitbox (red)
      const ahb = fighter.attackHitbox;
      if (ahb) {
        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = 2;
        ctx.strokeRect(ahb.x, ahb.y, ahb.w, ahb.h);
        ctx.fillStyle = "#ff000033";
        ctx.fillRect(ahb.x, ahb.y, ahb.w, ahb.h);
      }
    }
  }

  drawHUD(game: Game): void {
    const ctx = this.ctx;
    const barW = 350;
    const barH = 24;
    const barY = 30;
    const gap = 20;

    // HP bars background
    ctx.fillStyle = "#333";
    ctx.fillRect(CANVAS_W / 2 - barW - gap / 2, barY, barW, barH);
    ctx.fillRect(CANVAS_W / 2 + gap / 2, barY, barW, barH);

    // Player HP (left, fills from right to left)
    const pRatio = Math.max(0, game.player.hp / MAX_HP);
    ctx.fillStyle = pRatio > 0.3 ? "#22cc44" : "#cc2222";
    const pW = barW * pRatio;
    ctx.fillRect(CANVAS_W / 2 - gap / 2 - pW, barY, pW, barH);

    // CPU HP (right, fills from left to right)
    const cRatio = Math.max(0, game.cpu.hp / MAX_HP);
    ctx.fillStyle = cRatio > 0.3 ? "#22cc44" : "#cc2222";
    ctx.fillRect(CANVAS_W / 2 + gap / 2, barY, barW * cRatio, barH);

    // HP bar borders
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 2;
    ctx.strokeRect(CANVAS_W / 2 - barW - gap / 2, barY, barW, barH);
    ctx.strokeRect(CANVAS_W / 2 + gap / 2, barY, barW, barH);

    // Labels
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px monospace";
    const isOnline = game.gameMode === "online";
    ctx.textAlign = "left";
    ctx.fillText(isOnline ? "P1" : "PLAYER", CANVAS_W / 2 - barW - gap / 2, barY - 6);
    ctx.textAlign = "right";
    ctx.fillText(isOnline ? "P2" : "CPU", CANVAS_W / 2 + barW + gap / 2, barY - 6);

    // Timer
    ctx.textAlign = "center";
    ctx.font = "bold 32px monospace";
    ctx.fillStyle = game.timer <= 10 ? "#ff4444" : "#ffffff";
    ctx.fillText(String(Math.ceil(game.timer)), CANVAS_W / 2, barY + 24);

    // Round indicators
    const dotR = 6;
    const dotY = barY + barH + 16;

    // Player rounds
    for (let i = 0; i < 2; i++) {
      const dx = CANVAS_W / 2 - gap / 2 - 20 - i * 20;
      ctx.beginPath();
      ctx.arc(dx, dotY, dotR, 0, Math.PI * 2);
      if (i < game.player.roundsWon) {
        ctx.fillStyle = "#ffcc00";
        ctx.fill();
      } else {
        ctx.strokeStyle = "#666";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // CPU rounds
    for (let i = 0; i < 2; i++) {
      const dx = CANVAS_W / 2 + gap / 2 + 20 + i * 20;
      ctx.beginPath();
      ctx.arc(dx, dotY, dotR, 0, Math.PI * 2);
      if (i < game.cpu.roundsWon) {
        ctx.fillStyle = "#ffcc00";
        ctx.fill();
      } else {
        ctx.strokeStyle = "#666";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Round label
    ctx.fillStyle = "#aaa";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    if (isOnline) {
      ctx.fillText(`SET ${game.p1Sets} - ${game.p2Sets}  |  ROUND ${game.round}`, CANVAS_W / 2, dotY + 4);
    } else {
      ctx.fillText(`ROUND ${game.round}`, CANVAS_W / 2, dotY + 4);
    }

    // Hit effect flash
    if (game.hitStop > 0) {
      ctx.fillStyle = `rgba(255,255,255,${game.hitStop * 0.04})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

  }

  drawRoundMessage(msg: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#000000aa";
    ctx.fillRect(0, CANVAS_H / 2 - 40, CANVAS_W, 80);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 40px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(msg, CANVAS_W / 2, CANVAS_H / 2);
  }

  drawTitleScreen(selectedOption: number, selectedDifficulty: number): void {
    const ctx = this.ctx;
    this.clear();

    // Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("FOOTSIES DOJO", CANVAS_W / 2, 120);

    // Subtitle
    ctx.fillStyle = "#aaaacc";
    ctx.font = "18px monospace";
    ctx.fillText("- master the neutral game -", CANVAS_W / 2, 170);

    // Menu options
    const menuY = 240;

    // VS CPU option
    const vsCpuSelected = selectedOption === 0;
    if (vsCpuSelected) {
      ctx.fillStyle = "#ffcc00";
      ctx.font = "bold 28px monospace";
    } else {
      ctx.fillStyle = "#888";
      ctx.font = "24px monospace";
    }
    ctx.fillText("VS CPU", CANVAS_W / 2, menuY);

    // Difficulty sub-selection (only when VS CPU is selected)
    if (vsCpuSelected) {
      const labels = ["EASY", "NORMAL", "HARD"];
      ctx.font = "16px monospace";
      for (let i = 0; i < 3; i++) {
        const dx = CANVAS_W / 2 + (i - 1) * 100;
        if (i === selectedDifficulty) {
          ctx.fillStyle = "#ffcc00";
          ctx.fillText(`[ ${labels[i]} ]`, dx, menuY + 35);
        } else {
          ctx.fillStyle = "#666";
          ctx.fillText(labels[i], dx, menuY + 35);
        }
      }
      ctx.fillStyle = "#555";
      ctx.font = "12px monospace";
      ctx.fillText("← A/D →", CANVAS_W / 2, menuY + 55);
    }

    // ONLINE option
    const onlineSelected = selectedOption === 1;
    if (onlineSelected) {
      ctx.fillStyle = "#ffcc00";
      ctx.font = "bold 28px monospace";
    } else {
      ctx.fillStyle = "#888";
      ctx.font = "24px monospace";
    }
    ctx.fillText("ONLINE", CANVAS_W / 2, menuY + 90);

    // Controls
    ctx.fillStyle = "#666";
    ctx.font = "14px monospace";
    ctx.fillText("W/S or UP/DOWN to select   ENTER or J to start", CANVAS_W / 2, 440);
    ctx.fillText("A/D = Move   W = Dash   S = Crouch   S+A/D(back) = Guard   J/K/L = Attacks", CANVAS_W / 2, 465);
    ctx.fillText("H = Toggle Hitboxes", CANVAS_W / 2, 490);

    // Version display
    ctx.fillStyle = "#555555";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      `v${__APP_VERSION__} (${__COMMIT_HASH__})`,
      CANVAS_W - 6,
      CANVAS_H - 4,
    );
  }

  drawResultScreen(playerWon: boolean): void {
    const ctx = this.ctx;

    // Overlay
    ctx.fillStyle = "#000000cc";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Result text
    ctx.font = "bold 60px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (playerWon) {
      ctx.fillStyle = "#ffcc00";
      ctx.fillText("YOU WIN!", CANVAS_W / 2, CANVAS_H / 2 - 40);
    } else {
      ctx.fillStyle = "#ff4444";
      ctx.fillText("YOU LOSE", CANVAS_W / 2, CANVAS_H / 2 - 40);
    }

    // Retry prompt
    ctx.fillStyle = "#aaa";
    ctx.font = "20px monospace";
    ctx.fillText("Press ENTER or J to retry", CANVAS_W / 2, CANVAS_H / 2 + 40);
    ctx.fillText("Press ESC for title screen", CANVAS_W / 2, CANVAS_H / 2 + 70);
  }

  // --- Online screens ---

  drawOnlineLobby(selection: number, error: string): void {
    const ctx = this.ctx;
    this.clear();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ONLINE BATTLE", CANVAS_W / 2, 120);

    const menuY = 250;
    const options = ["CREATE ROOM", "JOIN ROOM"];
    for (let i = 0; i < options.length; i++) {
      const y = menuY + i * 60;
      if (i === selection) {
        ctx.fillStyle = "#ffcc00";
        ctx.font = "bold 28px monospace";
        ctx.fillText(`> ${options[i]} <`, CANVAS_W / 2, y);
      } else {
        ctx.fillStyle = "#888";
        ctx.font = "24px monospace";
        ctx.fillText(options[i], CANVAS_W / 2, y);
      }
    }

    if (error) {
      ctx.fillStyle = "#ff4444";
      ctx.font = "18px monospace";
      ctx.fillText(error, CANVAS_W / 2, 400);
    }

    ctx.fillStyle = "#666";
    ctx.font = "14px monospace";
    ctx.fillText("W/S to select   ENTER to confirm   ESC to go back", CANVAS_W / 2, 460);
  }

  drawOnlineWaiting(roomCode: string, state: string, message: string, error: string): void {
    const ctx = this.ctx;
    this.clear();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("WAITING FOR OPPONENT", CANVAS_W / 2, 140);

    if (roomCode) {
      ctx.fillStyle = "#aaaacc";
      ctx.font = "20px monospace";
      ctx.fillText("Share this room code:", CANVAS_W / 2, 230);

      ctx.fillStyle = "#ffcc00";
      ctx.font = "bold 64px monospace";
      ctx.fillText(roomCode, CANVAS_W / 2, 300);
    }

    if (message) {
      ctx.fillStyle = "#44ff44";
      ctx.font = "24px monospace";
      ctx.fillText(message, CANVAS_W / 2, 380);
    }

    if (error) {
      ctx.fillStyle = "#ff4444";
      ctx.font = "18px monospace";
      ctx.fillText(error, CANVAS_W / 2, 420);
    }

    // Animated dots
    const dots = ".".repeat(Math.floor(Date.now() / 500) % 4);
    ctx.fillStyle = "#666";
    ctx.font = "18px monospace";
    ctx.fillText(`waiting${dots}`, CANVAS_W / 2, 450);

    ctx.fillStyle = "#666";
    ctx.font = "14px monospace";
    ctx.fillText("ESC to cancel", CANVAS_W / 2, 490);
  }

  drawOnlineJoin(joinCode: string, message: string, error: string): void {
    const ctx = this.ctx;
    this.clear();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("JOIN ROOM", CANVAS_W / 2, 140);

    ctx.fillStyle = "#aaaacc";
    ctx.font = "20px monospace";
    ctx.fillText("Enter 4-letter room code:", CANVAS_W / 2, 220);

    // Code input boxes
    const boxSize = 60;
    const totalW = boxSize * 4 + 15 * 3;
    const startX = CANVAS_W / 2 - totalW / 2;
    const boxY = 260;

    for (let i = 0; i < 4; i++) {
      const bx = startX + i * (boxSize + 15);
      // Box
      ctx.strokeStyle = i < joinCode.length ? "#ffcc00" : (i === joinCode.length ? "#ffffff" : "#555");
      ctx.lineWidth = 3;
      ctx.strokeRect(bx, boxY, boxSize, boxSize);

      // Letter
      if (i < joinCode.length) {
        ctx.fillStyle = "#ffcc00";
        ctx.font = "bold 40px monospace";
        ctx.fillText(joinCode[i], bx + boxSize / 2, boxY + boxSize / 2);
      }
    }

    // Cursor blink
    if (joinCode.length < 4) {
      const blink = Math.floor(Date.now() / 500) % 2 === 0;
      if (blink) {
        const cx = startX + joinCode.length * (boxSize + 15) + boxSize / 2;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(cx - 1, boxY + boxSize - 10, 2, 8);
      }
    }

    if (message) {
      ctx.fillStyle = "#44ff44";
      ctx.font = "20px monospace";
      ctx.fillText(message, CANVAS_W / 2, 370);
    }

    if (error) {
      ctx.fillStyle = "#ff4444";
      ctx.font = "18px monospace";
      ctx.fillText(error, CANVAS_W / 2, 400);
    }

    ctx.fillStyle = "#666";
    ctx.font = "14px monospace";
    ctx.fillText("Type room code   ENTER to join   ESC to go back", CANVAS_W / 2, 460);
  }

  drawWaitingIndicator(): void {
    const ctx = this.ctx;
    const dots = ".".repeat(Math.floor(Date.now() / 300) % 4);
    ctx.fillStyle = "#ffcc00cc";
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`SYNCING${dots}`, CANVAS_W / 2, CANVAS_H / 2 - 80);
  }

  drawDisconnected(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#000000aa";
    ctx.fillRect(0, CANVAS_H / 2 - 50, CANVAS_W, 100);
    ctx.fillStyle = "#ff4444";
    ctx.font = "bold 32px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("OPPONENT DISCONNECTED", CANVAS_W / 2, CANVAS_H / 2 - 10);
    ctx.fillStyle = "#aaa";
    ctx.font = "18px monospace";
    ctx.fillText("Press ENTER or ESC to return", CANVAS_W / 2, CANVAS_H / 2 + 25);
  }
}

function shadeColor(hex: string, amount: number): string {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.min(255, Math.max(0, r + amount));
  g = Math.min(255, Math.max(0, g + amount));
  b = Math.min(255, Math.max(0, b + amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
