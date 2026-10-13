"use client";

import {
  BENCH_SIZE,
  compatibleSlotIds,
  countFilled,
  FORMATION_BY_ID,
  hasBackupGk,
  isDraftComplete,
  ratingBadge,
  SQUAD_SIZE,
  shortSeason,
} from "@/lib/formations";
import { playerCanBePicked, REROLLS_PER_DRAFT } from "@/lib/draft";
import type { DraftOffer, FormationId, PlayerSeason } from "@/lib/types";
import { Pitch } from "./Pitch";
import { PlayerCard } from "./PlayerCard";

type Props = {
  teamName: string;
  formationId: FormationId;
  xi: Record<string, PlayerSeason | null>;
  bench: (PlayerSeason | null)[];
  offer: DraftOffer;
  selectedPlayer: PlayerSeason | null;
  rerollsLeft: number;
  onReroll: () => void;
  onSelectPlayer: (player: PlayerSeason | null) => void;
  onPlace: (target: { type: "xi"; slotId: string } | { type: "bench"; index: number }) => void;
  onStartSeason: () => void;
};

export function DraftScreen({
  teamName,
  formationId,
  xi,
  bench,
  offer,
  selectedPlayer,
  rerollsLeft,
  onReroll,
  onSelectPlayer,
  onPlace,
  onStartSeason,
}: Props) {
  const formation = FORMATION_BY_ID[formationId];
  const filled = countFilled(xi, bench);
  const complete = isDraftComplete(formation, xi, bench);
  const highlight = selectedPlayer ? compatibleSlotIds(selectedPlayer, formation, xi) : [];
  const offerAvg = Math.round(offer.players.slice(0, 11).reduce((sum, p) => sum + p.overall, 0) / Math.min(11, offer.players.length));

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Draft · {teamName}</p>
            <h2 className="text-3xl font-black text-white">{formation.name}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center gap-2 rounded-full border border-amber-300/35 bg-amber-300/10 px-3 py-1.5"
              aria-label={`${rerollsLeft} of ${REROLLS_PER_DRAFT} team rerolls left`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">Rerolls</span>
              <RerollPips left={rerollsLeft} />
              <span className="text-sm font-black tabular-nums text-white">{rerollsLeft}</span>
            </div>
            <div className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-emerald-100">
              {filled}/{SQUAD_SIZE} picked
            </div>
          </div>
        </div>
        <Pitch
          formationId={formationId}
          xi={xi}
          selectedSlotId={
            selectedPlayer
              ? Object.entries(xi).find(([, player]) => player?.id === selectedPlayer.id)?.[0]
              : null
          }
          highlightedSlotIds={highlight}
          onSlotClick={(slotId) => onPlace({ type: "xi", slotId })}
        />
        <div>
          <div className="mb-2 flex items-center justify-between text-sm text-emerald-100/80">
            <span>Bench</span>
            {!hasBackupGk(bench) ? <span className="text-amber-300">Need a backup GK</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {Array.from({ length: BENCH_SIZE }, (_, index) => {
              const player = bench[index];
              const canBench = Boolean(selectedPlayer);
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onPlace({ type: "bench", index })}
                  className={`min-h-20 rounded-2xl border px-2 py-2 text-left text-xs ${
                    canBench
                      ? "border-amber-300/50 bg-emerald-950/70"
                      : "border-white/10 bg-emerald-950/40"
                  }`}
                >
                  {player ? (
                    <>
                      <div className={`mb-1 inline-block rounded px-1 font-black ${ratingBadge(player.overall)}`}>
                        {player.overall}
                      </div>
                      <div className="truncate font-semibold text-white">{player.name}</div>
                      <div className="text-emerald-100/60">{player.slot}</div>
                    </>
                  ) : (
                    <div className="text-emerald-100/50">Bench {index + 1}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          disabled={!complete}
          onClick={onStartSeason}
          className="w-full rounded-2xl bg-amber-300 py-3 text-sm font-black uppercase tracking-widest text-emerald-950 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
        >
          {complete ? "Simulate the season" : "Finish XI + 7-man bench to continue"}
        </button>
      </section>

      <section className="rounded-3xl border border-white/10 bg-emerald-950/40 p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-amber-300">This round</p>
            <h3 className="text-2xl font-black text-white">
              {offer.club} <span className="text-emerald-200">{shortSeason(offer.season)}</span>
            </h3>
            <p className="text-sm text-emerald-100/70">Best XI average {offerAvg} · pick one player</p>
          </div>
          <button
            type="button"
            disabled={rerollsLeft <= 0 || complete}
            onClick={onReroll}
            className="group shrink-0 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-left disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300 group-disabled:text-white/30">
              Reroll team
            </div>
            <div className="mt-1 flex items-center gap-2">
              <RerollPips left={rerollsLeft} />
              <span className="text-sm font-bold tabular-nums text-white group-disabled:text-white/40">
                {rerollsLeft === 0 ? "None left" : `${rerollsLeft} of ${REROLLS_PER_DRAFT} left`}
              </span>
            </div>
          </button>
        </div>
        <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
          {offer.players.map((player) => {
            const allowed = playerCanBePicked(player, formation, xi, bench);
            return (
              <PlayerCard
                key={player.id}
                player={player}
                disabled={!allowed}
                selected={selectedPlayer?.id === player.id}
                onClick={() => onSelectPlayer(selectedPlayer?.id === player.id ? null : player)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function RerollPips({ left }: { left: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {Array.from({ length: REROLLS_PER_DRAFT }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${
            i < left ? "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.85)]" : "bg-white/20"
          }`}
        />
      ))}
    </span>
  );
}
