// Server-side configuration. Nothing here is exposed to the browser except
// values explicitly passed down as props.

export const isProduction = process.env.NODE_ENV === "production";

export function sessionSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32 || (isProduction && s.startsWith("change-me"))) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters");
  }
  return new TextEncoder().encode(s);
}

export function siteUrl(): string {
  // RENDER_EXTERNAL_URL is set by Render (https://<service>.onrender.com)
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Dev-only simulators (mock payments, console OTP) are never available in production. */
export function devToolsAllowed(): boolean {
  return !isProduction;
}
