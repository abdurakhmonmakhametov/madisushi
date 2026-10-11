import { ApiError, body, json, route } from "@/lib/api";
import { getCustomer } from "@/lib/auth/session";
import { enforce } from "@/lib/auth/ratelimit";
import { placeInputSchema, placeOrder } from "@/lib/services/checkout";

export const POST = route(async (req) => {
  const customer = await getCustomer();
  if (!customer) throw new ApiError(401, "unauthorized");
  await enforce([[`order:${customer.id}:10m`, 20, 600]]);
  const input = await body(req, placeInputSchema);
  const r = await placeOrder(customer.id, input);
  if (r.ok) return json(r, r.duplicate ? 200 : 201);
  switch (r.code) {
    case "price_changed":
      return json({ error: "price_changed", quote: r.quote, expectedTotal: r.expectedTotal }, 409);
    case "validation":
      return json({ error: "validation", issues: r.issues, quote: r.quote }, 422);
    case "idempotency_conflict":
      return json({ error: r.code }, 409);
    case "blocked":
      return json({ error: r.code }, 403);
    default:
      return json({ error: "unauthorized" }, 401);
  }
});
