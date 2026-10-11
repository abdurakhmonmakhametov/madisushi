import type { Metadata } from "next";
import { LangProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/i18n/server";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <LangProvider lang={await getLang()}>{children}</LangProvider>;
}
