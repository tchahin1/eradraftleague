import { Suspense } from "react";
import { GameApp } from "@/components/GameApp";

export default function Home() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center text-emerald-100/70">Loading…</main>}>
      <GameApp />
    </Suspense>
  );
}
