import { cookies } from "next/headers";
import { z } from "zod";

const schema = z.object({
  text: z.string().max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  house: z.string().max(20).nullable().optional(),
  apartment: z.string().max(20).nullable().optional(),
  floor: z.string().max(10).nullable().optional(),
  entrance: z.string().max(10).nullable().optional(),
  instructions: z.string().max(300).nullable().optional(),
  savedId: z.string().nullable().optional(),
});

export type AddressCookie = z.infer<typeof schema>;

/** The customer's selected delivery address (server side), or null. */
export async function getAddressCookie(): Promise<AddressCookie | null> {
  const raw = (await cookies()).get("sushi_addr")?.value;
  if (!raw) return null;
  try {
    // Next already URL-decodes cookie values; tolerate either form.
    const parsed = schema.safeParse(JSON.parse(raw.startsWith("{") ? raw : decodeURIComponent(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
