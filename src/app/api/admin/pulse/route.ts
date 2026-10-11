import { json, route } from "@/lib/api";
import { getStaff } from "@/lib/auth/session";
import { can } from "@/lib/admin/guard";
import { staffPulse } from "@/lib/services/orders";

export const dynamic = "force-dynamic";

/** Polled by the admin shell for the new-order alert and sidebar counters. */
export const GET = route(async () => {
  const staff = await getStaff();
  if (!staff || !can(staff.role, "orders")) return json({ error: "unauthorized" }, 401);
  return json(await staffPulse(staff, can(staff.role, "reservations")));
});
