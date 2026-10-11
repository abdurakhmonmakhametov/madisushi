import { z } from "zod";
import { ApiError, body, json, route } from "@/lib/api";
import { getCustomer } from "@/lib/auth/session";
import { asActor } from "@/lib/db";
import { addressSchema } from "@/lib/services/checkout";

const create = addressSchema.extend({ label: z.string().trim().max(40).optional().nullable(), isDefault: z.boolean().optional() });

export const POST = route(async (req) => {
  const customer = await getCustomer();
  if (!customer) throw new ApiError(401, "unauthorized");
  const a = await body(req, create);
  const row = await asActor({ kind: "customer", id: customer.id }, async (d) => {
    const count = await d.one<{ n: number }>("select count(*)::int n from public.customer_addresses where customer_id = $1", [customer.id]);
    if ((count?.n ?? 0) >= 20) throw new ApiError(422, "validation");
    if (a.isDefault) await d.query("update public.customer_addresses set is_default = false where customer_id = $1", [customer.id]);
    return d.one<{ id: string }>(
      `insert into public.customer_addresses (customer_id, label, address_text, lat, lng, house, apartment, floor, entrance, instructions, is_default)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [customer.id, a.label ?? null, a.text, a.lat, a.lng, a.house, a.apartment, a.floor, a.entrance, a.instructions, a.isDefault ?? (count?.n ?? 0) === 0],
    );
  });
  return json({ id: row?.id }, 201);
});

export const DELETE = route(async (req) => {
  const customer = await getCustomer();
  if (!customer) throw new ApiError(401, "unauthorized");
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, "validation");
  // RLS guarantees only the caller's own address can match.
  const rows = await asActor({ kind: "customer", id: customer.id }, (d) => d.query("delete from public.customer_addresses where id = $1 returning id", [id]));
  if (rows.length === 0) throw new ApiError(404, "not_found");
  return json({ ok: true });
});
