import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/dict";
import { getContent } from "@/lib/services/content";
import { Article, PageShell } from "@/components/content/Content";

export default async function ItemPage({ params }: { params: Promise<{ slug: string }> }) {
  const item = await getContent(["recipe"], (await params).slug);
  if (!item) notFound();
  const { lang } = await getT();
  return (
    <PageShell title={tr(item.title, lang)}>
      <Article item={item} lang={lang} />
    </PageShell>
  );
}
