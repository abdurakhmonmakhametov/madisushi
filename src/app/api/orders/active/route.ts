import { json, route } from "@/lib/api";
import { getCustomer } from "@/lib/auth/session";
import { activeCustomerOrders } from "@/lib/services/orders";

export const dynamic = "force-dynamic";

/** The signed-in customer's in-progress orders, for the floating tracker. */
export const GET = route(async () => {
  const customer = await getCustomer();
  if (!customer) return json({ orders: [] });
  return json({ orders: await activeCustomerOrders(customer.id) });
});
