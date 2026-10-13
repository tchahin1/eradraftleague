"use client";

import { useEffect, useMemo, useState } from "react";
import { loadDataset } from "@/lib/data";
import {
  clubSeasonKey,
  indexClubSeasons,
  pickRandomOffer,
  playerCanBePicked,
} from "@/lib/draft";
import {
  BENCH_SIZE,
  emptyXi,
  FORMATION_BY_ID,
  hasBackupGk,
  isDraftComplete,
  playerFitsSlot,
} from "@/lib/formations";
import {
  makeHistoricalLeagueTeam,
  makePlayerLeagueTeam,
  pickOpponentClubSeasons,
  simulateSeason,
} from "@/lib/simulate";
import { clearGame, emptyGame, loadGame, saveGame } from "@/lib/storage";
import type { FormationId, GameState, PlayerSeason } from "@/lib/types";
import { DraftScreen } from "./DraftScreen";
import { FormationScreen } from "./FormationScreen";
import { SeasonScreen } from "./SeasonScreen";

export function GameApp() {
  const [players, setPlayers] = useState<PlayerSeason[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<GameState>(emptyGame);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSeason | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const clubSeasons = useMemo(() => (players ? indexClubSeasons(players) : []), [players]);

  useEffect(() => {
    loadDataset()
      .then((data) => {
        setPlayers(data);
        const saved = loadGame(data);
        if (saved && saved.phase !== "home") setState(saved);
        setHydrated(true);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveGame(state);
  }, [state, hydrated]);

  useEffect(() => {
    if (!hydrated || state.phase !== "draft" || state.offer || !state.formationId) return;
    const offer = pickRandomOffer(
      clubSeasons,
      new Set(state.usedClubSeasons),
      new Set(state.usedPlayerIds),
      state.formationId,
      state.xi,
      state.bench,
    );
    if (offer) setState((current) => ({ ...current, offer }));
  }, [hydrated, state.phase, state.offer, state.formationId, state.usedClubSeasons, state.usedPlayerIds, state.xi, state.bench, clubSeasons]);

  const startDraft = (formationId: FormationId) => {
    const formation = FORMATION_BY_ID[formationId];
    const xi = emptyXi(formation);
    const bench = Array.from({ length: BENCH_SIZE }, () => null);
    const offer = pickRandomOffer(clubSeasons, new Set(), new Set(), formationId, xi, bench);
    setSelectedPlayer(null);
    setState({
      ...emptyGame(),
      phase: "draft",
      teamName: state.teamName.trim() || "Your XI",
      formationId,
      xi,
      bench,
      offer,
    });
  };

  const placePick = (target: { type: "xi"; slotId: string } | { type: "bench"; index: number }) => {
    if (!state.offer || !state.formationId || !selectedPlayer) return;
    const formation = FORMATION_BY_ID[state.formationId];
    const nextXi = { ...state.xi };
    const nextBench = [...state.bench];
    const alreadyDrafted =
      Object.values(nextXi).some((player) => player?.id === selectedPlayer.id) ||
      nextBench.some((player) => player?.id === selectedPlayer.id);

    if (alreadyDrafted) {
      if (target.type === "xi") {
        const slot = formation.slots.find((item) => item.id === target.slotId);
        if (!slot || !playerFitsSlot(selectedPlayer, slot.kind)) return;
        const occupant = nextXi[target.slotId];
        const fromBench = nextBench.findIndex((player) => player?.id === selectedPlayer.id);
        if (fromBench >= 0) {
          nextBench[fromBench] = occupant;
          nextXi[target.slotId] = selectedPlayer;
        } else {
          const fromSlot = Object.entries(nextXi).find(([, player]) => player?.id === selectedPlayer.id)?.[0];
          if (!fromSlot || fromSlot === target.slotId) return;
          if (occupant && !playerFitsSlot(occupant, formation.slots.find((item) => item.id === fromSlot)!.kind)) return;
          nextXi[fromSlot] = occupant;
          nextXi[target.slotId] = selectedPlayer;
        }
      } else {
        if (nextBench[target.index]?.id === selectedPlayer.id) return;
        const occupant = nextBench[target.index];
        const fromSlot = Object.entries(nextXi).find(([, player]) => player?.id === selectedPlayer.id)?.[0];
        const fromBench = nextBench.findIndex((player) => player?.id === selectedPlayer.id);
        if (fromSlot) {
          if (occupant && !playerFitsSlot(occupant, formation.slots.find((item) => item.id === fromSlot)!.kind)) return;
          nextXi[fromSlot] = occupant;
          nextBench[target.index] = selectedPlayer;
        } else if (fromBench >= 0) {
          nextBench[fromBench] = occupant;
          nextBench[target.index] = selectedPlayer;
        }
      }
      setSelectedPlayer(null);
      setState({ ...state, xi: nextXi, bench: nextBench });
      return;
    }

    if (!playerCanBePicked(selectedPlayer, formation, state.xi, state.bench)) return;

    if (target.type === "xi") {
      const slot = formation.slots.find((item) => item.id === target.slotId);
      if (!slot || !playerFitsSlot(selectedPlayer, slot.kind)) return;
      if (nextXi[target.slotId]) return;
      nextXi[target.slotId] = selectedPlayer;
    } else if (nextBench[target.index]) {
      if (selectedPlayer.group !== "GK" || nextBench.some((player) => player?.group === "GK")) return;
      nextBench[target.index] = selectedPlayer;
    } else {
      nextBench[target.index] = selectedPlayer;
    }

    const usedPlayerIds = [...state.usedPlayerIds, selectedPlayer.playerId];
    const usedClubSeasons = [
      ...state.usedClubSeasons,
      clubSeasonKey(state.offer.clubKey, state.offer.season),
    ];
    const complete = isDraftComplete(formation, nextXi, nextBench);
    const offer = complete
      ? state.offer
      : pickRandomOffer(
          clubSeasons,
          new Set(usedClubSeasons),
          new Set(usedPlayerIds),
          state.formationId,
          nextXi,
          nextBench,
        );

    setSelectedPlayer(null);
    setState({
      ...state,
      xi: nextXi,
      bench: nextBench,
      usedPlayerIds,
      usedClubSeasons,
      offer,
    });
  };

  const startSeason = () => {
    if (!state.formationId) return;
    const formation = FORMATION_BY_ID[state.formationId];
    const xiPlayers = formation.slots.map((slot) => state.xi[slot.id]).filter((p): p is PlayerSeason => Boolean(p));
    const benchPlayers = state.bench.filter((p): p is PlayerSeason => Boolean(p));
    if (!isDraftComplete(formation, state.xi, state.bench) || !hasBackupGk(state.bench)) return;

    const playerTeam = makePlayerLeagueTeam(state.teamName, xiPlayers, benchPlayers);
    const opponents = pickOpponentClubSeasons(clubSeasons, 19).map(makeHistoricalLeagueTeam);
    const league = simulateSeason(playerTeam, opponents);
    setState({ ...state, phase: "season", league });
  };

  const rerollOffer = () => {
    if (!state.offer || !state.formationId || state.rerollsLeft <= 0) return;
    const used = new Set(state.usedClubSeasons);
    used.add(clubSeasonKey(state.offer.clubKey, state.offer.season));
    const offer = pickRandomOffer(
      clubSeasons,
      used,
      new Set(state.usedPlayerIds),
      state.formationId,
      state.xi,
      state.bench,
    );
    if (!offer) return;
    setSelectedPlayer(null);
    setState({
      ...state,
      rerollsLeft: state.rerollsLeft - 1,
      usedClubSeasons: [...used],
      offer,
    });
  };

  const reset = () => {
    clearGame();
    setSelectedPlayer(null);
    setState({ ...emptyGame(), teamName: state.teamName || "Your XI" });
  };

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-black text-white">Database missing</h1>
          <p className="mt-3 max-w-md text-emerald-100/70">{error}</p>
        </div>
      </main>
    );
  }

  if (!players || !hydrated) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="animate-pulse text-emerald-100/70">Loading Premier League eras…</p>
      </main>
    );
  }

  if (state.phase === "home") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Premier League 2000–2026</p>
        <h1 className="text-5xl font-black tracking-tight text-white md:text-6xl">Era Draft League</h1>
        <p className="max-w-xl text-lg leading-8 text-emerald-100/80">
          Get a random club from a random Premier League season. Pick one player. Repeat until you have a custom XI and bench, then see if that side can win a fictional 38-game title race against other frozen eras.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setState({ ...state, phase: "formation" })}
            className="rounded-2xl bg-amber-300 px-6 py-3 font-black uppercase tracking-widest text-emerald-950"
          >
            Start draft
          </button>
          {loadGame(players)?.phase === "draft" || loadGame(players)?.phase === "season" ? (
            <button
              type="button"
              onClick={() => {
                const saved = loadGame(players);
                if (saved) setState(saved);
              }}
              className="rounded-2xl bg-white/10 px-6 py-3 font-semibold text-white"
            >
              Continue
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  if (state.phase === "formation") {
    return (
      <main>
        <FormationScreen
          teamName={state.teamName}
          onTeamName={(teamName) => setState({ ...state, teamName })}
          onChoose={startDraft}
        />
      </main>
    );
  }

  if (state.phase === "draft" && state.formationId && state.offer) {
    return (
      <main>
        <DraftScreen
          teamName={state.teamName}
          formationId={state.formationId}
          xi={state.xi}
          bench={state.bench}
          offer={state.offer}
          selectedPlayer={selectedPlayer}
          rerollsLeft={state.rerollsLeft}
          onReroll={rerollOffer}
          onSelectPlayer={setSelectedPlayer}
          onPlace={(target) => {
            if (!selectedPlayer) {
              const occupant =
                target.type === "xi" ? state.xi[target.slotId] : state.bench[target.index];
              if (occupant) setSelectedPlayer(occupant);
              return;
            }
            placePick(target);
          }}
          onStartSeason={startSeason}
        />
      </main>
    );
  }

  if (state.phase === "season" && state.league) {
    return (
      <main>
        <SeasonScreen teamName={state.teamName} league={state.league} onNewGame={reset} />
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center">
      <button type="button" onClick={reset} className="text-amber-300">
        Something got stuck — start over
      </button>
    </main>
  );
}
