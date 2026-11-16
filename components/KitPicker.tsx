"use client";

import {
  KIT_COLORS,
  KIT_PATTERNS,
  kitPatternClass,
  kitsClash,
  kitVars,
  type KitChoice,
  type KitColorId,
} from "@/lib/kits";

type Props = {
  kit: KitChoice;
  onChange: (kit: KitChoice) => void;
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
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Jersey</p>
      <ColorRow label="Main colour" selected={kit.color} onPick={(color) => onChange({ ...kit, color })} />
      <ColorRow
        label="Pattern colour"
        selected={kit.secondary}
        onPick={(secondary) => onChange({ ...kit, secondary })}
      />
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100/55">Pattern</p>
        <div className="flex flex-wrap gap-2">
          {KIT_PATTERNS.map((pattern) => {
            const choice: KitChoice = { ...kit, pattern: pattern.id };
            const selected = kit.pattern === pattern.id;
            return (
              <button
                key={pattern.id}
                type="button"
                title={pattern.name}
                onClick={() => onChange(choice)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border text-[8px] font-black uppercase tracking-wide ${
                  selected ? "border-white ring-2 ring-white/80" : "border-white/15"
                } ${kitPatternClass(choice)}`}
                style={kitVars(choice)}
              >
                XI
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
