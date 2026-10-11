import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/dict";
import { db } from "@/lib/db";
import { getCustomer } from "@/lib/auth/session";
import { loadBranches } from "@/lib/services/catalog";
import { PageShell } from "@/components/content/Content";
import { FeedbackForm } from "@/components/content/FeedbackForm";

export default async function FeedbackPage() {
  const [{ t, lang }, customer, branches] = await Promise.all([getT(), getCustomer(), loadBranches(db, {})]);
  return (
    <PageShell title={t("feedback.title")}>
      <FeedbackForm
        customer={customer ? { name: customer.name ?? "", phone: customer.phone } : null}
        branches={branches.map((b) => ({ id: b.id, label: tr(b.name, lang) }))}
      />
    </PageShell>
  );
}
