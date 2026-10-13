import type { Formation, FormationId, PlayerSeason, SlotKind } from "./types";

export const BENCH_SIZE = 7;
export const SQUAD_SIZE = 11 + BENCH_SIZE;

export const FORMATIONS: Formation[] = [
  {
    id: "433",
    name: "4-3-3",
    slots: [
      { id: "gk", kind: "GK", label: "GK", x: 50, y: 88 },
      { id: "lb", kind: "LB", label: "LB", x: 12, y: 70 },
      { id: "cb1", kind: "CB", label: "CB", x: 34, y: 74 },
      { id: "cb2", kind: "CB", label: "CB", x: 66, y: 74 },
      { id: "rb", kind: "RB", label: "RB", x: 88, y: 70 },
      { id: "cm1", kind: "CM", label: "CM", x: 24, y: 48 },
      { id: "cm2", kind: "CM", label: "CM", x: 50, y: 52 },
      { id: "cm3", kind: "CM", label: "CM", x: 76, y: 48 },
      { id: "lw", kind: "LW", label: "LW", x: 18, y: 22 },
      { id: "st", kind: "ST", label: "ST", x: 50, y: 16 },
      { id: "rw", kind: "RW", label: "RW", x: 82, y: 22 },
    ],
  },
  {
    id: "442",
    name: "4-4-2",
    slots: [
      { id: "gk", kind: "GK", label: "GK", x: 50, y: 88 },
      { id: "lb", kind: "LB", label: "LB", x: 12, y: 70 },
      { id: "cb1", kind: "CB", label: "CB", x: 34, y: 74 },
      { id: "cb2", kind: "CB", label: "CB", x: 66, y: 74 },
      { id: "rb", kind: "RB", label: "RB", x: 88, y: 70 },
      { id: "lm", kind: "LM", label: "LM", x: 14, y: 44 },
      { id: "cm1", kind: "CM", label: "CM", x: 36, y: 48 },
      { id: "cm2", kind: "CM", label: "CM", x: 64, y: 48 },
      { id: "rm", kind: "RM", label: "RM", x: 86, y: 44 },
      { id: "st1", kind: "ST", label: "ST", x: 36, y: 18 },
      { id: "st2", kind: "ST", label: "ST", x: 64, y: 18 },
    ],
  },
  {
    id: "4231",
    name: "4-2-3-1",
    slots: [
      { id: "gk", kind: "GK", label: "GK", x: 50, y: 88 },
      { id: "lb", kind: "LB", label: "LB", x: 12, y: 70 },
      { id: "cb1", kind: "CB", label: "CB", x: 34, y: 74 },
      { id: "cb2", kind: "CB", label: "CB", x: 66, y: 74 },
      { id: "rb", kind: "RB", label: "RB", x: 88, y: 70 },
      { id: "cdm1", kind: "CDM", label: "CDM", x: 34, y: 56 },
      { id: "cdm2", kind: "CDM", label: "CDM", x: 66, y: 56 },
      { id: "lw", kind: "LW", label: "LW", x: 16, y: 32 },
      { id: "cam", kind: "CAM", label: "CAM", x: 50, y: 34 },
      { id: "rw", kind: "RW", label: "RW", x: 84, y: 32 },
      { id: "st", kind: "ST", label: "ST", x: 50, y: 14 },
    ],
  },
  {
    id: "352",
    name: "3-5-2",
    slots: [
      { id: "gk", kind: "GK", label: "GK", x: 50, y: 88 },
      { id: "cb1", kind: "CB", label: "CB", x: 22, y: 72 },
      { id: "cb2", kind: "CB", label: "CB", x: 50, y: 76 },
      { id: "cb3", kind: "CB", label: "CB", x: 78, y: 72 },
      { id: "lwb", kind: "LWB", label: "LWB", x: 10, y: 46 },
      { id: "cm1", kind: "CM", label: "CM", x: 32, y: 50 },
      { id: "cm2", kind: "CM", label: "CM", x: 50, y: 54 },
      { id: "cm3", kind: "CM", label: "CM", x: 68, y: 50 },
      { id: "rwb", kind: "RWB", label: "RWB", x: 90, y: 46 },
      { id: "st1", kind: "ST", label: "ST", x: 36, y: 18 },
      { id: "st2", kind: "ST", label: "ST", x: 64, y: 18 },
    ],
  },
  {
    id: "541",
    name: "5-4-1",
    slots: [
      { id: "gk", kind: "GK", label: "GK", x: 50, y: 88 },
      { id: "lwb", kind: "LWB", label: "LWB", x: 8, y: 62 },
      { id: "cb1", kind: "CB", label: "CB", x: 28, y: 74 },
      { id: "cb2", kind: "CB", label: "CB", x: 50, y: 76 },
      { id: "cb3", kind: "CB", label: "CB", x: 72, y: 74 },
      { id: "rwb", kind: "RWB", label: "RWB", x: 92, y: 62 },
      { id: "lm", kind: "LM", label: "LM", x: 16, y: 40 },
      { id: "cm1", kind: "CM", label: "CM", x: 38, y: 46 },
      { id: "cm2", kind: "CM", label: "CM", x: 62, y: 46 },
      { id: "rm", kind: "RM", label: "RM", x: 84, y: 40 },
      { id: "st", kind: "ST", label: "ST", x: 50, y: 16 },
    ],
  },
  {
    id: "343",
    name: "3-4-3",
    slots: [
      { id: "gk", kind: "GK", label: "GK", x: 50, y: 88 },
      { id: "cb1", kind: "CB", label: "CB", x: 22, y: 72 },
      { id: "cb2", kind: "CB", label: "CB", x: 50, y: 76 },
      { id: "cb3", kind: "CB", label: "CB", x: 78, y: 72 },
      { id: "lm", kind: "LM", label: "LM", x: 12, y: 46 },
      { id: "cm1", kind: "CM", label: "CM", x: 38, y: 50 },
      { id: "cm2", kind: "CM", label: "CM", x: 62, y: 50 },
      { id: "rm", kind: "RM", label: "RM", x: 88, y: 46 },
      { id: "lw", kind: "LW", label: "LW", x: 18, y: 20 },
      { id: "st", kind: "ST", label: "ST", x: 50, y: 14 },
      { id: "rw", kind: "RW", label: "RW", x: 82, y: 20 },
    ],
  },
];

export const FORMATION_BY_ID: Record<FormationId, Formation> = Object.fromEntries(
  FORMATIONS.map((formation) => [formation.id, formation]),
) as Record<FormationId, Formation>;

const SLOT_FITS: Record<SlotKind, SlotKind[]> = {
  GK: ["GK"],
  CB: ["CB"],
  LB: ["LB", "LWB"],
  RB: ["RB", "RWB"],
  LWB: ["LWB", "LB", "LM"],
  RWB: ["RWB", "RB", "RM"],
  CDM: ["CDM", "CM"],
  CM: ["CM", "CDM", "CAM"],
  CAM: ["CAM", "CM", "LW", "RW"],
  LM: ["LM", "LW", "LWB"],
  RM: ["RM", "RW", "RWB"],
  LW: ["LW", "LM", "ST"],
  RW: ["RW", "RM", "ST"],
  ST: ["ST", "LW", "RW", "CAM"],
};

export function playerFitsSlot(player: PlayerSeason, kind: SlotKind): boolean {
  return SLOT_FITS[kind].includes(player.slot);
}

export function compatibleSlotIds(
  player: PlayerSeason,
  formation: Formation,
  xi: Record<string, PlayerSeason | null>,
): string[] {
  return formation.slots
    .filter((slot) => xi[slot.id] === null && playerFitsSlot(player, slot.kind))
    .map((slot) => slot.id);
}

export function emptyXi(formation: Formation): Record<string, PlayerSeason | null> {
  return Object.fromEntries(formation.slots.map((slot) => [slot.id, null]));
}

export function countFilled(xi: Record<string, PlayerSeason | null>, bench: (PlayerSeason | null)[]): number {
  const xiCount = Object.values(xi).filter(Boolean).length;
  const benchCount = bench.filter(Boolean).length;
  return xiCount + benchCount;
}

export function hasBackupGk(bench: (PlayerSeason | null)[]): boolean {
  return bench.some((player) => player?.group === "GK");
}

export function isDraftComplete(
  formation: Formation,
  xi: Record<string, PlayerSeason | null>,
  bench: (PlayerSeason | null)[],
): boolean {
  const xiFull = formation.slots.every((slot) => xi[slot.id] !== null);
  const benchFull = bench.filter(Boolean).length === BENCH_SIZE;
  return xiFull && benchFull && hasBackupGk(bench);
}

export function shortSeason(season: string): string {
  const [start, end] = season.split("-");
  if (!start || !end) return season;
  return `${start.slice(2)}-${end.slice(-2)}`;
}

export function ratingColor(overall: number): string {
  if (overall >= 90) return "text-amber-300";
  if (overall >= 85) return "text-emerald-300";
  if (overall >= 80) return "text-sky-300";
  if (overall >= 75) return "text-lime-300";
  return "text-zinc-300";
}

export function ratingBadge(overall: number): string {
  if (overall >= 90) return "bg-amber-400 text-emerald-950";
  if (overall >= 85) return "bg-emerald-400 text-emerald-950";
  if (overall >= 80) return "bg-sky-400 text-slate-950";
  if (overall >= 75) return "bg-lime-400 text-lime-950";
  return "bg-zinc-400 text-zinc-950";
}
