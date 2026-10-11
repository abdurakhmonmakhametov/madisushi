import { getT } from "@/lib/i18n/server";
import { listContent } from "@/lib/services/content";
import { CardList, PageShell } from "@/components/content/Content";

export default async function ListPage() {
  const [{ t, lang }, items] = await Promise.all([getT(), listContent("recipe")]);
  return (
    <PageShell title={t("nav.recipes")} wide>
      <CardList items={items} lang={lang} hrefBase="/recipes" empty={t("search.none")} />
    </PageShell>
  );
}
