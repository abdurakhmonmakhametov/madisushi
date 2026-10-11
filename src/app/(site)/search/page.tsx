import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/dict";
import { search } from "@/lib/services/catalog";
import { formatUZS } from "@/lib/money";
import { PageShell } from "@/components/content/Content";
import { menuHref } from "@/lib/menu-href";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const [{ t, lang }, res] = await Promise.all([getT(), search(q)]);
  return (
    <PageShell title={q ? `${t("search.title")}: \u201c${q}\u201d` : t("search.title")} wide>
      <form role="search" className="mb-8 flex gap-3" action="/search">
        <label className="flex-1">
          <span className="sr-only">{t("nav.search")}</span>
          <input name="q" defaultValue={q} className="field h-14" placeholder={t("nav.searchFood")} autoFocus={!q} />
        </label>
        <button className="btn-primary h-14" type="submit">
          {t("nav.search")}
        </button>
      </form>
      {q.length < 2 ? (
        <p className="text-muted">{t("search.min")}</p>
      ) : res.products.length === 0 ? (
        <p className="card p-8 text-center text-muted">{t("search.none")}</p>
      ) : (
        <div className="space-y-10">
          {res.products.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-semibold">{t("search.dishes")}</h2>
              <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                {res.products.map((p) => (
                  <li key={p.id}>
                    <Link href={menuHref({ p: p.slug })} className="card block h-full p-3 hover:shadow-[var(--shadow-pop)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image_url ?? ""} alt="" loading="lazy" className="aspect-square w-full rounded-[var(--radius-tile)] object-cover" />
                      <p className="mt-2 line-clamp-2 text-[15px] font-medium">{tr(p.name, lang)}</p>
                      <p className="mt-1 font-bold tabular-nums">{formatUZS(p.price)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}
