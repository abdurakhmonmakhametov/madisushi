import { json, route } from "@/lib/api";
import { search } from "@/lib/services/catalog";

export const GET = route(async (req) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return json(await search(q));
});
