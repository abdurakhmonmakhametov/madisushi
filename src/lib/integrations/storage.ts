// Image uploads. Uses Supabase Storage when SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set; otherwise the database (production, or
// STORAGE_PROVIDER=db), served from /media/...; otherwise ./public/uploads
// (development). Only PNG, JPEG and WebP up to 2 MB are accepted; the type is
// checked from the file's magic bytes, not its name. SVG is refused.
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../db";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export class UploadError extends Error {}

function sniff(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

function useDatabase(): boolean {
  return process.env.STORAGE_PROVIDER === "db" || process.env.NODE_ENV === "production";
}

export function storageStatus(): { provider: string; ready: boolean; note: string } {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return { provider: "supabase", ready: true, note: `bucket "${process.env.SUPABASE_STORAGE_BUCKET || "media"}" (must exist and be public)` };
  if (useDatabase()) return { provider: "database", ready: true, note: "stored in PostgreSQL (table media_files), served from /media" };
  return { provider: "local", ready: true, note: "public/uploads (development only)" };
}

/** Validates and stores an uploaded image; returns its public URL. */
export async function saveImage(file: File, folder: string): Promise<string> {
  if (!file || file.size === 0) throw new UploadError("empty");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("too_large");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) throw new UploadError("unsupported_type");
  const safeFolder = folder.replace(/[^a-z0-9-]/gi, "").slice(0, 30) || "misc";
  const name = `${safeFolder}/${randomUUID()}.${kind.ext}`;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "media";
    // Supabase Storage REST: POST /storage/v1/object/{bucket}/{path}
    const r = await fetch(`${url.replace(/\/$/, "")}/storage/v1/object/${bucket}/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": kind.mime, "x-upsert": "false" },
      body: buf,
    });
    if (!r.ok) throw new UploadError(`storage_failed_${r.status}`);
    return `${url.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${name}`;
  }
  if (useDatabase()) {
    await db.query("insert into public.media_files (path, mime, data, size) values ($1, $2, $3, $4)", [name, kind.mime, buf, buf.length]);
    return `/media/${name}`;
  }
  const dest = path.join(process.cwd(), "public", "uploads", name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  return `/uploads/${name}`;
}
