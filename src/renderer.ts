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

  drawFighter(fighter: Fighter, color: string, showHitboxes: boolean): void {
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

    // Torso - slightly shifted toward facing direction for stance feel
    const torsoShift = f * 2;
    ctx.fillStyle = color;
    ctx.fillRect(bx - bodyW / 2 + torsoShift, by - bodyH, bodyW, bodyH * 0.6);

    // Front shoulder highlight (brighter on the facing side)
    ctx.fillStyle = shadeColor(color, 25);
    const shoulderX = f === 1
      ? bx + bodyW / 2 + torsoShift - 8
      : bx - bodyW / 2 + torsoShift;
    ctx.fillRect(shoulderX, by - bodyH, 8, bodyH * 0.15);

    // Legs
    const legColor = shadeColor(color, -30);
    ctx.fillStyle = legColor;
    if (isCrouching) {
      // Crouching: wider, bent legs
      ctx.fillRect(bx - bodyW / 2 - 4, by - bodyH * 0.4, bodyW * 0.45, bodyH * 0.4);
      ctx.fillRect(bx + bodyW * 0.05 + 4, by - bodyH * 0.4, bodyW * 0.45, bodyH * 0.4);
    } else {
      // Front leg slightly forward
      ctx.fillRect(bx - bodyW / 2 + f * 3, by - bodyH * 0.4, bodyW * 0.4, bodyH * 0.4);
      ctx.fillRect(bx + bodyW * 0.1 - f * 3, by - bodyH * 0.4, bodyW * 0.4, bodyH * 0.4);
    }

    // Walking animation
    if (fighter.state === "walkForward" || fighter.state === "walkBack") {
      const legAnim = Math.sin(Date.now() / 80) * 4;
      ctx.fillStyle = legColor;
      ctx.fillRect(bx - bodyW / 2 + f * 3, by - bodyH * 0.4 + legAnim, bodyW * 0.4, bodyH * 0.4);
    }

    // Head - shifted toward facing direction
    const headSize = 16;
    const headShift = f * 3;
    ctx.fillStyle = "#ddb892";
    ctx.fillRect(bx - headSize / 2 + headShift, by - bodyH - headSize + 4, headSize, headSize);

    // Eyes - on the facing side of the head
    ctx.fillStyle = "#222";
    const eyeX = bx + headShift + f * 4;
    ctx.fillRect(eyeX - 1, by - bodyH - headSize + 10, 3, 3);

    // --- Draw arms / attack ---
    if (fighter.state === "attack" && fighter.attackData) {
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
      // Front arm
      ctx.fillRect(bx + f * (bodyW / 2 - 6), armY - 3, 12, 6);
      // Back arm
      ctx.fillRect(bx - f * (bodyW / 2 + 2), armY + 2, 10, 5);
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
    ctx.textAlign = "left";
    ctx.fillText("PLAYER", CANVAS_W / 2 - barW - gap / 2, barY - 6);
    ctx.textAlign = "right";
    ctx.fillText("CPU", CANVAS_W / 2 + barW + gap / 2, barY - 6);

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
    ctx.fillText(`ROUND ${game.round}`, CANVAS_W / 2, dotY + 4);

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

  drawTitleScreen(selectedDifficulty: number): void {
    const ctx = this.ctx;
    this.clear();

    // Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("FOOTSIES DOJO", CANVAS_W / 2, 140);

    // Subtitle
    ctx.fillStyle = "#aaaacc";
    ctx.font = "18px monospace";
    ctx.fillText("- master the neutral game -", CANVAS_W / 2, 190);

    // Difficulty selection
    const difficulties: Difficulty[] = ["easy", "normal", "hard"];
    const labels = ["EASY", "NORMAL", "HARD"];
    const startY = 280;

    for (let i = 0; i < 3; i++) {
      const y = startY + i * 50;
      const selected = i === selectedDifficulty;

      if (selected) {
        ctx.fillStyle = "#ffcc00";
        ctx.font = "bold 28px monospace";
        ctx.fillText(`> ${labels[i]} <`, CANVAS_W / 2, y);
      } else {
        ctx.fillStyle = "#888";
        ctx.font = "24px monospace";
        ctx.fillText(labels[i], CANVAS_W / 2, y);
      }
    }

    // Controls
    ctx.fillStyle = "#666";
    ctx.font = "14px monospace";
    ctx.fillText("W/S or UP/DOWN to select   ENTER or J to start", CANVAS_W / 2, 460);
    ctx.fillText("A/D = Move   W = Dash   S = Crouch   S+A/D(back) = Guard   J/K/L = Attacks", CANVAS_W / 2, 485);
    ctx.fillText("H = Toggle Hitboxes", CANVAS_W / 2, 505);
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
