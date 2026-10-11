import { z } from "zod";
import { ApiError, body, json, route } from "@/lib/api";
import { clientIp, createSession } from "@/lib/auth/session";
import { normalizePhone, verifyOtp } from "@/lib/auth/otp";

export const POST = route(async (req) => {
  const { phone, code } = await body(req, z.object({ phone: z.string().max(30), code: z.string().max(10) }));
  const normalized = normalizePhone(phone);
  if (!normalized) throw new ApiError(400, "invalid_phone");
  const customerId = await verifyOtp(normalized, code.trim(), await clientIp());
  if (!customerId) throw new ApiError(401, "invalid_code");
  await createSession("customer", customerId);
  return json({ ok: true });
});
