"use client";
import { IconPrinter } from "@/components/ui/icons";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary h-10 w-full text-sm">
      <IconPrinter size={18} /> Print
    </button>
  );
}
