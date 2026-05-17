/**
 * Backfill / incremental sync of on-chain OURO burns into Neon (Helius).
 * Human trash→OURO exchange metadata is recorded by the app via POST /api/ouro-burn-history.
 */
import { loadProjectEnv } from "../lib/loadEnv";

loadProjectEnv();

import { readBurnHistoryStore, refreshBurnHistory } from "../lib/ouroBurnHistory";

async function main() {
  const existing = await readBurnHistoryStore();
  const mode = existing.backfillComplete ? "incremental" : "backfill";
  const maxChunks = existing.backfillComplete ? 40 : 500;

  console.log(
    `Syncing OURO burn history to Neon (${mode}, max ${maxChunks} chunks)…\n`,
  );

  const store = await refreshBurnHistory({
    force: true,
    mode,
    maxChunks,
    onProgress: (msg) => console.log(msg),
  });

  const humanExchanges = store.entries.filter(
    (e) => e.performedBy === "human" && e.exchange?.sourceMint,
  ).length;

  console.log(
    `\nDone: ${store.entries.length} burn(s), ${humanExchanges} with exchange metadata (from app POST), backfillComplete=${store.backfillComplete}, scanned=${store.lastScannedCount ?? 0}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
