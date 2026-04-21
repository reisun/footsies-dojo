import { WebSocketServer, WebSocket } from "ws";
import { createServer, IncomingMessage } from "http";

// --- Types ---

interface InputState {
  left: boolean;
  right: boolean;
  down: boolean;
  dash: boolean;
  light: boolean;
  medium: boolean;
  heavy: boolean;
}

interface Player {
  ws: WebSocket;
  number: 1 | 2;
  alive: boolean;
}

interface Room {
  code: string;
  players: Player[];
  createdAt: number;
  lastActivity: number;
  seed: number;
}

// Client -> Server messages
type ClientMessage =
  | { type: "create_room" }
  | { type: "join_room"; code: string }
  | { type: "input"; frame: number; input: InputState }
  | { type: "ping" };

// Server -> Client messages
type ServerMessage =
  | { type: "room_created"; code: string }
  | { type: "room_joined"; code: string; player: 1 | 2 }
  | { type: "opponent_joined" }
  | { type: "game_start"; player: 1 | 2; seed: number }
  | { type: "remote_input"; frame: number; input: InputState }
  | { type: "opponent_disconnected" }
  | { type: "error"; message: string }
  | { type: "pong" };

// --- State ---

const PORT = 3001;
const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 10_000;
const ROOM_TTL = 10 * 60 * 1000; // 10 minutes

const rooms = new Map<string, Room>();
const playerRooms = new Map<WebSocket, string>();

// --- Helpers ---

function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code: string;
  do {
    code = Array.from({ length: 4 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
  } while (rooms.has(code));
  return code;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function getOpponent(room: Room, ws: WebSocket): Player | undefined {
  return room.players.find((p) => p.ws !== ws);
}

function cleanupRoom(code: string): void {
  const room = rooms.get(code);
  if (!room) return;
  for (const p of room.players) {
    playerRooms.delete(p.ws);
  }
  rooms.delete(code);
  log(`Room ${code} cleaned up`);
}

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

// --- Message handlers ---

function handleCreateRoom(ws: WebSocket): void {
  if (playerRooms.has(ws)) {
    send(ws, { type: "error", message: "Already in a room" });
    return;
  }

  const code = generateRoomCode();
  const player: Player = { ws, number: 1, alive: true };
  const room: Room = {
    code,
    players: [player],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    seed: Math.floor(Math.random() * 2_147_483_647),
  };

  rooms.set(code, room);
  playerRooms.set(ws, code);

  send(ws, { type: "room_created", code });
  send(ws, { type: "room_joined", code, player: 1 });
  log(`Room ${code} created (${rooms.size} rooms total)`);
}

function handleJoinRoom(ws: WebSocket, code: string): void {
  if (playerRooms.has(ws)) {
    send(ws, { type: "error", message: "Already in a room" });
    return;
  }

  const normalized = code.toUpperCase().trim();
  const room = rooms.get(normalized);

  if (!room) {
    send(ws, { type: "error", message: "Room not found" });
    return;
  }

  if (room.players.length >= 2) {
    send(ws, { type: "error", message: "Room is full" });
    return;
  }

  const player: Player = { ws, number: 2, alive: true };
  room.players.push(player);
  room.lastActivity = Date.now();
  playerRooms.set(ws, normalized);

  send(ws, { type: "room_joined", code: normalized, player: 2 });

  // Notify player 1
  const p1 = room.players[0];
  send(p1.ws, { type: "opponent_joined" });

  // Start the game for both players
  for (const p of room.players) {
    send(p.ws, { type: "game_start", player: p.number, seed: room.seed });
  }

  log(`Room ${normalized} game started (P1 + P2)`);
}

function handleInput(
  ws: WebSocket,
  frame: number,
  input: InputState
): void {
  const code = playerRooms.get(ws);
  if (!code) return;

  const room = rooms.get(code);
  if (!room) return;

  room.lastActivity = Date.now();

  const opponent = getOpponent(room, ws);
  if (opponent) {
    send(opponent.ws, { type: "remote_input", frame, input });
  }
}

function handleDisconnect(ws: WebSocket): void {
  const code = playerRooms.get(ws);
  if (!code) return;

  const room = rooms.get(code);
  if (!room) {
    playerRooms.delete(ws);
    return;
  }

  // Notify opponent
  const opponent = getOpponent(room, ws);
  if (opponent) {
    send(opponent.ws, { type: "opponent_disconnected" });
  }

  // Remove this player
  room.players = room.players.filter((p) => p.ws !== ws);
  playerRooms.delete(ws);

  // If room is empty, clean it up
  if (room.players.length === 0) {
    cleanupRoom(code);
  }

  log(`Player disconnected from room ${code} (${room.players.length} remaining)`);
}

// --- Server setup ---

const httpServer = createServer((_req, res) => {
  // Health check endpoint
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify({ status: "ok", rooms: rooms.size }));
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const addr = req.socket.remoteAddress ?? "unknown";
  log(`Connection from ${addr}`);

  // Heartbeat state
  let isAlive = true;

  ws.on("pong", () => {
    isAlive = true;
  });

  ws.on("message", (data: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    if (!msg.type) {
      send(ws, { type: "error", message: "Missing message type" });
      return;
    }

    switch (msg.type) {
      case "create_room":
        handleCreateRoom(ws);
        break;
      case "join_room":
        if (!msg.code || typeof msg.code !== "string") {
          send(ws, { type: "error", message: "Missing room code" });
          return;
        }
        handleJoinRoom(ws, msg.code);
        break;
      case "input":
        if (typeof msg.frame !== "number" || !msg.input) {
          send(ws, { type: "error", message: "Invalid input message" });
          return;
        }
        handleInput(ws, msg.frame, msg.input);
        break;
      case "ping":
        send(ws, { type: "pong" });
        break;
      default:
        send(ws, { type: "error", message: "Unknown message type" });
    }
  });

  ws.on("close", () => {
    handleDisconnect(ws);
    log(`Connection closed from ${addr}`);
  });

  ws.on("error", (err: Error) => {
    log(`WebSocket error from ${addr}: ${err.message}`);
    handleDisconnect(ws);
  });

  // Heartbeat: server pings client every 30s
  const heartbeat = setInterval(() => {
    if (!isAlive) {
      log(`Heartbeat timeout for ${addr}, terminating`);
      clearInterval(heartbeat);
      ws.terminate();
      return;
    }
    isAlive = false;
    ws.ping();
  }, HEARTBEAT_INTERVAL);

  ws.on("close", () => {
    clearInterval(heartbeat);
  });
});

// Room cleanup: check for stale rooms every minute
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL) {
      log(`Room ${code} expired (inactive for ${ROOM_TTL / 1000}s)`);
      for (const p of room.players) {
        send(p.ws, { type: "error", message: "Room expired due to inactivity" });
        p.ws.close();
      }
      cleanupRoom(code);
    }
  }
}, 60_000);

httpServer.listen(PORT, () => {
  log(`footsies-dojo relay server listening on port ${PORT}`);
});
