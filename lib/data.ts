import type { PlayerSeason } from "./types";

type DatasetFile = {
  generatedAt?: string;
  sourceNotes?: string[];
  players: PlayerSeason[];
};

export async function loadDataset(): Promise<PlayerSeason[]> {
  const response = await fetch("/data/epl-player-seasons.json");
  if (!response.ok) {
    throw new Error("Could not load Premier League player data. Run scripts/ingest_epl.py first.");
  }
  const json = (await response.json()) as DatasetFile | PlayerSeason[];
  const players = Array.isArray(json) ? json : json.players;
  if (!players?.length) {
    throw new Error("Player database is empty. Run scripts/ingest_epl.py to build it.");
  }
  return players;
}
