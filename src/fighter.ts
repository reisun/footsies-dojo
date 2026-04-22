import {
  Facing,
  FighterState,
  AttackType,
  Hitbox,
  InputState,
  GROUND_Y,
  CHAR_W,
  CHAR_H,
  MAX_HP,
  STAGE_LEFT,
  STAGE_RIGHT,
} from "./types";
import { ATTACKS } from "./attacks";
import { AttackData } from "./types";

const WALK_SPEED = 3.0;
const BACK_WALK_SPEED = 2.2;
const DASH_SPEED = 9;
const DASH_DURATION = 12; // frames
const KNOCKDOWN_DURATION = 36;
const GETUP_DURATION = 18;

// Throw constants
export const THROW_RANGE = 55; // slightly larger than push distance (48) so throw can trigger
export const THROW_DAMAGE = 100; // same as medium attack
export const THROW_STARTUP = 6; // frames before throw connects
export const THROW_ACTIVE = 10; // frames of throw animation after connecting
export const THROW_RECOVERY = 12; // frames after throw animation
const THROW_PUSHBACK = 18;

export class Fighter {
  x: number;
  hp = MAX_HP;
  facing: Facing = 1;
  state: FighterState = "idle";
  stateTimer = 0;
  velocityX = 0;

  // Attack state
  attackData: AttackData | null = null;
  attackFrame = 0;
  attackHitConfirmed = false; // prevent multi-hit

  // Throw state
  throwFrame = 0;
  throwHitConfirmed = false; // true once throw grab connects

  roundsWon = 0;

  // Combo scaling (unused for now but ready)
  comboCount = 0;

  constructor(x: number, facing: Facing) {
    this.x = x;
    this.facing = facing;
  }

  reset(x: number, facing: Facing): void {
    this.x = x;
    this.hp = MAX_HP;
    this.facing = facing;
    this.state = "idle";
    this.stateTimer = 0;
    this.velocityX = 0;
    this.attackData = null;
    this.attackFrame = 0;
    this.attackHitConfirmed = false;
    this.throwFrame = 0;
    this.throwHitConfirmed = false;
    this.comboCount = 0;
  }

  get isActionable(): boolean {
    return this.state === "idle" || this.state === "walkForward" || this.state === "walkBack" || this.state === "crouch" || this.state === "crouchGuard";
  }

  get isAttacking(): boolean {
    return this.state === "attack";
  }

  get isThrowing(): boolean {
    return this.state === "throw";
  }

  get isGuarding(): boolean {
    return (this.state === "walkBack" || this.state === "crouchGuard") && !this.isAttacking;
  }

  get hurtbox(): Hitbox {
    // No hurtbox during knockdown, getup, throw, thrown — invincible
    if (this.state === "knockdown" || this.state === "getup" || this.state === "throw" || this.state === "thrown") {
      return { x: -9999, y: -9999, w: 0, h: 0 };
    }

    // Extend hurtbox during attack (active + recovery) to enable whiff punishment
    // Hurtbox extension matches the attackHitbox position/size
    if (this.state === "attack" && this.attackData) {
      const ad = this.attackData;
      if (this.attackFrame >= ad.startup) {
        // Use the same reach/position as attackHitbox
        const reach = ad.range * 0.8;
        let scale: number;
        if (this.attackFrame < ad.startup + ad.active) {
          // Active frames: full extension (same as hitbox)
          scale = 1.0;
        } else {
          // Recovery frames: gradually retracting from full extension
          const recFrame = this.attackFrame - ad.startup - ad.active;
          scale = 1 - recFrame / ad.recovery;
        }

        const extension = reach * scale;
        const armStart = CHAR_W / 2 - 4;
        const baseX = this.x - CHAR_W / 2;
        const extX = this.facing === 1
          ? baseX
          : baseX - extension;
        return {
          x: extX,
          y: GROUND_Y - CHAR_H,
          w: CHAR_W + extension,
          h: CHAR_H,
        };
      }
    }

    // Crouching: shorter hurtbox
    if (this.state === "crouch" || this.state === "crouchGuard") {
      const crouchH = CHAR_H * 0.7;
      return {
        x: this.x - CHAR_W / 2,
        y: GROUND_Y - crouchH,
        w: CHAR_W,
        h: crouchH,
      };
    }

    return {
      x: this.x - CHAR_W / 2,
      y: GROUND_Y - CHAR_H,
      w: CHAR_W,
      h: CHAR_H,
    };
  }

  get attackHitbox(): Hitbox | null {
    if (this.state !== "attack" || !this.attackData) return null;
    const ad = this.attackData;
    if (this.attackFrame < ad.startup) return null;
    if (this.attackFrame >= ad.startup + ad.active) return null;

    const reach = ad.range * 0.8;
    const hbW = reach;
    const hbH = 24;
    const armStart = CHAR_W / 2 - 4;
    const hbX = this.facing === 1 ? this.x + armStart : this.x - armStart - hbW;
    const hbY = GROUND_Y - CHAR_H * 0.65;

    return { x: hbX, y: hbY, w: hbW, h: hbH };
  }

  /** Total frames of the current attack */
  get attackTotalFrames(): number {
    if (!this.attackData) return 0;
    return this.attackData.startup + this.attackData.active + this.attackData.recovery;
  }

  handleInput(input: InputState, opponentX: number): void {
    // Update facing based on opponent position
    this.facing = opponentX > this.x ? 1 : -1;

    if (!this.isActionable) return;

    // Dash (priority over attacks)
    if (input.dash) {
      this.state = "dash";
      this.stateTimer = DASH_DURATION;
      this.velocityX = DASH_SPEED * this.facing;
      return;
    }

    // Attacks
    if (input.light) {
      this.startAttack("light");
      return;
    }
    if (input.medium) {
      this.startAttack("medium");
      return;
    }
    if (input.heavy) {
      this.startAttack("heavy");
      return;
    }

    // Movement direction detection
    const movingForward =
      (this.facing === 1 && input.right) || (this.facing === -1 && input.left);
    const movingBack =
      (this.facing === 1 && input.left) || (this.facing === -1 && input.right);

    // Crouch: S only = crouch (no guard), S + back = crouch guard
    if (input.down) {
      if (movingBack) {
        this.state = "crouchGuard";
      } else {
        this.state = "crouch";
      }
      this.velocityX = 0;
      return;
    }

    if (movingForward) {
      this.state = "walkForward";
      this.velocityX = WALK_SPEED * this.facing;
    } else if (movingBack) {
      this.state = "walkBack";
      this.velocityX = -BACK_WALK_SPEED * this.facing;
    } else {
      this.state = "idle";
      this.velocityX = 0;
    }
  }

  startThrow(): void {
    this.state = "throw";
    this.throwFrame = 0;
    this.throwHitConfirmed = false;
    this.velocityX = 0;
    this.attackData = null;
    this.attackFrame = 0;
  }

  private startAttack(type: AttackType): void {
    this.state = "attack";
    this.attackData = ATTACKS[type];
    this.attackFrame = 0;
    this.attackHitConfirmed = false;
    this.velocityX = 0;
  }

  update(): void {
    // Apply velocity
    this.x += this.velocityX;

    // Stage bounds
    this.x = Math.max(STAGE_LEFT + CHAR_W / 2, Math.min(STAGE_RIGHT - CHAR_W / 2, this.x));

    switch (this.state) {
      case "attack":
        this.attackFrame++;
        // Apply friction during attack (e.g. when pushed back on guard)
        this.velocityX *= 0.88;
        if (Math.abs(this.velocityX) < 0.5) this.velocityX = 0;
        if (this.attackFrame >= this.attackTotalFrames) {
          this.state = "idle";
          this.attackData = null;
          this.attackFrame = 0;
          this.velocityX = 0;
        }
        break;

      case "dash":
        this.stateTimer--;
        if (this.stateTimer <= 0) {
          this.state = "idle";
          this.velocityX = 0;
        }
        break;

      case "throw":
        this.throwFrame++;
        if (!this.throwHitConfirmed) {
          // Startup phase: waiting for grab to connect (handled by collision)
          if (this.throwFrame >= THROW_STARTUP) {
            // Throw whiffed (opponent moved away) — go to recovery
            this.throwHitConfirmed = false;
            this.state = "idle";
            this.throwFrame = 0;
            this.velocityX = 0;
          }
        } else {
          // Throw connected: play animation then recover
          if (this.throwFrame >= THROW_STARTUP + THROW_ACTIVE + THROW_RECOVERY) {
            this.state = "idle";
            this.throwFrame = 0;
            this.throwHitConfirmed = false;
            this.velocityX = 0;
          }
        }
        break;

      case "thrown":
        // Being thrown — stateTimer counts down, then enter knockdown
        this.stateTimer--;
        if (this.stateTimer <= 0) {
          this.state = "knockdown";
          this.stateTimer = KNOCKDOWN_DURATION;
          this.velocityX = THROW_PUSHBACK * -this.facing;
        }
        break;

      case "hitstun":
        this.stateTimer--;
        // Friction during hitstun
        this.velocityX *= 0.88;
        if (this.stateTimer <= 0) {
          this.state = "idle";
          this.velocityX = 0;
          this.comboCount = 0;
        }
        break;

      case "blockstun":
        this.stateTimer--;
        this.velocityX *= 0.88;
        if (this.stateTimer <= 0) {
          this.state = "idle";
          this.velocityX = 0;
        }
        break;

      case "knockdown":
        this.stateTimer--;
        this.velocityX *= 0.9;
        if (this.stateTimer <= 0) {
          this.state = "getup";
          this.stateTimer = GETUP_DURATION;
          this.velocityX = 0;
        }
        break;

      case "getup":
        this.stateTimer--;
        if (this.stateTimer <= 0) {
          this.state = "idle";
          this.velocityX = 0;
        }
        break;
    }
  }

  takeDamage(damage: number, pushback: number, hitstunFrames: number, fromFacing: Facing): void {
    this.hp = Math.max(0, this.hp - damage);
    this.state = "hitstun";
    this.stateTimer = hitstunFrames;
    this.velocityX = pushback * fromFacing;
    this.attackData = null;
    this.attackFrame = 0;
    this.comboCount++;
  }

  takeBlock(chipDamage: number, pushback: number, blockstunFrames: number, fromFacing: Facing): void {
    this.hp = Math.max(0, this.hp - chipDamage);
    this.state = "blockstun";
    this.stateTimer = blockstunFrames;
    this.velocityX = pushback * fromFacing;
    this.attackData = null;
    this.attackFrame = 0;
  }

  takeKnockdown(damage: number, pushback: number, fromFacing: Facing): void {
    this.hp = Math.max(0, this.hp - damage);
    this.state = "knockdown";
    this.stateTimer = KNOCKDOWN_DURATION;
    this.velocityX = pushback * fromFacing;
    this.attackData = null;
    this.attackFrame = 0;
  }

  takeThrown(damage: number): void {
    this.hp = Math.max(0, this.hp - damage);
    this.state = "thrown";
    this.stateTimer = THROW_ACTIVE; // held during throw animation
    this.velocityX = 0;
    this.attackData = null;
    this.attackFrame = 0;
  }

}
