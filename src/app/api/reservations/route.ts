import { ApiError, body, json, route } from "@/lib/api";
import { clientIp, getCustomer } from "@/lib/auth/session";
import { enforce } from "@/lib/auth/ratelimit";
import { db } from "@/lib/db";
import { loadBranches } from "@/lib/services/catalog";
import { createReservation, reservationInput, reservationSlots } from "@/lib/services/reservations";

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const branchId = sp.get("branchId") ?? "";
  const date = sp.get("date") ?? "";
  const party = Math.max(1, Math.min(200, Number(sp.get("party")) || 2));
  if (!/^[0-9a-f-]{36}$/i.test(branchId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "validation");
  const [branch] = await loadBranches(db, { branchId });
  if (!branch) throw new ApiError(404, "not_found");
  return json({ slots: await reservationSlots(db, branch, date, party), maxParty: branch.reservation_max_party });
});

export const POST = route(async (req) => {
  const customer = await getCustomer();
  await enforce([[`reservation:${customer?.id ?? (await clientIp())}:1h`, 10, 3600]]);
  const input = await body(req, reservationInput);
  const r = await createReservation(input, customer?.id ?? null);
  if (!r.ok) throw new ApiError(422, r.code);
  return json(r, 201);
});
