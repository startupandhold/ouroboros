import { NextResponse } from "next/server";

const UPSTREAM = "https://v2.api.sol-incinerator.com/batch/close-all";

export async function POST(req: Request) {
  const apiKey = process.env.SOL_INCINERATOR_API?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "SOL_INCINERATOR_API is not configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { userPublicKey, limit, offset } = body as Record<string, unknown>;
  if (typeof userPublicKey !== "string") {
    return NextResponse.json(
      { error: "userPublicKey is required" },
      { status: 400 },
    );
  }

  const payload: Record<string, unknown> = { userPublicKey };
  if (typeof limit === "number" && Number.isFinite(limit)) payload.limit = limit;
  if (typeof offset === "number" && Number.isFinite(offset)) payload.offset = offset;

  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
