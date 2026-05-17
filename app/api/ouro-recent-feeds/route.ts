import { NextResponse } from "next/server";
import { getHeliusRpcUrl } from "@/lib/constants";
import { readBurnHistoryStore } from "@/lib/ouroBurnHistory";
import { resolveFedMintForSignature, type RecentFeedToken } from "@/lib/ouroFedMint";
import { fetchTokenMetaByMint } from "@/lib/tokenMetadata";

export const dynamic = "force-dynamic";

/** Last 3 OURO burns with the trash-token (or OURO) mint image fed to the snake. */
export async function GET() {
  try {
    const store = await readBurnHistoryStore();
    const entries = store.entries.slice(0, 3);
    const heliusRpc = getHeliusRpcUrl();

    const feeds: RecentFeedToken[] = await Promise.all(
      entries.map(async (e) => {
        const mint = await resolveFedMintForSignature(e.signature);
        const meta = await fetchTokenMetaByMint(mint, heliusRpc);
        return {
          signature: e.signature,
          timestamp: e.timestamp,
          amountUi: e.amountUi,
          performedBy: e.performedBy,
          mint,
          symbol: meta.symbol,
          name: meta.name,
          image: meta.image,
        };
      }),
    );

    return NextResponse.json({ feeds });
  } catch (e) {
    const message = e instanceof Error ? e.message : "could not load recent feeds";
    return NextResponse.json({ feeds: [], error: message }, { status: 500 });
  }
}
