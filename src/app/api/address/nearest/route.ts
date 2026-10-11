import { ApiError, json, route } from "@/lib/api";
import { nearestPlace } from "@/lib/integrations/geocoder";

export const GET = route(async (req) => {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ApiError(400, "validation");
  return json({ place: nearestPlace([lat, lng]) });
});
