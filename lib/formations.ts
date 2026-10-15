import type { Formation, FormationId, PlayerSeason, PositionGroup, SlotKind } from "./types";

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

export const MAX_POSITION_PENALTY = 10;

const SLOT_AXIS: Record<SlotKind, { line: number; side: number }> = {
  GK: { line: 0, side: 0 },
  CB: { line: 1, side: 0 },
  LB: { line: 1, side: -1 },
  RB: { line: 1, side: 1 },
  LWB: { line: 2, side: -1 },
  RWB: { line: 2, side: 1 },
  CDM: { line: 2, side: 0 },
  CM: { line: 3, side: 0 },
  LM: { line: 3, side: -1 },
  RM: { line: 3, side: 1 },
  CAM: { line: 4, side: 0 },
  LW: { line: 5, side: -1 },
  RW: { line: 5, side: 1 },
  ST: { line: 5, side: 0 },
};

/** Close cousins — always -1, not a real mismatch. */
const SIMILAR_SLOTS: Record<SlotKind, readonly SlotKind[]> = {
  GK: [],
  CB: ["CDM", "LB", "RB"],
  LB: ["LWB", "CB"],
  RB: ["RWB", "CB"],
  LWB: ["LB", "LM"],
  RWB: ["RB", "RM"],
  CDM: ["CM", "CAM", "CB"],
  CM: ["CAM", "CDM", "LM", "RM"],
  CAM: ["CM", "CDM"],
  LM: ["CM", "LW", "LWB"],
  RM: ["CM", "RW", "RWB"],
  LW: ["LM", "ST"],
  RW: ["RM", "ST"],
  ST: ["CAM", "LW", "RW"],
};

/** When the shape has no natural slot, these are the next-best homes at -1. */
const FORMATION_COVER: Record<SlotKind, readonly SlotKind[]> = {
  GK: [],
  CB: ["CDM"],
  LB: ["LWB", "CB"],
  RB: ["RWB", "CB"],
  LWB: ["LB", "LM", "LW"],
  RWB: ["RB", "RM", "RW"],
  CDM: ["CM", "CAM"],
  CM: ["CAM", "CDM", "LM", "RM"],
  CAM: ["CM", "ST"],
  LM: ["LW", "LWB", "CM"],
  RM: ["RW", "RWB", "CM"],
  LW: ["LM", "LWB", "ST"],
  RW: ["RM", "RWB", "ST"],
  ST: ["CAM", "LW", "RW"],
};

export function groupFromSlot(kind: SlotKind): PositionGroup {
  if (kind === "GK") return "GK";
  if (kind === "CB" || kind === "LB" || kind === "RB" || kind === "LWB" || kind === "RWB") return "DEF";
  if (kind === "LW" || kind === "RW" || kind === "ST") return "FWD";
  return "MID";
}

function slotsAreSimilar(a: SlotKind, b: SlotKind): boolean {
  return SIMILAR_SLOTS[a].includes(b) || SIMILAR_SLOTS[b].includes(a);
}

export function positionPenalty(
  natural: SlotKind,
  playing: SlotKind,
  formation?: Formation,
): number {
  if (natural === playing) return 0;
  if (natural === "GK" || playing === "GK") return -MAX_POSITION_PENALTY;
  if (slotsAreSimilar(natural, playing)) return -1;

  const kinds = formation ? formation.slots.map((slot) => slot.kind) : null;
  if (kinds && !kinds.includes(natural) && kinds.includes(playing) && FORMATION_COVER[natural].includes(playing)) {
    return -1;
  }

  const from = SLOT_AXIS[natural];
  const to = SLOT_AXIS[playing];
  let distance = Math.abs(from.line - to.line) * 1.7 + Math.abs(from.side - to.side) * 1.3;
  const fromGroup = groupFromSlot(natural);
  const toGroup = groupFromSlot(playing);
  if ((fromGroup === "DEF" && toGroup === "FWD") || (fromGroup === "FWD" && toGroup === "DEF")) {
    distance += 2.5;
  } else if (fromGroup !== toGroup) {
    distance += 1.2;
  }
  return -Math.min(MAX_POSITION_PENALTY, Math.max(2, Math.round(distance)));
}

export function effectiveOverall(player: PlayerSeason, playing: SlotKind, formation?: Formation): number {
  return Math.max(1, Math.min(99, player.overall + positionPenalty(player.slot, playing, formation)));
}

export function playInSlot(player: PlayerSeason, playing: SlotKind, formation?: Formation): PlayerSeason {
  return {
    ...player,
    overall: effectiveOverall(player, playing, formation),
    slot: playing,
    group: groupFromSlot(playing),
  };
}

export function playerFitsSlot(_player: PlayerSeason, _kind: SlotKind): boolean {
  return true;
}

export function compatibleSlotIds(
  player: PlayerSeason,
  formation: Formation,
  xi: Record<string, PlayerSeason | null>,
): string[] {
  const alreadyOnPitch = Object.values(xi).some((item) => item?.id === player.id);
  return formation.slots
    .filter((slot) => {
      const occupant = xi[slot.id];
      if (occupant?.id === player.id) return false;
      if (alreadyOnPitch) return true;
      return occupant === null;
    })
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
  if (overall >= 92) return "text-amber-300";
  if (overall >= 85) return "text-emerald-300";
  if (overall >= 77) return "text-sky-300";
  if (overall >= 67) return "text-yellow-300";
  return "text-orange-400";
}

export function ratingBadge(overall: number): string {
  if (overall >= 92) return "bg-amber-400 text-emerald-950";
  if (overall >= 85) return "bg-emerald-400 text-emerald-950";
  if (overall >= 77) return "bg-sky-400 text-slate-950";
  if (overall >= 67) return "bg-yellow-400 text-yellow-950";
  return "bg-orange-400 text-orange-950";
}
