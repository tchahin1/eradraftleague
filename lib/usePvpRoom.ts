"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PartySocket } from "partysocket";
import { getPvpClientId, partyHost } from "./pvp-client";
import {
  parseServerMessage,
  PVP_PARTY,
  type ClientMessage,
  type PvpRoomPublic,
} from "./pvp";

type Status = "idle" | "connecting" | "open" | "closed";

export function usePvpRoom(roomCode: string | null) {
  const clientId = useMemo(() => getPvpClientId(), []);
  const host = useMemo(() => partyHost(), []);
  const socketRef = useRef<PartySocket | null>(null);
  const [room, setRoom] = useState<PvpRoomPublic | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode || !host) return;

    const socket = new PartySocket({
      host,
      party: PVP_PARTY,
      room: roomCode,
      id: clientId,
    });
    socketRef.current = socket;
    queueMicrotask(() => {
      setError(null);
      setRoom(null);
      setStatus("connecting");
    });

    const onOpen = () => setStatus("open");
    const onClose = () => setStatus("closed");
    const onError = () => setError("Could not reach the match room. Is the party worker running?");
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      const message = parseServerMessage(event.data);
      if (!message) return;
      if (message.type === "error") {
        setError(message.message);
        return;
      }
      setRoom(message.room);
      setError(null);
    };

    socket.addEventListener("open", onOpen);
    socket.addEventListener("close", onClose);
    socket.addEventListener("error", onError);
    socket.addEventListener("message", onMessage);

    return () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("error", onError);
      socket.removeEventListener("message", onMessage);
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [roomCode, clientId, host]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }, []);

  return { clientId, host, room, status, error, send, setError };
}
