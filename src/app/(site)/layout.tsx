import Link from "next/link";
import { LangProvider } from "@/lib/i18n/client";
import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/dict";
import { getSettings } from "@/lib/settings";
import { getCustomer } from "@/lib/auth/session";
import { asActor } from "@/lib/db";
import { Header, Logo, type HeaderProps } from "@/components/site/Header";
import { Toaster } from "@/components/ui/toast";
import { ActiveOrderBanner } from "@/components/orders/ActiveOrders";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [{ lang, t }, settings, customer] = await Promise.all([getT(), getSettings(), getCustomer()]);
  const saved: HeaderProps["savedAddresses"] = customer
    ? await asActor({ kind: "customer", id: customer.id }, (d) =>
        d.query("select id, label, address_text, lat, lng, house, apartment, floor, entrance, instructions from public.customer_addresses order by is_default desc, created_at desc limit 10"),
      )
    : [];
  const c = settings.contacts;
  return (
    <LangProvider lang={lang}>
      <Header
        platformName={settings.branding.platformName}
        logoUrl={settings.branding.logoUrl}
        customer={customer ? { name: customer.name, phone: customer.phone } : null}
        savedAddresses={saved}
      />
      <main id="main" className="min-h-[70vh]">
        <ActiveOrderBanner enabled={Boolean(customer)} />
        {children}
      </main>
      <footer className="no-print mt-14 bg-night pb-20 text-white md:pb-0">
        <div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-x-6 gap-y-8 px-5 py-10 md:grid-cols-4 md:px-6 lg:px-10">
          <div className="col-span-2 md:col-span-1">
            <Logo name={settings.branding.platformName} url={settings.branding.logoUrl} dark />
            <p className="mt-4 max-w-xs text-sm text-white/60">{tr(settings.branding.footerText, lang)}</p>
          </div>
          <ul className="space-y-3 text-[15px] text-white/75">
            <li><Link className="transition-colors hover:text-white" href="/branches">{t("nav.branches")}</Link></li>
            <li><Link className="transition-colors hover:text-white" href="/info/contacts">{t("nav.contacts")}</Link></li>
            <li><Link className="transition-colors hover:text-white" href="/info/about">{t("nav.about")}</Link></li>
            <li><Link className="transition-colors hover:text-white" href="/vacancies">{t("nav.vacancies")}</Link></li>
          </ul>
          <ul className="space-y-3 text-[15px] text-white/75">
            <li><Link className="transition-colors hover:text-white" href="/info/delivery-payment">{t("nav.deliveryPayment")}</Link></li>
            <li><Link className="transition-colors hover:text-white" href="/feedback">{t("nav.feedback")}</Link></li>
            <li><Link className="transition-colors hover:text-white" href="/info/offer">{t("nav.offer")}</Link></li>
            <li><Link className="transition-colors hover:text-white" href="/info/terms">{t("nav.terms")}</Link></li>
          </ul>
          <div className="col-span-2 md:col-span-1 md:text-right">
            <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="text-xl font-bold lg:text-2xl">{c.phone}</a>
            <p className="mt-3 text-white/70">{tr(c.hours, lang)}</p>
            <p className="mt-1 text-white/70">{tr(c.address, lang)}</p>
            <p className="mt-6 text-xs text-white/40">© {new Date().getFullYear()} {settings.branding.platformName}.</p>
          </div>
        </div>
      </footer>
      <Toaster className="bottom-[calc(140px+env(safe-area-inset-bottom))] md:bottom-24 xl:bottom-6" />
    </LangProvider>
  );
}
