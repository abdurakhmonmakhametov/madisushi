import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { asActor } from "@/lib/db";
import { loadSettings } from "@/lib/settings";
import { methodStatus } from "@/lib/payments/core";
import { smsStatus } from "@/lib/integrations/sms";
import { storageStatus } from "@/lib/integrations/storage";
import { isProduction } from "@/lib/env";
import { PageHeader, Panel, Pill, Table } from "@/components/admin/server-ui";
import { ActionForm, Check, FileInput, I18nInput, Input, Select, SubmitButton, Switch } from "@/components/admin/ui";
import { IconSettings } from "@/components/ui/icons";
import { saveSettingAction } from "../../actions/system";

export default async function SettingsAdmin() {
  const staff = await requireStaff("settings");
  const { L } = await getL();
  const s = await asActor({ kind: "staff", id: staff.id }, (d) => loadSettings(d));
  const integrations = [
    ...methodStatus().map((m) => ({ name: `${L("To'lov", "Оплата")}: ${m.method}`, ready: m.ready, note: `${m.listed ? "" : L("PAYMENT_METHODS ro'yxatida yo'q. ", "Нет в PAYMENT_METHODS. ")}${m.note}` })),
    { name: `SMS: ${smsStatus().provider}`, ...smsStatus() },
    { name: `${L("Rasmlar", "Файлы")}: ${storageStatus().provider}`, ...storageStatus() },
    { name: `${L("Manzil qidiruv", "Геокодер")}: ${process.env.GEOCODER_PROVIDER || "local"}`, ready: (process.env.GEOCODER_PROVIDER || "local") === "local", note: L("Ichki Toshkent gazetteer; Yandex/Google adapteri kalit bilan qo'shilishi kerak", "Встроенный справочник Ташкента; адаптер Yandex/Google требует ключа") },
    { name: `${L("Kuryer xizmati", "Курьерская служба")}: ${process.env.COURIER_PROVIDER || "in_house"}`, ready: true, note: L("O'z kuryerlari (tashqi API yo'q)", "Свои курьеры (без внешнего API)") },
  ];
  const Form = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <ActionForm action={saveSettingAction} className="space-y-3">
      <input type="hidden" name="key" value={k} />
      {children}
      <SubmitButton>{L("Saqlash", "Сохранить")}</SubmitButton>
    </ActionForm>
  );

  return (
    <>
      <PageHeader
        icon={<IconSettings size={24} />}
        title={L("Sozlamalar", "Настройки")}
        description={L("Butun sayt uchun umumiy sozlamalar. Har bir bo'lim alohida saqlanadi.", "Общие настройки всего сайта. Каждый блок сохраняется отдельно.")}
        guide={{
          steps: [
            L("Kerakli bo'limni toping (masalan «Kontaktlar»).", "Найдите нужный блок (например «Контакты»)."),
            L("Qiymatni o'zgartiring va shu bo'limning o'zidagi «Saqlash» tugmasini bosing.", "Измените значение и нажмите «Сохранить» в этом же блоке."),
          ],
          tip: L("Ishonchingiz komil bo'lmasa, bu yerdagi narsalarni o'zgartirmang — bosh administratordan so'rang.", "Если не уверены — не меняйте, спросите главного администратора."),
        }}
      >
        <Pill tone={isProduction ? "brand" : "warn"}>{isProduction ? "production" : "development"}</Pill>
      </PageHeader>
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <Panel title={L("Integratsiyalar holati", "Статус интеграций")} className="2xl:col-span-2">
          <Table head={[L("Integratsiya", "Интеграция"), L("Holat", "Статус"), L("Izoh", "Примечание")]}>
            {integrations.map((i) => (
              <tr key={i.name}>
                <td className="px-3 py-2 font-medium">{i.name}</td>
                <td className="px-3 py-2">{i.ready ? <Pill tone="ok">{L("tayyor", "готово")}</Pill> : <Pill tone="warn">{L("sozlanmagan", "не настроено")}</Pill>}</td>
                <td className="px-3 py-2 text-muted">{i.note}</td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-xs text-muted">{L("Maxfiy kalitlar faqat server muhit o'zgaruvchilarida saqlanadi va bu yerda ko'rsatilmaydi.", "Секретные ключи хранятся только в переменных окружения сервера и здесь не показываются.")}</p>
        </Panel>

        <Panel title={L("Brending", "Брендинг")}>
          <Form k="branding">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label={L("Platforma nomi", "Название платформы")} name="platformName" defaultValue={s.branding.platformName} required maxLength={40} />
              <Input label={L("Asosiy rang", "Основной цвет")} name="primaryColor" type="color" defaultValue={s.branding.primaryColor} />
            </div>
            <input type="hidden" name="currentLogo" value={s.branding.logoUrl ?? ""} />
            <FileInput name="logo" label={L("Logotip", "Логотип")} current={s.branding.logoUrl} />
            {s.branding.logoUrl && <Check label={L("Logotipni olib tashlash (matnli logo)", "Убрать логотип (текстовый логотип)")} name="removeLogo" />}
            <I18nInput label={L("Futer matni", "Текст футера")} name="footerText" value={s.branding.footerText} />
          </Form>
        </Panel>

        <Panel title={L("Kontaktlar", "Контакты")}>
          <Form k="contacts">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label={L("Telefon", "Телефон")} name="phone" defaultValue={s.contacts.phone} />
              <Input label="Email" name="email" defaultValue={s.contacts.email} />
              <Input label="Telegram" name="telegram" defaultValue={s.contacts.telegram} />
              <Input label="Instagram" name="instagram" defaultValue={s.contacts.instagram} />
            </div>
            <I18nInput label={L("Manzil", "Адрес")} name="address" value={s.contacts.address} />
            <I18nInput label={L("Ish vaqti matni", "Текст часов работы")} name="hours" value={s.contacts.hours} />
          </Form>
        </Panel>

        <Panel title={L("Loyallik dasturi", "Программа лояльности")}>
          <Form k="loyalty">
            <Switch label={L("Bonus dasturi yoqilgan", "Бонусная программа включена")} hint={L("Mijozlar har buyurtmadan bonus oladi", "Гости получают бонусы с каждого заказа")} name="enabled" defaultChecked={s.loyalty.enabled} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input label={L("Keshbek, %", "Кешбэк, %")} help={L("Buyurtma summasining necha foizi bonus bo'lib qaytadi. Masalan 5.", "Какой процент суммы вернётся бонусами. Например 5.")} name="earnPercent" type="number" step="0.01" min={0} max={50} defaultValue={s.loyalty.earn_bps / 100} />
              <Input label={L("Bir buyurtmada maks., UZS", "Макс. за заказ, UZS")} name="maxSpendAmount" type="number" min={0} defaultValue={s.loyalty.max_spend_amount} />
              <Input label={L("Summadan maks., %", "Макс. от суммы, %")} name="maxSpendPercent" type="number" step="0.01" min={0} max={100} defaultValue={s.loyalty.max_spend_bps / 100} />
            </div>
            <p className="text-xs text-muted">{L("Keshbek yakunlangan va to'langan buyurtmaning mahsulotlar summasidan (chegirma va jamg'armadan keyin) hisoblanadi.", "Кешбэк начисляется от суммы товаров завершённого и оплаченного заказа (после скидок и списаний).")}</p>
          </Form>
        </Panel>

        <Panel title={L("Buyurtma va vaqt", "Оформление и время")}>
          <Form k="scheduling">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label={L("Vaqt oralig'i, daq", "Шаг слотов, мин")} name="slotMinutes" type="number" min={5} max={120} defaultValue={s.scheduling.slot_minutes} />
              <Input label={L("Necha kun oldin", "На сколько дней вперёд")} name="maxDaysAhead" type="number" min={0} max={30} defaultValue={s.scheduling.max_days_ahead} />
            </div>
          </Form>
          <div className="my-5 border-t border-line" />
          <Form k="checkout">
            <Switch label={L("'Eshik oldida qoldirish' (faqat onlayn to'lovda)", "«Оставить у двери» (только онлайн-оплата)")} name="leaveAtDoor" defaultChecked={s.checkout.leave_at_door_enabled} />
            <Switch label={L("'Do'stim uchun buyurtma'", "«Заказ для друга»")} name="forOther" defaultChecked={s.checkout.order_for_other_enabled} />
            <I18nInput label={L("Yetkazish haqida izoh (checkoutda)", "Заметка о доставке (в оформлении)")} name="deliveryNote" value={s.checkout.delivery_info_note} multiline />
          </Form>
        </Panel>

        <Panel title={L("Tillar va bosh sahifa", "Языки и главная")}>
          <Form k="languages">
            <Select label={L("Asosiy til", "Язык по умолчанию")} name="default" defaultValue={s.languages.default} options={[{ value: "uz", label: "O'zbekcha" }, { value: "ru", label: "Русский" }]} />
            <div className="flex flex-wrap gap-2">
              <Check label="O'zbekcha" name="enabled" value="uz" defaultChecked={s.languages.enabled.includes("uz")} />
              <Check label="Русский" name="enabled" value="ru" defaultChecked={s.languages.enabled.includes("ru")} />
            </div>
          </Form>
          <div className="my-5 border-t border-line" />
          <Form k="home">
            <Switch label={L("Aksiyalarni ko'rsatish", "Показывать акции")} name="showPromotions" defaultChecked={s.home.show_promotions} />
            <Switch label={L("Xitlarni ko'rsatish", "Показывать хиты")} name="showBestsellers" defaultChecked={s.home.show_bestsellers} />
            <Input label={L("Xitlar soni", "Количество хитов")} name="bestsellersLimit" type="number" min={0} max={40} defaultValue={s.home.bestsellers_limit} />
          </Form>
        </Panel>

        <Panel title={L("Bildirishnomalar", "Уведомления")}>
          <Form k="notifications">
            <Switch label={L("Yangi buyurtma haqida xabar", "Уведомлять о новых заказах")} name="onOrder" defaultChecked={s.notifications.notify_on_new_order} />
            <Switch label={L("Yangi bron haqida xabar", "Уведомлять о новых бронях")} name="onReservation" defaultChecked={s.notifications.notify_on_reservation} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Email" name="email" defaultValue={s.notifications.new_order_email} />
              <Input label="Telegram chat id" name="telegram" defaultValue={s.notifications.telegram_chat_id} />
            </div>
            <p className="text-xs text-muted">{L("Telegram chat id (vergul bilan bir nechta) barcha voqealarni oladi — botga /id yozib bilib oling. Xodimlar esa «Telegram bot» sahifasidan ulanadi. Email hali ulanmagan.", "Telegram chat id (несколько через запятую) получает все события — узнайте его, написав боту /id. Сотрудники подключаются на странице «Telegram-бот». Email пока не подключён.")}</p>
          </Form>
        </Panel>
      </div>
    </>
  );
}
