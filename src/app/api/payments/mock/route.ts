import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { devToolsAllowed } from "@/lib/env";
import { handleMockCallback } from "@/lib/payments/mock";

// DEV ONLY: the mock provider's server-to-server callback. 404 in production.
const schema = z.object({
  eventId: z.string().uuid(),
  paymentId: z.string().uuid(),
  amount: z.number().int(),
  outcome: z.enum(["paid", "failed"]),
  signature: z.string().max(128),
});

export async function POST(req: NextRequest) {
  if (!devToolsAllowed()) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });
  const r = await handleMockCallback(parsed.data);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
