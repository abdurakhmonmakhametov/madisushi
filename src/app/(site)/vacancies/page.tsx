import { getT } from "@/lib/i18n/server";
import { listContent } from "@/lib/services/content";
import { CardList, PageShell } from "@/components/content/Content";

export default async function VacanciesPage() {
  const [{ t, lang }, items] = await Promise.all([getT(), listContent("vacancy")]);
  return (
    <PageShell title={t("nav.vacancies")} wide>
      <CardList items={items} lang={lang} empty={t("search.none")} />
    </PageShell>
  );
}
