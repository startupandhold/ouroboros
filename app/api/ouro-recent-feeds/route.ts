import { NextResponse } from "next/server";
import { getHeliusRpcUrl } from "@/lib/constants";
import { humanExchangeEntries, readBurnHistoryStore } from "@/lib/ouroBurnHistory";
import { fetchTokenMetaByMint } from "@/lib/tokenMetadata";
import type { RecentFeedToken } from "@/lib/ouroFedMint";

export const dynamic = "force-dynamic";

/** Last 3 human app exchanges (trash token devoured → OURO buyback) from burn history. */
export async function GET() {
  try {
    const store = await readBurnHistoryStore();
    const entries = humanExchangeEntries(store.entries, 3);
    const heliusRpc = getHeliusRpcUrl();

    const feeds: RecentFeedToken[] = await Promise.all(
      entries.map(async (e) => {
        const ex = e.exchange!;
        const mint = ex.sourceMint;
        const hasMeta = Boolean(ex.sourceSymbol || ex.sourceName || ex.sourceImage);
        const meta = hasMeta
          ? {
              symbol: ex.sourceSymbol,
              name: ex.sourceName,
              image: ex.sourceImage,
            }
          : await fetchTokenMetaByMint(mint, heliusRpc);
        return {
          signature: e.signature,
          timestamp: e.timestamp,
          amountUi: e.amountUi,
          performedBy: "human" as const,
          mint,
          symbol: ex.sourceSymbol ?? meta.symbol,
          name: ex.sourceName ?? meta.name,
          image: ex.sourceImage ?? meta.image,
          sourceUiAmount: ex.sourceUiAmount,
          ouroBurnedUi: e.amountUi,
        };
      }),
    );

    return NextResponse.json({ feeds });
  } catch (e) {
    const message = e instanceof Error ? e.message : "could not load recent feeds";
    return NextResponse.json({ feeds: [], error: message }, { status: 500 });
  }
}
