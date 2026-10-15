import {
  BENCH_SIZE,
  compatibleSlotIds,
  FORMATION_BY_ID,
  playerFitsSlot,
} from "./formations";
import type {
  ClubSeason,
  DraftOffer,
  Formation,
  PlayerSeason,
} from "./types";

export const REROLLS_PER_DRAFT = 3;

export function clubSeasonKey(clubKey: string, season: string): string {
  return `${clubKey}::${season}`;
}

export function indexClubSeasons(players: PlayerSeason[]): ClubSeason[] {
  const map = new Map<string, ClubSeason>();
  for (const player of players) {
    const key = clubSeasonKey(player.clubKey, player.season);
    const existing = map.get(key);
    if (existing) {
      existing.players.push(player);
    } else {
      map.set(key, {
        club: player.club,
        clubKey: player.clubKey,
        season: player.season,
        players: [player],
      });
    }
  }
  for (const squad of map.values()) {
    squad.players.sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
    squad.players = squad.players.slice(0, 22);
  }
  return [...map.values()].filter((squad) => squad.players.length >= 11);
}

export function uniqueClubs(clubSeasons: ClubSeason[]): string[] {
  return [...new Set(clubSeasons.map((squad) => squad.clubKey))];
}

function needsBackupGk(bench: (PlayerSeason | null)[]): boolean {
  return !bench.some((player) => player?.group === "GK");
}

function offerHasEligiblePick(
  squad: ClubSeason,
  formation: Formation,
  xi: Record<string, PlayerSeason | null>,
  bench: (PlayerSeason | null)[],
  usedPlayerIds: Set<string>,
): boolean {
  const benchOpen = bench.filter(Boolean).length < BENCH_SIZE;
  const gkRescue = needsBackupGk(bench);
  return squad.players.some((player) => {
    if (usedPlayerIds.has(player.playerId)) return false;
    if (benchOpen) return true;
    if (gkRescue && player.group === "GK") return true;
    return compatibleSlotIds(player, formation, xi).length > 0;
  });
}

export function pickRandomOffer(
  clubSeasons: ClubSeason[],
  usedClubSeasons: Set<string>,
  usedPlayerIds: Set<string>,
  formationId: string,
  xi: Record<string, PlayerSeason | null>,
  bench: (PlayerSeason | null)[],
): DraftOffer | null {
  const formation = FORMATION_BY_ID[formationId as keyof typeof FORMATION_BY_ID];
  if (!formation) return null;

  const candidates = clubSeasons.filter((squad) => {
    const key = clubSeasonKey(squad.clubKey, squad.season);
    if (usedClubSeasons.has(key)) return false;
    return offerHasEligiblePick(squad, formation, xi, bench, usedPlayerIds);
  });

  if (candidates.length === 0) return null;
  const squad = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    club: squad.club,
    clubKey: squad.clubKey,
    season: squad.season,
    players: squad.players.filter((player) => !usedPlayerIds.has(player.playerId)),
  };
}

export function canPlaceOnBench(bench: (PlayerSeason | null)[]): boolean {
  return bench.filter(Boolean).length < BENCH_SIZE;
}

export function firstOpenBenchIndex(bench: (PlayerSeason | null)[]): number {
  return bench.findIndex((slot) => slot === null);
}

export function autoPlacePlayer(
  player: PlayerSeason,
  formation: Formation,
  xi: Record<string, PlayerSeason | null>,
  bench: (PlayerSeason | null)[],
): { type: "xi"; slotId: string } | { type: "bench"; index: number } | null {
  const xiSlots = compatibleSlotIds(player, formation, xi);
  if (xiSlots.length > 0) {
    return { type: "xi", slotId: xiSlots[0] };
  }
  if (player.group === "GK" && !bench.some((p) => p?.group === "GK")) {
    const index = firstOpenBenchIndex(bench);
    if (index >= 0) return { type: "bench", index };
  }
  const index = firstOpenBenchIndex(bench);
  if (index >= 0) return { type: "bench", index };
  return null;
}

export function playerCanBePicked(
  player: PlayerSeason,
  formation: Formation,
  xi: Record<string, PlayerSeason | null>,
  bench: (PlayerSeason | null)[],
): boolean {
  if (compatibleSlotIds(player, formation, xi).length > 0) return true;
  if (canPlaceOnBench(bench)) return true;
  return player.group === "GK" && !bench.some((item) => item?.group === "GK");
}

export function slotOccupiedBy(
  xi: Record<string, PlayerSeason | null>,
  bench: (PlayerSeason | null)[],
  playerId: string,
): { type: "xi"; slotId: string } | { type: "bench"; index: number } | null {
  for (const [slotId, player] of Object.entries(xi)) {
    if (player?.id === playerId) return { type: "xi", slotId };
  }
  const benchIndex = bench.findIndex((player) => player?.id === playerId);
  if (benchIndex >= 0) return { type: "bench", index: benchIndex };
  return null;
}

export function canSwapToSlot(
  _player: PlayerSeason,
  _slotKind: SlotKindLike,
): boolean {
  return true;
}

type SlotKindLike = Parameters<typeof playerFitsSlot>[1];
