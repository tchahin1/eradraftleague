export const LEAGUE_IDS = ["epl", "laliga", "seriea", "bundesliga", "ligue1"] as const;

export type LeagueId = (typeof LEAGUE_IDS)[number];

export const STARTING_LEAGUE_ID: LeagueId = "epl";

export type LeagueInfo = {
  id: LeagueId;
  name: string;
  country: string;
  teamCount: number;
  gameweeks: number;
  dataFile: string;
  eraLabel: string;
};

export const LEAGUES: LeagueInfo[] = [
  {
    id: "epl",
    name: "Premier League",
    country: "England",
    teamCount: 20,
    gameweeks: 38,
    dataFile: "/data/epl-player-seasons.json",
    eraLabel: "2000–2026",
  },
  {
    id: "laliga",
    name: "La Liga",
    country: "Spain",
    teamCount: 20,
    gameweeks: 38,
    dataFile: "/data/laliga-player-seasons.json",
    eraLabel: "2004–2026",
  },
  {
    id: "seriea",
    name: "Serie A",
    country: "Italy",
    teamCount: 20,
    gameweeks: 38,
    dataFile: "/data/seriea-player-seasons.json",
    eraLabel: "2004–2026",
  },
  {
    id: "bundesliga",
    name: "Bundesliga",
    country: "Germany",
    teamCount: 18,
    gameweeks: 34,
    dataFile: "/data/bundesliga-player-seasons.json",
    eraLabel: "2004–2026",
  },
  {
    id: "ligue1",
    name: "Ligue 1",
    country: "France",
    teamCount: 18,
    gameweeks: 34,
    dataFile: "/data/ligue1-player-seasons.json",
    eraLabel: "2004–2026",
  },
];

export const LEAGUE_BY_ID: Record<LeagueId, LeagueInfo> = Object.fromEntries(
  LEAGUES.map((league) => [league.id, league]),
) as Record<LeagueId, LeagueInfo>;

export function isLeagueId(value: unknown): value is LeagueId {
  return typeof value === "string" && (LEAGUE_IDS as readonly string[]).includes(value);
}

export function opponentCount(league: LeagueInfo): number {
  return league.teamCount - 1;
}
