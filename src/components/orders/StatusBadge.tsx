import clsx from "clsx";

const TONES: Record<string, string> = {
  new: "bg-info-50 text-info",
  confirmed: "bg-info-50 text-info",
  preparing: "bg-warn-50 text-warn",
  ready: "bg-warn-50 text-warn",
  out_for_delivery: "bg-warn-50 text-warn",
  delivered: "bg-ok-50 text-ok",
  picked_up: "bg-ok-50 text-ok",
  cancelled: "bg-brand-50 text-brand",
  pending: "bg-warn-50 text-warn",
  rejected: "bg-brand-50 text-brand",
  seated: "bg-ok-50 text-ok",
  no_show: "bg-field text-muted",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={clsx("inline-flex rounded-full px-3 py-1 text-sm font-medium", TONES[status] ?? "bg-field text-ink")}>{label}</span>;
}
