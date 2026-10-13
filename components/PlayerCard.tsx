"use client";

import { ratingBadge, shortSeason } from "@/lib/formations";
import type { PlayerSeason } from "@/lib/types";

type Props = {
  player: PlayerSeason;
  disabled?: boolean;
  selected?: boolean;
  onClick?: () => void;
};

export function PlayerCard({ player, disabled, selected, onClick }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
        selected
          ? "border-amber-300 bg-amber-300/15"
          : disabled
            ? "cursor-not-allowed border-white/5 bg-white/5 opacity-40"
            : "border-white/10 bg-emerald-950/60 hover:border-amber-300/60 hover:bg-emerald-900/80"
      }`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black ${ratingBadge(player.overall)}`}>
        {player.overall}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-white">{player.name}</span>
        <span className="block text-xs text-emerald-100/70">
          {player.slot} · {player.club} {shortSeason(player.season)}
          {player.ratingSource === "fifa" ? " · FIFA" : ""}
        </span>
      </span>
    </button>
  );
}
