// Route handler helpers: consistent JSON errors that never leak internals,
// zod validation, and a same-origin check for cookie-authenticated mutations.
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { RateLimitError } from "./auth/ratelimit";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // same-origin fetches from older browsers / server-to-server
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new ApiError(403, "forbidden");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(403, "forbidden");
  }
}

export async function body<T extends z.ZodTypeAny>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "validation");
  }
  return schema.parse(raw);
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

export function route<C = unknown>(fn: Handler<C>, opts: { csrf?: boolean } = { csrf: true }): Handler<C> {
  return async (req, ctx) => {
    try {
      if (opts.csrf !== false && req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.code, ...e.extra }, e.status);
      if (e instanceof RateLimitError) return json({ error: "rate_limited" }, 429);
      if (e instanceof ZodError) return json({ error: "validation", fields: e.issues.map((i) => i.path.join(".")) }, 400);
      console.error("[api]", req.method, req.nextUrl.pathname, e);
      return json({ error: "server_error" }, 500);
    }
  };
}
