import { routePartykitRequest, Server, type Connection, type WSMessage } from "partyserver";
import {
  isValidSquad,
  makePvpSimTeam,
  readLeagueId,
  sanitizeSquad,
  type ClientMessage,
  type PvpMatch,
  type PvpPlayerPublic,
  type PvpRoomPublic,
  type PvpSquad,
  type ServerMessage,
} from "../lib/pvp";
import { simulateMatch } from "../lib/simulate";
import type { FormationId } from "../lib/types";

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_PLAYERS = 2;

type Seat = PvpPlayerPublic & {
  squad: PvpSquad | null;
};

type RoomRecord = {
  code: string;
  leagueId: PvpRoomPublic["leagueId"];
  hostId: string | null;
  phase: PvpRoomPublic["phase"];
  seats: Seat[];
  match: PvpMatch | null;
  updatedAt: number;
};

function emptyRoom(code: string): RoomRecord {
  return {
    code,
    leagueId: null,
    hostId: null,
    phase: "lobby",
    seats: [],
    match: null,
    updatedAt: Date.now(),
  };
}

function publicRoom(room: RoomRecord): PvpRoomPublic {
  return {
    code: room.code,
    leagueId: room.leagueId,
    hostId: room.hostId,
    phase: room.phase,
    match: room.match,
    players: room.seats.map((seat) => ({
      id: seat.id,
      teamName: seat.teamName,
      formationId: seat.formationId,
      filled: seat.filled,
      ready: seat.ready,
      connected: seat.connected,
      rematch: seat.rematch,
    })),
  };
}

function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const data = JSON.parse(raw) as ClientMessage;
    if (!data || typeof data !== "object" || typeof data.type !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

export class MatchRoom extends Server {
  static options = { hibernate: true };

  room: RoomRecord = emptyRoom("ROOM");

  async onStart() {
    const saved = await this.ctx.storage.get<RoomRecord>("room");
    this.room = saved ?? emptyRoom(this.name.toUpperCase());
    this.room.code = this.name.toUpperCase();
  }

  async persist() {
    this.room.updatedAt = Date.now();
    await this.ctx.storage.put("room", this.room);
  }

  send(connection: Connection, message: ServerMessage) {
    connection.send(JSON.stringify(message));
  }

  broadcastState() {
    const payload: ServerMessage = { type: "state", room: publicRoom(this.room) };
    this.broadcast(JSON.stringify(payload));
  }

  async saveAndBroadcast() {
    await this.persist();
    this.broadcastState();
  }

  expireIfStale() {
    if (Date.now() - this.room.updatedAt > ROOM_TTL_MS) {
      this.room = emptyRoom(this.name.toUpperCase());
    }
  }

  seatById(id: string) {
    return this.room.seats.find((seat) => seat.id === id);
  }

  async onConnect(connection: Connection) {
    this.expireIfStale();
    let seat = this.seatById(connection.id);
    if (!seat) {
      if (this.room.seats.length >= MAX_PLAYERS) {
        this.send(connection, { type: "error", message: "This room is full." });
        connection.close(4000, "full");
        return;
      }
      seat = {
        id: connection.id,
        teamName: this.room.seats.length === 0 ? "Home" : "Away",
        formationId: null,
        filled: 0,
        ready: false,
        connected: true,
        rematch: false,
        squad: null,
      };
      this.room.seats.push(seat);
      this.room.hostId ??= seat.id;
    } else {
      seat.connected = true;
    }
    await this.saveAndBroadcast();
  }

  async onClose(connection: Connection) {
    const seat = this.seatById(connection.id);
    if (!seat) return;
    seat.connected = false;
    await this.saveAndBroadcast();
  }

  async onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    const parsed = parseClientMessage(message);
    if (!parsed) return;
    const seat = this.seatById(connection.id);
    if (!seat) {
      this.send(connection, { type: "error", message: "You are not in this room." });
      return;
    }

    try {
      await this.handle(connection, seat, parsed);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Something went wrong.";
      this.send(connection, { type: "error", message: text });
    }
  }

  async handle(connection: Connection, seat: Seat, message: ClientMessage) {
    switch (message.type) {
      case "hello": {
        if (message.teamName?.trim()) seat.teamName = message.teamName.trim().slice(0, 32);
        if (!this.room.leagueId) this.room.leagueId = readLeagueId(message.leagueId);
        await this.saveAndBroadcast();
        return;
      }
      case "set-league": {
        if (this.room.leagueId) return;
        const leagueId = readLeagueId(message.leagueId);
        if (!leagueId) return;
        this.room.leagueId = leagueId;
        await this.saveAndBroadcast();
        return;
      }
      case "set-profile": {
        if (this.room.phase === "match") return;
        if (message.teamName.trim()) seat.teamName = message.teamName.trim().slice(0, 32);
        if (message.formationId !== undefined) {
          seat.formationId = (message.formationId as FormationId | null) ?? null;
          if (!seat.formationId) {
            seat.filled = 0;
            seat.ready = false;
            seat.squad = null;
          }
        }
        await this.saveAndBroadcast();
        return;
      }
      case "progress": {
        if (this.room.phase === "match" || seat.ready) return;
        seat.filled = Math.max(0, Math.min(18, Math.round(message.filled)));
        await this.saveAndBroadcast();
        return;
      }
      case "ready": {
        if (this.room.phase === "match") return;
        if (!isValidSquad(message.squad)) {
          this.send(connection, { type: "error", message: "That squad is not ready yet." });
          return;
        }
        seat.squad = sanitizeSquad(message.squad);
        seat.teamName = seat.squad.teamName;
        seat.formationId = seat.squad.formationId;
        seat.filled = 18;
        seat.ready = true;
        seat.rematch = false;
        this.tryKickoff();
        await this.saveAndBroadcast();
        return;
      }
      case "unready": {
        if (this.room.phase === "match") return;
        seat.ready = false;
        seat.squad = null;
        await this.saveAndBroadcast();
        return;
      }
      case "rematch": {
        if (this.room.phase !== "match") return;
        seat.rematch = true;
        if (this.room.seats.length === MAX_PLAYERS && this.room.seats.every((item) => item.rematch)) {
          this.resetForRematch();
        }
        await this.saveAndBroadcast();
        return;
      }
    }
  }

  tryKickoff() {
    if (this.room.phase === "match") return;
    if (this.room.seats.length < MAX_PLAYERS) return;
    const [home, away] = this.room.seats;
    if (!home?.ready || !away?.ready || !home.squad || !away.squad) return;
    const homeTeam = makePvpSimTeam(home.id, home.squad);
    const awayTeam = makePvpSimTeam(away.id, away.squad);
    const score = simulateMatch(homeTeam, awayTeam);
    this.room.match = {
      homeId: home.id,
      awayId: away.id,
      homeName: home.squad.teamName,
      awayName: away.squad.teamName,
      homeGoals: score.homeGoals,
      awayGoals: score.awayGoals,
      scorers: score.scorers,
      homeSquad: home.squad,
      awaySquad: away.squad,
    };
    this.room.phase = "match";
  }

  resetForRematch() {
    this.room.phase = "lobby";
    this.room.match = null;
    for (const seat of this.room.seats) {
      seat.formationId = null;
      seat.filled = 0;
      seat.ready = false;
      seat.rematch = false;
      seat.squad = null;
    }
  }
}

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const routed = await routePartykitRequest(request, env, { cors: true });
    if (routed) return routed;
    const path = new URL(request.url).pathname;
    if (path === "/" || path === "/health") {
      return Response.json({ ok: true, service: "era-draft-rooms" });
    }
    return new Response("Not Found", { status: 404 });
  },
};
