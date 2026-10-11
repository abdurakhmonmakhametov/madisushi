"use client";

// Custom animated dropdown (Radix Select). Works inside normal <form>s: the
// chosen value is posted through a hidden input with the given `name`.
// Radix forbids "" as an item value, so it is mapped to a sentinel.
import { useState } from "react";
import { Select as RS } from "radix-ui";
import clsx from "clsx";
import { IconCheck, IconChevronDown } from "./icons";

export type DropdownOption = { value: string; label: string; hint?: string };
const EMPTY = "__empty__";

export function Dropdown({
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  className,
  size = "md",
  variant = "outline",
  required,
  disabled,
  "aria-label": ariaLabel,
  id,
  placeholder,
  prefix,
}: {
  name?: string;
  options: DropdownOption[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  /** outline = admin style (white, border); field = site style (grey fill). */
  variant?: "outline" | "field";
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
  placeholder?: string;
  /** Text shown before the selected value, e.g. "Filial:". */
  prefix?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? inner;
  const enc = (v: string) => (v === "" ? EMPTY : v);
  const dec = (v: string) => (v === EMPTY ? "" : v);
  return (
    <>
      {name && <input type="hidden" name={name} value={current} required={required} />}
      <RS.Root
        value={enc(current)}
        disabled={disabled}
        onValueChange={(v) => {
          setInner(dec(v));
          onValueChange?.(dec(v));
        }}
      >
        <RS.Trigger
          id={id}
          aria-label={ariaLabel}
          className={clsx(
            "group flex w-full min-w-0 items-center justify-between gap-2 text-left outline-none transition-[border-color,box-shadow,background-color] disabled:opacity-50",
            variant === "outline"
              ? "rounded-xl border border-line bg-white hover:border-[#d6d6d4] focus-visible:border-brand/50 focus-visible:ring-4 focus-visible:ring-brand/10 data-[state=open]:border-brand/50 data-[state=open]:ring-4 data-[state=open]:ring-brand/10"
              : "rounded-[var(--radius-field)] bg-field hover:bg-[#ebebe9] focus-visible:ring-2 focus-visible:ring-brand/40 data-[state=open]:bg-white data-[state=open]:ring-2 data-[state=open]:ring-brand/40",
            size === "sm" ? "h-9 px-2.5 text-sm" : size === "lg" ? "h-14 px-5 text-[16px]" : "h-11 px-3 text-[15px]",
            className,
          )}
        >
          <span className="min-w-0 truncate">
            {prefix && <span className="text-muted">{prefix} </span>}
            <RS.Value placeholder={placeholder} />
          </span>
          <RS.Icon className="shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180">
            <IconChevronDown size={18} />
          </RS.Icon>
        </RS.Trigger>
        <RS.Portal>
          <RS.Content
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            className="anim-dropdown z-[60] max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]"
          >
            <RS.ScrollUpButton className="flex h-6 items-center justify-center text-muted">
              <IconChevronDown size={16} className="rotate-180" />
            </RS.ScrollUpButton>
            <RS.Viewport>
              {options.map((o) => (
                <RS.Item
                  key={o.value}
                  value={enc(o.value)}
                  className="relative flex cursor-pointer select-none items-center gap-2 rounded-xl py-2.5 pl-3 pr-9 text-[15px] outline-none transition-colors data-[disabled]:opacity-40 data-[highlighted]:bg-field data-[state=checked]:font-semibold data-[state=checked]:text-brand"
                >
                  <span className="min-w-0">
                    <RS.ItemText>{o.label}</RS.ItemText>
                    {o.hint && <span className="block text-xs font-normal text-muted">{o.hint}</span>}
                  </span>
                  <RS.ItemIndicator className="absolute right-3 grid place-items-center">
                    <IconCheck size={16} />
                  </RS.ItemIndicator>
                </RS.Item>
              ))}
            </RS.Viewport>
            <RS.ScrollDownButton className="flex h-6 items-center justify-center text-muted">
              <IconChevronDown size={16} />
            </RS.ScrollDownButton>
          </RS.Content>
        </RS.Portal>
      </RS.Root>
    </>
  );
}
