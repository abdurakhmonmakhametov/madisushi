import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { clientIp, getCustomer } from "@/lib/auth/session";
import { enforce } from "@/lib/auth/ratelimit";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  message: z.string().trim().min(3).max(2000),
});

export const POST = route(async (req) => {
  const customer = await getCustomer();
  await enforce([[`feedback:${customer?.id ?? (await clientIp())}:1h`, 5, 3600]]);
  const v = await body(req, schema);
  await db.query(
    "insert into public.feedback (customer_id, branch_id, name, phone, rating, message) values ($1, $2, $3, $4, $5, $6)",
    [customer?.id ?? null, v.branchId ?? null, v.name, v.phone ?? null, v.rating ?? null, v.message],
  );
  return json({ ok: true }, 201);
});
