import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth/session";
import { getL } from "@/lib/admin/l";
import { getSettings } from "@/lib/settings";
import { ActionForm, Input, PasswordInput, SubmitButton, Toaster } from "@/components/admin/ui";
import { LangSwitch } from "@/components/admin/AdminNav";
import { staffLogin } from "../actions/auth";

export default async function AdminLogin() {
  if (await getStaff()) redirect("/admin");
  const [{ L }, settings] = await Promise.all([getL(), getSettings()]);
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-night px-4 py-10">
      {/* soft animated glow behind the card */}
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 size-[520px] rounded-full bg-brand/25 blur-[120px] [animation:float_12s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-40 size-[520px] rounded-full bg-brand/15 blur-[120px] [animation:float_14s_ease-in-out_infinite_reverse]" />

      <div className="absolute right-4 top-4 [&>div]:bg-white/10 [&_button[aria-checked=false]]:text-white/70">
        <LangSwitch />
      </div>

      <div className="anim-rise relative w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {settings.branding.logoUrl && <img src={settings.branding.logoUrl} alt="" className="size-20 rounded-full bg-night shadow-[0_0_0_6px_rgb(255_255_255/0.06),0_12px_40px_rgb(215_40_47/0.35)]" />}
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{settings.branding.platformName}</h1>
          <p className="mt-1 text-sm text-white/60">{L("Xodimlar uchun boshqaruv paneli", "Панель управления для сотрудников")}</p>
        </div>

        <div className="rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgb(0_0_0/0.45)] sm:p-8">
          <p className="mb-5 text-[15px] font-semibold">{L("Hisobingizga kiring", "Войдите в аккаунт")}</p>
          <ActionForm action={staffLogin} className="space-y-4">
            <Input label={L("Email (elektron pochta)", "Email (электронная почта)")} name="email" type="email" autoComplete="username" required placeholder="ism@sushi.local" hint={L("Administrator bergan pochta manzili", "Адрес, который выдал администратор")} />
            <PasswordInput label={L("Parol", "Пароль")} name="password" autoComplete="current-password" required hint={L("Ko'z belgisini bossangiz, yozgan parolingizni ko'rasiz", "Нажмите на глаз, чтобы увидеть введённый пароль")} />
            <SubmitButton className="!h-12 w-full text-[16px]">{L("Kirish", "Войти")}</SubmitButton>
          </ActionForm>
          <p className="mt-5 rounded-2xl bg-field p-3 text-center text-xs leading-relaxed text-muted">
            {L("Parolni unutdingizmi yoki kira olmayapsizmi? Menejeringiz yoki bosh administratorga murojaat qiling.", "Забыли пароль или не получается войти? Обратитесь к менеджеру или главному администратору.")}
          </p>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
