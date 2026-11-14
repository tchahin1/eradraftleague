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
  FormationId,
  PlayerSeason,
} from "./types";

export type DraftPlacement = { type: "xi"; slotId: string } | { type: "bench"; index: number };

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

export function applyDraftPlacement(args: {
  selected: PlayerSeason;
  target: DraftPlacement;
  formation: Formation;
  formationId: FormationId;
  xi: Record<string, PlayerSeason | null>;
  bench: (PlayerSeason | null)[];
  offer: DraftOffer | null;
  usedPlayerIds: string[];
  usedClubSeasons: string[];
  clubSeasons: ClubSeason[];
}): {
  xi: Record<string, PlayerSeason | null>;
  bench: (PlayerSeason | null)[];
  usedPlayerIds: string[];
  usedClubSeasons: string[];
  offer: DraftOffer | null;
} | null {
  const { selected, target, formation, formationId, offer, clubSeasons } = args;
  const nextXi = { ...args.xi };
  const nextBench = [...args.bench];
  const alreadyDrafted =
    Object.values(nextXi).some((player) => player?.id === selected.id) ||
    nextBench.some((player) => player?.id === selected.id);

  if (alreadyDrafted) {
    if (target.type === "xi") {
      const slot = formation.slots.find((item) => item.id === target.slotId);
      if (!slot) return null;
      const occupant = nextXi[target.slotId];
      const fromBench = nextBench.findIndex((player) => player?.id === selected.id);
      if (fromBench >= 0) {
        nextBench[fromBench] = occupant;
        nextXi[target.slotId] = selected;
      } else {
        const fromSlot = Object.entries(nextXi).find(([, player]) => player?.id === selected.id)?.[0];
        if (!fromSlot || fromSlot === target.slotId) return null;
        nextXi[fromSlot] = occupant;
        nextXi[target.slotId] = selected;
      }
    } else {
      if (nextBench[target.index]?.id === selected.id) return null;
      const occupant = nextBench[target.index];
      const fromSlot = Object.entries(nextXi).find(([, player]) => player?.id === selected.id)?.[0];
      const fromBench = nextBench.findIndex((player) => player?.id === selected.id);
      if (fromSlot) {
        nextXi[fromSlot] = occupant;
        nextBench[target.index] = selected;
      } else if (fromBench >= 0) {
        nextBench[fromBench] = occupant;
        nextBench[target.index] = selected;
      } else {
        return null;
      }
    }
    return {
      xi: nextXi,
      bench: nextBench,
      usedPlayerIds: args.usedPlayerIds,
      usedClubSeasons: args.usedClubSeasons,
      offer,
    };
  }

  if (!playerCanBePicked(selected, formation, args.xi, args.bench)) return null;
  if (!offer) return null;

  if (target.type === "xi") {
    const slot = formation.slots.find((item) => item.id === target.slotId);
    if (!slot || nextXi[target.slotId]) return null;
    nextXi[target.slotId] = selected;
  } else if (nextBench[target.index]) {
    if (selected.group !== "GK" || nextBench.some((player) => player?.group === "GK")) return null;
    nextBench[target.index] = selected;
  } else {
    nextBench[target.index] = selected;
  }

  const usedPlayerIds = [...args.usedPlayerIds, selected.playerId];
  const usedClubSeasons = [...args.usedClubSeasons, clubSeasonKey(offer.clubKey, offer.season)];
  const complete = formation.slots.every((slot) => nextXi[slot.id] !== null) &&
    nextBench.filter(Boolean).length === BENCH_SIZE &&
    nextBench.some((player) => player?.group === "GK");
  const nextOffer = complete
    ? offer
    : pickRandomOffer(
        clubSeasons,
        new Set(usedClubSeasons),
        new Set(usedPlayerIds),
        formationId,
        nextXi,
        nextBench,
      );

  return {
    xi: nextXi,
    bench: nextBench,
    usedPlayerIds,
    usedClubSeasons,
    offer: nextOffer,
  };
}
