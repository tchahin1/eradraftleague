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

export async function loadDataset(): Promise<PlayerSeason[]> {
  const [playersRes, photosRes] = await Promise.all([
    fetch("/data/epl-player-seasons.json"),
    fetch("/data/player-photos.json"),
  ]);
  if (!playersRes.ok) {
    throw new Error("Could not load Premier League player data. Run scripts/ingest_epl.py first.");
  }
  const json = (await playersRes.json()) as DatasetFile | PlayerSeason[];
  const players = Array.isArray(json) ? json : json.players;
  if (!players?.length) {
    throw new Error("Player database is empty. Run scripts/ingest_epl.py to build it.");
  }
  let photos: Record<string, string> | undefined;
  if (photosRes.ok) {
    const photoJson = (await photosRes.json()) as PhotoFile;
    photos = photoJson.photos;
  }
  return attachPhotoUrls(players, photos);
}
