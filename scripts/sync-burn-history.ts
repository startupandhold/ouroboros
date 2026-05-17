/**
 * Backfill burn history from OURO deploy → now.
 * Progress is checkpointed to data/ouro-burn-history.json every chunk.
 */
import { loadProjectEnv } from "../lib/loadEnv";

loadProjectEnv();

import {
  readBurnHistoryStore,
  refreshBurnHistory,
} from "../lib/ouroBurnHistory";

async function main() {
  const existing = await readBurnHistoryStore();
  const mode = existing.backfillComplete ? "incremental" : "backfill";
  const maxChunks = existing.backfillComplete ? 40 : 500;

  console.log(
    `Syncing OURO burn history (${mode}, max ${maxChunks} chunks)…`,
  );
  console.log(
    "Then inferring human trash→OURO exchange metadata where missing.\n",
  );

  const store = await refreshBurnHistory({
    force: true,
    mode,
    maxChunks,
    enrichExchanges: true,
    enrichMaxEntries: 0,
    onProgress: (msg) => console.log(msg),
  });

  const humanExchanges = store.entries.filter(
    (e) => e.performedBy === "human" && e.exchange?.sourceMint,
  ).length;

  console.log(
    `\nDone: ${store.entries.length} burn(s), ${humanExchanges} with exchange metadata, backfillComplete=${store.backfillComplete}, scanned=${store.lastScannedCount ?? 0}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
