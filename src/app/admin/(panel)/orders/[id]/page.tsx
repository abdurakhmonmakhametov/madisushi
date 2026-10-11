import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { getStaffOrder } from "@/lib/services/orders";
import { CANCEL_REASONS, nextStatuses, staffCanSet, TERMINAL, timeline } from "@/lib/order-status";
import { formatUZS } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { PageHeader, Panel, Pill } from "@/components/admin/server-ui";
import { ActionForm, AutoRefresh, ConfirmAction, Dropdown, Input, LiveBadge, SubmitButton } from "@/components/admin/ui";
import { HelpTip, StepFlow } from "@/components/admin/guide";
import { actorLabel, methodLabel, paymentLabel, reasonLabel, statusLabel, statusTone } from "@/components/admin/labels";
import { orderPaymentAction, orderStatusAction } from "../../../actions/orders";
import { IconArrowLeft, IconArrowRight, IconComment, IconPrinter } from "@/components/ui/icons";

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("orders");
  const { L, lang } = await getL();
  const detail = await getStaffOrder(staff, (await params).id);
  if (!detail) notFound();
  const { order: o, items, history, payments, customerOrders } = detail;
  const next = nextStatuses(o.fulfillment, o.status).filter((s) => s !== "cancelled" && staffCanSet(staff.role, s));
  const canCancel = !TERMINAL.includes(o.status) && staffCanSet(staff.role, "cancelled");
  const manager = staff.role !== "kitchen";
  const flow = timeline(o.fulfillment);
  const at = flow.indexOf(o.status);
  // Plain-language explanation of what pressing each button means.
  const explain: Record<string, [string, string]> = {
    confirmed: ["Buyurtmani ko'rib chiqdingiz va qabul qilasiz. Mijozga «qabul qilindi» deb ko'rinadi.", "Вы проверили заказ и принимаете его. Гость увидит «принят»."],
    preparing: ["Oshxona taom tayyorlashni boshladi.", "Кухня начала готовить."],
    ready: ["Hamma taomlar tayyor va qadoqlangan.", "Всё готово и упаковано."],
    out_for_delivery: ["Kuryer buyurtmani oldi va yo'lga chiqdi.", "Курьер забрал заказ и выехал."],
    delivered: ["Mijoz buyurtmani qo'liga oldi. Buyurtma yakunlanadi.", "Гость получил заказ. Заказ завершается."],
    picked_up: ["Mijoz buyurtmani restorandan olib ketdi. Buyurtma yakunlanadi.", "Гость забрал заказ. Заказ завершается."],
  };

  return (
    <>
      <AutoRefresh ms={30000} kinds={["order"]} id={o.id} />
      <PageHeader
        title={`${L("Buyurtma", "Заказ")} №${o.number}`}
        description={`${formatDateTime(o.created_at, lang)} · ${o.fulfillment === "delivery" ? L("Yetkazib berish", "Доставка") : L("Olib ketish", "Самовывоз")} · ${formatUZS(o.total)}`}
        guide={{
          steps: [
            L("Avval «Tarkib» qismida nimalar buyurtma qilinganini tekshiring.", "Сначала проверьте в «Составе», что заказано."),
            L("Katta qizil tugmani bosing — buyurtma keyingi bosqichga o'tadi. Tugma ostida u nimani anglatishi yozilgan.", "Нажмите большую красную кнопку — заказ перейдёт на следующий этап. Под ней написано, что это значит."),
            L("Oshxona uchun chek kerak bo'lsa, «Oshxona cheki» tugmasini bosing va chop eting.", "Нужен чек для кухни — нажмите «Кухонный чек» и распечатайте."),
          ],
        }}
      >
        {!TERMINAL.includes(o.status) && <LiveBadge seconds={15} />}
        <Pill tone={statusTone(o.status)}>{statusLabel(o.status, lang)}</Pill>
        <Link href={`/admin/orders/${o.id}/ticket`} target="_blank" className="btn-soft h-10 text-sm">
          <IconPrinter size={18} /> {L("Oshxona cheki", "Кухонный чек")}
        </Link>
        <Link href="/admin/orders" className="btn-soft h-10 text-sm">
          <IconArrowLeft size={18} /> {L("Navbat", "Очередь")}
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel title={L("Buyurtma qayerda?", "Где сейчас заказ?")}>
            {o.status === "cancelled" ? (
              <p className="rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand">{L("Bu buyurtma bekor qilingan.", "Этот заказ отменён.")}</p>
            ) : (
              <StepFlow steps={flow.map((s) => ({ label: statusLabel(s, lang) }))} current={at} done={TERMINAL.includes(o.status)} />
            )}
          </Panel>

          <Panel title={L("Keyingi qadam", "Следующий шаг")} className="ring-2 ring-brand/10">
            <div className="flex flex-wrap gap-3">
              {next.map((s) => (
                <ActionForm key={s} action={orderStatusAction} className="w-full sm:w-auto">
                  <input type="hidden" name="orderId" value={o.id} />
                  <input type="hidden" name="to" value={s} />
                  <SubmitButton className="!h-14 w-full !px-7 text-[16px] sm:w-auto">
                    {statusLabel(s, lang)} <IconArrowRight size={20} />
                  </SubmitButton>
                  {explain[s] && <p className="mt-2 max-w-md text-sm text-muted">{L(...explain[s])}</p>}
                </ActionForm>
              ))}
              {canCancel && (
                <ConfirmAction action={orderStatusAction} label={L("Bekor qilish", "Отменить")} title={L("Buyurtmani bekor qilish", "Отмена заказа")} hidden={{ orderId: o.id, to: "cancelled" }} className="h-11">
                  <div className="block text-sm">
                    <span className="mb-1.5 block font-medium">{L("Nima uchun bekor qilinmoqda?", "Почему отменяется?")}</span>
                    <Dropdown name="reason" required options={CANCEL_REASONS.map((r) => ({ value: r, label: reasonLabel(r, lang) }))} />
                  </div>
                  <Input className="mt-3" label={L("Izoh", "Комментарий")} name="note" maxLength={300} />
                  {o.payment_status === "paid" && <p className="mt-3 text-sm text-warn">{L("Buyurtma to'langan: holat 'qaytarish kutilmoqda'ga o'tadi.", "Заказ оплачен: статус оплаты станет «ожидает возврата».")}</p>}
                </ConfirmAction>
              )}
              {next.length === 0 && !canCancel && <p className="flex items-center gap-2 text-muted">✅ {L("Buyurtma yakunlangan — boshqa hech narsa qilish shart emas.", "Заказ завершён — больше ничего делать не нужно.")}</p>}
            </div>
            {manager && (
              <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4">
                <p className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
                  {L("To'lov", "Оплата")}
                  <HelpTip text={L("Naqd yoki karta orqali kuryerga to'langanda, pulni olganingizdan keyin «To'lov olindi» ni bosing.", "Когда гость оплатил наличными или картой курьеру, после получения денег нажмите «Отметить оплату».")} />
                </p>
                {["cash", "card_on_delivery"].includes(o.payment_method) && o.payment_status === "unpaid" && o.status !== "cancelled" && (
                  <ConfirmAction action={orderPaymentAction} variant="soft" label={L("To'lov olindi deb belgilash", "Отметить оплату")} title={L("To'lovni tasdiqlash", "Подтвердить оплату")} body={formatUZS(o.total)} hidden={{ orderId: o.id, to: "paid" }} />
                )}
                {["paid", "refund_pending", "partially_refunded"].includes(o.payment_status) && (
                  <ConfirmAction
                    action={orderPaymentAction}
                    label={L("Qaytarildi deb belgilash", "Отметить возврат")}
                    title={L("To'lov qaytarilganini tasdiqlang", "Подтвердите возврат")}
                    body={L("Pul provayder kabinetida yoki kassada qaytarilgandan keyingina belgilang. Keshbek bekor qilinadi.", "Отмечайте только после фактического возврата в кабинете провайдера или кассе. Кешбэк будет отменён.")}
                    hidden={{ orderId: o.id, to: "refunded" }}
                  />
                )}
              </div>
            )}
          </Panel>

          <Panel title={L("Tarkib", "Состав")}>
            <ul className="divide-y divide-line">
              {items.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-4 py-2.5">
                  <div>
                    <p className="font-medium">
                      {it.quantity} × {tr(it.name_snapshot, lang)}
                    </p>
                    {it.options_snapshot.length > 0 && <p className="text-sm text-muted">{it.options_snapshot.map((x) => `${tr(x.group, lang)}: ${tr(x.name, lang)}`).join("; ")}</p>}
                  </div>
                  <span className="tabular-nums">{formatUZS(it.line_total)}</span>
                </li>
              ))}
            </ul>
            {o.comment && <p className="mt-3 flex gap-2 rounded-xl bg-warn-50 p-3 text-sm"><IconComment size={18} className="shrink-0 text-warn" /> {o.comment}</p>}
            <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
              {[
                [L("Mahsulotlar", "Товары"), o.subtotal],
                [L("Qadoqlash", "Упаковка"), o.packaging_total],
                [L("Yetkazish", "Доставка"), o.delivery_fee],
                [L("Hudud ustamasi", "Надбавка за зону"), o.zone_surcharge],
                [`${L("Chegirma", "Скидка")}${o.promo_code ? ` (${o.promo_code})` : ""}`, -o.discount_total],
                [L("Jamg'armadan", "С накопительного"), -o.loyalty_spent],
              ]
                .filter(([, v]) => v !== 0)
                .map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between">
                    <dt>{k}</dt>
                    <dd className="tabular-nums">{formatUZS(v as number)}</dd>
                  </div>
                ))}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <dt>{L("Jami", "Итого")}</dt>
                <dd className="tabular-nums">{formatUZS(o.total)}</dd>
              </div>
              {o.refunded_amount > 0 && (
                <div className="flex justify-between text-brand">
                  <dt>{L("Qaytarilgan", "Возвращено")}</dt>
                  <dd className="tabular-nums">{formatUZS(o.refunded_amount)}</dd>
                </div>
              )}
            </dl>
          </Panel>

          <Panel title={L("Tarix", "История")}>
            <ol className="relative space-y-3 border-l-2 border-line pl-5 text-sm">
              {history.map((h, i) => (
                <li key={i} className="relative flex flex-wrap items-center gap-2">
                  <span className="absolute -left-[27px] size-3 rounded-full border-2 border-white bg-subtle ring-2 ring-line" />
                  <span className="w-36 text-muted">{formatDateTime(h.created_at, lang)}</span>
                  <Pill tone={statusTone(h.to_status)}>{statusLabel(h.to_status, lang)}</Pill>
                  <span className="text-muted">{actorLabel(h.actor_kind, lang)}</span>
                  {h.note && <span>— {h.note}</span>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title={L("Mijoz", "Клиент")}>
            <p className="font-semibold">{o.customer_name}</p>
            <a href={`tel:${o.customer_phone}`} className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 font-medium text-brand transition-colors hover:bg-[#ffe1e1]">
              📞 
              {o.customer_phone}
            </a>
            <p className="mt-1 text-sm text-muted">
              {L("Buyurtmalar soni", "Всего заказов")}: {customerOrders}
            </p>
            {manager && (
              <Link href={`/admin/customers/${o.customer_id}`} className="mt-2 inline-block text-sm text-brand hover:underline">
                {L("Mijoz kartasi", "Карточка клиента")} <IconArrowRight size={16} className="inline-block shrink-0 align-[-0.15em]" />
              </Link>
            )}
            {o.is_for_other && (
              <div className="mt-3 rounded-xl bg-info-50 p-3 text-sm text-info">
                {L("Qabul qiluvchi", "Получатель")}: {o.recipient_name}, {o.recipient_phone}
              </div>
            )}
          </Panel>
          <Panel title={o.fulfillment === "delivery" ? L("Yetkazish", "Доставка") : L("Olib ketish", "Самовывоз")}>
            <p className="text-sm">
              {o.brand_name} · {tr(o.branch_name, lang)}
            </p>
            {o.address && (
              <p className="mt-2">
                {o.address.text}
                {o.address.house && `, ${L("uy", "дом")} ${o.address.house}`}
                {o.address.apartment && `, ${L("xon.", "кв.")} ${o.address.apartment}`}
                {o.address.entrance && `, ${L("podyezd", "подъезд")} ${o.address.entrance}`}
                {o.address.floor && `, ${L("qavat", "этаж")} ${o.address.floor}`}
              </p>
            )}
            {o.address?.instructions && <p className="mt-1 flex gap-1.5 text-sm text-muted"><IconComment size={16} className="mt-0.5 shrink-0" /> {o.address.instructions}</p>}
            {o.leave_at_door && <p className="mt-1 text-sm font-medium text-warn">{L("Eshik oldida qoldirish", "Оставить у двери")}</p>}
            <p className="mt-3 text-sm">
              {o.asap ? L("Imkon qadar tez", "Как можно скорее") : L("Vaqtga", "Ко времени")}: <b>{formatDateTime(o.promised_at, lang)}</b>
            </p>
          </Panel>
          <Panel title={L("To'lov", "Оплата")}>
            <p>
              {methodLabel(o.payment_method, lang)} · <b>{paymentLabel(o.payment_status, lang)}</b>
            </p>
            {o.cancel_reason && (
              <p className="mt-2 text-sm text-brand">
                {L("Bekor qilish sababi", "Причина отмены")}: {reasonLabel(o.cancel_reason, lang)} ({o.cancelled_by})
              </p>
            )}
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {payments.map((p) => (
                <li key={p.id}>
                  {p.provider} · {formatUZS(p.amount)} · {p.status} · {formatDateTime(p.created_at, lang)}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
