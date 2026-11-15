import type { MatchEventType } from "./match-tape";

const MUTE_KEY = "era-draft-sfx-muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let armed = false;
let cheerBuf: AudioBuffer | null = null;
let cheerWait: Promise<AudioBuffer | null> | null = null;
const live = new Set<AudioScheduledSourceNode>();
const CHEER_SRC = "/sfx/goal-cheer.mp3";

function readMuted() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUTE_KEY) === "1";
}

muted = readMuted();

function getCtx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  void loadCheer(ctx);
  return ctx;
}

function loadCheer(audio: AudioContext) {
  if (cheerBuf) return Promise.resolve(cheerBuf);
  if (!cheerWait) {
    cheerWait = fetch(CHEER_SRC)
      .then((res) => {
        if (!res.ok) throw new Error("cheer missing");
        return res.arrayBuffer();
      })
      .then((bytes) => audio.decodeAudioData(bytes.slice(0)))
      .then((buf) => {
        cheerBuf = buf;
        return buf;
      })
      .catch(() => {
        cheerWait = null;
        return null;
      });
  }
  return cheerWait;
}

function track(node: AudioScheduledSourceNode) {
  live.add(node);
  node.onended = () => live.delete(node);
}

export function armMatchSfx() {
  if (typeof window === "undefined" || armed) return;
  armed = true;
  muted = readMuted();
  const unlock = () => {
    getCtx();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function isMatchSfxMuted() {
  return muted;
}

export function setMatchSfxMuted(next: boolean) {
  muted = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  }
  const audio = getCtx();
  if (audio && master) {
    master.gain.cancelScheduledValues(audio.currentTime);
    master.gain.setValueAtTime(next ? 0 : 0.55, audio.currentTime);
  }
  if (next) stopMatchSfx();
}

export function stopMatchSfx() {
  for (const node of live) {
    try {
      node.stop();
    } catch {
      /* already stopped */
    }
  }
  live.clear();
}

function whistle(audio: AudioContext, out: AudioNode, when: number, duration: number, freq: number, gain = 0.22) {
  const a = audio.createOscillator();
  const b = audio.createOscillator();
  const amp = audio.createGain();
  const filter = audio.createBiquadFilter();
  a.type = "sine";
  b.type = "triangle";
  a.frequency.value = freq;
  b.frequency.value = freq * 1.045;
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 7;
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(gain, when + 0.012);
  amp.gain.exponentialRampToValueAtTime(gain * 0.7, when + duration * 0.45);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  a.connect(filter);
  b.connect(filter);
  filter.connect(amp);
  amp.connect(out);
  a.start(when);
  b.start(when);
  a.stop(when + duration + 0.02);
  b.stop(when + duration + 0.02);
  track(a);
  track(b);
}

function tweets(count: number, freq: number, gap: number, duration: number) {
  const audio = getCtx();
  if (!audio || !master || muted) return;
  const now = audio.currentTime + 0.02;
  for (let i = 0; i < count; i += 1) whistle(audio, master, now + i * gap, duration, freq);
}

function playCheerBuffer(audio: AudioContext, buffer: AudioBuffer) {
  if (!master || muted) return;
  const src = audio.createBufferSource();
  const amp = audio.createGain();
  const now = audio.currentTime;
  src.buffer = buffer;
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(0.9, now + 0.03);
  const fade = now + Math.min(1.85, Math.max(1.1, buffer.duration - 0.45));
  amp.gain.setValueAtTime(0.9, fade);
  amp.gain.exponentialRampToValueAtTime(0.0001, fade + 0.45);
  src.connect(amp);
  amp.connect(master);
  src.start(now);
  src.stop(fade + 0.5);
  track(src);
}

function cheer() {
  const audio = getCtx();
  if (!audio || !master || muted) return;
  if (cheerBuf) {
    playCheerBuffer(audio, cheerBuf);
    return;
  }
  void loadCheer(audio).then((buf) => {
    if (buf && !muted) playCheerBuffer(audio, buf);
  });
}

export function playMatchSfx(type: MatchEventType) {
  armMatchSfx();
  const audio = getCtx();
  if (
    typeof document !== "undefined" &&
    (type === "kickoff" ||
      type === "restart" ||
      type === "ht" ||
      type === "ft" ||
      type === "foul" ||
      type === "corner" ||
      type === "freekick" ||
      type === "goal")
  ) {
    document.documentElement.dataset.matchSfx = type;
  }
  if (!audio || muted || audio.state === "suspended") return;
  switch (type) {
    case "kickoff":
    case "restart":
      tweets(1, 3180, 0, 0.2);
      return;
    case "ht":
      tweets(2, 3050, 0.22, 0.16);
      return;
    case "ft":
      tweets(3, 2980, 0.2, 0.14);
      return;
    case "foul":
      tweets(1, 3400, 0, 0.15);
      return;
    case "corner":
      tweets(1, 3120, 0, 0.16);
      return;
    case "freekick":
      tweets(1, 3260, 0, 0.14);
      return;
    case "goal":
      cheer();
      return;
    default:
  }
}
