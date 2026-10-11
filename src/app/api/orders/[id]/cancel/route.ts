import { z } from "zod";
import { ApiError, body, json, route } from "@/lib/api";
import { getCustomer } from "@/lib/auth/session";
import { cancelOrderByCustomer } from "@/lib/services/orders";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const customer = await getCustomer();
  if (!customer) throw new ApiError(401, "unauthorized");
  const { reason } = await body(req, z.object({ reason: z.string().max(40) }));
  const r = await cancelOrderByCustomer(customer.id, (await params).id, reason);
  if (r === "not_found") throw new ApiError(404, "not_found");
  if (r === "cannot_cancel") throw new ApiError(409, "cannot_cancel");
  return json({ ok: true });
});
