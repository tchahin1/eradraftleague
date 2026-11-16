/**
 * Plays many full matches headlessly through the real tape + engine and reports
 * motion problems: lost kick-offs, fouls away from the ball, the ball moving by
 * itself or sitting alone, oversized walls, stuttering and stacked players.
 *
 * Run: npx esbuild scripts/match-check.ts --bundle --platform=node --format=esm \
 *        --outfile=node_modules/.cache/match-check.mjs && node node_modules/.cache/match-check.mjs [matches]
 */
import fs from "node:fs";
import { createMatchEngine } from "../lib/match-engine";
import { buildMatchTape, inferFormation, type MatchSide, type PitchPoint } from "../lib/match-tape";
import { autoSelectXi } from "../lib/simulate";
import type { GoalScorer, PlayerSeason } from "../lib/types";

const LEAGUES = ["epl", "laliga", "seriea", "bundesliga", "ligue1"];
const MATCHES = Number(process.argv[2] ?? 40);
const DT = 1000 / 60;
const SY = 0.5;

function sd(a: PitchPoint, b: PitchPoint) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * SY);
}

function inField(p: PitchPoint) {
  return p.x > 3.6 && p.x < 96.4 && p.y > 3.6 && p.y < 96.4;
}

let seed = 12345;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

function squads(): PlayerSeason[][] {
  const out: PlayerSeason[][] = [];
  for (const league of LEAGUES) {
    const file = `public/data/${league}-player-seasons.json`;
    if (!fs.existsSync(file)) continue;
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as { players: PlayerSeason[] } | PlayerSeason[];
    const players = Array.isArray(json) ? json : json.players;
    const groups = new Map<string, PlayerSeason[]>();
    for (const player of players) {
      const key = `${player.clubKey}::${player.season}`;
      groups.set(key, [...(groups.get(key) ?? []), player]);
    }
    for (const group of groups.values()) if (group.length >= 16) out.push(group);
  }
  return out;
}

function side(id: string, squad: PlayerSeason[]): MatchSide {
  const { xi } = autoSelectXi(squad);
  return { id, name: xi[0]?.club ?? id, formationId: inferFormation(xi), xi };
}

function scorersFor(home: MatchSide, away: MatchSide): GoalScorer[] {
  const goals = Math.floor(rand() * 5);
  const used = new Set<number>();
  const out: GoalScorer[] = [];
  for (let i = 0; i < goals; i += 1) {
    const team = rand() < 0.5 ? home : away;
    const shooters = team.xi.filter((player) => player.group === "FWD" || player.group === "MID");
    const player = pick(shooters.length ? shooters : team.xi);
    let minute = 3 + Math.floor(rand() * 86);
    while (used.has(minute) || minute === 45 || minute === 46) minute = 3 + Math.floor(rand() * 86);
    used.add(minute);
    out.push({ teamId: team.id, name: player.name, slot: player.slot, minute });
  }
  return out;
}

type Totals = {
  matches: number;
  tapeMs: number;
  playMs: number;
  kickoffLost: number;
  kickoffs: number;
  fouls: number;
  foulFar: number;
  foulWorst: number;
  ghostMs: number;
  lonelyMs: number;
  lonelyWorst: number;
  wallWorst: number;
  stutters: number;
  overlapPerFrame: number;
  teleports: number;
  passes: number;
  passMiss: number;
  ballJumps: number;
  glideMs: number;
  shots: number;
  loftedShots: number;
  throughKeeper: number;
  saves: number;
  savesReached: number;
  keeperFrames: number;
  keeperDepth: number;
  keeperOnLine: number;
  keeperWide: number;
  reds: number;
  redsGone: number;
  redBack: number;
};

function run(home: MatchSide, away: MatchSide, scorers: GoalScorer[], totals: Totals, label: string) {
  const tape = buildMatchTape(home, away, scorers);
  const engine = createMatchEngine(tape, home.id);
  const ids = tape.dots.map((dot) => dot.id);
  const teamOf = new Map(tape.dots.map((dot) => [dot.id, dot.team]));
  const last = new Map<string, PitchPoint>();
  const lastVel = new Map<string, { x: number; y: number }>();
  const reversals = new Map<string, number[]>();
  let prevBall: PitchPoint | null = null;
  let prevIndex = -1;
  let lonelyRun = 0;
  let frames = 0;
  let overlapSum = 0;
  let kickTeam: string | null = null;
  let kickWatch = 0;
  let fkNear: string[] | null = null;
  let prevFlight = false;
  let prevReceiver: string | null = null;
  let lastShotKey = "";
  let shotSaving = false;
  let shotTouched = false;
  let prevShotSaving = false;
  const offPos = new Map<string, PitchPoint>();
  const goneSeen = new Set<string>();
  const notes: string[] = [];

  totals.tapeMs += tape.events.reduce((sum, event) => sum + event.durationMs, 0);
  for (let i = 0; i < 60 * 240; i += 1) {
    const f = engine.step(DT);
    frames += 1;
    const event = f.event;
    const positions = ids.map((id) => engine.position(id)!);

    if (f.eventIndex !== prevIndex) {
      if (event.type === "kickoff" || event.type === "restart") {
        totals.kickoffs += 1;
        kickTeam = event.teamId === home.id ? "home" : "away";
        kickWatch = 0;
      }
      if (event.type === "foul" && event.contest) {
        totals.fouls += 1;
        const attack = event.teamId === home.id ? "home" : "away";
        const fouler = tape.dots.find((dot) => dot.team !== attack && dot.name === event.contest!.name);
        const victim = tape.dots.find((dot) => dot.team === attack && dot.name === event.touches[0]?.name);
        const fd = fouler ? sd(engine.position(fouler.id)!, f.ball) : 99;
        const vd = victim ? sd(engine.position(victim.id)!, f.ball) : 99;
        const worst = Math.max(fd, vd);
        totals.foulWorst = Math.max(totals.foulWorst, worst);
        if (worst > 7) {
          totals.foulFar += 1;
          const before = tape.events[f.eventIndex - 1];
          notes.push(
            `foul ${event.minute}' fouler ${fd.toFixed(1)} victim ${vd.toFixed(1)} from ball after ${before?.type} (${before?.touches.length} touches, ${before?.durationMs}ms)`,
          );
        }
      }
      prevIndex = f.eventIndex;
    }

    if (kickTeam && kickWatch < 3200) {
      kickWatch += DT;
      if (f.ownerId && teamOf.get(f.ownerId) !== kickTeam) {
        totals.kickoffLost += 1;
        notes.push(`kick-off lost at ${event.minute}' (${event.type})`);
        kickTeam = null;
      }
    }

    if (prevBall && !f.inFlight && !f.ownerId && f.ballOpacity >= 1 && event.type !== "ht" && event.type !== "goal") {
      if (sd(prevBall, f.ball) > 0.05) totals.ghostMs += DT;
    }
    if (f.ownerId && !f.inFlight && sd(engine.position(f.ownerId)!, f.ball) > 3.5) {
      totals.glideMs += DT;
      const where = `${event.type}:${f.head.phase}:${f.head.touchIndex}`;
      glideBy.set(where, (glideBy.get(where) ?? 0) + DT);
    }
    const restType = event.type === "goal" || event.type === "ht" || event.type === "ft" || event.type === "save";
    if (!f.inFlight && inField(f.ball) && !restType) {
      const nearest = Math.min(...positions.map((p) => sd(p, f.ball)));
      if (nearest > 3.5) {
        lonelyRun += DT;
        totals.lonelyMs += DT;
        const where = `${event.type}:${f.head.phase}:${f.head.touchIndex}`;
        lonelyBy.set(where, (lonelyBy.get(where) ?? 0) + DT);
        totals.lonelyWorst = Math.max(totals.lonelyWorst, lonelyRun);
      } else {
        lonelyRun = 0;
      }
    } else {
      lonelyRun = 0;
    }

    if (event.type === "freekick" && f.head.phase === "hold" && f.head.touchIndex === 0) {
      const attack = event.teamId === home.id ? "home" : "away";
      const attacksRight = (attack === "home") !== f.secondHalf;
      const goalX = attacksRight ? 98 : 2;
      const span = Math.hypot(goalX - f.ball.x, (50 - f.ball.y) * SY) || 1;
      const wallAt = {
        x: f.ball.x + ((goalX - f.ball.x) / span) * 9,
        y: f.ball.y + ((50 - f.ball.y) / span) * 9,
      };
      fkNear = ids.filter((id, k) => teamOf.get(id) !== attack && sd(positions[k]!, wallAt) < 6.5);
      if (fkNear.length > 4 && process.argv.includes("--walls")) {
        console.log(
          `  wall ${label} ${event.minute}' t=${f.t.toFixed(2)} local=${f.head.localT.toFixed(2)} ball ${f.ball.x.toFixed(1)},${f.ball.y.toFixed(1)} wallAt ${wallAt.x.toFixed(1)},${wallAt.y.toFixed(1)}\n` +
            ids
              .map((id, k) => ({ id, p: positions[k]! }))
              .filter(({ id }) => teamOf.get(id) !== attack)
              .map(({ id, p }) => `    ${tape.dots.find((dot) => dot.id === id)?.slot} ${p.x.toFixed(1)},${p.y.toFixed(1)} d=${sd(p, wallAt).toFixed(1)}`)
              .join("\n"),
        );
      }
    } else if (fkNear) {
      if (fkNear.length > totals.wallWorst) {
        totals.wallWorst = fkNear.length;
        wallNote = `${label} ${event.minute}' ball ${f.ball.x.toFixed(0)},${f.ball.y.toFixed(0)} ${fkNear
          .map((id) => tape.dots.find((dot) => dot.id === id)?.slot)
          .join(",")}`;
      }
      fkNear = null;
    }

    if (prevFlight && !f.inFlight && prevReceiver) {
      totals.passes += 1;
      const miss = sd(engine.position(prevReceiver)!, f.ball);
      if (miss > 4) {
        totals.passMiss += 1;
        notes.push(`pass missed receiver by ${miss.toFixed(1)} at ${event.minute}' (${event.type})`);
      }
    }
    if (prevBall && f.ballOpacity >= 1 && sd(prevBall, f.ball) > 4 && event.type !== "ht") {
      totals.ballJumps += 1;
      notes.push(`ball jumped ${sd(prevBall, f.ball).toFixed(1)} at ${event.minute}' (${event.type})`);
    }
    const shotPhase = f.head.phase === "shot" && f.inFlight;
    const shotKey = `${f.eventIndex}:${f.head.index}`;
    if (shotPhase && shotKey !== lastShotKey) {
      lastShotKey = shotKey;
      totals.shots += 1;
      if (f.head.loft > 0) totals.loftedShots += 1;
      const next = tape.events[f.eventIndex + 1];
      shotSaving = next?.type === "save" && inField(f.head.to);
      shotTouched = false;
    }
    const attackTeam = event.teamId === home.id ? "home" : "away";
    const keeper = tape.dots.find((dot) => dot.isGk && dot.team !== attackTeam && !f.sentOff.has(dot.name));
    if (shotPhase && keeper && !shotSaving) {
      if (sd(engine.position(keeper.id)!, f.ball) < 2.7 && !shotTouched) {
        shotTouched = true;
        totals.throughKeeper += 1;
        notes.push(`ball through keeper at ${event.minute}' (${tape.events[f.eventIndex + 1]?.type})`);
        if (process.argv.includes("--keeper")) {
          const k = engine.position(keeper.id)!;
          console.log(
            `  gk ${label} ${event.minute}' walkIn=${Boolean(event.walkIn)} local=${f.head.localT.toFixed(2)} ball ${f.ball.x.toFixed(1)},${f.ball.y.toFixed(1)} gk ${k.x.toFixed(1)},${k.y.toFixed(1)} from ${f.head.from.x.toFixed(1)},${f.head.from.y.toFixed(1)} to ${f.head.to.x.toFixed(1)},${f.head.to.y.toFixed(1)} span ${(f.head.span * event.durationMs).toFixed(0)}ms`,
          );
        }
      }
    }
    if (prevFlight && !f.inFlight && prevShotSaving && keeper) {
      totals.saves += 1;
      const k = engine.position(keeper.id)!;
      if (sd(k, f.ball) <= 2.6) totals.savesReached += 1;
      else if (process.argv.includes("--saves")) {
        console.log(
          `  save ${label} ${event.minute}' ${tape.events[f.eventIndex - (f.event.type === "save" ? 1 : 0)]?.type} -> ${event.type} ball ${f.ball.x.toFixed(1)},${f.ball.y.toFixed(1)} gk ${k.x.toFixed(1)},${k.y.toFixed(1)} d=${sd(k, f.ball).toFixed(1)}`,
        );
      }
    }
    prevShotSaving = shotPhase && shotSaving;
    if (event.type === "play" || event.type === "chance" || event.type === "turnover") {
      for (const dot of tape.dots) {
        if (!dot.isGk || f.sentOff.has(dot.name)) continue;
        const p = engine.position(dot.id)!;
        const lineX = (dot.team === "home") !== f.secondHalf ? 4 : 96;
        const depth = Math.abs(p.x - lineX);
        totals.keeperFrames += 1;
        totals.keeperDepth += depth;
        if (depth < 2.5) totals.keeperOnLine += 1;
        if (Math.abs(p.y - 50) > 5.5) totals.keeperWide += 1;
      }
    }
    for (const dot of tape.dots) {
      if (!f.sentOff.has(dot.name)) continue;
      const p = engine.position(dot.id)!;
      const was = offPos.get(dot.id);
      if (was && (f.gone.has(dot.id) ? sd(was, p) > 0.01 : Math.min(p.y, 100 - p.y) > Math.min(was.y, 100 - was.y) + 0.3)) {
        totals.redBack += 1;
        notes.push(`sent-off player back on the pitch at ${event.minute}' (${event.type})`);
      }
      offPos.set(dot.id, p);
      if (f.gone.has(dot.id)) goneSeen.add(dot.id);
    }

    prevFlight = f.inFlight;
    prevReceiver = f.receiverId;

    let overlaps = 0;
    for (let a = 0; a < positions.length; a += 1) {
      for (let b = a + 1; b < positions.length; b += 1) {
        if (sd(positions[a]!, positions[b]!) < 2.8) {
          overlaps += 1;
          const ball = ids[a] === f.ownerId || ids[b] === f.ownerId ? "owner" : "free";
          const same = teamOf.get(ids[a]!) === teamOf.get(ids[b]!) ? "same" : "rival";
          const where = `${event.type}:${same}:${ball}`;
          stackBy.set(where, (stackBy.get(where) ?? 0) + 1);
        }
      }
    }
    overlapSum += overlaps;

    ids.forEach((id, k) => {
      const p = positions[k]!;
      const prev = last.get(id);
      if (prev) {
        const jump = sd(p, prev);
        if (jump > 3 && event.type !== "ht" && f.eventIndex !== 0) totals.teleports += 1;
        const v = { x: (p.x - prev.x) / (DT / 1000), y: ((p.y - prev.y) * SY) / (DT / 1000) };
        const pv = lastVel.get(id);
        const speed = Math.hypot(v.x, v.y);
        if (pv && speed > 6 && Math.hypot(pv.x, pv.y) > 6) {
          const cos = (v.x * pv.x + v.y * pv.y) / (speed * Math.hypot(pv.x, pv.y));
          if (cos < -0.5) {
            const list = (reversals.get(id) ?? []).filter((at) => frames * DT - at < 1000);
            list.push(frames * DT);
            reversals.set(id, list);
            if (list.length >= 3) {
              totals.stutters += 1;
              reversals.set(id, []);
            }
          }
        }
        lastVel.set(id, v);
      }
      last.set(id, p);
    });
    prevBall = f.ball;
    if (f.done) break;
  }
  totals.reds += new Set(tape.events.filter((item) => item.card === "red").map((item) => item.cardName)).size;
  totals.redsGone += goneSeen.size;
  totals.playMs += frames * DT;
  totals.overlapPerFrame += overlapSum / frames;
  totals.matches += 1;
  if (notes.length) console.log(`  ${label}: ${notes.slice(0, 4).join("; ")}`);
}

const lonelyBy = new Map<string, number>();
const glideBy = new Map<string, number>();
const stackBy = new Map<string, number>();
let wallNote = "";
const pool = squads();
const totals: Totals = {
  matches: 0,
  tapeMs: 0,
  playMs: 0,
  kickoffLost: 0,
  kickoffs: 0,
  fouls: 0,
  foulFar: 0,
  foulWorst: 0,
  ghostMs: 0,
  lonelyMs: 0,
  lonelyWorst: 0,
  wallWorst: 0,
  stutters: 0,
  overlapPerFrame: 0,
  teleports: 0,
  passes: 0,
  passMiss: 0,
  ballJumps: 0,
  glideMs: 0,
  shots: 0,
  loftedShots: 0,
  throughKeeper: 0,
  saves: 0,
  savesReached: 0,
  keeperFrames: 0,
  keeperDepth: 0,
  keeperOnLine: 0,
  keeperWide: 0,
  reds: 0,
  redsGone: 0,
  redBack: 0,
};
for (let m = 0; m < MATCHES; m += 1) {
  const home = side("home", pick(pool));
  const away = side("away", pick(pool));
  run(home, away, scorersFor(home, away), totals, `#${m} ${home.name} v ${away.name}`);
}
const per = (value: number) => (value / totals.matches).toFixed(2);
console.log(`
matches            ${totals.matches}
avg tape / played  ${(totals.tapeMs / totals.matches / 1000).toFixed(1)}s / ${(totals.playMs / totals.matches / 1000).toFixed(1)}s
kick-offs lost     ${totals.kickoffLost} of ${totals.kickoffs}
fouls off the ball ${totals.foulFar} of ${totals.fouls} (worst ${totals.foulWorst.toFixed(1)} units)
passes off target  ${totals.passMiss} of ${totals.passes}
ball jumps         ${totals.ballJumps}
ball moving alone  ${per(totals.ghostMs)} ms per match
ball gliding over  ${per(totals.glideMs)} ms per match
ball left alone    ${per(totals.lonelyMs)} ms per match (longest ${totals.lonelyWorst.toFixed(0)} ms)
biggest wall       ${totals.wallWorst} defenders in the wall spot at the kick
stutters           ${per(totals.stutters)} per match
stacked pairs      ${per(totals.overlapPerFrame)} per frame
player teleports   ${per(totals.teleports)} per match
lofted shots       ${totals.loftedShots} of ${totals.shots}
ball through GK    ${totals.throughKeeper} goals/misses
saves at the GK    ${totals.savesReached} of ${totals.saves}
keeper off line    ${(totals.keeperDepth / Math.max(1, totals.keeperFrames)).toFixed(1)} avg, on the line ${((100 * totals.keeperOnLine) / Math.max(1, totals.keeperFrames)).toFixed(1)}%, off-centre ${((100 * totals.keeperWide) / Math.max(1, totals.keeperFrames)).toFixed(1)}%
red cards removed  ${totals.redsGone} of ${totals.reds}, back on pitch ${totals.redBack}`);
if (process.argv.includes("--detail")) {
  const top = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, value]) => `    ${key.padEnd(28)} ${(value / totals.matches).toFixed(1)}`)
      .join("\n");
  console.log(`\nball alone by moment (ms per match)\n${top(lonelyBy)}`);
  console.log(`\nball gliding to owner by moment (ms per match)\n${top(glideBy)}`);
  console.log(`\nstacked pairs by moment (frames per match)\n${top(stackBy)}`);
  console.log(`\nbiggest wall: ${wallNote}`);
}
