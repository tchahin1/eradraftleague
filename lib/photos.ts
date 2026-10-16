import type { PlayerSeason } from "./types";

const NAME_PARTICLES = new Set(["van", "von", "de", "del", "da", "di", "le", "la", "el", "al", "ben", "st", "saint"]);

export function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function pitchSurname(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  const particle = parts[parts.length - 2]?.toLowerCase().replace(/[^a-z]/g, "");
  if (particle && NAME_PARTICLES.has(particle)) return parts.slice(-2).join(" ");
  return parts[parts.length - 1] ?? name;
}

export function attachPhotoUrls(
  players: PlayerSeason[],
  photos: Record<string, string> | undefined,
): PlayerSeason[] {
  if (!photos) return players;
  return players.map((player) => {
    const photoUrl = photos[player.playerId];
    return photoUrl ? { ...player, photoUrl } : player;
  });
}
