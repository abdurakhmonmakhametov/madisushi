import { NextResponse, type NextRequest } from "next/server";
import { handlePayme } from "@/lib/payments/payme";

// Payme Merchant API endpoint (JSON-RPC). Payme expects HTTP 200 with a
// JSON-RPC result or error body in every case.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  return NextResponse.json(await handlePayme(req.headers.get("authorization"), raw));
}
