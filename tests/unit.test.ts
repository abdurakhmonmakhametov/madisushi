import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applyBps, formatUZS, parseAmount, percentOf } from "@/lib/money";
import { quote, priceLine, type CatalogProduct, type LoyaltyRules } from "@/lib/pricing";
import { checkPromo, type PromoRow } from "@/lib/promo";
import { availableSlots, checkSchedule, isOpenAt, type HoursRow } from "@/lib/schedule";
import { localParts, localToUtc } from "@/lib/time";
import { canTransition, nextStatuses, staffCanSet } from "@/lib/order-status";
import { circlePolygon, pointInPolygon } from "@/lib/geo";
import { clickSign } from "@/lib/payments/click";
import { decimalToTiyin } from "@/lib/payments/core";
import { normalizePhone } from "@/lib/auth/otp";

describe("money", () => {
  it("formats UZS with grouped digits", () => {
    expect(formatUZS(125600)).toBe("125 600 UZS");
    expect(formatUZS(0)).toBe("0 UZS");
  });
  it("rejects fractional amounts", () => {
    expect(() => formatUZS(1.5)).toThrow();
  });
  it("uses integer percent/bps math", () => {
    expect(percentOf(99999, 10)).toBe(9999);
    expect(applyBps(123457, 500)).toBe(6172);
  });
  it("parses user input", () => {
    expect(parseAmount("20 000")).toBe(20000);
    expect(parseAmount("12.5")).toBeNull();
  });
});

const rules: LoyaltyRules = { enabled: true, earnBps: 500, maxSpendAmount: 20000, maxSpendBps: 3000 };

function product(over: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "p1",
    brandId: "b1",
    kind: "dish",
    name: { uz: "Roll" },
    imageUrl: null,
    price: 50000,
    packagingFee: 1000,
    available: true,
    groups: [
      {
        id: "g1",
        kind: "variant",
        name: { uz: "Size" },
        minSelect: 1,
        maxSelect: 1,
        options: [
          { id: "o8", name: { uz: "8" }, priceDelta: 0, isActive: true },
          { id: "o16", name: { uz: "16" }, priceDelta: 40000, isActive: true },
        ],
      },
      {
        id: "g2",
        kind: "extra",
        name: { uz: "Sauce" },
        minSelect: 0,
        maxSelect: 2,
        options: [
          { id: "s1", name: { uz: "Spicy" }, priceDelta: 4000, isActive: true },
          { id: "s2", name: { uz: "Unagi" }, priceDelta: 4000, isActive: true },
          { id: "s3", name: { uz: "Old" }, priceDelta: 1000, isActive: false },
        ],
      },
    ],
    ...over,
  };
}

const bag: CatalogProduct = { id: "bag", brandId: "b1", kind: "packaging", name: { uz: "Bag" }, imageUrl: null, price: 2000, packagingFee: 0, available: true, groups: [] };
const sticks: CatalogProduct = { id: "st", brandId: "b1", kind: "cutlery", name: { uz: "Sticks" }, imageUrl: null, price: 0, packagingFee: 0, available: true, groups: [] };

function baseQuote(over: Partial<Parameters<typeof quote>[0]> = {}) {
  return quote({
    brandId: "b1",
    lines: [{ productId: "p1", optionIds: ["o16", "s1"], quantity: 2 }, { productId: "bag", optionIds: [], quantity: 1 }, { productId: "st", optionIds: [], quantity: 2 }],
    catalog: new Map([["p1", product()], ["bag", bag], ["st", sticks]]),
    fulfillment: "delivery",
    zone: { id: "z", fee: 18000, minOrder: 80000, freeDeliveryFrom: null, surcharge: 25000, extraMinutes: 0 },
    pickupMinOrder: 0,
    promo: null,
    loyaltyRequested: 0,
    loyaltyBalance: 0,
    loyaltyRules: rules,
    ...over,
  });
}

describe("pricing", () => {
  it("prices variants and extras", () => {
    const r = priceLine(product(), ["o16", "s1", "s2"]);
    expect(r).toEqual(expect.objectContaining({ ok: true, unitPrice: 98000 }));
  });
  it("rejects missing required variant, inactive or foreign options, and too many extras", () => {
    expect(priceLine(product(), []).ok).toBe(false);
    expect(priceLine(product(), ["o8", "s3"]).ok).toBe(false);
    expect(priceLine(product(), ["o8", "nope"]).ok).toBe(false);
    expect(priceLine(product(), ["o8", "o16"]).ok).toBe(false);
    expect(priceLine(product(), ["o8", "o8"]).ok).toBe(false);
  });
  it("computes a delivery total with packaging, fee and zone surcharge", () => {
    const q = baseQuote();
    // 2 x (50000 + 40000 + 4000) = 188000, cutlery 0
    expect(q.subtotal).toBe(188000);
    // bag 2000 + 2 dishes x 1000 container fee
    expect(q.packagingTotal).toBe(4000);
    expect(q.deliveryFee).toBe(18000);
    expect(q.zoneSurcharge).toBe(25000);
    expect(q.total).toBe(188000 + 4000 + 18000 + 25000);
    expect(q.issues).toEqual([]);
  });
  it("pickup has no delivery charges", () => {
    const q = baseQuote({ fulfillment: "pickup", zone: null });
    expect(q.deliveryFee + q.zoneSurcharge).toBe(0);
    expect(q.total).toBe(188000 + 4000);
  });
  it("applies free delivery threshold but keeps the zone surcharge", () => {
    const q = baseQuote({ zone: { id: "z", fee: 18000, minOrder: 0, freeDeliveryFrom: 150000, surcharge: 25000, extraMinutes: 0 } });
    expect(q.deliveryFee).toBe(0);
    expect(q.zoneSurcharge).toBe(25000);
  });
  it("flags minimum order and unavailable items", () => {
    const q = baseQuote({
      lines: [{ productId: "p1", optionIds: ["o8"], quantity: 1 }],
      catalog: new Map([["p1", product({ available: false })]]),
    });
    expect(q.issues).toEqual(expect.arrayContaining([{ code: "unavailable", productId: "p1" }, { code: "below_minimum", minimum: 80000 }]));
  });
  it("flags an empty cart and products from another brand", () => {
    expect(baseQuote({ lines: [] }).issues).toContainEqual({ code: "empty" });
    const q = baseQuote({ catalog: new Map([["p1", product({ brandId: "other" })], ["bag", bag], ["st", sticks]]) });
    expect(q.issues).toContainEqual({ code: "wrong_brand", productId: "p1" });
  });
  it("percent promo respects cap; fixed promo cannot exceed subtotal", () => {
    const pct = baseQuote({ promo: { id: "x", code: "P", kind: "percent", value: 20, maxDiscount: 30000, minSubtotal: 0 } });
    expect(pct.discountTotal).toBe(30000);
    const fixed = baseQuote({
      lines: [{ productId: "st", optionIds: [], quantity: 1 }, { productId: "p1", optionIds: ["o8"], quantity: 1 }],
      zone: null,
      fulfillment: "pickup",
      promo: { id: "x", code: "F", kind: "fixed", value: 999999, maxDiscount: null, minSubtotal: 0 },
    });
    expect(fixed.discountTotal).toBe(fixed.subtotal);
    expect(fixed.total).toBe(fixed.packagingTotal);
  });
  it("promo below its minimum gives no discount and an issue", () => {
    const q = baseQuote({ promo: { id: "x", code: "P", kind: "fixed", value: 10000, maxDiscount: null, minSubtotal: 500000 } });
    expect(q.discountTotal).toBe(0);
    expect(q.issues).toContainEqual({ code: "promo_min_subtotal", minimum: 500000 });
  });
  it("caps loyalty by balance, absolute and share limits and rejects overspend", () => {
    const ok = baseQuote({ loyaltyRequested: 20000, loyaltyBalance: 50000 });
    expect(ok.loyaltyMax).toBe(20000);
    expect(ok.loyaltySpent).toBe(20000);
    const tooMuch = baseQuote({ loyaltyRequested: 20001, loyaltyBalance: 50000 });
    expect(tooMuch.loyaltySpent).toBe(0);
    expect(tooMuch.issues).toContainEqual({ code: "loyalty_exceeds_limit", maximum: 20000 });
    const poor = baseQuote({ loyaltyRequested: 5000, loyaltyBalance: 3000 });
    expect(poor.issues).toContainEqual({ code: "loyalty_exceeds_limit", maximum: 3000 });
    const disabled = baseQuote({ loyaltyRequested: 1, loyaltyBalance: 50000, loyaltyRules: { ...rules, enabled: false } });
    expect(disabled.loyaltyMax).toBe(0);
  });
});

describe("promo eligibility", () => {
  const promo: PromoRow = {
    id: "p",
    code: "X",
    kind: "percent",
    value: 10,
    max_discount: null,
    min_subtotal: 0,
    starts_at: "2026-01-01T00:00:00Z",
    ends_at: "2026-12-31T00:00:00Z",
    usage_limit_total: 5,
    usage_limit_per_customer: 1,
    used_count: 0,
    is_active: true,
    brand_ids: ["b1"],
  };
  const now = new Date("2026-06-01T00:00:00Z");
  it("accepts a valid code", () => expect(checkPromo(promo, { now, brandId: "b1", customerUses: 0 })).toBeNull());
  it("rejects each invalid case", () => {
    expect(checkPromo(null, { now, brandId: "b1", customerUses: 0 })).toBe("not_found");
    expect(checkPromo({ ...promo, is_active: false }, { now, brandId: "b1", customerUses: 0 })).toBe("inactive");
    expect(checkPromo(promo, { now: new Date("2025-01-01"), brandId: "b1", customerUses: 0 })).toBe("not_started");
    expect(checkPromo(promo, { now: new Date("2027-01-01"), brandId: "b1", customerUses: 0 })).toBe("expired");
    expect(checkPromo(promo, { now, brandId: "b2", customerUses: 0 })).toBe("brand_not_allowed");
    expect(checkPromo({ ...promo, used_count: 5 }, { now, brandId: "b1", customerUses: 0 })).toBe("usage_limit");
    expect(checkPromo(promo, { now, brandId: "b1", customerUses: 1 })).toBe("customer_limit");
    expect(checkPromo(promo, { now, brandId: "b1", customerUses: null })).toBe("login_required");
  });
});

describe("Tashkent time and scheduling", () => {
  // 10:00 - 02:00 every day
  const hours: HoursRow[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, open_minute: 600, close_minute: 1560 }));
  const rules = { slotMinutes: 15, maxDaysAhead: 2 };

  it("converts local time to UTC (+05:00)", () => {
    expect(localToUtc("2026-09-22", 600).toISOString()).toBe("2026-09-22T05:00:00.000Z");
    expect(localParts(new Date("2026-09-21T20:30:00Z"))).toEqual({ date: "2026-09-22", weekday: 2, minutes: 90 });
  });
  it("is open after midnight on a window that runs past midnight", () => {
    expect(isOpenAt(hours, [], new Date("2026-09-21T20:30:00Z"))).toBe(true); // 01:30 local
    expect(isOpenAt(hours, [], new Date("2026-09-22T00:00:00Z"))).toBe(false); // 05:00 local
  });
  it("respects holiday closures", () => {
    expect(isOpenAt(hours, ["2026-09-22"], new Date("2026-09-22T07:00:00Z"))).toBe(false);
  });
  it("ASAP requires the kitchen to be open long enough", () => {
    expect(checkSchedule({ hours, closedDates: [], now: new Date("2026-09-22T07:00:00Z"), leadMinutes: 60, rules, asap: true }).ok).toBe(true);
    // 01:30 local, closes 02:00, lead 60 -> too late
    expect(checkSchedule({ hours, closedDates: [], now: new Date("2026-09-21T20:30:00Z"), leadMinutes: 60, rules, asap: true }).error).toBe("closed_now");
  });
  it("validates scheduled times", () => {
    const now = new Date("2026-09-22T07:00:00Z"); // 12:00 local
    const at = (iso: string) => checkSchedule({ hours, closedDates: [], now, leadMinutes: 60, rules, asap: false, scheduledFor: new Date(iso) });
    expect(at("2026-09-22T09:00:00Z").ok).toBe(true);
    expect(at("2026-09-22T07:30:00Z").error).toBe("too_soon");
    expect(at("2026-09-23T00:00:00Z").error).toBe("outside_hours"); // 05:00 local
    expect(at("2026-09-23T05:30:00Z").error).toBe("outside_hours"); // 10:30, needs open since 09:30
    expect(at("2026-09-23T06:00:00Z").ok).toBe(true); // 11:00
    expect(at("2026-09-26T09:00:00Z").error).toBe("too_far");
  });
  it("offers only valid slots", () => {
    const now = new Date("2026-09-22T07:00:00Z");
    const slots = availableSlots({ hours, closedDates: [], now, leadMinutes: 60, rules });
    expect(slots.length).toBeGreaterThan(50);
    expect(slots[0].toISOString()).toBe("2026-09-22T08:00:00.000Z");
    for (const s of slots) expect(checkSchedule({ hours, closedDates: [], now, leadMinutes: 60, rules, asap: false, scheduledFor: s }).ok).toBe(true);
  });
});

describe("order state machine", () => {
  it("follows delivery and pickup paths", () => {
    expect(nextStatuses("delivery", "ready")).toEqual(["out_for_delivery", "cancelled"]);
    expect(nextStatuses("pickup", "ready")).toEqual(["picked_up", "cancelled"]);
    expect(canTransition("delivery", "new", "delivered")).toBe(false);
    expect(canTransition("pickup", "ready", "out_for_delivery")).toBe(false);
    expect(nextStatuses("delivery", "delivered")).toEqual([]);
  });
  it("kitchen cannot cancel", () => {
    expect(staffCanSet("kitchen", "cancelled")).toBe(false);
    expect(staffCanSet("branch_manager", "cancelled")).toBe(true);
  });
});

describe("geo", () => {
  it("point in polygon", () => {
    const poly = circlePolygon([41.3, 69.2], 3000);
    expect(pointInPolygon([41.3, 69.2], poly)).toBe(true);
    expect(pointInPolygon([41.4, 69.2], poly)).toBe(false);
  });
});

describe("integrations helpers", () => {
  it("builds the Click signature in the documented order", () => {
    const p = { click_trans_id: "1", service_id: "2", merchant_trans_id: "abc", amount: "1000.00", action: "0", sign_time: "2026-01-01 10:00:00" };
    const md5 = (s: string) => createHash("md5").update(s).digest("hex");
    expect(clickSign(p, "SECRET")).toBe(md5("12SECRETabc1000.0002026-01-01 10:00:00"));
    const complete = { ...p, action: "1", merchant_prepare_id: "100001" };
    expect(clickSign(complete, "SECRET")).toBe(md5("12SECRETabc1000011000.0012026-01-01 10:00:00"));
  });
  it("parses decimal amounts to tiyin without floats", () => {
    expect(decimalToTiyin("125600.00")).toBe(12560000);
    expect(decimalToTiyin("125600")).toBe(12560000);
    expect(decimalToTiyin("0.1")).toBe(10);
    expect(decimalToTiyin("1e5")).toBeNull();
  });
  it("normalizes Uzbek phone numbers", () => {
    expect(normalizePhone("+998 90 123 45 67")).toBe("+998901234567");
    expect(normalizePhone("901234567")).toBe("+998901234567");
    expect(normalizePhone("+998 +998 90 123 45 67")).toBe("+998901234567");
    expect(normalizePhone("+7 900 123 45 67")).toBeNull();
  });
});
