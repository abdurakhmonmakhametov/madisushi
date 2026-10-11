"use client";

import Link from "next/link";
import { useRef } from "react";
import { Dialog as RD } from "radix-ui";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import { IconClose } from "@/components/ui/icons";
import { Logo } from "./Header";

const LINKS: [DictKey, string][] = [
  ["nav.branches", "/branches"],
  ["nav.contacts", "/info/contacts"],
  ["nav.gallery", "/gallery"],
  ["nav.about", "/info/about"],
  ["nav.vacancies", "/vacancies"],
  ["nav.deliveryPayment", "/info/delivery-payment"],
  ["nav.feedback", "/feedback"],
  ["nav.promotions", "/promotions"],
  ["nav.news", "/news"],
  ["nav.recipes", "/recipes"],
  ["nav.reserve", "/reserve"],
  ["nav.faq", "/faq"],
  ["nav.terms", "/info/terms"],
  ["nav.offer", "/info/offer"],
  ["nav.loyaltyOffer", "/info/loyalty-offer"],
  ["nav.legal", "/info/legal-info"],
  ["nav.returns", "/info/returns"],
];

/** Left navigation drawer: dimmed backdrop, Escape/outside-click close, focus trap, arrow-key navigation. */
export function NavDrawer({ open, onOpenChange, platformName, logoUrl }: { open: boolean; onOpenChange: (v: boolean) => void; platformName: string; logoUrl: string | null }) {
  const { t } = useT();
  const listRef = useRef<HTMLUListElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      links[Math.min(links.length - 1, i + 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      links[Math.max(0, i - 1)]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      links[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      links[links.length - 1]?.focus();
    }
  };

  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="anim-fade fixed inset-0 z-50 bg-black/45" />
        <RD.Content className="anim-drawer fixed inset-y-0 left-0 z-50 flex w-[min(580px,88vw)] flex-col bg-white outline-none">
          <RD.Title className="sr-only">{t("nav.menu")}</RD.Title>
          <RD.Description className="sr-only">{t("nav.menu")}</RD.Description>
          <div className="flex items-center gap-4 border-b border-line px-5 py-4 lg:px-8 lg:py-6">
            <RD.Close className="grid size-11 place-items-center rounded-full hover:bg-field" aria-label={t("nav.close")}>
              <IconClose size={24} />
            </RD.Close>
            <Logo name={platformName} url={logoUrl} />
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4" aria-label={t("nav.menu")} onKeyDown={onKeyDown}>
            <ul ref={listRef}>
              {LINKS.map(([key, href]) => (
                <li key={href}>
                  <Link href={href} onClick={() => onOpenChange(false)} className="block px-8 py-4 text-[22px] leading-tight text-ink transition-colors hover:bg-field focus-visible:bg-field lg:px-16 lg:py-[22px] lg:text-[26px]">
                    {t(key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
