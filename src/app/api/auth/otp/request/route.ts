import { z } from "zod";
import { ApiError, body, json, route } from "@/lib/api";
import { clientIp } from "@/lib/auth/session";
import { normalizePhone, requestOtp } from "@/lib/auth/otp";
import { botLoginLink, OtpNotDeliverableError, SmsNotConfiguredError } from "@/lib/integrations/sms";

export const POST = route(async (req) => {
  const { phone } = await body(req, z.object({ phone: z.string().max(30) }));
  const normalized = normalizePhone(phone);
  if (!normalized) throw new ApiError(400, "invalid_phone");
  try {
    const r = await requestOtp(normalized, await clientIp());
    return json({
      ok: true,
      phone: normalized,
      channel: r.channel,
      ...(r.channel === "telegram" ? { bot: botLoginLink() } : {}),
      ...(r.devCode ? { devCode: r.devCode } : {}),
    });
  } catch (e) {
    if (e instanceof OtpNotDeliverableError) throw new ApiError(409, "telegram_not_linked", { bot: botLoginLink() });
    if (e instanceof SmsNotConfiguredError) {
      console.error("[otp]", e.message);
      throw new ApiError(503, "sms_unavailable");
    }
    throw e;
  }
});
