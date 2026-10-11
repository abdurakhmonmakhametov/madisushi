import { redirect } from "next/navigation";

// The site serves one restaurant, whose menu is the home page. Old
// /r/<brand> links keep working and land there with their query intact.
export default async function RestaurantRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  const s = q.toString();
  redirect(s ? `/?${s}` : "/");
}
