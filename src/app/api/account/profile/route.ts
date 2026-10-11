import { z } from "zod";
import { ApiError, body, json, route } from "@/lib/api";
import { getCustomer } from "@/lib/auth/session";
import { asActor } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().max(120).email().or(z.literal("")).optional(),
  preferredLang: z.enum(["uz", "ru"]).optional(),
});

// Runs under RLS as the customer; column grants only allow name/email/lang.
export const PATCH = route(async (req) => {
  const customer = await getCustomer();
  if (!customer) throw new ApiError(401, "unauthorized");
  const v = await body(req, schema);
  await asActor({ kind: "customer", id: customer.id }, (d) =>
    d.query("update public.customers set name = $2, email = $3, preferred_lang = coalesce($4, preferred_lang) where id = $1", [customer.id, v.name, v.email || null, v.preferredLang ?? null]),
  );
  return json({ ok: true });
});
