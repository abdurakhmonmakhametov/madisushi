"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import { Field, Spinner } from "@/components/ui/primitives";
import { IconCheck, IconPhone } from "@/components/ui/icons";

export function OtpLogin({ next, onDone, compact }: { next?: string; onDone?: () => void; compact?: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [phone, setPhone] = useState("+998 ");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [channel, setChannel] = useState<"sms" | "telegram">("sms");
  // t.me link: set when the code goes through our Telegram bot
  const [bot, setBot] = useState<string | null>(null);
  const [needsTelegram, setNeedsTelegram] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const errText = (code: string) =>
    code === "invalid_phone" ? t("login.invalidPhone") : code === "sms_unavailable" ? t("common.error") : t(`err.${code}` as DictKey) ?? t("common.error");

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/otp/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone }) });
      const data = await r.json();
      if (data.bot) setBot(data.bot);
      if (r.status === 409 && data.error === "telegram_not_linked") return setNeedsTelegram(true);
      if (!r.ok) return setErr(errText(data.error));
      setNeedsTelegram(false);
      setSentTo(data.phone);
      setChannel(data.channel === "telegram" ? "telegram" : "sms");
      setDevCode(data.devCode ?? null);
    } catch {
      setErr(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/otp/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: sentTo, code }) });
      const data = await r.json();
      if (!r.ok) return setErr(errText(data.error));
      if (onDone) onDone();
      if (next) router.push(next);
      router.refresh();
    } catch {
      setErr(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const steps = (
    <ol className="mb-5 flex items-center gap-2 text-[13px] font-medium" aria-hidden>
      {[t("login.phone"), t("login.code")].map((label, i) => {
        const doneStep = i === 0 && sentTo;
        const current = (i === 0 && !sentTo) || (i === 1 && sentTo);
        return (
          <li key={i} className="flex min-w-0 items-center gap-2">
            {i > 0 && <span className={clsx("h-0.5 w-6 rounded-full transition-colors duration-300", sentTo ? "bg-ok" : "bg-line")} />}
            <span className={clsx("grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors duration-300", doneStep ? "bg-ok text-white" : current ? "bg-brand text-white" : "bg-field text-muted")}>
              {doneStep ? <IconCheck size={14} /> : i + 1}
            </span>
            <span className={clsx("truncate", current ? "text-ink" : "text-muted")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );

  if (!sentTo) {
    return (
      <div className="anim-rise">
        {!compact && steps}
        <p className="mb-4 flex items-start gap-2.5 text-[14px] leading-relaxed text-ink/75">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand">
            <IconPhone size={15} />
          </span>
          {t("login.step1")}
        </p>
        <form onSubmit={send} className={compact ? "flex flex-col gap-3 sm:flex-row" : "space-y-4"}>
          <Field label={t("login.phone")} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="flex-1" error={err} required />
          <button type="submit" className="btn-primary h-[66px] w-full px-8 text-[16px] sm:w-auto" disabled={busy}>
            {busy && <Spinner />} {t("login.sendCode")}
          </button>
        </form>
        {needsTelegram && <TelegramLinkSteps bot={bot} />}
        {!compact && <p className="mt-4 text-center text-xs text-muted">{t("login.privacy")}</p>}
      </div>
    );
  }
  const botName = bot ? bot.replace(/^https:\/\/t\.me\//, "").replace(/\?.*$/, "") : "";
  return (
    <form onSubmit={verify} className="anim-rise space-y-4">
      {!compact && steps}
      <p className="text-sm text-muted">{t(channel === "telegram" ? "login.codeSentTg" : "login.codeSent", { phone: sentTo })}</p>
      <p className="text-[14px] text-ink/75">{channel === "telegram" ? t("login.step2Tg", { bot: botName }) : t("login.step2")}</p>
      {channel === "telegram" && bot && (
        <a href={bot} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-brand hover:underline">
          {t("login.tgOpen")} ↗
        </a>
      )}
      {devCode && (
        <p className="rounded-[14px] bg-warn-50 p-3 text-sm text-warn" role="status">
          {t("login.devCode", { code: devCode })}
        </p>
      )}
      <div className={compact ? "flex flex-col gap-3 sm:flex-row sm:items-start" : "space-y-4"}>
        <CodeBoxes value={code} onChange={setCode} label={t("login.code")} error={err} />
        <button type="submit" className="btn-primary h-[66px] w-full px-8 text-[16px] sm:w-auto" disabled={busy || code.length !== 6}>
          {busy && <Spinner />} {t("login.verify")}
        </button>
      </div>
      <div className="flex gap-4 text-sm">
        <button type="button" className="text-brand hover:underline" onClick={() => send()} disabled={busy}>
          {t("login.resend")}
        </button>
        <button
          type="button"
          className="text-muted hover:underline"
          onClick={() => {
            setSentTo(null);
            setCode("");
            setErr(null);
          }}
        >
          {t("login.changePhone")}
        </button>
      </div>
    </form>
  );
}

/** Shown when the phone isn't linked to the bot yet: one-time "share your number" steps. */
function TelegramLinkSteps({ bot }: { bot: string | null }) {
  const { t } = useT();
  return (
    <div className="anim-rise mt-4 rounded-[14px] bg-brand-50 p-4 text-[14px] text-ink/80" role="status">
      <p className="mb-2 font-medium text-ink">{t("login.tgNeeded")}</p>
      <ol className="mb-3 list-decimal space-y-1 pl-5">
        <li>{t("login.tgStep1")}</li>
        <li>{t("login.tgStep2")}</li>
        <li>{t("login.tgStep3")}</li>
      </ol>
      {bot && (
        <a href={bot} target="_blank" rel="noreferrer" className="btn-primary inline-flex h-11 items-center px-5 text-[15px]">
          {t("login.tgOpen")}
        </a>
      )}
    </div>
  );
}

/**
 * Six boxes for the login code. A single real input sits on top (invisible), so
 * typing, pasting and SMS autofill all work as with a normal field.
 */
function CodeBoxes({ value, onChange, label, error }: { value: string; onChange: (v: string) => void; label: string; error: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="flex-1">
      <div className="relative">
        <input
          aria-label={label}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus
          required
          aria-invalid={!!error}
          className="absolute inset-0 z-[1] h-full w-full cursor-text opacity-0"
        />
        <div className="grid grid-cols-6 gap-2" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => {
            const ch = value[i];
            const active = focused && (i === value.length || (i === 5 && value.length === 6));
            return (
              <span
                key={i}
                className={clsx(
                  "grid h-[66px] place-items-center rounded-[14px] text-2xl font-bold tabular-nums transition-[background-color,box-shadow] duration-150",
                  error ? "bg-brand-50 ring-2 ring-brand/50" : active ? "bg-white ring-2 ring-brand" : ch ? "bg-white ring-1 ring-line" : "bg-field",
                )}
              >
                {ch ? <span key={ch + i} className="anim-pop">{ch}</span> : active ? <span className="h-7 w-0.5 animate-pulse bg-brand" /> : ""}
              </span>
            );
          })}
        </div>
      </div>
      {error && <p className="mt-2 px-1 text-sm text-brand">{error}</p>}
    </div>
  );
}
