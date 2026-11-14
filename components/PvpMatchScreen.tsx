"use client";

import { useEffect, useState } from "react";
import { FORMATION_BY_ID } from "@/lib/formations";
import { squadToXiRecord, type PvpMatch, type PvpSquad } from "@/lib/pvp";
import type { GoalScorer } from "@/lib/types";
import { Pitch } from "./Pitch";
import { OverallBadge, PlayerPortrait } from "./PlayerPortrait";

type Props = {
  match: PvpMatch;
  youId: string;
  rematchPending: boolean;
  opponentRematch: boolean;
  opponentConnected: boolean;
  onRematch: () => void;
  onLeave: () => void;
};

function runningScore(match: PvpMatch, revealed: number) {
  const scorers = match.scorers.slice(0, Math.max(0, revealed));
  let home = 0;
  let away = 0;
  for (const goal of scorers) {
    if (goal.teamId === match.homeId) home += 1;
    else away += 1;
  }
  return { home, away, scorers };
}

function ScorerList({ scorers, align }: { scorers: GoalScorer[]; align: "left" | "right" }) {
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

function Lineup({ squad, you }: { squad: PvpSquad; you: boolean }) {
  const formation = FORMATION_BY_ID[squad.formationId];
  return (
    <div className="rounded-3xl border border-white/10 bg-emerald-950/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
        {you ? "Your XI" : "Their XI"} · {formation.name}
      </p>
      <h2 className="mt-1 text-2xl font-black text-white">{squad.teamName}</h2>
      <div className="mt-3 max-w-sm">
        <Pitch formationId={squad.formationId} xi={squadToXiRecord(squad)} interactive={false} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {squad.bench.map((player) => (
          <div key={player.id} className="flex items-center gap-2 rounded-xl border border-white/10 px-2 py-1.5">
            <PlayerPortrait player={player} size="sm" />
            <span className="min-w-0 flex-1 truncate text-xs text-white">{player.name}</span>
            <OverallBadge overall={player.overall} size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PvpMatchScreen({
  match,
  youId,
  rematchPending,
  opponentRematch,
  opponentConnected,
  onRematch,
  onLeave,
}: Props) {
  const [revealed, setRevealed] = useState(0);
  const [done, setDone] = useState(false);
  const live = runningScore(match, revealed);
  const youHome = match.homeId === youId;
  const yours = youHome ? match.homeGoals : match.awayGoals;
  const theirs = youHome ? match.awayGoals : match.homeGoals;
  const result = yours > theirs ? "You win" : yours < theirs ? "You lose" : "Draw";
  const status = done ? "Full time" : revealed === 0 ? "Kick off" : "Goal";

  useEffect(() => {
    if (done) return;
    const totalGoals = match.scorers.length;
    const delay = revealed === 0 ? 850 : revealed >= totalGoals ? 650 : 750;
    const timer = window.setTimeout(() => {
      if (revealed >= totalGoals) setDone(true);
      else setRevealed((count) => count + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [done, match.scorers.length, revealed]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <section className="rounded-3xl border border-amber-300/40 bg-emerald-950 p-8">
        <p className="text-center text-xs uppercase tracking-[0.3em] text-amber-300">Friendly · one match</p>
        <p className="mt-2 text-center text-sm font-semibold uppercase tracking-[0.2em] text-emerald-100/70">
          {status}
        </p>
        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-start gap-4">
          <div className="text-right">
            <div className={`text-lg font-black leading-tight ${match.homeId === youId ? "text-amber-200" : "text-white"}`}>
              {match.homeName}
            </div>
            <ScorerList scorers={live.scorers.filter((goal) => goal.teamId === match.homeId)} align="right" />
          </div>
          <div className="pt-0.5 text-center">
            <div className="text-4xl font-black tabular-nums text-amber-300">
              {live.home}–{live.away}
            </div>
          </div>
          <div className="text-left">
            <div className={`text-lg font-black leading-tight ${match.awayId === youId ? "text-amber-200" : "text-white"}`}>
              {match.awayName}
            </div>
            <ScorerList scorers={live.scorers.filter((goal) => goal.teamId === match.awayId)} align="left" />
          </div>
        </div>
        {done && live.home === 0 && live.away === 0 ? (
          <p className="mt-4 text-center text-sm text-emerald-100/60">Goalless draw</p>
        ) : null}
        {done ? (
          <p className="mt-6 text-center text-2xl font-black text-amber-200">{result}</p>
        ) : null}
      </section>

      {done ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Lineup squad={match.homeSquad} you={match.homeId === youId} />
            <Lineup squad={match.awaySquad} you={match.awayId === youId} />
          </div>
          {!opponentConnected ? (
            <p className="text-center text-sm text-rose-200">Opponent disconnected. You can still leave or wait.</p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onRematch}
              disabled={rematchPending}
              className="rounded-2xl bg-amber-300 px-6 py-3 font-black uppercase tracking-widest text-emerald-950 disabled:bg-white/15 disabled:text-white/40"
            >
              {rematchPending
                ? opponentRematch
                  ? "Starting…"
                  : "Waiting for them…"
                : opponentRematch
                  ? "They want a rematch"
                  : "Rematch"}
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="rounded-2xl bg-white/10 px-6 py-3 font-semibold text-white"
            >
              Leave
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
