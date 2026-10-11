import clsx from "clsx";
import { requireStaff, allowedBranch } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { asActor } from "@/lib/db";
import { staffBranches } from "@/lib/services/admin-stats";
import { formatUZS } from "@/lib/money";
import { EmptyState, PageHeader, Panel, Pill } from "@/components/admin/server-ui";
import { ActionForm, Dropdown, FilterBar, FilterField, SearchInput, SubmitButton } from "@/components/admin/ui";
import { HelpTip } from "@/components/admin/guide";
import { IconBan } from "@/components/ui/icons";
import { setAvailabilityAction } from "../../actions/menu";
import { LiveRefresh } from "@/components/live/LiveRefresh";

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ branch?: string; q?: string }> }) {
  const staff = await requireStaff("availability");
  const { L, lang } = await getL();
  const sp = await searchParams;
  const branches = await staffBranches(staff);
  const branchId = allowedBranch(staff, sp.branch) ?? branches[0]?.id;
  const branch = branches.find((b) => b.id === branchId);
  const q = (sp.q ?? "").trim().slice(0, 60);
  const rows = branch
    ? await asActor({ kind: "staff", id: staff.id }, (d) =>
        d.query<{ id: string; name: { uz: string; ru?: string }; category: { uz: string; ru?: string } | null; base_price: number; price_override: number | null; is_available: boolean | null; is_active: boolean; image_url: string | null }>(
          `select p.id, p.name, c.name as category, p.base_price, bp.price_override, bp.is_available, p.is_active, p.image_url
             from public.products p left join public.categories c on c.id = p.category_id
             left join public.branch_products bp on bp.product_id = p.id and bp.branch_id = $1
            where p.brand_id = $2 and ($3 = '' or p.name->>'uz' ilike '%' || $3 || '%' or p.name->>'ru' ilike '%' || $3 || '%')
            order by c.sort nulls last, p.sort`,
          [branch.id, branch.brand_id, q.replace(/[\\%_]/g, "")],
        ),
      )
    : [];
  const kitchen = staff.role === "kitchen";
  const stopped = rows.filter((r) => r.is_active && r.is_available === false).length;

  return (
    <>
      <LiveRefresh scope="staff" kinds={["catalog"]} />
      <PageHeader
        icon={<IconBan size={24} />}
        title={L("Tugagan taomlar (stop-list)", "Стоп-лист")}
        description={L("Taom tugasa, uni shu yerda «Tugadi» qiling — mijozlar uni buyurtma qila olmaydi. Qayta paydo bo'lsa, «Bor» ni bosing.", "Если блюдо закончилось, отметьте «Нет» — гости не смогут его заказать. Когда появится — нажмите «Есть».")}
        guide={{
          steps: [
            L("Qidiruvga taom nomini yozing yoki ro'yxatdan toping.", "Найдите блюдо поиском или в списке."),
            L("«Bor / Tugadi» tugmasini bir marta bosing — holat almashadi. Qizil «Tugadi» bo'lsa, taom saytda yashiriladi.", "Нажмите один раз на «Есть / Нет» — статус переключится. Красное «Нет» — блюдо скрыто на сайте."),
            L("Taom yana paydo bo'lsa, yana bir marta bosing — yashil «Bor» bo'ladi.", "Когда блюдо появится, нажмите ещё раз — станет зелёное «Есть»."),
          ],
          tip: kitchen ? undefined : L("Filial narxi — faqat shu filialda boshqacha narx kerak bo'lsa. Bo'sh qoldirsangiz, asosiy narx ishlatiladi.", "Цена филиала — только если в этом филиале цена другая. Пусто = базовая цена."),
        }}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-2xl bg-white p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-medium text-muted">{L("Hammasi", "Всего")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{rows.length}</p>
        </div>
        <div className={clsx("rounded-2xl p-4 shadow-[var(--shadow-card)]", stopped ? "bg-brand text-white" : "bg-white")}>
          <p className={clsx("text-xs font-medium", stopped ? "text-white/80" : "text-muted")}>{L("Hozir tugagan", "Сейчас нет")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{stopped}</p>
        </div>
      </div>

      <Panel>
        <FilterBar>
          {branches.length > 1 && (
            <FilterField label={L("Filial", "Филиал")}>
              <Dropdown name="branch" defaultValue={branchId} options={branches.map((b) => ({ value: b.id, label: b.label }))} />
            </FilterField>
          )}
          <FilterField label={L("Taomni qidirish", "Поиск блюда")}>
            <SearchInput defaultValue={q} placeholder={L("Masalan: Filadelfiya", "Например: Филадельфия")} />
          </FilterField>
        </FilterBar>

        {rows.length === 0 ? (
          <EmptyState text={L("Hech narsa topilmadi", "Ничего не найдено")} hint={L("Boshqa nom bilan qidirib ko'ring yoki qidiruvni tozalang.", "Попробуйте другое название или сбросьте поиск.")} />
        ) : (
          <ul className="mt-5 divide-y divide-line">
            {rows.map((r) => {
              const available = r.is_available ?? true;
              return (
                <li key={r.id} className={clsx("flex flex-wrap items-center gap-3 py-3 transition-colors", !available && r.is_active && "-mx-2 rounded-xl bg-brand-50/50 px-2")}>
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-field">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.image_url && <img src={r.image_url} alt="" className={clsx("size-full object-cover transition", !available && "grayscale")} />}
                  </span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className={clsx("truncate font-medium", !available && "text-ink/60 line-through decoration-brand/50")}>{tr(r.name, lang)}</p>
                    <p className="truncate text-xs text-muted">
                      {tr(r.category, lang)} · {formatUZS(r.price_override ?? r.base_price)}
                    </p>
                  </div>
                  {!r.is_active ? (
                    <Pill>{L("Menyudan olingan", "Скрыто в меню")}</Pill>
                  ) : (
                    <ActionForm action={setAvailabilityAction}>
                      <input type="hidden" name="branchId" value={branch!.id} />
                      <input type="hidden" name="productId" value={r.id} />
                      <input type="hidden" name="available" value={String(!available)} />
                      <SubmitButton
                        variant="soft"
                        className="group/t !h-auto gap-1 !rounded-xl !bg-field !p-1 hover:!bg-line"
                      >
                        <span className={clsx("rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-200", available ? "bg-ok text-white shadow-sm" : "text-muted group-hover/t:text-ok")}>✓ {L("Bor", "Есть")}</span>
                        <span className={clsx("rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-200", !available ? "bg-brand text-white shadow-sm" : "text-muted group-hover/t:text-brand")}>✕ {L("Tugadi", "Нет")}</span>
                        <span className="sr-only">{available ? L("Tugadi deb belgilash", "Отметить «нет»") : L("Qaytarish", "Вернуть")}</span>
                      </SubmitButton>
                    </ActionForm>
                  )}
                  {!kitchen && (
                    <ActionForm action={setAvailabilityAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="branchId" value={branch!.id} />
                      <input type="hidden" name="productId" value={r.id} />
                      <input type="hidden" name="available" value={String(available)} />
                      <input name="price" inputMode="numeric" defaultValue={r.price_override ?? ""} placeholder={String(r.base_price)} className="admin-field !h-9 !w-28 text-sm" aria-label={L("Filial narxi", "Цена филиала")} />
                      <HelpTip text={L(`Bo'sh qoldirilsa, asosiy narx: ${formatUZS(r.base_price)}.`, `Если пусто — базовая цена: ${formatUZS(r.base_price)}.`)} />
                      <SubmitButton variant="soft" className="!h-9 !px-3 text-sm">
                        {L("Saqlash", "Сохранить")}
                      </SubmitButton>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
