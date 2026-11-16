/**
 * Renders headless engine frames to PNG so set pieces and movement can be inspected
 * without a browser: free kick and corner at the moment of the kick, the kick-off,
 * and short player trails in open play.
 *
 * Run: npx esbuild scripts/match-frames.ts --bundle --platform=node --format=esm \
 *        --outfile=node_modules/.cache/match-frames.mjs && node node_modules/.cache/match-frames.mjs [seed]
 */
import fs from "node:fs";
import zlib from "node:zlib";
import { createMatchEngine, type EngineFrame } from "../lib/match-engine";
import { buildMatchTape, inferFormation, type MatchSide, type MatchTape } from "../lib/match-tape";
import { autoSelectXi } from "../lib/simulate";
import type { GoalScorer, PlayerSeason } from "../lib/types";

const W = 800;
const H = 400;
const OUT = "node_modules/.cache/shots";
const DT = 1000 / 60;

let seed = Number(process.argv[2] ?? 7);
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

class Canvas {
  px = new Uint8Array(W * H * 3);
  constructor() {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) this.put(x, y, [34, 110 + ((x >> 5) % 2) * 8, 52], 1);
    }
  }
  put(x: number, y: number, rgb: number[], a: number) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (Math.floor(y) * W + Math.floor(x)) * 3;
    for (let k = 0; k < 3; k += 1) this.px[i + k] = this.px[i + k]! * (1 - a) + rgb[k]! * a;
  }
  disc(cx: number, cy: number, r: number, rgb: number[], a = 1) {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y += 1) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x += 1) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const cover = Math.max(0, Math.min(1, r + 0.5 - d));
        if (cover > 0) this.put(x, y, rgb, cover * a);
      }
    }
  }
  ring(cx: number, cy: number, r: number, rgb: number[]) {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y += 1) {
      for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x += 1) {
        const d = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r);
        if (d < 1.2) this.put(x, y, rgb, 1 - d / 1.2);
      }
    }
  }
  rect(x0: number, y0: number, x1: number, y1: number) {
    const line = [235, 245, 235];
    for (let x = x0; x <= x1; x += 1) {
      this.put(x, y0, line, 0.45);
      this.put(x, y1, line, 0.45);
    }
    for (let y = y0; y <= y1; y += 1) {
      this.put(x0, y, line, 0.45);
      this.put(x1, y, line, 0.45);
    }
  }
  png() {
    const raw = Buffer.alloc((W * 3 + 1) * H);
    for (let y = 0; y < H; y += 1) {
      raw[y * (W * 3 + 1)] = 0;
      Buffer.from(this.px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
    }
    const head = Buffer.alloc(13);
    head.writeUInt32BE(W, 0);
    head.writeUInt32BE(H, 4);
    head[8] = 8;
    head[9] = 2;
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", head),
      chunk("IDAT", zlib.deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

const X = (x: number) => (x / 100) * W;
const Y = (y: number) => (y / 100) * H;
const R = (4.1 / 100) * W * 0.5;
const HOME = [250, 214, 80];
const AWAY = [96, 182, 240];

function pitch() {
  const c = new Canvas();
  c.rect(X(4), Y(4), X(96), Y(96));
  c.rect(X(50), Y(4), X(50), Y(96));
  c.rect(X(4), Y(22), X(20), Y(78));
  c.rect(X(80), Y(22), X(96), Y(78));
  c.rect(X(4), Y(35), X(11), Y(65));
  c.rect(X(89), Y(35), X(96), Y(65));
  c.rect(X(1.6), Y(42), X(4), Y(58));
  c.rect(X(96), Y(42), X(98.4), Y(58));
  return c;
}

function draw(tape: MatchTape, engine: ReturnType<typeof createMatchEngine>, f: EngineFrame, name: string) {
  const c = pitch();
  for (const dot of tape.dots) {
    const p = engine.position(dot.id)!;
    const off = f.sentOff.has(dot.name);
    c.disc(X(p.x), Y(p.y), R, dot.team === "home" ? HOME : AWAY, off ? 0.35 : 1);
    if (dot.isGk) c.ring(X(p.x), Y(p.y), R, [255, 255, 255]);
    if (f.booked.has(dot.name)) c.ring(X(p.x), Y(p.y), R + 2, [250, 204, 21]);
  }
  c.disc(X(f.ball.x), Y(f.ball.y), 3.5 * (1 + f.ballAir * 0.75), [255, 255, 255], f.ballOpacity);
  fs.writeFileSync(`${OUT}/${name}.png`, c.png());
  console.log(`${name}: ${f.event.minute}' ${f.event.type} ${f.head.caption}`);
}

function trails(tape: MatchTape, engine: ReturnType<typeof createMatchEngine>, frames: number, name: string) {
  const c = pitch();
  let f = engine.step(DT);
  const start = `${f.event.minute}' ${f.event.type}`;
  for (let i = 0; i < frames; i += 1) {
    f = engine.step(DT);
    if (i % 3 !== 0) continue;
    for (const dot of tape.dots) {
      const p = engine.position(dot.id)!;
      c.disc(X(p.x), Y(p.y), 1.6, dot.team === "home" ? HOME : AWAY, 0.55);
    }
    c.disc(X(f.ball.x), Y(f.ball.y), 1.3, [255, 255, 255], 0.9);
  }
  for (const dot of tape.dots) {
    const p = engine.position(dot.id)!;
    c.disc(X(p.x), Y(p.y), R, dot.team === "home" ? HOME : AWAY);
  }
  c.disc(X(f.ball.x), Y(f.ball.y), 3.5, [255, 255, 255]);
  fs.writeFileSync(`${OUT}/${name}.png`, c.png());
  console.log(`${name}: ${start} -> ${f.event.minute}' ${f.event.type}`);
}

function shotTrail(tape: MatchTape, engine: ReturnType<typeof createMatchEngine>, first: EngineFrame, name: string) {
  const c = pitch();
  const keepers = tape.dots.filter((dot) => dot.isGk);
  let f = first;
  for (let i = 0; i < 60 && (i === 0 || f.head.phase === "shot"); i += 1) {
    for (const dot of keepers) {
      const p = engine.position(dot.id)!;
      c.disc(X(p.x), Y(p.y), 1.8, [255, 120, 120], 0.8);
    }
    c.disc(X(f.ball.x), Y(f.ball.y), 1.6, [255, 255, 255], 0.9);
    f = engine.step(DT);
  }
  for (const dot of tape.dots) {
    const p = engine.position(dot.id)!;
    c.disc(X(p.x), Y(p.y), R, dot.team === "home" ? HOME : AWAY, dot.isGk ? 1 : 0.35);
    if (dot.isGk) c.ring(X(p.x), Y(p.y), R, [255, 255, 255]);
  }
  c.disc(X(f.ball.x), Y(f.ball.y), 3.5, [255, 255, 255]);
  fs.writeFileSync(`${OUT}/${name}.png`, c.png());
  console.log(`${name}: ${first.event.minute}' ${first.event.type} -> ${tape.events[first.eventIndex + 1]?.type}`);
}

function squads(): PlayerSeason[][] {
  const json = JSON.parse(fs.readFileSync("public/data/epl-player-seasons.json", "utf8")) as { players: PlayerSeason[] };
  const groups = new Map<string, PlayerSeason[]>();
  for (const player of json.players) {
    const key = `${player.clubKey}::${player.season}`;
    groups.set(key, [...(groups.get(key) ?? []), player]);
  }
  return [...groups.values()].filter((group) => group.length >= 16);
}

function side(id: string, squad: PlayerSeason[]): MatchSide {
  const { xi } = autoSelectXi(squad);
  return { id, name: xi[0]?.club ?? id, formationId: inferFormation(xi), xi };
}

fs.mkdirSync(OUT, { recursive: true });
const pool = squads();
for (let attempt = 0; attempt < 200; attempt += 1) {
  const home = side("home", pool[Math.floor(rand() * pool.length)]!);
  const away = side("away", pool[Math.floor(rand() * pool.length)]!);
  const scorers: GoalScorer[] = [
    { teamId: "home", name: home.xi[10]!.name, slot: home.xi[10]!.slot, minute: 20 + Math.floor(rand() * 20) },
    { teamId: "away", name: away.xi[9]!.name, slot: away.xi[9]!.slot, minute: 55 + Math.floor(rand() * 25) },
  ];
  const tape = buildMatchTape(home, away, scorers);
  const directFk = tape.events.findIndex(
    (event, i) => event.type === "freekick" && event.touches.length === 1 && tape.events[i + 1]?.type === "save",
  );
  const corner = tape.events.findIndex((event) => event.type === "corner");
  if (directFk < 0 || corner < 0) continue;

  const wanted = new Map<number, string>([
    [directFk, "freekick"],
    [corner, "corner"],
  ]);
  const engine = createMatchEngine(tape, home.id);
  let shotKick = false;
  let trailed = false;
  let kickoffShot = false;
  const shots = new Set<string>();
  let prev = engine.step(0);
  for (let i = 0; i < 60 * 240; i += 1) {
    const f = engine.step(DT);
    const label = wanted.get(prev.eventIndex);
    if (label && prev.head.phase === "hold" && f.head.phase !== "hold") {
      draw(tape, engine, prev, label);
      wanted.delete(prev.eventIndex);
    }
    if (!kickoffShot && f.event.type === "kickoff" && f.head.phase !== "hold") {
      draw(tape, engine, f, "kickoff");
      kickoffShot = true;
    }
    if (!shotKick && f.event.type === "foul" && f.t > 0.1) {
      draw(tape, engine, f, "foul");
      shotKick = true;
    }
    if (f.head.phase === "shot" && prev.head.phase !== "shot") {
      const next = tape.events[f.eventIndex + 1]?.type;
      if (next === "goal" && !shots.has("goal")) {
        shots.add("goal");
        shotTrail(tape, engine, f, "goal-shot");
      } else if (next === "save" && f.inFlight && !shots.has("save") && f.head.to.x > 5 && f.head.to.x < 95) {
        shots.add("save");
        shotTrail(tape, engine, f, "save-shot");
      }
    }
    if (!trailed && f.event.type === "play" && f.eventIndex > 6) {
      trails(tape, engine, 180, "trails");
      trailed = true;
    }
    prev = f;
    if (f.done) break;
  }
  console.log(`${home.name} v ${away.name}`);
  break;
}
