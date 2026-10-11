import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { TgUpdate } from "@/lib/telegram/api";
import { handleUpdate } from "@/lib/telegram/bot";
import { kickOutbox, webhookMode, webhookSecret } from "@/lib/telegram/webhook";

// Telegram Bot API webhook (TELEGRAM_MODE=webhook). Telegram proves the call is
// genuine with the secret_token we registered in setWebhook.
export async function POST(req: NextRequest) {
  if (!webhookMode()) return new NextResponse(null, { status: 404 });
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = Buffer.from(webhookSecret());
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new NextResponse(null, { status: 401 });
  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (typeof update?.update_id !== "number") return new NextResponse(null, { status: 400 });
  // handleUpdate logs its own errors; answering 200 stops Telegram from re-sending a bad update forever.
  await handleUpdate(update);
  kickOutbox();
  return NextResponse.json({ ok: true });
}
