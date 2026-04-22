import { InputState } from "./types";

const DOUBLE_TAP_WINDOW = 12; // frames within which second tap must occur
const STICK_THRESHOLD = 0.5;

// Standard Gamepad API button → virtual key(s)
// PS: □=2 ✕=0 ◯=1 △=3  Xbox: X=2 A=0 B=1 Y=3
const GAMEPAD_BUTTON_MAP: [number, string[]][] = [
  [0, ["k", "enter"]],  // Cross/A → medium + confirm
  [1, ["l", "escape"]],  // Circle/B → heavy + back
  [2, ["j"]],            // Square/X → light
  [8, ["escape"]],       // Select/Back
  [9, ["enter"]],        // Start
  [12, ["w"]],           // D-pad Up
  [13, ["s"]],           // D-pad Down
  [14, ["a"]],           // D-pad Left
  [15, ["d"]],           // D-pad Right
];

export class InputHandler {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private prevKeys = new Set<string>();

  // Gamepad virtual keys (tracked separately for clean press detection)
  private gpKeys = new Set<string>();
  private prevGpKeys = new Set<string>();

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
    window.addEventListener("blur", () => {
      this.keys.clear();
    });
  }

  update(): void {
    this.pollGamepad();

    // Detect just-pressed from merged keyboard + gamepad
    this.justPressed.clear();
    const allCurrent = new Set([...this.keys, ...this.gpKeys]);
    const allPrev = new Set([...this.prevKeys, ...this.prevGpKeys]);
    for (const k of allCurrent) {
      if (!allPrev.has(k)) {
        this.justPressed.add(k);
      }
    }
    this.prevKeys = new Set(this.keys);
    this.prevGpKeys = new Set(this.gpKeys);

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
    return this.keys.has(key) || this.gpKeys.has(key);
  }

  wasPressed(key: string): boolean {
    return this.justPressed.has(key);
  }

  getPlayerInput(facing: number): InputState {
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

  private pollGamepad(): void {
    this.gpKeys.clear();
    const gp = navigator.getGamepads()[0];
    if (!gp) return;

    for (const [idx, keys] of GAMEPAD_BUTTON_MAP) {
      if (gp.buttons[idx]?.pressed) {
        for (const k of keys) this.gpKeys.add(k);
      }
    }

    // Left analog stick
    if (gp.axes[0] < -STICK_THRESHOLD) this.gpKeys.add("a");
    if (gp.axes[0] > STICK_THRESHOLD) this.gpKeys.add("d");
    if (gp.axes[1] < -STICK_THRESHOLD) this.gpKeys.add("w");
    if (gp.axes[1] > STICK_THRESHOLD) this.gpKeys.add("s");
  }
}
