import type { BurnPerformedBy, OuroBurn } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  OURO_MINT_STR,
  normalizeEntry,
  type OuroBurnEntry,
  type OuroBurnExchange,
  type OuroBurnHistoryStore,
  type RecordHumanExchangeInput,
} from "@/lib/ouroBurnHistoryTypes";

const SYNC_STATE_ID = "default";

const DEFAULT_STORE: OuroBurnHistoryStore = {
  lastFetchedAt: 0,
  mint: OURO_MINT_STR,
  entries: [],
  backfillComplete: false,
  backfillPaginationToken: null,
};

function exchangeFromRow(row: OuroBurn): OuroBurnExchange | undefined {
  if (!row.sourceMint) return undefined;
  return {
    sourceMint: row.sourceMint,
    sourceSymbol: row.sourceSymbol ?? undefined,
    sourceName: row.sourceName ?? undefined,
    sourceImage: row.sourceImage ?? undefined,
    sourceUiAmount: row.sourceUiAmount ?? undefined,
    sourceBurnSignature: row.sourceBurnSignature ?? undefined,
    swapSignature: row.swapSignature ?? undefined,
  };
}

function rowToEntry(row: OuroBurn): OuroBurnEntry {
  return normalizeEntry({
    signature: row.signature,
    timestamp: row.timestamp,
    slot: row.slot,
    amountUi: row.amountUi,
    burner: row.burner,
    performedBy: row.performedBy as BurnPerformedBy,
    exchange: exchangeFromRow(row),
  });
}

async function readSyncState() {
  return prisma.burnHistorySyncState.findUnique({
    where: { id: SYNC_STATE_ID },
  });
}

export async function readBurnHistoryStore(): Promise<OuroBurnHistoryStore> {
  const [rows, sync] = await Promise.all([
    prisma.ouroBurn.findMany({
      orderBy: [{ timestamp: "desc" }, { slot: "desc" }],
    }),
    readSyncState(),
  ]);

  if (!sync) {
    return {
      ...DEFAULT_STORE,
      entries: rows.map(rowToEntry),
    };
  }

  return {
    mint: sync.mint,
    lastFetchedAt: Number(sync.lastFetchedAt),
    backfillComplete: sync.backfillComplete,
    backfillPaginationToken: sync.backfillPaginationToken,
    lastScannedCount: sync.lastScannedCount ?? undefined,
    entries: rows.map(rowToEntry),
  };
}

/** Upsert entries without wiping rows missing from this batch. */
export async function upsertBurnEntries(entries: OuroBurnEntry[]): Promise<void> {
  if (entries.length === 0) return;

  await prisma.$transaction(
    entries.map((entry) => {
      const ex = entry.exchange;
      return prisma.ouroBurn.upsert({
        where: { signature: entry.signature },
        create: {
          signature: entry.signature,
          timestamp: entry.timestamp,
          slot: entry.slot,
          amountUi: entry.amountUi,
          burner: entry.burner,
          performedBy: entry.performedBy,
          sourceMint: ex?.sourceMint ?? null,
          sourceSymbol: ex?.sourceSymbol ?? null,
          sourceName: ex?.sourceName ?? null,
          sourceImage: ex?.sourceImage ?? null,
          sourceUiAmount: ex?.sourceUiAmount ?? null,
          sourceBurnSignature: ex?.sourceBurnSignature ?? null,
          swapSignature: ex?.swapSignature ?? null,
        },
        update: {
          timestamp: entry.timestamp,
          slot: entry.slot,
          amountUi: entry.amountUi,
          burner: entry.burner,
          performedBy: entry.performedBy,
        },
      });
    }),
  );
}

export async function updateSyncState(
  patch: Pick<
    OuroBurnHistoryStore,
    | "mint"
    | "lastFetchedAt"
    | "backfillComplete"
    | "backfillPaginationToken"
    | "lastScannedCount"
  >,
): Promise<void> {
  await prisma.burnHistorySyncState.upsert({
    where: { id: SYNC_STATE_ID },
    create: {
      id: SYNC_STATE_ID,
      mint: patch.mint,
      lastFetchedAt: BigInt(patch.lastFetchedAt),
      backfillComplete: patch.backfillComplete ?? false,
      backfillPaginationToken: patch.backfillPaginationToken ?? null,
      lastScannedCount: patch.lastScannedCount ?? null,
    },
    update: {
      mint: patch.mint,
      lastFetchedAt: BigInt(patch.lastFetchedAt),
      backfillComplete: patch.backfillComplete ?? false,
      backfillPaginationToken: patch.backfillPaginationToken ?? null,
      lastScannedCount: patch.lastScannedCount ?? null,
    },
  });
}

export async function appendHumanExchangeEntry(
  input: RecordHumanExchangeInput,
): Promise<OuroBurnHistoryStore> {
  const incoming = normalizeEntry({
    signature: input.signature.trim(),
    timestamp: input.timestamp ?? Math.floor(Date.now() / 1000),
    slot: input.slot ?? 0,
    amountUi: input.amountUi,
    burner: input.burner.trim(),
    performedBy: "human",
    exchange: {
      sourceMint: input.exchange.sourceMint.trim(),
      sourceSymbol: input.exchange.sourceSymbol?.trim() || undefined,
      sourceName: input.exchange.sourceName?.trim() || undefined,
      sourceImage: input.exchange.sourceImage?.trim() || undefined,
      sourceUiAmount: input.exchange.sourceUiAmount,
      sourceBurnSignature: input.exchange.sourceBurnSignature?.trim(),
      swapSignature: input.exchange.swapSignature?.trim(),
    },
  });

  if (incoming.exchange?.sourceMint === OURO_MINT_STR) {
    throw new Error("exchange sourceMint cannot be OUROBOROS");
  }

  const ex = incoming.exchange!;
  await prisma.ouroBurn.upsert({
    where: { signature: incoming.signature },
    create: {
      signature: incoming.signature,
      timestamp: incoming.timestamp,
      slot: incoming.slot,
      amountUi: incoming.amountUi,
      burner: incoming.burner,
      performedBy: "human",
      sourceMint: ex.sourceMint,
      sourceSymbol: ex.sourceSymbol ?? null,
      sourceName: ex.sourceName ?? null,
      sourceImage: ex.sourceImage ?? null,
      sourceUiAmount: ex.sourceUiAmount ?? null,
      sourceBurnSignature: ex.sourceBurnSignature ?? null,
      swapSignature: ex.swapSignature ?? null,
    },
    update: {
      timestamp: incoming.timestamp,
      slot: incoming.slot,
      amountUi: incoming.amountUi,
      burner: incoming.burner,
      performedBy: "human",
      sourceMint: ex.sourceMint,
      sourceSymbol: ex.sourceSymbol ?? null,
      sourceName: ex.sourceName ?? null,
      sourceImage: ex.sourceImage ?? null,
      sourceUiAmount: ex.sourceUiAmount ?? null,
      sourceBurnSignature: ex.sourceBurnSignature ?? null,
      swapSignature: ex.swapSignature ?? null,
    },
  });

  return readBurnHistoryStore();
}
