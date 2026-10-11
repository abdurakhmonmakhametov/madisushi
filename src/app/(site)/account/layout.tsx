import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getCustomer } from "@/lib/auth/session";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/account");
  const { t } = await getT();
  const links: [string, string][] = [
    ["/account", t("account.profile")],
    ["/orders", t("account.orders")],
    ["/account/loyalty", t("account.loyalty")],
    ["/account/reservations", t("account.reservations")],
  ];
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[220px_1fr]">
      <nav aria-label={t("nav.account")} className="no-scrollbar flex gap-2 overflow-x-auto md:flex-col">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="shrink-0 rounded-[14px] px-4 py-3 hover:bg-white">
            {label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
