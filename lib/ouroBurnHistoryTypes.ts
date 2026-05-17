import { OUROBOROS_MINT } from "@/lib/constants";

export const OURO_MINT_STR = OUROBOROS_MINT.toBase58();
export const BURN_HISTORY_REFRESH_MS = 60 * 60 * 1000;
/** Token deploy — Mar 17, 2026 06:15:39 UTC */
export const OURO_DEPLOY_UNIX = Math.floor(
  new Date("2026-03-17T06:15:39Z").getTime() / 1000,
);

export type BurnPerformedBy = "agent" | "human";

/** Trash token → OURO buyback recorded from the incinerator app. */
export type OuroBurnExchange = {
  sourceMint: string;
  sourceSymbol?: string;
  sourceName?: string;
  sourceImage?: string;
  sourceUiAmount?: number;
  sourceBurnSignature?: string;
  swapSignature?: string;
};

export type OuroBurnEntry = {
  signature: string;
  timestamp: number | null;
  slot: number;
  /** OUROBOROS burned (UI units). */
  amountUi: number;
  burner: string | null;
  performedBy: BurnPerformedBy;
  exchange?: OuroBurnExchange;
};

export type RecordHumanExchangeInput = {
  signature: string;
  timestamp?: number | null;
  slot?: number;
  amountUi: number;
  burner: string;
  exchange: OuroBurnExchange;
};

export type OuroBurnHistoryStore = {
  lastFetchedAt: number;
  mint: string;
  entries: OuroBurnEntry[];
  /** Ascending backfill from deploy finished. */
  backfillComplete?: boolean;
  /** Resume token for chunked backfill (`slot:position`). */
  backfillPaginationToken?: string | null;
  /** Txs scanned in last backfill run (debug). */
  lastScannedCount?: number;
};

export function normalizeEntry(
  entry: OuroBurnEntry & { performedBy?: BurnPerformedBy },
): OuroBurnEntry {
  return {
    ...entry,
    performedBy: entry.performedBy ?? "human",
  };
}

/** Human app burns with source-token exchange metadata (for “devoured” UI). */
export function humanExchangeEntries(
  entries: OuroBurnEntry[],
  limit = 3,
): OuroBurnEntry[] {
  return entries
    .filter((e) => e.performedBy === "human" && e.exchange?.sourceMint)
    .slice(0, limit);
}
