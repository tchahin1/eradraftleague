import { REROLLS_PER_DRAFT } from "./draft";
import { FORMATION_BY_ID } from "./formations";
import type { FormationId, GameState, PlayerSeason } from "./types";

const STORAGE_KEY = "epl-era-draft-v1";

type SavedGame = {
  version: 1;
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

export function emptyGame(): GameState {
  return {
    phase: "home",
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

export function saveGame(state: GameState): void {
  if (typeof window === "undefined") return;
  const payload: SavedGame = {
    version: 1,
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
}

export function loadGame(players: PlayerSeason[]): GameState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as SavedGame;
    if (saved.version !== 1) return null;
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
}
