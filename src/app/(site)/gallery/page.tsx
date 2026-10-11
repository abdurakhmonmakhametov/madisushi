import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/dict";
import { listContent } from "@/lib/services/content";
import { PageShell } from "@/components/content/Content";

export default async function GalleryPage() {
  const [{ t, lang }, items] = await Promise.all([getT(), listContent("gallery")]);
  return (
    <PageShell title={t("nav.gallery")} wide>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {items.map((g) => (
          <li key={g.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.image_url ?? ""} alt={tr(g.title, lang)} loading="lazy" className="aspect-square w-full rounded-[var(--radius-card)] object-cover" />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
