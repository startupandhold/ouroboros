import { NextResponse } from "next/server";
import {
  BURN_HISTORY_REFRESH_MS,
  getHeliusApiKey,
  readBurnHistoryStore,
  refreshBurnHistory,
} from "@/lib/ouroBurnHistory";

export const dynamic = "force-dynamic";

/** Serves burns from `data/ouro-burn-history.json`; optional light chain sync. */
export async function GET() {
  const syncEnabled = Boolean(getHeliusApiKey());
  let store = await readBurnHistoryStore();
  const needsSync =
    syncEnabled && Date.now() - store.lastFetchedAt >= BURN_HISTORY_REFRESH_MS;

  let syncError: string | undefined;
  if (needsSync && syncEnabled) {
    try {
      if (!store.backfillComplete) {
        syncError =
          "history backfill incomplete — run npm run sync:burn-history locally (needs Helius paid plan for getTransactionsForAddress, or falls back to signatures).";
      } else {
        store = await refreshBurnHistory({
          force: false,
          mode: "incremental",
          maxChunks: 3,
        });
      }
    } catch (e) {
      syncError = e instanceof Error ? e.message : "chain sync failed";
      store = await readBurnHistoryStore();
    }
  }

  return NextResponse.json({
    mint: store.mint,
    lastFetchedAt: store.lastFetchedAt,
    entries: store.entries,
    syncEnabled,
    syncError,
    backfillComplete: store.backfillComplete ?? false,
    lastScannedCount: store.lastScannedCount,
  });
}
