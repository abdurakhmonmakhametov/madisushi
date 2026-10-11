"use client";

// Admin "pulse": polls /api/admin/pulse so every admin page knows how many
// orders wait for someone. Drives the sidebar badges, the new-order banner,
// the tab-title counter and an optional chime (so staff notice new orders
// even from another tab).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { IconArrowRight, IconBell, IconClose, IconMute, IconSound } from "@/components/ui/icons";
import { useL } from "./ui";
import { useRealtime } from "@/lib/realtime-client";

export type Pulse = { newOrders: number; activeOrders: number; latestNew: string | null; pendingReservations: number };
type Ctx = { pulse: Pulse | null; sound: boolean; setSound: (v: boolean) => void };

const PulseCtx = createContext<Ctx>({ pulse: null, sound: false, setSound: () => {} });
export const usePulse = () => useContext(PulseCtx);

const SOUND_KEY = "admin_sound";
let audio: AudioContext | null = null;

/** Two-tone "ding-dong" made with WebAudio, so no sound file is needed. */
export function chime() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const t0 = audio.currentTime;
    for (const [i, f] of [880, 660, 880, 660].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const t = t0 + i * 0.28;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    }
  } catch {
    /* audio not available */
  }
}

export function PulseProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const L = useL();
  const router = useRouter();
  const pathname = usePathname();
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [sound, setSoundState] = useState(false);
  const [alert, setAlert] = useState(false);
  const seen = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    try {
      setSoundState(localStorage.getItem(SOUND_KEY) === "1");
    } catch {
      /* storage blocked */
    }
    // Browsers only allow audio after a user gesture; unlock on the first click.
    const unlock = () => {
      try {
        audio ??= new AudioContext();
        void audio.resume();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const setSound = useCallback((v: boolean) => {
    setSoundState(v);
    try {
      localStorage.setItem(SOUND_KEY, v ? "1" : "0");
    } catch {
      /* storage blocked */
    }
    if (v) chime();
  }, []);

  const soundRef = useRef(sound);
  soundRef.current = sound;
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  // Live events trigger an immediate re-count; the timer is only a safety net.
  const kick = useRef<() => void>(() => {});
  useRealtime(
    "staff",
    (e) => {
      if (e.t === "order" || e.t === "reservation" || e.t === "resync") kick.current();
    },
    enabled,
  );

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let debounce: ReturnType<typeof setTimeout>;
    kick.current = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        clearTimeout(timer);
        void tick();
      }, 150);
    };
    const tick = async () => {
      try {
        const r = await fetch("/api/admin/pulse", { cache: "no-store" });
        if (r.ok) {
          const p = (await r.json()) as Pulse;
          if (stop) return;
          setPulse(p);
          const first = seen.current === undefined;
          if (!first && p.latestNew && p.latestNew !== seen.current && (!seen.current || p.latestNew > seen.current)) {
            setAlert(true);
            if (soundRef.current) chime();
          }
          if (p.newOrders === 0) setAlert(false);
          seen.current = p.latestNew;
        }
      } catch {
        /* offline: try again later */
      }
      if (!stop) timer = setTimeout(tick, 30000);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
      clearTimeout(debounce);
      kick.current = () => {};
    };
  }, [enabled, router]);

  // "(2) …" in the browser tab while orders wait, so it is visible from other tabs.
  useEffect(() => {
    const n = pulse?.newOrders ?? 0;
    const clean = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = n > 0 ? `(${n}) ${clean}` : clean;
  }, [pulse?.newOrders, pathname]);

  const onOrders = pathname === "/admin/orders";
  return (
    <PulseCtx.Provider value={{ pulse, sound, setSound }}>
      {children}
      {alert && !onOrders && (pulse?.newOrders ?? 0) > 0 && (
        <div role="alert" className="no-print anim-toast fixed inset-x-3 top-3 z-[80] mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-brand p-3 pl-4 text-white shadow-[0_12px_40px_rgb(215_40_47/0.45)] lg:left-auto lg:right-6 lg:top-20 lg:mx-0">
          <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-white/20">
            <span className="absolute inset-0 animate-ping rounded-full bg-white/30" />
            <IconBell size={22} className="relative" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{L("Yangi buyurtma keldi!", "Новый заказ!")}</span>
            <span className="block text-sm text-white/80">{L(`${pulse?.newOrders} ta buyurtma qabul qilishni kutmoqda`, `${pulse?.newOrders} заказ(ов) ждут подтверждения`)}</span>
          </span>
          <Link href="/admin/orders" onClick={() => setAlert(false)} className="btn h-10 shrink-0 bg-white px-4 text-sm font-semibold text-brand hover:bg-white/90">
            {L("Ko'rish", "Открыть")} <IconArrowRight size={16} />
          </Link>
          <button type="button" onClick={() => setAlert(false)} className="grid size-8 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/15 hover:text-white" aria-label={L("Yopish", "Закрыть")}>
            <IconClose size={16} />
          </button>
        </div>
      )}
    </PulseCtx.Provider>
  );
}

/** Bell button that turns the new-order chime on/off (remembered on this device). */
export function SoundToggle({ className, compact }: { className?: string; compact?: boolean }) {
  const L = useL();
  const { sound, setSound } = usePulse();
  return (
    <button
      type="button"
      onClick={() => setSound(!sound)}
      aria-pressed={sound}
      title={sound ? L("Yangi buyurtmada ovoz chiqadi. O'chirish uchun bosing.", "При новом заказе звучит сигнал. Нажмите, чтобы выключить.") : L("Yangi buyurtma kelganda ovozli signal yoqish", "Включить звуковой сигнал о новых заказах")}
      className={clsx("btn h-10 shrink-0 px-3 text-sm", sound ? "bg-ok-50 text-ok hover:bg-ok-50/70" : "bg-field text-muted hover:text-ink", className)}
    >
      {sound ? <IconSound size={18} /> : <IconMute size={18} />}
      {!compact && <span>{sound ? L("Ovoz yoqiq", "Звук вкл.") : L("Ovoz o'chiq", "Звук выкл.")}</span>}
    </button>
  );
}

/** Small red counter used next to menu items. */
export function CountBadge({ n, className, inverted }: { n: number; className?: string; inverted?: boolean }) {
  if (!n) return null;
  return (
    <span key={n} className={clsx("anim-pop grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums", inverted ? "bg-white text-brand" : "bg-brand text-white", className)}>
      {n > 99 ? "99+" : n}
    </span>
  );
}
