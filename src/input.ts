import { InputState } from "./types";

export class InputHandler {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  private prevKeys = new Set<string>();

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
  }

  isDown(key: string): boolean {
    return this.keys.has(key);
  }

  wasPressed(key: string): boolean {
    return this.justPressed.has(key);
  }

  getPlayerInput(): InputState {
    return {
      left: this.isDown("a"),
      right: this.isDown("d"),
      dash: this.wasPressed("w"),
      light: this.wasPressed("j"),
      medium: this.wasPressed("k"),
      heavy: this.wasPressed("l"),
    };
  }
}
