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
    `Syncing OURO burn history (${mode}, max ${maxChunks} chunks)…\n`,
  );

  const store = await refreshBurnHistory({
    force: true,
    mode,
    maxChunks,
    onProgress: (msg) => console.log(msg),
  });

  console.log(
    `\nDone: ${store.entries.length} burn(s), backfillComplete=${store.backfillComplete}, scanned=${store.lastScannedCount ?? 0}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
