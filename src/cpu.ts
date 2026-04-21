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
  /** "wait and punish" mode: crouch-guard and watch for heavy, then counter */
  private waitForHeavyMode = false;
  private waitModeFrames = 0;

  constructor(difficulty: Difficulty) {
    this.params = DIFFICULTY_PARAMS[difficulty];
  }

  setDifficulty(difficulty: Difficulty): void {
    this.params = DIFFICULTY_PARAMS[difficulty];
  }

  /** Helper: set back direction input */
  private setBack(self: Fighter, input: InputState): void {
    if (self.facing === 1) input.left = true;
    else input.right = true;
  }

  /** Helper: set forward direction input */
  private setForward(self: Fighter, input: InputState): void {
    if (self.facing === 1) input.right = true;
    else input.left = true;
  }

  /** Helper: set crouch guard (down + back) */
  private setCrouchGuard(self: Fighter, input: InputState): void {
    input.down = true;
    this.setBack(self, input);
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

    // --- "Wait for heavy" mode: crouch guard and watch for opponent heavy ---
    if (this.waitForHeavyMode) {
      this.waitModeFrames--;
      if (this.waitModeFrames <= 0) {
        // Patience ran out, exit wait mode
        this.waitForHeavyMode = false;
      } else if (
        opponent.isAttacking &&
        opponent.attackData?.type === "heavy" &&
        opponent.attackFrame > (opponent.attackData?.startup ?? 0) + (opponent.attackData?.active ?? 0)
      ) {
        // Opponent threw a heavy and is now recovering → punish!
        this.waitForHeavyMode = false;
        input.medium = true;
        this.currentAction = input;
        this.actionCooldown = 2; // Quick reaction for punish
        return input;
      } else {
        // Keep crouch guarding while waiting
        this.setCrouchGuard(self, input);
        this.currentAction = input;
        this.holdFrames = 5;
        this.actionCooldown = 5;
        return input;
      }
    }

    // Decision making
    const roll = Math.random();
    const optimal = Math.random() < this.params.optimalRate;

    if (dist > 200) {
      // Far range: approach more aggressively
      const approachChance = this.params.aggressiveness + 0.25; // Bias toward walking in
      if (roll < approachChance) {
        if (optimal && roll < 0.12) {
          input.dash = true;
        } else {
          // Walk forward - more frequently and longer
          this.setForward(self, input);
          this.holdFrames = 20 + Math.floor(Math.random() * 25);
        }
      } else {
        // Occasionally crouch guard while waiting at range
        if (Math.random() < 0.4) {
          this.setCrouchGuard(self, input);
          this.holdFrames = 10 + Math.floor(Math.random() * 15);
        } else if (Math.random() < 0.3) {
          this.setBack(self, input);
          this.holdFrames = 5 + Math.floor(Math.random() * 8);
        }
      }
    } else if (dist > 120) {
      // Medium range: poke zone — key distance for footsies

      // Check for whiff punish opportunity first (always try if possible)
      if (
        opponent.isAttacking &&
        opponent.attackFrame > (opponent.attackData?.startup ?? 0) + (opponent.attackData?.active ?? 0)
      ) {
        // Opponent is recovering - punish!
        input.medium = true;
        this.currentAction = input;
        this.actionCooldown = 2;
        return input;
      }

      if (optimal) {
        // Sometimes enter "wait for heavy" mode to bait and punish
        if (Math.random() < 0.15) {
          this.waitForHeavyMode = true;
          this.waitModeFrames = 40 + Math.floor(Math.random() * 30); // Wait 40-70 frames
          this.setCrouchGuard(self, input);
          this.currentAction = input;
          this.holdFrames = 5;
          this.actionCooldown = 5;
          return input;
        }

        if (roll < 0.25) {
          input.medium = true;
        } else if (roll < 0.40) {
          input.heavy = true;
        } else if (roll < 0.65) {
          // Crouch guard at medium range — hard to hit
          this.setCrouchGuard(self, input);
          this.holdFrames = 10 + Math.floor(Math.random() * 15);
        } else if (roll < 0.80) {
          // Walk forward to close distance
          this.setForward(self, input);
          this.holdFrames = 8 + Math.floor(Math.random() * 12);
        } else {
          // Walk-back guard
          this.setBack(self, input);
          this.holdFrames = 8 + Math.floor(Math.random() * 10);
        }
      } else {
        // Suboptimal: random action
        const r = Math.random();
        if (r < 0.20) input.light = true;
        else if (r < 0.40) input.medium = true;
        else if (r < 0.50) input.heavy = true;
        else if (r < 0.70) {
          // Even suboptimal CPU crouches sometimes
          this.setCrouchGuard(self, input);
          this.holdFrames = 8 + Math.floor(Math.random() * 10);
        } else {
          this.setForward(self, input);
          this.holdFrames = 8;
        }
      }
    } else {
      // Close range
      if (optimal) {
        if (opponent.isAttacking) {
          // Block: prefer crouch guard at close range
          if (Math.random() < 0.6) {
            this.setCrouchGuard(self, input);
            this.holdFrames = 15;
          } else {
            this.setBack(self, input);
            this.holdFrames = 15;
          }
        } else if (roll < 0.45) {
          input.light = true;
        } else if (roll < 0.70) {
          input.medium = true;
        } else {
          // Backdash / create space
          this.setBack(self, input);
          this.holdFrames = 10;
        }
      } else {
        const r = Math.random();
        if (r < 0.35) input.light = true;
        else if (r < 0.55) input.medium = true;
        else if (r < 0.65) input.heavy = true;
        else {
          this.setBack(self, input);
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
