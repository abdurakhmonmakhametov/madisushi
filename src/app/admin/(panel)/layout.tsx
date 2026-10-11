import Link from "next/link";
import { requireStaff, permissionsOf } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { AdminMobileNav, AdminNav, AdminTopBar, QuickJump } from "@/components/admin/AdminNav";
import { PulseProvider } from "@/components/admin/pulse";
import { HelpButton } from "@/components/admin/guide";
import { Toaster } from "@/components/admin/ui";
import { IconArrowUpRight, IconLogout } from "@/components/ui/icons";
import { staffLogout } from "../actions/auth";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const [{ L }, settings] = await Promise.all([getL(), getSettings()]);
  const branches = staff.branchIds.length
    ? await db.query<{ label: string }>(
        "select (br.name->>'uz') as label from public.branches br join public.brands b on b.id = br.brand_id where br.id = any($1)",
        [staff.branchIds],
      )
    : [];
  const roleLabel = { super_admin: L("Bosh administrator", "Главный администратор"), branch_manager: L("Filial menejeri", "Менеджер филиала"), kitchen: L("Oshxona / operator", "Кухня / оператор") }[staff.role];
  const permissions = permissionsOf(staff.role);
  const brandMark = (
    <Link href="/admin" className="group flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {settings.branding.logoUrl && <img src={settings.branding.logoUrl} alt="" className="size-10 rounded-full bg-night transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-105" />}
      <span className="leading-tight">
        <span className="block text-[15px] font-bold">{settings.branding.platformName}</span>
        <span className="block text-[11px] text-muted">{L("Boshqaruv paneli", "Панель управления")}</span>
      </span>
    </Link>
  );

  return (
    <PulseProvider enabled={permissions.includes("orders")}>
    <div className="min-h-dvh bg-page lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="no-print hidden border-r border-line bg-white lg:sticky lg:top-0 lg:block lg:h-dvh">
        <div className="flex h-full flex-col">
          <div className="px-5 py-5">{brandMark}</div>
          <AdminNav permissions={permissions} />
          <div className="border-t border-line p-3">
            <div className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-field">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-600 text-sm font-bold text-white">{staff.name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-semibold">{staff.name}</p>
                <p className="truncate text-xs text-muted">{roleLabel}</p>
              </div>
              <form action={staffLogout}>
                <button className="grid size-9 place-items-center rounded-lg text-muted hover:bg-field hover:text-ink" title={L("Chiqish", "Выйти")} aria-label={L("Chiqish", "Выйти")}>
                  <IconLogout size={18} />
                </button>
              </form>
            </div>
            {branches.map((b) => (
              <p key={b.label} className="truncate px-2 text-xs text-muted">
                {b.label}
              </p>
            ))}
          </div>
        </div>
      </aside>

      {/* Phone top bar */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur-md lg:hidden">
        {brandMark}
        <div className="flex items-center gap-2">
          <QuickJump permissions={permissions} compact />
          <HelpButton compact className="!h-9 !px-2.5" />
          <Link href="/" target="_blank" className="flex h-9 items-center gap-1 rounded-xl bg-field px-3 text-xs font-medium transition-colors hover:bg-line">
            {L("Sayt", "Сайт")} <IconArrowUpRight size={14} />
          </Link>
        </div>
      </header>

      <div className="min-w-0">
        <AdminTopBar permissions={permissions} />
        <main className="mx-auto min-w-0 max-w-[1500px] px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-6">{children}</main>
      </div>
      <Toaster />
      <AdminMobileNav permissions={permissions} staffName={staff.name} roleLabel={roleLabel} logout={staffLogout} />
    </div>
    </PulseProvider>
  );
}
