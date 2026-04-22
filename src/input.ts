import { InputState } from "./types";

const DOUBLE_TAP_WINDOW = 12; // frames within which second tap must occur
const STICK_THRESHOLD = 0.5;

// W3C "standard" mapping (browser remaps to this layout)
// Button indices: 0=✕/A  1=◯/B  2=□/X  3=△/Y  D-pad=12-15
const STANDARD_BUTTON_MAP: [number, string[]][] = [
  [0, ["k", "enter"]],   // ✕/A → medium + confirm
  [1, ["l", "escape"]],  // ◯/B → heavy + back
  [2, ["j"]],            // □/X → light
  [8, ["escape"]],       // Select/Share
  [9, ["enter"]],        // Start/Options
  [12, ["w"]],           // D-pad Up
  [13, ["s"]],           // D-pad Down
  [14, ["a"]],           // D-pad Left
  [15, ["d"]],           // D-pad Right
];

// Non-standard (raw) mapping — PS native button order
// Button indices: 0=□  1=✕  2=◯  3=△  D-pad position varies
const RAW_BUTTON_MAP: [number, string[]][] = [
  [0, ["j"]],            // □ → light
  [1, ["k", "enter"]],   // ✕ → medium + confirm
  [2, ["l", "escape"]],  // ◯ → heavy + back
  [8, ["escape"]],       // Share/Create
  [9, ["enter"]],        // Options
];

export class InputHandler {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private prevKeys = new Set<string>();

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

  private debugTimer = 0;

  private pollGamepad(): void {
    this.gpKeys.clear();
    const gp = navigator.getGamepads()[0];
    if (!gp) return;

    // Temporary debug: log pressed buttons and non-zero axes every 60 frames
    this.debugTimer++;
    if (this.debugTimer % 60 === 0) {
      const pressed = gp.buttons
        .map((b, i) => (b.pressed ? i : -1))
        .filter((i) => i >= 0);
      const axes = gp.axes
        .map((v, i) => (Math.abs(v) > 0.1 ? `${i}:${v.toFixed(2)}` : ""))
        .filter(Boolean);
      if (pressed.length || axes.length) {
        console.log(
          `[Gamepad] mapping="${gp.mapping}" buttons=${gp.buttons.length}`,
          `pressed=[${pressed}]`,
          `axes=[${axes}]`
        );
      }
    }

    const isStandard = gp.mapping === "standard";
    const buttonMap = isStandard ? STANDARD_BUTTON_MAP : RAW_BUTTON_MAP;

    for (const [idx, keys] of buttonMap) {
      if (idx < gp.buttons.length && gp.buttons[idx]?.pressed) {
        for (const k of keys) this.gpKeys.add(k);
      }
    }

    // D-pad: standard layout uses fixed 12-15,
    // non-standard controllers put D-pad as the last 4 buttons
    if (!isStandard) {
      const n = gp.buttons.length;
      if (n >= 4) {
        if (gp.buttons[n - 4]?.pressed) this.gpKeys.add("w");
        if (gp.buttons[n - 3]?.pressed) this.gpKeys.add("s");
        if (gp.buttons[n - 2]?.pressed) this.gpKeys.add("a");
        if (gp.buttons[n - 1]?.pressed) this.gpKeys.add("d");
      }
    }

    // Left analog stick
    if (gp.axes[0] < -STICK_THRESHOLD) this.gpKeys.add("a");
    if (gp.axes[0] > STICK_THRESHOLD) this.gpKeys.add("d");
    if (gp.axes[1] < -STICK_THRESHOLD) this.gpKeys.add("w");
    if (gp.axes[1] > STICK_THRESHOLD) this.gpKeys.add("s");
  }
}
