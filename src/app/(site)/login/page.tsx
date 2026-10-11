import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getCustomer } from "@/lib/auth/session";
import { OtpLogin } from "@/components/auth/OtpLogin";

export const metadata = { title: "Login" };

function safeNext(n: string | undefined) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCustomer()) redirect(next);
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-6 sm:p-8">
        <h1 className="mb-6 text-2xl font-bold">{t("login.title")}</h1>
        <OtpLogin next={next} />
      </div>
    </div>
  );
}
