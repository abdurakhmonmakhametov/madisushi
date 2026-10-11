// Server-renderable admin building blocks.
import clsx from "clsx";
import { PageGuide } from "./guide";

type Guide = { title?: string; steps: string[]; tip?: string };

export function PageHeader({ title, description, children, guide, icon }: { title: string; description?: string; children?: React.ReactNode; guide?: Guide; icon?: React.ReactNode }) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 lg:mb-6">
        <div className="flex min-w-0 items-center gap-3">
          {icon && <span className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-white text-brand shadow-[var(--shadow-card)] sm:grid">{icon}</span>}
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight lg:text-[26px]">{title}</h1>
            {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
      {guide && <PageGuide {...guide} />}
    </>
  );
}

export function Panel({ title, description, children, className, actions, icon }: { title?: string; description?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <section className={clsx("rounded-2xl bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-black/[0.02] lg:p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            {icon && <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-field text-ink/70">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 className="text-[16px] font-semibold leading-tight">{title}</h2>}
              {description && <p className="mt-1 text-xs leading-snug text-muted">{description}</p>}
            </div>
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: string | false }) {
  return (
    <div className="-mx-1 overflow-x-auto rounded-xl px-1 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] md:[mask-image:none]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="bg-page/70">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted first:rounded-l-xl last:rounded-r-xl">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&>tr:hover]:bg-page/60">{children}</tbody>
      </table>
      {empty && <EmptyState text={empty} />}
    </div>
  );
}

export function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="anim-pop my-3 flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-field text-2xl" aria-hidden>
        🍣
      </span>
      <p className="font-medium text-ink/70">{text}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
    </div>
  );
}

const TONES = {
  neutral: "bg-field text-ink",
  ok: "bg-ok-50 text-ok",
  warn: "bg-warn-50 text-warn",
  brand: "bg-brand-50 text-brand",
  info: "bg-info-50 text-info",
} as const;

export function Stat({ label, value, hint, icon, tone = "neutral" }: { label: string; value: string; hint?: string; icon?: React.ReactNode; tone?: keyof typeof TONES }) {
  return (
    <div className="lift group rounded-2xl bg-white p-4 shadow-[var(--shadow-card)] lg:p-5">
      <div className="flex items-center gap-2.5">
        {icon && <span className={clsx("grid size-9 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110", TONES[tone])}>{icon}</span>}
        <p className="text-[13px] font-medium leading-tight text-muted">{label}</p>
      </div>
      <p className="mt-3 text-[22px] font-bold leading-none tracking-tight tabular-nums lg:text-[26px]">{value}</p>
      {hint && <p className="mt-2 text-xs leading-snug text-muted">{hint}</p>}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "brand" | "info" }) {
  const dot = { neutral: "bg-subtle", ok: "bg-ok", warn: "bg-warn", brand: "bg-brand", info: "bg-info" }[tone];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium", TONES[tone])}>
      <span className={clsx("size-1.5 rounded-full", dot)} />
      {children}
    </span>
  );
}

export function ErrorState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-2xl border border-brand/30 bg-brand-50 p-6 text-brand">
      <p className="font-semibold">{title}</p>
      {body && <p className="mt-1 text-sm">{body}</p>}
    </div>
  );
}
