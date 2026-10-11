// Minimal Telegram Bot API client (https://core.telegram.org/bots/api).
// No SDK: every call is a JSON POST to api.telegram.org.

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export class TelegramError extends Error {
  constructor(
    public method: string,
    public code: number,
    public description: string,
    public retryAfter?: number,
  ) {
    super(`telegram ${method}: ${code} ${description}`);
  }
  /** The chat is gone for good (user blocked the bot, deleted account, kicked it). */
  get chatGone() {
    return this.code === 403 || /chat not found|user is deactivated/i.test(this.description);
  }
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json().catch(() => ({ ok: false, error_code: res.status, description: res.statusText }))) as {
    ok: boolean;
    result?: T;
    error_code?: number;
    description?: string;
    parameters?: { retry_after?: number };
  };
  if (!json.ok) throw new TelegramError(method, json.error_code ?? res.status, json.description ?? "error", json.parameters?.retry_after);
  return json.result as T;
}

export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type InlineButton = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };
export type InlineKeyboard = InlineButton[][];

export interface TgUser {
  id: number;
  first_name: string;
  username?: string;
  language_code?: string;
}

export interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  contact?: { phone_number: string; user_id?: number; first_name: string };
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; message?: TgMessage; data?: string };
}
