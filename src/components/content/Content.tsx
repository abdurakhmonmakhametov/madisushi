import Link from "next/link";
import { tr, type Lang } from "@/lib/i18n/dict";
import type { ContentItem } from "@/lib/services/content";
import { formatDateTime } from "@/lib/time";

/** Plain-text body with paragraphs; content is never rendered as HTML. */
export function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-4 text-[16px] leading-relaxed text-ink/85">
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

export function PageShell({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto px-4 py-8 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
      <h1 className="text-[28px] font-bold lg:text-[34px]">{title}</h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function Article({ item, lang }: { item: ContentItem; lang: Lang }) {
  return (
    <article className="card overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {item.image_url && <img src={item.image_url} alt="" className="aspect-[2/1] w-full object-cover" />}
      <div className="p-6 sm:p-8">
        {item.published_at && item.kind === "news" && <p className="mb-3 text-sm text-muted">{formatDateTime(item.published_at, lang)}</p>}
        <Paragraphs text={tr(item.body, lang)} />
      </div>
    </article>
  );
}

export function CardList({ items, lang, hrefBase, empty }: { items: ContentItem[]; lang: Lang; hrefBase?: string; empty: string }) {
  if (items.length === 0) return <p className="card p-8 text-center text-muted">{empty}</p>;
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => {
        const inner = (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {it.image_url && <img src={it.image_url} alt="" className="aspect-[4/3] w-full object-cover" />}
            <div className="p-5">
              <h2 className="text-lg font-semibold">{tr(it.title, lang)}</h2>
              {tr(it.excerpt, lang) && <p className="mt-1 text-sm text-muted">{tr(it.excerpt, lang)}</p>}
              {!hrefBase && tr(it.body, lang) && (
                <div className="mt-3 text-sm">
                  <Paragraphs text={tr(it.body, lang)} />
                </div>
              )}
            </div>
          </>
        );
        return (
          <li key={it.id} className="card overflow-hidden">
            {hrefBase ? (
              <Link href={`${hrefBase}/${it.slug}`} className="block h-full transition-opacity hover:opacity-90">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
