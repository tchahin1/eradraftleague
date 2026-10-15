"use client";

import { FORMATION_BY_ID, FORMATIONS } from "@/lib/formations";
import { Pitch } from "./Pitch";
import type { FormationId } from "@/lib/types";

type Props = {
  teamName: string;
  onTeamName: (value: string) => void;
  onChoose: (id: FormationId) => void;
};

export function FormationScreen({ teamName, onTeamName, onChoose }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
      <header className="space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Step 1</p>
        <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">Pick your shape</h1>
        <p className="mx-auto max-w-xl text-emerald-100/75">
          Formation locks your eleven pitch slots. Anyone can play anywhere. Similar roles (CM into CAM or CDM) are only −1, especially when this shape has no natural slot for them. A true mismatch still drops up to 10. You will still draft a seven-man bench, including a backup goalkeeper.
        </p>
        <label className="mx-auto mt-4 flex max-w-sm flex-col gap-1 text-left text-sm text-emerald-100/80">
          Club name
          <input
            value={teamName}
            onChange={(event) => onTeamName(event.target.value)}
            className="rounded-xl border border-white/15 bg-emerald-950/70 px-3 py-2 text-white outline-none ring-amber-300/40 focus:ring-2"
          />
        </label>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {FORMATIONS.map((formation) => (
          <button
            key={formation.id}
            type="button"
            onClick={() => onChoose(formation.id)}
            className="group rounded-3xl border border-white/10 bg-emerald-950/50 p-4 text-left transition hover:border-amber-300/70 hover:bg-emerald-900/40"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-2xl font-black text-white">{formation.name}</span>
              <span className="text-xs uppercase tracking-widest text-amber-300">select</span>
            </div>
            <div className="pointer-events-none max-h-72 overflow-hidden rounded-2xl">
              <Pitch
                formationId={formation.id}
                interactive={false}
                xi={Object.fromEntries(FORMATION_BY_ID[formation.id].slots.map((s) => [s.id, null]))}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
