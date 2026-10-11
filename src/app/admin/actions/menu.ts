"use server";

// Menu administration. All writes run under RLS as the staff member
// (asActor), so the database enforces who may change what.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asActor, pgErrorCode } from "@/lib/db";
import { assertStaff, ForbiddenError } from "@/lib/admin/guard";
import { makeL } from "@/lib/admin/l";
import { getLang } from "@/lib/i18n/server";
import { saveImage, UploadError } from "@/lib/integrations/storage";
import type { ActionState } from "@/components/admin/ui";

const uuid = z.string().uuid();
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,80}$/);
const money = z.coerce.number().int().min(0).max(100_000_000);
const ALLERGENS = ["gluten", "fish", "shellfish", "soy", "sesame", "egg", "milk", "nuts", "peanuts", "mustard"];
const BADGES = ["bestseller", "spicy", "new", "vegetarian"];

function i18n(fd: FormData, name: string, required = true) {
  const uz = String(fd.get(`${name}_uz`) ?? "").trim();
  const ru = String(fd.get(`${name}_ru`) ?? "").trim();
  if (required && !uz) throw new z.ZodError([{ code: "custom", path: [name], message: "required" }]);
  return { uz: uz.slice(0, 2000), ru: ru.slice(0, 2000) };
}

async function audit(d: import("@/lib/db").Db, staffId: string, action: string, entity: string, entityId: string, data: unknown, branchId: string | null = null) {
  await d.query("insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, branch_id, data) values ('staff', $1, $2, $3, $4, $5, $6)", [
    staffId,
    action,
    entity,
    entityId,
    branchId,
    JSON.stringify(data),
  ]);
}

async function handle(fn: (L: ReturnType<typeof makeL>) => Promise<ActionState>): Promise<ActionState> {
  const L = makeL(await getLang());
  try {
    return await fn(L);
  } catch (e) {
    if (e instanceof ForbiddenError || pgErrorCode(e) === "42501") return { error: L("Ruxsat yo'q", "Нет доступа") };
    if (e instanceof z.ZodError) return { error: `${L("Maydonlarni tekshiring", "Проверьте поля")}: ${e.issues.map((i) => i.path.join(".")).join(", ")}` };
    if (e instanceof UploadError) return { error: `${L("Rasm yuklanmadi", "Изображение не загружено")}: ${e.message} (PNG/JPEG/WebP ≤ 2MB)` };
    if (pgErrorCode(e) === "23505") return { error: L("Bunday slug allaqachon mavjud", "Такой slug уже существует") };
    if (pgErrorCode(e) === "23514" || pgErrorCode(e) === "22023") return { error: L("Qiymatlar cheklovlarga mos emas", "Значения не проходят ограничения") };
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect()
    console.error("[admin/menu]", e);
    return { error: L("Xatolik yuz berdi", "Произошла ошибка") };
  }
}

// ---------------------------------------------------------------------------
// Branch availability & price overrides (stop-list)
// ---------------------------------------------------------------------------

export async function setAvailabilityAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("availability");
    const branchId = uuid.parse(fd.get("branchId"));
    const productId = uuid.parse(fd.get("productId"));
    const available = fd.get("available") === "true";
    const priceRaw = String(fd.get("price") ?? "").replace(/\s/g, "");
    const setPrice = fd.has("price") && staff.role !== "kitchen";
    const price = setPrice && priceRaw !== "" ? money.parse(priceRaw) : null;
    const rows = await asActor({ kind: "staff", id: staff.id }, async (d) => {
      const r = setPrice
        ? await d.query(
            `insert into public.branch_products (branch_id, product_id, is_available, price_override) values ($1, $2, $3, $4)
             on conflict (branch_id, product_id) do update set is_available = excluded.is_available, price_override = excluded.price_override returning branch_id`,
            [branchId, productId, available, price],
          )
        : await d.query(
            `insert into public.branch_products (branch_id, product_id, is_available) values ($1, $2, $3)
             on conflict (branch_id, product_id) do update set is_available = excluded.is_available returning branch_id`,
            [branchId, productId, available],
          );
      if (r.length) await audit(d, staff.id, setPrice ? "menu.branch_price" : "menu.availability", "product", productId, { available, price }, branchId);
      return r;
    });
    if (rows.length === 0) return { error: L("Ruxsat yo'q", "Нет доступа") };
    revalidatePath("/admin/availability");
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}

// ---------------------------------------------------------------------------
// Categories (super admin)
// ---------------------------------------------------------------------------

export async function saveCategoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("menu");
    const id = fd.get("id") ? uuid.parse(fd.get("id")) : null;
    const brandId = uuid.parse(fd.get("brandId"));
    const parentId = fd.get("parentId") ? uuid.parse(fd.get("parentId")) : null;
    const v = { slug: slug.parse(fd.get("slug")), name: i18n(fd, "name"), icon: String(fd.get("icon") ?? "").slice(0, 8) || null, sort: z.coerce.number().int().parse(fd.get("sort") || 0), active: fd.get("isActive") === "on" };
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      if (id) {
        if (parentId === id) throw new z.ZodError([{ code: "custom", path: ["parentId"], message: "self" }]);
        await d.query("update public.categories set parent_id = $2, slug = $3, name = $4, icon = $5, sort = $6, is_active = $7 where id = $1 and brand_id = $8", [id, parentId, v.slug, v.name, v.icon, v.sort, v.active, brandId]);
        await audit(d, staff.id, "category.update", "category", id, v);
      } else {
        const r = await d.one<{ id: string }>("insert into public.categories (brand_id, parent_id, slug, name, icon, sort, is_active) values ($1,$2,$3,$4,$5,$6,$7) returning id", [brandId, parentId, v.slug, v.name, v.icon, v.sort, v.active]);
        await audit(d, staff.id, "category.create", "category", r!.id, v);
      }
    });
    revalidatePath("/admin/menu");
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}

export async function deleteCategoryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("menu");
    const id = uuid.parse(fd.get("id"));
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      const used = await d.one<{ n: number }>("select count(*)::int n from public.products where category_id = $1", [id]);
      if ((used?.n ?? 0) > 0) throw new z.ZodError([{ code: "custom", path: ["category_has_products"], message: "in use" }]);
      await d.query("delete from public.categories where id = $1", [id]);
      await audit(d, staff.id, "category.delete", "category", id, {});
    });
    revalidatePath("/admin/menu");
    return { ok: true, message: L("O'chirildi", "Удалено") };
  });
}

// ---------------------------------------------------------------------------
// Products (super admin)
// ---------------------------------------------------------------------------

export async function saveProductAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("menu");
    const id = fd.get("id") ? uuid.parse(fd.get("id")) : null;
    const brandId = uuid.parse(fd.get("brandId"));
    const categoryId = fd.get("categoryId") ? uuid.parse(fd.get("categoryId")) : null;
    const weight = String(fd.get("weight") ?? "").trim();
    const v = {
      slug: slug.parse(fd.get("slug")),
      kind: z.enum(["dish", "packaging", "cutlery"]).parse(fd.get("kind") || "dish"),
      name: i18n(fd, "name"),
      description: i18n(fd, "description", false),
      ingredients: i18n(fd, "ingredients", false),
      allergens: fd.getAll("allergens").map(String).filter((a) => ALLERGENS.includes(a)),
      badges: fd.getAll("badges").map(String).filter((b) => BADGES.includes(b)),
      weight: weight ? z.coerce.number().int().min(1).max(100000).parse(weight) : null,
      basePrice: money.parse(fd.get("basePrice")),
      packagingFee: money.parse(fd.get("packagingFee") || 0),
      sort: z.coerce.number().int().parse(fd.get("sort") || 0),
      active: fd.get("isActive") === "on",
      defaultInCart: fd.get("defaultInCart") === "on",
    };
    const file = fd.get("image");
    const imageUrl = file instanceof File && file.size > 0 ? await saveImage(file, "products") : null;
    const newId = await asActor({ kind: "staff", id: staff.id }, async (d) => {
      if (id) {
        const before = await d.one<{ base_price: number }>("select base_price from public.products where id = $1", [id]);
        await d.query(
          `update public.products set category_id = $2, slug = $3, kind = $4, name = $5, description = $6, ingredients = $7, allergens = $8, badges = $9,
             weight_grams = $10, base_price = $11, packaging_fee = $12, sort = $13, is_active = $14, default_in_cart = $15, image_url = coalesce($16, image_url)
           where id = $1 and brand_id = $17`,
          [id, categoryId, v.slug, v.kind, v.name, v.description, v.ingredients, v.allergens, v.badges, v.weight, v.basePrice, v.packagingFee, v.sort, v.active, v.defaultInCart, imageUrl, brandId],
        );
        await audit(d, staff.id, "product.update", "product", id, { ...v, priceBefore: before?.base_price, image: imageUrl ?? undefined });
        return id;
      }
      const r = await d.one<{ id: string }>(
        `insert into public.products (brand_id, category_id, slug, kind, name, description, ingredients, allergens, badges, weight_grams, base_price, packaging_fee, sort, is_active, default_in_cart, image_url)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
        [brandId, categoryId, v.slug, v.kind, v.name, v.description, v.ingredients, v.allergens, v.badges, v.weight, v.basePrice, v.packagingFee, v.sort, v.active, v.defaultInCart, imageUrl],
      );
      await audit(d, staff.id, "product.create", "product", r!.id, v);
      return r!.id;
    });
    revalidatePath("/admin/menu");
    if (!id) redirect(`/admin/menu/products/${newId}`);
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}

export async function deleteProductAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const staff = await assertStaff("menu");
    const id = uuid.parse(fd.get("id"));
    const brandSlug = String(fd.get("brandSlug") ?? "");
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      // order_items keep their snapshots (product_id is set null)
      await d.query("delete from public.products where id = $1", [id]);
      await audit(d, staff.id, "product.delete", "product", id, {});
    });
    revalidatePath("/admin/menu");
    redirect(`/admin/menu?brand=${encodeURIComponent(brandSlug)}`);
  });
}

// ---------------------------------------------------------------------------
// Variants & extras
// ---------------------------------------------------------------------------

export async function saveGroupAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("menu");
    const id = fd.get("id") ? uuid.parse(fd.get("id")) : null;
    const productId = uuid.parse(fd.get("productId"));
    const kind = z.enum(["variant", "extra"]).parse(fd.get("kind"));
    const name = i18n(fd, "name");
    const maxSelect = kind === "variant" ? 1 : z.coerce.number().int().min(1).max(20).parse(fd.get("maxSelect") || 1);
    const minSelect = kind === "variant" ? 1 : 0;
    const sort = z.coerce.number().int().parse(fd.get("sort") || 0);
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      if (id) await d.query("update public.product_option_groups set kind = $2, name = $3, min_select = $4, max_select = $5, sort = $6 where id = $1 and product_id = $7", [id, kind, name, minSelect, maxSelect, sort, productId]);
      else await d.query("insert into public.product_option_groups (product_id, kind, name, min_select, max_select, sort) values ($1,$2,$3,$4,$5,$6)", [productId, kind, name, minSelect, maxSelect, sort]);
      await audit(d, staff.id, id ? "option_group.update" : "option_group.create", "product", productId, { kind, name, maxSelect });
    });
    revalidatePath(`/admin/menu/products/${productId}`);
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}

export async function deleteGroupAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("menu");
    const id = uuid.parse(fd.get("id"));
    const productId = uuid.parse(fd.get("productId"));
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      await d.query("delete from public.product_option_groups where id = $1 and product_id = $2", [id, productId]);
      await audit(d, staff.id, "option_group.delete", "product", productId, { group: id });
    });
    revalidatePath(`/admin/menu/products/${productId}`);
    return { ok: true, message: L("O'chirildi", "Удалено") };
  });
}

export async function saveOptionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("menu");
    const id = fd.get("id") ? uuid.parse(fd.get("id")) : null;
    const groupId = uuid.parse(fd.get("groupId"));
    const productId = uuid.parse(fd.get("productId"));
    const name = i18n(fd, "name");
    const delta = z.coerce.number().int().min(-10_000_000).max(10_000_000).parse(String(fd.get("priceDelta") ?? "0").replace(/\s/g, "") || 0);
    const isDefault = fd.get("isDefault") === "on";
    const isActive = fd.get("isActive") === "on";
    const sort = z.coerce.number().int().parse(fd.get("sort") || 0);
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      if (isDefault) await d.query("update public.product_options set is_default = false where group_id = $1", [groupId]);
      if (id) await d.query("update public.product_options set name = $2, price_delta = $3, is_default = $4, is_active = $5, sort = $6 where id = $1 and group_id = $7", [id, name, delta, isDefault, isActive, sort, groupId]);
      else await d.query("insert into public.product_options (group_id, name, price_delta, is_default, is_active, sort) values ($1,$2,$3,$4,$5,$6)", [groupId, name, delta, isDefault, isActive, sort]);
      await audit(d, staff.id, id ? "option.update" : "option.create", "product", productId, { name, delta, isActive });
    });
    revalidatePath(`/admin/menu/products/${productId}`);
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}

export async function deleteOptionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("menu");
    const id = uuid.parse(fd.get("id"));
    const productId = uuid.parse(fd.get("productId"));
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      await d.query("delete from public.product_options where id = $1", [id]);
      await audit(d, staff.id, "option.delete", "product", productId, { option: id });
    });
    revalidatePath(`/admin/menu/products/${productId}`);
    return { ok: true, message: L("O'chirildi", "Удалено") };
  });
}
