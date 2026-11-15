"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadDataset } from "@/lib/data";
import {
  applyDraftPlacement,
  clubSeasonKey,
  indexClubSeasons,
  pickRandomOffer,
} from "@/lib/draft";
import { previewMatchFromPlayers } from "@/lib/match-tape";
import { isRoomCode, normalizeRoomCode } from "@/lib/pvp";
import {
  BENCH_SIZE,
  emptyXi,
  FORMATION_BY_ID,
  hasBackupGk,
  isDraftComplete,
  playInSlot,
} from "@/lib/formations";
import { LEAGUE_BY_ID, STARTING_LEAGUE_ID, opponentCount, type LeagueId } from "@/lib/leagues";
import {
  applyPlayerLineup,
  makeHistoricalLeagueTeam,
  makePlayerLeagueTeam,
  nextGameweek,
  pickOpponentClubSeasons,
  playGameweeks,
  seasonLength,
  simulateSeason,
  startSeason,
} from "@/lib/simulate";
import { clearGame, emptyGame, loadGame, peekSavedGame, saveGame } from "@/lib/storage";
import type { FormationId, GameState, PlayerSeason, SimMode } from "@/lib/types";
import { BackButton } from "./BackButton";
import { DraftScreen } from "./DraftScreen";
import { FormationScreen } from "./FormationScreen";
import { HomeHero, LeaguePicker } from "./LeaguePicker";
import { MatchPitch } from "./MatchPitch";
import { PvpApp } from "./PvpApp";
import { SeasonScreen } from "./SeasonScreen";

function BootScreen() {
  return (
    <main className="grid min-h-screen place-items-center" suppressHydrationWarning>
      <p className="animate-pulse text-emerald-100/70" suppressHydrationWarning>
        Loading…
      </p>
    </main>
  );
}

export function GameApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomParam = normalizeRoomCode(searchParams.get("room") ?? "");
  const urlRoom = isRoomCode(roomParam) ? roomParam : null;
  const demoPitch = searchParams.get("demo") === "pitch";
  const [pvpMenu, setPvpMenu] = useState(false);
  const [homeView, setHomeView] = useState<"modes" | "single">("modes");
  const pvp = pvpMenu || Boolean(urlRoom);
  const [players, setPlayers] = useState<PlayerSeason[] | null>(null);
  const [loadedLeagueId, setLoadedLeagueId] = useState<LeagueId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<GameState>(emptyGame);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSeason | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loadingLeague, setLoadingLeague] = useState<LeagueId | null>(null);
  const [savedMeta, setSavedMeta] = useState<ReturnType<typeof peekSavedGame>>(null);
  const [hoveredLeague, setHoveredLeague] = useState<LeagueId | null>(null);
  const [mounted, setMounted] = useState(false);

  const clubSeasons = useMemo(() => (players ? indexClubSeasons(players) : []), [players]);
  const pitchPreview = useMemo(
    () => (demoPitch && players ? previewMatchFromPlayers(players) : null),
    [demoPitch, players],
  );
  const leagueInfo = state.leagueId ? LEAGUE_BY_ID[state.leagueId] : null;
  const previewLeagueId: LeagueId =
    state.phase === "home" && homeView === "modes"
      ? STARTING_LEAGUE_ID
      : state.phase === "home"
        ? (hoveredLeague ?? loadingLeague ?? STARTING_LEAGUE_ID)
        : (state.leagueId ?? loadingLeague ?? STARTING_LEAGUE_ID);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.league = previewLeagueId;
  }, [previewLeagueId]);

  useEffect(() => {
    if (!demoPitch || players) return;
    let cancelled = false;
    loadDataset("epl").then((data) => {
      if (cancelled) return;
      setPlayers(data);
      setLoadedLeagueId("epl");
    });
    return () => {
      cancelled = true;
    };
  }, [demoPitch, players]);

  const ensureLeagueData = async (leagueId: LeagueId) => {
    if (loadedLeagueId === leagueId && players) return players;
    const data = await loadDataset(leagueId);
    setPlayers(data);
    setLoadedLeagueId(leagueId);
    return data;
  };

  useEffect(() => {
    if (demoPitch) {
      setHydrated(true);
      return;
    }
    setSavedMeta(peekSavedGame());
    setHydrated(true);
  }, [demoPitch]);

  useEffect(() => {
    if (!hydrated || pvp) return;
    if (state.phase === "home") return;
    saveGame(state);
    setSavedMeta(peekSavedGame());
  }, [state, hydrated, pvp]);

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

  const chooseLeague = async (leagueId: LeagueId) => {
    setError(null);
    setLoadingLeague(leagueId);
    try {
      await ensureLeagueData(leagueId);
      setSelectedPlayer(null);
      setState({
        ...emptyGame(),
        teamName: state.teamName.trim() || "Your XI",
        leagueId,
        phase: "formation",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that league.");
    } finally {
      setLoadingLeague(null);
    }
  };

  const continueSaved = async () => {
    const saved = peekSavedGame();
    if (!saved) return;
    setError(null);
    setLoadingLeague(saved.leagueId);
    try {
      const data = await ensureLeagueData(saved.leagueId);
      const restored = loadGame(data, saved.leagueId);
      if (restored && restored.phase !== "home") {
        setSelectedPlayer(null);
        setState(restored);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the saved league.");
    } finally {
      setLoadingLeague(null);
    }
  };

  const startDraft = (formationId: FormationId) => {
    const formation = FORMATION_BY_ID[formationId];
    const xi = emptyXi(formation);
    const bench = Array.from({ length: BENCH_SIZE }, () => null);
    const offer = pickRandomOffer(clubSeasons, new Set(), new Set(), formationId, xi, bench);
    setSelectedPlayer(null);
    setState({
      ...emptyGame(),
      phase: "draft",
      leagueId: state.leagueId,
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
    const next = applyDraftPlacement({
      selected: selectedPlayer,
      target,
      formation,
      formationId: state.formationId,
      xi: state.xi,
      bench: state.bench,
      offer: state.offer,
      usedPlayerIds: state.usedPlayerIds,
      usedClubSeasons: state.usedClubSeasons,
      clubSeasons,
    });
    if (!next) return;
    setSelectedPlayer(null);
    setState({
      ...state,
      xi: next.xi,
      bench: next.bench,
      usedPlayerIds: next.usedPlayerIds,
      usedClubSeasons: next.usedClubSeasons,
      offer: next.offer,
    });
  };

  const playerTeamFromLineup = () => {
    if (!state.formationId) return null;
    const formation = FORMATION_BY_ID[state.formationId];
    const xiPlayers = formation.slots
      .map((slot) => {
        const player = state.xi[slot.id];
        return player ? playInSlot(player, slot.kind, formation) : null;
      })
      .filter((player): player is PlayerSeason => Boolean(player));
    if (xiPlayers.length < formation.slots.length) return null;
    const benchPlayers = state.bench.filter((player): player is PlayerSeason => Boolean(player));
    return makePlayerLeagueTeam(state.teamName, xiPlayers, benchPlayers);
  };

  const beginSeason = (mode: SimMode) => {
    if (!state.formationId || !leagueInfo) return;
    const formation = FORMATION_BY_ID[state.formationId];
    if (!isDraftComplete(formation, state.xi, state.bench) || !hasBackupGk(state.bench)) return;
    const playerTeam = playerTeamFromLineup();
    if (!playerTeam) return;
    const opponents = pickOpponentClubSeasons(clubSeasons, opponentCount(leagueInfo)).map(
      makeHistoricalLeagueTeam,
    );
    const league =
      mode === "quick" ? simulateSeason(playerTeam, opponents) : startSeason(playerTeam, opponents);
    setState({ ...state, phase: "season", league });
  };

  const playNextGameweek = () => {
    if (!state.league) return;
    const gameweek = nextGameweek(state.league);
    if (!gameweek) return;
    const playerTeam = playerTeamFromLineup();
    const league = playerTeam ? applyPlayerLineup(state.league, playerTeam) : state.league;
    setState({ ...state, league: playGameweeks(league, gameweek) });
  };

  const quickSimRest = () => {
    if (!state.league) return;
    const playerTeam = playerTeamFromLineup();
    const league = playerTeam ? applyPlayerLineup(state.league, playerTeam) : state.league;
    setState({ ...state, league: playGameweeks(league, seasonLength(league)) });
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

  const reset = (view: "modes" | "single" = "modes") => {
    clearGame();
    setSelectedPlayer(null);
    setSavedMeta(null);
    setPvpMenu(false);
    setHomeView(view);
    setState({ ...emptyGame(), teamName: state.teamName || "Your XI" });
  };

  if (!mounted) return <BootScreen />;

  if (pvp) {
    return (
      <PvpApp
        initialRoom={urlRoom}
        onLeave={() => {
          setPvpMenu(false);
          setHomeView("modes");
          router.replace("/", { scroll: false });
        }}
      />
    );
  }

  if (demoPitch) {
    if (!players || !pitchPreview) return <BootScreen />;
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Preview</p>
        <h1 className="mt-2 text-4xl font-black text-white">2D match tape</h1>
        <p className="mt-2 max-w-xl text-emerald-100/75">
          Same clip season and PvP will play after kickoff. Skip jumps to full time.
        </p>
        <MatchPitch home={pitchPreview.home} away={pitchPreview.away} scorers={pitchPreview.scorers} youId="home" />
      </main>
    );
  }

  if (!hydrated) {
    const pendingId = loadingLeague ?? savedMeta?.leagueId;
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="animate-pulse text-emerald-100/70">
          {pendingId ? `Loading ${LEAGUE_BY_ID[pendingId].name} eras…` : "Loading…"}
        </p>
      </main>
    );
  }

  if (state.phase === "home") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-6 px-6 py-16">
        {homeView === "single" ? (
          <BackButton
            onClick={() => {
              setHoveredLeague(null);
              setHomeView("modes");
            }}
          />
        ) : null}
        <HomeHero error={error} />
        {homeView === "modes" ? (
          <div className="flex flex-col gap-3">
            <div className="grid w-full max-w-xl grid-cols-2 gap-3">
              <button
                type="button"
                disabled={Boolean(loadingLeague)}
                onClick={() => setHomeView("single")}
                className="rounded-2xl bg-amber-300 px-4 py-4 text-sm font-black uppercase tracking-widest text-emerald-950 sm:px-6 sm:text-base"
              >
                Single player mode
              </button>
              <button
                type="button"
                disabled={Boolean(loadingLeague)}
                onClick={() => setPvpMenu(true)}
                className="rounded-2xl bg-white/10 px-4 py-4 text-sm font-black uppercase tracking-widest text-white sm:px-6 sm:text-base"
              >
                PvP mode
              </button>
            </div>
            {savedMeta ? (
              <button
                type="button"
                disabled={Boolean(loadingLeague)}
                onClick={continueSaved}
                className="w-fit rounded-2xl bg-white/10 px-6 py-3 font-semibold text-white"
              >
                Continue {LEAGUE_BY_ID[savedMeta.leagueId].name}
              </button>
            ) : null}
          </div>
        ) : (
          <LeaguePicker
            hoveredLeague={hoveredLeague}
            loadingLeague={loadingLeague}
            onHover={setHoveredLeague}
            onChoose={chooseLeague}
          />
        )}
      </main>
    );
  }

  if (state.phase === "formation" && leagueInfo) {
    return (
      <main>
        <FormationScreen
          teamName={state.teamName}
          leagueName={leagueInfo.name}
          placeholder="Your XI"
          onTeamName={(teamName) => setState((current) => ({ ...current, teamName }))}
          onChoose={startDraft}
          onBack={() => reset("single")}
        />
      </main>
    );
  }

  if (state.phase === "draft" && state.formationId && state.offer && leagueInfo) {
    return (
      <main>
        <DraftScreen
          teamName={state.teamName}
          leagueName={leagueInfo.name}
          gameweeks={leagueInfo.gameweeks}
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
          onStartSeason={beginSeason}
        />
      </main>
    );
  }

  if (state.phase === "season" && state.league && leagueInfo) {
    return (
      <main>
        <SeasonScreen
          teamName={state.teamName}
          leagueName={leagueInfo.name}
          league={state.league}
          formationId={state.formationId}
          xi={state.xi}
          bench={state.bench}
          onNewGame={() => reset()}
          onPlayNext={playNextGameweek}
          onQuickSimRest={quickSimRest}
          onLineupChange={(xi, bench) => setState({ ...state, xi, bench })}
        />
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center">
      <button type="button" onClick={() => reset()} className="text-amber-300">
        Something got stuck — start over
      </button>
    </main>
  );
}
