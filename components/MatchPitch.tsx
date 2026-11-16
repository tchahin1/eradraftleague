"use client";

import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createMatchEngine, type EngineFrame } from "@/lib/match-engine";
import { buildMatchTape, type MatchEvent, type MatchSide } from "@/lib/match-tape";
import {
  armMatchSfx,
  isMatchSfxMuted,
  playMatchSfx,
  setMatchSfxMuted,
  stopMatchSfx,
  subscribeMatchSfxMuted,
} from "@/lib/match-sfx";
import { DEFAULT_AWAY_KIT, DEFAULT_HOME_KIT, kitPatternClass, kitStyle, kitVars, type KitChoice } from "@/lib/kits";
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
  caption: string;
  minute: number;
  done: boolean;
};

function kitKey(kit?: KitChoice) {
  return kit ? `${kit.color}.${kit.secondary}.${kit.pattern}` : "";
}

function clockLabel(event: MatchEvent) {
  if (event.type === "ht") return "Half time";
  if (event.type === "ft") return "Full time";
  if (event.type === "goal") return "Goal";
  if (event.type === "kickoff" || event.type === "restart") return "Kick off";
  if (event.type === "foul") return event.card === "red" ? "Red card" : event.card === "yellow" ? "Yellow card" : "Foul";
  if (event.type === "freekick") return "Free kick";
  if (event.type === "corner") return "Corner";
  return `${event.minute}'`;
}

function captionOf(frame: EngineFrame) {
  const { event } = frame;
  return event.type === "goal" ||
    event.type === "ht" ||
    event.type === "ft" ||
    event.type === "restart" ||
    event.type === "foul"
    ? event.caption
    : frame.head.caption;
}

function MatchPitchView({ home, away, scorers, youId, onReveal, onClock, onComplete }: Props) {
  const tapeKey = [
    home.id,
    away.id,
    home.formationId,
    away.formationId,
    home.xi.map((player) => player.id).join("|"),
    away.xi.map((player) => player.id).join("|"),
    kitKey(home.kit),
    kitKey(away.kit),
    scorers.map((goal) => `${goal.minute}:${goal.name}:${goal.slot}`).join("|"),
  ].join("::");
  const tape = useMemo(
    () => buildMatchTape(home, away, scorers),
    // Tape must stay frozen while the scoreboard ticks, or the clip restarts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tapeKey],
  );
  const [frame, setFrame] = useState<Frame>(() => ({ caption: "Kick off", minute: 0, done: false }));
  const ballRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const attackRef = useRef<HTMLSpanElement>(null);
  const leftNameRef = useRef<HTMLDivElement>(null);
  const rightNameRef = useRef<HTMLDivElement>(null);
  const playerRefs = useRef(new Map<string, HTMLDivElement>());
  const cardRef = useRef<HTMLDivElement>(null);
  const onRevealRef = useRef(onReveal);
  const onClockRef = useRef(onClock);
  const onCompleteRef = useRef(onComplete);
  const skipRef = useRef(false);
  const doneRef = useRef(false);
  const goalsRef = useRef(0);
  const muted = useSyncExternalStore(subscribeMatchSfxMuted, isMatchSfxMuted, () => false);
  const soundOn = !muted;
  const sidesRef = useRef({ home: home.name, away: away.name, homeInk: "", awayInk: "" });
  const kitsRef = useRef({ home: home.kit, away: away.kit });

  useEffect(() => {
    onRevealRef.current = onReveal;
    onClockRef.current = onClock;
    onCompleteRef.current = onComplete;
  }, [onReveal, onClock, onComplete]);

  useEffect(() => {
    sidesRef.current = {
      home: home.name,
      away: away.name,
      homeInk: kitStyle(home.kit, DEFAULT_HOME_KIT).label,
      awayInk: kitStyle(away.kit, DEFAULT_AWAY_KIT).label,
    };
    kitsRef.current = { home: home.kit, away: away.kit };
  }, [home.name, home.kit, away.name, away.kit]);

  useEffect(() => {
    armMatchSfx();
  }, []);

  useEffect(() => {
    const { events, dots } = tape;
    if (events.length === 0) return;
    skipRef.current = false;
    doneRef.current = false;
    goalsRef.current = 0;
    const engine = createMatchEngine(tape, home.id);
    let last = performance.now();
    let raf = 0;
    let finished = false;
    let lastUi = "";
    let lastClock = "";
    let lastSfx = -1;
    let lastHalf: boolean | null = null;

    const paint = (f: EngineFrame) => {
      for (const dot of dots) {
        const node = playerRefs.current.get(dot.id);
        const at = engine.position(dot.id);
        if (!node || !at) continue;
        const sentOff = f.sentOff.has(dot.name);
        const booked = f.booked.has(dot.name) && !sentOff;
        const lifted = !sentOff && (dot.id === f.ownerId || dot.id === f.receiverId);
        const toLine = Math.min(at.y, 100 - at.y);
        const shirt = kitVars(
          dot.team === "home" ? (kitsRef.current.home ?? dot.kit) : (kitsRef.current.away ?? dot.kit),
          dot.team === "home" ? DEFAULT_HOME_KIT : DEFAULT_AWAY_KIT,
        );
        node.style.backgroundColor = shirt.backgroundColor;
        node.style.backgroundImage = shirt.backgroundImage;
        node.style.color = shirt.color;
        node.style.left = `${at.x}%`;
        node.style.top = `${at.y}%`;
        node.style.opacity = sentOff ? `${Math.min(0.45, Math.max(0, (toLine - 1) / 10))}` : "1";
        node.style.visibility = f.gone.has(dot.id) ? "hidden" : "";
        node.style.boxShadow = sentOff
          ? "0 0 0 2px #111, 0 0 0 4px #dc2626"
          : booked
            ? "0 0 0 2px #111, 0 0 0 4px #facc15"
            : "";
        node.style.transform = lifted ? "translate(-50%, -50%) scale(1.14)" : "translate(-50%, -50%)";
        node.classList.toggle("ring-2", Boolean(dot.isGk || booked || sentOff));
        node.classList.toggle("ring-yellow-300", booked);
        node.classList.toggle("ring-red-500", sentOff);
        node.classList.toggle("ring-white/80", Boolean(dot.isGk) && !booked && !sentOff);
      }
      if (ballRef.current) {
        ballRef.current.style.left = `${f.ball.x}%`;
        ballRef.current.style.top = `${f.ball.y}%`;
        ballRef.current.style.opacity = `${f.ballOpacity}`;
        ballRef.current.style.transform = `translate(-50%, -50%) scale(${1 + f.ballAir * 0.75})`;
      }
      if (cardRef.current) {
        cardRef.current.style.opacity = f.card ? "1" : "0";
        if (f.card) {
          cardRef.current.style.left = `${f.card.at.x + 2.4}%`;
          cardRef.current.style.top = `${f.card.at.y - 7}%`;
          cardRef.current.style.background = f.card.red ? "#dc2626" : "#facc15";
        }
      }
      if (f.secondHalf !== lastHalf) {
        lastHalf = f.secondHalf;
        if (attackRef.current) {
          attackRef.current.textContent = f.secondHalf ? "Home attacks left" : "Home attacks right";
        }
        const sides = sidesRef.current;
        if (leftNameRef.current && rightNameRef.current) {
          leftNameRef.current.textContent = f.secondHalf ? sides.away : sides.home;
          rightNameRef.current.textContent = f.secondHalf ? sides.home : sides.away;
          leftNameRef.current.style.color = f.secondHalf ? sides.awayInk : sides.homeInk;
          rightNameRef.current.style.color = f.secondHalf ? sides.homeInk : sides.awayInk;
        }
      }
    };

    const finish = () => {
      finished = true;
      setFrame({ caption: "Full time", minute: 90, done: true });
      onClockRef.current?.("Full time");
      onCompleteRef.current?.();
    };

    const tick = (now: number) => {
      if (finished || doneRef.current) return;
      const dt = Math.min(48, now - last);
      last = now;
      if (skipRef.current) {
        onRevealRef.current?.(events.filter((event) => event.type === "goal").length);
        finish();
        return;
      }
      const f = engine.step(dt);
      const { event } = f;
      if (f.eventIndex !== lastSfx) {
        lastSfx = f.eventIndex;
        playMatchSfx(event.type);
      }
      paint(f);

      if (event.type === "goal" && f.t >= 0.22) {
        const count = events.slice(0, f.eventIndex + 1).filter((item) => item.type === "goal").length;
        if (count > goalsRef.current) {
          goalsRef.current = count;
          onRevealRef.current?.(count);
        }
      }

      const flash = event.type === "goal" && f.t < 0.5;
      const shown = captionOf(f);
      const ui = `${f.eventIndex}:${shown}:${flash ? 1 : 0}`;
      if (ui !== lastUi) {
        lastUi = ui;
        if (captionRef.current) captionRef.current.textContent = `${event.minute}' · ${shown}`;
        flashRef.current?.classList.toggle("opacity-25", flash);
        flashRef.current?.classList.toggle("opacity-0", !flash);
      }
      const label = clockLabel(event);
      if (label !== lastClock) {
        lastClock = label;
        onClockRef.current?.(label);
      }

      if (f.done) {
        finish();
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };

    paint(engine.step(0));
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      stopMatchSfx();
    };
  }, [tape, home.id]);

  const skip = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    skipRef.current = true;
    stopMatchSfx();
    onRevealRef.current?.(scorers.length);
    onClockRef.current?.("Full time");
    onCompleteRef.current?.();
    setFrame({ caption: "Full time", minute: 90, done: true });
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
        <div
          ref={cardRef}
          className="pointer-events-none absolute z-30 h-6 w-4 rounded-[2px] opacity-0 shadow-md transition-opacity duration-150"
        />

        {tape.dots.map((dot) => {
          const yours = (dot.team === "home" ? home.id : away.id) === youId;
          const kit = dot.team === "home" ? (home.kit ?? dot.kit) : (away.kit ?? dot.kit);
          const fallback = dot.team === "home" ? DEFAULT_HOME_KIT : DEFAULT_AWAY_KIT;
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
              className={`absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[9px] font-black tracking-wide shadow-md sm:h-8 sm:w-8 sm:text-[10px] ${kitPatternClass(kit ?? fallback)} ${dot.isGk ? "ring-2 ring-white/80" : ""} ${yours ? "outline outline-2 outline-offset-1 outline-white/50" : ""}`}
              style={kitVars(kit, fallback)}
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
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => setMatchSfxMuted(soundOn)}
            className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/80 hover:text-white"
            aria-pressed={soundOn}
          >
            {soundOn ? "Sound" : "Muted"}
          </button>
        </div>
        <span>Three-letter names</span>
      </div>
    </div>
  );
}

export const MatchPitch = memo(MatchPitchView);
