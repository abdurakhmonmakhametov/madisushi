"use client";

// Client cart persisted in localStorage. Prices here are for display only;
// the server re-prices every quote and order.
import { useSyncExternalStore } from "react";
import type { I18n } from "@/lib/pricing";

export interface CartLine {
  key: string;
  productId: string;
  optionIds: string[];
  qty: number;
  name: I18n;
  imageUrl: string | null;
  unitPrice: number;
  kind: "dish" | "packaging" | "cutlery";
  optionNames: I18n[];
}

export interface CartState {
  brandId: string | null;
  brandSlug: string | null;
  brandName: string | null;
  branchId: string | null;
  branchName: I18n | null;
  fulfillment: "delivery" | "pickup";
  lines: CartLine[];
  comment: string;
}

export interface CartContext {
  brandId: string;
  brandSlug: string;
  brandName: string;
  branchId: string;
  branchName: I18n;
}

export interface ServiceItem {
  id: string;
  name: I18n;
  imageUrl: string | null;
  price: number;
  kind: "packaging" | "cutlery";
  defaultInCart: boolean;
}

const KEY = "sushi_cart_v1";
const EMPTY: CartState = { brandId: null, brandSlug: null, brandName: null, branchId: null, branchName: null, fulfillment: "delivery", lines: [], comment: "" };

let state: CartState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CartState;
      if (parsed && Array.isArray(parsed.lines)) state = { ...EMPTY, ...parsed };
    }
  } catch {
    state = EMPTY;
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    try {
      state = e.newValue ? { ...EMPTY, ...JSON.parse(e.newValue) } : EMPTY;
    } catch {
      state = EMPTY;
    }
    listeners.forEach((l) => l());
  });
}

function set(next: CartState) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  load();
  return state;
}

export function useCart(): CartState {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function lineKey(productId: string, optionIds: string[]) {
  return `${productId}:${[...optionIds].sort().join(",")}`;
}

export function dishCount(s: CartState) {
  return s.lines.filter((l) => l.kind === "dish").reduce((n, l) => n + l.qty, 0);
}

export function cartTotal(s: CartState) {
  return s.lines.reduce((n, l) => n + l.unitPrice * l.qty, 0);
}

export type AddResult = { ok: true } | { ok: false; conflict: "brand" | "branch"; current: CartState };

export const cart = {
  get: () => getSnapshot(),

  /** Checks whether adding for this brand/branch would conflict with the current cart. */
  conflictFor(ctx: CartContext): "brand" | "branch" | null {
    const s = getSnapshot();
    if (s.lines.filter((l) => l.kind === "dish").length === 0) return null;
    if (s.brandId !== ctx.brandId) return "brand";
    if (s.branchId !== ctx.branchId) return "branch";
    return null;
  },

  add(ctx: CartContext, line: Omit<CartLine, "key">, services: ServiceItem[]): AddResult {
    const s = getSnapshot();
    const conflict = cart.conflictFor(ctx);
    if (conflict) return { ok: false, conflict, current: s };
    const base: CartState =
      s.brandId === ctx.brandId && s.branchId === ctx.branchId
        ? s
        : { ...EMPTY, fulfillment: s.fulfillment, ...ctx, lines: [] };
    const key = lineKey(line.productId, line.optionIds);
    let lines = [...base.lines];
    const existing = lines.find((l) => l.key === key);
    if (existing) lines = lines.map((l) => (l.key === key ? { ...l, qty: Math.min(99, l.qty + line.qty) } : l));
    else if (line.kind === "dish") {
      // keep dishes above service items (bag, chopsticks)
      const firstService = lines.findIndex((l) => l.kind !== "dish");
      lines.splice(firstService === -1 ? lines.length : firstService, 0, { ...line, key });
    } else lines.push({ ...line, key });
    // offer default service items (bag, chopsticks) once
    for (const sv of services.filter((x) => x.defaultInCart)) {
      if (!lines.some((l) => l.productId === sv.id)) {
        lines.push({ key: lineKey(sv.id, []), productId: sv.id, optionIds: [], qty: 1, name: sv.name, imageUrl: sv.imageUrl, unitPrice: sv.price, kind: sv.kind, optionNames: [] });
      }
    }
    set({ ...base, ...ctx, lines });
    return { ok: true };
  },

  setQty(key: string, qty: number) {
    const s = getSnapshot();
    const lines = qty <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(99, qty) } : l));
    if (!lines.some((l) => l.kind === "dish")) set({ ...EMPTY, fulfillment: s.fulfillment });
    else set({ ...s, lines });
  },

  setFulfillment(f: CartState["fulfillment"]) {
    set({ ...getSnapshot(), fulfillment: f });
  },

  setComment(comment: string) {
    set({ ...getSnapshot(), comment: comment.slice(0, 500) });
  },

  /** Moves a cart to another branch of the same brand with fresh prices. */
  moveToBranch(ctx: CartContext, priceOf: (l: CartLine) => number) {
    const s = getSnapshot();
    set({ ...s, ...ctx, lines: s.lines.map((l) => ({ ...l, unitPrice: priceOf(l) })) });
  },

  replaceLines(ctx: CartContext, lines: Omit<CartLine, "key">[], services: ServiceItem[], fulfillment?: CartState["fulfillment"]) {
    set({ ...EMPTY, fulfillment: fulfillment ?? getSnapshot().fulfillment, ...ctx, lines: [] });
    for (const l of lines) cart.add(ctx, l, services);
  },

  clear() {
    set({ ...EMPTY, fulfillment: getSnapshot().fulfillment });
  },
};
