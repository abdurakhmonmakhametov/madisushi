import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getCustomer } from "@/lib/auth/session";
import { asActor } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { CheckoutForm, type SavedAddress } from "@/components/checkout/CheckoutForm";
import { IconChevronRight } from "@/components/ui/icons";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const [{ t }, customer, settings] = await Promise.all([getT(), getCustomer(), getSettings()]);
  const saved: SavedAddress[] = customer
    ? await asActor({ kind: "customer", id: customer.id }, (d) =>
        d.query<SavedAddress>("select id, label, address_text, lat, lng, house, apartment, floor, entrance, instructions from public.customer_addresses order by is_default desc, created_at desc"),
      )
    : [];
  return (
    <div className="mx-auto max-w-[1560px] px-4 pb-28 lg:px-[70px] xl:px-[130px]">
      <nav aria-label="breadcrumb" className="mt-6 flex items-center gap-3 text-[15px] lg:mt-9">
        <Link href="/" className="text-ink/80 hover:text-ink">
          {t("checkout.home")}
        </Link>
        <IconChevronRight size={14} className="text-muted" />
        <span className="text-brand" aria-current="page">
          {t("checkout.title")}
        </span>
      </nav>
      <h1 className="mt-5 text-[26px] font-bold lg:text-[32px]">{t("checkout.title")}</h1>
      <CheckoutForm
        customer={customer ? { name: customer.name, phone: customer.phone, loyaltyBalance: customer.loyalty_balance } : null}
        saved={saved}
        options={{
          leaveAtDoor: settings.checkout.leave_at_door_enabled,
          forOther: settings.checkout.order_for_other_enabled,
          deliveryNote: settings.checkout.delivery_info_note,
          loyaltyEnabled: settings.loyalty.enabled,
        }}
      />
    </div>
  );
}
