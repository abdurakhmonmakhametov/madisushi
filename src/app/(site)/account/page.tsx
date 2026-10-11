import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getCustomer } from "@/lib/auth/session";
import { asActor } from "@/lib/db";
import { ProfileForm, AddressList } from "@/components/account/AccountForms";

export const metadata = { title: "Profile" };

export default async function AccountPage() {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/account");
  const { t } = await getT();
  const addresses = await asActor({ kind: "customer", id: customer.id }, (d) =>
    d.query<{ id: string; label: string | null; address_text: string; house: string | null; apartment: string | null; is_default: boolean }>(
      "select id, label, address_text, house, apartment, is_default from public.customer_addresses order by is_default desc, created_at desc",
    ),
  );
  return (
    <div className="space-y-5">
      <section className="card p-6">
        <h1 className="mb-5 text-2xl font-bold">{t("account.profile")}</h1>
        <ProfileForm name={customer.name ?? ""} email={customer.email ?? ""} phone={customer.phone} />
      </section>
      <section className="card p-6">
        <h2 className="mb-4 text-xl font-semibold">{t("account.addresses")}</h2>
        <AddressList addresses={addresses} />
      </section>
    </div>
  );
}
