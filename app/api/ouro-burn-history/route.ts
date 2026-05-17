import { NextResponse } from "next/server";
import {
  appendHumanExchangeEntry,
  BURN_HISTORY_REFRESH_MS,
  getHeliusApiKey,
  OURO_MINT_STR,
  readBurnHistoryStore,
  refreshBurnHistory,
  type OuroBurnExchange,
  type RecordHumanExchangeInput,
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
          maxChunks: 8,
          enrichExchanges: false,
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

function parseExchange(raw: unknown): OuroBurnExchange | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.sourceMint !== "string" || !o.sourceMint.trim()) return null;
  const exchange: OuroBurnExchange = { sourceMint: o.sourceMint.trim() };
  if (typeof o.sourceSymbol === "string" && o.sourceSymbol.trim()) {
    exchange.sourceSymbol = o.sourceSymbol.trim();
  }
  if (typeof o.sourceName === "string" && o.sourceName.trim()) {
    exchange.sourceName = o.sourceName.trim();
  }
  if (typeof o.sourceImage === "string" && o.sourceImage.trim()) {
    exchange.sourceImage = o.sourceImage.trim();
  }
  if (typeof o.sourceUiAmount === "number" && Number.isFinite(o.sourceUiAmount)) {
    exchange.sourceUiAmount = o.sourceUiAmount;
  }
  if (
    typeof o.sourceBurnSignature === "string" &&
    o.sourceBurnSignature.trim()
  ) {
    exchange.sourceBurnSignature = o.sourceBurnSignature.trim();
  }
  if (typeof o.swapSignature === "string" && o.swapSignature.trim()) {
    exchange.swapSignature = o.swapSignature.trim();
  }
  return exchange;
}

/** Record a human incinerator exchange (trash token → OURO buyback) in the JSON store. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  if (typeof o.signature !== "string" || !o.signature.trim()) {
    return NextResponse.json({ error: "signature is required" }, { status: 400 });
  }
  if (typeof o.burner !== "string" || !o.burner.trim()) {
    return NextResponse.json({ error: "burner is required" }, { status: 400 });
  }

  const exchange = parseExchange(o.exchange);
  if (!exchange) {
    return NextResponse.json(
      { error: "exchange.sourceMint is required" },
      { status: 400 },
    );
  }
  if (exchange.sourceMint === OURO_MINT_STR) {
    return NextResponse.json(
      { error: "exchange.sourceMint cannot be OUROBOROS" },
      { status: 400 },
    );
  }

  const amountUi =
    typeof o.amountUi === "number" && Number.isFinite(o.amountUi)
      ? Math.max(0, o.amountUi)
      : 0;

  const input: RecordHumanExchangeInput = {
    signature: o.signature.trim(),
    burner: o.burner.trim(),
    amountUi,
    exchange,
    timestamp:
      typeof o.timestamp === "number" && Number.isFinite(o.timestamp)
        ? o.timestamp
        : null,
    slot:
      typeof o.slot === "number" && Number.isFinite(o.slot) ? o.slot : 0,
  };

  try {
    const store = await appendHumanExchangeEntry(input);
    return NextResponse.json({
      ok: true,
      entryCount: store.entries.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "could not save exchange";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
