import { BENCH_SIZE, FORMATION_BY_ID, playInSlot } from "./formations";
import type { KitChoice } from "./kits";
import { isLeagueId, type LeagueId } from "./leagues";
import { squadStrength, type SimTeam } from "./simulate";
import type { FormationId, GoalScorer, PlayerSeason } from "./types";

export const PVP_PARTY = "main";
export const PVP_CLIENT_KEY = "era-draft-pvp-client";
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SQUAD_SIZE = 11 + BENCH_SIZE;

export type PvpPhase = "lobby" | "match";

export type PvpSquad = {
  teamName: string;
  formationId: FormationId;
  xi: PlayerSeason[];
  bench: PlayerSeason[];
};

export type PvpPlayerPublic = {
  id: string;
  teamName: string;
  formationId: FormationId | null;
  filled: number;
  ready: boolean;
  connected: boolean;
  rematch: boolean;
  kit: KitChoice;
};

export type PvpMatch = {
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  scorers: GoalScorer[];
  homeSquad: PvpSquad;
  awaySquad: PvpSquad;
  homeKit: KitChoice;
  awayKit: KitChoice;
};

export type PvpRoomPublic = {
  code: string;
  leagueId: LeagueId | null;
  hostId: string | null;
  phase: PvpPhase;
  players: PvpPlayerPublic[];
  match: PvpMatch | null;
};

export type ClientMessage =
  | { type: "hello"; teamName?: string; leagueId?: LeagueId }
  | { type: "set-league"; leagueId: LeagueId }
  | { type: "set-profile"; teamName: string; formationId?: FormationId | null }
  | { type: "set-kit"; kit: KitChoice }
  | { type: "progress"; filled: number }
  | { type: "ready"; squad: PvpSquad; kit?: KitChoice }
  | { type: "unready" }
  | { type: "rematch" };

export type ServerMessage =
  | { type: "state"; room: PvpRoomPublic }
  | { type: "error"; message: string };

export function isRoomCode(value: string): boolean {
  return (
    value.length === ROOM_CODE_LENGTH &&
    [...value.toUpperCase()].every((char) => ROOM_CODE_ALPHABET.includes(char))
  );
}

export function randomRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const data = JSON.parse(raw) as ServerMessage;
    if (data?.type === "state" || data?.type === "error") return data;
    return null;
  } catch {
    return null;
  }
}

const FORMATION_IDS: FormationId[] = ["433", "442", "4231", "352", "541", "343"];

function isFormationId(value: unknown): value is FormationId {
  return typeof value === "string" && FORMATION_IDS.includes(value as FormationId);
}

function isSimPlayer(value: unknown): value is PlayerSeason {
  if (!value || typeof value !== "object") return false;
  const player = value as PlayerSeason;
  return (
    typeof player.id === "string" &&
    typeof player.playerId === "string" &&
    typeof player.name === "string" &&
    typeof player.slot === "string" &&
    typeof player.group === "string" &&
    typeof player.overall === "number" &&
    Number.isFinite(player.overall) &&
    typeof player.minutes === "number"
  );
}

function clampPlayer(player: PlayerSeason): PlayerSeason {
  return {
    ...player,
    overall: Math.max(1, Math.min(99, Math.round(player.overall))),
    minutes: Math.max(0, Math.min(8000, Math.round(player.minutes))),
  };
}

export function isValidSquad(squad: unknown): squad is PvpSquad {
  if (!squad || typeof squad !== "object") return false;
  const value = squad as PvpSquad;
  if (typeof value.teamName !== "string" || !isFormationId(value.formationId)) return false;
  if (!Array.isArray(value.xi) || value.xi.length !== 11) return false;
  if (!Array.isArray(value.bench) || value.bench.length !== BENCH_SIZE) return false;
  if (!value.xi.every(isSimPlayer) || !value.bench.every(isSimPlayer)) return false;
  const ids = new Set(value.xi.map((player) => player.id));
  if (ids.size !== 11) return false;
  for (const player of value.bench) {
    if (ids.has(player.id)) return false;
    ids.add(player.id);
  }
  if (!value.xi.some((player) => player.group === "GK")) return false;
  if (!value.bench.some((player) => player.group === "GK")) return false;
  return true;
}

export function sanitizeSquad(squad: PvpSquad): PvpSquad {
  return {
    teamName: squad.teamName.trim().slice(0, 32) || "XI",
    formationId: squad.formationId,
    xi: squad.xi.map(clampPlayer),
    bench: squad.bench.map(clampPlayer),
  };
}

export function serializeSquad(
  teamName: string,
  formationId: FormationId,
  xi: Record<string, PlayerSeason | null>,
  bench: (PlayerSeason | null)[],
): PvpSquad | null {
  const formation = FORMATION_BY_ID[formationId];
  const xiPlayers = formation.slots
    .map((slot) => {
      const player = xi[slot.id];
      return player ? playInSlot(player, slot.kind, formation) : null;
    })
    .filter((player): player is PlayerSeason => Boolean(player));
  const benchPlayers = bench.filter((player): player is PlayerSeason => Boolean(player));
  const squad = {
    teamName: teamName.trim() || "XI",
    formationId,
    xi: xiPlayers,
    bench: benchPlayers,
  };
  return isValidSquad(squad) ? squad : null;
}

export function squadToXiRecord(squad: PvpSquad): Record<string, PlayerSeason | null> {
  const formation = FORMATION_BY_ID[squad.formationId];
  return Object.fromEntries(formation.slots.map((slot, index) => [slot.id, squad.xi[index] ?? null]));
}

export function makePvpSimTeam(id: string, squad: PvpSquad): SimTeam {
  const { attack, defense } = squadStrength(squad.xi, squad.bench);
  const name = squad.teamName.trim() || "XI";
  return {
    id,
    name,
    club: name,
    season: "pvp",
    isPlayer: true,
    attack,
    defense,
    xi: squad.xi,
    bench: squad.bench,
  };
}

export function readLeagueId(value: unknown): LeagueId | null {
  return isLeagueId(value) ? value : null;
}

