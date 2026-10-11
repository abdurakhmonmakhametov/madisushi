"use client";

// The customer's current delivery address. Stored in a readable cookie so
// server components can pick the right branch and fees for it.
import { useSyncExternalStore } from "react";

export interface CurrentAddress {
  text: string;
  lat: number;
  lng: number;
  house?: string | null;
  apartment?: string | null;
  floor?: string | null;
  entrance?: string | null;
  instructions?: string | null;
  savedId?: string | null;
}

export const ADDRESS_COOKIE = "sushi_addr";
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: CurrentAddress | null } = { raw: null, value: null };

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.split("; ").find((c) => c.startsWith(`${ADDRESS_COOKIE}=`));
  return m ? decodeURIComponent(m.slice(ADDRESS_COOKIE.length + 1)) : null;
}

function snapshot(): CurrentAddress | null {
  const raw = readCookie();
  if (raw === cached.raw) return cached.value;
  let value: CurrentAddress | null = null;
  try {
    value = raw ? (JSON.parse(raw) as CurrentAddress) : null;
  } catch {
    value = null;
  }
  cached = { raw, value };
  return value;
}

export function setAddress(a: CurrentAddress | null) {
  if (a) {
    const v = encodeURIComponent(JSON.stringify(a));
    document.cookie = `${ADDRESS_COOKIE}=${v}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
  } else {
    document.cookie = `${ADDRESS_COOKIE}=; path=/; max-age=0`;
  }
  listeners.forEach((l) => l());
}

export function useAddress(): CurrentAddress | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => null,
  );
}
