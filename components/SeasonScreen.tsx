"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isMatchPlayed,
  isSeasonComplete,
  nextGameweek,
  PLAYER_TEAM_ID,
  playedGameweeksOf,
  seasonLength,
} from "@/lib/simulate";
import {
  BENCH_SIZE,
  compatibleSlotIds,
  FORMATION_BY_ID,
} from "@/lib/formations";
import type { FormationId, GoalScorer, LeagueState, MatchResult, PlayerSeason } from "@/lib/types";
import { DEFAULT_HOME_KIT, kitDistinctFrom, kitFromSeed, readKit, type KitChoice } from "@/lib/kits";
import { inferFormation, type MatchSide } from "@/lib/match-tape";
import { KitFace } from "./KitFace";
import { MatchPitch } from "./MatchPitch";
import { Pitch } from "./Pitch";
import { OverallBadge, PlayerPortrait } from "./PlayerPortrait";

type WatchState = {
  match: MatchResult;
  revealed: number;
  done: boolean;
};

const EMPTY_SCORERS: GoalScorer[] = [];

type Props = {
  teamName: string;
  leagueName: string;
  league: LeagueState;
  formationId?: FormationId | null;
  xi?: Record<string, PlayerSeason | null>;
  bench?: (PlayerSeason | null)[];
  kit?: KitChoice;
  onNewGame: () => void;
  onPlayNext?: () => void;
  onQuickSimRest?: () => void;
  onLineupChange?: (xi: Record<string, PlayerSeason | null>, bench: (PlayerSeason | null)[]) => void;
};

function teamNameOf(league: LeagueState, id: string): string {
  return league.teams.find((team) => team.id === id)?.name ?? id;
}

function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function xiRecordFromSide(side: MatchSide): Record<string, PlayerSeason | null> {
  const formation = FORMATION_BY_ID[side.formationId];
  return Object.fromEntries(formation.slots.map((slot, index) => [slot.id, side.xi[index] ?? null]));
}

function benchForSide(
  league: LeagueState,
  teamId: string,
  playerBench?: (PlayerSeason | null)[],
): PlayerSeason[] {
  if (teamId === PLAYER_TEAM_ID) {
    return (playerBench ?? []).filter((player): player is PlayerSeason => Boolean(player));
  }
  return league.teams.find((team) => team.id === teamId)?.bench ?? [];
}

function kitsForFixture(
  league: LeagueState,
  homeId: string,
  awayId: string,
  playerKit: KitChoice,
) {
  const yours = readKit(playerKit, DEFAULT_HOME_KIT);
  const homeTeam = league.teams.find((team) => team.id === homeId);
  const awayTeam = league.teams.find((team) => team.id === awayId);
  if (homeTeam?.isPlayer || homeId === PLAYER_TEAM_ID) {
    const home = readKit(homeTeam?.kit ?? yours, yours);
    return { home, away: kitDistinctFrom(awayId, home) };
  }
  if (awayTeam?.isPlayer || awayId === PLAYER_TEAM_ID) {
    const away = readKit(awayTeam?.kit ?? yours, yours);
    return { home: kitDistinctFrom(homeId, away), away };
  }
  const home = kitFromSeed(homeId);
  return { home, away: kitDistinctFrom(awayId, home) };
}

function MatchLineup({
  side,
  bench,
  you,
}: {
  side: MatchSide;
  bench: PlayerSeason[];
  you: boolean;
}) {
  const formation = FORMATION_BY_ID[side.formationId];
  const kit = side.kit ?? (you ? DEFAULT_HOME_KIT : kitFromSeed(side.id));
  return (
    <div className="rounded-3xl border border-white/10 bg-emerald-950/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
        {you ? "Your XI" : "Their XI"} · {formation.name}
      </p>
      <h2 className="mt-1 flex items-center gap-2 text-2xl font-black text-white">
        <KitFace kit={kit} className="h-7 w-7 text-[8px] font-black">
          XI
        </KitFace>
        {side.name}
      </h2>
      <div className="mt-3 max-w-sm">
        <Pitch formationId={side.formationId} xi={xiRecordFromSide(side)} interactive={false} />
      </div>
      {bench.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {bench.map((player) => (
            <div key={player.id} className="flex items-center gap-2 rounded-xl border border-white/10 px-2 py-1.5">
              <PlayerPortrait player={player} size="sm" />
              <span className="min-w-0 flex-1 truncate text-xs text-white">{player.name}</span>
              <OverallBadge overall={player.overall} size="sm" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function matchSide(
  league: LeagueState,
  teamId: string,
  playerFormationId?: FormationId | null,
  playerXi?: Record<string, PlayerSeason | null>,
): MatchSide {
  const team = league.teams.find((item) => item.id === teamId);
  if (teamId === PLAYER_TEAM_ID && playerFormationId && playerXi) {
    const formation = FORMATION_BY_ID[playerFormationId];
    const xi = formation.slots
      .map((slot) => playerXi[slot.id])
      .filter((player): player is PlayerSeason => Boolean(player));
    if (xi.length) {
      return {
        id: teamId,
        name: team?.name ?? "Your XI",
        formationId: playerFormationId,
        xi,
      };
    }
  }
  const xi = team?.xi ?? [];
  return {
    id: teamId,
    name: team?.name ?? teamId,
    formationId: inferFormation(xi),
    xi,
  };
}

function playerMatchInGameweek(league: LeagueState, gameweek: number): MatchResult | undefined {
  return league.matches.find(
    (match) =>
      match.gameweek === gameweek &&
      (match.homeId === PLAYER_TEAM_ID || match.awayId === PLAYER_TEAM_ID),
  );
}

function runningScore(match: MatchResult, revealed: number): { home: number; away: number; scorers: GoalScorer[] } {
  const scorers = (match.scorers ?? []).slice(0, Math.max(0, revealed));
  let home = 0;
  let away = 0;
  for (const goal of scorers) {
    if (goal.teamId === match.homeId) home += 1;
    else away += 1;
  }
  return { home, away, scorers };
}

function ScorerList({
  scorers,
  align,
}: {
  scorers: GoalScorer[];
  align: "left" | "right";
}) {
  if (scorers.length === 0) return null;
  return (
    <ul className={`mt-3 space-y-1 text-sm text-emerald-100/75 ${align === "right" ? "text-right" : "text-left"}`}>
      {scorers.map((goal, index) => (
        <li key={`${goal.minute}-${goal.name}-${index}`} className="leading-snug">
          <span className="tabular-nums text-amber-200/90">{`${goal.minute}'`}</span>{" "}
          <span className="font-medium text-white">{goal.name}</span>
          <span className="ml-1 text-[11px] uppercase tracking-wide text-emerald-100/45">{goal.slot}</span>
        </li>
      ))}
    </ul>
  );
}

function MatchSheet({
  league,
  match,
  homeGoals,
  awayGoals,
  scorers,
  status,
}: {
  league: LeagueState;
  match: MatchResult;
  homeGoals: number;
  awayGoals: number;
  scorers: GoalScorer[];
  status?: string | null;
}) {
  return (
    <>
      <p className="text-center text-xs uppercase tracking-[0.3em] text-amber-300">Gameweek {match.gameweek}</p>
      {status ? (
        <p className="mt-2 text-center text-sm font-semibold uppercase tracking-[0.2em] text-emerald-100/70">{status}</p>
      ) : null}
      <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-start gap-4">
        <div className="text-right">
          <div
            className={`text-lg font-black leading-tight ${
              match.homeId === PLAYER_TEAM_ID ? "text-amber-200" : "text-white"
            }`}
          >
            {teamNameOf(league, match.homeId)}
          </div>
          <ScorerList scorers={scorers.filter((goal) => goal.teamId === match.homeId)} align="right" />
        </div>
        <div className="pt-0.5 text-center">
          <div className="text-4xl font-black tabular-nums text-amber-300">
            {homeGoals}–{awayGoals}
          </div>
        </div>
        <div className="text-left">
          <div
            className={`text-lg font-black leading-tight ${
              match.awayId === PLAYER_TEAM_ID ? "text-amber-200" : "text-white"
            }`}
          >
            {teamNameOf(league, match.awayId)}
          </div>
          <ScorerList scorers={scorers.filter((goal) => goal.teamId === match.awayId)} align="left" />
        </div>
      </div>
      {homeGoals === 0 && awayGoals === 0 && status !== "Kick off" && status !== "Goal" ? (
        <p className="mt-4 text-center text-sm text-emerald-100/60">Goalless draw</p>
      ) : null}
    </>
  );
}

function playerMatchResult(match: MatchResult): "win" | "draw" | "loss" | null {
  if (!isMatchPlayed(match)) return null;
  const youAreHome = match.homeId === PLAYER_TEAM_ID;
  const youAreAway = match.awayId === PLAYER_TEAM_ID;
  if (!youAreHome && !youAreAway) return null;
  const yours = youAreHome ? match.homeGoals : match.awayGoals;
  const theirs = youAreHome ? match.awayGoals : match.homeGoals;
  if (yours > theirs) return "win";
  if (yours < theirs) return "loss";
  return "draw";
}

function matchRowTone(match: MatchResult): string {
  const result = playerMatchResult(match);
  if (result === "win") return "border-lime-300/45 bg-lime-300/10";
  if (result === "loss") return "border-rose-300/45 bg-rose-300/10";
  if (result === "draw") return "border-white/55 bg-white/10";
  if (match.homeId === PLAYER_TEAM_ID || match.awayId === PLAYER_TEAM_ID) {
    return "border-amber-300/40 bg-amber-300/10";
  }
  return "border-white/10 bg-emerald-950/40";
}

function MatchRow({
  match,
  league,
  onOpen,
}: {
  match: MatchResult;
  league: LeagueState;
  onOpen: (match: MatchResult) => void;
}) {
  const home = teamNameOf(league, match.homeId);
  const away = teamNameOf(league, match.awayId);
  const played = isMatchPlayed(match);
  const className = `grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border px-3 py-2 text-sm ${matchRowTone(match)}`;
  const body = (
    <>
      <span className={`truncate text-right ${match.homeId === PLAYER_TEAM_ID ? "font-bold text-amber-200" : "text-white"}`}>
        {home}
      </span>
      <span className="rounded-lg bg-black/30 px-2 py-1 font-black text-white">
        {played ? `${match.homeGoals}–${match.awayGoals}` : "vs"}
      </span>
      <span className={`truncate text-left ${match.awayId === PLAYER_TEAM_ID ? "font-bold text-amber-200" : "text-white"}`}>
        {away}
      </span>
    </>
  );
  if (!played) {
    return <div className={`${className} cursor-default`}>{body}</div>;
  }
  return (
    <button type="button" onClick={() => onOpen(match)} className={className}>
      {body}
    </button>
  );
}

function LineupEditor({
  formationId,
  xi,
  bench,
  onLineupChange,
}: {
  formationId: FormationId;
  xi: Record<string, PlayerSeason | null>;
  bench: (PlayerSeason | null)[];
  onLineupChange: (xi: Record<string, PlayerSeason | null>, bench: (PlayerSeason | null)[]) => void;
}) {
  const formation = FORMATION_BY_ID[formationId];
  const [selected, setSelected] = useState<PlayerSeason | null>(null);
  const highlight = selected ? compatibleSlotIds(selected, formation, xi) : [];

  const place = (target: { type: "xi"; slotId: string } | { type: "bench"; index: number }) => {
    if (!selected) {
      const occupant = target.type === "xi" ? xi[target.slotId] : bench[target.index];
      if (occupant) setSelected(occupant);
      return;
    }
    const nextXi = { ...xi };
    const nextBench = [...bench];
    if (target.type === "xi") {
      const occupant = nextXi[target.slotId];
      if (occupant?.id === selected.id) {
        setSelected(null);
        return;
      }
      const fromBench = nextBench.findIndex((player) => player?.id === selected.id);
      const fromSlot = Object.entries(nextXi).find(([, player]) => player?.id === selected.id)?.[0];
      if (fromBench >= 0) {
        nextBench[fromBench] = occupant ?? null;
        nextXi[target.slotId] = selected;
      } else if (fromSlot) {
        nextXi[fromSlot] = occupant ?? null;
        nextXi[target.slotId] = selected;
      }
    } else {
      if (nextBench[target.index]?.id === selected.id) {
        setSelected(null);
        return;
      }
      const occupant = nextBench[target.index];
      const fromSlot = Object.entries(nextXi).find(([, player]) => player?.id === selected.id)?.[0];
      const fromBench = nextBench.findIndex((player) => player?.id === selected.id);
      if (fromSlot) {
        nextXi[fromSlot] = occupant ?? null;
        nextBench[target.index] = selected;
      } else if (fromBench >= 0) {
        nextBench[fromBench] = occupant ?? null;
        nextBench[target.index] = selected;
      }
    }
    if (formation.slots.some((slot) => !nextXi[slot.id])) {
      setSelected(null);
      return;
    }
    setSelected(null);
    onLineupChange(nextXi, nextBench);
  };

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Lineup · tap to swap</p>
        <Pitch
          formationId={formationId}
          xi={xi}
          selectedSlotId={
            selected ? Object.entries(xi).find(([, player]) => player?.id === selected.id)?.[0] : null
          }
          highlightedSlotIds={highlight}
          previewPlayer={selected}
          onSlotClick={(slotId) => place({ type: "xi", slotId })}
        />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100/60">Bench</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
          {Array.from({ length: BENCH_SIZE }, (_, index) => {
            const player = bench[index];
            const active = selected?.id === player?.id;
            return (
              <button
                key={index}
                type="button"
                onClick={() => place({ type: "bench", index })}
                className={`min-h-16 rounded-2xl border px-2 py-2 text-left text-xs ${
                  active
                    ? "border-amber-300 bg-amber-300/15"
                    : selected
                      ? "border-amber-300/40 bg-emerald-950/70"
                      : "border-white/10 bg-emerald-950/40"
                }`}
              >
                {player ? (
                  <div className="flex items-center gap-2">
                    <PlayerPortrait player={player} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-white">{player.name}</span>
                      <span className="text-emerald-100/60">{player.slot}</span>
                    </span>
                    <OverallBadge overall={player.overall} size="sm" />
                  </div>
                ) : (
                  <div className="text-emerald-100/50">Bench {index + 1}</div>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-emerald-100/55">
          Swap a starter with the bench, or move players between pitch slots. Similar roles are −1; bigger mismatches drop more. This XI is used for the next match and carries over until you change it.
        </p>
      </div>
    </div>
  );
}

function MatchActions({
  playLabel,
  playDisabled,
  onPlay,
  onQuickSim,
}: {
  playLabel: string;
  playDisabled?: boolean;
  onPlay?: () => void;
  onQuickSim?: () => void;
}) {
  if (!onPlay && !onQuickSim) return null;
  return (
    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
      {onPlay ? (
        <button
          type="button"
          disabled={playDisabled}
          onClick={onPlay}
          className="flex-1 rounded-2xl bg-amber-300 py-3 text-sm font-black uppercase tracking-widest text-emerald-950 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
        >
          {playLabel}
        </button>
      ) : null}
      {onQuickSim ? (
        <button
          type="button"
          onClick={onQuickSim}
          className="flex-1 rounded-2xl bg-white/10 py-3 text-sm font-black uppercase tracking-widest text-white"
        >
          Quick sim to end
        </button>
      ) : null}
    </div>
  );
}

export function SeasonScreen({
  teamName,
  leagueName,
  league,
  formationId,
  xi,
  bench,
  kit = DEFAULT_HOME_KIT,
  onNewGame,
  onPlayNext,
  onQuickSimRest,
  onLineupChange,
}: Props) {
  const completeLeague = isSeasonComplete(league);
  const played = playedGameweeksOf(league);
  const total = seasonLength(league);
  const upcoming = nextGameweek(league);
  const [gameweek, setGameweek] = useState(upcoming ?? total);
  const [tab, setTab] = useState<"table" | "gameweek" | "mine">(completeLeague ? "table" : "gameweek");
  const [openMatch, setOpenMatch] = useState<MatchResult | null>(null);
  const [watching, setWatching] = useState<WatchState | null>(null);
  const [clock, setClock] = useState("Kick off");
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingMatchId) return;
    const match = league.matches.find((item) => item.id === pendingMatchId);
    if (!match || !isMatchPlayed(match)) return;
    setPendingMatchId(null);
    setWatching({ match, revealed: 0, done: false });
    setClock("Kick off");
    setGameweek(match.gameweek);
    setTab("gameweek");
  }, [league, pendingMatchId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab]);

  const you = league.table.find((row) => row.teamId === PLAYER_TEAM_ID);
  const rank = league.table.findIndex((row) => row.teamId === PLAYER_TEAM_ID) + 1;
  const champion = league.table[0];
  const wonTitle = champion?.teamId === PLAYER_TEAM_ID;
  const showFinal = completeLeague && (!watching || watching.done);
  const live = !showFinal;
  const nextFixture = upcoming ? playerMatchInGameweek(league, upcoming) : undefined;
  const sliderMax = showFinal ? total : Math.max(1, watching?.match.gameweek ?? upcoming ?? played);

  const liveScore = watching ? runningScore(watching.match, watching.revealed) : null;
  const watchStatus = watching ? (watching.done ? "Full time" : clock) : null;
  const watchMatch = watching?.match;
  const watched = useMemo(() => {
    if (!watchMatch) return { home: null, away: null };
    const home = matchSide(league, watchMatch.homeId, formationId, xi);
    const away = matchSide(league, watchMatch.awayId, formationId, xi);
    const kits = kitsForFixture(league, home.id, away.id, kit);
    return { home: { ...home, kit: kits.home }, away: { ...away, kit: kits.away } };
  }, [watchMatch, league, formationId, xi, kit]);
  const watchHome = watched.home;
  const watchAway = watched.away;
  const onWatchReveal = useCallback((count: number) => {
    setWatching((current) => (current ? { ...current, revealed: count } : current));
  }, []);
  const onWatchComplete = useCallback(() => {
    setWatching((current) =>
      current ? { ...current, done: true, revealed: (current.match.scorers ?? []).length } : current,
    );
  }, []);

  const gwMatches = useMemo(
    () => league.matches.filter((match) => match.gameweek === gameweek),
    [league.matches, gameweek],
  );
  const myMatches = useMemo(
    () =>
      league.matches.filter(
        (match) =>
          (match.homeId === PLAYER_TEAM_ID || match.awayId === PLAYER_TEAM_ID) && isMatchPlayed(match),
      ),
    [league.matches],
  );
  const otherGwResults = watching
    ? league.matches.filter(
        (match) => match.gameweek === watching.match.gameweek && match.id !== watching.match.id && isMatchPlayed(match),
      )
    : [];

  const playNext = () => {
    if (!onPlayNext || (watching && !watching.done)) return;
    const fixture = watching?.done ? (upcoming ? playerMatchInGameweek(league, upcoming) : undefined) : nextFixture;
    if (!fixture) {
      setWatching(null);
      return;
    }
    setPendingMatchId(fixture.id);
    onPlayNext();
  };

  const quickSimRest = () => {
    if (!onQuickSimRest) return;
    setPendingMatchId(null);
    setWatching(null);
    onQuickSimRest();
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="rounded-3xl border border-white/10 bg-emerald-950/50 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">
          Fictional {leagueName}
        </p>
        <h1 className="mt-2 text-4xl font-black text-white">{teamName}</h1>
        <p className="mt-2 text-lg text-emerald-100/80">
          {showFinal
            ? wonTitle
              ? `Champions — ${you?.points ?? 0} points, ${you?.won ?? 0} wins.`
              : `Finished ${ordinal(rank)} with ${you?.points ?? 0} points. ${teamNameOf(league, champion.teamId)} lifted the trophy.`
            : played === 0
              ? `Match-by-match · ${total} gameweeks. Play your first fixture, or skip to the end.`
              : `Gameweek ${watching?.done || !watching ? played : watching.match.gameweek} of ${total} · ${ordinal(rank)} · ${you?.points ?? 0} pts`}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(["table", "gameweek", "mine"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${
                  tab === id ? "bg-amber-300 text-emerald-950" : "bg-white/10 text-white"
                }`}
              >
                {id === "mine" ? "My matches" : id}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onNewGame}
            className="rounded-full bg-amber-300 px-4 py-1.5 text-sm font-semibold text-emerald-950"
          >
            New draft
          </button>
        </div>
      </header>

      {live && !watching && !pendingMatchId && nextFixture && tab === "gameweek" ? (
        <section className="rounded-3xl border border-amber-300/30 bg-emerald-950/40 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
            Next up · GW {nextFixture.gameweek}
            {nextFixture.homeId === PLAYER_TEAM_ID ? " · Home" : " · Away"}
          </p>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div
              className={`text-right text-2xl font-black ${
                nextFixture.homeId === PLAYER_TEAM_ID ? "text-amber-200" : "text-white"
              }`}
            >
              {teamNameOf(league, nextFixture.homeId)}
            </div>
            <div className="rounded-xl bg-black/30 px-3 py-1 text-sm font-black uppercase tracking-widest text-emerald-100/70">
              vs
            </div>
            <div
              className={`text-left text-2xl font-black ${
                nextFixture.awayId === PLAYER_TEAM_ID ? "text-amber-200" : "text-white"
              }`}
            >
              {teamNameOf(league, nextFixture.awayId)}
            </div>
          </div>
          {formationId && xi && bench && onLineupChange ? (
            <LineupEditor
              formationId={formationId}
              xi={xi}
              bench={bench}
              onLineupChange={onLineupChange}
            />
          ) : null}
          <MatchActions
            playLabel={played === 0 ? "Play match" : "Play next match"}
            playDisabled={Boolean(pendingMatchId)}
            onPlay={onPlayNext ? playNext : undefined}
            onQuickSim={onQuickSimRest ? quickSimRest : undefined}
          />
        </section>
      ) : null}

      {watching && liveScore && (!watching.done || tab === "gameweek") ? (
        <section className="rounded-3xl border border-amber-300/40 bg-emerald-950 p-8">
          <MatchSheet
            league={league}
            match={watching.match}
            homeGoals={liveScore.home}
            awayGoals={liveScore.away}
            scorers={liveScore.scorers}
            status={watchStatus}
          />
          {watchHome && watchAway ? (
            <MatchPitch
              key={watching.match.id}
              home={watchHome}
              away={watchAway}
              scorers={watching.match.scorers ?? EMPTY_SCORERS}
              youId={PLAYER_TEAM_ID}
              onReveal={onWatchReveal}
              onClock={setClock}
              onComplete={onWatchComplete}
            />
          ) : null}
          {watchHome && watchAway && !watching.done ? (
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <MatchLineup
                side={watchHome}
                bench={benchForSide(league, watchHome.id, bench)}
                you={watchHome.id === PLAYER_TEAM_ID}
              />
              <MatchLineup
                side={watchAway}
                bench={benchForSide(league, watchAway.id, bench)}
                you={watchAway.id === PLAYER_TEAM_ID}
              />
            </div>
          ) : null}
          {watching.done && nextFixture && formationId && xi && bench && onLineupChange ? (
            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
                Next up · GW {nextFixture.gameweek}
                {nextFixture.homeId === PLAYER_TEAM_ID ? " · Home" : " · Away"}
              </p>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <div
                  className={`text-right text-xl font-black ${
                    nextFixture.homeId === PLAYER_TEAM_ID ? "text-amber-200" : "text-white"
                  }`}
                >
                  {teamNameOf(league, nextFixture.homeId)}
                </div>
                <div className="rounded-xl bg-black/30 px-3 py-1 text-sm font-black uppercase tracking-widest text-emerald-100/70">
                  vs
                </div>
                <div
                  className={`text-left text-xl font-black ${
                    nextFixture.awayId === PLAYER_TEAM_ID ? "text-amber-200" : "text-white"
                  }`}
                >
                  {teamNameOf(league, nextFixture.awayId)}
                </div>
              </div>
              <LineupEditor
                formationId={formationId}
                xi={xi}
                bench={bench}
                onLineupChange={onLineupChange}
              />
              <MatchActions
                playLabel="Play next match"
                playDisabled={Boolean(pendingMatchId)}
                onPlay={onPlayNext ? playNext : undefined}
                onQuickSim={onQuickSimRest ? quickSimRest : undefined}
              />
            </div>
          ) : null}
          {watching.done ? (
            <div className="mt-8 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100/50">Rest of GW {watching.match.gameweek}</p>
              {otherGwResults.map((match) => (
                <MatchRow key={match.id} match={match} league={league} onOpen={setOpenMatch} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "table" ? (
        <div className="overflow-x-auto rounded-3xl border border-white/10">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-emerald-950/80 text-xs uppercase tracking-wider text-emerald-100/60">
              <tr>
                <th className="px-3 py-3">#</th>
                <th>Club</th>
                <th className="text-right">P</th>
                <th className="text-right">W</th>
                <th className="text-right">D</th>
                <th className="text-right">L</th>
                <th className="text-right">GF</th>
                <th className="text-right">GA</th>
                <th className="text-right">GD</th>
                <th className="px-4 py-3 text-right">Pts</th>
              </tr>
            </thead>
            <tbody>
              {league.table.map((row, index) => {
                const yours = row.teamId === PLAYER_TEAM_ID;
                return (
                  <tr
                    key={row.teamId}
                    className={yours ? "bg-amber-300/15 font-bold text-amber-100" : "text-white odd:bg-white/5"}
                  >
                    <td className="px-3 py-2">{index + 1}</td>
                    <td>{teamNameOf(league, row.teamId)}</td>
                    <td className="text-right">{row.played}</td>
                    <td className="text-right">{row.won}</td>
                    <td className="text-right">{row.drawn}</td>
                    <td className="text-right">{row.lost}</td>
                    <td className="text-right">{row.gf}</td>
                    <td className="text-right">{row.ga}</td>
                    <td className="text-right">{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                    <td className="px-3 text-right">{row.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "gameweek" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-emerald-100/80">
              Gameweek
              <input
                type="range"
                min={1}
                max={sliderMax}
                value={Math.min(gameweek, sliderMax)}
                onChange={(event) => setGameweek(Number(event.target.value))}
                className="ml-3 align-middle"
              />
            </label>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white">GW {Math.min(gameweek, sliderMax)}</span>
          </div>
          {watching && !watching.done && gameweek === watching.match.gameweek ? (
            <p className="rounded-2xl border border-white/10 px-4 py-6 text-sm text-emerald-100/60">
              Other results unlock at full time.
            </p>
          ) : (
            <div className="grid gap-2">
              {gwMatches.map((match) => (
                <MatchRow key={match.id} match={match} league={league} onOpen={setOpenMatch} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "mine" ? (
        <section className="grid gap-2">
          {myMatches.length === 0 ? (
            <p className="rounded-2xl border border-white/10 px-4 py-6 text-sm text-emerald-100/60">
              Your results will land here after you play a match.
            </p>
          ) : (
            myMatches.map((match) => (
              <div key={match.id} className="flex items-center gap-3">
                <span className="w-12 text-xs text-emerald-100/50">GW{match.gameweek}</span>
                <div className="flex-1">
                  <MatchRow match={match} league={league} onOpen={setOpenMatch} />
                </div>
              </div>
            ))
          )}
        </section>
      ) : null}

      {openMatch ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpenMatch(null)}>
          <div
            className="w-full max-w-xl rounded-3xl border border-white/15 bg-emerald-950 p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <MatchSheet
              league={league}
              match={openMatch}
              homeGoals={openMatch.homeGoals}
              awayGoals={openMatch.awayGoals}
              scorers={openMatch.scorers ?? []}
            />
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setOpenMatch(null)}
                className="rounded-full bg-white/10 px-5 py-2 text-sm text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
