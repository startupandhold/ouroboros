/**
 * Backfill burn history from OURO deploy → now.
 * Progress is checkpointed to data/ouro-burn-history.json every chunk.
 */
import { loadProjectEnv } from "../lib/loadEnv";

loadProjectEnv();

import { refreshBurnHistory } from "../lib/ouroBurnHistory";

async function main() {
  console.log("Syncing OURO burn history (chunked)…\n");

  const store = await refreshBurnHistory({
    force: true,
    mode: "backfill",
    maxChunks: 500,
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
