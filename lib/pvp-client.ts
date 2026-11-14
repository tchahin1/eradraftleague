import { PVP_CLIENT_KEY } from "./pvp";

export function partyHost(): string | null {
  const env = process.env.NEXT_PUBLIC_PARTY_HOST?.trim();
  if (env) return env.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") return "localhost:8787";
  }
  return null;
}

export function getPvpClientId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(PVP_CLIENT_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(PVP_CLIENT_KEY, id);
  return id;
}

export function inviteUrl(roomCode: string): string {
  if (typeof window === "undefined") return `/?room=${roomCode}`;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", roomCode);
  return url.toString();
}
