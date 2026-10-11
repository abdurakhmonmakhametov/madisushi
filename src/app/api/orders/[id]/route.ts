import { ApiError, json, route } from "@/lib/api";
import { getCustomer } from "@/lib/auth/session";
import { getCustomerOrder } from "@/lib/services/orders";

// Lightweight status endpoint for live order tracking (RLS: own orders only).
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const customer = await getCustomer();
  if (!customer) throw new ApiError(401, "unauthorized");
  const detail = await getCustomerOrder(customer.id, (await params).id);
  if (!detail) throw new ApiError(404, "not_found");
  const o = detail.order;
  return json({ status: o.status, payment_status: o.payment_status, updated_at: o.updated_at, history: detail.history });
});
