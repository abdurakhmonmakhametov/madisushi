import { json, route } from "@/lib/api";
import { searchPlaces } from "@/lib/integrations/geocoder";

export const GET = route(async (req) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  return json({ places: await searchPlaces(q, 12) });
});
