import { InputState } from "./types";

// Server URL: detect from current page or use env
function getServerUrl(): string {
  // In production (GitHub Pages), connect to the self-hosted relay server
  const WS_HOST = (import.meta as any).env?.VITE_WS_HOST;
  if (WS_HOST) {
    return WS_HOST;
  }
  // Local dev: connect directly to server
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return `ws://${location.hostname}:3001`;
  }
  // Production: connect via reverse proxy
  return `wss://reisun.asuscomm.com/footsies-dojo/`;
}

export type NetworkState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "in_room"
  | "waiting_opponent"
  | "game_starting"
  | "playing"
  | "opponent_disconnected"
  | "error";

export interface NetworkCallbacks {
  onRoomCreated: (code: string) => void;
  onRoomJoined: (code: string, player: 1 | 2) => void;
  onOpponentJoined: () => void;
  onGameStart: (player: 1 | 2, seed: number) => void;
  onRemoteInput: (frame: number, input: InputState) => void;
  onOpponentDisconnected: () => void;
  onError: (message: string) => void;
}

export class NetworkClient {
  private ws: WebSocket | null = null;
  state: NetworkState = "disconnected";
  roomCode = "";
  playerNumber: 1 | 2 = 1;
  errorMessage = "";

  private callbacks: NetworkCallbacks;
  private pingInterval: number | null = null;

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.state = "connecting";
    this.errorMessage = "";

    const url = getServerUrl();
    console.log(`[Network] Connecting to ${url}`);

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.state = "error";
      this.errorMessage = "Failed to create WebSocket connection";
      this.callbacks.onError(this.errorMessage);
      return;
    }

    this.ws.onopen = () => {
      console.log("[Network] Connected");
      this.state = "connected";

      // Start ping interval
      this.pingInterval = window.setInterval(() => {
        this.send({ type: "ping" });
      }, 25_000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {
        console.warn("[Network] Invalid message:", event.data);
      }
    };

    this.ws.onclose = () => {
      console.log("[Network] Disconnected");
      this.cleanup();
      if (this.state === "playing") {
        this.state = "opponent_disconnected";
        this.callbacks.onOpponentDisconnected();
      } else if (this.state !== "error") {
        this.state = "disconnected";
      }
    };

    this.ws.onerror = () => {
      console.error("[Network] WebSocket error");
      this.state = "error";
      this.errorMessage = "Connection failed";
      this.callbacks.onError(this.errorMessage);
      this.cleanup();
    };
  }

  private handleMessage(msg: any): void {
    switch (msg.type) {
      case "room_created":
        this.roomCode = msg.code;
        this.state = "waiting_opponent";
        this.callbacks.onRoomCreated(msg.code);
        break;

      case "room_joined":
        this.roomCode = msg.code;
        this.playerNumber = msg.player;
        this.state = "in_room";
        this.callbacks.onRoomJoined(msg.code, msg.player);
        break;

      case "opponent_joined":
        this.callbacks.onOpponentJoined();
        break;

      case "game_start":
        this.playerNumber = msg.player;
        this.state = "playing";
        this.callbacks.onGameStart(msg.player, msg.seed);
        break;

      case "remote_input":
        this.callbacks.onRemoteInput(msg.frame, msg.input);
        break;

      case "opponent_disconnected":
        this.state = "opponent_disconnected";
        this.callbacks.onOpponentDisconnected();
        break;

      case "error":
        this.errorMessage = msg.message;
        this.callbacks.onError(msg.message);
        break;

      case "pong":
        // heartbeat response, ignore
        break;
    }
  }

  createRoom(): void {
    this.send({ type: "create_room" });
  }

  joinRoom(code: string): void {
    this.send({ type: "join_room", code: code.toUpperCase().trim() });
  }

  sendInput(frame: number, input: InputState): void {
    this.send({ type: "input", frame, input });
  }

  disconnect(): void {
    this.cleanup();
    this.state = "disconnected";
    this.roomCode = "";
    this.errorMessage = "";
  }

  private send(msg: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private cleanup(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
