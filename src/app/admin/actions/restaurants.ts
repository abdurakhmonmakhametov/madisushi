"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { asActor, pgErrorCode, type Db } from "@/lib/db";
import { assertStaff, ForbiddenError } from "@/lib/admin/guard";
import { makeL } from "@/lib/admin/l";
import { getLang } from "@/lib/i18n/server";
import { hhmmToMinutes } from "@/lib/time";
import { circlePolygon, isLatLng } from "@/lib/geo";
import { saveImage, UploadError } from "@/lib/integrations/storage";
import type { ActionState } from "@/components/admin/ui";

const uuid = z.string().uuid();
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const money = int(0, 100_000_000);

function i18n(fd: FormData, name: string, required = true) {
  const uz = String(fd.get(`${name}_uz`) ?? "").trim().slice(0, 2000);
  const ru = String(fd.get(`${name}_ru`) ?? "").trim().slice(0, 2000);
  if (required && !uz) throw new z.ZodError([{ code: "custom", path: [name], message: "required" }]);
  return { uz, ru };
}

async function audit(d: Db, staffId: string, action: string, entity: string, entityId: string, branchId: string | null, data: unknown) {
  await d.query("insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, branch_id, data) values ('staff', $1, $2, $3, $4, $5, $6)", [staffId, action, entity, entityId, branchId, JSON.stringify(data)]);
}

async function handle(fn: (L: ReturnType<typeof makeL>) => Promise<ActionState>): Promise<ActionState> {
  const L = makeL(await getLang());
  try {
    return await fn(L);
  } catch (e) {
    if (e instanceof ForbiddenError || pgErrorCode(e) === "42501") return { error: L("Ruxsat yo'q", "Нет доступа") };
    if (e instanceof z.ZodError) return { error: `${L("Maydonlarni tekshiring", "Проверьте поля")}: ${e.issues.map((i) => i.path.join(".")).join(", ")}` };
    if (e instanceof UploadError) return { error: `${L("Rasm yuklanmadi", "Изображение не загружено")}: ${e.message}` };
    if (pgErrorCode(e) === "23505") return { error: L("Bunday qiymat allaqachon mavjud", "Такое значение уже существует") };
    if (pgErrorCode(e) === "23514") return { error: L("Qiymatlar cheklovlarga mos emas", "Значения не проходят ограничения") };
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("[admin/restaurants]", e);
    return { error: L("Xatolik yuz berdi", "Произошла ошибка") };
  }
}

export async function saveBrandAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("brands");
    const id = fd.get("id") ? uuid.parse(fd.get("id")) : null;
    const v = {
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/).parse(fd.get("slug")),
      name: z.string().trim().min(1).max(60).parse(fd.get("name")),
      tagline: i18n(fd, "tagline", false),
      description: i18n(fd, "description", false),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(fd.get("accent") || "#D7282F"),
      phone: String(fd.get("phone") ?? "").trim().slice(0, 30) || null,
      sort: int(-1000, 1000).parse(fd.get("sort") || 0),
      active: fd.get("isActive") === "on",
      cuisines: fd.getAll("cuisines").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)),
    };
    const file = fd.get("logo");
    const logo = file instanceof File && file.size > 0 ? await saveImage(file, "brands") : null;
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      let brandId = id;
      if (id) {
        await d.query("update public.brands set slug=$2, name=$3, tagline=$4, description=$5, accent_color=$6, phone=$7, sort=$8, is_active=$9, logo_url=coalesce($10, logo_url) where id=$1", [id, v.slug, v.name, v.tagline, v.description, v.accent, v.phone, v.sort, v.active, logo]);
      } else {
        brandId = (await d.one<{ id: string }>("insert into public.brands (slug, name, tagline, description, accent_color, phone, sort, is_active, logo_url) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id", [v.slug, v.name, v.tagline, v.description, v.accent, v.phone, v.sort, v.active, logo]))!.id;
      }
      await d.query("delete from public.brand_cuisines where brand_id = $1", [brandId]);
      for (const c of v.cuisines) await d.query("insert into public.brand_cuisines values ($1, $2)", [brandId, c]);
      await audit(d, staff.id, id ? "brand.update" : "brand.create", "brand", brandId!, null, v);
    });
    revalidatePath("/admin/restaurants");
    revalidatePath("/");
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}

export async function saveBranchAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("branches");
    const id = fd.get("id") ? uuid.parse(fd.get("id")) : null;
    const v = {
      name: i18n(fd, "name"),
      address: i18n(fd, "address"),
      lat: z.coerce.number().min(-90).max(90).parse(fd.get("lat")),
      lng: z.coerce.number().min(-180).max(180).parse(fd.get("lng")),
      phone: String(fd.get("phone") ?? "").trim().slice(0, 30) || null,
      active: fd.get("isActive") === "on",
      delivery: fd.get("acceptsDelivery") === "on",
      pickup: fd.get("acceptsPickup") === "on",
      prep: int(0, 600).parse(fd.get("prepMinutes")),
      deliveryMinutes: int(0, 600).parse(fd.get("deliveryMinutes")),
      pickupMin: money.parse(fd.get("pickupMinOrder") || 0),
      reservations: fd.get("reservationsEnabled") === "on",
      capacity: int(0, 10000).parse(fd.get("capacity")),
      slot: int(15, 240).parse(fd.get("slotMinutes")),
      duration: int(30, 480).parse(fd.get("durationMinutes")),
      maxParty: int(1, 200).parse(fd.get("maxParty")),
    };
    const newId = await asActor({ kind: "staff", id: staff.id }, async (d) => {
      if (id) {
        const r = await d.query(
          `update public.branches set name=$2, address=$3, lat=$4, lng=$5, phone=$6, is_active=$7, accepts_delivery=$8, accepts_pickup=$9, prep_minutes=$10,
             delivery_minutes=$11, pickup_min_order=$12, reservations_enabled=$13, reservation_capacity=$14, reservation_slot_minutes=$15,
             reservation_duration_minutes=$16, reservation_max_party=$17 where id=$1 returning id`,
          [id, v.name, v.address, v.lat, v.lng, v.phone, v.active, v.delivery, v.pickup, v.prep, v.deliveryMinutes, v.pickupMin, v.reservations, v.capacity, v.slot, v.duration, v.maxParty],
        );
        if (r.length === 0) throw new ForbiddenError();
        await audit(d, staff.id, "branch.update", "branch", id, id, v);
        return id;
      }
      const brandId = uuid.parse(fd.get("brandId"));
      const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/).parse(fd.get("slug"));
      const r = await d.one<{ id: string }>(
        `insert into public.branches (brand_id, slug, name, address, lat, lng, phone, is_active, accepts_delivery, accepts_pickup, prep_minutes, delivery_minutes, pickup_min_order,
           reservations_enabled, reservation_capacity, reservation_slot_minutes, reservation_duration_minutes, reservation_max_party)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning id`,
        [brandId, slug, v.name, v.address, v.lat, v.lng, v.phone, v.active, v.delivery, v.pickup, v.prep, v.deliveryMinutes, v.pickupMin, v.reservations, v.capacity, v.slot, v.duration, v.maxParty],
      );
      await audit(d, staff.id, "branch.create", "branch", r!.id, r!.id, v);
      return r!.id;
    });
    revalidatePath("/admin/branches");
    if (!id) redirect(`/admin/branches/${newId}`);
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}

export async function saveHoursAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("branches");
    const branchId = uuid.parse(fd.get("branchId"));
    const rows: { wd: number; open: number; close: number }[] = [];
    for (let wd = 1; wd <= 7; wd++) {
      if (fd.get(`closed_${wd}`) === "on") continue;
      const open = hhmmToMinutes(String(fd.get(`open_${wd}`) ?? ""));
      let close = hhmmToMinutes(String(fd.get(`close_${wd}`) ?? ""));
      if (open === null || close === null) throw new z.ZodError([{ code: "custom", path: [`day_${wd}`], message: "time" }]);
      if (close <= open) close += 1440; // runs past midnight
      rows.push({ wd, open, close });
    }
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      await d.query("delete from public.branch_hours where branch_id = $1", [branchId]);
      for (const r of rows) await d.query("insert into public.branch_hours values ($1, $2, $3, $4)", [branchId, r.wd, r.open, r.close]);
      await audit(d, staff.id, "branch.hours", "branch", branchId, branchId, rows);
    });
    revalidatePath(`/admin/branches/${branchId}`);
    return { ok: true, message: L("Ish vaqti saqlandi", "Часы работы сохранены") };
  });
}

export async function addClosureAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("branches");
    const branchId = uuid.parse(fd.get("branchId"));
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(fd.get("date"));
    const reason = i18n(fd, "reason", false);
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      await d.query("insert into public.branch_closures (branch_id, date, reason) values ($1,$2,$3) on conflict (branch_id, date) do update set reason = excluded.reason", [branchId, date, { uz: reason.uz || "Yopiq", ru: reason.ru }]);
      await audit(d, staff.id, "branch.closure_add", "branch", branchId, branchId, { date, reason });
    });
    revalidatePath(`/admin/branches/${branchId}`);
    return { ok: true, message: L("Qo'shildi", "Добавлено") };
  });
}

export async function deleteClosureAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("branches");
    const branchId = uuid.parse(fd.get("branchId"));
    const id = uuid.parse(fd.get("id"));
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      await d.query("delete from public.branch_closures where id = $1 and branch_id = $2", [id, branchId]);
      await audit(d, staff.id, "branch.closure_delete", "branch", branchId, branchId, { id });
    });
    revalidatePath(`/admin/branches/${branchId}`);
    return { ok: true, message: L("O'chirildi", "Удалено") };
  });
}

export async function saveZoneAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("branches");
    const branchId = uuid.parse(fd.get("branchId"));
    const id = fd.get("id") ? uuid.parse(fd.get("id")) : null;
    const free = String(fd.get("freeFrom") ?? "").trim();
    const v = {
      name: i18n(fd, "name"),
      fee: money.parse(fd.get("fee")),
      minOrder: money.parse(fd.get("minOrder") || 0),
      freeFrom: free ? money.parse(free) : null,
      surcharge: money.parse(fd.get("surcharge") || 0),
      note: i18n(fd, "note", false),
      extra: int(0, 600).parse(fd.get("extraMinutes") || 0),
      priority: int(-100, 100).parse(fd.get("priority") || 0),
      active: fd.get("isActive") === "on",
    };
    // Polygon: either a circle (center + radius) or explicit JSON [[lat,lng],...]
    let polygon: [number, number][] | null = null;
    const raw = String(fd.get("polygon") ?? "").trim();
    const radius = String(fd.get("radius") ?? "").trim();
    if (radius) {
      const lat = z.coerce.number().min(-90).max(90).parse(fd.get("centerLat"));
      const lng = z.coerce.number().min(-180).max(180).parse(fd.get("centerLng"));
      polygon = circlePolygon([lat, lng], int(100, 100000).parse(radius), 24);
    } else if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || parsed.length < 3 || parsed.length > 500 || !parsed.every(isLatLng)) throw new z.ZodError([{ code: "custom", path: ["polygon"], message: "invalid" }]);
      polygon = parsed as [number, number][];
    }
    if (!id && !polygon) throw new z.ZodError([{ code: "custom", path: ["polygon"], message: "required" }]);
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      if (id) {
        await d.query(
          `update public.delivery_zones set name=$3, fee=$4, min_order=$5, free_delivery_from=$6, surcharge=$7, surcharge_note=$8, extra_minutes=$9, priority=$10, is_active=$11,
             polygon = coalesce($12::jsonb, polygon) where id=$1 and branch_id=$2`,
          [id, branchId, v.name, v.fee, v.minOrder, v.freeFrom, v.surcharge, v.note.uz ? v.note : null, v.extra, v.priority, v.active, polygon ? JSON.stringify(polygon) : null],
        );
      } else {
        await d.query(
          `insert into public.delivery_zones (branch_id, name, polygon, fee, min_order, free_delivery_from, surcharge, surcharge_note, extra_minutes, priority, is_active)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [branchId, v.name, JSON.stringify(polygon), v.fee, v.minOrder, v.freeFrom, v.surcharge, v.note.uz ? v.note : null, v.extra, v.priority, v.active],
        );
      }
      await audit(d, staff.id, id ? "zone.update" : "zone.create", "branch", branchId, branchId, { ...v, polygonPoints: polygon?.length });
    });
    revalidatePath(`/admin/branches/${branchId}`);
    return { ok: true, message: L("Hudud saqlandi", "Зона сохранена") };
  });
}

export async function deleteZoneAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("branches");
    const branchId = uuid.parse(fd.get("branchId"));
    const id = uuid.parse(fd.get("id"));
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      await d.query("delete from public.delivery_zones where id = $1 and branch_id = $2", [id, branchId]);
      await audit(d, staff.id, "zone.delete", "branch", branchId, branchId, { id });
    });
    revalidatePath(`/admin/branches/${branchId}`);
    return { ok: true, message: L("O'chirildi", "Удалено") };
  });
}
