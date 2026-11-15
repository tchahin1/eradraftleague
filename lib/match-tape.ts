import { FORMATION_BY_ID, groupFromSlot, positionPenalty } from "./formations";
import { pitchSurname } from "./photos";
import { autoSelectXi } from "./simulate";
import type { FormationId, GoalScorer, PlayerSeason, SlotKind } from "./types";

export type PitchPoint = { x: number; y: number };

export type MatchSide = {
  id: string;
  name: string;
  formationId: FormationId;
  xi: PlayerSeason[];
};

export function kitLabel(name: string): string {
  const surname = pitchSurname(name).replace(/[^A-Za-z]/g, "");
  if (surname.length <= 3) return surname.toUpperCase() || "?";
  return surname.slice(0, 3).toUpperCase();
}

export type MatchDot = {
  id: string;
  name: string;
  initials: string;
  slot: SlotKind;
  isGk: boolean;
  team: "home" | "away";
  base: PitchPoint;
};

export type MatchEventType =
  | "kickoff"
  | "play"
  | "chance"
  | "save"
  | "goal"
  | "restart"
  | "turnover"
  | "foul"
  | "freekick"
  | "corner"
  | "ht"
  | "ft";

export type MatchCard = "yellow" | "red";

export type MatchTouch = {
  name: string;
  slot?: SlotKind;
  at: PitchPoint;
  lofted?: boolean;
};

export type MatchEvent = {
  id: string;
  minute: number;
  type: MatchEventType;
  teamId: string | null;
  actorName?: string;
  actorSlot?: SlotKind;
  ball: PitchPoint[];
  touches: MatchTouch[];
  caption: string;
  durationMs: number;
  walkIn?: boolean;
  card?: MatchCard;
  cardName?: string;
};

export type Playhead = {
  phase: "hold" | "pass" | "shot" | "rest";
  localT: number;
  holderName?: string;
  holderSlot?: SlotKind;
  receiverName?: string;
  receiverSlot?: SlotKind;
  from: PitchPoint;
  to: PitchPoint;
  caption: string;
  air: number;
  loft: number;
};

export type MatchTape = {
  events: MatchEvent[];
  dots: MatchDot[];
};

const PLAY_MS = 2800;
const CHANCE_MS = 2500;
const SAVE_MS = 800;
const GOAL_MS = 1400;
const RESTART_MS = 2000;
const TURNOVER_MS = 1600;
const FOUL_MS = 1100;
const FREEKICK_MS = 2200;
const CORNER_MS = 2400;
const KICKOFF_MS = 1600;
const HT_MS = 1800;
const FT_MS = 700;
const TAPE_CAP_MS = 60_000;

const WIDE_SLOTS: SlotKind[] = ["LW", "RW", "LB", "RB", "LWB", "RWB", "LM", "RM"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function point(x: number, y: number): PitchPoint {
  return { x: clamp(x, 4, 96), y: clamp(y, 6, 94) };
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function inferFormation(players: PlayerSeason[]): FormationId {
  const def = players.filter((player) => player.group === "DEF").length;
  const mid = players.filter((player) => player.group === "MID").length;
  const fwd = players.filter((player) => player.group === "FWD").length;
  if (def >= 5) return "541";
  if (def <= 3 && mid >= 5) return "352";
  if (def <= 3 && fwd >= 3) return "343";
  if (fwd <= 1 && mid >= 5) return "4231";
  if (fwd <= 2 && mid >= 4) return "442";
  return "433";
}

export function fitXi(players: PlayerSeason[], formationId: FormationId): PlayerSeason[] {
  const formation = FORMATION_BY_ID[formationId];
  const aligned =
    players.length === formation.slots.length &&
    players.filter((player, index) => player.slot === formation.slots[index]?.kind).length >= 8;
  if (aligned) return players;
  const unused = [...players];
  const fitted: PlayerSeason[] = [];
  for (const slot of formation.slots) {
    if (unused.length === 0) break;
    let best = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    unused.forEach((player, index) => {
      if (slot.kind === "GK" && (player.slot === "GK" || player.group === "GK")) {
        best = index;
        bestScore = 100;
        return;
      }
      const penalty = positionPenalty(player.slot, slot.kind, formation);
      const groupBonus = player.group === groupFromSlot(slot.kind) ? 0.4 : 0;
      const score = penalty + groupBonus + player.overall / 1000;
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    const [picked] = unused.splice(best, 1);
    if (picked) fitted.push(picked);
  }
  return fitted;
}

export function slotToPitch(
  slot: { x: number; y: number },
  team: "home" | "away",
): PitchPoint {
  if (team === "home") return point(100 - slot.y, slot.x);
  return point(slot.y, 100 - slot.x);
}

export function attackDir(team: "home" | "away", secondHalf: boolean) {
  const homeRight = !secondHalf;
  return team === "home" ? (homeRight ? 1 : -1) : homeRight ? -1 : 1;
}

export function sideBase(dot: MatchDot, secondHalf: boolean): PitchPoint {
  if (!secondHalf) return { ...dot.base };
  return { x: 100 - dot.base.x, y: dot.base.y };
}

export function secondHalfOf(event: { minute: number; type: MatchEventType }) {
  return event.minute > 45 || event.type === "ht" || event.type === "ft";
}

export function dotsFromSide(side: MatchSide, team: "home" | "away"): MatchDot[] {
  const formation = FORMATION_BY_ID[side.formationId];
  const fitted = fitXi(side.xi, side.formationId);
  return formation.slots.map((slot, index) => {
    const player = fitted[index];
    return {
      id: player?.id ?? `${team}-${slot.id}`,
      name: player?.name ?? slot.label,
      initials: kitLabel(player?.name ?? slot.label),
      slot: slot.kind,
      isGk: slot.kind === "GK",
      team,
      base: slotToPitch(slot, team),
    };
  });
}

function rngPick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)] ?? items[0]!;
}

function uniqueMinute(rng: () => number, from: number, to: number, used: Set<number>): number {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const minute = from + Math.floor(rng() * (to - from + 1));
    if (!used.has(minute)) {
      used.add(minute);
      return minute;
    }
  }
  for (let minute = from; minute <= to; minute += 1) {
    if (!used.has(minute)) {
      used.add(minute);
      return minute;
    }
  }
  return from;
}

function attackers(dots: MatchDot[], team: "home" | "away") {
  const side = dots.filter((dot) => dot.team === team && !dot.isGk);
  const forwards = side.filter((dot) => dot.slot === "ST" || dot.slot === "LW" || dot.slot === "RW" || dot.slot === "CAM");
  return forwards.length ? forwards : side;
}

function defenders(dots: MatchDot[], team: "home" | "away") {
  const side = dots.filter((dot) => dot.team === team && !dot.isGk);
  const back = side.filter(
    (dot) =>
      dot.slot === "CB" ||
      dot.slot === "LB" ||
      dot.slot === "RB" ||
      dot.slot === "LWB" ||
      dot.slot === "RWB" ||
      dot.slot === "CDM",
  );
  return back.length ? back : side;
}

function mids(dots: MatchDot[], team: "home" | "away") {
  const side = dots.filter((dot) => dot.team === team && !dot.isGk);
  const midfield = side.filter(
    (dot) =>
      dot.slot === "CM" ||
      dot.slot === "CAM" ||
      dot.slot === "CDM" ||
      dot.slot === "LM" ||
      dot.slot === "RM",
  );
  return midfield.length ? midfield : side;
}

function findActor(dots: MatchDot[], team: "home" | "away", name?: string, slot?: SlotKind) {
  const side = dots.filter((dot) => dot.team === team);
  return (
    side.find((dot) => name && dot.name === name) ??
    side.find((dot) => slot && dot.slot === slot) ??
    attackers(dots, team)[0] ??
    side[0]
  );
}

function lastName(name: string) {
  return name.trim().split(/\s+/).slice(-1)[0] ?? name;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = next[i]!;
    next[i] = next[j]!;
    next[j] = a;
  }
  return next;
}

function uniqueDots(list: MatchDot[]): MatchDot[] {
  const seen = new Set<string>();
  return list.filter((dot) => {
    if (seen.has(dot.id)) return false;
    seen.add(dot.id);
    return true;
  });
}

function pickCast(dots: MatchDot[], team: "home" | "away", rng: () => number, count: number, finisher?: MatchDot) {
  const pool = uniqueDots([...mids(dots, team), ...attackers(dots, team)]);
  const picked: MatchDot[] = [];
  for (const player of shuffle(pool, rng)) {
    if (picked.length >= count) break;
    if (finisher && player.id === finisher.id) continue;
    picked.push(player);
  }
  if (finisher) {
    const without = picked.filter((player) => player.id !== finisher.id).slice(0, Math.max(1, count - 1));
    without.push(finisher);
    return without;
  }
  return picked.slice(0, Math.max(2, picked.length));
}

function moveSpots(
  team: "home" | "away",
  cast: MatchDot[],
  rng: () => number,
  intoBox: boolean,
  secondHalf: boolean,
  walkIn = false,
): PitchPoint[] {
  const dir = attackDir(team, secondHalf);
  const startX = 50 - dir * 16;
  const endX = 50 + dir * (intoBox ? (walkIn ? 41 : 26) : 18);
  return cast.map((player, index) => {
    const progress = cast.length === 1 ? 0.4 : index / (cast.length - 1);
    const x = mix(startX, endX, 0.12 + progress * 0.88);
    const wing = index % 2 === 0 ? 20 + rng() * 10 : 70 + rng() * 10;
    const y = mix(sideBase(player, secondHalf).y, wing, 0.4 + rng() * 0.25);
    return point(x, y);
  });
}

function shotTarget(team: "home" | "away", rng: () => number, scored: boolean, secondHalf: boolean): PitchPoint {
  const dir = attackDir(team, secondHalf);
  const goalX = dir > 0 ? 97.2 : 2.8;
  const targetY = 50 + (rng() - 0.5) * 12;
  if (scored) return point(goalX, targetY);
  if (rng() < 0.45) return point(goalX + dir * 1.4, targetY + (rng() < 0.5 ? 16 : -16));
  return point(dir > 0 ? 91 : 9, targetY);
}

function kickoffTouches(dots: MatchDot[], team: "home" | "away", secondHalf = false): MatchTouch[] {
  const kicker = mids(dots, team)[0] ?? attackers(dots, team)[0];
  const mate =
    mids(dots, team).find((dot) => dot.id !== kicker?.id) ??
    attackers(dots, team).find((dot) => dot.id !== kicker?.id) ??
    kicker;
  const dir = attackDir(team, secondHalf);
  return [
    {
      name: kicker?.name ?? "XI",
      slot: kicker?.slot,
      at: { x: 50, y: 50 },
      lofted: false,
    },
    {
      name: mate?.name ?? kicker?.name ?? "XI",
      slot: mate?.slot ?? kicker?.slot,
      at: point(50 + dir * 11, 42),
      lofted: false,
    },
  ];
}

function touchesFor(cast: MatchDot[], spots: PitchPoint[], rng: () => number): MatchTouch[] {
  return cast.map((player, index) => {
    const at = spots[index] ?? player.base;
    const next = spots[index + 1];
    const d = next ? Math.hypot(next.x - at.x, next.y - at.y) : 0;
    return {
      name: player.name,
      slot: player.slot,
      at,
      lofted: index < cast.length - 1 && d > 26 && rng() < 0.16,
    };
  });
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function catmullDeriv(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  return 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2);
}

function segmentAt(path: PitchPoint[], t: number) {
  if (path.length === 0) {
    const origin = { x: 50, y: 50 };
    return { p0: origin, p1: origin, p2: origin, p3: origin, local: 0 };
  }
  if (path.length === 1) {
    const only = path[0]!;
    return { p0: only, p1: only, p2: only, p3: only, local: 0 };
  }
  const clamped = clamp(t, 0, 1);
  const scaled = clamped * (path.length - 1);
  const index = Math.min(path.length - 2, Math.floor(scaled));
  return {
    p0: path[index - 1] ?? path[index]!,
    p1: path[index]!,
    p2: path[index + 1]!,
    p3: path[index + 2] ?? path[index + 1]!,
    local: scaled - index,
  };
}

export function alongPath(path: PitchPoint[], t: number): PitchPoint {
  const { p0, p1, p2, p3, local } = segmentAt(path, t);
  return point(catmull(p0.x, p1.x, p2.x, p3.x, local), catmull(p0.y, p1.y, p2.y, p3.y, local));
}

export function pathTangent(path: PitchPoint[], t: number): PitchPoint {
  const { p0, p1, p2, p3, local } = segmentAt(path, t);
  const tangent = {
    x: catmullDeriv(p0.x, p1.x, p2.x, p3.x, local),
    y: catmullDeriv(p0.y, p1.y, p2.y, p3.y, local),
  };
  const mag = Math.hypot(tangent.x, tangent.y);
  if (mag < 0.001) return { x: 1, y: 0 };
  return { x: tangent.x / mag, y: tangent.y / mag };
}

export function ballAtFeet(player: PitchPoint, tangent: PitchPoint): PitchPoint {
  return point(player.x + tangent.x * 1.35, player.y + tangent.y * 2.1);
}

export function moveToward(from: PitchPoint, to: PitchPoint, maxDelta: number): PitchPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxDelta || dist < 0.02) return { x: to.x, y: to.y };
  return { x: from.x + (dx / dist) * maxDelta, y: from.y + (dy / dist) * maxDelta };
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function passBall(from: PitchPoint, to: PitchPoint, t: number, loft = 0): PitchPoint {
  const u = loft > 0.4 ? t * t * (3 - 2 * t) : t;
  return {
    x: mix(from.x, to.x, u),
    y: mix(from.y, to.y, u) - Math.sin(clamp(t, 0, 1) * Math.PI) * loft,
  };
}

export function playhead(event: MatchEvent, t: number): Playhead {
  const origin = event.ball[0] ?? { x: 50, y: 50 };
  const rest: Playhead = {
    phase: "rest",
    localT: t,
    from: origin,
    to: origin,
    caption: event.caption,
    air: 0,
    loft: 0,
  };
  const touches = event.touches;
  if (!touches.length) return rest;

  type Phase = { kind: "hold" | "pass" | "shot"; from: number; to: number; weight: number };
  const phases: Phase[] = [];
  for (let i = 0; i < touches.length; i += 1) {
    const kick = event.type === "kickoff" || event.type === "restart";
    const setPiece = event.type === "freekick" || event.type === "corner";
    const steal = event.type === "turnover";
    phases.push({
      kind: "hold",
      from: i,
      to: i,
      weight: i === 0 ? (kick || setPiece ? 2.15 : steal ? 0.95 : 0.9) : 0.7,
    });
    if (i < touches.length - 1) {
      const a = touches[i]!.at;
      const b = touches[i + 1]!.at;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const lofted = Boolean(touches[i]?.lofted);
      phases.push({
        kind: "pass",
        from: i,
        to: i + 1,
        weight: clamp((lofted ? 0.042 : 0.03) * d, lofted ? 0.95 : 0.7, lofted ? 1.85 : 1.4),
      });
    }
  }
  if (event.type === "chance") {
    phases.push({ kind: "shot", from: touches.length - 1, to: touches.length - 1, weight: event.walkIn ? 0.7 : 1.7 });
  }
  if (event.type === "freekick" || event.type === "corner") {
    const finish = event.ball[event.ball.length - 1];
    const last = touches[touches.length - 1]?.at;
    if (finish && last && Math.hypot(finish.x - last.x, finish.y - last.y) > 8) {
      phases.push({ kind: "shot", from: touches.length - 1, to: touches.length - 1, weight: 1.35 });
    }
  }

  const total = phases.reduce((sum, phase) => sum + phase.weight, 0);
  let acc = 0;
  const clamped = clamp(t, 0, 0.999);
  for (const phase of phases) {
    const start = acc / total;
    acc += phase.weight;
    const end = acc / total;
    if (clamped >= end) continue;
    const local = (clamped - start) / Math.max(0.001, end - start);
    const holder = touches[phase.from]!;
    const receiver = touches[phase.to]!;
    const from = holder.at;
    const to = phase.kind === "shot" ? (event.ball[event.ball.length - 1] ?? from) : receiver.at;
    const holderShort = lastName(holder.name);
    const receiverShort = lastName(receiver.name);
    const caption =
      phase.kind === "shot"
        ? `${holderShort} shoots`
        : phase.kind === "pass"
          ? `${holderShort} finds ${receiverShort}`
            : event.type === "kickoff" || event.type === "restart"
            ? "Kick off"
            : event.type === "foul"
              ? event.caption
              : event.type === "freekick" && phase.from === 0
                ? "Free kick"
                : event.type === "corner" && phase.from === 0
                  ? "Corner"
                  : event.type === "turnover" && phase.from === 0
                    ? event.caption
                    : `${holderShort} on the ball`;
    return {
      phase: phase.kind,
      localT: local,
      holderName: holder.name,
      holderSlot: holder.slot,
      receiverName: phase.kind === "pass" ? receiver.name : undefined,
      receiverSlot: phase.kind === "pass" ? receiver.slot : undefined,
      from,
      to,
      caption,
      loft:
        phase.kind === "shot"
          ? event.walkIn
            ? 0.25
            : 1.85
          : holder.lofted
            ? 1.55
            : 0,
      air:
        phase.kind === "shot" && !event.walkIn
          ? Math.sin(local * Math.PI) * 0.55
          : phase.kind === "pass" && holder.lofted
            ? Math.sin(local * Math.PI) * 0.55
            : 0,
    };
  }
  return rest;
}

export function roleTarget(
  dot: MatchDot,
  focus: PitchPoint,
  carrier: PitchPoint,
  tangent: PitchPoint,
  possessing: boolean,
  pressing: boolean,
  supportSide: number | null,
  eventType: MatchEventType,
  secondHalf = false,
): PitchPoint {
  const base = sideBase(dot, secondHalf);
  const dir = attackDir(dot.team, secondHalf);
  const ownGoalX = dir > 0 ? 8 : 92;
  if (eventType === "ht" || eventType === "ft" || eventType === "kickoff" || eventType === "restart") {
    return { ...base };
  }
  if (eventType === "foul") {
    return point(mix(base.x, focus.x, 0.22), mix(base.y, focus.y, 0.18));
  }
  if (eventType === "freekick" || eventType === "corner") {
    if (dot.isGk) return point(mix(base.x, ownGoalX, 0.15), mix(base.y, focus.y, 0.18));
    if (!possessing) {
      const wallX = mix(focus.x, ownGoalX, 0.16);
      return point(wallX, mix(focus.y, base.y, 0.28));
    }
    const box = dir > 0 ? 78 : 22;
    return point(mix(base.x, box, 0.45), mix(base.y, focus.y, 0.22));
  }
  if (eventType === "goal") {
    const box = dir > 0 ? 78 : 22;
    return point(mix(base.x, mix(focus.x, box, 0.55), 0.34), mix(base.y, focus.y, 0.28));
  }
  if (eventType === "turnover") {
    const drop = possessing ? 0.18 : 0.08;
    if (dot.isGk) return point(mix(base.x, ownGoalX, 0.2), mix(base.y, focus.y, 0.2));
    if (pressing) return point(mix(focus.x, ownGoalX, 0.08), mix(focus.y, base.y, 0.1));
    return point(mix(base.x, focus.x, drop), mix(base.y, focus.y, 0.16));
  }

  if (dot.isGk) {
    const rush = !possessing && (eventType === "chance" || eventType === "save") ? 0.28 : 0.07;
    return point(mix(base.x, focus.x, rush), mix(base.y, focus.y, 0.32));
  }

  if (pressing) {
    return point(mix(focus.x, ownGoalX, 0.12), mix(focus.y, base.y, 0.12));
  }

  if (supportSide != null) {
    return point(
      carrier.x - tangent.x * 11 + -tangent.y * supportSide * 14,
      carrier.y - tangent.y * 11 + tangent.x * supportSide * 18,
    );
  }

  const shiftX = (focus.x - 50) * (possessing ? 0.36 : 0.22);
  const shiftY = (focus.y - 50) * (possessing ? 0.2 : 0.14);
  let x = base.x + shiftX;
  let y = base.y + shiftY;
  const wide = WIDE_SLOTS.includes(dot.slot);
  const boxLimit = dir > 0 ? 82 : 18;

  if (possessing) {
    x += dir * 7;
    if (wide) y = mix(y, base.y, 0.4);
    if (dot.slot === "ST" || dot.slot === "CAM") x = mix(x, focus.x + dir * 12, 0.45);
    if (dot.slot === "LW" || dot.slot === "RW") x = mix(x, focus.x + dir * 8, 0.3);
    x = dir > 0 ? Math.min(x, boxLimit) : Math.max(x, boxLimit);
  } else {
    x = mix(x, ownGoalX, 0.14);
    if (dot.slot === "CB" || dot.slot === "LB" || dot.slot === "RB") y = mix(y, base.y, 0.35);
  }
  return point(x, y);
}

function eventPoint(event: MatchEvent, end: boolean): PitchPoint {
  if (end) {
    return (
      event.touches[event.touches.length - 1]?.at ??
      event.ball[event.ball.length - 1] ??
      { x: 50, y: 50 }
    );
  }
  return event.touches[0]?.at ?? event.ball[0] ?? { x: 50, y: 50 };
}

function isOpenPlay(type: MatchEventType) {
  return (
    type === "play" ||
    type === "chance" ||
    type === "save" ||
    type === "kickoff" ||
    type === "restart" ||
    type === "freekick" ||
    type === "corner"
  );
}

function needsTurnover(prev: MatchEvent, next: MatchEvent) {
  if (!prev.teamId || !next.teamId || prev.teamId === next.teamId) return false;
  if (!isOpenPlay(prev.type) || !isOpenPlay(next.type)) return false;
  if (next.type === "restart" || next.type === "kickoff" || next.type === "freekick" || next.type === "corner") {
    return false;
  }
  return true;
}

function closestDot(dots: MatchDot[], at: PitchPoint, secondHalf = false): MatchDot | undefined {
  return dots.slice().sort((a, b) => {
    const aPos = sideBase(a, secondHalf);
    const bPos = sideBase(b, secondHalf);
    return Math.hypot(aPos.x - at.x, aPos.y - at.y) - Math.hypot(bPos.x - at.x, bPos.y - at.y);
  })[0];
}

function makeTurnover(
  prev: MatchEvent,
  next: MatchEvent,
  dots: MatchDot[],
  team: "home" | "away",
  rng: () => number,
): Omit<MatchEvent, "id"> {
  const from = eventPoint(prev, true);
  const secondHalf = next.minute > 45;
  const side = dots.filter((dot) => dot.team === team);
  const gk = side.find((dot) => dot.isGk);
  const outfield = side.filter((dot) => !dot.isGk);
  const inBox = from.x < 20 || from.x > 80;
  const gkPos = gk ? sideBase(gk, secondHalf) : from;
  const winner =
    (prev.type === "save" || inBox) && gk && Math.hypot(gkPos.x - from.x, gkPos.y - from.y) < 34
      ? gk
      : closestDot(outfield, from, secondHalf) ?? outfield[0] ?? side[0]!;
  const winnerPos = sideBase(winner, secondHalf);
  const outlet =
    closestDot(
      outfield.filter((dot) => dot.id !== winner.id),
      { x: mix(from.x, winnerPos.x, 0.4), y: mix(from.y, winnerPos.y, 0.4) },
      secondHalf,
    ) ?? winner;
  const meet = point(mix(from.x, winnerPos.x, 0.08), mix(from.y, winnerPos.y, 0.08));
  const retreatX = attackDir(team, secondHalf) > 0 ? 28 : 72;
  const outletAt = point(mix(meet.x, retreatX, 0.48), mix(meet.y, sideBase(outlet, secondHalf).y, 0.5));
  const verb =
    prev.type === "save"
      ? winner.isGk
        ? "claims it"
        : "clears"
      : rng() < 0.55
        ? "wins it"
        : "intercepts";
  const lofted = prev.type === "save";
  return {
    minute: next.minute,
    type: "turnover",
    teamId: next.teamId,
    actorName: winner.name,
    actorSlot: winner.slot,
    ball: [from, meet, outletAt],
    touches: [
      { name: winner.name, slot: winner.slot, at: meet, lofted },
      { name: outlet.name, slot: outlet.slot, at: outletAt, lofted: false },
    ],
    caption: `${lastName(winner.name)} ${verb}`,
    durationMs: TURNOVER_MS,
  };
}

export function buildMatchTape(home: MatchSide, away: MatchSide, scorers: GoalScorer[]): MatchTape {
  const seed = hashSeed(
    `${home.id}|${away.id}|${scorers.map((goal) => `${goal.minute}:${goal.name}:${goal.slot}`).join(",")}`,
  );
  const rng = mulberry32(seed);
  const dots = [...dotsFromSide(home, "home"), ...dotsFromSide(away, "away")];
  const used = new Set<number>([0, 1, 45, 90]);
  const events: MatchEvent[] = [];
  let serial = 0;
  const push = (event: Omit<MatchEvent, "id">) => {
    events.push({ ...event, id: `e${serial}` });
    serial += 1;
  };

  const teamOf = (teamId: string) => (teamId === home.id ? "home" : "away");
  const dismissals: { name: string; minute: number }[] = [];
  const liveDots = (minute: number) => {
    const out = new Set(dismissals.filter((item) => minute > item.minute).map((item) => item.name));
    if (!out.size) return dots;
    const next = dots.filter((dot) => !out.has(dot.name));
    return next.length >= 16 ? next : dots;
  };
  const opening = kickoffTouches(dots, "home");

  push({
    minute: 0,
    type: "kickoff",
    teamId: home.id,
    actorName: opening[0]?.name,
    actorSlot: opening[0]?.slot,
    ball: [{ x: 50, y: 50 }, opening[1]?.at ?? point(62, 42)],
    touches: opening,
    caption: "Kick off",
    durationMs: KICKOFF_MS,
  });

  const addPlay = (minute: number, teamId: string) => {
    const team = teamOf(teamId);
    const secondHalf = minute > 45;
    const cast = pickCast(liveDots(minute), team, rng, 3);
    const spots = moveSpots(team, cast, rng, false, secondHalf);
    const touches = touchesFor(cast, spots, rng);
    const lead = touches[0];
    push({
      minute,
      type: "play",
      teamId,
      actorName: lead?.name,
      actorSlot: lead?.slot,
      ball: spots,
      touches,
      caption: lead ? `${lastName(lead.name)} on the ball` : "In possession",
      durationMs: PLAY_MS,
    });
  };

  const addChance = (minute: number, teamId: string, scorer?: GoalScorer) => {
    const team = teamOf(teamId);
    const secondHalf = minute > 45;
    const onPitch = liveDots(minute);
    const actor = scorer
      ? findActor(onPitch, team, scorer.name, scorer.slot)
      : rngPick(rng, attackers(onPitch, team));
    const scored = Boolean(scorer);
    const walkIn = scored && rng() < 0.1;
    const cast = pickCast(onPitch, team, rng, 4, actor);
    const spots = moveSpots(team, cast, rng, true, secondHalf, walkIn);
    const touches = touchesFor(cast, spots, rng);
    const finish = shotTarget(team, rng, scored, secondHalf);
    addPlay(minute, teamId);
    push({
      minute,
      type: "chance",
      teamId,
      actorName: scorer?.name ?? actor?.name,
      actorSlot: scorer?.slot ?? actor?.slot,
      ball: [spots[spots.length - 1] ?? finish, finish],
      touches,
      caption: `${lastName(scorer?.name ?? actor?.name ?? "Forward")} shoots`,
      durationMs: CHANCE_MS,
      walkIn,
    });
    if (scored) {
      push({
        minute,
        type: "goal",
        teamId,
        actorName: scorer?.name,
        actorSlot: scorer?.slot,
        ball: [spots[spots.length - 1] ?? finish, finish],
        touches: [],
        caption: `GOAL ${scorer?.name ?? ""}`.trim(),
        durationMs: GOAL_MS,
        walkIn,
      });
      if (minute !== 45 && minute < 90) {
        const conceding = teamOf(teamId === home.id ? away.id : home.id);
        const restart = kickoffTouches(dots, conceding, secondHalf);
        push({
          minute,
          type: "restart",
          teamId: conceding === "home" ? home.id : away.id,
          actorName: restart[0]?.name,
          actorSlot: restart[0]?.slot,
          ball: [{ x: 50, y: 50 }, restart[1]?.at ?? { x: 50, y: 50 }],
          touches: restart,
          caption: "Kick off",
          durationMs: RESTART_MS,
        });
      }
      return;
    }
    const saved = !scored && finish.x > 8 && finish.x < 92;
    if (!saved && rng() < 0.7) {
      addCorner(minute, teamId, finish);
      return;
    }
    push({
      minute,
      type: "save",
      teamId,
      actorName: scorer?.name ?? actor?.name,
      actorSlot: scorer?.slot ?? actor?.slot,
      ball: [finish],
      touches: [],
      caption: saved ? "Saved" : "Wide of the post",
      durationMs: SAVE_MS,
    });
  };

  const addCorner = (minute: number, teamId: string, missed: PitchPoint) => {
    const team = teamOf(teamId);
    const secondHalf = minute > 45;
    const dir = attackDir(team, secondHalf);
    const flag = point(dir > 0 ? 96.2 : 3.8, missed.y < 50 ? 6.8 : 93.2);
    const onPitch = liveDots(minute);
    const taker = rngPick(rng, [...mids(onPitch, team), ...attackers(onPitch, team)]);
    const target = attackers(onPitch, team).find((dot) => dot.id !== taker.id) ?? taker;
    const box = point(50 + dir * 32, 38 + rng() * 24);
    const finish = shotTarget(team, rng, false, secondHalf);
    push({
      minute,
      type: "corner",
      teamId,
      actorName: taker.name,
      actorSlot: taker.slot,
      ball: [flag, box, finish],
      touches: [
        { name: taker.name, slot: taker.slot, at: flag, lofted: true },
        { name: target.name, slot: target.slot, at: box, lofted: false },
      ],
      caption: "Corner",
      durationMs: CORNER_MS,
    });
    push({
      minute,
      type: "save",
      teamId,
      actorName: target.name,
      actorSlot: target.slot,
      ball: [finish],
      touches: [],
      caption: finish.x > 8 && finish.x < 92 ? "Saved" : "Over the bar",
      durationMs: SAVE_MS,
    });
  };

  const addFoul = (minute: number, attackId: string) => {
    const attack = teamOf(attackId);
    const defend = attack === "home" ? "away" : "home";
    const secondHalf = minute > 45;
    const dir = attackDir(attack, secondHalf);
    const onPitch = liveDots(minute);
    const victim = rngPick(rng, [...mids(onPitch, attack), ...attackers(onPitch, attack)]);
    const fouler = rngPick(rng, defenders(onPitch, defend));
    const spot = point(50 + dir * (10 + rng() * 24), 22 + rng() * 56);
    const cardRoll = rng();
    const priorYellow = events.some((event) => event.card === "yellow" && event.cardName === fouler.name);
    const card: MatchCard | undefined = priorYellow ? "red" : cardRoll < 0.08 ? "red" : cardRoll < 0.5 ? "yellow" : undefined;
    const caption = card === "red" ? `RED ${fouler.name}` : card === "yellow" ? `Yellow, ${lastName(fouler.name)}` : `Foul, ${lastName(fouler.name)}`;
    push({
      minute,
      type: "foul",
      teamId: attackId,
      actorName: victim.name,
      actorSlot: victim.slot,
      ball: [spot],
      touches: [{ name: victim.name, slot: victim.slot, at: spot, lofted: false }],
      caption,
      durationMs: FOUL_MS,
      card,
      cardName: fouler.name,
    });
    if (card === "red") dismissals.push({ name: fouler.name, minute });
    const taker = rngPick(rng, mids(onPitch, attack).length ? mids(onPitch, attack) : attackers(onPitch, attack));
    const close = dir > 0 ? spot.x > 70 : spot.x < 30;
    const mate = attackers(onPitch, attack).find((dot) => dot.id !== taker.id) ?? taker;
    const box = point(50 + dir * 30, mix(spot.y, 50, 0.35));
    const finish = shotTarget(attack, rng, false, secondHalf);
    if (close && rng() < 0.55) {
      push({
        minute,
        type: "freekick",
        teamId: attackId,
        actorName: taker.name,
        actorSlot: taker.slot,
        ball: [spot, finish],
        touches: [{ name: taker.name, slot: taker.slot, at: spot, lofted: true }],
        caption: "Free kick",
        durationMs: FREEKICK_MS,
      });
      push({
        minute,
        type: "save",
        teamId: attackId,
        actorName: taker.name,
        actorSlot: taker.slot,
        ball: [finish],
        touches: [],
        caption: finish.x > 8 && finish.x < 92 ? "Saved" : "Over the wall",
        durationMs: SAVE_MS,
      });
      return;
    }
    push({
      minute,
      type: "freekick",
      teamId: attackId,
      actorName: taker.name,
      actorSlot: taker.slot,
      ball: [spot, box],
      touches: [
        { name: taker.name, slot: taker.slot, at: spot, lofted: true },
        { name: mate.name, slot: mate.slot, at: box, lofted: false },
      ],
      caption: "Free kick",
      durationMs: FREEKICK_MS,
    });
  };

  const goals = [...scorers].sort((a, b) => a.minute - b.minute);
  for (const goal of goals) used.add(goal.minute);

  const foulCount = rng() < 0.45 ? 2 : 1;
  for (let i = 0; i < foulCount; i += 1) {
    const firstHalf = i === 0 ? rng() < 0.55 : rng() < 0.35;
    const minute = uniqueMinute(rng, firstHalf ? 8 : 52, firstHalf ? 40 : 84, used);
    const teamId = rng() < 0.5 ? home.id : away.id;
    addFoul(minute, teamId);
  }
  if (!events.some((event) => event.card)) {
    const foul = events.find((event) => event.type === "foul");
    if (foul?.cardName) {
      foul.card = "yellow";
      foul.caption = `Yellow, ${lastName(foul.cardName)}`;
    }
  }
  for (const event of events) {
    if (event.type !== "foul" || !event.cardName || event.card === "red") continue;
    const booked = events.some(
      (item) =>
        item.type === "foul" &&
        item.cardName === event.cardName &&
        item.card === "yellow" &&
        item.minute < event.minute,
    );
    if (booked) {
      event.card = "red";
      event.caption = `RED ${event.cardName}`;
      dismissals.push({ name: event.cardName, minute: event.minute });
    }
  }

  for (const goal of goals) {
    addChance(goal.minute, goal.teamId, goal);
  }

  const missCount = 2 + (goals.length === 0 ? 1 : 0);
  for (let i = 0; i < missCount; i += 1) {
    const firstHalf = i % 2 === 0;
    const minute = uniqueMinute(rng, firstHalf ? 6 : 50, firstHalf ? 42 : 86, used);
    const homeBias = 0.54 + (goals.filter((goal) => goal.teamId === home.id).length - goals.filter((goal) => goal.teamId === away.id).length) * 0.06;
    const teamId = rng() < clamp(homeBias, 0.35, 0.7) ? home.id : away.id;
    addChance(minute, teamId);
  }
  if (!events.some((event) => event.type === "corner")) {
    const firstHalf = rng() < 0.5;
    const minute = uniqueMinute(rng, firstHalf ? 12 : 55, firstHalf ? 41 : 82, used);
    const teamId = rng() < 0.5 ? home.id : away.id;
    const dir = attackDir(teamOf(teamId), minute > 45);
    addCorner(minute, teamId, point(dir > 0 ? 97 : 3, rng() < 0.5 ? 8 : 92));
  }

  const fillers = 3 + (goals.length === 0 ? 1 : 0);
  for (let i = 0; i < fillers; i += 1) {
    const firstHalf = i < Math.ceil(fillers / 2);
    const minute = uniqueMinute(rng, firstHalf ? 4 : 48, firstHalf ? 43 : 88, used);
    const teamId = rng() < 0.55 ? home.id : away.id;
    addPlay(minute, teamId);
  }

  push({
    minute: 45,
    type: "ht",
    teamId: null,
    ball: [{ x: 50, y: 50 }],
    touches: [],
    caption: "Half time",
    durationMs: HT_MS,
  });
  const h2 = kickoffTouches(dots, "away", true);
  push({
    minute: 46,
    type: "kickoff",
    teamId: away.id,
    actorName: h2[0]?.name,
    actorSlot: h2[0]?.slot,
    ball: [{ x: 50, y: 50 }, h2[1]?.at ?? point(39, 42)],
    touches: h2,
    caption: "Kick off",
    durationMs: KICKOFF_MS,
  });
  push({
    minute: 90,
    type: "ft",
    teamId: null,
    ball: [{ x: 50, y: 50 }],
    touches: [],
    caption: "Full time",
    durationMs: FT_MS,
  });

  const rank: Record<MatchEventType, number> = {
    kickoff: 0,
    play: 1,
    foul: 2,
    freekick: 3,
    chance: 4,
    corner: 5,
    save: 6,
    goal: 7,
    restart: 8,
    turnover: 1,
    ht: 9,
    ft: 10,
  };
  events.sort((a, b) => a.minute - b.minute || rank[a.type] - rank[b.type]);
  const stitched: MatchEvent[] = [];
  for (const event of events) {
    const prev = stitched[stitched.length - 1];
    if (prev && needsTurnover(prev, event)) {
      const team = teamOf(event.teamId ?? "");
      stitched.push({ ...makeTurnover(prev, event, dots, team, rng), id: `to${serial}` });
      serial += 1;
    }
    stitched.push(event);
  }
  const total = stitched.reduce((sum, event) => sum + event.durationMs, 0);
  if (total > TAPE_CAP_MS) {
    const scale = TAPE_CAP_MS / total;
    for (const event of stitched) {
      event.durationMs = Math.max(400, Math.round(event.durationMs * scale));
    }
  }
  return { events: stitched, dots };
}

export function previewMatchFromPlayers(players: PlayerSeason[]): {
  home: MatchSide;
  away: MatchSide;
  scorers: GoalScorer[];
} {
  const byClubSeason = new Map<string, PlayerSeason[]>();
  for (const player of players) {
    const key = `${player.clubKey}::${player.season}`;
    const list = byClubSeason.get(key) ?? [];
    list.push(player);
    byClubSeason.set(key, list);
  }
  const clubs = [...byClubSeason.values()].filter((squad) => squad.length >= 14);
  const homeSquad = autoSelectXi(clubs[0] ?? players);
  const awaySquad = autoSelectXi(clubs[1] ?? players.slice(30));
  const home: MatchSide = {
    id: "home",
    name: homeSquad.xi[0]?.club ?? "Home",
    formationId: inferFormation(homeSquad.xi),
    xi: homeSquad.xi,
  };
  const away: MatchSide = {
    id: "away",
    name: awaySquad.xi[0]?.club ?? "Away",
    formationId: inferFormation(awaySquad.xi),
    xi: awaySquad.xi,
  };
  const homeForward = home.xi.find((player) => player.group === "FWD") ?? home.xi[10];
  const awayForward = away.xi.find((player) => player.group === "FWD") ?? away.xi[10];
  const homeMid = home.xi.find((player) => player.group === "MID") ?? home.xi[6];
  const scorers: GoalScorer[] = [];
  if (homeForward) scorers.push({ teamId: "home", name: homeForward.name, slot: homeForward.slot, minute: 23 });
  if (awayForward) scorers.push({ teamId: "away", name: awayForward.name, slot: awayForward.slot, minute: 58 });
  if (homeMid) scorers.push({ teamId: "home", name: homeMid.name, slot: homeMid.slot, minute: 81 });
  return { home, away, scorers };
}

