// Automatic login inside the Telegram Mini App.
// The client posts Telegram's signed initData (and, once, the signed contact
// from WebApp.requestContact). Customers are matched by the phone Telegram
// verified; staff by the chat they linked from /admin/telegram.
import { z } from "zod";
import { ApiError, body, json, route } from "@/lib/api";
import { createSession, getCustomer, getStaff } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/auth/otp";
import { linkCustomerPhone, linkedAccount, parseContact, parseInitData, touchChat } from "@/lib/telegram/webapp";

export const POST = route(async (req) => {
  const input = await body(
    req,
    z.object({ initData: z.string().min(1).max(8192), contact: z.string().max(8192).optional(), as: z.enum(["customer", "staff"]).default("customer") }),
  );
  const init = parseInitData(input.initData);
  if (!init) throw new ApiError(401, "invalid_init_data");
  const { user } = init;
  await touchChat(user);

  if (input.as === "staff") {
    if (await getStaff()) return json({ ok: true, already: true });
    const acc = await linkedAccount(user.id);
    if (!acc?.staff_id) throw new ApiError(403, "not_linked");
    await createSession("staff", acc.staff_id, { embedded: true });
    return json({ ok: true });
  }

  const phoneRaw = parseContact(input.contact, user.id);
  if (phoneRaw) {
    const phone = normalizePhone(phoneRaw);
    if (!phone) throw new ApiError(400, "invalid_phone");
    await linkCustomerPhone(user, phone);
  }
  const acc = await linkedAccount(user.id);
  const current = await getCustomer();
  if (current && (!acc?.customer_id || acc.customer_id === current.id)) return json({ ok: true, already: true });
  if (!acc?.customer_id) throw new ApiError(409, "need_contact");
  if (acc.customer_blocked) throw new ApiError(403, "blocked");
  await createSession("customer", acc.customer_id, { embedded: true });
  return json({ ok: true });
});
