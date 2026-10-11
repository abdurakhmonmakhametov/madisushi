"use client";

// Re-renders the current server page the moment a matching live event arrives
// (order status, new reservation, stop-list change...). `fallbackMs` keeps a
// slow timer as a safety net for networks that block streaming.
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { debounce, useRealtime, type LiveEvent } from "@/lib/realtime-client";

type Kind = Exclude<LiveEvent["t"], "resync">;

export function LiveRefresh({ scope, kinds, id, fallbackMs }: { scope: "customer" | "staff"; kinds: Kind[]; id?: string; fallbackMs?: number }) {
  const router = useRouter();
  const refresh = useMemo(() => debounce(() => router.refresh(), 200), [router]);
  useRealtime(scope, (e) => {
    if (e.t === "resync") return refresh();
    if (!kinds.includes(e.t)) return;
    if (id && "id" in e && e.id !== id) return;
    refresh();
  });
  useEffect(() => {
    if (!fallbackMs) return;
    const h = setInterval(() => document.visibilityState === "visible" && router.refresh(), fallbackMs);
    return () => clearInterval(h);
  }, [router, fallbackMs]);
  return null;
}
