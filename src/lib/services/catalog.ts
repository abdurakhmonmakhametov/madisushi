// Storefront catalog reads. Everything reads live database rows, so admin
// edits (prices, availability, content) show up on the next request.
import { cache } from "react";
import { db, type Db } from "../db";
import type { CatalogGroup, CatalogProduct, I18n } from "../pricing";
import type { HoursRow } from "../schedule";
import { addDays, todayLocal } from "../time";
import { distanceMeters, pointInPolygon, type LatLng } from "../geo";

export interface BrandCard {
  id: string;
  slug: string;
  name: string;
  tagline: I18n;
  description: I18n;
  logo_url: string | null;
  cover_url: string | null;
  accent_color: string;
  cuisines: string[];
  branch_count: number;
  reservations: boolean;
}

export interface Cuisine {
  id: string;
  slug: string;
  name: I18n;
}

export interface BranchInfo {
  id: string;
  brand_id: string;
  slug: string;
  name: I18n;
  address: I18n;
  lat: number;
  lng: number;
  phone: string | null;
  is_active: boolean;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  prep_minutes: number;
  delivery_minutes: number;
  pickup_min_order: number;
  reservations_enabled: boolean;
  reservation_capacity: number;
  reservation_slot_minutes: number;
  reservation_duration_minutes: number;
  reservation_max_party: number;
  hours: HoursRow[];
  closed_dates: string[];
}

export interface ZoneRow {
  id: string;
  branch_id: string;
  name: I18n;
  polygon: LatLng[];
  fee: number;
  min_order: number;
  free_delivery_from: number | null;
  surcharge: number;
  surcharge_note: I18n | null;
  extra_minutes: number;
  priority: number;
  branch_lat: number;
  branch_lng: number;
}

export interface MenuProduct extends CatalogProduct {
  slug: string;
  categoryId: string | null;
  description: I18n;
  ingredients: I18n;
  allergens: string[];
  weightGrams: number | null;
  portion: I18n | null;
  badges: string[];
  basePrice: number;
  defaultInCart: boolean;
}

export interface CategoryNode {
  id: string;
  slug: string;
  name: I18n;
  icon: string | null;
  children: CategoryNode[];
}

export const listCuisines = cache(async (): Promise<Cuisine[]> => {
  return db.query<Cuisine>("select id, slug, name from public.cuisines order by sort, slug");
});

export const listBrands = cache(async (): Promise<BrandCard[]> => {
  return db.query<BrandCard>(
    `select b.id, b.slug, b.name, b.tagline, b.description, b.logo_url, b.cover_url, b.accent_color,
            coalesce((select array_agg(c.slug order by c.sort) from public.brand_cuisines bc join public.cuisines c on c.id = bc.cuisine_id where bc.brand_id = b.id), '{}') as cuisines,
            (select count(*)::int from public.branches br where br.brand_id = b.id and br.is_active) as branch_count,
            exists (select 1 from public.branches br where br.brand_id = b.id and br.is_active and br.reservations_enabled) as reservations
       from public.brands b
      where b.is_active
      order by b.sort, b.name`,
  );
});

export const getBrandBySlug = cache(async (slug: string): Promise<BrandCard | null> => {
  return (await listBrands()).find((b) => b.slug === slug) ?? null;
});

/** The site serves a single restaurant: the first active brand. */
export const getMainBrand = cache(async (): Promise<BrandCard | null> => {
  return (await listBrands())[0] ?? null;
});

export async function loadBranches(d: Db, where: { brandId?: string; branchId?: string; activeOnly?: boolean }): Promise<BranchInfo[]> {
  const today = todayLocal();
  const rows = await d.query<BranchInfo>(
    `select br.*,
            coalesce((select json_agg(json_build_object('weekday', h.weekday, 'open_minute', h.open_minute, 'close_minute', h.close_minute) order by h.weekday)
                        from public.branch_hours h where h.branch_id = br.id), '[]') as hours,
            coalesce((select array_agg(to_char(c.date, 'YYYY-MM-DD') order by c.date)
                        from public.branch_closures c where c.branch_id = br.id and c.date between $3::date and $4::date), '{}') as closed_dates
       from public.branches br
      where ($1::uuid is null or br.brand_id = $1) and ($2::uuid is null or br.id = $2)
        and (not $5 or br.is_active)
      order by br.sort, br.slug`,
    [where.brandId ?? null, where.branchId ?? null, addDays(today, -1), addDays(today, 60), where.activeOnly ?? true],
  );
  return rows;
}

export const listBranches = cache((brandId: string) => loadBranches(db, { brandId }));

export async function loadZones(d: Db, brandId: string): Promise<ZoneRow[]> {
  return d.query<ZoneRow>(
    `select z.id, z.branch_id, z.name, z.polygon, z.fee, z.min_order, z.free_delivery_from, z.surcharge, z.surcharge_note, z.extra_minutes, z.priority,
            br.lat as branch_lat, br.lng as branch_lng
       from public.delivery_zones z join public.branches br on br.id = z.branch_id
      where br.brand_id = $1 and br.is_active and br.accepts_delivery and z.is_active`,
    [brandId],
  );
}

/** Best zone covering a point: highest priority, then nearest branch, then cheapest. Optionally limited to one branch. */
export function bestZone(zones: ZoneRow[], point: LatLng, branchId?: string): ZoneRow | null {
  const hits = zones.filter((z) => (!branchId || z.branch_id === branchId) && pointInPolygon(point, z.polygon));
  const dist = (z: ZoneRow) => distanceMeters(point, [z.branch_lat, z.branch_lng]);
  hits.sort((a, b) => b.priority - a.priority || dist(a) - dist(b) || a.fee + a.surcharge - (b.fee + b.surcharge));
  return hits[0] ?? null;
}

interface ProductRow {
  id: string;
  brand_id: string;
  category_id: string | null;
  kind: CatalogProduct["kind"];
  slug: string;
  name: I18n;
  description: I18n;
  ingredients: I18n;
  allergens: string[];
  weight_grams: number | null;
  portion: I18n | null;
  base_price: number;
  packaging_fee: number;
  image_url: string | null;
  badges: string[];
  default_in_cart: boolean;
  price: number;
  available: boolean;
}

const PRODUCT_SELECT = `
  select p.id, p.brand_id, p.category_id, p.kind, p.slug, p.name, p.description, p.ingredients, p.allergens,
         p.weight_grams, p.portion, p.base_price, p.packaging_fee, p.image_url, p.badges, p.default_in_cart,
         coalesce(bp.price_override, p.base_price) as price,
         (p.is_active and coalesce(bp.is_available, true) and coalesce(c.is_active, true)
            and coalesce(pc.is_active, true)) as available
    from public.products p
    left join public.branch_products bp on bp.product_id = p.id and bp.branch_id = $1
    left join public.categories c on c.id = p.category_id
    left join public.categories pc on pc.id = c.parent_id`;

async function loadGroups(d: Db, productIds: string[]): Promise<Map<string, CatalogGroup[]>> {
  const out = new Map<string, CatalogGroup[]>();
  if (productIds.length === 0) return out;
  const rows = await d.query<{ product_id: string; id: string; kind: "variant" | "extra"; name: I18n; min_select: number; max_select: number; options: CatalogGroup["options"] }>(
    `select g.product_id, g.id, g.kind, g.name, g.min_select, g.max_select,
            coalesce((select json_agg(json_build_object('id', o.id, 'name', o.name, 'priceDelta', o.price_delta, 'isActive', o.is_active, 'isDefault', o.is_default) order by o.sort, o.price_delta)
                        from public.product_options o where o.group_id = g.id), '[]') as options
       from public.product_option_groups g
      where g.product_id = any($1::uuid[])
      order by g.sort, g.kind desc`,
    [productIds],
  );
  for (const r of rows) {
    const list = out.get(r.product_id) ?? [];
    list.push({ id: r.id, kind: r.kind, name: r.name, minSelect: r.min_select, maxSelect: r.max_select, options: r.options });
    out.set(r.product_id, list);
  }
  return out;
}

function toMenuProduct(r: ProductRow, groups: CatalogGroup[]): MenuProduct {
  return {
    id: r.id,
    brandId: r.brand_id,
    kind: r.kind,
    name: r.name,
    imageUrl: r.image_url,
    price: r.price,
    packagingFee: r.packaging_fee,
    available: r.available,
    groups,
    slug: r.slug,
    categoryId: r.category_id,
    description: r.description,
    ingredients: r.ingredients,
    allergens: r.allergens,
    weightGrams: r.weight_grams,
    portion: r.portion,
    badges: r.badges,
    basePrice: r.base_price,
    defaultInCart: r.default_in_cart,
  };
}

/** Pricing catalog for specific products at a branch (used for quotes and orders). */
export async function loadCatalog(d: Db, branchId: string, productIds: string[]): Promise<Map<string, CatalogProduct>> {
  const ids = [...new Set(productIds)].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (ids.length === 0) return new Map();
  const rows = await d.query<ProductRow>(`${PRODUCT_SELECT} where p.id = any($2::uuid[])`, [branchId, ids]);
  const groups = await loadGroups(d, rows.map((r) => r.id));
  return new Map(rows.map((r) => [r.id, toMenuProduct(r, groups.get(r.id) ?? [])]));
}

export async function loadMenu(d: Db, brandId: string, branchId: string) {
  const cats = await d.query<{ id: string; parent_id: string | null; slug: string; name: I18n; icon: string | null }>(
    "select id, parent_id, slug, name, icon from public.categories where brand_id = $1 and is_active order by sort, slug",
    [brandId],
  );
  const rows = await d.query<ProductRow>(`${PRODUCT_SELECT} where p.brand_id = $2 and p.is_active order by p.sort, p.slug`, [branchId, brandId]);
  const groups = await loadGroups(d, rows.map((r) => r.id));
  const products = rows.map((r) => toMenuProduct(r, groups.get(r.id) ?? []));

  const nodes = new Map<string, CategoryNode>(cats.map((c) => [c.id, { id: c.id, slug: c.slug, name: c.name, icon: c.icon, children: [] }]));
  const roots: CategoryNode[] = [];
  for (const c of cats) {
    const n = nodes.get(c.id)!;
    if (c.parent_id && nodes.has(c.parent_id)) nodes.get(c.parent_id)!.children.push(n);
    else if (!c.parent_id) roots.push(n);
  }
  return {
    categories: roots,
    products: products.filter((p) => p.kind === "dish" && (p.categoryId === null || nodes.has(p.categoryId))),
    serviceItems: products.filter((p) => p.kind !== "dish"),
  };
}

export interface BestsellerCard {
  id: string;
  slug: string;
  name: I18n;
  image_url: string | null;
  price: number;
  badges: string[];
  brand_slug: string;
  brand_name: string;
}

export const listBestsellers = cache(async (limit: number): Promise<BestsellerCard[]> => {
  return db.query<BestsellerCard>(
    `select p.id, p.slug, p.name, p.image_url, p.base_price as price, p.badges, b.slug as brand_slug, b.name as brand_name
       from public.products p join public.brands b on b.id = p.brand_id
       left join public.categories c on c.id = p.category_id
      where p.kind = 'dish' and p.is_active and b.is_active and coalesce(c.is_active, true) and 'bestseller' = any(p.badges)
      order by p.sort, p.slug limit $1`,
    [limit],
  );
});

export interface PromotionCard {
  id: string;
  title: I18n;
  body: I18n;
  image_url: string | null;
  brand_slug: string | null;
  promo_code: string | null;
  ends_at: string | null;
}

export const listPromotions = cache(async (): Promise<PromotionCard[]> => {
  return db.query<PromotionCard>(
    `select p.id, p.title, p.body, p.image_url, b.slug as brand_slug, pc.code as promo_code, p.ends_at
       from public.promotions p
       left join public.brands b on b.id = p.brand_id
       left join public.promo_codes pc on pc.id = p.promo_code_id
      where p.status = 'published' and (p.starts_at is null or p.starts_at <= now()) and (p.ends_at is null or p.ends_at > now())
      order by p.sort, p.created_at desc`,
  );
});

function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export async function search(q: string) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return { brands: [], products: [] };
  const pat = likePattern(term);
  const brands = await db.query<{ slug: string; name: string; logo_url: string | null; tagline: I18n }>(
    `select slug, name, logo_url, tagline from public.brands
      where is_active and (name ilike $1 or tagline->>'uz' ilike $1 or tagline->>'ru' ilike $1)
      order by sort limit 10`,
    [pat],
  );
  const products = await db.query<BestsellerCard>(
    `select p.id, p.slug, p.name, p.image_url, p.base_price as price, p.badges, b.slug as brand_slug, b.name as brand_name
       from public.products p join public.brands b on b.id = p.brand_id
       left join public.categories c on c.id = p.category_id
      where p.kind = 'dish' and p.is_active and b.is_active and coalesce(c.is_active, true)
        and (p.name->>'uz' ilike $1 or p.name->>'ru' ilike $1 or p.description->>'uz' ilike $1 or p.description->>'ru' ilike $1)
      order by (p.name->>'uz' ilike $1 or p.name->>'ru' ilike $1) desc, p.sort
      limit 30`,
    [pat],
  );
  return { brands, products };
}
