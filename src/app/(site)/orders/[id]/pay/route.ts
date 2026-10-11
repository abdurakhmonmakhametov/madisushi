import { NextResponse, type NextRequest } from "next/server";
import { getCustomer } from "@/lib/auth/session";
import { db, tx } from "@/lib/db";
import { checkoutUrl, enabledMethods, startPayment, type PaymentMethod, type PaymentRow } from "@/lib/payments/core";

// (Re)starts payment for an unpaid online order and redirects to the provider.
// Visiting this URL never marks anything paid.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomer();
  const back = new URL(`/orders/${id}`, req.url);
  if (!customer) return NextResponse.redirect(new URL(`/login?next=/orders/${id}`, req.url));
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(new URL("/orders", req.url));
  const order = await db.one<{ id: string; total: number; payment_method: PaymentMethod; payment_status: string; status: string }>(
    "select id, total, payment_method, payment_status, status from public.orders where id = $1 and customer_id = $2",
    [id, customer.id],
  );
  if (!order || order.status === "cancelled" || !["pending", "failed", "unpaid"].includes(order.payment_status) || !enabledMethods().includes(order.payment_method)) {
    return NextResponse.redirect(back);
  }
  if (!["click", "payme", "mock"].includes(order.payment_method)) return NextResponse.redirect(back);
  const url = await tx(async (d) => {
    const open = await d.one<PaymentRow>(
      "select * from public.payments where order_id = $1 and status in ('created','pending') order by created_at desc limit 1 for update",
      [id],
    );
    if (open) return checkoutUrl(open);
    return (await startPayment(d, order, order.payment_method)).url;
  });
  return NextResponse.redirect(new URL(url, req.url));
}
