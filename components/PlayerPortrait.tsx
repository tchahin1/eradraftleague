"use client";

import { useEffect, useState } from "react";
import { playerInitials } from "@/lib/photos";
import { ratingBadge } from "@/lib/formations";
import type { PlayerSeason } from "@/lib/types";

type Size = "xs" | "sm" | "md";

type Props = {
  player: PlayerSeason;
  size?: Size;
  rating?: number | null;
  className?: string;
};

const SIZE: Record<Size, { box: string; text: string; badge: string }> = {
  xs: { box: "h-8 w-8", text: "text-[9px]", badge: "min-w-4 px-0.5 text-[8px]" },
  sm: { box: "h-10 w-10", text: "text-[11px]", badge: "min-w-5 px-0.5 text-[9px]" },
  md: { box: "h-[3.35rem] w-[3.35rem]", text: "text-xs", badge: "min-w-5 px-1 text-[10px]" },
};

const wikiCache = new Map<string, string | null>();

async function wikiThumb(name: string): Promise<string | null> {
  if (wikiCache.has(name)) return wikiCache.get(name) ?? null;
  if (name.trim().split(/\s+/).length < 2) {
    wikiCache.set(name, null);
    return null;
  }
  try {
    const title = encodeURIComponent(name.trim().replace(/\s+/g, "_"));
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`);
    if (!response.ok) {
      wikiCache.set(name, null);
      return null;
    }
    const data = (await response.json()) as { type?: string; thumbnail?: { source?: string } };
    const source = data.type === "standard" ? data.thumbnail?.source : undefined;
    const url = source ? source.split("?")[0] : null;
    wikiCache.set(name, url);
    return url;
  } catch {
    wikiCache.set(name, null);
    return null;
  }
}

export function OverallBadge({
  overall,
  size = "md",
}: {
  overall: number;
  size?: "sm" | "md";
}) {
  const box = size === "md" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";
  return (
    <span
      className={`grid ${box} shrink-0 place-items-center rounded-xl font-black tabular-nums shadow-sm ${ratingBadge(overall)}`}
    >
      {overall}
    </span>
  );
}

export function PlayerPortrait({ player, size = "sm", rating, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const [wikiUrl, setWikiUrl] = useState<string | null>(() => wikiCache.get(player.name) ?? null);
  const src = (!failed && player.photoUrl) || wikiUrl || undefined;
  const scale = SIZE[size];

  useEffect(() => {
    setFailed(false);
    setWikiUrl(wikiCache.get(player.name) ?? null);
  }, [player.id, player.photoUrl, player.name]);

  useEffect(() => {
    if ((!failed && player.photoUrl) || wikiCache.has(player.name)) return;
    let cancelled = false;
    void wikiThumb(player.name).then((url) => {
      if (!cancelled && url) setWikiUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [player.name, player.photoUrl, failed]);

  return (
    <span className={`relative inline-grid shrink-0 place-items-center ${rating != null ? "mb-1" : ""} ${className}`}>
      <span
        className={`grid ${scale.box} overflow-hidden rounded-full bg-emerald-950 ring-1 ring-white/25 ${scale.text} font-black text-amber-100`}
      >
        {src ? (
          // Portraits are remote TM/FPL/Wiki URLs; native img keeps onError fallback simple.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            width={64}
            height={64}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover object-top"
            onError={() => {
              if (src === player.photoUrl) setFailed(true);
              else setWikiUrl(null);
            }}
          />
        ) : (
          <span className="grid h-full w-full place-items-center bg-linear-to-br from-emerald-800 to-emerald-950">
            {playerInitials(player.name)}
          </span>
        )}
      </span>
      {rating != null ? (
        <span
          className={`absolute -bottom-0.5 -right-1 rounded-md font-black leading-none ${scale.badge} ${ratingBadge(rating)}`}
        >
          {rating}
        </span>
      ) : null}
    </span>
  );
}
