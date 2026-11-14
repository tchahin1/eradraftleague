"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ballAtFeet,
  buildMatchTape,
  kitLabel,
  moveToward,
  passBall,
  playhead,
  roleTarget,
  secondHalfOf,
  type MatchDot,
  type MatchEvent,
  type MatchSide,
  type PitchPoint,
} from "@/lib/match-tape";
import type { GoalScorer } from "@/lib/types";

type Props = {
  home: MatchSide;
  away: MatchSide;
  scorers: GoalScorer[];
  youId?: string;
  onReveal?: (count: number) => void;
  onClock?: (label: string) => void;
  onComplete?: () => void;
};

type Frame = {
  eventIndex: number;
  ball: PitchPoint;
  caption: string;
  minute: number;
  flash: boolean;
  actorId: string | null;
  done: boolean;
};

function dist(a: PitchPoint, b: PitchPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function actorIdOf(dots: MatchDot[], event: MatchEvent, homeId: string, name?: string, slot?: string) {
  const team = event.teamId === homeId ? "home" : "away";
  const side = dots.filter((dot) => dot.team === team);
  const who = name ?? event.actorName;
  const role = slot ?? event.actorSlot;
  if (!who && !role) return null;
  return (
    side.find((dot) => who && dot.name === who)?.id ??
    side.find((dot) => role && dot.slot === role)?.id ??
    null
  );
}

function dotsForEvent(dots: MatchDot[], event: MatchEvent, homeId: string) {
  if (!event.actorName || !event.teamId) return dots;
  const team = event.teamId === homeId ? "home" : "away";
  if (dots.some((dot) => dot.team === team && dot.name === event.actorName)) return dots;
  const target =
    dots.find((dot) => dot.team === team && dot.slot === "ST") ??
    dots.find((dot) => dot.team === team && !dot.isGk);
  if (!target) return dots;
  return dots.map((dot) =>
    dot.id === target.id
      ? { ...dot, name: event.actorName ?? dot.name, initials: kitLabel(event.actorName ?? dot.name) }
      : dot,
  );
}

function MatchPitchView({ home, away, scorers, youId, onReveal, onClock, onComplete }: Props) {
  const tapeKey = [
    home.id,
    away.id,
    home.formationId,
    away.formationId,
    home.xi.map((player) => player.id).join("|"),
    away.xi.map((player) => player.id).join("|"),
    scorers.map((goal) => `${goal.minute}:${goal.name}:${goal.slot}`).join("|"),
  ].join("::");
  const tape = useMemo(
    () => buildMatchTape(home, away, scorers),
    // Tape must stay frozen while the scoreboard ticks, or the clip restarts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tapeKey],
  );
  const [frame, setFrame] = useState<Frame>(() => ({
    eventIndex: 0,
    ball: { x: 50, y: 50 },
    caption: "Kick off",
    minute: 0,
    flash: false,
    actorId: null,
    done: false,
  }));
  const ballRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const attackRef = useRef<HTMLSpanElement>(null);
  const leftNameRef = useRef<HTMLDivElement>(null);
  const rightNameRef = useRef<HTMLDivElement>(null);
  const playerRefs = useRef(new Map<string, HTMLDivElement>());
  const onRevealRef = useRef(onReveal);
  const onClockRef = useRef(onClock);
  const onCompleteRef = useRef(onComplete);
  const skipRef = useRef(false);
  const doneRef = useRef(false);
  const goalsRef = useRef(0);

  useEffect(() => {
    onRevealRef.current = onReveal;
    onClockRef.current = onClock;
    onCompleteRef.current = onComplete;
  }, [onReveal, onClock, onComplete]);

  useEffect(() => {
    const { events, dots } = tape;
    if (events.length === 0) return;
    skipRef.current = false;
    doneRef.current = false;
    goalsRef.current = 0;
    let eventIndex = 0;
    let elapsed = 0;
    let last = performance.now();
    let raf = 0;
    let finished = false;
    let lastUi = "";
    let lastClock = "";
    let lastEventId = "";
    let liveBall: PitchPoint = { x: 50, y: 50 };
    let passLock: { key: string; from: PitchPoint; to: PitchPoint; loft: number } | null = null;
    let collecting = false;
    let collectMs = 0;
    const positions = new Map<string, PitchPoint>();
    for (const dot of dots) positions.set(dot.id, { ...dot.base });

    const writePositions = (event: MatchEvent, now: number, t: number, dt: number) => {
      const secondHalf = secondHalfOf(event);
      const liveDots = dotsForEvent(dots, event, home.id);
      const possessHome = event.teamId === home.id;
      const head = playhead(event, t);
      const rest = event.type === "ht" || event.type === "ft";
      const holderId = actorIdOf(liveDots, event, home.id, head.holderName, head.holderSlot);
      const receiverId = actorIdOf(liveDots, event, home.id, head.receiverName, head.receiverSlot);
      const involved = new Map<string, PitchPoint>();
      for (const touch of event.touches) {
        const id = actorIdOf(liveDots, event, home.id, touch.name, touch.slot);
        if (id) involved.set(id, touch.at);
      }
      const snapSpot =
        event.type === "kickoff" ||
        event.type === "restart" ||
        event.type === "goal" ||
        event.type === "ht" ||
        event.type === "ft";
      const centerSpot = event.type === "kickoff" || event.type === "restart";
      if (event.id !== lastEventId) {
        lastEventId = event.id;
        passLock = null;
        collectMs = 0;
        collecting = !snapSpot && event.touches.length > 0;
      }
      const flightKey = `${event.id}:${head.phase}:${head.holderName}:${head.receiverName}`;
      if (head.phase === "pass" || head.phase === "shot") {
        if (!passLock || passLock.key !== flightKey) {
          passLock = {
            key: flightKey,
            from: centerSpot ? { x: 50, y: 50 } : { ...liveBall },
            to: head.phase === "shot" ? { ...head.to } : { ...head.to },
            loft: head.loft,
          };
        }
      } else {
        passLock = null;
      }

      const collect = head.from;
      const holderNow = holderId ? (positions.get(holderId) ?? collect) : collect;
      const onTheBall = Boolean(holderId) && dist(holderNow, liveBall) <= 2.8;
      const focus = event.type === "goal"
        ? (event.ball[0] ?? liveBall)
        : passLock
          ? passBall(passLock.from, passLock.to, head.localT, passLock.loft)
          : onTheBall
            ? holderNow
            : liveBall;
      const tangent = {
        x: (passLock?.to.x ?? head.to.x) - (passLock?.from.x ?? head.from.x),
        y: (passLock?.to.y ?? head.to.y) - (passLock?.from.y ?? head.from.y),
      };
      const mag = Math.hypot(tangent.x, tangent.y) || 1;
      const facing = { x: tangent.x / mag, y: tangent.y / mag };

      const possessTeam = possessHome ? "home" : "away";
      const defenders = liveDots.filter((dot) => dot.team !== possessTeam && !dot.isGk);
      const presser = defenders.slice().sort((a, b) => {
        const aPos = positions.get(a.id) ?? a.base;
        const bPos = positions.get(b.id) ?? b.base;
        return dist(aPos, focus) - dist(bPos, focus);
      })[0];

      let holderPos = holderNow;
      let holderBob = 0;
      liveDots.forEach((dot, index) => {
        const node = playerRefs.current.get(dot.id);
        const possessing = (dot.team === "home") === possessHome && Boolean(event.teamId);
        const shooting = head.phase === "shot" && dot.id === holderId && !event.walkIn;
        const chasing =
          (dot.id === holderId && !onTheBall && head.phase !== "pass" && head.phase !== "shot") ||
          (dot.id === receiverId && Boolean(passLock));
        const isHolder = dot.id === holderId && head.phase === "hold" && !rest && onTheBall;
        const isReceiver = dot.id === receiverId && head.phase === "pass" && !rest;
        const pressing = presser?.id === dot.id && !possessing && !rest && !involved.has(dot.id);
        const current = positions.get(dot.id) ?? { ...dot.base };
        let target =
          shooting && passLock
            ? passLock.from
            : event.type === "goal" && !event.walkIn && event.actorName === dot.name
              ? (event.ball[0] ?? current)
              : dot.id === receiverId && passLock
                ? passLock.to
                : dot.id === holderId && (collecting || !onTheBall) && head.phase === "hold"
                  ? liveBall
                  : (involved.get(dot.id) ??
                    roleTarget(dot, focus, holderPos, facing, possessing, pressing, null, event.type, secondHalf));
        if (!dot.isGk && !(event.walkIn && dot.id === holderId)) {
          target = { x: Math.min(91, Math.max(9, target.x)), y: target.y };
        }
        const regroup = event.type === "kickoff" || event.type === "restart" || event.type === "ht";
        const steal = event.type === "turnover";
        const speed = regroup
          ? 42
          : chasing || (steal && involved.has(dot.id))
            ? 40
            : isHolder || isReceiver
              ? 34
              : pressing
                ? 32
                : involved.has(dot.id)
                  ? 30
                  : dot.isGk
                    ? 14
                    : rest
                      ? 16
                      : 24;
        const pos = moveToward(current, target, speed * (dt / 1000));
        const bob =
          rest || dot.isGk
            ? 0
            : Math.sin(now / 80 + index) * 0.5 + (event.type === "goal" && t > 0.25 && dot.id === holderId ? Math.sin(now / 70) * 1.3 : 0);
        positions.set(dot.id, pos);
        if (dot.id === holderId) {
          holderPos = pos;
          holderBob = bob;
        }
        if (node) {
          node.style.left = `${pos.x}%`;
          node.style.top = `${pos.y + bob}%`;
          node.style.transform =
            isHolder || isReceiver ? "translate(-50%, -50%) scale(1.14)" : "translate(-50%, -50%)";
        }
      });

      let ball = focus;
      const feet = ballAtFeet({ x: holderPos.x, y: holderPos.y + holderBob }, facing);
      if (rest) {
        ball = { x: 50, y: 50 };
      } else if (centerSpot && head.phase === "hold") {
        ball = { x: 50, y: 50 };
      } else if (passLock && (head.phase === "pass" || head.phase === "shot")) {
        ball = passBall(passLock.from, passLock.to, head.localT, passLock.loft);
      } else if (event.type === "goal" || event.type === "save") {
        ball = event.ball[event.ball.length - 1] ?? liveBall;
      } else if (onTheBall) {
        const catchUp = 90 * (dt / 1000);
        ball = dist(liveBall, feet) <= catchUp ? feet : moveToward(liveBall, feet, catchUp);
      } else {
        ball = liveBall;
      }
      liveBall = ball;
      if (collecting) collectMs += dt;
      const reachedBall = Boolean(holderId) && dist(holderPos, liveBall) <= 2.8;
      if (collecting && (reachedBall || rest || snapSpot || collectMs > 700)) collecting = false;
      if (attackRef.current) {
        attackRef.current.textContent = secondHalf ? "Home attacks left" : "Home attacks right";
      }
      if (leftNameRef.current && rightNameRef.current) {
        leftNameRef.current.textContent = secondHalf ? away.name : home.name;
        rightNameRef.current.textContent = secondHalf ? home.name : away.name;
        leftNameRef.current.classList.toggle("text-amber-200/90", !secondHalf);
        leftNameRef.current.classList.toggle("text-sky-100/90", secondHalf);
        rightNameRef.current.classList.toggle("text-sky-100/90", !secondHalf);
        rightNameRef.current.classList.toggle("text-amber-200/90", secondHalf);
      }
      if (ballRef.current) {
        ballRef.current.style.left = `${ball.x}%`;
        ballRef.current.style.top = `${ball.y}%`;
        ballRef.current.style.transform = `translate(-50%, -50%) scale(${1 + head.air * 0.75})`;
      }
      return { ball, caption: head.caption, wait: collecting };
    };

    const clockLabel = (event: MatchEvent, shown: string) => {
      if (event.type === "ht") return "Half time";
      if (event.type === "ft") return "Full time";
      if (event.type === "goal") return "Goal";
      if (event.type === "kickoff" || event.type === "restart") return "Kick off";
      if (/shoots/i.test(shown)) return `${event.minute}'`;
      return `${event.minute}'`;
    };

    const finish = (ball: PitchPoint, eventIndexNow: number) => {
      finished = true;
      setFrame({
        eventIndex: eventIndexNow,
        ball,
        caption: "Full time",
        minute: 90,
        flash: false,
        actorId: null,
        done: true,
      });
      onClockRef.current?.("Full time");
      onCompleteRef.current?.();
    };

    const tick = (now: number) => {
      if (finished || doneRef.current) return;
      const dt = Math.min(48, now - last);
      last = now;
      if (skipRef.current) {
        onRevealRef.current?.(events.filter((event) => event.type === "goal").length);
        finish({ x: 50, y: 50 }, events.length - 1);
        return;
      }
      const event = events[eventIndex];
      if (!event) return;
      const t = Math.min(1, elapsed / Math.max(1, event.durationMs));
      const { ball, caption, wait } = writePositions(event, now, t, dt);
      if (!wait) elapsed += dt;

      if (event.type === "goal" && t >= 0.22) {
        const count = events.slice(0, eventIndex + 1).filter((item) => item.type === "goal").length;
        if (count > goalsRef.current) {
          goalsRef.current = count;
          onRevealRef.current?.(count);
        }
      }

      const flash = event.type === "goal" && t < 0.5;
      const shown =
        event.type === "goal" || event.type === "ht" || event.type === "ft" || event.type === "restart"
          ? event.caption
          : caption;
      const ui = `${eventIndex}:${shown}:${flash ? 1 : 0}`;
      if (ui !== lastUi) {
        lastUi = ui;
        if (captionRef.current) {
          captionRef.current.textContent = `${event.minute}' · ${shown}`;
        }
        flashRef.current?.classList.toggle("opacity-25", flash);
        flashRef.current?.classList.toggle("opacity-0", !flash);
      }
      const label = clockLabel(event, shown);
      if (label !== lastClock) {
        lastClock = label;
        onClockRef.current?.(label);
      }

      if (!wait && elapsed >= event.durationMs) {
        if (eventIndex >= events.length - 1) {
          finish(ball, eventIndex);
          return;
        }
        eventIndex += 1;
        elapsed = 0;
      }
      raf = window.requestAnimationFrame(tick);
    };

    const first = events[0]!;
    writePositions(first, performance.now(), 0, 16);
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [tape, home.id]);

  const skip = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    skipRef.current = true;
    onRevealRef.current?.(scorers.length);
    onClockRef.current?.("Full time");
    onCompleteRef.current?.();
    setFrame({
      eventIndex: Math.max(0, tape.events.length - 1),
      ball: { x: 50, y: 50 },
      caption: "Full time",
      minute: 90,
      flash: false,
      actorId: null,
      done: true,
    });
  };

  return (
    <div className="mt-6">
      <p ref={captionRef} className="mb-3 text-center text-sm font-bold uppercase tracking-[0.2em] text-white">
        {frame.done ? "90' · Full time" : `${frame.minute}' · ${frame.caption}`}
      </p>
      <div className="relative aspect-[2/1] w-full overflow-hidden rounded-3xl border border-green-400/25 bg-linear-to-b from-green-800 via-green-700 to-green-900 shadow-[inset_0_0_80px_rgba(0,0,0,0.35)]">
        <div className="pointer-events-none absolute inset-[4%] border-2 border-white/25" />
        <div className="pointer-events-none absolute left-1/2 top-[4%] h-[92%] w-px bg-white/20" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[28%] w-[14%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20" />
        <div className="pointer-events-none absolute left-[4%] top-[22%] h-[56%] w-[16%] border-2 border-l-0 border-white/20" />
        <div className="pointer-events-none absolute right-[4%] top-[22%] h-[56%] w-[16%] border-2 border-r-0 border-white/20" />
        <div className="pointer-events-none absolute left-[4%] top-[35%] h-[30%] w-[7%] border-2 border-l-0 border-white/20" />
        <div className="pointer-events-none absolute right-[4%] top-[35%] h-[30%] w-[7%] border-2 border-r-0 border-white/20" />
        <div className="pointer-events-none absolute left-[1.6%] top-[42%] h-[16%] w-[2.4%] border-2 border-white/45" />
        <div className="pointer-events-none absolute right-[1.6%] top-[42%] h-[16%] w-[2.4%] border-2 border-white/45" />
        <div
          ref={flashRef}
          className="pointer-events-none absolute inset-0 bg-white opacity-0 transition-opacity duration-200"
        />

        {tape.dots.map((dot) => {
          const yours = (dot.team === "home" ? home.id : away.id) === youId;
          const homeKit = dot.team === "home";
          return (
            <div
              key={dot.id}
              ref={(node) => {
                if (node) {
                  playerRefs.current.set(dot.id, node);
                  if (!node.style.left) {
                    node.style.left = `${dot.base.x}%`;
                    node.style.top = `${dot.base.y}%`;
                  }
                } else {
                  playerRefs.current.delete(dot.id);
                }
              }}
              className={`absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[9px] font-black tracking-wide shadow-md sm:h-8 sm:w-8 sm:text-[10px] ${
                homeKit ? "bg-amber-300 text-emerald-950" : "bg-sky-100 text-slate-900"
              } ${dot.isGk ? "ring-2 ring-white/80" : ""} ${yours ? "outline outline-2 outline-offset-1 outline-white/50" : ""}`}
              title={dot.name}
            >
              {dot.initials}
            </div>
          );
        })}

        <div
          ref={(node) => {
            ballRef.current = node;
            if (node && !node.style.left) {
              node.style.left = "50%";
              node.style.top = "50%";
            }
          }}
          className="absolute z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
        />

        <div
          ref={leftNameRef}
          className="pointer-events-none absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-widest text-amber-200/90"
        >
          {home.name}
        </div>
        <div
          ref={rightNameRef}
          className="pointer-events-none absolute bottom-2 right-3 text-[10px] font-bold uppercase tracking-widest text-sky-100/90"
        >
          {away.name}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-emerald-100/50">
        <span ref={attackRef}>Home attacks right</span>
        {!frame.done ? (
          <button
            type="button"
            onClick={skip}
            className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/80 hover:text-white"
          >
            Skip
          </button>
        ) : (
          <span>Full time</span>
        )}
        <span>Three-letter names</span>
      </div>
    </div>
  );
}

export const MatchPitch = memo(MatchPitchView);
