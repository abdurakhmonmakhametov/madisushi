import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/dict";
import { getContent } from "@/lib/services/content";
import { Article, PageShell } from "@/components/content/Content";

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const item = await getContent(["page", "legal"], (await params).slug);
  return { title: item?.title.uz ?? "404" };
}

export default async function InfoPage({ params }: P) {
  const item = await getContent(["page", "legal"], (await params).slug);
  if (!item) notFound();
  const { lang } = await getT();
  return (
    <PageShell title={tr(item.title, lang)}>
      <Article item={item} lang={lang} />
    </PageShell>
  );
}
