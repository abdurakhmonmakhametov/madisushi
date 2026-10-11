"use client";

import { useActionState } from "react";
import { telegramLinkAction, telegramUnlinkAction, type TelegramLinkState } from "@/app/admin/actions/telegram";
import { SubmitButton, useL } from "./ui";

export function TelegramLink({ linked }: { linked: boolean }) {
  const L = useL();
  const [state, action] = useActionState<TelegramLinkState>(telegramLinkAction, null);
  return (
    <div className="space-y-3">
      {state?.url ? (
        <div className="space-y-2">
          <a href={state.url} target="_blank" rel="noreferrer" className="btn-primary inline-flex h-11 items-center">
            {L("Telegramda ochish va «Start» bosish", "Открыть в Telegram и нажать «Start»")}
          </a>
          <p className="text-xs text-muted">{L("Havola 15 daqiqa amal qiladi va bir marta ishlaydi. Telefonda bo'lsangiz, shu tugmani bosing.", "Ссылка действует 15 минут и работает один раз. На телефоне просто нажмите кнопку.")}</p>
        </div>
      ) : (
        <form action={action}>
          <SubmitButton>{linked ? L("Boshqa chatni ulash", "Подключить другой чат") : L("Telegramni ulash", "Подключить Telegram")}</SubmitButton>
        </form>
      )}
      {state?.error && <p className="text-sm text-brand">{state.error}</p>}
      {linked && (
        <form action={async () => void (await telegramUnlinkAction())}>
          <SubmitButton variant="soft">{L("Uzish", "Отключить")}</SubmitButton>
        </form>
      )}
    </div>
  );
}
