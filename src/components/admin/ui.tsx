"use client";

// Admin UI kit: action forms with pending/error state, toasts, confirm dialogs,
// custom dropdowns, bilingual inputs, file pickers, pagination and filter bars.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import { useLang } from "@/lib/i18n/client";
import { Modal, Spinner } from "@/components/ui/primitives";
import { IconArrowLeft, IconArrowRight, IconClose, IconInfo, IconSearch } from "@/components/ui/icons";
import { HelpTip } from "@/components/ui/HelpTip";
import { toast } from "@/components/ui/toast";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { LiveRefresh } from "@/components/live/LiveRefresh";

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;

export function useL() {
  const lang = useLang();
  return (uz: string, ru: string) => (lang === "ru" ? ru : uz);
}

export { toast, Toaster } from "@/components/ui/toast";
export { Dropdown } from "@/components/ui/Dropdown";

/* ------------------------------------------------------------------- forms */

const VARIANTS = {
  primary: "btn-primary",
  soft: "btn-soft",
  danger: "btn bg-brand-50 text-brand hover:bg-[#ffe1e1]",
} as const;

export function SubmitButton({ children, className, variant = "primary", disabled }: { children: React.ReactNode; className?: string; variant?: keyof typeof VARIANTS; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={clsx(VARIANTS[variant], "h-11", className)} disabled={pending || disabled} aria-busy={pending}>
      {pending && <Spinner />} {children}
    </button>
  );
}

/** A <form> bound to a server action returning ActionState; shows errors inline and a toast on success. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const L = useL();
  const [state, formAction] = useActionState(action, null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? L("Saqlandi", "Сохранено"));
      if (resetOnSuccess) setKey((k) => k + 1);
      onSuccess?.();
    } else if (state?.error) {
      toast(state.error, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form key={key} action={formAction} className={className}>
      {children}
      {state?.error && (
        <p className="anim-pop mt-3 flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand" role="alert">
          <IconInfo size={18} className="mt-px shrink-0" /> {state.error}
        </p>
      )}
    </form>
  );
}

/** Button that asks for confirmation, then submits a server action. */
export function ConfirmAction({
  action,
  label,
  title,
  body,
  hidden,
  variant = "danger",
  children,
  className,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  label: string;
  title: string;
  body?: string;
  hidden?: Record<string, string>;
  variant?: keyof typeof VARIANTS;
  children?: React.ReactNode;
  className?: string;
}) {
  const L = useL();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={clsx(VARIANTS[variant], "h-10 text-sm", className)} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} onOpenChange={setOpen} title={title}>
        {variant === "danger" && (
          <p className="mb-4 flex items-start gap-2.5 rounded-2xl bg-warn-50 p-3 text-sm text-warn">
            <IconInfo size={18} className="mt-px shrink-0" />
            {L("Diqqat: bu amalni tasdiqlashdan oldin yana bir bor tekshiring.", "Внимание: проверьте ещё раз перед подтверждением.")}
          </p>
        )}
        {body && <p className="text-[15px] leading-relaxed text-ink/80">{body}</p>}
        <ActionForm action={action} onSuccess={() => setOpen(false)} className="mt-5">
          {hidden && Object.entries(hidden).map(([k, v2]) => <input key={k} type="hidden" name={k} value={v2} />)}
          {children}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button type="button" className="btn-soft h-11" onClick={() => setOpen(false)}>
              {L("Yo'q, ortga", "Нет, назад")}
            </button>
            <SubmitButton variant={variant === "danger" ? "primary" : variant}>{label}</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ fields */

function FieldLabel({ children, help, htmlFor }: { children: React.ReactNode; help?: string; htmlFor?: string }) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink/90">
      {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : children}
      {help && <HelpTip text={help} />}
    </span>
  );
}

export function Input({ label, name, className, hint, help, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string; help?: string }) {
  const id = useId();
  return (
    <div className={clsx("block", className)}>
      <FieldLabel help={help} htmlFor={id}>
        {label}
        {rest.required && <span className="ml-0.5 text-brand">*</span>}
      </FieldLabel>
      <input id={id} name={name} className="admin-field" {...rest} />
      {hint && <span className="mt-1.5 block text-xs leading-snug text-muted">{hint}</span>}
    </div>
  );
}

/** Password field with a show/hide eye button. */
export function PasswordInput({ label, name, autoComplete, required, hint }: { label: string; name: string; autoComplete?: string; required?: boolean; hint?: string }) {
  const L = useL();
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <input id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required={required} className="admin-field !h-12 pr-12" />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? L("Parolni yashirish", "Скрыть пароль") : L("Parolni ko'rsatish", "Показать пароль")} className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-field hover:text-ink">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {show && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function Textarea({ label, name, className, hint, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string; hint?: string }) {
  const id = useId();
  return (
    <div className={clsx("block", className)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <textarea id={id} name={name} className="admin-field min-h-24 !h-auto py-2.5" {...rest} />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </div>
  );
}

type Opt = DropdownOption;

export function Select({ label, name, options, className, defaultValue, help, hint, required, disabled }: { label: string; name: string; options: Opt[]; className?: string; defaultValue?: string; help?: string; hint?: string; required?: boolean; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={clsx("block", className)}>
      <FieldLabel help={help} htmlFor={id}>
        {label}
      </FieldLabel>
      <Dropdown id={id} name={name} options={options} defaultValue={defaultValue} required={required} disabled={disabled} />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** Checkbox shown as a tappable chip; the whole chip is the click target. */
export function Check({ label, name, defaultChecked, value = "on", hint }: { label: string; name: string; defaultChecked?: boolean; value?: string; hint?: string }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2.5 rounded-xl border border-line bg-white px-3 py-2 text-[14px] transition-[background-color,border-color,transform] hover:border-brand/40 active:scale-[0.98] has-[:checked]:border-brand/40 has-[:checked]:bg-brand-50/60">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** On/off switch that posts like a checkbox. */
export function Switch({ label, name, defaultChecked, hint, value = "on" }: { label: string; name: string; defaultChecked?: boolean; hint?: string; value?: string }) {
  return (
    <label className="flex cursor-pointer select-none items-center justify-between gap-4 rounded-2xl border border-line bg-white p-3 transition-colors hover:border-brand/30 has-[:checked]:bg-brand-50/40">
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="switch peer sr-only" />
        <span className="h-7 w-12 rounded-full bg-line transition-colors duration-200 peer-checked:bg-brand peer-focus-visible:ring-4 peer-focus-visible:ring-brand/20" />
        <span className="absolute left-1 top-1 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 [transition-timing-function:var(--ease-spring)] peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/** Uzbek + Russian pair of inputs named `${name}_uz` / `${name}_ru`. */
export function I18nInput({ label, name, value, multiline, required }: { label: string; name: string; value?: { uz: string; ru?: string } | null; multiline?: boolean; required?: boolean }) {
  const L = useL();
  return (
    <fieldset className="block">
      <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink/90">
        {label}
        {required && <span className="text-brand">*</span>}
        <HelpTip text={L("Matnni ikki tilda yozing: chapda o'zbekcha (majburiy), o'ngda ruscha. Rus tili bo'sh qolsa, o'zbekcha ko'rsatiladi.", "Напишите текст на двух языках: слева узбекский (обязательно), справа русский. Если русский пуст, покажется узбекский.")} />
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(["uz", "ru"] as const).map((l) => (
          <label key={l} className="relative block">
            <span className="absolute left-2 top-2.5 z-[1] rounded-md bg-field px-1.5 py-0.5 text-[11px] font-semibold uppercase text-muted">{l === "uz" ? "O'Z" : "РУ"}</span>
            {multiline ? (
              <textarea name={`${name}_${l}`} defaultValue={value?.[l] ?? ""} required={required && l === "uz"} className="admin-field min-h-24 !h-auto py-2.5 pl-12" />
            ) : (
              <input name={`${name}_${l}`} defaultValue={value?.[l] ?? ""} required={required && l === "uz"} className="admin-field pl-12" />
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Image picker with a live preview of the chosen file. */
export function FileInput({ name, label, current, hint }: { name: string; label: string; current?: string | null; hint?: string }) {
  const L = useL();
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const shown = preview ?? current ?? null;
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <label className="group flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed border-line bg-white p-3 transition-colors hover:border-brand/40 hover:bg-brand-50/30">
        <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-field text-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {shown ? <img src={shown} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <UploadIcon />}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold text-ink">{fileName || (shown ? L("Rasmni almashtirish", "Заменить изображение") : L("Rasm tanlash", "Выбрать изображение"))}</span>
          <span className="block text-xs text-muted">{hint ?? L("Bosing va kompyuterdan rasm tanlang. PNG, JPEG yoki WebP, 2 MB gacha.", "Нажмите и выберите файл. PNG, JPEG или WebP, до 2 МБ.")}</span>
        </span>
        <input
          ref={ref}
          type="file"
          name={name}
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setFileName(f?.name ?? "");
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
      </label>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15V4m0 0-4 4m4-4 4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

/* ------------------------------------------------------------- navigation */

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const L = useL();
  const sp = useSearchParams();
  const pathname = usePathname();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams(sp.toString());
    q.set("page", String(p));
    return `${pathname}?${q}`;
  };
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const arrow = "grid size-9 place-items-center rounded-xl bg-field transition-colors hover:bg-line";
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 mt-2 text-sm" aria-label="pagination">
      <span className="text-muted">
        {total === 0 ? L("Hech narsa yo'q", "Ничего нет") : L(`${from}–${to}, jami ${total} ta`, `${from}–${to} из ${total}`)}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          {page > 1 ? (
            <Link className={arrow} href={href(page - 1)} aria-label={L("Oldingi sahifa", "Предыдущая")}>
              <IconArrowLeft size={18} />
            </Link>
          ) : (
            <span className={clsx(arrow, "opacity-40")}><IconArrowLeft size={18} /></span>
          )}
          {nums.map((n, i) => (
            <span key={n} className="flex items-center gap-1">
              {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
              <Link href={href(n)} aria-current={n === page ? "page" : undefined} className={clsx("grid h-9 min-w-9 place-items-center rounded-xl px-2 font-medium tabular-nums transition-colors", n === page ? "bg-ink text-white" : "hover:bg-field")}>
                {n}
              </Link>
            </span>
          ))}
          {page < pages ? (
            <Link className={arrow} href={href(page + 1)} aria-label={L("Keyingi sahifa", "Следующая")}>
              <IconArrowRight size={18} />
            </Link>
          ) : (
            <span className={clsx(arrow, "opacity-40")}><IconArrowRight size={18} /></span>
          )}
        </div>
      )}
    </nav>
  );
}

/** GET form that writes its fields into the URL query (server-side filtering). */
export function FilterBar({ children }: { children: React.ReactNode }) {
  const L = useL();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const filtered = [...sp.keys()].some((k) => k !== "view" && k !== "page" && k !== "brand");
  return (
    <form
      className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap [&>div:first-of-type]:col-span-2 sm:[&>div:first-of-type]:col-span-1 [&>label:first-of-type]:col-span-2 sm:[&>label:first-of-type]:col-span-1"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const q = new URLSearchParams();
        for (const [k, v] of fd.entries()) if (String(v)) q.set(k, String(v));
        router.push(`${pathname}?${q}`);
      }}
    >
      {children}
      <button type="submit" className="btn-primary h-11">
        <IconSearch size={18} /> {L("Ko'rsatish", "Показать")}
      </button>
      {filtered && (
        <Link href={pathname} className="btn-soft anim-pop h-11">
          <IconClose size={16} /> {L("Tozalash", "Сбросить")}
        </Link>
      )}
    </form>
  );
}

/** Labelled wrapper for a filter field. */
export function FilterField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("block min-w-0 text-sm sm:min-w-44", className)}>
      <span className="mb-1.5 block font-medium text-ink/90">{label}</span>
      {children}
    </div>
  );
}

/** Search box with an icon, for filter bars. */
export function SearchInput({ name = "q", defaultValue, placeholder, className }: { name?: string; defaultValue?: string; placeholder?: string; className?: string }) {
  return (
    <span className={clsx("relative block", className)}>
      <IconSearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} className="admin-field pl-10 sm:w-60" type="search" />
    </span>
  );
}

/**
 * Re-renders the page as soon as a live event of `kinds` arrives (optionally
 * only for record `id`); `ms` is a slow safety-net timer.
 */
export function AutoRefresh({ ms, kinds = ["order", "reservation", "feedback"], id }: { ms: number; kinds?: ("order" | "reservation" | "feedback" | "catalog")[]; id?: string }) {
  return <LiveRefresh scope="staff" kinds={kinds} id={id} fallbackMs={Math.max(ms, 30000)} />;
}

/** Small pulsing "live" label shown on pages that update themselves. */
export function LiveBadge({ seconds }: { seconds?: number }) {
  const L = useL();
  void seconds;
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-ok-50 px-3 py-1.5 text-xs font-semibold text-ok" title={L("Sahifa o'zgarishlar bo'lishi bilan darhol yangilanadi", "Страница обновляется сразу при изменениях")}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-ok" />
      </span>
      {L("Jonli", "В эфире")}
    </span>
  );
}
