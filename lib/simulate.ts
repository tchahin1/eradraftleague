import type {
  GoalScorer,
  LeagueState,
  LeagueTeam,
  MatchResult,
  PlayerSeason,
  SlotKind,
  TableRow,
} from "./types";

export type SimTeam = LeagueTeam & {
  xi: PlayerSeason[];
  bench: PlayerSeason[];
};

export const PLAYER_TEAM_ID = "your-xi";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function samplePoisson(lambda: number): number {
  const L = Math.exp(-Math.max(0.05, lambda));
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= Math.random();
  } while (p > L);
  return Math.min(8, k - 1);
}

const ATTACK_WEIGHT: Record<string, number> = {
  GK: 0.05,
  DEF: 0.28,
  MID: 0.95,
  FWD: 1.4,
};

const DEFENSE_WEIGHT: Record<string, number> = {
  GK: 1.45,
  DEF: 1.28,
  MID: 0.52,
  FWD: 0.12,
};

function ratingToStrength(overall: number): number {
  return 0.62 + (overall - 55) / 52;
}

export function squadStrength(
  xi: PlayerSeason[],
  bench: PlayerSeason[],
): { attack: number; defense: number } {
  const attackNum = xi.reduce(
    (sum, player) => sum + player.overall * (ATTACK_WEIGHT[player.group] ?? 0.8),
    0,
  );
  const attackDen = xi.reduce((sum, player) => sum + (ATTACK_WEIGHT[player.group] ?? 0.8), 0);
  const defenseNum = xi.reduce(
    (sum, player) => sum + player.overall * (DEFENSE_WEIGHT[player.group] ?? 0.6),
    0,
  );
  const defenseDen = xi.reduce((sum, player) => sum + (DEFENSE_WEIGHT[player.group] ?? 0.6), 0);
  const benchBonus =
    bench.length === 0 ? 0 : (bench.reduce((sum, player) => sum + player.overall, 0) / bench.length) * 0.045;
  const attack = ratingToStrength(attackNum / Math.max(1, attackDen) + benchBonus);
  const defense = ratingToStrength(defenseNum / Math.max(1, defenseDen) + benchBonus);
  return { attack, defense };
}

export function autoSelectXi(squad: PlayerSeason[]): { xi: PlayerSeason[]; bench: PlayerSeason[] } {
  const sorted = [...squad].sort((a, b) => b.overall - a.overall);
  const take = (group: PlayerSeason["group"], count: number, pool: PlayerSeason[]) => {
    const picked: PlayerSeason[] = [];
    const rest: PlayerSeason[] = [];
    for (const player of pool) {
      if (player.group === group && picked.length < count) picked.push(player);
      else rest.push(player);
    }
    return { picked, rest };
  };

  let pool = sorted;
  const gk = take("GK", 1, pool);
  const def = take("DEF", 4, gk.rest);
  const mid = take("MID", 3, def.rest);
  const fwd = take("FWD", 3, mid.rest);

  let xi = [...gk.picked, ...def.picked, ...mid.picked, ...fwd.picked];
  const remaining = fwd.rest;

  while (xi.length < 11 && remaining.length > 0) {
    xi.push(remaining.shift()!);
  }

  if (xi.filter((p) => p.group === "GK").length === 0) {
    const extraGk = remaining.find((p) => p.group === "GK");
    if (extraGk) {
      xi = [extraGk, ...xi.filter((p) => p.playerId !== extraGk.playerId)].slice(0, 11);
    }
  }

  const xiIds = new Set(xi.map((p) => p.id));
  const bench = sorted.filter((p) => !xiIds.has(p.id)).slice(0, 7);
  return { xi, bench };
}

function roundRobinPairs(teamIds: string[]): [string, string][][] {
  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push("bye");
  const n = teams.length;
  const half = n / 2;
  const rotation = teams.slice(1);
  const firstHalf: [string, string][][] = [];

  for (let round = 0; round < n - 1; round += 1) {
    const ordered = [teams[0], ...rotation];
    const pairs: [string, string][] = [];
    for (let i = 0; i < half; i += 1) {
      const a = ordered[i];
      const b = ordered[n - 1 - i];
      if (a === "bye" || b === "bye") continue;
      if (round % 2 === 0) pairs.push([a, b]);
      else pairs.push([b, a]);
    }
    firstHalf.push(pairs);
    rotation.unshift(rotation.pop()!);
  }

  const secondHalf = firstHalf.map((gw) => gw.map(([home, away]) => [away, home] as [string, string]));
  return [...firstHalf, ...secondHalf];
}

const SCORE_WEIGHT: Record<SlotKind, number> = {
  GK: 0,
  CB: 0.22,
  LB: 0.28,
  RB: 0.28,
  LWB: 0.45,
  RWB: 0.45,
  CDM: 0.4,
  CM: 1.1,
  CAM: 1.8,
  LM: 1.15,
  RM: 1.15,
  LW: 2.4,
  RW: 2.4,
  ST: 3.6,
};

function scorerWeight(player: PlayerSeason, starter: boolean): number {
  const pos = SCORE_WEIGHT[player.slot] ?? 0.8;
  if (pos <= 0) return 0;
  const rating = (player.overall / 70) ** 1.6;
  const time = Math.sqrt(Math.max(player.minutes, 180) / 1200);
  return pos * rating * time * (starter ? 1 : 0.28);
}

function pickWeighted<T>(items: T[], weightOf: (item: T) => number): T {
  const weights = items.map(weightOf);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)]!;
  let ticket = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    ticket -= weights[i]!;
    if (ticket <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function pickMinutes(count: number): number[] {
  const minutes: number[] = [];
  while (minutes.length < count) {
    const minute = 1 + Math.floor(Math.random() * 90);
    if (!minutes.includes(minute)) minutes.push(minute);
  }
  return minutes.sort((a, b) => a - b);
}

function assignScorers(team: SimTeam, goals: number): GoalScorer[] {
  const squad = [...team.xi, ...team.bench];
  if (goals <= 0 || squad.length === 0) return [];
  const starterIds = new Set(team.xi.map((player) => player.id));
  return pickMinutes(goals).map((minute) => {
    const player = pickWeighted(squad, (item) => scorerWeight(item, starterIds.has(item.id)));
    return {
      teamId: team.id,
      name: player.name,
      slot: player.slot,
      minute,
    };
  });
}

export function simulateMatch(home: SimTeam, away: SimTeam): {
  homeGoals: number;
  awayGoals: number;
  scorers: GoalScorer[];
} {
  const lambdaHome = clamp(1.32 * (home.attack / Math.max(0.45, away.defense)) * 1.14, 0.35, 4.2);
  const lambdaAway = clamp(1.18 * (away.attack / Math.max(0.45, home.defense)), 0.25, 3.6);
  const homeGoals = samplePoisson(lambdaHome);
  const awayGoals = samplePoisson(lambdaAway);
  return {
    homeGoals,
    awayGoals,
    scorers: [...assignScorers(home, homeGoals), ...assignScorers(away, awayGoals)].sort(
      (a, b) => a.minute - b.minute,
    ),
  };
}

export function buildTable(teams: LeagueTeam[], matches: MatchResult[]): TableRow[] {
  const rows = new Map<string, TableRow>();
  for (const team of teams) {
    rows.set(team.id, {
      teamId: team.id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    });
  }

  for (const match of matches) {
    const home = rows.get(match.homeId);
    const away = rows.get(match.awayId);
    if (!home || !away) continue;
    home.played += 1;
    away.played += 1;
    home.gf += match.homeGoals;
    home.ga += match.awayGoals;
    away.gf += match.awayGoals;
    away.ga += match.homeGoals;

    if (match.homeGoals > match.awayGoals) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (match.homeGoals < match.awayGoals) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const row of rows.values()) {
    row.gd = row.gf - row.ga;
  }

  const nameById = new Map(teams.map((team) => [team.id, team.name]));
  return [...rows.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return (nameById.get(a.teamId) ?? "").localeCompare(nameById.get(b.teamId) ?? "");
  });
}

export function pickOpponentClubSeasons(
  clubSeasons: { club: string; clubKey: string; season: string; players: PlayerSeason[] }[],
  count: number,
): { club: string; clubKey: string; season: string; players: PlayerSeason[] }[] {
  const byClub = new Map<string, typeof clubSeasons>();
  for (const squad of clubSeasons) {
    const list = byClub.get(squad.clubKey) ?? [];
    list.push(squad);
    byClub.set(squad.clubKey, list);
  }
  const clubs = [...byClub.keys()].sort(() => Math.random() - 0.5);
  const selected: typeof clubSeasons = [];
  for (const clubKey of clubs) {
    if (selected.length >= count) break;
    const seasons = byClub.get(clubKey);
    if (!seasons?.length) continue;
    selected.push(seasons[Math.floor(Math.random() * seasons.length)]);
  }
  if (selected.length < count) {
    const used = new Set(selected.map((squad) => `${squad.clubKey}::${squad.season}`));
    const rest = clubSeasons
      .filter((squad) => !used.has(`${squad.clubKey}::${squad.season}`))
      .sort(() => Math.random() - 0.5);
    for (const squad of rest) {
      if (selected.length >= count) break;
      selected.push(squad);
    }
  }
  return selected;
}

export const TOTAL_GAMEWEEKS = 38;

export function isMatchPlayed(match: MatchResult): boolean {
  return match.played !== false;
}

export function seasonLength(league: LeagueState): number {
  const fromMatches = league.matches.reduce((max, match) => Math.max(max, match.gameweek), 0);
  if (fromMatches) return fromMatches;
  const n = league.teams.length;
  return n > 1 ? (n - 1) * 2 : TOTAL_GAMEWEEKS;
}

export function playedGameweeksOf(league: LeagueState): number {
  const total = seasonLength(league);
  return Math.min(total, league.playedGameweeks ?? total);
}

export function isSeasonComplete(league: LeagueState): boolean {
  return playedGameweeksOf(league) >= seasonLength(league);
}

export function nextGameweek(league: LeagueState): number | null {
  const played = playedGameweeksOf(league);
  const total = seasonLength(league);
  return played >= total ? null : played + 1;
}

function toLeagueTeam(team: SimTeam, keepSquad: boolean): LeagueTeam {
  const base: LeagueTeam = {
    id: team.id,
    name: team.name,
    club: team.club,
    season: team.season,
    isPlayer: team.isPlayer,
    attack: team.attack,
    defense: team.defense,
  };
  if (!keepSquad) return base;
  return { ...base, xi: team.xi, bench: team.bench };
}

function asSimTeam(team: LeagueTeam): SimTeam {
  return {
    ...team,
    xi: team.xi ?? [],
    bench: team.bench ?? [],
  };
}

function stripSquads(teams: LeagueTeam[]): LeagueTeam[] {
  return teams.map((team) => {
    const { xi: _xi, bench: _bench, ...rest } = team;
    return rest;
  });
}

function buildFixtures(teamIds: string[]): MatchResult[] {
  const rounds = roundRobinPairs(teamIds);
  const matches: MatchResult[] = [];
  rounds.forEach((pairs, index) => {
    pairs.forEach(([homeId, awayId], matchIndex) => {
      matches.push({
        id: `gw${index + 1}-m${matchIndex}`,
        gameweek: index + 1,
        homeId,
        awayId,
        homeGoals: 0,
        awayGoals: 0,
        scorers: [],
        played: false,
      });
    });
  });
  return matches;
}

export function applyPlayerLineup(league: LeagueState, playerTeam: SimTeam): LeagueState {
  return {
    ...league,
    teams: league.teams.map((team) =>
      team.id === PLAYER_TEAM_ID ? toLeagueTeam(playerTeam, !isSeasonComplete(league)) : team,
    ),
  };
}

export function startSeason(playerTeam: SimTeam, opponents: SimTeam[]): LeagueState {
  const simTeams = [playerTeam, ...opponents];
  const teams = simTeams.map((team) => toLeagueTeam(team, true));
  const matches = buildFixtures(teams.map((team) => team.id));
  return {
    teams,
    matches,
    table: buildTable(teams, []),
    playedGameweeks: 0,
  };
}

export function playGameweeks(league: LeagueState, throughGameweek: number): LeagueState {
  const current = playedGameweeksOf(league);
  const total = seasonLength(league);
  const target = Math.min(total, Math.max(current, throughGameweek));
  if (target <= current) return league;

  const byId = new Map(league.teams.map((team) => [team.id, asSimTeam(team)]));
  const matches = league.matches.map((match) => {
    if (match.gameweek <= current || match.gameweek > target || isMatchPlayed(match)) return match;
    const home = byId.get(match.homeId);
    const away = byId.get(match.awayId);
    if (!home || !away) return match;
    const score = simulateMatch(home, away);
    return {
      ...match,
      homeGoals: score.homeGoals,
      awayGoals: score.awayGoals,
      scorers: score.scorers,
      played: true,
    };
  });

  const complete = target >= total;
  const teams = complete ? stripSquads(league.teams) : league.teams;
  const playedMatches = matches.filter((match) => isMatchPlayed(match) && match.gameweek <= target);
  return {
    teams,
    matches,
    table: buildTable(teams, playedMatches),
    playedGameweeks: target,
  };
}

export function simulateSeason(
  playerTeam: SimTeam,
  opponents: SimTeam[],
): LeagueState {
  const started = startSeason(playerTeam, opponents);
  return playGameweeks(started, seasonLength(started));
}

export function makePlayerLeagueTeam(
  teamName: string,
  xi: PlayerSeason[],
  bench: PlayerSeason[],
): SimTeam {
  const { attack, defense } = squadStrength(xi, bench);
  return {
    id: PLAYER_TEAM_ID,
    name: teamName.trim() || "Your XI",
    club: teamName.trim() || "Your XI",
    season: "draft",
    isPlayer: true,
    attack,
    defense,
    xi,
    bench,
  };
}

export function makeHistoricalLeagueTeam(
  squad: { club: string; season: string; players: PlayerSeason[] },
): SimTeam {
  const { xi, bench } = autoSelectXi(squad.players);
  const { attack, defense } = squadStrength(xi, bench);
  const [start, end] = squad.season.split("-");
  const short = start && end ? `${start.slice(2)}-${end.slice(-2)}` : squad.season;
  return {
    id: `${squad.players[0]?.clubKey ?? squad.club}::${squad.season}`,
    name: `${squad.club} ${short}`,
    club: squad.club,
    season: squad.season,
    isPlayer: false,
    attack,
    defense,
    xi,
    bench,
  };
}
