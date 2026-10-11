import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { devToolsAllowed } from "@/lib/env";
import { formatUZS } from "@/lib/money";
import { getCustomer } from "@/lib/auth/session";
import { buildMockCallback } from "@/lib/payments/mock";

export const metadata = { title: "DEV mock payment" };

/**
 * LOCAL DEVELOPMENT PAYMENT SIMULATOR. Not available in production.
 * The buttons make the "provider" send a signed callback to
 * /api/payments/mock — the same path a real provider callback takes.
 * Returning to the order page by itself never marks anything paid.
 */
export default async function MockPayPage({ params }: { params: Promise<{ id: string }> }) {
  if (!devToolsAllowed()) notFound();
  const { id } = await params;
  const customer = await getCustomer();
  if (!customer || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await db.one<{ id: string; amount: number; status: string; order_id: string; number: number }>(
    `select p.id, p.amount, p.status, p.order_id, o.number
       from public.payments p join public.orders o on o.id = p.order_id
      where p.id = $1 and p.provider = 'mock' and o.customer_id = $2`,
    [id, customer.id],
  );
  if (!p) notFound();

  async function deliver(outcome: "paid" | "failed") {
    "use server";
    if (!devToolsAllowed()) return;
    const row = await db.one<{ amount: number; order_id: string }>("select amount, order_id from public.payments where id = $1 and provider = 'mock'", [id]);
    if (!row) return;
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    await fetch(`${origin}/api/payments/mock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMockCallback(id, row.amount, outcome)),
      cache: "no-store",
    });
    redirect(`/orders/${row.order_id}?payment=${id}`);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card overflow-hidden">
        <div className="bg-warn-50 px-6 py-3 text-sm font-semibold text-warn">DEV · Local mock payment provider — no real money</div>
        <div className="space-y-4 p-6">
          <p className="text-muted">Order №{p.number}</p>
          <p className="text-3xl font-bold tabular-nums">{formatUZS(p.amount)}</p>
          <p className="text-sm text-muted">Payment status: {p.status}</p>
          {p.status === "paid" ? (
            <a className="btn-soft h-12 w-full" href={`/orders/${p.order_id}`}>
              Back to order
            </a>
          ) : (
            <div className="flex flex-col gap-3">
              <form action={deliver.bind(null, "paid")}>
                <button className="btn-primary h-12 w-full" type="submit">
                  Simulate successful payment
                </button>
              </form>
              <form action={deliver.bind(null, "failed")}>
                <button className="btn-soft h-12 w-full" type="submit">
                  Simulate failed payment
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
