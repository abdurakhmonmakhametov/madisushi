"use client";

// Small corner notifications shared by the site and the admin panel.
// Call toast("text") from any client component; <Toaster /> renders them.
import { useEffect, useState } from "react";
import clsx from "clsx";
import { IconCheck, IconClose, IconInfo } from "./icons";

type Toast = { id: number; tone: "ok" | "error"; text: string; image?: string | null };
const TOAST_EVENT = "app-toast";

export function toast(text: string, tone: Toast["tone"] = "ok", image?: string | null) {
  window.dispatchEvent(new CustomEvent<Omit<Toast, "id">>(TOAST_EVENT, { detail: { text, tone, image } }));
}

export function Toaster({ className }: { className?: string }) {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const t = { ...(e as CustomEvent<Omit<Toast, "id">>).detail, id: ++n };
      setItems((xs) => [...xs.slice(-2), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 3200);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, []);
  return (
    <div aria-live="polite" className={clsx("no-print pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6", className)}>
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : undefined}
          className={clsx(
            "anim-toast pointer-events-auto relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-2xl py-3 pl-3 pr-3 text-[15px] font-medium shadow-[var(--shadow-pop)]",
            t.tone === "ok" ? "bg-night text-white" : "bg-brand text-white",
          )}
        >
          {t.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.image} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className={clsx("grid size-8 shrink-0 place-items-center rounded-full", t.tone === "ok" ? "bg-ok" : "bg-white/20")}>
              {t.tone === "ok" ? <IconCheck size={16} /> : <IconInfo size={16} />}
            </span>
          )}
          <span className="min-w-0 flex-1 leading-snug">{t.text}</span>
          <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} className="grid size-7 shrink-0 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close">
            <IconClose size={14} />
          </button>
          <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-white/30" style={{ animation: "shrink-x 3200ms linear forwards" }} />
        </div>
      ))}
    </div>
  );
}
