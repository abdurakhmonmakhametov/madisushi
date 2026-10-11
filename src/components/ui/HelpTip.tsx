"use client";

// Small "?" button; clicking (or tapping) it shows a plain-language
// explanation. Works on phones, unlike a title tooltip.
import { Popover as RP } from "radix-ui";
import clsx from "clsx";
import { useLang } from "@/lib/i18n/client";

export function HelpTip({ text, className, size = 18 }: { text: string; className?: string; size?: number }) {
  const lang = useLang();
  return (
    <RP.Root>
      <RP.Trigger
        type="button"
        aria-label={lang === "ru" ? "Пояснение" : "Tushuntirish"}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
        className={clsx(
          "inline-grid shrink-0 place-items-center rounded-full bg-field font-bold leading-none text-muted transition-[background-color,color,transform] hover:scale-110 hover:bg-ink hover:text-white data-[state=open]:bg-ink data-[state=open]:text-white",
          className,
        )}
      >
        ?
      </RP.Trigger>
      <RP.Portal>
        <RP.Content side="top" align="center" sideOffset={8} collisionPadding={12} className="anim-dropdown z-[80] max-w-[300px] rounded-2xl bg-night px-4 py-3 text-[13px] font-normal leading-relaxed text-white shadow-[var(--shadow-pop)] outline-none">
          {text}
          <RP.Arrow className="fill-night" width={12} height={6} />
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  );
}
