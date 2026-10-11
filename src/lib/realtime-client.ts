"use client";

// One shared live connection per scope for the whole tab. It tries
// Server-Sent Events first; if the stream is buffered by a proxy/tunnel (no
// "hello" within 4s) it switches to long-polling, which answers the instant an
// event happens. After any gap a synthetic "resync" tells subscribers to
// re-fetch, since events sent while offline are lost.
import { useEffect, useRef } from "react";

export type LiveEvent =
  | { t: "order"; id: string; n: number; c: string; b: string; s: string; p: string; new: boolean }
  | { t: "reservation"; id: string; c: string | null; b: string; s: string; new: boolean }
  | { t: "feedback"; id: string; b: string | null }
  | { t: "catalog" }
  | { t: "resync" };

type Scope = "customer" | "staff";
type Listener = (e: LiveEvent) => void;
type Channel = { listeners: Set<Listener>; stop: (() => void) | null };

const channels = new Map<Scope, Channel>();
const MODE_KEY = "rt_mode";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function remembered(): "poll" | null {
  try {
    return sessionStorage.getItem(MODE_KEY) === "poll" ? "poll" : null;
  } catch {
    return null;
  }
}

function channel(scope: Scope): Channel {
  let ch = channels.get(scope);
  if (!ch) channels.set(scope, (ch = { listeners: new Set(), stop: null }));
  return ch;
}

function startPolling(scope: Scope, dispatch: Listener): () => void {
  let stopped = false;
  let ctrl: AbortController | null = null;
  (async () => {
    let boot = "";
    let after = -1;
    let failures = 0;
    while (!stopped) {
      try {
        ctrl = new AbortController();
        const qs = boot ? `&boot=${boot}&after=${after}` : "";
        const r = await fetch(`/api/realtime?scope=${scope}&poll=1${qs}`, { cache: "no-store", signal: ctrl.signal });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { boot: string; seq: number; events: LiveEvent[] };
        if (!data.boot || !Number.isSafeInteger(data.seq)) throw new Error("bad cursor"); // never spin
        if (failures > 0) dispatch({ t: "resync" });
        failures = 0;
        boot = data.boot;
        after = data.seq;
        for (const e of data.events) dispatch(e);
      } catch {
        if (stopped) return;
        failures += 1;
        await sleep(Math.min(1000 * failures, 10000));
      }
    }
  })();
  return () => {
    stopped = true;
    ctrl?.abort();
  };
}

function start(scope: Scope, ch: Channel) {
  const dispatch: Listener = (e) => ch.listeners.forEach((l) => l(e));
  if (typeof EventSource === "undefined" || remembered() === "poll") {
    ch.stop = startPolling(scope, dispatch);
    return;
  }
  const es = new EventSource(`/api/realtime?scope=${scope}`);
  let alive = false;
  let hadError = false;
  let stopPoll: (() => void) | null = null;
  const fallback = setTimeout(() => {
    if (alive) return;
    // The stream is being buffered somewhere: use long-polling for this tab.
    es.close();
    try {
      sessionStorage.setItem(MODE_KEY, "poll");
    } catch {}
    stopPoll = startPolling(scope, dispatch);
  }, 4000);
  es.addEventListener("hello", () => {
    alive = true;
    if (hadError) dispatch({ t: "resync" });
    hadError = false;
  });
  es.onmessage = (m) => {
    try {
      dispatch(JSON.parse(m.data) as LiveEvent);
    } catch {
      /* ignore */
    }
  };
  es.onerror = () => {
    hadError = true; // EventSource reconnects by itself (server sends retry: 3000)
  };
  ch.stop = () => {
    clearTimeout(fallback);
    es.close();
    stopPoll?.();
  };
}

/** Calls `handler` for every live event in `scope`. The handler may change between renders. */
export function useRealtime(scope: Scope, handler: Listener, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const ch = channel(scope);
    const l: Listener = (e) => ref.current(e);
    ch.listeners.add(l);
    if (!ch.stop) start(scope, ch);
    // Coming back to a backgrounded tab / phone: catch up at once.
    const onVisible = () => document.visibilityState === "visible" && l({ t: "resync" });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ch.listeners.delete(l);
      document.removeEventListener("visibilitychange", onVisible);
      if (!ch.listeners.size) {
        ch.stop?.();
        ch.stop = null;
      }
    };
  }, [scope, enabled]);
}

/** Coalesces bursts (e.g. status + payment change in one go) into one call. */
export function debounce(fn: () => void, ms = 250) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}
