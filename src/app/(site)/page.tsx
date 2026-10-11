import Link from "next/link";
import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { tr, type Lang } from "@/lib/i18n/dict";
import { getSettings } from "@/lib/settings";
import { getMainBrand, listPromotions } from "@/lib/services/catalog";
import { loadRestaurantView, type MenuSearch } from "@/lib/services/restaurant-view";
import { listContent, type ContentItem } from "@/lib/services/content";
import { MenuView } from "@/components/menu/MenuView";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { PromoCode } from "@/components/home/PromoCode";
import { IconArrowRight, IconChevronRight } from "@/components/ui/icons";
import { LiveRefresh } from "@/components/live/LiveRefresh";

export default async function HomePage({ searchParams }: { searchParams: Promise<MenuSearch> }) {
  const [{ lang, t }, settings, brand, sp] = await Promise.all([getT(), getSettings(), getMainBrand(), searchParams]);
  if (!brand) notFound();
  const [view, promotions, banners] = await Promise.all([
    loadRestaurantView(brand, sp, lang),
    settings.home.show_promotions ? listPromotions() : Promise.resolve([]),
    listContent("banner"),
  ]);
  if (!view) notFound();
  // A banner is only its picture, so one without an image has nothing to show.
  const slides = banners.filter((b) => b.image_url);

  return (
    <>
      {/* stop-list, prices, banners and promotions update without a reload */}
      <LiveRefresh scope="customer" kinds={["catalog"]} />
      <div className="mx-auto max-w-[1600px] px-4 md:px-6 lg:px-10">
        {/* Page heading for screen readers; the banners are pictures only. */}
        <h1 className="sr-only">{brand.name}</h1>
        {slides.length > 0 && (
          <section className="mt-4 overflow-hidden rounded-[28px] bg-night md:mt-8">
            <HeroCarousel labels={{ region: t("home.banners"), slide: t("home.bannerSlide") }}>
              {slides.map((b, i) => (
                <BannerSlide key={b.id} banner={b} lang={lang} eager={i === 0} />
              ))}
            </HeroCarousel>
          </section>
        )}

        {promotions.length > 0 && (
          <section className="mt-8" aria-labelledby="promos">
            <div className="flex items-end justify-between gap-3">
              <h2 id="promos" className="text-[21px] font-bold md:text-[26px]">
                {t("home.promotions")}
              </h2>
              <Link href="/promotions" className="flex items-center gap-0.5 text-sm font-semibold text-brand hover:underline">
                {t("home.seeAll")} <IconChevronRight size={16} />
              </Link>
            </div>
            <div className="no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
              {promotions.map((p) => {
                const title = tr(p.title, lang);
                return (
                  <div key={p.id} className="group relative flex h-[160px] w-[86vw] max-w-[420px] shrink-0 snap-start overflow-hidden rounded-2xl md:h-[168px] md:w-[calc((100%-24px)/3)] md:max-w-none bg-field">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.image_url && <img src={p.image_url} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />}
                    {/* Light scrim so the dark text stays readable on any photo. */}
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-white/85 via-white/45 to-transparent" />
                    <div className="relative flex w-[58%] min-w-0 flex-col p-3.5 md:p-4">
                      <h3 className="line-clamp-2 text-[16px] font-extrabold leading-tight md:text-[18px]">{title}</h3>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink/60 md:text-[13px]">{tr(p.body, lang)}</p>
                      <div className="mt-auto pt-2">
                        {p.promo_code ? (
                          <PromoCode code={p.promo_code} labels={{ copy: t("home.copyCode"), copied: t("home.copied") }} />
                        ) : (
                          <span aria-hidden className="grid size-8 place-items-center rounded-full bg-white shadow-sm transition-colors group-hover:bg-brand group-hover:text-white md:size-9">
                            <IconArrowRight size={16} />
                          </span>
                        )}
                      </div>
                    </div>
                    {/* The whole card opens the promotions page; the code chip sits above this link. */}
                    <Link href="/promotions" aria-label={title} className="absolute inset-0" />
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <div id="menu" className="scroll-mt-[60px] md:scroll-mt-20">
        <MenuView {...view} embedded />
      </div>
    </>
  );
}

/** One admin banner (content_items kind = 'banner'): just the picture, the whole slide links to link_url. */
function BannerSlide({ banner: b, lang, eager }: { banner: ContentItem; lang: Lang; eager: boolean }) {
  // The picture carries its own text, so the title only serves as alt text.
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.image_url!} alt={tr(b.title, lang)} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} className="block aspect-[3/1] w-full object-cover" draggable={false} />
  );
  const url = b.link_url;
  if (!url) return img;
  if (url.startsWith("/")) return <Link href={url} className="block">{img}</Link>;
  return (
    <a href={url} className="block" {...(url.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {img}
    </a>
  );
}
