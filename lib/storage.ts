import { REROLLS_PER_DRAFT } from "./draft";
import { FORMATION_BY_ID } from "./formations";
import { isLeagueId, type LeagueId } from "./leagues";
import type { FormationId, GameState, PlayerSeason } from "./types";

const STORAGE_KEY = "era-draft-v2";
const LEGACY_KEY = "epl-era-draft-v1";

type SavedGame = {
  version: 1 | 2;
  leagueId?: LeagueId;
  phase: GameState["phase"];
  teamName: string;
  formationId: FormationId | null;
  xi: Record<string, string | null>;
  bench: (string | null)[];
  usedPlayerIds: string[];
  usedClubSeasons: string[];
  rerollsLeft?: number;
  offer: { club: string; clubKey: string; season: string } | null;
  league: GameState["league"];
};

export type SavedMeta = {
  phase: GameState["phase"];
  leagueId: LeagueId;
  teamName: string;
};

export function emptyGame(): GameState {
  return {
    phase: "home",
    leagueId: null,
    teamName: "Your XI",
    formationId: null,
    xi: {},
    bench: [],
    usedPlayerIds: [],
    usedClubSeasons: [],
    rerollsLeft: REROLLS_PER_DRAFT,
    offer: null,
    league: null,
  };
}

function readRaw(): SavedGame | null {
  if (typeof window === "undefined") return null;
  for (const key of [STORAGE_KEY, LEGACY_KEY]) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      return JSON.parse(raw) as SavedGame;
    } catch {
      continue;
    }
  }
  return null;
}

export function peekSavedGame(): SavedMeta | null {
  const saved = readRaw();
  if (!saved || saved.phase === "home") return null;
  const leagueId = isLeagueId(saved.leagueId) ? saved.leagueId : "epl";
  return {
    phase: saved.phase,
    leagueId,
    teamName: saved.teamName || "Your XI",
  };
}

export function saveGame(state: GameState): void {
  if (typeof window === "undefined") return;
  const payload: SavedGame = {
    version: 2,
    leagueId: state.leagueId ?? undefined,
    phase: state.phase,
    teamName: state.teamName,
    formationId: state.formationId,
    xi: Object.fromEntries(Object.entries(state.xi).map(([id, player]) => [id, player?.id ?? null])),
    bench: state.bench.map((player) => player?.id ?? null),
    usedPlayerIds: state.usedPlayerIds,
    usedClubSeasons: state.usedClubSeasons,
    rerollsLeft: state.rerollsLeft,
    offer: state.offer
      ? { club: state.offer.club, clubKey: state.offer.clubKey, season: state.offer.season }
      : null,
    league: state.league,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.localStorage.removeItem(LEGACY_KEY);
}

export function loadGame(players: PlayerSeason[], expectedLeagueId?: LeagueId): GameState | null {
  const saved = readRaw();
  if (!saved) return null;
  try {
    if (saved.version !== 1 && saved.version !== 2) return null;
    const leagueId = isLeagueId(saved.leagueId) ? saved.leagueId : "epl";
    if (expectedLeagueId && leagueId !== expectedLeagueId) return null;
    const byId = new Map(players.map((player) => [player.id, player]));
    const formation = saved.formationId ? FORMATION_BY_ID[saved.formationId] : null;
    const xi: GameState["xi"] = {};
    if (formation) {
      for (const slot of formation.slots) {
        const id = saved.xi[slot.id];
        xi[slot.id] = id ? (byId.get(id) ?? null) : null;
      }
    }
    const offerPlayers = saved.offer
      ? players.filter(
          (player) => player.clubKey === saved.offer?.clubKey && player.season === saved.offer.season,
        )
      : [];
    return {
      phase: saved.phase,
      leagueId,
      teamName: saved.teamName || "Your XI",
      formationId: saved.formationId,
      xi,
      bench: (saved.bench ?? []).map((id) => (id ? (byId.get(id) ?? null) : null)),
      usedPlayerIds: saved.usedPlayerIds ?? [],
      usedClubSeasons: saved.usedClubSeasons ?? [],
      rerollsLeft: saved.rerollsLeft ?? REROLLS_PER_DRAFT,
      offer: saved.offer
        ? {
            club: saved.offer.club,
            clubKey: saved.offer.clubKey,
            season: saved.offer.season,
            players: offerPlayers.sort((a, b) => b.overall - a.overall),
          }
        : null,
      league: saved.league ?? null,
    };
  } catch {
    return null;
  }
}

export function clearGame(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_KEY);
}
