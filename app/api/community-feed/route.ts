import { NextResponse } from "next/server";
import { fetchCommunityFeedItems } from "@/lib/coinCommunity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await fetchCommunityFeedItems();
    return NextResponse.json(payload);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "could not load community feed";
    return NextResponse.json(
      {
        items: [],
        communityUrl: process.env.COIN_COMMUNITY_URL ?? null,
        tokenAddress: process.env.OURO_TOKEN_ADDRESS ?? null,
        error: message,
      },
      { status: 500 },
    );
  }
}
