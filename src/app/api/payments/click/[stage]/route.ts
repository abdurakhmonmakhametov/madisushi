import { NextResponse, type NextRequest } from "next/server";
import { handleClick } from "@/lib/payments/click";

// Click SHOP API callbacks: POST /api/payments/click/prepare and /complete
// (application/x-www-form-urlencoded). Configure these URLs in the Click
// merchant cabinet. Responses are JSON as Click expects.
export async function POST(req: NextRequest, { params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;
  if (stage !== "prepare" && stage !== "complete") return NextResponse.json({ error: -3, error_note: "Action not found" });
  let fields: Record<string, string> = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) fields = Object.fromEntries(Object.entries(await req.json()).map(([k, v]) => [k, String(v)]));
    else fields = Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]));
  } catch {
    return NextResponse.json({ error: -8, error_note: "Error in request from click" });
  }
  try {
    return NextResponse.json(await handleClick(stage, fields));
  } catch (e) {
    console.error("[click]", e);
    return NextResponse.json({ error: -7, error_note: "Failed to update" });
  }
}
