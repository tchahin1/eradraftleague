export type PositionGroup = "GK" | "DEF" | "MID" | "FWD";

export type SlotKind =
  | "GK"
  | "CB"
  | "LB"
  | "RB"
  | "LWB"
  | "RWB"
  | "CDM"
  | "CM"
  | "CAM"
  | "LM"
  | "RM"
  | "LW"
  | "RW"
  | "ST";

export type RatingSource = "fifa" | "estimated";

export type PlayerSeason = {
  id: string;
  playerId: string;
  name: string;
  season: string;
  club: string;
  clubKey: string;
  slot: SlotKind;
  group: PositionGroup;
  overall: number;
  ratingSource: RatingSource;
  nationality: string;
  minutes: number;
};

export type FormationId = "433" | "442" | "4231" | "352" | "541" | "343";

export type FormationSlot = {
  id: string;
  kind: SlotKind;
  label: string;
  x: number;
  y: number;
};

export type Formation = {
  id: FormationId;
  name: string;
  slots: FormationSlot[];
};

export type ClubSeason = {
  club: string;
  clubKey: string;
  season: string;
  players: PlayerSeason[];
};

export type DraftOffer = {
  club: string;
  clubKey: string;
  season: string;
  players: PlayerSeason[];
};

export type LeagueTeam = {
  id: string;
  name: string;
  club: string;
  season: string;
  isPlayer: boolean;
  attack: number;
  defense: number;
};

export type GoalScorer = {
  teamId: string;
  name: string;
  slot: SlotKind;
  minute: number;
};

export type MatchResult = {
  id: string;
  gameweek: number;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  scorers?: GoalScorer[];
};

export type TableRow = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
};

export type LeagueState = {
  teams: LeagueTeam[];
  matches: MatchResult[];
  table: TableRow[];
};

export type GamePhase = "home" | "formation" | "draft" | "season";

export type GameState = {
  phase: GamePhase;
  teamName: string;
  formationId: FormationId | null;
  xi: Record<string, PlayerSeason | null>;
  bench: (PlayerSeason | null)[];
  usedPlayerIds: string[];
  usedClubSeasons: string[];
  rerollsLeft: number;
  offer: DraftOffer | null;
  league: LeagueState | null;
};
