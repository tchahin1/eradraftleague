import {
  attackDir,
  isStayBack,
  kitLabel,
  passBall,
  playhead,
  secondHalfOf,
  sideBase,
  teamShape,
  type MatchDot,
  type MatchEvent,
  type MatchTape,
  type MatchTouch,
  type PitchPoint,
  type Playhead,
} from "./match-tape";

type Team = "home" | "away";
type Role = "back" | "mid" | "front" | "any";

type Body = { x: number; y: number; vx: number; vy: number; fx: number; fy: number };
type Goal = { at: PitchPoint; speed: number; accel: number; pinned: boolean };
type Flight = {
  from: PitchPoint;
  to: PitchPoint;
  loft: number;
  receiverId: string | null;
  shot: boolean;
  saving: boolean;
  ms: number;
  elapsed: number;
};

export type EngineFrame = {
  eventIndex: number;
  event: MatchEvent;
  t: number;
  head: Playhead;
  ball: PitchPoint;
  ballAir: number;
  ballOpacity: number;
  ownerId: string | null;
  receiverId: string | null;
  inFlight: boolean;
  card: { at: PitchPoint; red: boolean } | null;
  booked: ReadonlySet<string>;
  sentOff: ReadonlySet<string>;
  /** Players sent off who have reached the touchline and are no longer drawn. */
  gone: ReadonlySet<string>;
  secondHalf: boolean;
  done: boolean;
};

export type MatchEngine = {
  step: (dtMs: number) => EngineFrame;
  position: (id: string) => PitchPoint | undefined;
};

// The pitch is drawn 2:1, so one y-unit is half as long on screen as one x-unit.
// Movement and spacing are computed in screen units so players move evenly in every direction.
const SY = 0.5;
const CONTROL = 2.6;
const GAP = 4.8;
const AVOID = 4.6;
// Screen distance between a beaten keeper and the ball's line: his radius plus the ball's, with a margin.
const KEEPER_CLEAR = 3.3;
const ARRIVE = 3.2;
const WAIT_CAP_MS = 2600;
const RUN_REACH = 26;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function sd(a: PitchPoint, b: PitchPoint) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * SY);
}

function unit(from: PitchPoint, to: PitchPoint) {
  const x = to.x - from.x;
  const y = (to.y - from.y) * SY;
  const d = Math.hypot(x, y);
  return d < 0.001 ? { x: 1, y: 0 } : { x: x / d, y: y / d };
}

function offset(p: PitchPoint, u: { x: number; y: number }, len: number): PitchPoint {
  return { x: p.x + u.x * len, y: p.y + (u.y * len) / SY };
}

function toward(from: PitchPoint, to: PitchPoint, step: number): PitchPoint {
  const d = sd(from, to);
  if (d <= step) return { ...to };
  return offset(from, unit(from, to), step);
}

/** Closest point of the segment from→to to p, measured on screen; s is how far along the segment it lies. */
function closestOnLine(from: PitchPoint, to: PitchPoint, p: PitchPoint, minS = 0) {
  const ax = to.x - from.x;
  const ay = (to.y - from.y) * SY;
  const len2 = ax * ax + ay * ay;
  const s = len2 < 1e-6 ? 1 : clamp(((p.x - from.x) * ax + (p.y - from.y) * SY * ay) / len2, minS, 1);
  const at = { x: from.x + ax * s, y: from.y + (ay * s) / SY };
  return { at, s, gap: sd(at, p) };
}

function inField(p: PitchPoint) {
  return p.x > 3.6 && p.x < 96.4 && p.y > 3.6 && p.y < 96.4;
}

function onPitch(p: PitchPoint): PitchPoint {
  return { x: clamp(p.x, 5, 95), y: clamp(p.y, 6, 94) };
}

function hashUnit(text: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function other(team: Team): Team {
  return team === "home" ? "away" : "home";
}

function roleOf(dot: MatchDot): Role {
  if (dot.slot === "CB" || dot.slot === "LB" || dot.slot === "RB" || dot.slot === "LWB" || dot.slot === "RWB") {
    return "back";
  }
  if (dot.slot === "ST" || dot.slot === "LW" || dot.slot === "RW") return "front";
  return "mid";
}

function steer(body: Body, goal: Goal, dt: number, avoid: { x: number; y: number } | undefined) {
  const dx = goal.at.x - body.x;
  const dy = (goal.at.y - body.y) * SY;
  const d = Math.hypot(dx, dy);
  const speed = d < 0.02 ? 0 : Math.min(goal.speed, d * ARRIVE);
  const wantX = (d < 0.02 ? 0 : (dx / d) * speed) + (avoid?.x ?? 0);
  const wantY = (d < 0.02 ? 0 : (dy / d) * speed) + (avoid?.y ?? 0);
  let ax = wantX - body.vx;
  let ay = wantY - body.vy;
  const a = Math.hypot(ax, ay);
  const limit = goal.accel * dt;
  if (a > limit) {
    ax = (ax / a) * limit;
    ay = (ay / a) * limit;
  }
  body.vx += ax;
  body.vy += ay;
  body.x = clamp(body.x + body.vx * dt, 0.5, 99.5);
  body.y = clamp(body.y + (body.vy * dt) / SY, 0.5, 99.5);
  const v = Math.hypot(body.vx, body.vy);
  if (v > 2.5) {
    const fx = mix(body.fx, body.vx / v, 0.25);
    const fy = mix(body.fy, body.vy / v, 0.25);
    const f = Math.hypot(fx, fy) || 1;
    body.fx = fx / f;
    body.fy = fy / f;
  }
}

export function createMatchEngine(tape: MatchTape, homeId: string): MatchEngine {
  const { events, dots } = tape;
  const byId = new Map(dots.map((dot) => [dot.id, dot]));
  const bodies = new Map<string, Body>();
  const wander = new Map<string, [number, number, number, number]>();
  for (const dot of dots) {
    bodies.set(dot.id, { x: dot.base.x, y: dot.base.y, vx: 0, vy: 0, fx: dot.team === "home" ? 1 : -1, fy: 0 });
    wander.set(dot.id, [
      0.5 + hashUnit(dot.id, 1) * 0.45,
      0.42 + hashUnit(dot.id, 2) * 0.5,
      hashUnit(dot.id, 3) * Math.PI * 2,
      hashUnit(dot.id, 4) * Math.PI * 2,
    ]);
  }

  let index = 0;
  let elapsed = 0;
  let clock = 0;
  let waited = 0;
  let current: MatchEvent | null = null;
  let cast: MatchDot[] = dots;
  let phaseKey = "";
  let ball: PitchPoint = { x: 50, y: 50 };
  let ballOpacity = 1;
  let owner: string | null = null;
  let flight: Flight | null = null;
  let relay: Flight | null = null;
  let deadSpot: PitchPoint | null = null;
  let kicked = false;
  let layout = new Map<string, PitchPoint>();
  let pinned = new Set<string>();
  let upcoming: { out: Map<string, PitchPoint>; wall: Set<string> } | null = null;
  let homeSpots: Map<string, PitchPoint> | null = null;
  let presser: { id: string; since: number } | null = null;
  let possSeen: Team | null = null;
  let possBefore: Team | null = null;
  let possSince = 0;
  let booked = new Set<string>();
  let sentOff = new Set<string>();
  const gone = new Set<string>();
  let endsInShot = false;
  let done = false;
  let lastFrame: EngineFrame | null = null;

  const teamOf = (event: MatchEvent): Team | null =>
    event.teamId ? (event.teamId === homeId ? "home" : "away") : null;
  const body = (id: string) => bodies.get(id)!;
  const pos = (id: string): PitchPoint => {
    const b = body(id);
    return { x: b.x, y: b.y };
  };
  const feet = (id: string): PitchPoint => {
    const b = body(id);
    return { x: b.x + b.fx * 1.3, y: b.y + (b.fy * 1.3) / SY };
  };
  const live = (team: Team) => cast.filter((dot) => dot.team === team && !sentOff.has(dot.name));
  const idFor = (team: Team, touch: Pick<MatchTouch, "name" | "slot"> | undefined) => {
    if (!touch) return null;
    const side = cast.filter((dot) => dot.team === team);
    return (
      side.find((dot) => dot.name === touch.name)?.id ??
      side.find((dot) => touch.slot && dot.slot === touch.slot)?.id ??
      null
    );
  };
  const goalSide = (team: Team, from: PitchPoint, secondHalf: boolean) =>
    unit(from, { x: attackDir(team, secondHalf) > 0 ? 4 : 96, y: 50 });

  const castFor = (event: MatchEvent) => {
    const team = teamOf(event);
    const actor = event.actorName;
    if (!actor || !team) return dots;
    if (dots.some((dot) => dot.team === team && dot.name === actor)) return dots;
    const stand =
      dots.find((dot) => dot.team === team && dot.slot === "ST") ??
      dots.find((dot) => dot.team === team && !dot.isGk);
    if (!stand) return dots;
    return dots.map((dot) => (dot.id === stand.id ? { ...dot, name: actor, initials: kitLabel(actor) } : dot));
  };

  const placeBall = (at: PitchPoint) => {
    if (sd(ball, at) > 2.5) ballOpacity = 0;
    ball = { ...at };
  };

  // A saved shot is stopped at the point of its line nearest the keeper, just in front of him.
  const saveSpot = (from: PitchPoint, to: PitchPoint, keeper: PitchPoint): PitchPoint => {
    const { at } = closestOnLine(from, to, keeper, 0.45);
    return offset(at, unit(at, from), 1.6);
  };

  // A scored shot goes into whichever half of the goal leaves the keeper furthest from its line.
  const goalSpot = (from: PitchPoint, to: PitchPoint, keeper: PitchPoint): PitchPoint => {
    const mirror = { x: to.x, y: 100 - to.y };
    const gap = (aim: PitchPoint) => closestOnLine(from, aim, keeper).gap;
    return gap(mirror) > gap(to) ? mirror : { ...to };
  };

  // Saving: meet the ball. Beaten: go for it but end up clear of its line, never under it.
  const keeperOnShot = (shot: Flight, me: PitchPoint): PitchPoint => {
    if (shot.saving) return offset(shot.to, unit(shot.from, shot.to), 1.6);
    const near = closestOnLine(shot.from, shot.to, me);
    if (near.s >= 1 && near.gap > KEEPER_CLEAR) return me;
    let away = unit(near.at, me);
    if (near.gap < 0.05) {
      const travel = unit(shot.from, shot.to);
      away = { x: -travel.y, y: travel.x };
      if ((near.at.y > 50 && away.y > 0) || (near.at.y <= 50 && away.y < 0)) away = { x: -away.x, y: -away.y };
    }
    return offset(near.at, away, Math.max(KEEPER_CLEAR, near.gap * 0.55));
  };

  const land = (item: Flight) => {
    ball = { ...item.to };
    owner = item.receiverId && sd(pos(item.receiverId), ball) <= CONTROL + 1.4 ? item.receiverId : null;
  };

  const snapTo = (spots: Map<string, PitchPoint>) => {
    for (const [id, at] of spots) {
      if (gone.has(id) || sentOff.has(byId.get(id)?.name ?? "")) continue;
      const b = body(id);
      b.x = at.x;
      b.y = at.y;
      b.vx = 0;
      b.vy = 0;
    }
  };

  const assign = (
    spots: { at: PitchPoint; role: Role }[],
    players: MatchDot[],
    out: Map<string, PitchPoint>,
  ): MatchDot[] => {
    const free = players.slice();
    for (const spot of spots) {
      if (!free.length) break;
      let best = 0;
      let bestCost = Number.POSITIVE_INFINITY;
      free.forEach((dot, i) => {
        const cost = sd(pos(dot.id), spot.at) + (spot.role === "any" || roleOf(dot) === spot.role ? 0 : 22);
        if (cost < bestCost) {
          bestCost = cost;
          best = i;
        }
      });
      out.set(free[best]!.id, onPitch(spot.at));
      free.splice(best, 1);
    }
    return free;
  };

  const kickoffLayout = (kick: MatchEvent) => {
    const secondHalf = secondHalfOf(kick);
    const kickTeam = teamOf(kick);
    const kickerId = kickTeam ? idFor(kickTeam, kick.touches[0]) : null;
    const mateId = kickTeam ? idFor(kickTeam, kick.touches[1]) : null;
    const spots = new Map<string, PitchPoint>();
    for (const dot of dots) {
      const dir = attackDir(dot.team, secondHalf);
      const own = dir > 0 ? 0 : 100;
      if (dot.id === kickerId) {
        spots.set(dot.id, { x: 50 - dir * 1.4, y: 50 });
      } else if (dot.id === mateId && kick.touches[1]) {
        spots.set(dot.id, { ...kick.touches[1].at });
      } else if (dot.isGk) {
        spots.set(dot.id, { x: own + dir * 11, y: 50 });
      } else {
        const base = sideBase(dot, secondHalf);
        const rank = ((base.x - own) * dir - 26) / 60;
        let depth = Math.min(19 + rank * 27, 47);
        if (dot.team !== kickTeam) depth = Math.min(depth, 41);
        spots.set(dot.id, { x: own + dir * depth, y: clamp(50 + (base.y - 50) * 0.92, 8, 92) });
      }
    }
    return spots;
  };

  const cornerLayout = (event: MatchEvent, attack: Team, secondHalf: boolean) => {
    const out = new Map<string, PitchPoint>();
    const dir = attackDir(attack, secondHalf);
    const gx = dir > 0 ? 96 : 4;
    const flag = event.ball[0] ?? { x: gx, y: 5 };
    const near = flag.y < 50 ? -1 : 1;
    const box = (depth: number, y: number) => ({ x: gx - dir * depth, y });
    const taking = new Set(event.touches.map((touch) => idFor(attack, touch)));

    const defenders = live(other(attack));
    const keeper = defenders.find((dot) => dot.isGk);
    if (keeper) out.set(keeper.id, box(3.2, 50 + near * 1.5));
    assign(
      [
        { at: box(1.6, 50 + near * 10.5), role: "back" },
        { at: box(8, 50 + near * 10), role: "back" },
        { at: box(8.2, 50), role: "back" },
        { at: box(8, 50 - near * 10), role: "back" },
        { at: box(1.6, 50 - near * 10.5), role: "any" },
        { at: box(11.5, 50 + near * 13), role: "mid" },
        { at: box(11.5, 50 - near * 6), role: "mid" },
        { at: box(18, 50 + near * 4), role: "mid" },
        { at: box(8, flag.y < 50 ? 18 : 82), role: "any" },
        { at: { x: 50 - dir * 4, y: 50 - near * 10 }, role: "front" },
      ],
      defenders.filter((dot) => !dot.isGk),
      out,
    );

    const attackers = live(attack).filter((dot) => !taking.has(dot.id));
    const ownKeeper = attackers.find((dot) => dot.isGk);
    if (ownKeeper) out.set(ownKeeper.id, { x: (dir > 0 ? 4 : 96) + dir * 16, y: 50 });
    assign(
      [
        { at: { x: 50 + dir * 6, y: 50 + near * 14 }, role: "back" },
        { at: { x: 50 + dir * 4, y: 50 - near * 16 }, role: "back" },
        { at: box(8.5, 50 + near * 4), role: "front" },
        { at: box(10, 50 - near * 4), role: "back" },
        { at: box(9, 50 - near * 13), role: "front" },
        { at: box(14.5, 50 + near * 9), role: "any" },
        { at: box(21, 50 - near * 2), role: "mid" },
        { at: box(23, 50 + near * 17), role: "mid" },
        { at: box(10, flag.y < 50 ? 14 : 86), role: "mid" },
      ],
      attackers.filter((dot) => !dot.isGk),
      out,
    );
    return out;
  };

  const freekickLayout = (event: MatchEvent, attack: Team, secondHalf: boolean, spot: PitchPoint) => {
    const out = new Map<string, PitchPoint>();
    const wall = new Set<string>();
    const dir = attackDir(attack, secondHalf);
    const gx = dir > 0 ? 96 : 4;
    const goal = { x: gx, y: 50 };
    const distance = sd(spot, goal);
    const wallSize = distance < 24 ? 4 : distance < 32 ? 3 : distance < 40 ? 2 : 0;
    const taking = new Set(event.touches.map((touch) => idFor(attack, touch)));
    const defend = other(attack);
    const defenders = live(defend);
    const attackers = live(attack).filter((dot) => !taking.has(dot.id));

    if (!wallSize) {
      for (const dot of defenders) {
        const shape = teamShape(dot, spot, false, secondHalf);
        out.set(dot.id, sd(shape, spot) < 9.5 ? offset(spot, unit(spot, shape), 9.5) : shape);
      }
      for (const dot of attackers) out.set(dot.id, teamShape(dot, spot, true, secondHalf));
      return { out, wall };
    }

    const keeper = defenders.find((dot) => dot.isGk);
    if (keeper) out.set(keeper.id, { x: gx - dir * 4, y: clamp(50 + (spot.y - 50) * 0.12, 46, 54) });
    const u = unit(spot, goal);
    const centre = offset(spot, u, 9);
    const across = { x: -u.y, y: u.x };
    const wallSpots = Array.from({ length: wallSize }, (_, i) => ({
      at: offset(centre, across, (i - (wallSize - 1) / 2) * 3.1),
      role: "any" as Role,
    }));
    const before = new Set(out.keys());
    let rest = assign(wallSpots, defenders.filter((dot) => !dot.isGk), out);
    for (const id of out.keys()) if (!before.has(id)) wall.add(id);
    // The back line holds well behind the wall so the two never read as one crowd.
    const lineDepth = clamp(Math.abs(centre.x - gx) - 7.5, 4.5, 13);
    const markers = Math.max(1, rest.length - 1);
    rest = assign(
      [
        { at: { x: 50 - dir * 4, y: 50 }, role: "front" },
        ...Array.from({ length: markers }, (_, i) => ({
          at: { x: gx - dir * lineDepth, y: markers > 1 ? 28 + (44 * i) / (markers - 1) : 50 },
          role: "any" as Role,
        })),
      ],
      rest,
      out,
    );

    const ownKeeper = attackers.find((dot) => dot.isGk);
    if (ownKeeper) out.set(ownKeeper.id, { x: (dir > 0 ? 4 : 96) + dir * 14, y: 50 });
    const leftover = assign(
      [
        { at: { x: 50 + dir * 2, y: 40 }, role: "back" },
        { at: { x: 50 + dir * 2, y: 60 }, role: "back" },
        { at: offset(spot, across, 3.4), role: "mid" },
        { at: { x: gx - dir * (lineDepth + 1.5), y: 34 }, role: "front" },
        { at: { x: gx - dir * (lineDepth + 1.5), y: 46 }, role: "front" },
        { at: { x: gx - dir * (lineDepth + 1.5), y: 58 }, role: "any" },
        { at: { x: gx - dir * (lineDepth + 1.5), y: 70 }, role: "any" },
        { at: { x: gx - dir * 22, y: 50 }, role: "mid" },
      ],
      attackers.filter((dot) => !dot.isGk),
      out,
    );
    for (const dot of leftover) out.set(dot.id, teamShape(dot, spot, true, secondHalf));
    return { out, wall };
  };

  const leadPoint = (id: string, scripted: PitchPoint, seconds: number) => {
    const at = pos(id);
    const reach = Math.max(2, RUN_REACH * seconds * 0.8);
    if (sd(at, scripted) <= reach) return onPitch(scripted);
    return onPitch(offset(at, unit(at, scripted), reach));
  };

  const startEvent = (event: MatchEvent) => {
    const previous = current;
    if (flight) land(flight);
    if (relay) land(relay);
    flight = null;
    relay = null;
    current = event;
    cast = castFor(event);
    endsInShot = playhead(event, 0.999).phase === "shot";
    phaseKey = "";
    waited = 0;
    kicked = false;
    presser = null;
    layout = new Map();
    pinned = new Set();
    booked = new Set();
    sentOff = new Set();
    for (const item of events.slice(0, index + 1)) {
      if (item.cardName && item.card === "yellow") booked.add(item.cardName);
      if (item.cardName && item.card === "red") sentOff.add(item.cardName);
    }
    if (owner && sentOff.has(byId.get(owner)?.name ?? "")) owner = null;
    const secondHalf = secondHalfOf(event);
    const team = teamOf(event);
    const next = events[index + 1];

    if (event.type === "kickoff" || event.type === "restart") {
      homeSpots = kickoffLayout(event);
      if (index === 0) snapTo(homeSpots);
      placeBall({ x: 50, y: 50 });
      owner = null;
      deadSpot = { x: 50, y: 50 };
    } else if (event.type === "ht") {
      homeSpots = next?.type === "kickoff" ? kickoffLayout(next) : null;
      if (homeSpots) snapTo(homeSpots);
      placeBall({ x: 50, y: 50 });
      owner = null;
      deadSpot = null;
    } else if (event.type === "goal") {
      homeSpots = next?.type === "restart" ? kickoffLayout(next) : null;
      owner = null;
      deadSpot = null;
    } else if (event.type === "ft") {
      owner = null;
    } else if (event.type === "foul") {
      deadSpot = onPitch(ball);
      ball = { ...deadSpot };
      owner = null;
      upcoming = next?.type === "freekick" && team ? freekickLayout(next, team, secondHalf, deadSpot) : null;
    } else if (event.type === "freekick" && team) {
      const spot = onPitch(previous?.type === "foul" && deadSpot ? deadSpot : (event.ball[0] ?? ball));
      placeBall(spot);
      deadSpot = spot;
      owner = null;
      const made = upcoming ?? freekickLayout(event, team, secondHalf, spot);
      layout = made.out;
      pinned = made.wall;
    } else if (event.type === "corner" && team) {
      const spot = event.ball[0] ?? ball;
      placeBall(spot);
      deadSpot = { ...spot };
      owner = null;
      layout = cornerLayout(event, team, secondHalf);
    } else {
      deadSpot = null;
      const first = team ? idFor(team, event.touches[0]) : null;
      if (!inField(ball) && first) {
        placeBall(feet(first));
        owner = first;
      }
    }
    if (event.type !== "foul") upcoming = null;
  };

  const frameOf = (event: MatchEvent, t: number, head: Playhead, air: number, receiverId: string | null) => {
    let card: EngineFrame["card"] = null;
    if (event.type === "foul" && event.card && event.contest) {
      const team = teamOf(event);
      const fouler = team ? idFor(other(team), event.contest) : null;
      if (fouler) card = { at: pos(fouler), red: event.card === "red" };
    }
    return {
      eventIndex: index,
      event,
      t,
      head,
      ball: { ...ball },
      ballAir: air,
      ballOpacity,
      ownerId: owner,
      receiverId,
      inFlight: Boolean(flight || relay),
      card,
      booked,
      sentOff,
      gone,
      secondHalf: secondHalfOf(event),
      done,
    } satisfies EngineFrame;
  };

  const step = (dtMs: number): EngineFrame => {
    if (done && lastFrame) return lastFrame;
    const ms = clamp(dtMs, 0, 48);
    const dt = ms / 1000;
    clock += ms;
    const event = events[index]!;
    if (event !== current) startEvent(event);
    const t = clamp(elapsed / Math.max(1, event.durationMs), 0, 1);
    const head = playhead(event, t);
    const secondHalf = secondHalfOf(event);
    const team = teamOf(event);
    const next = events[index + 1];
    const touchIds = event.touches.map((touch) => (team ? idFor(team, touch) : null));
    const holderId = head.touchIndex >= 0 ? (touchIds[head.touchIndex] ?? null) : null;
    const receiverId = head.receiverIndex >= 0 ? (touchIds[head.receiverIndex] ?? null) : null;
    const kickoff = event.type === "kickoff" || event.type === "restart";
    const setPiece = kickoff || event.type === "corner" || event.type === "freekick";
    const beforeKick = setPiece && !kicked;

    const key = `${event.id}:${head.index}`;
    if (key !== phaseKey) {
      phaseKey = key;
      waited = 0;
      if (flight) land(flight);
      flight = null;
      if (head.phase === "pass" || head.phase === "shot") {
        if (relay) land(relay);
        relay = null;
        const keeper = head.phase === "shot" && team ? live(other(team)).find((dot) => dot.isGk) : undefined;
        const saving = Boolean(keeper && next?.type === "save" && inField(head.to));
        const scoring = Boolean(keeper && next?.type === "goal");
        const to =
          head.phase === "pass" && receiverId
            ? leadPoint(receiverId, head.to, (head.span * event.durationMs) / 1000)
            : saving && keeper
              ? saveSpot(ball, head.to, pos(keeper.id))
              : scoring && keeper
                ? goalSpot(ball, head.to, pos(keeper.id))
                : { ...head.to };
        flight = {
          from: { ...ball },
          to,
          loft: head.loft,
          receiverId: head.phase === "pass" ? receiverId : null,
          shot: head.phase === "shot",
          saving,
          ms: 0,
          elapsed: 0,
        };
        owner = null;
        kicked = true;
        deadSpot = null;
      }
    }

    // A teammate still has the ball from the last action: play it to the new holder instead of letting it drift.
    if (!flight && !relay && head.phase === "hold" && holderId && owner && owner !== holderId && !beforeKick) {
      if (byId.get(owner)?.team === byId.get(holderId)?.team) {
        const to = onPitch(pos(holderId));
        relay = {
          from: { ...ball },
          to,
          loft: 0,
          receiverId: holderId,
          shot: false,
          saving: false,
          ms: clamp(sd(ball, to) * 24, 280, 800),
          elapsed: 0,
        };
        owner = null;
      }
    }

    const possTeam: Team | null = owner ? (byId.get(owner)?.team ?? team) : team;
    if (possTeam !== possSeen) {
      possBefore = possSeen;
      possSeen = possTeam;
      possSince = clock;
    }
    const focus = flight ? flight.to : relay ? relay.to : ball;
    const goals = new Map<string, Goal>();
    const set = (id: string, at: PitchPoint, speed: number, accel = 110, fixed = false) =>
      goals.set(id, { at, speed, accel, pinned: fixed });

    for (const dot of dots) {
      if (!sentOff.has(dot.name)) continue;
      const b = body(dot.id);
      const edge = b.y < 50 ? 0.5 : 99.5;
      if (gone.has(dot.id) || Math.abs(b.y - edge) < 1) {
        gone.add(dot.id);
        b.vx = 0;
        b.vy = 0;
        set(dot.id, pos(dot.id), 0, 0, true);
        continue;
      }
      set(dot.id, { x: b.x, y: edge }, 12, 60, true);
    }

    let presserId: string | null = null;
    let challenging = false;

    if (event.type === "ht" || event.type === "ft") {
      for (const dot of dots) if (!goals.has(dot.id)) set(dot.id, homeSpots?.get(dot.id) ?? pos(dot.id), 10, 80);
    } else if (event.type === "goal") {
      const scorerId = team ? idFor(team, { name: event.actorName ?? "", slot: event.actorSlot }) : null;
      const scorer = scorerId ? pos(scorerId) : null;
      const celebrating = t < 0.6;
      for (const dot of dots) {
        if (goals.has(dot.id)) continue;
        const home = homeSpots?.get(dot.id) ?? teamShape(dot, { x: 50, y: 50 }, false, secondHalf);
        if (celebrating && scorer && team && dot.team === team && !dot.isGk) {
          if (dot.id === scorerId) {
            const dir = attackDir(team, secondHalf);
            set(dot.id, onPitch({ x: scorer.x + dir * 2, y: scorer.y + (scorer.y < 50 ? -6 : 6) }), 14, 90);
            continue;
          }
          if (sd(pos(dot.id), scorer) < 24) {
            const angle = hashUnit(dot.id, 5) * Math.PI * 2;
            set(dot.id, offset(scorer, { x: Math.cos(angle), y: Math.sin(angle) }, 4.6), 22, 120);
            continue;
          }
        }
        set(dot.id, home, celebrating ? 14 : 26, 100);
      }
    } else if (event.type === "foul") {
      const victimId = touchIds[0] ?? null;
      const foulerId = team && event.contest ? idFor(other(team), event.contest) : null;
      const takerTouch = next?.type === "freekick" ? next.touches[0] : undefined;
      const takerId = team && takerTouch ? idFor(team, takerTouch) : null;
      for (const dot of dots) {
        if (goals.has(dot.id)) continue;
        const b = body(dot.id);
        if (dot.id === victimId) {
          set(dot.id, deadSpot ?? pos(dot.id), 10, 120, true);
        } else if (dot.id === foulerId && victimId) {
          set(dot.id, offset(pos(victimId), goalSide(dot.team, pos(victimId), secondHalf), 3.6), 22, 200, true);
        } else if (dot.id === takerId && deadSpot && next) {
          const aim = next.touches[1]?.at ?? next.ball[next.ball.length - 1] ?? deadSpot;
          set(dot.id, offset(deadSpot, unit(deadSpot, aim), -4.5), 24, 140);
        } else if (upcoming?.out.has(dot.id) && t > 0.25) {
          set(dot.id, upcoming.out.get(dot.id)!, 18, 90);
        } else {
          set(dot.id, { x: b.x + b.vx * 0.15, y: b.y + (b.vy * 0.15) / SY }, 8, 70);
        }
      }
    } else {
      const defTeam = possTeam ? other(possTeam) : null;
      const ownerTeam = owner ? byId.get(owner)?.team : null;
      const pressing =
        defTeam &&
        (event.type === "play" ||
          event.type === "chance" ||
          (kickoff && kicked) ||
          (event.type === "turnover" && (ownerTeam === team || head.touchIndex > 0)));
      const foulNext = next?.type === "foul" && !beforeKick;
      if ((pressing || foulNext) && defTeam) {
        const challengerName =
          next?.type === "turnover" && next.teamId !== event.teamId
            ? next.touches[0]?.name
            : next?.type === "foul"
              ? next.contest?.name
              : undefined;
        const challenger = challengerName
          ? live(defTeam).find((dot) => dot.name === challengerName && !dot.isGk)
          : undefined;
        if (challenger) {
          presserId = challenger.id;
          challenging = true;
        } else {
          const dir = attackDir(defTeam, secondHalf);
          const depth = (focus.x - (dir > 0 ? 0 : 100)) * dir;
          const pool = live(defTeam).filter((dot) => !dot.isGk && (depth < 42 || !isStayBack(dot.slot)));
          let nearest: MatchDot | undefined;
          let nearestDist = Number.POSITIVE_INFINITY;
          for (const dot of pool) {
            const d = sd(pos(dot.id), focus);
            if (d < nearestDist) {
              nearest = dot;
              nearestDist = d;
            }
          }
          const keep =
            presser &&
            pool.some((dot) => dot.id === presser?.id) &&
            (clock - presser.since < 1100 || sd(pos(presser.id), focus) - nearestDist < 7);
          if (keep && presser) {
            presserId = presser.id;
          } else if (nearest) {
            presserId = nearest.id;
            presser = { id: nearest.id, since: clock };
          }
        }
      }

      const anchorId = owner ?? holderId;
      const anchor = anchorId ? pos(anchorId) : null;
      let supportId: string | null = null;
      if (possTeam && anchor && !layout.size && !beforeKick) {
        let best = Number.POSITIVE_INFINITY;
        for (const dot of live(possTeam)) {
          if (dot.isGk || dot.id === anchorId || touchIds.includes(dot.id) || isStayBack(dot.slot)) continue;
          const d = sd(pos(dot.id), anchor);
          if (d < best) {
            best = d;
            supportId = dot.id;
          }
        }
      }

      const landing = new Set<string>();
      if (flight && !flight.shot && layout.size && team) {
        live(other(team))
          .filter((dot) => !dot.isGk)
          .sort((a, b) => sd(pos(a.id), flight!.to) - sd(pos(b.id), flight!.to))
          .slice(0, 2)
          .forEach((dot) => landing.add(dot.id));
      }

      // The keeper reads the shot while the finisher shapes up, so he is set (or wrong-footed) before it is struck.
      let shotPlan: Flight | null = null;
      const aim = event.ball[event.ball.length - 1];
      if (
        endsInShot &&
        aim &&
        team &&
        !flight &&
        head.phase === "hold" &&
        head.touchIndex === event.touches.length - 1 &&
        owner !== null &&
        owner === holderId
      ) {
        const keeper = live(other(team)).find((dot) => dot.isGk);
        if (keeper) {
          const saving = next?.type === "save" && inField(aim);
          const to = saving
            ? saveSpot(ball, aim, pos(keeper.id))
            : next?.type === "goal"
              ? goalSpot(ball, aim, pos(keeper.id))
              : { ...aim };
          shotPlan = { from: { ...ball }, to, loft: 0, receiverId: null, shot: true, saving, ms: 0, elapsed: 0 };
        }
      }

      const ahead = Math.max(head.touchIndex, head.receiverIndex);
      const s = clock / 1000;
      const cornerTouch = next?.type === "corner" && head.phase === "shot" ? next.touches[0] : undefined;
      const cornerTeam = next ? teamOf(next) : null;
      const cornerTakerId = cornerTouch && cornerTeam ? idFor(cornerTeam, cornerTouch) : null;
      for (const dot of dots) {
        if (goals.has(dot.id)) continue;
        const me = pos(dot.id);
        // Each player reads a change of possession at his own speed, so the team shifts in a ripple.
        const reacting = possBefore !== null && clock - possSince < 150 + hashUnit(dot.id, 3) * 400;
        const possessing = dot.team === (reacting ? possBefore : possTeam);
        const shape = teamShape(dot, focus, possessing, secondHalf);

        if (dot.id === holderId && head.phase === "hold" && !relay) {
          if (beforeKick && deadSpot) {
            const aim = event.touches[1]?.at ?? event.ball[event.ball.length - 1] ?? head.to;
            set(dot.id, offset(deadSpot, unit(deadSpot, aim), -1.5), 24, 180, true);
          } else if (owner === dot.id) {
            set(dot.id, onPitch(head.from), 17, 140, true);
          } else {
            set(dot.id, ball, 30, 220, true);
          }
          continue;
        }
        if (flight?.receiverId === dot.id) {
          set(dot.id, flight.to, 31, 220, true);
          continue;
        }
        if (relay?.receiverId === dot.id) {
          set(dot.id, relay.to, 26, 200, true);
          continue;
        }
        const future = touchIds.findIndex((id, i) => id === dot.id && i > ahead);
        if (future >= 0 && event.touches[future]) {
          set(dot.id, onPitch(event.touches[future]!.at), 24, 140);
          continue;
        }
        if (dot.id === cornerTakerId && cornerTouch) {
          set(dot.id, cornerTouch.at, 26, 150);
          continue;
        }

        if (dot.isGk) {
          if (flight?.shot && team && dot.team !== team) {
            set(dot.id, keeperOnShot(flight, me), 36, 420, true);
          } else if (shotPlan && team && dot.team !== team) {
            set(dot.id, keeperOnShot(shotPlan, me), 22, 180);
          } else if (layout.has(dot.id)) {
            set(dot.id, layout.get(dot.id)!, 18, 120);
          } else if (event.type === "save" && team && dot.team !== team && inField(ball) && sd(me, ball) < 20) {
            set(dot.id, ball, 30, 260, true);
          } else if (kickoff && beforeKick && homeSpots?.has(dot.id)) {
            set(dot.id, homeSpots.get(dot.id)!, 20, 120);
          } else {
            set(dot.id, shape, 16, 90);
          }
          continue;
        }

        if (kickoff && beforeKick && homeSpots?.has(dot.id)) {
          set(dot.id, homeSpots.get(dot.id)!, 26, 120);
          continue;
        }
        if (layout.has(dot.id) && !(dot.id === presserId && challenging && kicked)) {
          const spot = layout.get(dot.id)!;
          const at = flight && landing.has(dot.id) ? offset(flight.to, goalSide(dot.team, flight.to, secondHalf), 2.2) : spot;
          set(dot.id, at, 22, 130, pinned.has(dot.id));
          continue;
        }
        if (dot.id === presserId) {
          const mark = owner && anchor ? anchor : focus;
          const close = challenging && t > 0.55 ? 3.2 : 4.4;
          set(dot.id, offset(mark, goalSide(dot.team, mark, secondHalf), close), sd(me, mark) > 12 ? 31 : 26, 170);
          continue;
        }
        if (dot.id === supportId && anchor) {
          const dir = attackDir(dot.team, secondHalf);
          const side = shape.y >= anchor.y ? 1 : -1;
          const angle = onPitch({ x: anchor.x + dir * 7, y: anchor.y + side * 14 });
          set(dot.id, { x: mix(shape.x, angle.x, 0.55), y: mix(shape.y, angle.y, 0.55) }, 24, 120);
          continue;
        }
        const [a, b, p, q] = wander.get(dot.id)!;
        const roam = event.type === "save" ? 0.5 : 1;
        set(
          dot.id,
          {
            x: shape.x + (Math.sin(s * a + p) + 0.5 * Math.sin(s * a * 1.9 + q)) * 1.7 * roam,
            y: shape.y + (Math.cos(s * b + q) + 0.5 * Math.sin(s * b * 1.7 + p)) * 3.2 * roam,
          },
          sd(me, shape) > 14 ? 27 : 21,
          100,
        );
      }
    }

    // Keep players from standing on top of each other.
    const spacing = [...goals.entries()].filter(([id]) => !sentOff.has(byId.get(id)?.name ?? ""));
    if (owner && !goals.get(owner)?.pinned) spacing.push(["@owner", { at: pos(owner), speed: 0, accel: 0, pinned: true }]);
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < spacing.length; i += 1) {
        for (let j = i + 1; j < spacing.length; j += 1) {
          const [idA, a] = spacing[i]!;
          const [idB, b] = spacing[j]!;
          if (a.pinned && b.pinned) continue;
          const pair = [idA, idB];
          if (presserId && pair.includes(presserId) && (pair.includes(owner ?? "") || pair.includes("@owner") || pair.includes(holderId ?? ""))) {
            continue;
          }
          const dx = b.at.x - a.at.x;
          const dy = (b.at.y - a.at.y) * SY;
          const d = Math.hypot(dx, dy);
          if (d >= GAP) continue;
          const angle = hashUnit(idA + idB, 7) * Math.PI * 2;
          const u = d < 0.01 ? { x: Math.cos(angle), y: Math.sin(angle) } : { x: dx / d, y: dy / d };
          const push = GAP - d;
          const shareA = a.pinned ? 0 : b.pinned ? 1 : 0.5;
          const shareB = 1 - shareA;
          a.at = offset(a.at, u, -push * shareA);
          b.at = offset(b.at, u, push * shareB);
        }
      }
    }

    // Bodies on crossing paths step around each other instead of sliding through.
    const avoid = new Map<string, { x: number; y: number }>();
    const nudge = (id: string, x: number, y: number) => {
      const v = avoid.get(id) ?? { x: 0, y: 0 };
      avoid.set(id, { x: v.x + x, y: v.y + y });
    };
    // A runner heading into someone veers to the open side rather than only being pushed back.
    const sidestep = (id: string, b: Body, toOther: { x: number; y: number }, weight: number) => {
      const v = Math.hypot(b.vx, b.vy);
      if (v < 4) return;
      const hx = b.vx / v;
      const hy = b.vy / v;
      const ahead = hx * toOther.x + hy * toOther.y;
      if (ahead <= 0.2) return;
      let px = -hy;
      let py = hx;
      if (px * toOther.x + py * toOther.y > 0) {
        px = -px;
        py = -py;
      }
      const lateral = v * 0.7 * ahead * weight;
      nudge(id, px * lateral, py * lateral);
    };
    const awake = dots.filter((dot) => goals.has(dot.id) && !sentOff.has(dot.name));
    const tackling = (a: string, b: string) =>
      presserId !== null &&
      (a === presserId || b === presserId) &&
      [owner, holderId].some((id) => id !== null && (id === a || id === b));
    for (let i = 0; i < awake.length; i += 1) {
      for (let j = i + 1; j < awake.length; j += 1) {
        const idA = awake[i]!.id;
        const idB = awake[j]!.id;
        const ga = goals.get(idA)!;
        const gb = goals.get(idB)!;
        if ((ga.pinned && gb.pinned) || tackling(idA, idB)) continue;
        const pa = body(idA);
        const pb = body(idB);
        const dx = pb.x - pa.x;
        const dy = (pb.y - pa.y) * SY;
        const d = Math.hypot(dx, dy);
        if (d >= AVOID) continue;
        const angle = hashUnit(idA + idB, 11) * Math.PI * 2;
        const u = d < 0.01 ? { x: Math.cos(angle), y: Math.sin(angle) } : { x: dx / d, y: dy / d };
        const close = (AVOID - d) / AVOID;
        const strength = 34 * close * close + 8 * close;
        const wa = ga.pinned ? 0.25 : 1;
        const wb = gb.pinned ? 0.25 : 1;
        nudge(idA, -u.x * strength * wa, -u.y * strength * wa);
        nudge(idB, u.x * strength * wb, u.y * strength * wb);
        sidestep(idA, pa, u, close * wa);
        sidestep(idB, pb, { x: -u.x, y: -u.y }, close * wb);
      }
    }

    for (const dot of dots) {
      const goal = goals.get(dot.id);
      if (!goal) continue;
      if (!sentOff.has(dot.name)) {
        const edge = dot.isGk || goal.pinned ? 2.5 : 4.5;
        goal.at = { x: clamp(goal.at.x, 1.5, 98.5), y: clamp(goal.at.y, edge, 100 - edge) };
      }
      steer(body(dot.id), goal, dt, avoid.get(dot.id));
    }

    let air = 0;
    if (flight) {
      const lt = clamp(head.localT, 0, 1);
      ball = passBall(flight.from, flight.to, lt, flight.loft);
      air = flight.loft > 0 ? Math.sin(lt * Math.PI) * 0.55 : 0;
    } else if (relay) {
      relay.elapsed += ms;
      const lt = clamp(relay.elapsed / relay.ms, 0, 1);
      ball = passBall(relay.from, relay.to, lt, 0);
      if (lt >= 1) {
        land(relay);
        relay = null;
      }
    } else if (event.type === "ht") {
      ball = { x: 50, y: 50 };
    } else if (deadSpot && (event.type === "foul" || beforeKick)) {
      ball = { ...deadSpot };
    } else if (owner) {
      ball = toward(ball, feet(owner), 75 * dt);
    }
    ballOpacity = Math.min(1, ballOpacity + dt * 4);

    if (!flight && !relay && event.type !== "foul" && event.type !== "goal" && !beforeKick) {
      if (head.phase === "hold" && holderId && owner !== holderId && sd(pos(holderId), ball) <= CONTROL) {
        owner = holderId;
      }
      if (event.type === "save" && team && !owner && inField(ball)) {
        const keeper = live(other(team)).find((dot) => dot.isGk);
        if (keeper && sd(pos(keeper.id), ball) <= CONTROL) owner = keeper.id;
      }
    }

    let wait = Boolean(relay);
    if (!wait && head.phase === "hold" && holderId) {
      if (beforeKick) {
        const spot = deadSpot ?? ball;
        const settled = kickoff
          ? !homeSpots ||
            dots.every((dot) => sentOff.has(dot.name) || sd(pos(dot.id), homeSpots!.get(dot.id) ?? pos(dot.id)) < 3.5)
          : [...layout.keys()].every((id) => {
              const goal = goals.get(id);
              return !goal || sd(pos(id), goal.at) < (pinned.has(id) ? 2.2 : 6);
            });
        if (head.localT > 0.6 && !(sd(pos(holderId), spot) < 2.6 && settled)) wait = true;
      } else if (owner !== holderId && event.type !== "foul" && head.localT > 0.7) {
        wait = true;
      }
    }
    if (wait) {
      waited += ms;
      if (waited > WAIT_CAP_MS) {
        wait = false;
        if (holderId && !beforeKick && !relay) owner = holderId;
      }
    }
    if (!wait) elapsed += ms;

    const frame = frameOf(event, t, head, air, flight?.receiverId ?? relay?.receiverId ?? receiverId);
    if (elapsed >= event.durationMs) {
      if (index >= events.length - 1) {
        done = true;
        frame.done = true;
      } else {
        index += 1;
        elapsed = 0;
      }
    }
    lastFrame = frame;
    return frame;
  };

  return {
    step,
    position: (id) => {
      const b = bodies.get(id);
      return b ? { x: b.x, y: b.y } : undefined;
    },
  };
}
