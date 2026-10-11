"use client";

// Makes the site and the admin panel work as a Telegram Mini App:
// - loads telegram-web-app.js only when actually opened inside Telegram
// - logs the user in automatically (customer on the site, staff under /admin)
// - asks a new customer to share their Telegram phone once
// - wires Telegram's native Back button and colours
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type WebApp = {
  initData: string;
  version: string;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  disableVerticalSwipes?: () => void;
  requestContact?: (cb: (ok: boolean, res?: { response?: string; status?: string }) => void) => void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { notificationOccurred(t: "success" | "error" | "warning"): void };
};
declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
    TelegramWebviewProxy?: unknown;
  }
}

const FLAG = "tg_webapp";
const SCRIPT = "https://telegram.org/js/telegram-web-app.js";
const ss = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {}
  },
};

function launchedInTelegram(): boolean {
  if (typeof window === "undefined") return false;
  const hit = /[?&]tg=1\b/.test(location.search) || location.hash.includes("tgWebAppData") || Boolean(window.TelegramWebviewProxy) || ss.get(FLAG) === "1";
  if (hit) ss.set(FLAG, "1");
  return hit;
}

function loadWebApp(): Promise<WebApp | null> {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve(window.Telegram?.WebApp ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

async function login(initData: string, as: "customer" | "staff", contact?: string): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  try {
    const r = await fetch("/api/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData, as, contact }) });
    return { ...(await r.json().catch(() => ({}))), ok: r.ok };
  } catch {
    return { ok: false, error: "network" };
  }
}

const T = {
  uz: {
    title: "Telefon raqamingizni ulang",
    body: "Buyurtma berish va holatini Telegramda olish uchun bir marta raqamingizni ulang. SMS kod kerak emas.",
    share: "📱 Raqamni ulash",
    later: "Keyinroq",
    fail: "Raqam ulanmadi. Botga raqamingizni yuboring va qayta oching.",
    old: "Telegram ilovangizni yangilang yoki botda «📱 Telefon raqamni yuborish» tugmasini bosing.",
  },
  ru: {
    title: "Подключите номер телефона",
    body: "Чтобы заказывать и получать статус в Telegram, один раз подключите номер. SMS-код не нужен.",
    share: "📱 Подключить номер",
    later: "Позже",
    fail: "Не удалось подключить номер. Отправьте номер боту и откройте снова.",
    old: "Обновите Telegram или нажмите в боте «📱 Отправить номер».",
  },
};

export function TelegramBridge({ lang }: { lang: "uz" | "ru" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [app, setApp] = useState<WebApp | null>(null);
  const [askContact, setAskContact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const t = T[lang];
  const isAdmin = pathname.startsWith("/admin");

  const afterLogin = useCallback(
    (already?: boolean) => {
      if (isAdmin && pathname === "/admin/login") router.replace("/admin");
      else if (!isAdmin && pathname === "/login") router.replace("/");
      else if (!already) router.refresh();
    },
    [isAdmin, pathname, router],
  );

  // Boot once.
  useEffect(() => {
    if (!launchedInTelegram()) return;
    let cancelled = false;
    loadWebApp().then((wa) => {
      if (cancelled || !wa?.initData) return;
      document.documentElement.dataset.tg = "1";
      wa.ready();
      wa.expand();
      if (wa.isVersionAtLeast("6.1")) {
        wa.setHeaderColor("#ffffff");
        wa.setBackgroundColor("#ffffff");
      }
      if (wa.isVersionAtLeast("7.7")) wa.disableVerticalSwipes?.();
      setApp(wa);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-login once per area (site / admin) per Telegram session.
  const tried = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!app) return;
    const as = isAdmin ? "staff" : "customer";
    const key = `tg_login_${as}`;
    if (tried.current[as] || ss.get(key)) return;
    tried.current[as] = true;
    login(app.initData, as).then((r) => {
      ss.set(key, "1");
      if (r.ok) afterLogin(r.already);
      else if (as === "customer" && r.error === "need_contact" && ss.get("tg_contact_later") !== "1") setAskContact(true);
    });
  }, [app, isAdmin, afterLogin]);

  // Native Back button instead of the browser's.
  useEffect(() => {
    if (!app || !app.isVersionAtLeast("6.1")) return;
    const root = pathname === "/" || pathname === "/admin" || pathname === "/admin/login";
    const back = () => (window.history.length > 1 ? router.back() : router.push(isAdmin ? "/admin" : "/"));
    if (root) app.BackButton.hide();
    else {
      app.BackButton.show();
      app.BackButton.onClick(back);
    }
    return () => app.BackButton.offClick(back);
  }, [app, pathname, isAdmin, router]);

  async function shareContact() {
    if (!app) return;
    if (!app.requestContact || !app.isVersionAtLeast("6.9")) return setNote(t.old);
    setBusy(true);
    app.requestContact(async (ok, res) => {
      if (!ok) return setBusy(false);
      // Signed contact is verified by the server; if that fails, the bot also
      // receives the contact and links it — so poll a few times.
      for (let i = 0; i < 6; i++) {
        const r = await login(app.initData, "customer", i === 0 ? res?.response : undefined);
        if (r.ok) {
          app.HapticFeedback?.notificationOccurred("success");
          setBusy(false);
          setAskContact(false);
          return afterLogin(false);
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setBusy(false);
      setNote(t.fail);
    });
  }

  if (!askContact) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-3 pb-[calc(12px+env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-labelledby="tg-contact-title">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
        <h2 id="tg-contact-title" className="text-lg font-bold">{t.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t.body}</p>
        {note && <p className="mt-3 rounded-xl bg-brand-50 p-3 text-sm text-brand">{note}</p>}
        <div className="mt-5 grid gap-2">
          <button type="button" className="btn-primary h-12" onClick={shareContact} disabled={busy} aria-busy={busy}>
            {t.share}
          </button>
          <button
            type="button"
            className="btn-soft h-11"
            onClick={() => {
              ss.set("tg_contact_later", "1");
              setAskContact(false);
            }}
          >
            {t.later}
          </button>
        </div>
      </div>
    </div>
  );
}
