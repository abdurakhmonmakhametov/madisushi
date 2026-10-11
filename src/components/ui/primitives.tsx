"use client";

// Accessible building blocks. Dialog/Sheet use Radix, which provides focus
// trapping, focus return, Escape and outside-click dismissal.
import { Dialog as RD } from "radix-ui";
import clsx from "clsx";
import { forwardRef, useId } from "react";
import { IconClose, IconMinus, IconPlus } from "./icons";

export function Modal({
  open,
  onOpenChange,
  title,
  children,
  className,
  hideTitle,
  description,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  hideTitle?: boolean;
  description?: string;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="anim-fade fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <RD.Content
          className={clsx(
            "anim-pop fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-[var(--shadow-pop)] outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(560px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:p-7",
            className,
          )}
          aria-describedby={description ? undefined : undefined}
        >
          <div className={clsx("mb-4 flex items-start justify-between gap-4", hideTitle && "sr-only")}>
            <RD.Title className="text-xl font-semibold">{title}</RD.Title>
          </div>
          {description ? <RD.Description className="sr-only">{description}</RD.Description> : <RD.Description className="sr-only">{title}</RD.Description>}
          <RD.Close className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-field text-ink transition-[background-color,transform] duration-200 hover:rotate-90 hover:bg-line" aria-label="Close">
            <IconClose size={18} />
          </RD.Close>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  side = "left",
  children,
  labelledTitle = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  side?: "left" | "bottom" | "right";
  children: React.ReactNode;
  labelledTitle?: boolean;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="anim-fade fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <RD.Content
          className={clsx(
            "fixed z-50 flex flex-col bg-white outline-none",
            side === "left" && "anim-drawer inset-y-0 left-0 w-[min(420px,88vw)]",
            side === "right" && "anim-drawer-right inset-y-0 right-0 w-[min(460px,94vw)] shadow-[var(--shadow-pop)]",
            side === "bottom" && "anim-sheet inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[28px]",
          )}
        >
          <RD.Title className={labelledTitle ? "px-6 pt-6 text-xl font-semibold" : "sr-only"}>{title}</RD.Title>
          <RD.Description className="sr-only">{title}</RD.Description>
          <RD.Close className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-field transition-[background-color,transform] duration-200 hover:rotate-90 hover:bg-line" aria-label="Close">
            <IconClose size={18} />
          </RD.Close>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export function QtyControl({
  value,
  onChange,
  min = 0,
  max = 99,
  size = "md",
  labels,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  labels: { dec: string; inc: string };
  className?: string;
}) {
  const h = size === "sm" ? "h-9" : size === "lg" ? "h-[52px]" : "h-11";
  return (
    <div className={clsx("flex items-center justify-between rounded-[14px] bg-field", h, className)} role="group">
      <button type="button" className="grid h-full w-10 place-items-center rounded-l-[14px] transition-[background-color,transform] hover:bg-black/5 active:scale-90 disabled:opacity-40" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={labels.dec}>
        <IconMinus size={16} />
      </button>
      <span key={value} className="anim-pop min-w-6 text-center font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className="grid h-full w-10 place-items-center rounded-r-[14px] transition-[background-color,transform] hover:bg-black/5 active:scale-90 disabled:opacity-40" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={labels.inc}>
        <IconPlus size={16} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={clsx("relative grid auto-cols-fr grid-flow-col rounded-[18px] bg-field p-1", className)}>
      {/* sliding highlight behind the chosen option */}
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-[14px] bg-white shadow-sm transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${Math.max(0, options.findIndex((o) => o.value === value)) * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={clsx(
            "relative z-[1] h-11 whitespace-nowrap rounded-[14px] px-4 text-[15px] font-medium transition-colors duration-200 disabled:opacity-40",
            value === o.value ? "text-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={clsx("flex items-center justify-between gap-4", disabled && "opacity-60")}>
      <label htmlFor={id} className="min-w-0">
        <div className="font-semibold">{label}</div>
        {hint && <div className="text-sm text-muted">{hint}</div>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx("relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed", checked ? "bg-brand" : "bg-line")}
      >
        <span className={clsx("absolute left-0 top-1 size-6 rounded-full bg-white shadow transition-transform duration-300 [transition-timing-function:var(--ease-spring)]", checked ? "translate-x-7" : "translate-x-1")} />
      </button>
    </div>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null };

/** Input with the small label on top, as in the reference checkout. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, error, className, id, ...rest }, ref) {
  const autoId = useId();
  const fid = id ?? autoId;
  return (
    <div className={className}>
      <div className={clsx("relative rounded-[var(--radius-field)] bg-field focus-within:bg-white focus-within:ring-2 focus-within:ring-brand/40", error && "ring-2 ring-brand/60")}>
        <label htmlFor={fid} className="pointer-events-none absolute left-5 top-2.5 text-xs text-muted">
          {label}
        </label>
        <input ref={ref} id={fid} className="h-[66px] w-full rounded-[var(--radius-field)] bg-transparent px-5 pt-5 text-base outline-none placeholder:text-subtle" aria-invalid={!!error} {...rest} />
      </div>
      {error && <p className="mt-1 px-2 text-sm text-brand">{error}</p>}
    </div>
  );
});

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-hidden />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "brand" | "info"; children: React.ReactNode }) {
  const tones = {
    neutral: "bg-field text-ink",
    ok: "bg-ok-50 text-ok",
    warn: "bg-warn-50 text-warn",
    brand: "bg-brand-50 text-brand",
    info: "bg-info-50 text-info",
  };
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", tones[tone])}>{children}</span>;
}
