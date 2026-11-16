import { FORMATION_BY_ID, groupFromSlot, positionPenalty } from "./formations";
import type { KitChoice } from "./kits";
import { pitchSurname } from "./photos";
import { autoSelectXi } from "./simulate";
import type { FormationId, GoalScorer, PlayerSeason, SlotKind } from "./types";

export type PitchPoint = { x: number; y: number };

export type MatchSide = {
  id: string;
  name: string;
  formationId: FormationId;
  xi: PlayerSeason[];
  kit?: KitChoice;
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
  contest?: MatchTouch;
};

export type Playhead = {
  phase: "hold" | "pass" | "shot" | "rest";
  index: number;
  touchIndex: number;
  receiverIndex: number;
  span: number;
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
const FOUL_MS = 1400;
const FREEKICK_MS = 2200;
const CORNER_MS = 2400;
const KICKOFF_MS = 1600;
const BUILD_MS = 3000;
const HT_MS = 1800;
const FT_MS = 700;
const TAPE_CAP_MS = 60_000;

const STAY_BACK: SlotKind[] = ["CB", "LB", "RB"];

export function isStayBack(slot: SlotKind) {
  return STAY_BACK.includes(slot);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function point(x: number, y: number): PitchPoint {
  return { x: clamp(x, 4, 96), y: clamp(y, 6, 94) };
}

function ballPoint(x: number, y: number): PitchPoint {
  return { x: clamp(x, 0.6, 99.4), y: clamp(y, 0.6, 99.4) };
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

type ShotMiss = "save" | "wide" | "corner";

function shotTarget(
  team: "home" | "away",
  rng: () => number,
  scored: boolean,
  secondHalf: boolean,
  miss: ShotMiss = "save",
): PitchPoint {
  const dir = attackDir(team, secondHalf);
  const goalX = dir > 0 ? 97.4 : 2.6;
  const targetY = 50 + (rng() - 0.5) * 10;
  if (scored) return ballPoint(goalX, targetY < 50 ? 46.2 - (targetY - 45) * 0.66 : 53.8 + (targetY - 50) * 0.66);
  if (miss === "corner") {
    return ballPoint(dir > 0 ? 99 : 1, rng() < 0.5 ? 1.4 : 98.6);
  }
  if (miss === "wide") {
    return ballPoint(dir > 0 ? 99 : 1, targetY + (rng() < 0.5 ? 18 : -18));
  }
  return point(dir > 0 ? 91 : 9, targetY);
}

/** Better keepers turn more of the chances that are not goals into saves. */
function pickMiss(rng: () => number, keeperOverall: number): ShotMiss {
  const saveShare = clamp(0.44 + (keeperOverall - 75) * 0.016, 0.3, 0.72);
  const roll = rng();
  if (roll < saveShare) return "save";
  if (roll < saveShare + (1 - saveShare) * 0.55) return "wide";
  return "corner";
}

function kickoffTouches(dots: MatchDot[], team: "home" | "away", secondHalf = false): MatchTouch[] {
  const side = dots.filter((dot) => dot.team === team && !dot.isGk);
  const kicker =
    side.find((dot) => dot.slot === "ST") ??
    side.find((dot) => dot.slot === "CAM") ??
    attackers(dots, team)[0] ??
    side[0];
  const mate =
    mids(dots, team)
      .filter((dot) => dot.id !== kicker?.id)
      .sort((a, b) => Math.abs(a.base.y - 50) - Math.abs(b.base.y - 50))[0] ??
    side.find((dot) => dot.id !== kicker?.id) ??
    kicker;
  const dir = attackDir(team, secondHalf);
  const mateY = mate && mate.base.y < 50 ? 42 : 58;
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
      at: point(50 - dir * 12, mateY),
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

/** Most shots are driven low; direct free kicks clear the wall and the odd effort is chipped. */
function shotLoft(event: MatchEvent) {
  if (event.walkIn || event.type === "corner") return 0;
  if (event.type === "freekick") return 1.1;
  return hashSeed(event.id) % 100 < 14 ? 0.9 : 0;
}

export function playhead(event: MatchEvent, t: number): Playhead {
  const origin = event.ball[0] ?? { x: 50, y: 50 };
  const shotArc = shotLoft(event);
  const rest: Playhead = {
    phase: "rest",
    index: -1,
    touchIndex: -1,
    receiverIndex: -1,
    span: 1,
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
    const weight = event.walkIn ? 0.7 : shotArc > 0 ? 1.5 : 1.05;
    phases.push({ kind: "shot", from: touches.length - 1, to: touches.length - 1, weight });
  }
  if (event.type === "freekick" || event.type === "corner") {
    const finish = event.ball[event.ball.length - 1];
    const last = touches[touches.length - 1]?.at;
    if (finish && last && Math.hypot(finish.x - last.x, finish.y - last.y) > 8) {
      phases.push({ kind: "shot", from: touches.length - 1, to: touches.length - 1, weight: shotArc > 0 ? 1.35 : 1 });
    }
  }

  const total = phases.reduce((sum, phase) => sum + phase.weight, 0);
  let acc = 0;
  const clamped = clamp(t, 0, 0.999);
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index]!;
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
      index,
      touchIndex: phase.from,
      receiverIndex: phase.kind === "pass" ? phase.to : -1,
      span: end - start,
      localT: local,
      holderName: holder.name,
      holderSlot: holder.slot,
      receiverName: phase.kind === "pass" ? receiver.name : undefined,
      receiverSlot: phase.kind === "pass" ? receiver.slot : undefined,
      from,
      to,
      caption,
      loft: phase.kind === "shot" ? shotArc : holder.lofted ? 1.55 : 0,
      air:
        phase.kind === "shot"
          ? shotArc > 0
            ? Math.sin(local * Math.PI) * 0.5
            : 0
          : phase.kind === "pass" && holder.lofted
            ? Math.sin(local * Math.PI) * 0.55
            : 0,
    };
  }
  return rest;
}

/** Where a player wants to be in open play: the whole team slides with the ball as one block. */
export function teamShape(
  dot: MatchDot,
  ball: PitchPoint,
  possessing: boolean,
  secondHalf: boolean,
): PitchPoint {
  const base = sideBase(dot, secondHalf);
  const dir = attackDir(dot.team, secondHalf);
  const own = dir > 0 ? 0 : 100;
  const ballDepth = (ball.x - own) * dir;
  if (dot.isGk) {
    // Stand off the line on the ball-to-goal-centre line, staying within the middle of the goal.
    const line = own + dir * 4;
    const dx = ball.x - line;
    const dy = (ball.y - 50) * 0.5;
    const d = Math.hypot(dx, dy) || 1;
    const reach = clamp(4.5 + (d - 15) * 0.07, 4.5, 10);
    return {
      x: line + dir * Math.max(3.5, Math.abs(dx / d) * reach),
      y: clamp(50 + ((dy / d) * reach) / 0.5, 45.5, 54.5),
    };
  }
  const rank = ((base.x - own) * dir - 26) / 60;
  const line = possessing ? clamp(ballDepth - 30, 20, 48) : clamp(ballDepth - 22, 12, 40);
  const length = possessing ? 50 : 36;
  const width = possessing ? 1.06 : 0.84;
  const pull = possessing ? 0.12 : 0.3;
  const depth = Math.min(line + rank * length, possessing ? 88 : 72);
  return {
    x: clamp(own + dir * depth, 4, 96),
    y: clamp(50 + (base.y - 50) * width + (ball.y - 50) * pull, 6, 94),
  };
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
    type === "turnover" ||
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

function inField(at: PitchPoint) {
  return at.x > 4 && at.x < 96 && at.y > 4 && at.y < 96;
}

function endsWithHolder(event: MatchEvent) {
  if (!event.teamId || !event.touches.length) return false;
  if (event.type === "freekick") return event.touches.length > 1;
  return (
    event.type === "play" ||
    event.type === "turnover" ||
    event.type === "kickoff" ||
    event.type === "restart"
  );
}

function canCarryInto(prev: MatchEvent, next: MatchEvent) {
  return next.type === "play" && prev.teamId === next.teamId && endsWithHolder(prev) && next.touches.length > 0;
}

function prependHolder(prev: MatchEvent, next: MatchEvent) {
  const last = prev.touches[prev.touches.length - 1];
  if (!last) return;
  next.touches = [{ name: last.name, slot: last.slot, at: { ...last.at }, lofted: false }, ...next.touches.slice(-2)];
  if (next.ball.length > 1) next.ball[0] = { ...last.at };
}

function dedupeTouches(event: MatchEvent) {
  const merged: MatchTouch[] = [];
  for (const touch of event.touches) {
    if (merged[merged.length - 1]?.name === touch.name) {
      merged[merged.length - 1] = { ...touch };
      continue;
    }
    merged.push(touch);
  }
  event.touches = merged;
}

function carryPossession(prev: MatchEvent, next: MatchEvent, team: "home" | "away") {
  const last = prev.touches[prev.touches.length - 1];
  if (!last) return;
  const secondHalf = next.minute > 45;
  const dir = attackDir(team, secondHalf);
  const carried: MatchTouch = { name: last.name, slot: last.slot, at: { ...last.at }, lofted: false };
  const seen = new Set([last.name]);
  const touches: MatchTouch[] = [carried];
  for (const touch of next.touches) {
    if (seen.has(touch.name)) continue;
    seen.add(touch.name);
    touches.push(touch);
  }
  if (touches.length < 2 && next.touches[0]) touches.push(next.touches[0]);
  for (let i = 1; i < touches.length; i += 1) {
    const item = touches[i]!;
    const t = i / Math.max(1, touches.length - 1);
    const x = last.at.x + dir * (10 + t * 16);
    const y = mix(last.at.y, item.at.y, 0.5);
    const nextAt = point(x, y);
    item.at = nextAt;
    item.lofted = Math.hypot(nextAt.x - last.at.x, nextAt.y - last.at.y) > 30 ? item.lofted : false;
  }
  next.touches = touches;
  if (next.ball.length) next.ball[0] = { ...last.at };
}

function rankByShape(dots: MatchDot[], at: PitchPoint, secondHalf: boolean, possessing: boolean): MatchDot[] {
  const dist = (dot: MatchDot) => {
    const spot = teamShape(dot, at, possessing, secondHalf);
    return Math.hypot(spot.x - at.x, (spot.y - at.y) * 0.5);
  };
  return dots
    .map((dot) => ({ dot, d: dist(dot) }))
    .sort((a, b) => a.d - b.d)
    .map((entry) => entry.dot);
}

function closestByShape(
  dots: MatchDot[],
  at: PitchPoint,
  secondHalf: boolean,
  possessing: boolean,
): MatchDot | undefined {
  return rankByShape(dots, at, secondHalf, possessing)[0];
}

function makeTurnover(
  prev: MatchEvent,
  next: Pick<MatchEvent, "minute" | "teamId">,
  dots: MatchDot[],
  team: "home" | "away",
  rng: () => number,
): Omit<MatchEvent, "id"> {
  const from = eventPoint(prev, true);
  const secondHalf = next.minute > 45;
  const side = dots.filter((dot) => dot.team === team);
  const gk = side.find((dot) => dot.isGk);
  const outfield = side.filter((dot) => !dot.isGk);
  const dir = attackDir(team, secondHalf);
  const ownGoalX = dir > 0 ? 4 : 96;
  const nearGoal = Math.abs(from.x - ownGoalX) < 18 && Math.abs(from.y - 50) < 30;
  const winner =
    gk && (prev.type === "save" || nearGoal)
      ? gk
      : closestByShape(outfield, from, secondHalf, false) ?? outfield[0] ?? side[0]!;
  const winnerPos = teamShape(winner, from, false, secondHalf);
  const meet = winner.isGk
    ? inField(from)
      ? point(from.x, from.y)
      : point(ownGoalX + dir * 6, from.y < 50 ? 42 : 58)
    : point(mix(from.x, winnerPos.x, 0.15), mix(from.y, winnerPos.y, 0.15));
  const options = outfield.filter((dot) => dot.id !== winner.id);
  const outletGuess = { x: mix(meet.x, dir > 0 ? 34 : 66, winner.isGk ? 0.7 : 0.5), y: mix(meet.y, 50, 0.3) };
  const outlet =
    closestByShape(
      winner.isGk ? options.filter((dot) => dot.slot !== "CB") : options,
      outletGuess,
      secondHalf,
      true,
    ) ??
    closestByShape(options, outletGuess, secondHalf, true) ??
    winner;
  const outletShape = teamShape(outlet, outletGuess, true, secondHalf);
  const outletAt = point(mix(outletGuess.x, outletShape.x, 0.5), mix(outletGuess.y, outletShape.y, 0.6));
  const verb =
    prev.type === "save"
      ? winner.isGk
        ? "claims it"
        : "clears"
      : rng() < 0.55
        ? "wins it"
        : "intercepts";
  const lofted = winner.isGk;
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
  const keeperAgainst = (attack: "home" | "away") => {
    const xi = attack === "home" ? away.xi : home.xi;
    return (xi.find((player) => player.slot === "GK") ?? xi.find((player) => player.group === "GK"))?.overall ?? 75;
  };
  const sentOff = new Set<string>();
  const liveDots = () => {
    if (!sentOff.size) return dots;
    const next = dots.filter((dot) => !sentOff.has(dot.name));
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
    const cast = pickCast(liveDots(), team, rng, 3);
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

  const chanceTouches = (
    onPitch: MatchDot[],
    team: "home" | "away",
    actor: MatchDot | undefined,
    scored: boolean,
    walkIn: boolean,
    secondHalf: boolean,
  ): MatchTouch[] => {
    const dir = attackDir(team, secondHalf);
    const finisher = actor ?? rngPick(rng, attackers(onPitch, team));
    if (!finisher) return [];
    const finishY = mix(sideBase(finisher, secondHalf).y, 50, 0.4 + rng() * 0.2);
    if (walkIn) {
      return [
        {
          name: finisher.name,
          slot: finisher.slot,
          at: point(50 + dir * 36, finishY),
          lofted: false,
        },
      ];
    }
    const supportPool = uniqueDots([...mids(onPitch, team), ...attackers(onPitch, team)]).filter(
      (dot) => dot.id !== finisher.id,
    );
    const supplier = supportPool.length ? rngPick(rng, supportPool) : finisher;
    const supplyX = 50 + dir * (scored ? 24 : 20);
    const shotX = 50 + dir * (scored ? 34 : 28);
    const supplyY = mix(sideBase(supplier, secondHalf).y, finishY, 0.35);
    if (scored || rng() < 0.7) {
      return [
        { name: supplier.name, slot: supplier.slot, at: point(supplyX, supplyY), lofted: false },
        { name: finisher.name, slot: finisher.slot, at: point(shotX, finishY), lofted: false },
      ];
    }
    const extra = pickCast(onPitch, team, rng, 2, finisher)[0] ?? supplier;
    return [
      {
        name: extra.name,
        slot: extra.slot,
        at: point(50 + dir * 12, mix(sideBase(extra, secondHalf).y, 50, 0.3)),
        lofted: false,
      },
      { name: supplier.name, slot: supplier.slot, at: point(supplyX, supplyY), lofted: false },
      { name: finisher.name, slot: finisher.slot, at: point(shotX, finishY), lofted: false },
    ];
  };

  const addChance = (minute: number, teamId: string, scorer?: GoalScorer) => {
    const team = teamOf(teamId);
    const secondHalf = minute > 45;
    const onPitch = liveDots();
    const actor = scorer
      ? findActor(onPitch, team, scorer.name, scorer.slot)
      : rngPick(rng, attackers(onPitch, team));
    const scored = Boolean(scorer);
    const walkIn = scored && rng() < 0.1;
    const touches = chanceTouches(onPitch, team, actor, scored, walkIn, secondHalf);
    const lastAt = touches[touches.length - 1]?.at ?? point(50, 50);
    const miss = scored ? "save" : pickMiss(rng, keeperAgainst(team));
    const finish = shotTarget(team, rng, scored, secondHalf, miss);
    push({
      minute,
      type: "chance",
      teamId,
      actorName: scorer?.name ?? actor?.name,
      actorSlot: scorer?.slot ?? actor?.slot,
      ball: [lastAt, finish],
      touches,
      caption: `${lastName(scorer?.name ?? actor?.name ?? "Forward")} shoots`,
      durationMs: scored ? 2100 : CHANCE_MS,
      walkIn,
    });
    if (scored) {
      push({
        minute,
        type: "goal",
        teamId,
        actorName: scorer?.name,
        actorSlot: scorer?.slot,
        ball: [lastAt, finish],
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
    if (miss === "corner") {
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
      caption: miss === "save" ? "Saved" : "Wide of the post",
      durationMs: SAVE_MS,
    });
  };

  const addCorner = (minute: number, teamId: string, missed: PitchPoint) => {
    const team = teamOf(teamId);
    const secondHalf = minute > 45;
    const dir = attackDir(team, secondHalf);
    const flag = ballPoint(dir > 0 ? 95.6 : 4.4, missed.y < 50 ? 4.6 : 95.4);
    const onPitch = liveDots();
    const wide = [...mids(onPitch, team), ...attackers(onPitch, team).filter((dot) => dot.slot !== "ST")];
    const nearFlag = rankByShape(wide, flag, secondHalf, true).slice(0, 2);
    const taker = nearFlag.length
      ? rngPick(rng, nearFlag)
      : rngPick(rng, [...mids(onPitch, team), ...attackers(onPitch, team)]);
    const target = attackers(onPitch, team).find((dot) => dot.id !== taker.id) ?? taker;
    const box = point(50 + dir * 32, 38 + rng() * 24);
    const headerMiss = pickMiss(rng, keeperAgainst(team)) === "save" ? "save" : "wide";
    const finish = shotTarget(team, rng, false, secondHalf, headerMiss);
    push({
      minute,
      type: "corner",
      teamId,
      actorName: taker.name,
      actorSlot: taker.slot,
      ball: [flag, box, finish],
      touches: [
        { name: taker.name, slot: taker.slot, at: { x: flag.x - dir * 1.2, y: flag.y < 50 ? 6 : 94 }, lofted: true },
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
      caption: headerMiss === "save" ? "Saved" : "Over the bar",
      durationMs: SAVE_MS,
    });
  };

  // Fouls are only scheduled here. Who fouls whom is decided while stitching,
  // so the victim is always whoever has the ball at that moment.
  type FoulPlan = { card?: MatchCard; directRoll: number; takerRoll: number };
  const foulPlans = new Map<string, FoulPlan>();
  const addFoul = (minute: number) => {
    const cardRoll = rng();
    const card: MatchCard | undefined = cardRoll < 0.06 ? "red" : cardRoll < 0.5 ? "yellow" : undefined;
    push({ minute, type: "foul", teamId: null, ball: [], touches: [], caption: "Foul", durationMs: FOUL_MS, card });
    foulPlans.set(`e${serial - 1}`, { card, directRoll: rng(), takerRoll: rng() });
  };

  const goals = [...scorers].sort((a, b) => a.minute - b.minute);
  for (const goal of goals) used.add(goal.minute);

  const foulCount = rng() < 0.45 ? 2 : 1;
  for (let i = 0; i < foulCount; i += 1) {
    const firstHalf = i === 0 ? rng() < 0.55 : rng() < 0.35;
    addFoul(uniqueMinute(rng, firstHalf ? 8 : 52, firstHalf ? 40 : 84, used));
  }
  const plans = [...foulPlans.values()];
  if (plans[0] && !plans.some((plan) => plan.card)) plans[0].card = "yellow";

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

  const otherTeamId = (teamId: string) => (teamId === home.id ? away.id : home.id);
  const booked = new Set<string>();
  const stitched: MatchEvent[] = [];
  const stamp = (event: Omit<MatchEvent, "id">): MatchEvent => {
    const made = { ...event, id: `s${serial}` };
    serial += 1;
    return made;
  };

  const append = (event: MatchEvent) => {
    const prev = stitched[stitched.length - 1];
    if (prev && needsTurnover(prev, event)) {
      stitched.push(stamp(makeTurnover(prev, event, liveDots(), teamOf(event.teamId ?? ""), rng)));
    }
    const last = stitched[stitched.length - 1];
    if (last && canCarryInto(last, event)) {
      carryPossession(last, event, teamOf(event.teamId ?? ""));
    } else if (last && event.type === "chance" && last.teamId === event.teamId && endsWithHolder(last)) {
      prependHolder(last, event);
    }
    stitched.push(event);
  };

  // After a save or a shot off target the ball belongs to the defending side.
  const keeperBall = (save: MatchEvent, minute: number) => {
    if (!save.teamId) return;
    const defendId = otherTeamId(save.teamId);
    stitched.push(stamp(makeTurnover(save, { minute, teamId: defendId }, liveDots(), teamOf(defendId), rng)));
  };

  // The side that kicks off keeps the ball for a short spell of passing.
  const buildUp = (kick: MatchEvent, minute: number) => {
    const mate = kick.touches[kick.touches.length - 1];
    if (!kick.teamId || !mate) return;
    const team = teamOf(kick.teamId);
    const dir = attackDir(team, kick.minute > 45);
    const own = dir > 0 ? 0 : 100;
    const side = liveDots().filter((dot) => dot.team === team && !dot.isGk && dot.name !== mate.name);
    const nearY = (y: number) => (a: MatchDot, b: MatchDot) => Math.abs(a.base.y - y) - Math.abs(b.base.y - y);
    const back = side
      .filter((dot) => isStayBack(dot.slot) || dot.slot === "LWB" || dot.slot === "RWB")
      .sort(nearY(mate.at.y))[0];
    const mid = mids(side, team)
      .filter((dot) => dot.id !== back?.id)
      .sort(nearY(100 - mate.at.y))[0];
    const runner = attackers(side, team)
      .filter((dot) => dot.id !== mid?.id && dot.id !== back?.id)
      .sort(nearY(mid?.base.y ?? 50))[0];
    const depths = [24, 44, 60];
    const cast = [back, mid, runner].filter((dot): dot is MatchDot => Boolean(dot));
    const touches: MatchTouch[] = [
      { name: mate.name, slot: mate.slot, at: { ...mate.at }, lofted: false },
      ...cast.map((dot, i) => ({
        name: dot.name,
        slot: dot.slot,
        at: point(own + dir * (depths[i] ?? 50), mix(dot.base.y, 50, 0.15)),
        lofted: false,
      })),
    ];
    stitched.push(
      stamp({
        minute,
        type: "play",
        teamId: kick.teamId,
        actorName: mate.name,
        actorSlot: mate.slot,
        ball: touches.map((touch) => touch.at),
        touches,
        caption: "Build-up",
        durationMs: BUILD_MS,
      }),
    );
  };

  const namesAfter = (index: number) => {
    const names = new Set<string>();
    for (const event of events.slice(index + 1)) {
      if (event.actorName) names.add(event.actorName);
      for (const touch of event.touches) names.add(touch.name);
    }
    return names;
  };

  type PendingFoul = { plan: FoulPlan; minute: number; index: number };
  let pending: PendingFoul | null = null;

  const foulSequence = (foul: PendingFoul, prev: MatchEvent): MatchEvent[] | null => {
    const holder = prev.touches[prev.touches.length - 1];
    if (!holder || !prev.teamId) return null;
    const attackId = prev.teamId;
    const attack = teamOf(attackId);
    const defend = attack === "home" ? "away" : "home";
    const minute = Math.max(foul.minute, prev.minute);
    const secondHalf = minute > 45;
    const dir = attackDir(attack, secondHalf);
    const own = dir > 0 ? 0 : 100;
    const spot = point(holder.at.x, holder.at.y);
    const depth = (spot.x - own) * dir;
    // Inside the box this would be a penalty, which the tape does not stage.
    if (depth > 79 && Math.abs(spot.y - 50) < 29) return null;
    const onPitch = liveDots();
    const ranked = onPitch
      .filter((dot) => dot.team === defend && !dot.isGk && dot.slot !== "ST" && dot.slot !== "LW" && dot.slot !== "RW")
      .map((dot) => {
        const at = teamShape(dot, spot, false, secondHalf);
        return { dot, d: Math.hypot(at.x - spot.x, (at.y - spot.y) * 0.5) };
      })
      .sort((a, b) => a.d - b.d)
      .map((item) => item.dot);
    if (!ranked.length) return null;
    const later = namesAfter(foul.index);
    const sendsOff = (dot: MatchDot) =>
      foul.plan.card === "red" || (foul.plan.card === "yellow" && booked.has(dot.name));
    let card = foul.plan.card;
    let fouler = ranked.slice(0, 2).find((dot) => !sendsOff(dot) || !later.has(dot.name));
    if (!fouler) {
      fouler = ranked[0]!;
      card = booked.has(fouler.name) ? undefined : "yellow";
    }
    if (card === "yellow" && booked.has(fouler.name)) card = "red";
    if (card === "red") sentOff.add(fouler.name);
    if (card === "yellow") booked.add(fouler.name);
    const foulerAt = teamShape(fouler, spot, false, secondHalf);
    const challenge = point(spot.x - dir * 2.4, spot.y + (foulerAt.y >= spot.y ? 2 : -2));
    const caption =
      card === "red"
        ? `RED ${fouler.name}`
        : card === "yellow"
          ? `Yellow, ${lastName(fouler.name)}`
          : `Foul, ${lastName(fouler.name)}`;
    const out: MatchEvent[] = [
      stamp({
        minute,
        type: "foul",
        teamId: attackId,
        actorName: holder.name,
        actorSlot: holder.slot,
        ball: [spot],
        touches: [{ name: holder.name, slot: holder.slot, at: spot, lofted: false }],
        contest: { name: fouler.name, slot: fouler.slot, at: challenge, lofted: false },
        caption,
        durationMs: FOUL_MS,
        card,
        cardName: fouler.name,
      }),
    ];
    const side = liveDots().filter((dot) => dot.team === attack && !dot.isGk);
    const takers = rankByShape(
      mids(side, attack).filter((dot) => dot.name !== holder.name),
      spot,
      secondHalf,
      true,
    ).slice(0, 2);
    const taker = takers[Math.floor(foul.plan.takerRoll * takers.length)] ?? side[0]!;
    const close = depth > 64 && Math.abs(spot.y - 50) < 34;
    if (close && foul.plan.directRoll < 0.55) {
      const finish = shotTarget(attack, rng, false, secondHalf, "save");
      out.push(
        stamp({
          minute,
          type: "freekick",
          teamId: attackId,
          actorName: taker.name,
          actorSlot: taker.slot,
          ball: [spot, finish],
          touches: [{ name: taker.name, slot: taker.slot, at: spot, lofted: true }],
          caption: "Free kick",
          durationMs: FREEKICK_MS,
        }),
        stamp({
          minute,
          type: "save",
          teamId: attackId,
          actorName: taker.name,
          actorSlot: taker.slot,
          ball: [finish],
          touches: [],
          caption: "Saved",
          durationMs: SAVE_MS,
        }),
      );
      return out;
    }
    const mate = attackers(side, attack).find((dot) => dot.id !== taker.id) ?? taker;
    const box = point(own + dir * clamp(depth + 22, 58, 84), mix(spot.y, 50, 0.4));
    out.push(
      stamp({
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
      }),
    );
    return out;
  };

  const tryFoul = () => {
    if (!pending) return;
    let prev = stitched[stitched.length - 1];
    if (!prev) return;
    if (prev.type === "save") {
      keeperBall(prev, pending.minute);
      prev = stitched[stitched.length - 1]!;
    }
    if (prev.type === "kickoff" || prev.type === "restart") {
      buildUp(prev, pending.minute);
      prev = stitched[stitched.length - 1]!;
    }
    if (!endsWithHolder(prev)) return;
    const sequence = foulSequence(pending, prev);
    if (!sequence) return;
    pending = null;
    stitched.push(...sequence);
  };

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.type === "foul") {
      const plan = foulPlans.get(event.id);
      if (plan) pending = { plan, minute: event.minute, index };
      tryFoul();
      continue;
    }
    if (event.type === "ht" || event.type === "ft") pending = null;
    const prev = stitched[stitched.length - 1];
    if (prev?.type === "save" && prev.teamId === event.teamId && (event.type === "play" || event.type === "chance")) {
      keeperBall(prev, event.minute);
    }
    const last = stitched[stitched.length - 1];
    if (
      last &&
      (last.type === "kickoff" || last.type === "restart") &&
      !(event.type === "play" && event.teamId === last.teamId)
    ) {
      buildUp(last, event.minute);
    }
    append(event);
    tryFoul();
  }
  for (const event of stitched) dedupeTouches(event);
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

