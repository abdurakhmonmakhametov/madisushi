import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/dict";
import { listContent } from "@/lib/services/content";
import { PageShell } from "@/components/content/Content";

export default async function FaqPage() {
  const [{ t, lang }, items] = await Promise.all([getT(), listContent("faq")]);
  return (
    <PageShell title={t("nav.faq")}>
      <div className="space-y-3">
        {items.map((f) => (
          <details key={f.id} className="card p-5">
            <summary className="cursor-pointer text-lg font-semibold">{tr(f.title, lang)}</summary>
            <p className="mt-3 text-ink/80">{tr(f.body, lang)}</p>
          </details>
        ))}
      </div>
    </PageShell>
  );
}
