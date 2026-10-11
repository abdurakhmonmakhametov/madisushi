import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { asActor } from "@/lib/db";
import { PageHeader, Panel, Pill } from "@/components/admin/server-ui";
import { ActionForm, Check, Input, Select, SubmitButton, Switch } from "@/components/admin/ui";
import { IconUser } from "@/components/ui/icons";
import { saveStaffAction } from "../../actions/system";

type StaffRow = { id: string; email: string; name: string; role: string; is_active: boolean; branch_ids: string[] };

export default async function StaffAdmin() {
  const me = await requireStaff("staff");
  const { L } = await getL();
  const { staff, branches } = await asActor({ kind: "staff", id: me.id }, async (d) => ({
    staff: await d.query<StaffRow>("select s.*, coalesce((select array_agg(branch_id) from public.staff_branches where staff_id = s.id), '{}') as branch_ids from public.staff s order by s.role, s.name"),
    branches: await d.query<{ id: string; label: string }>("select br.id, (br.name->>'uz') as label from public.branches br join public.brands b on b.id = br.brand_id order by b.sort, br.sort"),
  }));
  const roles = [
    { value: "super_admin", label: L("Super admin — hammasi", "Супер админ — всё") },
    { value: "branch_manager", label: L("Filial menejeri — o'z filiallari", "Менеджер филиала — свои филиалы") },
    { value: "kitchen", label: L("Oshxona/operator — buyurtmalar va stop-list", "Кухня/оператор — заказы и стоп-лист") },
  ];
  const form = (s?: StaffRow) => (
    <ActionForm action={saveStaffAction} className="space-y-3" resetOnSuccess={!s}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label={L("Ism", "Имя")} name="name" defaultValue={s?.name} required />
        <Input label="Email" name="email" type="email" defaultValue={s?.email} required />
        <Select label={L("Rol (nima qila oladi)", "Роль (что может)")} name="role" defaultValue={s?.role ?? "kitchen"} options={roles} help={L("Rol xodim panelda qaysi bo'limlarni ko'rishini belgilaydi.", "Роль определяет, какие разделы сотрудник видит в панели.")} />
        <Input label={s ? L("Yangi parol (ixtiyoriy)", "Новый пароль (необязательно)") : L("Parol (≥ 10 belgi)", "Пароль (≥ 10 символов)")} name="password" type="password" autoComplete="new-password" minLength={s ? undefined : 10} required={!s} />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{L("Qaysi filialda ishlaydi (bosh administrator uchun kerak emas)", "В каком филиале работает (не нужно для главного админа)")}</legend>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <Check key={b.id} name="branches" value={b.id} label={b.label} defaultChecked={s?.branch_ids.includes(b.id)} />
          ))}
        </div>
      </fieldset>
      <Switch label={L("Tizimga kira oladi", "Может входить в систему")} hint={L("O'chirilsa, xodim darhol paneldan chiqariladi", "Если выключить, сотрудник сразу потеряет доступ")} name="isActive" defaultChecked={s?.is_active ?? true} />
      <SubmitButton variant={s ? "soft" : "primary"}>{s ? L("Saqlash", "Сохранить") : L("Xodim qo'shish", "Добавить сотрудника")}</SubmitButton>
    </ActionForm>
  );
  return (
    <>
      <PageHeader
        icon={<IconUser size={24} />}
        title={L("Xodimlar va rollar", "Сотрудники и роли")}
        description={L("Kim panelga kira oladi va nimani qila oladi.", "Кто может входить в панель и что может делать.")}
        guide={{
          steps: [
            L("Yangi xodim uchun pastdagi formani to'ldiring: ism, email, parol va rol.", "Для нового сотрудника заполните форму внизу: имя, email, пароль и роль."),
            L("Xodimning email va parolini unga yozib bering — u shu bilan kiradi.", "Передайте сотруднику email и пароль — он войдёт с ними."),
            L("Xodim ishdan ketsa, uning qatorini bosing va «Tizimga kira oladi» ni o'chiring.", "Если сотрудник уволился, откройте его строку и выключите «Может входить»."),
          ],
          tip: L("Oshxona — buyurtmalar va stop-list. Filial menejeri — o'z filiali. Bosh administrator — hammasi.", "Кухня — заказы и стоп-лист. Менеджер — свой филиал. Главный админ — всё."),
        }}
      />
      <div className="space-y-3">
        {staff.map((s) => (
          <Panel key={s.id}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-600 font-bold text-white">{s.name.slice(0, 1)}</span>
                <b>{s.name}</b>
                <span className="text-sm text-muted">{s.email}</span>
                <Pill tone={s.role === "super_admin" ? "brand" : s.role === "branch_manager" ? "info" : "neutral"}>{roles.find((r) => r.value === s.role)?.label.split(" — ")[0]}</Pill>
                {!s.is_active && <Pill>{L("o'chirilgan", "отключён")}</Pill>}
                <span className="text-xs text-muted">{branches.filter((b) => s.branch_ids.includes(b.id)).map((b) => b.label).join(", ")}</span>
              </summary>
              <div className="mt-4 border-t border-line pt-4">{form(s)}</div>
            </details>
          </Panel>
        ))}
        <Panel title={L("Yangi xodim", "Новый сотрудник")}>{form()}</Panel>
      </div>
    </>
  );
}
