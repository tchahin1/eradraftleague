import {
  applyDraftPlacement,
  autoPlacePlayer,
  pickRandomOffer,
  playerCanBePicked,
} from "./draft";
import {
  BENCH_SIZE,
  compatibleSlotIds,
  emptyXi,
  FORMATIONS,
  hasBackupGk,
  isDraftComplete,
} from "./formations";
import { serializeSquad, type PvpSquad } from "./pvp";
import type { ClubSeason, Formation, PlayerSeason } from "./types";

const AI_NAMES = ["AI XI", "CPU", "Machine", "The Algorithm"];

function bestOverall(players: PlayerSeason[]): PlayerSeason | null {
  if (players.length === 0) return null;
  return [...players].sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name))[0] ?? null;
}

function chooseAiPick(
  players: PlayerSeason[],
  formation: Formation,
  xi: Record<string, PlayerSeason | null>,
  bench: (PlayerSeason | null)[],
): PlayerSeason | null {
  const eligible = players.filter((player) => playerCanBePicked(player, formation, xi, bench));
  if (eligible.length === 0) return null;

  const xiOpen = formation.slots.some((slot) => !xi[slot.id]);
  const needStarterGk = !Object.values(xi).some((player) => player?.group === "GK");
  const xiFits = eligible.filter((player) => compatibleSlotIds(player, formation, xi).length > 0);

  if (xiOpen && needStarterGk) {
    const gk = bestOverall(xiFits.filter((player) => player.group === "GK"));
    if (gk) return gk;
  }
  if (xiOpen) {
    const starter = bestOverall(xiFits);
    if (starter) return starter;
  }
  if (!hasBackupGk(bench)) {
    const backupGk = bestOverall(eligible.filter((player) => player.group === "GK"));
    if (backupGk) return backupGk;
  }
  return bestOverall(eligible);
}

export function randomAiName(): string {
  return AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)] ?? "AI XI";
}

export function autoDraftSquad(clubSeasons: ClubSeason[], teamName = "AI XI"): PvpSquad | null {
  const formation = FORMATIONS[Math.floor(Math.random() * FORMATIONS.length)];
  if (!formation) return null;

  let xi = emptyXi(formation);
  let bench: (PlayerSeason | null)[] = Array.from({ length: BENCH_SIZE }, () => null);
  let usedPlayerIds: string[] = [];
  let usedClubSeasons: string[] = [];

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (isDraftComplete(formation, xi, bench)) {
      return serializeSquad(teamName, formation.id, xi, bench);
    }
    const offer = pickRandomOffer(
      clubSeasons,
      new Set(usedClubSeasons),
      new Set(usedPlayerIds),
      formation.id,
      xi,
      bench,
    );
    if (!offer) return serializeSquad(teamName, formation.id, xi, bench);
    const pick = chooseAiPick(offer.players, formation, xi, bench);
    const target = pick ? autoPlacePlayer(pick, formation, xi, bench) : null;
    if (!pick || !target) {
      usedClubSeasons = [...usedClubSeasons, `${offer.clubKey}::${offer.season}`];
      continue;
    }
    const next = applyDraftPlacement({
      selected: pick,
      target,
      formation,
      formationId: formation.id,
      xi,
      bench,
      offer,
      usedPlayerIds,
      usedClubSeasons,
      clubSeasons,
    });
    if (!next) {
      usedClubSeasons = [...usedClubSeasons, `${offer.clubKey}::${offer.season}`];
      continue;
    }
    xi = next.xi;
    bench = next.bench;
    usedPlayerIds = next.usedPlayerIds;
    usedClubSeasons = next.usedClubSeasons;
  }

  return serializeSquad(teamName, formation.id, xi, bench);
}
