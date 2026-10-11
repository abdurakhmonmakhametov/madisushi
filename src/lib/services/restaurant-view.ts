// Builds everything the storefront menu needs for the restaurant: the branch
// to show (explicit ?branch, else the one delivering to the saved address,
// else the first), its menu, opening status and delivery terms.
import { tr, type Lang } from "../i18n/dict";
import { db } from "../db";
import { getAddressCookie } from "../address-cookie";
import { hoursForDate, isOpenAt, openWindows } from "../schedule";
import { formatTime, minutesToHHMM, todayLocal } from "../time";
import { bestZone, listBranches, loadMenu, loadZones, type BrandCard } from "./catalog";
import type { MenuViewProps } from "@/components/menu/MenuView";

export type MenuSearch = { branch?: string; p?: string };

export async function loadRestaurantView(brand: BrandCard, sp: MenuSearch, lang: Lang): Promise<MenuViewProps | null> {
  const branches = await listBranches(brand.id);
  if (branches.length === 0) return null;

  const address = await getAddressCookie();
  const zones = await loadZones(db, brand.id);
  const addressZone = address ? bestZone(zones, [address.lat, address.lng]) : null;
  const explicit = sp.branch ? branches.find((b) => b.id === sp.branch || b.slug === sp.branch) : undefined;
  const branch = explicit ?? branches.find((b) => b.id === addressZone?.branch_id) ?? branches[0];

  const menu = await loadMenu(db, brand.id, branch.id);
  const now = new Date();
  const today = todayLocal(now);
  const h = hoursForDate(branch.hours, branch.closed_dates, today);
  const open = isOpenAt(branch.hours, branch.closed_dates, now);
  const nextOpen = open ? null : (openWindows(branch.hours, branch.closed_dates, today, 7).find((w) => w.start > now)?.start ?? null);
  const zoneHere = address ? bestZone(zones, [address.lat, address.lng], branch.id) : null;

  return {
    brand: { id: brand.id, slug: brand.slug, name: brand.name, logoUrl: brand.logo_url, tagline: tr(brand.tagline, lang), reservations: brand.reservations },
    branch: { id: branch.id, slug: branch.slug, name: branch.name, address: branch.address, phone: branch.phone, acceptsDelivery: branch.accepts_delivery, acceptsPickup: branch.accepts_pickup },
    branches: branches.map((b) => ({ id: b.id, slug: b.slug, name: b.name })),
    categories: menu.categories,
    products: menu.products,
    serviceItems: menu.serviceItems.map((s) => ({ id: s.id, name: s.name, imageUrl: s.imageUrl, price: s.price, kind: s.kind as "packaging" | "cutlery", defaultInCart: s.defaultInCart && s.available })),
    status: {
      open,
      hoursToday: h ? { open: minutesToHHMM(h.open_minute), close: minutesToHHMM(h.close_minute) } : null,
      nextOpen: nextOpen ? formatTime(nextOpen) : null,
    },
    delivery: !address
      ? { state: "no_address" }
      : zoneHere
        ? {
            state: "ok",
            fee: zoneHere.fee,
            surcharge: zoneHere.surcharge,
            minOrder: zoneHere.min_order,
            freeFrom: zoneHere.free_delivery_from,
            minutes: branch.prep_minutes + branch.delivery_minutes + zoneHere.extra_minutes,
          }
        : { state: "outside" },
    addressBranchId: addressZone && addressZone.branch_id !== branch.id ? addressZone.branch_id : null,
    explicitBranch: Boolean(explicit),
    initialProductSlug: sp.p ?? null,
  };
}
