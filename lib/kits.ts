export type KitPatternId = "solid" | "stripes" | "hoops" | "sash" | "halves";
export type KitColorId =
  | "amber"
  | "sky"
  | "red"
  | "navy"
  | "white"
  | "black"
  | "green"
  | "claret"
  | "orange"
  | "blue";

export type KitChoice = {
  color: KitColorId;
  secondary: KitColorId;
  pattern: KitPatternId;
};

export type KitSwatch = {
  id: KitColorId;
  name: string;
  hex: string;
  label: string;
};

export type KitStyle = {
  primary: string;
  secondary: string;
  text: string;
  label: string;
  name: string;
};

export const KIT_PATTERNS: { id: KitPatternId; name: string }[] = [
  { id: "solid", name: "Plain" },
  { id: "stripes", name: "Stripes" },
  { id: "hoops", name: "Hoops" },
  { id: "sash", name: "Sash" },
  { id: "halves", name: "Halves" },
];

export const KIT_COLORS: KitSwatch[] = [
  { id: "amber", name: "Gold", hex: "#fcd34d", label: "#fde68a" },
  { id: "sky", name: "Sky", hex: "#38bdf8", label: "#7dd3fc" },
  { id: "red", name: "Red", hex: "#dc2626", label: "#fca5a5" },
  { id: "navy", name: "Navy", hex: "#1e3a8a", label: "#93c5fd" },
  { id: "white", name: "White", hex: "#f8fafc", label: "#e2e8f0" },
  { id: "black", name: "Black", hex: "#111827", label: "#cbd5e1" },
  { id: "green", name: "Green", hex: "#15803d", label: "#86efac" },
  { id: "claret", name: "Claret", hex: "#7f1d1d", label: "#fbbf24" },
  { id: "orange", name: "Orange", hex: "#ea580c", label: "#fdba74" },
  { id: "blue", name: "Royal", hex: "#2563eb", label: "#93c5fd" },
];

export const DEFAULT_HOME_KIT: KitChoice = { color: "amber", secondary: "black", pattern: "solid" };
export const DEFAULT_AWAY_KIT: KitChoice = { color: "sky", secondary: "navy", pattern: "solid" };

const COLOR_IDS = new Set(KIT_COLORS.map((item) => item.id));
const PATTERN_IDS = new Set(KIT_PATTERNS.map((item) => item.id));
const COLOR_BY_ID = new Map(KIT_COLORS.map((item) => [item.id, item]));

export function isKitColor(value: unknown): value is KitColorId {
  return typeof value === "string" && COLOR_IDS.has(value as KitColorId);
}

export function isKitPattern(value: unknown): value is KitPatternId {
  return typeof value === "string" && PATTERN_IDS.has(value as KitPatternId);
}

function defaultSecondary(color: KitColorId): KitColorId {
  if (color === "white" || color === "sky" || color === "amber") return "navy";
  return "white";
}

export function readKit(value: unknown, fallback: KitChoice = DEFAULT_HOME_KIT): KitChoice {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<KitChoice>;
  const color = isKitColor(raw.color) ? raw.color : fallback.color;
  return {
    color,
    secondary: isKitColor(raw.secondary) ? raw.secondary : defaultSecondary(color),
    pattern: isKitPattern(raw.pattern) ? raw.pattern : fallback.pattern,
  };
}

function inkFor(hex: string) {
  const value = hex.replace("#", "");
  const n = value.length === 3 ? value.split("").map((char) => char + char).join("") : value;
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  const luma = (r * 299 + g * 587 + b * 114) / 1000;
  return luma > 164 ? "#0f172a" : "#f8fafc";
}

export function kitStyle(choice: KitChoice | undefined, fallback: KitChoice = DEFAULT_HOME_KIT): KitStyle {
  const kit = readKit(choice, fallback);
  const main = COLOR_BY_ID.get(kit.color) ?? KIT_COLORS[0]!;
  const trim = COLOR_BY_ID.get(kit.secondary) ?? KIT_COLORS[4]!;
  return {
    primary: main.hex,
    secondary: trim.hex,
    text: inkFor(main.hex),
    label: main.label,
    name: main.name,
  };
}

export function kitPatternClass(choice: KitChoice | undefined): string {
  const pattern = readKit(choice).pattern;
  return pattern === "solid" ? "kit-face" : `kit-face kit-${pattern}`;
}

export function kitVars(choice: KitChoice | undefined, fallback: KitChoice = DEFAULT_HOME_KIT) {
  const style = kitStyle(choice, fallback);
  return {
    backgroundColor: style.primary,
    color: style.text,
    "--kit-a": style.primary,
    "--kit-b": style.secondary,
    "--kit-ink": style.text,
  } as const;
}

export function kitsClash(a: KitChoice, b: KitChoice) {
  return a.color === b.color && a.secondary === b.secondary && a.pattern === b.pattern;
}

export function kitAwayFrom(home: KitChoice): KitChoice {
  if (!kitsClash(home, DEFAULT_AWAY_KIT)) return DEFAULT_AWAY_KIT;
  const fallback: KitChoice = { color: "red", secondary: "white", pattern: "solid" };
  return kitsClash(home, fallback) ? { color: "navy", secondary: "white", pattern: "stripes" } : fallback;
}
