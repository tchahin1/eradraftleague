"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  isRoomCode,
  normalizeRoomCode,
  randomRoomCode,
  serializeSquad,
  SQUAD_SIZE,
  type ClientMessage,
  type PvpPlayerPublic,
  type PvpRoomPublic,
} from "@/lib/pvp";
import { inviteUrl, partyHost } from "@/lib/pvp-client";
import { usePvpRoom } from "@/lib/usePvpRoom";
import type { ClubSeason, FormationId, PlayerSeason } from "@/lib/types";
import { BackButton } from "./BackButton";
import { DraftScreen } from "./DraftScreen";
import { FormationScreen } from "./FormationScreen";
import { HomeHero, LeaguePicker } from "./LeaguePicker";
import { PvpMatchScreen } from "./PvpMatchScreen";

type Screen = "menu" | "room";

type Props = {
  initialRoom: string | null;
  onLeave: () => void;
};

export function PvpApp({ initialRoom, onLeave }: Props) {
  const router = useRouter();
  const configured = Boolean(partyHost());
  const [screen, setScreen] = useState<Screen>(initialRoom ? "room" : "menu");
  const [roomCode, setRoomCode] = useState(initialRoom);
  const [hoveredLeague, setHoveredLeague] = useState<LeagueId | null>(null);
  const [creatingLeague, setCreatingLeague] = useState<LeagueId | null>(null);
  const { clientId, room, status, error, send, setError } = usePvpRoom(screen === "room" ? roomCode : null);

  const you = room?.players.find((player) => player.id === clientId);
  const opponent = room?.players.find((player) => player.id !== clientId);
  const youHost = room?.hostId === clientId;
  const leagueId = room?.leagueId ?? creatingLeague;
  const leagueInfo = leagueId ? LEAGUE_BY_ID[leagueId] : null;

  const [players, setPlayers] = useState<PlayerSeason[] | null>(null);
  const [loadedLeagueId, setLoadedLeagueId] = useState<LeagueId | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const nameDraftRef = useRef(nameDraft);
  nameDraftRef.current = nameDraft;

  const clubSeasons = useMemo(() => (players ? indexClubSeasons(players) : []), [players]);
  const bothHere = (room?.players.length ?? 0) >= 2;
  const inMatch = room?.phase === "match" && room.match;
  const link = roomCode ? inviteUrl(roomCode) : "";
  const teamName = nameDraft ?? you?.teamName ?? "";
  const loadingLeague = Boolean(leagueId && loadedLeagueId !== leagueId);

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

  const openRoom = (code: string, league?: LeagueId) => {
    const next = normalizeRoomCode(code);
    if (!isRoomCode(next)) {
      setError("Enter a 4-character room code.");
      return;
    }
    setCreatingLeague(league ?? null);
    setRoomCode(next);
    setScreen("room");
    router.replace(`/?room=${next}`, { scroll: false });
  };

  const leave = () => {
    setScreen("menu");
    setRoomCode(null);
    setCreatingLeague(null);
    setNameDraft(null);
    onLeave();
  };

  useEffect(() => {
    if (status !== "open" || !roomCode) return;
    send({
      type: "hello",
      teamName: nameDraftRef.current ?? undefined,
      leagueId: creatingLeague ?? undefined,
    });
  }, [status, roomCode, send, creatingLeague]);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (screen === "menu") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-6 px-6 py-16">
        <BackButton onClick={leave} />
        <HomeHero
          error={
            configured
              ? error
              : "Live matches need the Cloudflare worker. Run npm run party:dev locally, or deploy it and set NEXT_PUBLIC_PARTY_HOST on Vercel."
          }
        />
        <LeaguePicker
          hoveredLeague={hoveredLeague}
          onHover={setHoveredLeague}
          onChoose={(leagueId) => {
            if (!configured) {
              setError(
                "Live matches need the Cloudflare worker. Run npm run party:dev locally, or set NEXT_PUBLIC_PARTY_HOST.",
              );
              return;
            }
            openRoom(randomRoomCode(), leagueId);
          }}
        />
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="mx-auto grid min-h-screen w-full max-w-xl place-items-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-black text-white">Couldn’t join</h1>
          <p className="mt-3 text-rose-200">{error}</p>
          <button type="button" onClick={leave} className="mt-6 text-amber-300">
            Back
          </button>
        </div>
      </main>
    );
  }

  if (status === "connecting" || status === "idle" || !room) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="animate-pulse text-emerald-100/70">Opening room {roomCode}…</p>
      </main>
    );
  }

  if (inMatch && room.match) {
    return (
      <main>
        <PvpMatchScreen
          match={room.match}
          youId={clientId}
          rematchPending={Boolean(you?.rematch)}
          opponentRematch={Boolean(opponent?.rematch)}
          opponentConnected={Boolean(opponent?.connected)}
          onRematch={() => send({ type: "rematch" })}
          onLeave={leave}
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

  if (!bothHere) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-5 px-6">
        <BackButton onClick={leave} label="Leave room" />
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">
          {leagueInfo?.name ?? "Waiting"}
        </p>
        <h1 className="text-5xl font-black tracking-[0.2em] text-white">{room.code}</h1>
        <p className="text-lg text-emerald-100/80">Send this link. Draft starts when they join.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="rounded-2xl bg-amber-300 px-5 py-3 font-black uppercase tracking-widest text-emerald-950"
          >
            {copied ? "Copied" : "Copy invite"}
          </button>
        </div>
        <p className="break-all text-sm text-emerald-100/55">{link}</p>
        <label className="mt-2 flex max-w-sm flex-col gap-1 text-sm text-emerald-100/80">
          Your club name
          <input
            value={teamName}
            placeholder="Club name"
            onChange={(event) => {
              setNameDraft(event.target.value);
              send({ type: "set-profile", teamName: event.target.value });
            }}
            className="rounded-xl border border-white/15 bg-emerald-950/70 px-3 py-2 text-white outline-none ring-amber-300/40 focus:ring-2 placeholder:text-white/35"
          />
        </label>
        {youHost && !room.leagueId ? (
          <p className="text-sm text-amber-200">This room has no league yet. Leave and create a new one.</p>
        ) : null}
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

  return (
    <PvpSession
      key={`${room.code}-${room.phase}`}
      room={room}
      leagueName={leagueInfo.name}
      teamName={teamName}
      you={you}
      opponent={opponent}
      clubSeasons={clubSeasons}
      send={send}
      onTeamName={(value) => {
        setNameDraft(value);
        send({ type: "set-profile", teamName: value });
      }}
      onLeave={leave}
    />
  );
}

function PvpSession({
  room,
  leagueName,
  teamName,
  you,
  opponent,
  clubSeasons,
  send,
  onTeamName,
  onLeave,
}: {
  room: PvpRoomPublic;
  leagueName: string;
  teamName: string;
  you?: PvpPlayerPublic;
  opponent?: PvpPlayerPublic;
  clubSeasons: ClubSeason[];
  send: (message: ClientMessage) => void;
  onTeamName: (value: string) => void;
  onLeave: () => void;
}) {
  const [formationId, setFormationId] = useState<FormationId | null>(null);
  const [xi, setXi] = useState<Record<string, PlayerSeason | null>>({});
  const [bench, setBench] = useState<(PlayerSeason | null)[]>([]);
  const [usedPlayerIds, setUsedPlayerIds] = useState<string[]>([]);
  const [usedClubSeasons, setUsedClubSeasons] = useState<string[]>([]);
  const [rerollsLeft, setRerollsLeft] = useState(3);
  const [offer, setOffer] = useState<ReturnType<typeof pickRandomOffer>>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSeason | null>(null);
  const youReady = Boolean(you?.ready);

  const startLocalDraft = (id: FormationId) => {
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
    send({ type: "set-profile", teamName, formationId: id });
  };

  const placePick = (target: { type: "xi"; slotId: string } | { type: "bench"; index: number }) => {
    if (!offer || !formationId || !selectedPlayer || youReady) return;
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
    send({ type: "progress", filled: countFilled(next.xi, next.bench) });
  };

  const rerollOffer = () => {
    if (!offer || !formationId || rerollsLeft <= 0 || youReady) return;
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

  if (!formationId || !offer) {
    return (
      <main>
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-emerald-950/40 px-4 py-3">
            <p className="text-sm text-emerald-100/80">
              Room <span className="font-black tracking-[0.2em] text-white">{room.code}</span>
              {opponent ? ` · vs ${opponent.teamName}` : ""}
              {opponent && !opponent.connected ? " · disconnected" : ""}
            </p>
          </div>
        </div>
        <FormationScreen
          teamName={teamName}
          leagueName={`${leagueName} · live match`}
          placeholder="Club name"
          onTeamName={onTeamName}
          onChoose={startLocalDraft}
          onBack={onLeave}
          backLabel="Leave room"
        />
      </main>
    );
  }

  return (
    <main>
      <div className="mx-auto max-w-7xl px-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-emerald-950/40 px-4 py-3">
          <p className="text-sm text-emerald-100/80">
            Room <span className="font-black tracking-[0.2em] text-white">{room.code}</span>
            {opponent ? ` · vs ${opponent.teamName}` : ""}
            {opponent && !opponent.connected ? " · disconnected" : ""}
          </p>
          <button type="button" onClick={onLeave} className="text-sm text-emerald-100/70 underline-offset-4 hover:underline">
            Leave
          </button>
        </div>
      </div>
      <DraftScreen
        teamName={teamName}
        leagueName={leagueName}
        gameweeks={1}
        formationId={formationId}
        xi={xi}
        bench={bench}
        offer={offer}
        selectedPlayer={selectedPlayer}
        rerollsLeft={rerollsLeft}
        onReroll={rerollOffer}
        onSelectPlayer={youReady ? () => undefined : setSelectedPlayer}
        onPlace={(target) => {
          if (youReady) return;
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
          opponentName: opponent?.teamName ?? "Opponent",
          opponentFilled: opponent?.filled ?? 0,
          opponentReady: Boolean(opponent?.ready),
          opponentConnected: Boolean(opponent?.connected),
          youReady,
          squadSize: SQUAD_SIZE,
          onReady: () => {
            const squad = serializeSquad(teamName, formationId, xi, bench);
            if (!squad) return;
            send({ type: "ready", squad });
          },
          onUnready: () => send({ type: "unready" }),
        }}
      />
    </main>
  );
}
