"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { autoDraftSquad, randomAiName } from "@/lib/ai-draft";
import { applyDraftPlacement, indexClubSeasons, pickRandomOffer, playerCanBePicked } from "@/lib/draft";
import { loadDataset } from "@/lib/data";
import {
  BENCH_SIZE,
  countFilled,
  emptyXi,
  FORMATION_BY_ID,
} from "@/lib/formations";
import { LEAGUE_BY_ID, STARTING_LEAGUE_ID, type LeagueId } from "@/lib/leagues";
import {
  makePvpSimTeam,
  serializeSquad,
  SQUAD_SIZE,
  type PvpMatch,
} from "@/lib/pvp";
import { DEFAULT_HOME_KIT, kitAwayFrom, type KitChoice } from "@/lib/kits";
import { simulateMatch } from "@/lib/simulate";
import type { FormationId, PlayerSeason } from "@/lib/types";
import { BackButton } from "./BackButton";
import { DraftScreen } from "./DraftScreen";
import { FormationScreen } from "./FormationScreen";
import { HomeHero, LeaguePicker } from "./LeaguePicker";
import { KitPicker } from "./KitPicker";
import { PvpMatchScreen } from "./PvpMatchScreen";

const YOU_ID = "you";
const AI_ID = "ai";

type Phase = "menu" | "setup" | "match";

type Props = {
  onLeave: () => void;
};

export function VsAiApp({ onLeave }: Props) {
  const [phase, setPhase] = useState<Phase>("menu");
  const [hoveredLeague, setHoveredLeague] = useState<LeagueId | null>(null);
  const [leagueId, setLeagueId] = useState<LeagueId | null>(null);
  const [players, setPlayers] = useState<PlayerSeason[] | null>(null);
  const [loadedLeagueId, setLoadedLeagueId] = useState<LeagueId | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("Your XI");
  const [kit, setKit] = useState<KitChoice>(DEFAULT_HOME_KIT);
  const kitRef = useRef(kit);
  const [formationId, setFormationId] = useState<FormationId | null>(null);
  const [xi, setXi] = useState<Record<string, PlayerSeason | null>>({});
  const [bench, setBench] = useState<(PlayerSeason | null)[]>([]);
  const [usedPlayerIds, setUsedPlayerIds] = useState<string[]>([]);
  const [usedClubSeasons, setUsedClubSeasons] = useState<string[]>([]);
  const [rerollsLeft, setRerollsLeft] = useState(3);
  const [offer, setOffer] = useState<ReturnType<typeof pickRandomOffer>>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSeason | null>(null);
  const [match, setMatch] = useState<PvpMatch | null>(null);

  const leagueInfo = leagueId ? LEAGUE_BY_ID[leagueId] : null;
  const clubSeasons = useMemo(() => (players ? indexClubSeasons(players) : []), [players]);
  const loadingLeague = Boolean(leagueId && loadedLeagueId !== leagueId);
  const aiKit = kitAwayFrom(kit);
  const chooseKit = (patch: Partial<KitChoice>) => {
    const next = { ...kitRef.current, ...patch };
    kitRef.current = next;
    setKit(next);
  };

  useEffect(() => {
    document.documentElement.dataset.league = leagueId ?? hoveredLeague ?? STARTING_LEAGUE_ID;
  }, [leagueId, hoveredLeague]);

  useEffect(() => {
    if (!leagueId || loadedLeagueId === leagueId) return;
    let cancelled = false;
    loadDataset(leagueId)
      .then((data) => {
        if (cancelled) return;
        setPlayers(data);
        setLoadedLeagueId(leagueId);
      })
      .catch((err: Error) => {
        if (!cancelled) setDataError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, loadedLeagueId]);

  const resetDraft = () => {
    setFormationId(null);
    setXi({});
    setBench([]);
    setUsedPlayerIds([]);
    setUsedClubSeasons([]);
    setRerollsLeft(3);
    setOffer(null);
    setSelectedPlayer(null);
    setMatch(null);
    setError(null);
  };

  const leave = () => {
    resetDraft();
    setLeagueId(null);
    setPhase("menu");
    onLeave();
  };

  const startDraft = (id: FormationId) => {
    const formation = FORMATION_BY_ID[id];
    const nextXi = emptyXi(formation);
    const nextBench = Array.from({ length: BENCH_SIZE }, () => null);
    const nextOffer = pickRandomOffer(clubSeasons, new Set(), new Set(), id, nextXi, nextBench);
    setFormationId(id);
    setXi(nextXi);
    setBench(nextBench);
    setUsedPlayerIds([]);
    setUsedClubSeasons([]);
    setRerollsLeft(3);
    setOffer(nextOffer);
    setSelectedPlayer(null);
  };

  const placePick = (target: { type: "xi"; slotId: string } | { type: "bench"; index: number }) => {
    if (!offer || !formationId || !selectedPlayer) return;
    const formation = FORMATION_BY_ID[formationId];
    const next = applyDraftPlacement({
      selected: selectedPlayer,
      target,
      formation,
      formationId,
      xi,
      bench,
      offer,
      usedPlayerIds,
      usedClubSeasons,
      clubSeasons,
    });
    if (!next) return;
    setSelectedPlayer(null);
    setXi(next.xi);
    setBench(next.bench);
    setUsedPlayerIds(next.usedPlayerIds);
    setUsedClubSeasons(next.usedClubSeasons);
    setOffer(next.offer);
  };

  const rerollOffer = () => {
    if (!offer || !formationId || rerollsLeft <= 0) return;
    const used = new Set(usedClubSeasons);
    used.add(`${offer.clubKey}::${offer.season}`);
    const nextOffer = pickRandomOffer(
      clubSeasons,
      used,
      new Set(usedPlayerIds),
      formationId,
      xi,
      bench,
    );
    if (!nextOffer) return;
    setSelectedPlayer(null);
    setRerollsLeft((left) => left - 1);
    setUsedClubSeasons([...used]);
    setOffer(nextOffer);
  };

  const kickOff = () => {
    if (!formationId) return;
    const youSquad = serializeSquad(teamName, formationId, xi, bench);
    if (!youSquad) {
      setError("Finish your XI and bench first.");
      return;
    }
    const aiSquad = autoDraftSquad(clubSeasons, randomAiName());
    if (!aiSquad) {
      setError("The AI could not build a squad. Try again.");
      return;
    }
    const chosen: KitChoice = { ...kitRef.current };
    const score = simulateMatch(makePvpSimTeam(YOU_ID, youSquad), makePvpSimTeam(AI_ID, aiSquad));
    setError(null);
    setMatch({
      homeId: YOU_ID,
      awayId: AI_ID,
      homeName: youSquad.teamName,
      awayName: aiSquad.teamName,
      homeGoals: score.homeGoals,
      awayGoals: score.awayGoals,
      scorers: score.scorers,
      homeSquad: youSquad,
      awaySquad: aiSquad,
      homeKit: chosen,
      awayKit: kitAwayFrom(chosen),
    });
    setPhase("match");
  };

  if (phase === "menu") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-6 px-6 py-16">
        <BackButton onClick={leave} />
        <HomeHero error={error} />
        <LeaguePicker
          hoveredLeague={hoveredLeague}
          onHover={setHoveredLeague}
          onChoose={(id) => {
            setError(null);
            setLeagueId(id);
            setPhase("setup");
          }}
        />
      </main>
    );
  }

  if (dataError) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-black text-white">Database missing</h1>
          <p className="mt-3 text-rose-200">{dataError}</p>
          <button type="button" onClick={leave} className="mt-6 text-amber-300">
            Back
          </button>
        </div>
      </main>
    );
  }

  if (loadingLeague || !players || !leagueInfo) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="animate-pulse text-emerald-100/70">
          Loading {leagueInfo?.name ?? "league"} eras…
        </p>
      </main>
    );
  }

  if (phase === "match" && match) {
    return (
      <main>
        <PvpMatchScreen
          match={match}
          youId={YOU_ID}
          rematchPending={false}
          opponentRematch={false}
          opponentConnected
          kicker="Player vs AI · one match"
          onRematch={() => {
            resetDraft();
            setPhase("setup");
          }}
          onLeave={leave}
        />
      </main>
    );
  }

  if (!formationId || !offer) {
    return (
      <main>
        <div className="mx-auto max-w-6xl px-4 pt-20">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-emerald-950/40 px-4 py-3">
            <p className="text-sm text-emerald-100/80">
              {leagueInfo.name} · vs <span className="font-semibold text-white">AI</span>
            </p>
          </div>
          <div className="mt-3 rounded-2xl border border-white/10 bg-emerald-950/40 px-4 py-3">
            <KitPicker kit={kit} opponentKit={aiKit} onChange={chooseKit} />
          </div>
          {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}
        </div>
        <FormationScreen
          teamName={teamName}
          leagueName={`${leagueInfo.name} · vs AI`}
          placeholder="Your XI"
          onTeamName={setTeamName}
          onChoose={startDraft}
          onBack={() => {
            resetDraft();
            setLeagueId(null);
            setHoveredLeague(null);
            setPhase("menu");
          }}
          backLabel="Back"
        />
      </main>
    );
  }

  return (
    <main>
      <div className="mx-auto max-w-7xl px-4 pt-20">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-emerald-950/40 px-4 py-3">
          <p className="text-sm text-emerald-100/80">
            {leagueInfo.name} · vs <span className="font-semibold text-white">AI</span>
          </p>
          <button
            type="button"
            onClick={() => {
              resetDraft();
              setLeagueId(null);
              setHoveredLeague(null);
              setPhase("menu");
            }}
            className="text-sm text-emerald-100/70 underline-offset-4 hover:underline"
          >
            Leave
          </button>
        </div>
        <div className="mt-3 rounded-2xl border border-white/10 bg-emerald-950/40 px-4 py-3">
          <KitPicker kit={kit} opponentKit={aiKit} onChange={chooseKit} />
        </div>
        {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}
      </div>
      <DraftScreen
        teamName={teamName}
        leagueName={leagueInfo.name}
        gameweeks={1}
        formationId={formationId}
        xi={xi}
        bench={bench}
        offer={offer}
        selectedPlayer={selectedPlayer}
        rerollsLeft={rerollsLeft}
        onReroll={rerollOffer}
        onSelectPlayer={setSelectedPlayer}
        onPlace={(target) => {
          if (!selectedPlayer) {
            const occupant = target.type === "xi" ? xi[target.slotId] : bench[target.index];
            if (occupant) setSelectedPlayer(occupant);
            return;
          }
          if (
            !playerCanBePicked(selectedPlayer, FORMATION_BY_ID[formationId], xi, bench) &&
            !Object.values(xi).some((player) => player?.id === selectedPlayer.id) &&
            !bench.some((player) => player?.id === selectedPlayer.id)
          ) {
            return;
          }
          placePick(target);
        }}
        pvp={{
          opponentName: "AI",
          opponentFilled: SQUAD_SIZE,
          opponentReady: true,
          opponentConnected: true,
          youReady: false,
          squadSize: SQUAD_SIZE,
          onReady: kickOff,
          onUnready: () => undefined,
        }}
      />
    </main>
  );
}
