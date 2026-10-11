// Order fulfillment state machine. Mirrors app.order_transition_allowed() in
// the database, which remains the final authority.

export type Fulfillment = "delivery" | "pickup";
export type OrderStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "picked_up"
  | "cancelled";
export type PaymentStatus = "unpaid" | "pending" | "paid" | "failed" | "refund_pending" | "refunded" | "partially_refunded";
export type StaffRole = "super_admin" | "branch_manager" | "kitchen";

export const TERMINAL: OrderStatus[] = ["delivered", "picked_up", "cancelled"];

export function nextStatuses(f: Fulfillment, s: OrderStatus): OrderStatus[] {
  switch (s) {
    case "new":
      return ["confirmed", "cancelled"];
    case "confirmed":
      return ["preparing", "cancelled"];
    case "preparing":
      return ["ready", "cancelled"];
    case "ready":
      return [f === "delivery" ? "out_for_delivery" : "picked_up", "cancelled"];
    case "out_for_delivery":
      return ["delivered", "cancelled"];
    default:
      return [];
  }
}

export function canTransition(f: Fulfillment, from: OrderStatus, to: OrderStatus): boolean {
  return nextStatuses(f, from).includes(to);
}

/** What a staff role may do from the admin UI (DB triggers enforce the same). */
export function staffCanSet(role: StaffRole, to: OrderStatus): boolean {
  if (role === "kitchen") return to !== "cancelled";
  return true;
}

export function timeline(f: Fulfillment): OrderStatus[] {
  return f === "delivery"
    ? ["new", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"]
    : ["new", "confirmed", "preparing", "ready", "picked_up"];
}

/** Customers may cancel only before the restaurant confirms. */
export function customerCanCancel(s: OrderStatus): boolean {
  return s === "new";
}

export const CANCEL_REASONS = ["customer_request", "out_of_stock", "cannot_deliver", "payment_failed", "duplicate", "other"] as const;
