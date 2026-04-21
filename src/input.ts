import { InputState } from "./types";

const DOUBLE_TAP_WINDOW = 12; // frames within which second tap must occur

export class InputHandler {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private prevKeys = new Set<string>();

  // Double-tap dash detection
  private lastRightPressFrame = -999;
  private lastLeftPressFrame = -999;
  private frameCount = 0;
  private dashRight = false;
  private dashLeft = false;

  constructor() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    // Prevent losing key state on blur
    window.addEventListener("blur", () => {
      this.keys.clear();
    });
  }

  update(): void {
    this.justPressed.clear();
    for (const k of this.keys) {
      if (!this.prevKeys.has(k)) {
        this.justPressed.add(k);
      }
    }
    this.prevKeys = new Set(this.keys);

    // Detect double-tap for dash
    this.dashRight = false;
    this.dashLeft = false;
    this.frameCount++;

    if (this.wasPressed("d")) {
      if (this.frameCount - this.lastRightPressFrame <= DOUBLE_TAP_WINDOW) {
        this.dashRight = true;
      }
      this.lastRightPressFrame = this.frameCount;
    }
    if (this.wasPressed("a")) {
      if (this.frameCount - this.lastLeftPressFrame <= DOUBLE_TAP_WINDOW) {
        this.dashLeft = true;
      }
      this.lastLeftPressFrame = this.frameCount;
    }
  }

  isDown(key: string): boolean {
    return this.keys.has(key);
  }

  wasPressed(key: string): boolean {
    return this.justPressed.has(key);
  }

  getPlayerInput(facing: number): InputState {
    // Dash = double-tap in the direction the player is facing (forward)
    const forwardDash = facing > 0 ? this.dashRight : this.dashLeft;
    return {
      left: this.isDown("a"),
      right: this.isDown("d"),
      down: this.isDown("s"),
      dash: forwardDash,
      light: this.wasPressed("j"),
      medium: this.wasPressed("k"),
      heavy: this.wasPressed("l"),
    };
  }
}
