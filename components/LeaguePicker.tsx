"use client";

import { LEAGUES, STARTING_LEAGUE_ID, type LeagueId } from "@/lib/leagues";

export function HomeHero({ error }: { error?: string | null }) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">
        Europe’s top five leagues
      </p>
      <h1 className="text-5xl font-black tracking-tight text-white md:text-6xl">Era Draft League</h1>
      <p className="max-w-xl text-lg leading-8 text-emerald-100/80">
        Pick a league. Get a random club from a random season. Pick one player. Repeat until you have a
        custom XI and bench, then see if that side can win a fictional title race against other frozen eras.
      </p>
      {error ? <p className="max-w-xl text-sm text-rose-200">{error}</p> : null}
    </>
  );
}

type Props = {
  hoveredLeague: LeagueId | null;
  loadingLeague?: LeagueId | null;
  disabled?: boolean;
  onHover: (id: LeagueId | null) => void;
  onChoose: (id: LeagueId) => void;
};

export function LeaguePicker({
  hoveredLeague,
  loadingLeague = null,
  disabled,
  onHover,
  onChoose,
}: Props) {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      onMouseLeave={() => {
        if (!loadingLeague) onHover(null);
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        if (!loadingLeague) onHover(null);
      }}
    >
      {LEAGUES.map((league) => {
        const busy = loadingLeague === league.id;
        const previewId = hoveredLeague ?? loadingLeague ?? STARTING_LEAGUE_ID;
        const isDefault = league.id === STARTING_LEAGUE_ID && previewId === STARTING_LEAGUE_ID;
        const isHovered = hoveredLeague === league.id || loadingLeague === league.id;
        return (
          <button
            key={league.id}
            type="button"
            data-card={league.id}
            disabled={disabled || Boolean(loadingLeague)}
            onClick={() => onChoose(league.id)}
            onMouseEnter={() => onHover(league.id)}
            onFocus={() => onHover(league.id)}
            className={`league-card rounded-3xl p-5 text-left disabled:cursor-wait disabled:opacity-60 ${
              isDefault ? "league-card-start" : ""
            } ${isHovered ? "league-card-hover" : ""}`}
          >
            <p className="league-card-country pl-2 text-xs font-semibold uppercase tracking-[0.25em]">
              {league.country}
            </p>
            <h2 className="mt-2 pl-2 text-3xl font-black text-white">{league.name}</h2>
            <p className="mt-2 pl-2 text-sm text-emerald-100/70">
              {busy
                ? "Loading eras…"
                : `${league.teamCount} clubs · ${league.gameweeks} games · ${league.eraLabel}`}
            </p>
          </button>
        );
      })}
    </div>
  );
}
