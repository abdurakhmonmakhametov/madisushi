// Live changes for the current viewer, over Server-Sent Events or long-polling.
//   staff    : orders / reservations / feedback of their branches (super admin: all;
//              kitchen: orders only)
//   customer : their own orders and reservations
//   everyone : catalog changes (menu, stop-list, prices, banners)
// Events only say *what* changed; pages re-fetch the data through RLS.
//
//   GET /api/realtime?scope=staff|customer             -> text/event-stream
//   GET /api/realtime?scope=...&poll=1                 -> { boot, seq } (cursor)
//   GET /api/realtime?scope=...&poll=1&boot=B&after=N  -> held up to 25s, then
//                                                        { boot, seq, events }
import { getCustomer, getStaff } from "@/lib/auth/session";
import { realtimeCursor, subscribeRealtime, waitForEvents, type RealtimeEvent } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const NO_BUFFER = {
  // no-transform stops compression middleware from buffering; X-Accel-Buffering for nginx
  "Cache-Control": "no-cache, no-store, no-transform",
  "X-Accel-Buffering": "no",
};

async function viewerFilter(scope: "staff" | "customer") {
  const staff = scope === "staff" ? await getStaff() : null;
  const customer = scope === "customer" ? await getCustomer() : null;
  const filter = (e: RealtimeEvent): RealtimeEvent | null => {
    if (e.t === "catalog" || e.t === "resync") return e;
    if (staff) {
      const branchOk = staff.role === "super_admin" || (e.b != null && staff.branchIds.includes(e.b));
      if (!branchOk) return null;
      if (e.t === "order") return e;
      return staff.role === "kitchen" ? null : e;
    }
    if (customer && (e.t === "order" || e.t === "reservation") && e.c === customer.id) return e;
    return null;
  };
  return { filter, authed: Boolean(staff || customer) };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "staff" ? "staff" : "customer";
  const { filter, authed } = await viewerFilter(scope);

  if (url.searchParams.get("poll") === "1") {
    const after = Number(url.searchParams.get("after"));
    const boot = url.searchParams.get("boot");
    const body =
      boot && Number.isSafeInteger(after)
        ? await waitForEvents(boot, after, filter, 25000, req.signal)
        : { ...realtimeCursor(), events: [] as RealtimeEvent[] };
    return Response.json({ ...body, authed }, { headers: NO_BUFFER });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          cleanup();
        }
      };
      // Reconnect quickly if the connection drops; "hello" proves the stream isn't buffered.
      write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ scope, authed })}\n\n`);
      const unsubscribe = subscribeRealtime((e) => {
        const v = filter(e);
        if (v) write(`data: ${JSON.stringify(v)}\n\n`);
      });
      // Proxies drop idle connections; a comment every 20s keeps it open.
      const ping = setInterval(() => write(`: ping\n\n`), 20000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", Connection: "keep-alive", ...NO_BUFFER },
  });
}
