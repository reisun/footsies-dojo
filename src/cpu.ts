import { InputState, Difficulty } from "./types";
import { Fighter } from "./fighter";

interface CpuParams {
  reactionFrames: number; // lower = faster reaction
  aggressiveness: number; // 0..1
  optimalRate: number; // 0..1 chance of choosing optimal action
}

const DIFFICULTY_PARAMS: Record<Difficulty, CpuParams> = {
  easy: { reactionFrames: 20, aggressiveness: 0.3, optimalRate: 0.3 },
  normal: { reactionFrames: 12, aggressiveness: 0.5, optimalRate: 0.55 },
  hard: { reactionFrames: 5, aggressiveness: 0.65, optimalRate: 0.8 },
};

export class CpuAI {
  private params: CpuParams;
  private actionCooldown = 0;
  private currentAction: InputState = emptyInput();
  private holdFrames = 0;

  constructor(difficulty: Difficulty) {
    this.params = DIFFICULTY_PARAMS[difficulty];
  }

  setDifficulty(difficulty: Difficulty): void {
    this.params = DIFFICULTY_PARAMS[difficulty];
  }

  getInput(self: Fighter, opponent: Fighter): InputState {
    // Decrease cooldown
    if (this.actionCooldown > 0) {
      this.actionCooldown--;
      this.holdFrames--;
      if (this.holdFrames <= 0) {
        this.currentAction = emptyInput();
      }
      return this.currentAction;
    }

    // If not actionable, just return empty
    if (!self.isActionable) {
      return emptyInput();
    }

    const dist = Math.abs(self.x - opponent.x);
    const input = emptyInput();

    // Decision making
    const roll = Math.random();
    const optimal = Math.random() < this.params.optimalRate;

    if (dist > 200) {
      // Far range: approach or wait
      if (roll < this.params.aggressiveness) {
        if (optimal && roll < 0.15) {
          input.dash = true;
        } else {
          // Walk forward
          if (self.facing === 1) input.right = true;
          else input.left = true;
          this.holdFrames = 15 + Math.floor(Math.random() * 20);
        }
      } else {
        // Wait / slight backward movement
        if (Math.random() < 0.3) {
          if (self.facing === 1) input.left = true;
          else input.right = true;
          this.holdFrames = 5 + Math.floor(Math.random() * 10);
        }
      }
    } else if (dist > 120) {
      // Medium range: poke zone
      if (optimal) {
        // Whiff punish or preemptive poke
        if (opponent.isAttacking && opponent.attackFrame > (opponent.attackData?.startup ?? 0) + (opponent.attackData?.active ?? 0)) {
          // Opponent is recovering - punish with medium
          input.medium = true;
        } else if (roll < 0.35) {
          input.medium = true;
        } else if (roll < 0.55) {
          input.heavy = true;
        } else if (roll < 0.7) {
          // Guard: crouch guard (down + back) or walk back
          if (Math.random() < 0.4) {
            input.down = true;
            // Also press back to actually guard
            if (self.facing === 1) input.left = true;
            else input.right = true;
            this.holdFrames = 8 + Math.floor(Math.random() * 12);
          } else {
            if (self.facing === 1) input.left = true;
            else input.right = true;
            this.holdFrames = 8 + Math.floor(Math.random() * 12);
          }
        } else {
          // Walk forward to pressure
          if (self.facing === 1) input.right = true;
          else input.left = true;
          this.holdFrames = 5 + Math.floor(Math.random() * 8);
        }
      } else {
        // Suboptimal: random action
        const r = Math.random();
        if (r < 0.25) input.light = true;
        else if (r < 0.45) input.medium = true;
        else if (r < 0.55) input.heavy = true;
        else {
          if (self.facing === 1) input.left = true;
          else input.right = true;
          this.holdFrames = 10;
        }
      }
    } else {
      // Close range
      if (optimal) {
        if (opponent.isAttacking) {
          // Block: crouch guard (down + back) or walk-back guard
          if (Math.random() < 0.5) {
            input.down = true;
            // Also press back to actually guard
            if (self.facing === 1) input.left = true;
            else input.right = true;
            this.holdFrames = 15;
          } else {
            if (self.facing === 1) input.left = true;
            else input.right = true;
            this.holdFrames = 15;
          }
        } else if (roll < 0.5) {
          input.light = true;
        } else if (roll < 0.75) {
          input.medium = true;
        } else {
          // Backdash / create space
          if (self.facing === 1) input.left = true;
          else input.right = true;
          this.holdFrames = 10;
        }
      } else {
        const r = Math.random();
        if (r < 0.4) input.light = true;
        else if (r < 0.6) input.medium = true;
        else if (r < 0.7) input.heavy = true;
        else {
          if (self.facing === 1) input.left = true;
          else input.right = true;
          this.holdFrames = 8;
        }
      }
    }

    this.currentAction = input;
    this.actionCooldown = this.params.reactionFrames + Math.floor(Math.random() * 8);

    return input;
  }
}

function emptyInput(): InputState {
  return { left: false, right: false, down: false, dash: false, light: false, medium: false, heavy: false };
}
