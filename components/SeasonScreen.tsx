"use client";

import { useMemo, useState } from "react";
import { PLAYER_TEAM_ID } from "@/lib/simulate";
import type { GoalScorer, LeagueState, MatchResult } from "@/lib/types";

type Props = {
  teamName: string;
  league: LeagueState;
  onNewGame: () => void;
};

function teamNameOf(league: LeagueState, id: string): string {
  return league.teams.find((team) => team.id === id)?.name ?? id;
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
  const yours = match.homeId === PLAYER_TEAM_ID || match.awayId === PLAYER_TEAM_ID;
  return (
    <button
      type="button"
      onClick={() => onOpen(match)}
      className={`grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
        yours ? "border-amber-300/40 bg-amber-300/10" : "border-white/10 bg-emerald-950/40"
      }`}
    >
      <span className={`truncate text-right ${match.homeId === PLAYER_TEAM_ID ? "font-bold text-amber-200" : "text-white"}`}>
        {home}
      </span>
      <span className="rounded-lg bg-black/30 px-2 py-1 font-black text-white">
        {match.homeGoals}–{match.awayGoals}
      </span>
      <span className={`truncate text-left ${match.awayId === PLAYER_TEAM_ID ? "font-bold text-amber-200" : "text-white"}`}>
        {away}
      </span>
    </button>
  );
}

export function SeasonScreen({ teamName, league, onNewGame }: Props) {
  const [gameweek, setGameweek] = useState(1);
  const [tab, setTab] = useState<"table" | "gameweek" | "mine">("table");
  const [openMatch, setOpenMatch] = useState<MatchResult | null>(null);

  const you = league.table.find((row) => row.teamId === PLAYER_TEAM_ID);
  const rank = league.table.findIndex((row) => row.teamId === PLAYER_TEAM_ID) + 1;
  const champion = league.table[0];
  const wonTitle = champion?.teamId === PLAYER_TEAM_ID;
  const gwMatches = useMemo(
    () => league.matches.filter((match) => match.gameweek === gameweek),
    [league.matches, gameweek],
  );
  const myMatches = useMemo(
    () =>
      league.matches.filter((match) => match.homeId === PLAYER_TEAM_ID || match.awayId === PLAYER_TEAM_ID),
    [league.matches],
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="rounded-3xl border border-white/10 bg-emerald-950/50 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Fictional Premier League</p>
        <h1 className="mt-2 text-4xl font-black text-white">{teamName}</h1>
        <p className="mt-2 text-lg text-emerald-100/80">
          {wonTitle
            ? `Champions — ${you?.points ?? 0} points, ${you?.won ?? 0} wins.`
            : `Finished ${rank}${rank === 2 ? "nd" : rank === 3 ? "rd" : "th"} with ${you?.points ?? 0} points. ${teamNameOf(league, champion.teamId)} lifted the trophy.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
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
          <button type="button" onClick={onNewGame} className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-white">
            New draft
          </button>
        </div>
      </header>

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
                max={38}
                value={gameweek}
                onChange={(event) => setGameweek(Number(event.target.value))}
                className="ml-3 align-middle"
              />
            </label>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white">GW {gameweek}</span>
          </div>
          <div className="grid gap-2">
            {gwMatches.map((match) => (
              <MatchRow key={match.id} match={match} league={league} onOpen={setOpenMatch} />
            ))}
          </div>
        </section>
      ) : null}

      {tab === "mine" ? (
        <section className="grid gap-2">
          {myMatches.map((match) => (
            <div key={match.id} className="flex items-center gap-3">
              <span className="w-12 text-xs text-emerald-100/50">GW{match.gameweek}</span>
              <div className="flex-1">
                <MatchRow match={match} league={league} onOpen={setOpenMatch} />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {openMatch ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpenMatch(null)}>
          <div
            className="w-full max-w-xl rounded-3xl border border-white/15 bg-emerald-950 p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-center text-xs uppercase tracking-[0.3em] text-amber-300">
              Gameweek {openMatch.gameweek}
            </p>
            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-start gap-4">
              <div className="text-right">
                <div
                  className={`text-lg font-black leading-tight ${
                    openMatch.homeId === PLAYER_TEAM_ID ? "text-amber-200" : "text-white"
                  }`}
                >
                  {teamNameOf(league, openMatch.homeId)}
                </div>
                {openMatch.scorers ? (
                  <ScorerList
                    scorers={openMatch.scorers.filter((goal) => goal.teamId === openMatch.homeId)}
                    align="right"
                  />
                ) : null}
              </div>
              <div className="pt-0.5 text-center">
                <div className="text-4xl font-black tabular-nums text-amber-300">
                  {openMatch.homeGoals}–{openMatch.awayGoals}
                </div>
              </div>
              <div className="text-left">
                <div
                  className={`text-lg font-black leading-tight ${
                    openMatch.awayId === PLAYER_TEAM_ID ? "text-amber-200" : "text-white"
                  }`}
                >
                  {teamNameOf(league, openMatch.awayId)}
                </div>
                {openMatch.scorers ? (
                  <ScorerList
                    scorers={openMatch.scorers.filter((goal) => goal.teamId === openMatch.awayId)}
                    align="left"
                  />
                ) : null}
              </div>
            </div>
            {openMatch.scorers && openMatch.homeGoals === 0 && openMatch.awayGoals === 0 ? (
              <p className="mt-4 text-center text-sm text-emerald-100/60">Goalless draw</p>
            ) : null}
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
