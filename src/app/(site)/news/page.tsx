import { getT } from "@/lib/i18n/server";
import { listContent } from "@/lib/services/content";
import { CardList, PageShell } from "@/components/content/Content";

export default async function ListPage() {
  const [{ t, lang }, items] = await Promise.all([getT(), listContent("news")]);
  return (
    <PageShell title={t("nav.news")} wide>
      <CardList items={items} lang={lang} hrefBase="/news" empty={t("search.none")} />
    </PageShell>
  );
}
