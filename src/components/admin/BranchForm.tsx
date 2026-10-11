"use client";

import { saveBranchAction } from "@/app/admin/actions/restaurants";
import { ActionForm, Check, I18nInput, Input, Select, SubmitButton, useL } from "./ui";

type I = { uz: string; ru?: string };
export interface BranchValues {
  id: string;
  name: I;
  address: I;
  lat: number;
  lng: number;
  phone: string | null;
  is_active: boolean;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  prep_minutes: number;
  delivery_minutes: number;
  pickup_min_order: number;
  reservations_enabled: boolean;
  reservation_capacity: number;
  reservation_slot_minutes: number;
  reservation_duration_minutes: number;
  reservation_max_party: number;
}

export function BranchForm({ branch, brands }: { branch?: BranchValues; brands?: { id: string; name: string }[] }) {
  const L = useL();
  return (
    <ActionForm action={saveBranchAction} className="space-y-4">
      {branch ? (
        <input type="hidden" name="id" value={branch.id} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label={L("Restoran", "Ресторан")} name="brandId" options={(brands ?? []).map((b) => ({ value: b.id, label: b.name }))} />
          <Input label={L("Havola nomi (slug)", "Имя ссылки (slug)")} help={L("Sahifa manzilida ishlatiladigan lotincha nom. Faqat kichik harf, raqam va chiziqcha (-). Masalan: filadelfiya-roll", "Латинское имя для адреса страницы. Только строчные буквы, цифры и дефис (-). Например: filadelfiya-roll")} placeholder="masalan-nom" name="slug" required pattern="[a-z0-9-]{2,60}" />
        </div>
      )}
      <I18nInput label={L("Nomi", "Название")} name="name" value={branch?.name} required />
      <I18nInput label={L("Manzil", "Адрес")} name="address" value={branch?.address} required />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label={L("Kenglik (lat)", "Широта (lat)")} name="lat" type="number" step="0.000001" defaultValue={branch?.lat} required />
        <Input label={L("Uzunlik (lng)", "Долгота (lng)")} name="lng" type="number" step="0.000001" defaultValue={branch?.lng} required />
        <Input label={L("Telefon", "Телефон")} name="phone" defaultValue={branch?.phone ?? ""} />
        <Input label={L("Tayyorlash, daq", "Приготовление, мин")} name="prepMinutes" type="number" min={0} max={600} defaultValue={branch?.prep_minutes ?? 25} required />
        <Input label={L("Yetkazish, daq", "Доставка, мин")} name="deliveryMinutes" type="number" min={0} max={600} defaultValue={branch?.delivery_minutes ?? 35} required />
        <Input label={L("Olib ketish min. summasi", "Мин. сумма самовывоза")} name="pickupMinOrder" type="number" min={0} defaultValue={branch?.pickup_min_order ?? 0} />
      </div>
      <div className="flex flex-wrap gap-4">
        <Check label={L("Faol", "Активен")} name="isActive" defaultChecked={branch?.is_active ?? true} />
        <Check label={L("Yetkazib berish", "Доставка")} name="acceptsDelivery" defaultChecked={branch?.accepts_delivery ?? true} />
        <Check label={L("Olib ketish", "Самовывоз")} name="acceptsPickup" defaultChecked={branch?.accepts_pickup ?? true} />
        <Check label={L("Bron qabul qilish", "Принимать брони")} name="reservationsEnabled" defaultChecked={branch?.reservations_enabled ?? true} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Input label={L("Sig'im (o'rin)", "Вместимость (мест)")} name="capacity" type="number" min={0} defaultValue={branch?.reservation_capacity ?? 40} required />
        <Input label={L("Slot, daq", "Слот, мин")} name="slotMinutes" type="number" min={15} max={240} defaultValue={branch?.reservation_slot_minutes ?? 30} required />
        <Input label={L("Bron davomiyligi, daq", "Длительность брони, мин")} name="durationMinutes" type="number" min={30} max={480} defaultValue={branch?.reservation_duration_minutes ?? 120} required />
        <Input label={L("Maks. mehmonlar", "Макс. гостей")} name="maxParty" type="number" min={1} max={200} defaultValue={branch?.reservation_max_party ?? 12} required />
      </div>
      <SubmitButton>{branch ? L("Saqlash", "Сохранить") : L("Filial qo'shish", "Добавить филиал")}</SubmitButton>
    </ActionForm>
  );
}
