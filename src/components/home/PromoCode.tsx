"use client";

import { useEffect, useState } from "react";
import { IconCheck } from "@/components/ui/icons";

/** Dashed promo-code chip on a home promotion card; tapping copies the code. */
export function PromoCode({ code, labels }: { code: string; labels: { copy: string; copied: string } }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(code).then(() => setCopied(true), () => {})}
      aria-label={`${labels.copy}: ${code}`}
      className="relative z-10 inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-dashed border-brand/60 bg-white/80 px-2.5 text-[12px] font-bold tracking-wide text-brand backdrop-blur transition-colors hover:bg-white md:h-9 md:px-3 md:text-[13px]"
    >
      {code}
      {copied ? (
        <IconCheck size={15} />
      ) : (
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
          <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
        </svg>
      )}
      <span aria-live="polite" className="sr-only">{copied ? labels.copied : ""}</span>
    </button>
  );
}
