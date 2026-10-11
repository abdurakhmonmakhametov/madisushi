// Runs once when a Next.js server process starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.TELEGRAM_MODE === "webhook") {
    const { startWebhookMode } = await import("./lib/telegram/webhook");
    // not awaited: Telegram API calls must not delay the server becoming ready
    void startWebhookMode();
  }
}
