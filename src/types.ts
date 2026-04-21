// --- Core types ---

export const CANVAS_W = 960;
export const CANVAS_H = 540;
export const GROUND_Y = 420; // feet position
export const STAGE_LEFT = 40;
export const STAGE_RIGHT = CANVAS_W - 40;
export const FPS = 60;
export const FRAME_MS = 1000 / FPS;

export const CHAR_W = 48;
export const CHAR_H = 64;

export const MAX_HP = 1000;
export const ROUND_TIME = 60; // seconds
export const ROUNDS_TO_WIN = 2;

export type Facing = 1 | -1; // 1 = right, -1 = left

export type FighterState =
  | "idle"
  | "walkForward"
  | "walkBack"
  | "crouch"
  | "crouchGuard"
  | "dash"
  | "attack"
  | "throw"
  | "thrown"
  | "hitstun"
  | "blockstun"
  | "knockdown"
  | "getup";

export type AttackType = "light" | "medium" | "heavy";

export interface AttackData {
  type: AttackType;
  startup: number; // frames before hitbox active
  active: number; // frames hitbox is active
  recovery: number; // frames after active ends
  damage: number;
  chipDamage: number;
  hitstun: number; // frames opponent is in hitstun
  blockstun: number;
  range: number; // horizontal reach from character center
  pushback: number; // how far opponent is pushed on hit
  guardPushback: number;
  attackerGuardPushback: number; // how far attacker is pushed back when blocked
}

export interface Hitbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FighterSnapshot {
  x: number;
  hp: number;
  state: FighterState;
  facing: Facing;
  attackType: AttackType | null;
  attackFrame: number;
  stateTimer: number;
  roundsWon: number;
  velocityX: number;
}

export interface GameStateSnapshot {
  player: FighterSnapshot;
  cpu: FighterSnapshot;
  timer: number;
  round: number;
  playerRoundsWon: number;
  cpuRoundsWon: number;
  screen: ScreenType;
  hitStop: number;
}

export type ScreenType = "title" | "battle" | "result" | "online_lobby" | "online_waiting" | "online_join";

export type Difficulty = "easy" | "normal" | "hard";

export type GameMode = "cpu" | "online";

export interface InputState {
  left: boolean;
  right: boolean;
  down: boolean;
  dash: boolean;
  light: boolean;
  medium: boolean;
  heavy: boolean;
}
