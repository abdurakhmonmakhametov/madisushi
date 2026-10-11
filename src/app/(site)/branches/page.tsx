import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/dict";
import { db } from "@/lib/db";
import { loadBranches } from "@/lib/services/catalog";
import { menuHref } from "@/lib/menu-href";
import { hoursForDate } from "@/lib/schedule";
import { minutesToHHMM, todayLocal } from "@/lib/time";
import { PageShell } from "@/components/content/Content";
import { IconClock, IconPhone, IconPin } from "@/components/ui/icons";

export default async function BranchesPage() {
  const [{ t, lang }, branches] = await Promise.all([getT(), loadBranches(db, { activeOnly: true })]);
  const today = todayLocal();
  return (
    <PageShell title={t("nav.branches")} wide>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((br) => {
          const h = hoursForDate(br.hours, br.closed_dates, today);
          return (
            <li key={br.id} className="card flex flex-col gap-2 p-5">
              <h2 className="text-lg font-semibold">{tr(br.name, lang)}</h2>
              <p className="flex gap-2 text-sm text-muted">
                <IconPin size={16} className="mt-0.5 shrink-0" />
                {tr(br.address, lang)}
              </p>
              <p className="flex gap-2 text-sm">
                <IconClock size={16} className="mt-0.5 shrink-0 text-muted" />
                {h ? `${minutesToHHMM(h.open_minute)} – ${minutesToHHMM(h.close_minute)}` : t("menu.closedToday")}
              </p>
              {br.phone && (
                <a href={`tel:${br.phone}`} className="flex gap-2 text-sm hover:text-brand">
                  <IconPhone size={16} className="mt-0.5 shrink-0 text-muted" />
                  {br.phone}
                </a>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                <Link href={menuHref({ branch: br.id })} className="btn-primary h-10 text-sm">
                  {t("home.openMenu")}
                </Link>
                {br.reservations_enabled && (
                  <Link href={`/reserve?branch=${br.id}`} className="btn-soft h-10 text-sm">
                    {t("home.reserveShort")}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
