// Promo code eligibility (pure). Usage counts are re-read under a row lock
// inside the order transaction, so limits hold under concurrency.

export interface PromoRow {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  max_discount: number | null;
  min_subtotal: number;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  usage_limit_total: number | null;
  usage_limit_per_customer: number | null;
  used_count: number;
  is_active: boolean;
  brand_ids: string[];
}

export type PromoError =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "brand_not_allowed"
  | "usage_limit"
  | "customer_limit"
  | "login_required";

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function checkPromo(
  promo: PromoRow | null,
  ctx: { now: Date; brandId: string; customerUses: number | null },
): PromoError | null {
  if (!promo) return "not_found";
  if (!promo.is_active) return "inactive";
  if (promo.starts_at && new Date(promo.starts_at) > ctx.now) return "not_started";
  if (promo.ends_at && new Date(promo.ends_at) <= ctx.now) return "expired";
  if (promo.brand_ids.length > 0 && !promo.brand_ids.includes(ctx.brandId)) return "brand_not_allowed";
  if (promo.usage_limit_total !== null && promo.used_count >= promo.usage_limit_total) return "usage_limit";
  if (promo.usage_limit_per_customer !== null) {
    if (ctx.customerUses === null) return "login_required";
    if (ctx.customerUses >= promo.usage_limit_per_customer) return "customer_limit";
  }
  return null;
}
