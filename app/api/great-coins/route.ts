import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type GreatCoin = {
  image_uri: string;
  name: string;
  symbol: string;
};

export async function GET() {
  try {
    const res = await fetch(
      "https://frontend-api-v3.pump.fun/coins/great-coins",
      { next: { revalidate: 300 } },
    );
    if (!res.ok) {
      return NextResponse.json(
        { coins: [], error: `upstream ${res.status}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as Array<{
      image_uri?: string;
      name?: string;
      symbol?: string;
    }>;
    const coins: GreatCoin[] = data
      .filter((c) => typeof c.image_uri === "string" && c.image_uri.length > 0)
      .map((c) => ({
        image_uri: c.image_uri!,
        name: c.name ?? "",
        symbol: c.symbol ?? "",
      }));
    return NextResponse.json({ coins });
  } catch (e) {
    const message = e instanceof Error ? e.message : "could not load coins";
    return NextResponse.json({ coins: [], error: message }, { status: 500 });
  }
}
