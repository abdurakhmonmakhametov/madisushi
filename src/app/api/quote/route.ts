import { body, json, route } from "@/lib/api";
import { getCustomer } from "@/lib/auth/session";
import { getQuote, quoteInputSchema } from "@/lib/services/checkout";

// Server-side quote: prices, fees, promo, loyalty and schedule, recomputed from the database.
export const POST = route(async (req) => {
  const input = await body(req, quoteInputSchema);
  const customer = await getCustomer();
  return json(await getQuote(input, customer ? { id: customer.id, loyalty_balance: customer.loyalty_balance } : null));
});
