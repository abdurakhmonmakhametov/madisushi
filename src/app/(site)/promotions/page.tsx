import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/dict";
import { listPromotions } from "@/lib/services/catalog";
import { PageShell } from "@/components/content/Content";

export default async function PromotionsPage() {
  const [{ t, lang }, promos] = await Promise.all([getT(), listPromotions()]);
  return (
    <PageShell title={t("nav.promotions")} wide>
      {promos.length === 0 ? (
        <p className="card p-8 text-center text-muted">{t("search.none")}</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {promos.map((p) => (
            <li key={p.id} className="card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.image_url && <img src={p.image_url} alt="" className="aspect-[2/1] w-full object-cover" />}
              <div className="p-5">
                <h2 className="text-lg font-semibold">{tr(p.title, lang)}</h2>
                <p className="mt-1 text-sm text-muted">{tr(p.body, lang)}</p>
                {p.promo_code && <p className="mt-3 inline-block rounded-lg bg-brand-50 px-3 py-1 font-mono font-semibold text-brand">{p.promo_code}</p>}
                {p.brand_slug && (
                  <div className="mt-4">
                    <Link href="/#menu" className="btn-soft h-11">
                      {t("common.readMore")}
                    </Link>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
