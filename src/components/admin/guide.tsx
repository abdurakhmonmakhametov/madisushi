"use client";

// Beginner help: "?" tips next to confusing fields, a collapsible
// "how this page works" card on every page, and the Help Center sheet with
// computer basics, the daily routine and a glossary.
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { useLang } from "@/lib/i18n/client";
import { Sheet } from "@/components/ui/primitives";
import { IconCheck, IconClose, IconInfo } from "@/components/ui/icons";

function useL() {
  const lang = useLang();
  return (uz: string, ru: string) => (lang === "ru" ? ru : uz);
}

export { HelpTip } from "@/components/ui/HelpTip";

/**
 * "How this page works" card. Open the first time, then remembers if the
 * person hid it; a small button brings it back.
 */
export function PageGuide({ title, steps, tip }: { title?: string; steps: string[]; tip?: string }) {
  const L = useL();
  const pathname = usePathname();
  const key = `guide:${pathname.replace(/\/[0-9a-f-]{36}|\/new/gi, "/:id")}`;
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(key) !== "hidden");
    } catch {
      setOpen(true);
    }
  }, [key]);
  const set = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(key, v ? "shown" : "hidden");
    } catch {}
  };
  if (open === null) return null;
  if (!open)
    return (
      <button type="button" onClick={() => set(true)} className="anim-pop no-print mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-medium text-ink/80 shadow-[var(--shadow-card)] transition-colors hover:border-info/40 hover:text-info">
        <BulbIcon size={16} /> {L("Bu sahifa qanday ishlaydi?", "Как работает эта страница?")}
      </button>
    );
  return (
    <section className="anim-rise no-print relative mb-5 overflow-hidden rounded-2xl border border-info/15 bg-gradient-to-br from-info-50 via-white to-white p-3.5 sm:p-4 lg:mb-6 lg:p-5">
      <div className="flex items-start gap-3">
        <span className="hidden size-10 shrink-0 place-items-center rounded-xl bg-info text-white shadow-[0_4px_12px_rgb(30_79_216/0.3)] sm:grid">
          <BulbIcon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="pr-8 text-[15px] font-semibold">{title ?? L("Bu sahifa qanday ishlaydi?", "Как работает эта страница?")}</p>
          <ol className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-xl bg-white/80 p-2 text-[13px] leading-snug ring-1 ring-line/80 sm:p-2.5 sm:text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-info-50 text-xs font-bold text-info">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
          {tip && (
            <p className="mt-3 flex items-start gap-2 text-sm text-ink/70">
              <IconInfo size={16} className="mt-0.5 shrink-0 text-info" /> {tip}
            </p>
          )}
          <button type="button" onClick={() => set(false)} className="btn mt-3 h-9 bg-white px-3.5 text-sm ring-1 ring-line hover:bg-field">
            <IconCheck size={16} /> {L("Tushundim, yashirish", "Понятно, скрыть")}
          </button>
        </div>
      </div>
      <button type="button" onClick={() => set(false)} aria-label={L("Yopish", "Закрыть")} className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-white hover:text-ink">
        <IconClose size={16} />
      </button>
    </section>
  );
}

/** Visual chain of steps, e.g. how an order moves from "new" to "delivered". */
export function StepFlow({ steps, current, done }: { steps: { label: string; hint?: string }[]; current?: number; done?: boolean }) {
  return (
    <ol className="flex w-full items-start overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const passed = done || (current !== undefined && i < current);
        const now = !done && current === i;
        return (
          <li key={i} className="flex min-w-[88px] flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={clsx("h-0.5 flex-1 rounded-full transition-colors duration-500", i === 0 ? "opacity-0" : passed || now ? "bg-ok" : "bg-line")} />
              <span
                className={clsx(
                  "relative grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-all duration-300",
                  passed ? "bg-ok text-white" : now ? "bg-brand text-white shadow-[0_0_0_6px_rgb(215_40_47/0.12)]" : "bg-field text-muted",
                )}
              >
                {passed ? <IconCheck size={16} /> : i + 1}
                {now && <span className="absolute inset-0 animate-ping rounded-full bg-brand/30" />}
              </span>
              <span className={clsx("h-0.5 flex-1 rounded-full transition-colors duration-500", i === steps.length - 1 ? "opacity-0" : passed ? "bg-ok" : "bg-line")} />
            </div>
            <span className={clsx("mt-2 px-1 text-xs font-semibold leading-tight", now ? "text-brand" : passed ? "text-ink" : "text-muted")}>{s.label}</span>
            {s.hint && <span className="mt-0.5 px-1 text-[11px] leading-tight text-muted">{s.hint}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------ help center */

type Topic = { id: string; icon: React.ReactNode; title: string; items: { q: string; a: string }[] };

export function HelpButton({ className, compact }: { className?: string; compact?: boolean }) {
  const L = useL();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<string>("start");
  const topics: Topic[] = [
    {
      id: "start",
      icon: <span className="text-lg">👋</span>,
      title: L("Birinchi qadamlar", "Первые шаги"),
      items: [
        { q: L("Panel nima uchun kerak?", "Зачем нужна панель?"), a: L("Bu yerda siz mijozlarning buyurtmalarini qabul qilasiz, tugagan taomlarni yashirasiz, stol bronlarini tasdiqlaysiz va menyuni o'zgartirasiz. Mijozlar saytda ko'radigan hamma narsa shu yerdan boshqariladi.", "Здесь вы принимаете заказы, скрываете закончившиеся блюда, подтверждаете брони столов и меняете меню. Всё, что гости видят на сайте, управляется отсюда.") },
        { q: L("Bo'limlar qayerda?", "Где разделы?"), a: L("Kompyuterda — chap tomondagi ro'yxat. Telefonda — ekranning pastidagi tugmalar, qolganlari «Yana» tugmasida. Hozir qaysi bo'limda ekaningiz qizil rang bilan belgilanadi.", "На компьютере — список слева. На телефоне — кнопки внизу экрана, остальные в «Ещё». Текущий раздел выделен красным.") },
        { q: L("Har bir sahifada nimani qilishni qayerdan bilaman?", "Как понять, что делать на странице?"), a: L("Har bir sahifaning yuqorisida ko'k «Bu sahifa qanday ishlaydi?» kartasi bor — unda qadam-baqadam yozilgan. «?» belgisini bossangiz, o'sha maydon nimani anglatishi tushuntiriladi.", "Вверху каждой страницы есть синяя карточка «Как работает эта страница?» с пошаговой инструкцией. Нажмите «?» рядом с полем — увидите пояснение.") },
        { q: L("Xato qilib qo'ysam-chi?", "А если я ошибусь?"), a: L("Qo'rqmang. Muhim amallar (o'chirish, bekor qilish) oldidan panel sizdan yana so'raydi. Saqlangan o'zgarishlar «O'zgarishlar tarixi»da yoziladi, shuning uchun menejer har doim tuzata oladi.", "Не бойтесь. Перед важными действиями (удаление, отмена) панель переспросит. Все изменения записываются в «Историю изменений», менеджер всегда сможет исправить.") },
      ],
    },
    {
      id: "pc",
      icon: <span className="text-lg">💻</span>,
      title: L("Kompyuter bilan ishlash", "Работа с компьютером"),
      items: [
        { q: L("Sichqoncha / sensorli panel", "Мышь / тачпад"), a: L("Ko'rsatkichni tugma ustiga olib boring va chap tugmani bir marta bosing. Noutbukda sensorli panelga bir barmoq bilan bir marta tegining.", "Наведите указатель на кнопку и один раз нажмите левую кнопку. На ноутбуке — один раз коснитесь тачпада одним пальцем.") },
        { q: L("Sahifani pastga tushirish (skroll)", "Прокрутка страницы"), a: L("Sichqoncha g'ildiragini aylantiring yoki sensorli panelda ikki barmoqni yuqoriga/pastga suring. Klaviaturadagi ↓ va ↑ tugmalari ham ishlaydi.", "Крутите колёсико мыши или проведите двумя пальцами по тачпаду вверх/вниз. Также работают клавиши ↓ и ↑.") },
        { q: L("Matn yozish", "Ввод текста"), a: L("Avval maydonni bosing — ichida miltillovchi chiziq paydo bo'ladi. Keyin yozing. Xato harfni o'chirish uchun ⌫ Backspace tugmasini bosing.", "Сначала нажмите на поле — появится мигающая черта. Затем печатайте. Чтобы стереть букву, нажмите ⌫ Backspace.") },
        { q: L("Ro'yxatdan tanlash", "Выбор из списка"), a: L("Pastga qaragan o'q (⌄) bor maydonni bosing — variantlar ochiladi. Keraklisini bosing. Yopish uchun bo'sh joyni bosing yoki Esc tugmasini bosing.", "Нажмите на поле со стрелкой (⌄) — откроется список. Нажмите на нужный вариант. Чтобы закрыть, нажмите на пустое место или Esc.") },
        { q: L("Sahifa qotib qoldi", "Страница зависла"), a: L("Klaviaturada F5 tugmasini bosing — sahifa qayta yuklanadi. Oldingi sahifaga qaytish uchun brauzerning yuqori chap burchagidagi ← tugmasini bosing.", "Нажмите F5 — страница перезагрузится. Чтобы вернуться назад, нажмите ← в левом верхнем углу браузера.") },
        { q: L("Yozuvlar juda mayda", "Слишком мелкий текст"), a: L("Ctrl tugmasini bosib turib + ni bosing — hammasi kattalashadi. Kichraytirish: Ctrl va −. Asl holatga: Ctrl va 0.", "Удерживая Ctrl, нажмите + — всё станет крупнее. Уменьшить: Ctrl и −. Вернуть: Ctrl и 0.") },
      ],
    },
    {
      id: "daily",
      icon: <span className="text-lg">📋</span>,
      title: L("Kundalik ish tartibi", "Ежедневный порядок"),
      items: [
        { q: L("1. Ish boshida", "1. В начале смены"), a: L("«Tugagan taomlar» bo'limini oching va bugun yo'q taomlarni «Tugadi» holatiga o'tkazing — mijozlar ularni buyurtma qila olmaydi.", "Откройте «Стоп-лист» и отметьте блюда, которых сегодня нет, — гости не смогут их заказать.") },
        { q: L("2. Yangi buyurtma kelganda", "2. Пришёл новый заказ"), a: L("«Buyurtmalar» sahifasi o'zi yangilanadi. Yangi buyurtmani bosing, tarkibini tekshiring va katta qizil tugma bilan keyingi bosqichga o'tkazing.", "Страница «Заказы» обновляется сама. Нажмите на новый заказ, проверьте состав и переведите его дальше большой красной кнопкой.") },
        { q: L("3. Buyurtma tayyorlanayotganda", "3. Пока готовится заказ"), a: L("Har bir bosqichda tugmani bosing: Tasdiqlash → Tayyorlanmoqda → Tayyor → Yo'lda → Yetkazildi. Mijoz holatni saytda ko'rib turadi.", "На каждом этапе нажимайте кнопку: Подтвердить → Готовится → Готов → В пути → Доставлен. Гость видит статус на сайте.") },
        { q: L("4. Stol bronlari", "4. Брони столов"), a: L("«Stol bronlari»da bugungi mehmonlarni ko'ring. Yangi bronni tasdiqlang, mehmon kelganda «Keldi» ni bosing.", "В «Бронях столов» смотрите гостей на сегодня. Подтвердите новую бронь, когда гость пришёл — нажмите «Пришли».") },
        { q: L("5. Ish oxirida", "5. В конце смены"), a: L("Tugagan taomlarni yana «Bor» holatiga qaytarishni unutmang (ertaga bo'lsa). Keyin pastdagi «Chiqish» tugmasini bosing.", "Не забудьте вернуть блюда в «Есть» (если завтра будут). Затем нажмите «Выйти».") },
      ],
    },
    {
      id: "words",
      icon: <span className="text-lg">📖</span>,
      title: L("Atamalar lug'ati", "Словарь терминов"),
      items: [
        { q: L("Stop-list (tugagan taomlar)", "Стоп-лист"), a: L("Hozir tayyorlab bo'lmaydigan taomlar ro'yxati. Ular saytda «tugagan» deb ko'rinadi va buyurtma qilib bo'lmaydi.", "Блюда, которые сейчас нельзя приготовить. На сайте они видны как «нет в наличии».") },
        { q: L("Filial", "Филиал"), a: L("Restoranning alohida manzildagi bo'limi. Har bir filialning o'z ish vaqti va yetkazish hududi bor.", "Отдельная точка ресторана по своему адресу. У каждой свои часы работы и зона доставки.") },
        { q: L("Promokod", "Промокод"), a: L("Mijoz buyurtma berishda yozadigan maxsus so'z (masalan SUSHI10). U chegirma beradi.", "Специальное слово (например SUSHI10), которое гость вводит при заказе, чтобы получить скидку.") },
        { q: L("Keshbek / jamg'arma", "Кешбэк / накопления"), a: L("Mijoz har bir buyurtmadan oladigan bonus pul. Keyingi buyurtmalarda u bilan to'lashi mumkin.", "Бонусные деньги с каждого заказа. Гость может оплатить ими следующие заказы.") },
        { q: L("Slug", "Slug"), a: L("Sahifa manzili uchun qisqa lotincha nom: faqat kichik harflar, raqamlar va chiziqcha. Masalan: filadelfiya-roll. Bo'sh joy ishlatmang.", "Короткое латинское имя для адреса страницы: строчные буквы, цифры и дефис. Например: filadelfiya-roll. Без пробелов.") },
        { q: L("Tartib (sort)", "Порядок (sort)"), a: L("Ro'yxatdagi o'rin raqami. Kichik raqam yuqorida turadi: 1 — birinchi, 2 — ikkinchi.", "Номер места в списке. Меньшее число — выше: 1 — первый, 2 — второй.") },
        { q: L("Qoralama", "Черновик"), a: L("Hali saytga chiqarilmagan, faqat panelda ko'rinadigan yozuv. Tayyor bo'lgach «E'lon qilingan» holatiga o'tkazing.", "Запись, которая ещё не опубликована и видна только в панели. Когда готово — переведите в «Опубликовано».") },
      ],
    },
  ];
  const t = topics.find((x) => x.id === topic) ?? topics[0];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={clsx("btn h-10 gap-2 bg-info-50 px-3.5 text-sm text-info hover:bg-[#d6e2fc]", className)}>
        <span className="grid size-5 place-items-center rounded-full bg-info text-[11px] font-bold text-white">?</span>
        {!compact && L("Yordam", "Помощь")}
      </button>
      <Sheet open={open} onOpenChange={setOpen} side="right" title={L("Yordam markazi", "Центр помощи")}>
        <p className="px-6 pt-1 text-sm text-muted">{L("Savolingizga oddiy tilda javob toping.", "Ответы на вопросы простым языком.")}</p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-6 pb-2 pt-4">
          {topics.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTopic(x.id)}
              className={clsx("flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors", x.id === topic ? "bg-ink text-white" : "bg-field text-ink/80 hover:bg-line")}
            >
              {x.icon} {x.title}
            </button>
          ))}
        </div>
        <div key={t.id} className="stagger min-h-0 flex-1 space-y-2 overflow-y-auto px-6 pb-8 pt-2">
          {t.items.map((it, i) => (
            <details key={i} className="group rounded-2xl border border-line bg-white transition-colors open:border-info/30 open:bg-info-50/40" open={i === 0}>
              <summary className="flex cursor-pointer items-center gap-3 px-4 py-3.5 text-[15px] font-semibold">
                <span className="min-w-0 flex-1">{it.q}</span>
              </summary>
              <p className="px-4 pb-4 text-[14px] leading-relaxed text-ink/75">{it.a}</p>
            </details>
          ))}
          <div className="mt-4 rounded-2xl bg-night p-4 text-sm text-white/80">
            <p className="font-semibold text-white">{L("Hali ham tushunarsizmi?", "Всё ещё непонятно?")}</p>
            <p className="mt-1">{L("Menejeringiz yoki bosh administratorga murojaat qiling — ular sizga yordam beradi.", "Обратитесь к менеджеру или главному администратору — они помогут.")}</p>
          </div>
        </div>
      </Sheet>
    </>
  );
}

export function BulbIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z" />
    </svg>
  );
}


