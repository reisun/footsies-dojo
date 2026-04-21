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
const KNOCKDOWN_DURATION = 30;
const GETUP_DURATION = 15;

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
    this.comboCount = 0;
  }

  get isActionable(): boolean {
    return this.state === "idle" || this.state === "walkForward" || this.state === "walkBack";
  }

  get isAttacking(): boolean {
    return this.state === "attack";
  }

  get isGuarding(): boolean {
    return this.state === "walkBack" && !this.isAttacking;
  }

  get hurtbox(): Hitbox {
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

    const reach = ad.range;
    const hbW = reach;
    const hbH = 24;
    const hbX = this.facing === 1 ? this.x + CHAR_W / 2 - 8 : this.x - CHAR_W / 2 + 8 - hbW;
    const hbY = GROUND_Y - CHAR_H * 0.55;

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

    // Movement
    const movingForward =
      (this.facing === 1 && input.right) || (this.facing === -1 && input.left);
    const movingBack =
      (this.facing === 1 && input.left) || (this.facing === -1 && input.right);

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
    this.velocityX = pushback * -fromFacing;
    this.attackData = null;
    this.attackFrame = 0;
    this.comboCount++;
  }

  takeBlock(chipDamage: number, pushback: number, blockstunFrames: number, fromFacing: Facing): void {
    this.hp = Math.max(0, this.hp - chipDamage);
    this.state = "blockstun";
    this.stateTimer = blockstunFrames;
    this.velocityX = pushback * -fromFacing;
    this.attackData = null;
    this.attackFrame = 0;
  }

  takeKnockdown(damage: number, pushback: number, fromFacing: Facing): void {
    this.hp = Math.max(0, this.hp - damage);
    this.state = "knockdown";
    this.stateTimer = KNOCKDOWN_DURATION;
    this.velocityX = pushback * -fromFacing;
    this.attackData = null;
    this.attackFrame = 0;
  }
}
