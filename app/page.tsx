import { Suspense } from "react";
import type { Metadata } from "next";
import { GameApp } from "@/components/GameApp";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    description: SITE_DESCRIPTION,
  },
};

export default function Home() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center text-emerald-100/70">Loading…</main>}>
      <GameApp />
    </Suspense>
  );
}
