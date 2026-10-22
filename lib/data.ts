import { LEAGUE_BY_ID, type LeagueId } from "./leagues";
import { attachPhotoUrls } from "./photos";
import type { PlayerSeason } from "./types";

type DatasetFile = {
  generatedAt?: string;
  sourceNotes?: string[];
  players: PlayerSeason[];
};

type PhotoFile = {
  generatedAt?: string;
  photos?: Record<string, string>;
};

export async function loadDataset(leagueId: LeagueId): Promise<PlayerSeason[]> {
  const league = LEAGUE_BY_ID[leagueId];
  const [playersRes, photosRes] = await Promise.all([
    fetch(league.dataFile),
    fetch("/data/player-photos.json"),
  ]);
  if (!playersRes.ok) {
    throw new Error(
      `Could not load ${league.name} player data. Run npm run ingest first.`,
    );
  }
  const json = (await playersRes.json()) as DatasetFile | PlayerSeason[];
  const players = Array.isArray(json) ? json : json.players;
  if (!players?.length) {
    throw new Error(`${league.name} player database is empty. Run npm run ingest to build it.`);
  }
  let photos: Record<string, string> | undefined;
  if (photosRes.ok) {
    const photoJson = (await photosRes.json()) as PhotoFile;
    photos = photoJson.photos;
  }
  return attachPhotoUrls(players, photos);
}
