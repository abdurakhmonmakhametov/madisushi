import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { asActor } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { PageHeader, Panel, Pill, Table } from "@/components/admin/server-ui";
import { ActionForm, SubmitButton } from "@/components/admin/ui";
import { feedbackStatusAction } from "../../actions/ops";
import { IconMessage, IconStar } from "@/components/ui/icons";
import { LiveRefresh } from "@/components/live/LiveRefresh";

export default async function FeedbackAdmin() {
  const staff = await requireStaff("feedback");
  const { L, lang } = await getL();
  const rows = await asActor({ kind: "staff", id: staff.id }, (d) =>
    d.query<{ id: string; name: string; phone: string | null; rating: number | null; message: string; status: string; created_at: string; branch: string | null }>(
      `select f.*, (br.name->>'uz') as branch
         from public.feedback f left join public.branches br on br.id = f.branch_id left join public.brands b on b.id = br.brand_id
        order by f.created_at desc limit 200`,
    ),
  );
  return (
    <>
      <LiveRefresh scope="staff" kinds={["feedback"]} />
      <PageHeader
        icon={<IconMessage size={24} />}
        title={L("Mijozlar fikrlari", "Отзывы клиентов")}
        description={L("Mijozlar saytdagi «Fikr bildirish» sahifasidan yuborgan xabarlar.", "Сообщения, отправленные гостями через форму «Отзыв» на сайте.")}
        guide={{
          steps: [
            L("Yangi fikrlar ko'k «new» belgisi bilan ko'rinadi.", "Новые отзывы отмечены синей меткой «new»."),
            L("Xabarni o'qib chiqqach, «O'qildi» tugmasini bosing — shunda boshqalar ham bilib turadi.", "Прочитав, нажмите «Прочитано» — коллеги будут знать."),
            L("Shikoyat bo'lsa, mijozga telefon orqali qo'ng'iroq qiling.", "Если это жалоба — позвоните гостю."),
          ],
        }}
      />
      <Panel>
        <Table head={[L("Sana", "Дата"), L("Mijoz", "Клиент"), L("Filial", "Филиал"), L("Baho", "Оценка"), L("Xabar", "Сообщение"), L("Holat", "Статус")]} empty={rows.length === 0 && L("Fikrlar yo'q", "Отзывов нет")}>
          {rows.map((f) => (
            <tr key={f.id} className={f.status === "new" ? "bg-info-50/40 align-top" : "align-top"}>
              <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(f.created_at, lang)}</td>
              <td className="px-3 py-2">
                {f.name}
                <div className="text-xs text-muted">{f.phone}</div>
              </td>
              <td className="px-3 py-2 text-xs">{f.branch ?? "—"}</td>
              <td className="px-3 py-2">{f.rating ? <span className="flex text-warn" aria-label={`${f.rating}/5`}>{Array.from({ length: f.rating }, (_, i) => <IconStar key={i} size={16} fill="currentColor" />)}</span> : "—"}</td>
              <td className="max-w-md px-3 py-2 whitespace-pre-line">{f.message}</td>
              <td className="px-3 py-2">
                <Pill tone={f.status === "new" ? "info" : "neutral"}>{f.status === "new" ? L("Yangi", "Новый") : L("O'qilgan", "Прочитан")}</Pill>
                {f.status === "new" && (
                  <ActionForm action={feedbackStatusAction} className="mt-1">
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="status" value="read" />
                    <SubmitButton variant="soft" className="!h-8 text-xs">
                      {L("O'qildi", "Прочитано")}
                    </SubmitButton>
                  </ActionForm>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
