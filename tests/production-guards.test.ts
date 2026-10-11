// Development-only simulators must be unavailable when NODE_ENV=production.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function inProduction() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SESSION_SECRET", "a-production-like-secret-value-that-is-long-enough");
  vi.stubEnv("PAYMENT_METHODS", "cash,click,payme,mock");
  vi.stubEnv("SMS_PROVIDER", "console");
}

describe("production guards", () => {
  it("never offers the mock payment method", async () => {
    await inProduction();
    const core = await import("@/lib/payments/core");
    expect(core.enabledMethods()).not.toContain("mock");
    expect(core.methodStatus().find((m) => m.method === "mock")?.ready).toBe(false);
  });

  it("refuses mock payment callbacks even with a valid signature", async () => {
    await inProduction();
    const mock = await import("@/lib/payments/mock");
    const cb = mock.buildMockCallback("00000000-0000-0000-0000-000000000000", 1000, "paid");
    expect(await mock.handleMockCallback(cb)).toEqual({ ok: false, code: "disabled" });
  });

  it("refuses the console OTP provider", async () => {
    await inProduction();
    const sms = await import("@/lib/integrations/sms");
    expect(() => sms.smsProvider()).toThrow(sms.SmsNotConfiguredError);
    expect(sms.smsStatus().ready).toBe(false);
  });

  it("does not offer Click/Payme without credentials", async () => {
    await inProduction();
    vi.stubEnv("CLICK_SECRET_KEY", "");
    vi.stubEnv("PAYME_KEY", "");
    const core = await import("@/lib/payments/core");
    expect(core.enabledMethods()).toEqual(["cash"]);
  });

  it("rejects the placeholder session secret", async () => {
    await inProduction();
    vi.stubEnv("SESSION_SECRET", "change-me-to-a-long-random-string-at-least-32-chars");
    const env = await import("@/lib/env");
    expect(() => env.sessionSecret()).toThrow();
  });
});
