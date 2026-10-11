import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

// Serves images uploaded to the database (src/lib/integrations/storage.ts).
// Paths contain a random UUID and are never overwritten, so they cache forever.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const name = (await params).path.join("/");
  if (!/^[a-z0-9-]{1,30}\/[0-9a-f-]{36}\.(png|jpg|webp)$/i.test(name)) return new NextResponse(null, { status: 404 });
  const row = await db.one<{ mime: string; data: Buffer }>("select mime, data from public.media_files where path = $1", [name]);
  if (!row) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(row.data), {
    headers: { "Content-Type": row.mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
