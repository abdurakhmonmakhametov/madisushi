import type { Metadata, Viewport } from "next";
import { Inter, Kaushan_Script } from "next/font/google";
import { getLang } from "@/lib/i18n/server";
import { getSettings } from "@/lib/settings";
import { TelegramBridge } from "@/components/telegram/TelegramBridge";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
// Brush-script face for the "Madi" wordmark, echoing the logo.
const kaushan = Kaushan_Script({ weight: "400", subsets: ["latin"], variable: "--font-kaushan", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: { default: s.branding.platformName, template: `%s · ${s.branding.platformName}` },
    description: s.branding.footerText.uz,
  };
}

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${inter.variable} ${kaushan.variable}`}>
      <body>
        {children}
        <TelegramBridge lang={lang} />
      </body>
    </html>
  );
}
