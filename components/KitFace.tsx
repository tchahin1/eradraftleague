import type { ReactNode } from "react";
import { readKit, kitStyle, type KitChoice } from "@/lib/kits";

type Props = {
  kit?: KitChoice;
  fallback?: KitChoice;
  className?: string;
  title?: string;
  children?: ReactNode;
};

function PatternSvg({
  pattern,
  primary,
  secondary,
}: {
  pattern: KitChoice["pattern"];
  primary: string;
  secondary: string;
}) {
  if (pattern === "solid") return null;

  if (pattern === "stripes") {
    return (
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 10 10" preserveAspectRatio="none">
        <rect width="10" height="10" fill={primary} />
        <rect x="2" width="2" height="10" fill={secondary} />
        <rect x="6" width="2" height="10" fill={secondary} />
      </svg>
    );
  }

  if (pattern === "hoops") {
    return (
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 10 10" preserveAspectRatio="none">
        <rect width="10" height="10" fill={primary} />
        <rect y="2" width="10" height="2" fill={secondary} />
        <rect y="6" width="10" height="2" fill={secondary} />
      </svg>
    );
  }

  if (pattern === "halves") {
    return (
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 10 10" preserveAspectRatio="none">
        <rect width="5" height="10" fill={primary} />
        <rect x="5" width="5" height="10" fill={secondary} />
      </svg>
    );
  }

  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 10 10" preserveAspectRatio="none">
      <rect width="10" height="10" fill={primary} />
      <polygon points="3,0 7,0 10,10 6,10" fill={secondary} />
    </svg>
  );
}

/** Shirt swatch drawn with SVG so patterns survive match animation. */
export function KitFace({ kit, fallback, className = "", title, children }: Props) {
  const choice = readKit(kit, fallback);
  const style = kitStyle(choice, fallback);
  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ backgroundColor: style.primary, color: style.text }}
      title={title}
      data-kit={`${choice.color}.${choice.secondary}.${choice.pattern}`}
    >
      <PatternSvg pattern={choice.pattern} primary={style.primary} secondary={style.secondary} />
      <span className="relative z-10">{children}</span>
    </span>
  );
}
