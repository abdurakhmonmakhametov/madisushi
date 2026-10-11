import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/admin/guard";
import { tr } from "@/lib/i18n/dict";
import { getStaffOrder } from "@/lib/services/orders";
import { formatDateTime, formatTime } from "@/lib/time";
import { PrintButton } from "@/components/admin/PrintButton";

// Printable kitchen ticket (80mm thermal-friendly). No prices except total.
export default async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("orders");
  const detail = await getStaffOrder(staff, (await params).id);
  if (!detail) notFound();
  const { order: o, items } = detail;
  const dishes = items.filter((i) => i.kind !== "packaging");
  return (
    <div className="mx-auto w-[80mm] bg-white p-3 font-mono text-[13px] leading-snug text-black">
      <div className="no-print mb-3">
        <PrintButton />
      </div>
      <p className="text-center text-lg font-bold">№{o.number}</p>
      <p className="text-center">
        {o.brand_name} · {tr(o.branch_name, "uz")}
      </p>
      <p className="text-center">{formatDateTime(o.created_at, "uz")}</p>
      <p className="mt-1 text-center font-bold">
        {o.fulfillment === "delivery" ? "YETKAZISH" : "OLIB KETISH"} · {o.asap ? "TEZKOR" : `VAQTGA ${formatTime(o.promised_at)}`}
      </p>
      <hr className="my-2 border-dashed border-black" />
      <ul className="space-y-1.5">
        {dishes.map((it) => (
          <li key={it.id}>
            <b>
              {it.quantity} × {tr(it.name_snapshot, "uz")}
            </b>
            {it.options_snapshot.map((x, i) => (
              <div key={i} className="pl-4">
                + {tr(x.name, "uz")}
              </div>
            ))}
          </li>
        ))}
      </ul>
      {o.comment && (
        <>
          <hr className="my-2 border-dashed border-black" />
          <p>IZOH: {o.comment}</p>
        </>
      )}
      <hr className="my-2 border-dashed border-black" />
      <p>
        {o.customer_name} {o.customer_phone}
      </p>
      {o.address && (
        <p>
          {o.address.text}
          {o.address.house ? `, uy ${o.address.house}` : ""}
          {o.address.apartment ? `, xon. ${o.address.apartment}` : ""}
        </p>
      )}
      <p className="mt-1">
        To'lov: {o.payment_method} ({o.payment_status}) · Jami: {o.total.toLocaleString("ru-RU")} UZS
      </p>
    </div>
  );
}
