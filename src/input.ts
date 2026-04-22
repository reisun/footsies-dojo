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
// Button indices: 0=□  1=✕  2=◯  3=△  D-pad via hat switch axis
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

  private pollGamepad(): void {
    this.gpKeys.clear();
    const gp = navigator.getGamepads()[0];
    if (!gp) return;

    const isStandard = gp.mapping === "standard";
    const buttonMap = isStandard ? STANDARD_BUTTON_MAP : RAW_BUTTON_MAP;

    for (const [idx, keys] of buttonMap) {
      if (idx < gp.buttons.length && gp.buttons[idx]?.pressed) {
        for (const k of keys) this.gpKeys.add(k);
      }
    }

    // D-pad: standard uses buttons 12-15, non-standard uses hat switch on axis 9
    if (!isStandard && gp.axes.length > 9) {
      // Hat switch encodes 8 directions on a single axis:
      // -1=N  -0.71=NE  -0.43=E  -0.14=SE  0.14=S  0.43=SW  0.71=W  1.0=NW
      const hat = gp.axes[9];
      const dir = Math.round((hat + 1) * 3.5); // 0=N 1=NE 2=E 3=SE 4=S 5=SW 6=W 7=NW
      if (dir >= 0 && dir <= 7) {
        if (dir === 0 || dir === 1 || dir === 7) this.gpKeys.add("w");  // up
        if (dir === 1 || dir === 2 || dir === 3) this.gpKeys.add("d");  // right
        if (dir === 3 || dir === 4 || dir === 5) this.gpKeys.add("s");  // down
        if (dir === 5 || dir === 6 || dir === 7) this.gpKeys.add("a");  // left
      }
    }

    // Left analog stick
    if (gp.axes[0] < -STICK_THRESHOLD) this.gpKeys.add("a");
    if (gp.axes[0] > STICK_THRESHOLD) this.gpKeys.add("d");
    if (gp.axes[1] < -STICK_THRESHOLD) this.gpKeys.add("w");
    if (gp.axes[1] > STICK_THRESHOLD) this.gpKeys.add("s");
  }
}
