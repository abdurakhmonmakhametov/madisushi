import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/dict";
import { db } from "@/lib/db";
import { getCustomer } from "@/lib/auth/session";
import { listBrands, loadBranches } from "@/lib/services/catalog";
import { ReserveForm } from "@/components/reserve/ReserveForm";

export const metadata = { title: "Reservation" };

export default async function ReservePage({ searchParams }: { searchParams: Promise<{ brand?: string; branch?: string }> }) {
  const [{ t, lang }, sp, brands, customer] = await Promise.all([getT(), searchParams, listBrands(), getCustomer()]);
  const branches = (await loadBranches(db, {})).filter((b) => b.reservations_enabled);
  const withBranches = brands.filter((b) => branches.some((br) => br.brand_id === b.id));
  const brand = withBranches.find((b) => b.slug === sp.brand) ?? withBranches[0];
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-[28px] font-bold">{t("reserve.title")}</h1>
      <ReserveForm
        brands={withBranches.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
        branches={branches.map((b) => ({ id: b.id, brandId: b.brand_id, name: tr(b.name, lang), address: tr(b.address, lang), maxParty: b.reservation_max_party }))}
        initialBrandId={brand?.id ?? null}
        initialBranchId={branches.find((b) => b.id === sp.branch)?.id ?? null}
        customer={customer ? { name: customer.name ?? "", phone: customer.phone } : null}
      />
    </div>
  );
}
