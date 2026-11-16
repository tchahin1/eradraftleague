"use client";

import {
  KIT_COLORS,
  KIT_PATTERNS,
  kitsClash,
  type KitChoice,
  type KitColorId,
} from "@/lib/kits";
import { KitFace } from "./KitFace";

type Props = {
  kit: KitChoice;
  onChange: (patch: Partial<KitChoice>) => void;
  opponentKit?: KitChoice | null;
};

function ColorRow({
  label,
  selected,
  onPick,
}: {
  label: string;
  selected: KitColorId;
  onPick: (id: KitColorId) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100/55">{label}</p>
      <div className="flex flex-wrap gap-2">
        {KIT_COLORS.map((color) => {
          const active = selected === color.id;
          return (
            <button
              key={color.id}
              type="button"
              title={color.name}
              aria-label={`${label} ${color.name}`}
              onClick={() => onPick(color.id)}
              className={`h-8 w-8 rounded-full border shadow-sm ${
                active ? "ring-2 ring-white ring-offset-2 ring-offset-emerald-950" : ""
              } ${color.id === "white" ? "border-slate-400/80" : "border-white/20"}`}
              style={{ backgroundColor: color.hex }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function KitPicker({ kit, onChange, opponentKit }: Props) {
  const clash = Boolean(opponentKit && kitsClash(kit, opponentKit));
  const pickSecondary = (secondary: KitColorId) => {
    // Plain shirts ignore the second colour — flip to stripes so the pick is visible.
    if (kit.pattern === "solid") onChange({ secondary, pattern: "stripes" });
    else onChange({ secondary });
  };
  return (
    <div className="relative z-40 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Jersey</p>
        <KitFace kit={kit} className="h-9 w-9 text-[9px] font-black uppercase tracking-wide shadow-md">
          XI
        </KitFace>
        <p className="text-[11px] text-emerald-100/65">This is the shirt that goes on the pitch</p>
      </div>
      <ColorRow label="Main colour" selected={kit.color} onPick={(color) => onChange({ color })} />
      <ColorRow label="Pattern colour" selected={kit.secondary} onPick={pickSecondary} />
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100/55">
          Pattern · click one
        </p>
        <div className="flex flex-wrap gap-2">
          {KIT_PATTERNS.map((pattern) => {
            const choice: KitChoice = { ...kit, pattern: pattern.id };
            const selected = kit.pattern === pattern.id;
            return (
              <button
                key={pattern.id}
                type="button"
                title={pattern.name}
                aria-pressed={selected}
                onClick={() => onChange({ pattern: pattern.id })}
                className={`rounded-lg border p-0.5 transition-opacity ${
                  selected ? "border-white opacity-100 ring-2 ring-white/80" : "border-white/15 opacity-40 hover:opacity-80"
                }`}
              >
                <KitFace
                  kit={choice}
                  className="flex h-10 w-10 text-[8px] font-black uppercase tracking-wide"
                >
                  XI
                </KitFace>
              </button>
            );
          })}
        </div>
      </div>
      {clash ? (
        <p className="text-xs text-amber-200/80">
          Same kit as them — change the pattern colour or the pattern so you can tell the sides apart.
        </p>
      ) : null}
    </div>
  );
}
