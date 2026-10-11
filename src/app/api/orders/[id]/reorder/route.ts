import { ApiError, json, route } from "@/lib/api";
import { getCustomer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { reorderLines } from "@/lib/services/orders";
import { loadMenu } from "@/lib/services/catalog";

// Returns the still-available items of a past order at today's prices.
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const customer = await getCustomer();
  if (!customer) throw new ApiError(401, "unauthorized");
  const r = await reorderLines(customer.id, (await params).id);
  if (!r) throw new ApiError(404, "not_found");
  const menu = await loadMenu(db, r.brandId, r.branchId);
  const brand = await db.one<{ name: string }>("select name from public.brands where id = $1", [r.brandId]);
  return json({
    ...r,
    brandName: brand?.name ?? "",
    services: menu.serviceItems.map((s) => ({ id: s.id, name: s.name, imageUrl: s.imageUrl, price: s.price, kind: s.kind, defaultInCart: s.defaultInCart && s.available })),
  });
});
