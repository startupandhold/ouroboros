/**
 * One-time import from data/ouro-burn-history.json into Neon (Prisma).
 * Run after: npm run db:push (or db:migrate) with NEON_DB_URL set.
 */
import { promises as fs } from "fs";
import path from "path";
import { loadProjectEnv } from "../lib/loadEnv";

loadProjectEnv();

import { prisma } from "../lib/prisma";
import {
  normalizeEntry,
  OURO_MINT_STR,
  type OuroBurnHistoryStore,
} from "../lib/ouroBurnHistoryTypes";
import { upsertBurnEntries, updateSyncState } from "../lib/ouroBurnHistoryDb";

const JSON_PATH = path.join(process.cwd(), "data", "ouro-burn-history.json");

async function main() {
  const raw = await fs.readFile(JSON_PATH, "utf8");
  const parsed = JSON.parse(raw) as OuroBurnHistoryStore;

  if (parsed.mint !== OURO_MINT_STR || !Array.isArray(parsed.entries)) {
    throw new Error("invalid ouro-burn-history.json");
  }

  const entries = parsed.entries.map(normalizeEntry);
  console.log(`Importing ${entries.length} burn(s) from ${JSON_PATH}…`);

  const BATCH = 50;
  for (let i = 0; i < entries.length; i += BATCH) {
    await upsertBurnEntries(entries.slice(i, i + BATCH));
    console.log(`  ${Math.min(i + BATCH, entries.length)} / ${entries.length}`);
  }

  await updateSyncState({
    mint: parsed.mint,
    lastFetchedAt: parsed.lastFetchedAt ?? Date.now(),
    backfillComplete: parsed.backfillComplete ?? false,
    backfillPaginationToken: parsed.backfillPaginationToken ?? null,
    lastScannedCount: parsed.lastScannedCount,
  });

  const count = await prisma.ouroBurn.count();
  console.log(`\nDone. ${count} row(s) in ouro_burn table.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
