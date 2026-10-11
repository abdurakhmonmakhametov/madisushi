"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asActor, pgErrorCode, type Db } from "@/lib/db";
import { assertStaff, ForbiddenError } from "@/lib/admin/guard";
import { makeL } from "@/lib/admin/l";
import { getLang } from "@/lib/i18n/server";
import { localToUtc } from "@/lib/time";
import { saveImage, UploadError } from "@/lib/integrations/storage";
import type { ActionState } from "@/components/admin/ui";

const uuid = z.string().uuid();

function i18n(fd: FormData, name: string, required = true) {
  const uz = String(fd.get(`${name}_uz`) ?? "").trim().slice(0, 20000);
  const ru = String(fd.get(`${name}_ru`) ?? "").trim().slice(0, 20000);
  if (required && !uz) throw new z.ZodError([{ code: "custom", path: [name], message: "required" }]);
  return { uz, ru };
}

/** datetime-local value in Tashkent time -> Date, or null. */
function localDateTime(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new z.ZodError([{ code: "custom", path: ["date"], message: "invalid" }]);
  return localToUtc(m[1], Number(m[2]) * 60 + Number(m[3]));
}

async function audit(d: Db, staffId: string, action: string, entity: string, entityId: string, data: unknown) {
  await d.query("insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, data) values ('staff', $1, $2, $3, $4, $5)", [staffId, action, entity, entityId, JSON.stringify(data)]);
}

async function handle(fn: (L: ReturnType<typeof makeL>) => Promise<ActionState>): Promise<ActionState> {
  const L = makeL(await getLang());
  try {
    return await fn(L);
  } catch (e) {
    if (e instanceof ForbiddenError || pgErrorCode(e) === "42501") return { error: L("Ruxsat yo'q", "Нет доступа") };
    if (e instanceof z.ZodError) return { error: `${L("Maydonlarni tekshiring", "Проверьте поля")}: ${e.issues.map((i) => i.path.join(".")).join(", ")}` };
    if (e instanceof UploadError) return { error: `${L("Rasm yuklanmadi", "Изображение не загружено")}: ${e.message}` };
    if (pgErrorCode(e) === "23505") return { error: L("Bunday kod/slug allaqachon mavjud", "Такой код/slug уже существует") };
    if (pgErrorCode(e) === "23514") return { error: L("Qiymatlar cheklovlarga mos emas (masalan, foiz ≤ 100, tugash sanasi boshlanishdan keyin)", "Значения не проходят ограничения (процент ≤ 100, конец после начала)") };
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("[admin/marketing]", e);
    return { error: L("Xatolik yuz berdi", "Произошла ошибка") };
  }
}

export async function savePromoCodeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("promotions");
    const id = fd.get("id") ? uuid.parse(fd.get("id")) : null;
    const optInt = (k: string) => {
      const s = String(fd.get(k) ?? "").trim();
      return s ? z.coerce.number().int().min(1).max(100_000_000).parse(s) : null;
    };
    const v = {
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/).parse(fd.get("code")),
      description: i18n(fd, "description", false),
      kind: z.enum(["percent", "fixed"]).parse(fd.get("kind")),
      value: z.coerce.number().int().min(1).max(100_000_000).parse(fd.get("value")),
      maxDiscount: optInt("maxDiscount"),
      minSubtotal: z.coerce.number().int().min(0).parse(fd.get("minSubtotal") || 0),
      startsAt: localDateTime(fd.get("startsAt")),
      endsAt: localDateTime(fd.get("endsAt")),
      limitTotal: optInt("limitTotal"),
      limitCustomer: optInt("limitCustomer"),
      active: fd.get("isActive") === "on",
      brands: fd.getAll("brands").map(String).filter((b) => /^[0-9a-f-]{36}$/i.test(b)),
    };
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      let promoId = id;
      if (id) {
        await d.query(
          `update public.promo_codes set code=$2, description=$3, kind=$4, value=$5, max_discount=$6, min_subtotal=$7, starts_at=$8, ends_at=$9,
             usage_limit_total=$10, usage_limit_per_customer=$11, is_active=$12 where id=$1`,
          [id, v.code, v.description, v.kind, v.value, v.maxDiscount, v.minSubtotal, v.startsAt, v.endsAt, v.limitTotal, v.limitCustomer, v.active],
        );
      } else {
        promoId = (await d.one<{ id: string }>(
          `insert into public.promo_codes (code, description, kind, value, max_discount, min_subtotal, starts_at, ends_at, usage_limit_total, usage_limit_per_customer, is_active)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
          [v.code, v.description, v.kind, v.value, v.maxDiscount, v.minSubtotal, v.startsAt, v.endsAt, v.limitTotal, v.limitCustomer, v.active],
        ))!.id;
      }
      await d.query("delete from public.promo_code_brands where promo_code_id = $1", [promoId]);
      for (const b of v.brands) await d.query("insert into public.promo_code_brands values ($1, $2)", [promoId, b]);
      await audit(d, staff.id, id ? "promo.update" : "promo.create", "promo_code", promoId!, v);
    });
    revalidatePath("/admin/promotions");
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}

export async function savePromotionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("promotions");
    const id = fd.get("id") ? uuid.parse(fd.get("id")) : null;
    const v = {
      title: i18n(fd, "title"),
      body: i18n(fd, "body", false),
      brandId: fd.get("brandId") ? uuid.parse(fd.get("brandId")) : null,
      promoCodeId: fd.get("promoCodeId") ? uuid.parse(fd.get("promoCodeId")) : null,
      startsAt: localDateTime(fd.get("startsAt")),
      endsAt: localDateTime(fd.get("endsAt")),
      status: z.enum(["draft", "published"]).parse(fd.get("status")),
      sort: z.coerce.number().int().parse(fd.get("sort") || 0),
    };
    const file = fd.get("image");
    const image = file instanceof File && file.size > 0 ? await saveImage(file, "promotions") : null;
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      if (id) {
        await d.query(
          "update public.promotions set title=$2, body=$3, brand_id=$4, promo_code_id=$5, starts_at=$6, ends_at=$7, status=$8, sort=$9, image_url=coalesce($10, image_url) where id=$1",
          [id, v.title, v.body, v.brandId, v.promoCodeId, v.startsAt, v.endsAt, v.status, v.sort, image],
        );
      } else {
        await d.query("insert into public.promotions (title, body, brand_id, promo_code_id, starts_at, ends_at, status, sort, image_url) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
          v.title,
          v.body,
          v.brandId,
          v.promoCodeId,
          v.startsAt,
          v.endsAt,
          v.status,
          v.sort,
          image,
        ]);
      }
      await audit(d, staff.id, id ? "promotion.update" : "promotion.create", "promotion", id ?? "new", v);
    });
    revalidatePath("/admin/promotions");
    revalidatePath("/");
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}

export async function deletePromotionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("promotions");
    const id = uuid.parse(fd.get("id"));
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      await d.query("delete from public.promotions where id = $1", [id]);
      await audit(d, staff.id, "promotion.delete", "promotion", id, {});
    });
    revalidatePath("/admin/promotions");
    return { ok: true, message: L("O'chirildi", "Удалено") };
  });
}

const KINDS = ["page", "news", "recipe", "vacancy", "faq", "gallery", "banner", "legal"] as const;

export async function saveContentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("content");
    const id = fd.get("id") ? uuid.parse(fd.get("id")) : null;
    const v = {
      kind: z.enum(KINDS).parse(fd.get("kind")),
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,80}$/).parse(fd.get("slug")),
      title: i18n(fd, "title"),
      excerpt: i18n(fd, "excerpt", false),
      body: i18n(fd, "body", false),
      linkUrl: String(fd.get("linkUrl") ?? "").trim().slice(0, 300) || null,
      status: z.enum(["draft", "published"]).parse(fd.get("status")),
      sort: z.coerce.number().int().parse(fd.get("sort") || 0),
    };
    if (v.linkUrl && !/^(\/|https:\/\/)/.test(v.linkUrl)) throw new z.ZodError([{ code: "custom", path: ["linkUrl"], message: "url" }]);
    const file = fd.get("image");
    const image = file instanceof File && file.size > 0 ? await saveImage(file, "content") : null;
    const newId = await asActor({ kind: "staff", id: staff.id }, async (d) => {
      if (id) {
        await d.query(
          `update public.content_items set kind=$2, slug=$3, title=$4, excerpt=$5, body=$6, link_url=$7, status=$8, sort=$9, image_url=coalesce($10, image_url),
             published_at = case when $8 = 'published' then coalesce(published_at, now()) else published_at end where id=$1`,
          [id, v.kind, v.slug, v.title, v.excerpt, v.body, v.linkUrl, v.status, v.sort, image],
        );
        await audit(d, staff.id, "content.update", "content", id, { kind: v.kind, slug: v.slug, status: v.status });
        return id;
      }
      const r = await d.one<{ id: string }>(
        `insert into public.content_items (kind, slug, title, excerpt, body, link_url, status, sort, image_url, published_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9, case when $7 = 'published' then now() end) returning id`,
        [v.kind, v.slug, v.title, v.excerpt, v.body, v.linkUrl, v.status, v.sort, image],
      );
      await audit(d, staff.id, "content.create", "content", r!.id, { kind: v.kind, slug: v.slug, status: v.status });
      return r!.id;
    });
    revalidatePath("/admin/content");
    if (!id) redirect(`/admin/content/${newId}`);
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}

export async function deleteContentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const staff = await assertStaff("content");
    const id = uuid.parse(fd.get("id"));
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      await d.query("delete from public.content_items where id = $1", [id]);
      await audit(d, staff.id, "content.delete", "content", id, {});
    });
    revalidatePath("/admin/content");
    redirect("/admin/content");
  });
}

// Home carousel banners live in content_items (kind = 'banner'):
// title = heading, excerpt = small text, body = button text, link_url = button link.
export async function saveBannerAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("content");
    const id = fd.get("id") ? uuid.parse(fd.get("id")) : null;
    const v = {
      title: i18n(fd, "title"),
      excerpt: i18n(fd, "excerpt", false),
      button: i18n(fd, "button", false),
      linkUrl: String(fd.get("linkUrl") ?? "").trim().slice(0, 300) || null,
      status: z.enum(["draft", "published"]).parse(fd.get("status")),
      sort: z.coerce.number().int().parse(fd.get("sort") || 0),
    };
    if (v.linkUrl && !/^(\/|#|https:\/\/)/.test(v.linkUrl)) throw new z.ZodError([{ code: "custom", path: ["linkUrl"], message: "url" }]);
    const file = fd.get("image");
    const image = file instanceof File && file.size > 0 ? await saveImage(file, "banners") : null;
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      if (id) {
        await d.query(
          `update public.content_items set title=$2, excerpt=$3, body=$4, link_url=$5, status=$6, sort=$7, image_url=coalesce($8, image_url), updated_at=now(),
             published_at = case when $6 = 'published' then coalesce(published_at, now()) else published_at end
           where id=$1 and kind='banner'`,
          [id, v.title, v.excerpt, v.button, v.linkUrl, v.status, v.sort, image],
        );
      } else {
        await d.query(
          `insert into public.content_items (kind, slug, title, excerpt, body, link_url, status, sort, image_url, published_at)
           values ('banner', $1, $2, $3, $4, $5, $6, $7, $8, case when $6 = 'published' then now() end)`,
          [`banner-${randomUUID().slice(0, 8)}`, v.title, v.excerpt, v.button, v.linkUrl, v.status, v.sort, image],
        );
      }
      await audit(d, staff.id, id ? "banner.update" : "banner.create", "content", id ?? "new", { title: v.title, status: v.status });
    });
    revalidatePath("/admin/banners");
    revalidatePath("/");
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}

export async function deleteBannerAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("content");
    const id = uuid.parse(fd.get("id"));
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      await d.query("delete from public.content_items where id = $1 and kind = 'banner'", [id]);
      await audit(d, staff.id, "banner.delete", "content", id, {});
    });
    revalidatePath("/admin/banners");
    revalidatePath("/");
    return { ok: true, message: L("O'chirildi", "Удалено") };
  });
}
