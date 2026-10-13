"use client";

import { FORMATION_BY_ID, ratingBadge, shortSeason } from "@/lib/formations";
import type { FormationId, PlayerSeason } from "@/lib/types";

type Props = {
  formationId: FormationId;
  xi: Record<string, PlayerSeason | null>;
  selectedSlotId?: string | null;
  highlightedSlotIds?: string[];
  interactive?: boolean;
  onSlotClick?: (slotId: string) => void;
};

export function Pitch({
  formationId,
  xi,
  selectedSlotId,
  highlightedSlotIds = [],
  interactive = true,
  onSlotClick,
}: Props) {
  const formation = FORMATION_BY_ID[formationId];

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-emerald-400/20 bg-linear-to-b from-emerald-800 via-emerald-700 to-emerald-900 shadow-[inset_0_0_80px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-x-[8%] top-[6%] h-[88%] rounded-[12px] border-2 border-white/25" />
      <div className="pointer-events-none absolute inset-x-[28%] top-[6%] h-[18%] rounded-b-[12px] border-2 border-t-0 border-white/20" />
      <div className="pointer-events-none absolute inset-x-[28%] bottom-[6%] h-[18%] rounded-t-[12px] border-2 border-b-0 border-white/20" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20" />
      <div className="pointer-events-none absolute inset-x-[8%] top-1/2 border-t-2 border-white/20" />

      {formation.slots.map((slot) => {
        const player = xi[slot.id];
        const highlighted = highlightedSlotIds.includes(slot.id);
        const selected = selectedSlotId === slot.id;
        const className = `absolute w-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl px-1.5 py-1 text-center shadow-lg backdrop-blur-sm transition ${
          selected
            ? "bg-amber-300 text-emerald-950 ring-2 ring-white"
            : highlighted
              ? "bg-white text-emerald-950 ring-2 ring-amber-300"
              : player
                ? "bg-emerald-950/80 text-white ring-1 ring-white/20"
                : "bg-emerald-950/40 text-white/80 ring-1 ring-dashed ring-white/40"
        }`;
        const body = (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{slot.label}</div>
            {player ? (
              <>
                <div className="truncate text-[11px] font-bold leading-tight">{player.name}</div>
                <div className="mt-0.5 flex items-center justify-center gap-1">
                  <span className={`rounded px-1 text-[10px] font-black ${ratingBadge(player.overall)}`}>
                    {player.overall}
                  </span>
                  <span className="text-[9px] text-white/70">{shortSeason(player.season)}</span>
                </div>
              </>
            ) : (
              <div className="text-[10px] italic text-white/60">empty</div>
            )}
          </>
        );
        if (!interactive) {
          return (
            <div key={slot.id} style={{ left: `${slot.x}%`, top: `${slot.y}%` }} className={className}>
              {body}
            </div>
          );
        }
        return (
          <button
            key={slot.id}
            type="button"
            onClick={() => onSlotClick?.(slot.id)}
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            className={className}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
