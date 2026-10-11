// Cart pricing (pure). The server runs this against freshly loaded catalog
// data for every quote and again inside the order transaction; the browser
// never supplies prices.
import { applyBps, percentOf } from "./money";

export type I18n = { uz: string; ru?: string };

export interface CatalogOption {
  id: string;
  name: I18n;
  priceDelta: number;
  isActive: boolean;
  isDefault?: boolean;
}

export interface CatalogGroup {
  id: string;
  kind: "variant" | "extra";
  name: I18n;
  minSelect: number;
  maxSelect: number;
  options: CatalogOption[];
}

export interface CatalogProduct {
  id: string;
  brandId: string;
  kind: "dish" | "packaging" | "cutlery";
  name: I18n;
  imageUrl: string | null;
  /** Effective price for the branch (override or base). */
  price: number;
  packagingFee: number;
  /** Active, and available at the branch. */
  available: boolean;
  groups: CatalogGroup[];
}

export interface CartLineInput {
  productId: string;
  optionIds: string[];
  quantity: number;
}

export interface Zone {
  id: string;
  fee: number;
  minOrder: number;
  freeDeliveryFrom: number | null;
  surcharge: number;
  extraMinutes: number;
}

export interface PromoRule {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  maxDiscount: number | null;
  minSubtotal: number;
}

export interface LoyaltyRules {
  enabled: boolean;
  earnBps: number;
  /** Absolute cap per order, UZS. */
  maxSpendAmount: number;
  /** Cap as share of (subtotal - discount), basis points. */
  maxSpendBps: number;
}

export interface QuoteLine {
  productId: string;
  kind: CatalogProduct["kind"];
  name: I18n;
  imageUrl: string | null;
  options: { groupId: string; group: I18n; optionId: string; name: I18n; priceDelta: number }[];
  unitPrice: number;
  packagingFeeUnit: number;
  quantity: number;
  lineTotal: number;
}

export type QuoteIssue =
  | { code: "empty" }
  | { code: "unavailable"; productId: string }
  | { code: "unknown_product"; productId: string }
  | { code: "invalid_options"; productId: string }
  | { code: "wrong_brand"; productId: string }
  | { code: "below_minimum"; minimum: number }
  | { code: "promo_min_subtotal"; minimum: number }
  | { code: "loyalty_exceeds_limit"; maximum: number };

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  packagingTotal: number;
  deliveryFee: number;
  zoneSurcharge: number;
  discountTotal: number;
  loyaltySpent: number;
  loyaltyMax: number;
  total: number;
  minimumOrder: number;
  freeDeliveryFrom: number | null;
  issues: QuoteIssue[];
}

export const MAX_LINES = 50;
export const MAX_QTY = 99;

export function priceLine(product: CatalogProduct, optionIds: string[]): { ok: true; unitPrice: number; options: QuoteLine["options"] } | { ok: false } {
  const selected = new Set(optionIds);
  const options: QuoteLine["options"] = [];
  let unit = product.price;
  let matched = 0;
  for (const g of product.groups) {
    const picked = g.options.filter((o) => selected.has(o.id));
    if (picked.some((o) => !o.isActive)) return { ok: false };
    if (picked.length < g.minSelect || picked.length > g.maxSelect) return { ok: false };
    for (const o of picked) {
      unit += o.priceDelta;
      matched++;
      options.push({ groupId: g.id, group: g.name, optionId: o.id, name: o.name, priceDelta: o.priceDelta });
    }
  }
  if (matched !== selected.size || selected.size !== optionIds.length) return { ok: false };
  if (unit < 0) return { ok: false };
  return { ok: true, unitPrice: unit, options };
}

export function computeDiscount(promo: PromoRule | null, subtotal: number): number {
  if (!promo || subtotal < promo.minSubtotal) return 0;
  let d = promo.kind === "percent" ? percentOf(subtotal, promo.value) : promo.value;
  if (promo.maxDiscount !== null) d = Math.min(d, promo.maxDiscount);
  return Math.max(0, Math.min(d, subtotal));
}

export function loyaltyLimit(rules: LoyaltyRules, balance: number, subtotalAfterDiscount: number): number {
  if (!rules.enabled) return 0;
  return Math.max(0, Math.min(balance, rules.maxSpendAmount, applyBps(subtotalAfterDiscount, rules.maxSpendBps)));
}

export function quote(input: {
  brandId: string;
  lines: CartLineInput[];
  catalog: Map<string, CatalogProduct>;
  fulfillment: "delivery" | "pickup";
  zone: Zone | null;
  pickupMinOrder: number;
  promo: PromoRule | null;
  loyaltyRequested: number;
  loyaltyBalance: number;
  loyaltyRules: LoyaltyRules;
}): Quote {
  const issues: QuoteIssue[] = [];
  const lines: QuoteLine[] = [];

  for (const l of input.lines.slice(0, MAX_LINES)) {
    const p = input.catalog.get(l.productId);
    if (!p) {
      issues.push({ code: "unknown_product", productId: l.productId });
      continue;
    }
    if (p.brandId !== input.brandId) {
      issues.push({ code: "wrong_brand", productId: p.id });
      continue;
    }
    const qty = Math.trunc(l.quantity);
    if (!(qty >= 1 && qty <= MAX_QTY)) {
      issues.push({ code: "invalid_options", productId: p.id });
      continue;
    }
    const priced = priceLine(p, l.optionIds);
    if (!priced.ok) {
      issues.push({ code: "invalid_options", productId: p.id });
      continue;
    }
    if (!p.available) issues.push({ code: "unavailable", productId: p.id });
    lines.push({
      productId: p.id,
      kind: p.kind,
      name: p.name,
      imageUrl: p.imageUrl,
      options: priced.options,
      unitPrice: priced.unitPrice,
      packagingFeeUnit: p.packagingFee,
      quantity: qty,
      lineTotal: priced.unitPrice * qty,
    });
  }

  const dishLines = lines.filter((l) => l.kind === "dish");
  if (dishLines.length === 0) issues.push({ code: "empty" });

  // Items (dishes + cutlery) form the subtotal. Packaging is shown on its own:
  // per-dish container fees plus packaging items such as bags.
  const subtotal = lines.filter((l) => l.kind !== "packaging").reduce((s, l) => s + l.lineTotal, 0);
  const packagingTotal =
    lines.filter((l) => l.kind === "packaging").reduce((s, l) => s + l.lineTotal, 0) +
    dishLines.reduce((s, l) => s + l.packagingFeeUnit * l.quantity, 0);

  let deliveryFee = 0;
  let zoneSurcharge = 0;
  let minimumOrder = input.pickupMinOrder;
  let freeDeliveryFrom: number | null = null;
  if (input.fulfillment === "delivery" && input.zone) {
    const z = input.zone;
    minimumOrder = z.minOrder;
    freeDeliveryFrom = z.freeDeliveryFrom;
    deliveryFee = z.freeDeliveryFrom !== null && subtotal >= z.freeDeliveryFrom ? 0 : z.fee;
    zoneSurcharge = z.surcharge;
  }
  if (dishLines.length > 0 && subtotal < minimumOrder) issues.push({ code: "below_minimum", minimum: minimumOrder });

  if (input.promo && subtotal < input.promo.minSubtotal) {
    issues.push({ code: "promo_min_subtotal", minimum: input.promo.minSubtotal });
  }
  const discountTotal = computeDiscount(input.promo, subtotal);

  const loyaltyMax = loyaltyLimit(input.loyaltyRules, input.loyaltyBalance, subtotal - discountTotal);
  const requested = Math.max(0, Math.trunc(input.loyaltyRequested || 0));
  let loyaltySpent = requested;
  if (requested > loyaltyMax) {
    issues.push({ code: "loyalty_exceeds_limit", maximum: loyaltyMax });
    loyaltySpent = 0;
  }

  const total = subtotal + packagingTotal + deliveryFee + zoneSurcharge - discountTotal - loyaltySpent;
  return {
    lines,
    subtotal,
    packagingTotal,
    deliveryFee,
    zoneSurcharge,
    discountTotal,
    loyaltySpent,
    loyaltyMax,
    total,
    minimumOrder,
    freeDeliveryFrom,
    issues,
  };
}
