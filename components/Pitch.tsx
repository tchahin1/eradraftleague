"use client";

import {
  effectiveOverall,
  FORMATION_BY_ID,
  positionPenalty,
  shortSeason,
} from "@/lib/formations";
import { pitchSurname } from "@/lib/photos";
import type { FormationId, PlayerSeason } from "@/lib/types";
import { PlayerPortrait } from "./PlayerPortrait";

type Props = {
  formationId: FormationId;
  xi: Record<string, PlayerSeason | null>;
  selectedSlotId?: string | null;
  highlightedSlotIds?: string[];
  previewPlayer?: PlayerSeason | null;
  interactive?: boolean;
  preview?: boolean;
  onSlotClick?: (slotId: string) => void;
};

function highlightRing(penalty: number): string {
  if (penalty === 0) return "ring-2 ring-amber-300";
  if (penalty >= -4) return "ring-2 ring-lime-300";
  if (penalty >= -7) return "ring-2 ring-orange-400";
  return "ring-2 ring-red-400";
}

function penaltyText(penalty: number): string {
  return `PEN ${penalty}`;
}

export function Pitch({
  formationId,
  xi,
  selectedSlotId,
  highlightedSlotIds = [],
  previewPlayer = null,
  interactive = true,
  preview = false,
  onSlotClick,
}: Props) {
  const formation = FORMATION_BY_ID[formationId];

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-green-400/20 bg-linear-to-b from-green-800 via-green-700 to-green-900 shadow-[inset_0_0_80px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-x-[8%] top-[6%] h-[88%] rounded-[12px] border-2 border-white/25" />
      <div className="pointer-events-none absolute inset-x-[28%] top-[6%] h-[18%] rounded-b-[12px] border-2 border-t-0 border-white/20" />
      <div className="pointer-events-none absolute inset-x-[28%] bottom-[6%] h-[18%] rounded-t-[12px] border-2 border-b-0 border-white/20" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20" />
      <div className="pointer-events-none absolute inset-x-[8%] top-1/2 border-t-2 border-white/20" />

      {formation.slots.map((slot) => {
        const player = xi[slot.id];
        const highlighted = highlightedSlotIds.includes(slot.id);
        const selected = selectedSlotId === slot.id;
        const placedPenalty = player ? positionPenalty(player.slot, slot.kind, formation) : 0;
        const previewPenalty = previewPlayer && highlighted ? positionPenalty(previewPlayer.slot, slot.kind, formation) : 0;
        const shownOverall = player ? effectiveOverall(player, slot.kind, formation) : null;
        const className = preview
          ? "absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-950/80 text-[10px] font-bold uppercase tracking-wide text-white ring-1 ring-white/35"
          : `absolute w-[4.5rem] -translate-x-1/2 -translate-y-1/2 rounded-2xl px-1 py-1 text-center transition ${
              selected
                ? "bg-amber-300/90 text-emerald-950 ring-2 ring-white"
                : highlighted
                  ? `bg-white/90 text-emerald-950 ${highlightRing(previewPenalty)}`
                  : player
                    ? "bg-emerald-950/55 text-white"
                    : "bg-emerald-950/35 text-white/80 ring-1 ring-dashed ring-white/40"
            }`;
        const body = preview ? (
          slot.label
        ) : (
          <>
            <div className={`text-[9px] font-semibold uppercase tracking-wide ${selected || highlighted ? "opacity-80" : "text-white/70"}`}>
              {slot.label}
            </div>
            {player ? (
              <>
                <div className="mt-0.5 flex justify-center">
                  <PlayerPortrait player={player} size="md" rating={shownOverall ?? player.overall} />
                </div>
                <div className="mt-1 truncate text-[10px] font-bold leading-tight">{pitchSurname(player.name)}</div>
                {placedPenalty < 0 ? (
                  <div className={`text-[8px] font-bold uppercase tracking-wide ${selected ? "text-red-800" : "text-red-300"}`}>
                    {penaltyText(placedPenalty)}
                  </div>
                ) : (
                  <div className={`text-[9px] ${selected || highlighted ? "text-emerald-900/70" : "text-white/55"}`}>
                    {shortSeason(player.season)}
                  </div>
                )}
              </>
            ) : highlighted && previewPlayer ? (
              <div className={`py-3 text-[9px] font-black uppercase tracking-wide ${previewPenalty <= -8 ? "text-red-700" : "text-emerald-900"}`}>
                {previewPenalty === 0 ? "Fit" : penaltyText(previewPenalty)}
              </div>
            ) : (
              <div className="py-3 text-[10px] italic text-white/60">empty</div>
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
