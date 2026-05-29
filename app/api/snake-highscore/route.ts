import { NextResponse } from "next/server";
import {
  getLeaderboard,
  getPersonalBest,
  isValidWalletAddress,
  submitScore,
} from "@/lib/snakeHighScoreDb";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet")?.trim();
  const limitRaw = searchParams.get("limit");
  const limit =
    limitRaw && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : 10;

  if (wallet && !isValidWalletAddress(wallet)) {
    return NextResponse.json(
      { error: "invalid wallet address" },
      { status: 400 },
    );
  }

  try {
    const [leaderboard, bestScore] = await Promise.all([
      getLeaderboard(limit),
      wallet ? getPersonalBest(wallet) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      leaderboard,
      bestScore,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "could not load scores";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const walletAddress =
    typeof o.walletAddress === "string" ? o.walletAddress.trim() : "";
  const score =
    typeof o.score === "number" && Number.isFinite(o.score)
      ? Math.floor(o.score)
      : NaN;

  if (!walletAddress) {
    return NextResponse.json(
      { error: "walletAddress is required" },
      { status: 400 },
    );
  }
  if (!isValidWalletAddress(walletAddress)) {
    return NextResponse.json(
      { error: "invalid wallet address" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(score) || score < 0) {
    return NextResponse.json({ error: "invalid score" }, { status: 400 });
  }

  try {
    const result = await submitScore(walletAddress, score);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "could not save score";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
