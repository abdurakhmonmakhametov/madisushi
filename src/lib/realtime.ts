// Server-side realtime hub: one dedicated LISTEN connection per server process
// receives `realtime` NOTIFY events and fans them out to
//   - open SSE streams (subscribeRealtime), and
//   - long-poll requests (waitForEvents), which read a numbered ring buffer.
// Long-polling exists because some proxies/tunnels buffer streamed responses;
// a finished response always gets through immediately.
import { randomBytes } from "node:crypto";
import pg from "pg";

export type RealtimeEvent =
  | { t: "order"; id: string; n: number; c: string; b: string; s: string; p: string; new: boolean }
  | { t: "reservation"; id: string; c: string | null; b: string; s: string; new: boolean }
  | { t: "feedback"; id: string; b: string | null }
  | { t: "catalog" }
  | { t: "resync" };

type Listener = (e: RealtimeEvent) => void;
type Numbered = { seq: number; e: RealtimeEvent };

interface Hub {
  listeners: Set<Listener>;
  waiters: Set<() => void>;
  ring: Numbered[];
  seq: number;
  boot: string;
  client: pg.Client | null;
  connecting: boolean;
  retryMs: number;
}

const RING = 1000;
// Versioned key: a dev hot-reload must not reuse a hub object from older code.
const g = globalThis as unknown as { __sushiRealtimeV2?: Hub };
const hub: Hub = (g.__sushiRealtimeV2 ??= {
  listeners: new Set(),
  waiters: new Set(),
  ring: [],
  seq: 0,
  boot: randomBytes(6).toString("hex"),
  client: null,
  connecting: false,
  retryMs: 1000,
});

function emit(e: RealtimeEvent) {
  hub.seq += 1;
  hub.ring.push({ seq: hub.seq, e });
  if (hub.ring.length > RING) hub.ring.splice(0, hub.ring.length - RING);
  for (const l of hub.listeners) {
    try {
      l(e);
    } catch {
      /* one broken stream must not affect the others */
    }
  }
  for (const w of hub.waiters) w();
}

async function connect() {
  if (hub.client || hub.connecting) return;
  hub.connecting = true;
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const fail = (e?: Error) => {
    if (e) console.warn("[realtime] listener", e.message);
    if (hub.client === client) hub.client = null;
    client.removeAllListeners();
    client.end().catch(() => {});
    setTimeout(connect, hub.retryMs);
    hub.retryMs = Math.min(hub.retryMs * 2, 30000);
  };
  try {
    await client.connect();
    await client.query("listen realtime");
    client.on("notification", (m) => {
      if (!m.payload) return;
      try {
        emit(JSON.parse(m.payload) as RealtimeEvent);
      } catch {
        /* ignore malformed payloads */
      }
    });
    client.on("error", fail);
    client.on("end", () => hub.client === client && fail());
    const reconnected = hub.retryMs > 1000;
    hub.client = client;
    hub.retryMs = 1000;
    if (reconnected) emit({ t: "resync" });
  } catch (e) {
    fail(e as Error);
  } finally {
    hub.connecting = false;
  }
}

export function subscribeRealtime(l: Listener): () => void {
  hub.listeners.add(l);
  void connect();
  return () => {
    hub.listeners.delete(l);
  };
}

/** Current position, so a long-poll client can ask for "everything after this". */
export function realtimeCursor() {
  void connect();
  return { boot: hub.boot, seq: hub.seq };
}

/**
 * Resolves with the events after `after` that pass `filter`, as soon as there is
 * at least one, or with none after `timeoutMs`. `resync` is returned when the
 * client's cursor is from another server process or fell out of the buffer.
 */
export async function waitForEvents(
  boot: string,
  after: number,
  filter: (e: RealtimeEvent) => RealtimeEvent | null,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<{ boot: string; seq: number; events: RealtimeEvent[] }> {
  void connect();
  const oldest = hub.ring[0]?.seq ?? hub.seq + 1;
  if (boot !== hub.boot || after > hub.seq || (after < oldest - 1 && after < hub.seq)) {
    return { boot: hub.boot, seq: hub.seq, events: [{ t: "resync" }] };
  }
  let cursor = after;
  const collect = () => {
    const out: RealtimeEvent[] = [];
    for (const { seq, e } of hub.ring) {
      if (seq <= cursor) continue;
      const v = filter(e);
      if (v) out.push(v);
    }
    cursor = hub.seq;
    return out;
  };
  const ready = collect();
  if (ready.length) return { boot: hub.boot, seq: cursor, events: ready };
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const done = (events: RealtimeEvent[]) => {
      clearTimeout(timer);
      hub.waiters.delete(wake);
      signal.removeEventListener("abort", onAbort);
      resolve({ boot: hub.boot, seq: cursor, events });
    };
    const wake = () => {
      const evs = collect();
      if (evs.length) done(evs);
    };
    const onAbort = () => done([]);
    hub.waiters.add(wake);
    signal.addEventListener("abort", onAbort);
    timer = setTimeout(() => done([]), timeoutMs);
  });
}
