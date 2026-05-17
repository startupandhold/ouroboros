import { DEFAULT_RPC, WRAPPED_SOL_MINT } from "@/lib/constants";
import { fetchTokenMetaByMint } from "@/lib/tokenMetadata";
import {
  getHeliusApiKey,
  OURO_MINT_STR,
  type OuroBurnEntry,
  type OuroBurnExchange,
  type OuroBurnHistoryStore,
} from "@/lib/ouroBurnHistory";

const SKIP_SOURCE_MINTS = new Set([OURO_MINT_STR, WRAPPED_SOL_MINT]);
/** Max seconds between trash burn / swap and the OURO burn tx. */
const EXCHANGE_WINDOW_SEC = 180;
const MAX_NEIGHBOR_TXS = 12;
const PARSE_BATCH = 8;
const PARSE_DELAY_MS = 350;
const WALLET_SIG_LIMIT = 40;

type WalletSig = {
  signature: string;
  blockTime: number | null;
  slot: number;
};

type HeliusEnhancedTx = {
  signature: string;
  timestamp?: number | null;
  transactionError?: unknown;
  accountData?: {
    tokenBalanceChanges?: {
      mint?: string;
      userAccount?: string;
      rawTokenAmount?: { tokenAmount?: string; decimals?: number };
    }[];
  }[];
};

function getRpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL?.trim() ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ??
    DEFAULT_RPC
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWalletSignatures(wallet: string): Promise<WalletSig[]> {
  const res = await fetch(getRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [wallet, { limit: WALLET_SIG_LIMIT }],
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC wallet signatures ${res.status}`);
  const json = (await res.json()) as {
    result?: {
      signature: string;
      blockTime?: number | null;
      slot: number;
    }[];
    error?: { message: string };
  };
  if (json.error) throw new Error(json.error.message);
  return (json.result ?? []).map((r) => ({
    signature: r.signature,
    blockTime: r.blockTime ?? null,
    slot: r.slot,
  }));
}

async function heliusParseBatch(
  apiKey: string,
  signatures: string[],
): Promise<HeliusEnhancedTx[]> {
  if (signatures.length === 0) return [];
  const res = await fetch(
    `https://api.helius.xyz/v0/transactions?api-key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ transactions: signatures }),
      cache: "no-store",
    },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as HeliusEnhancedTx[];
  return Array.isArray(data) ? data : [];
}

function sourceBurnFromTx(
  tx: HeliusEnhancedTx,
  wallet: string,
): { mint: string; uiAmount: number } | null {
  let best: { mint: string; raw: bigint; decimals: number } | null = null;

  for (const ad of tx.accountData ?? []) {
    for (const ch of ad.tokenBalanceChanges ?? []) {
      const mint = ch.mint;
      if (!mint || SKIP_SOURCE_MINTS.has(mint)) continue;
      if (ch.userAccount !== wallet) continue;
      const raw = BigInt(ch.rawTokenAmount?.tokenAmount ?? "0");
      if (raw >= BigInt(0)) continue;
      const burned = -raw;
      const decimals = ch.rawTokenAmount?.decimals ?? 6;
      if (!best || burned > best.raw) {
        best = { mint, raw: burned, decimals };
      }
    }
  }

  if (!best) return null;
  return {
    mint: best.mint,
    uiAmount: Number(best.raw) / 10 ** best.decimals,
  };
}

function ouroReceivedByWallet(tx: HeliusEnhancedTx, wallet: string): boolean {
  for (const ad of tx.accountData ?? []) {
    for (const ch of ad.tokenBalanceChanges ?? []) {
      if (ch.mint !== OURO_MINT_STR || ch.userAccount !== wallet) continue;
      const raw = BigInt(ch.rawTokenAmount?.tokenAmount ?? "0");
      if (raw > BigInt(0)) return true;
    }
  }
  return false;
}

function inferExchangeFromNeighbors(
  entry: OuroBurnEntry,
  walletSigs: WalletSig[],
  parsed: Map<string, HeliusEnhancedTx>,
): OuroBurnExchange | null {
  const wallet = entry.burner;
  if (!wallet) return null;

  const burnIdx = walletSigs.findIndex((s) => s.signature === entry.signature);
  if (burnIdx < 0) return null;

  const burnTime = entry.timestamp ?? walletSigs[burnIdx]?.blockTime ?? null;
  if (burnTime == null) return null;

  let bestSource: {
    mint: string;
    uiAmount: number;
    signature: string;
  } | null = null;
  let swapSignature: string | undefined;

  for (let i = burnIdx + 1; i < walletSigs.length && i <= burnIdx + MAX_NEIGHBOR_TXS; i++) {
    const neighbor = walletSigs[i]!;
    const neighborTime = neighbor.blockTime;
    if (neighborTime != null && neighborTime > burnTime) continue;
    if (neighborTime != null && burnTime - neighborTime > EXCHANGE_WINDOW_SEC) break;

    const tx = parsed.get(neighbor.signature);
    if (!tx || tx.transactionError) continue;

    if (ouroReceivedByWallet(tx, wallet) && !swapSignature) {
      swapSignature = neighbor.signature;
    }

    const source = sourceBurnFromTx(tx, wallet);
    if (!source) continue;
    if (!bestSource || source.uiAmount > bestSource.uiAmount) {
      bestSource = {
        mint: source.mint,
        uiAmount: source.uiAmount,
        signature: neighbor.signature,
      };
    }
  }

  if (!bestSource) return null;

  return {
    sourceMint: bestSource.mint,
    sourceUiAmount: bestSource.uiAmount,
    sourceBurnSignature: bestSource.signature,
    swapSignature,
  };
}

async function attachTokenLabels(
  exchange: OuroBurnExchange,
): Promise<OuroBurnExchange> {
  if (exchange.sourceSymbol && exchange.sourceName) return exchange;
  const meta = await fetchTokenMetaByMint(exchange.sourceMint, null);
  return {
    ...exchange,
    sourceSymbol: exchange.sourceSymbol ?? meta.symbol,
    sourceName: exchange.sourceName ?? meta.name,
    sourceImage: exchange.sourceImage ?? meta.image,
  };
}

export type EnrichExchangeOptions = {
  onProgress?: (msg: string) => void;
  /** Cap how many human burns to scan per run (0 = all). */
  maxEntries?: number;
};

/**
 * For human OURO burns missing `exchange`, walk the burner's recent wallet txs
 * (SI trash burn + optional Jupiter buyback before the OURO burn).
 */
export async function enrichHumanExchangeMetadata(
  store: OuroBurnHistoryStore,
  options: EnrichExchangeOptions = {},
): Promise<OuroBurnHistoryStore> {
  const { onProgress, maxEntries = 0 } = options;
  const log = (msg: string) => onProgress?.(msg);

  const apiKey = getHeliusApiKey();
  if (!apiKey) {
    log("exchange enrich skipped — no Helius API key");
    return store;
  }

  const needs = store.entries.filter(
    (e) => e.performedBy === "human" && !e.exchange?.sourceMint && e.burner,
  );
  if (needs.length === 0) {
    log("exchange enrich: all human entries already have exchange metadata");
    return store;
  }

  const toProcess = maxEntries > 0 ? needs.slice(0, maxEntries) : needs;
  log(
    `exchange enrich: inferring trash→OURO for ${toProcess.length} human burn(s)…`,
  );

  const byWallet = new Map<string, OuroBurnEntry[]>();
  for (const e of toProcess) {
    const w = e.burner!;
    const list = byWallet.get(w) ?? [];
    list.push(e);
    byWallet.set(w, list);
  }

  const enrichedBySig = new Map<string, OuroBurnExchange>();
  const sigsToParse = new Set<string>();
  const walletSigsCache = new Map<string, WalletSig[]>();

  for (const [wallet] of byWallet) {
    try {
      walletSigsCache.set(wallet, await fetchWalletSignatures(wallet));
    } catch (e) {
      log(
        `exchange enrich: wallet ${wallet.slice(0, 8)}… sig fetch failed — ${e instanceof Error ? e.message : "error"}`,
      );
    }
  }

  for (const [wallet, entries] of byWallet) {
    const walletSigs = walletSigsCache.get(wallet);
    if (!walletSigs) continue;

    for (const entry of entries) {
      const burnIdx = walletSigs.findIndex((s) => s.signature === entry.signature);
      if (burnIdx < 0) continue;
      for (
        let i = burnIdx + 1;
        i < walletSigs.length && i <= burnIdx + MAX_NEIGHBOR_TXS;
        i++
      ) {
        sigsToParse.add(walletSigs[i]!.signature);
      }
    }
  }

  const parsed = new Map<string, HeliusEnhancedTx>();
  const sigList = [...sigsToParse];
  for (let i = 0; i < sigList.length; i += PARSE_BATCH) {
    if (i > 0) await sleep(PARSE_DELAY_MS);
    const batch = sigList.slice(i, i + PARSE_BATCH);
    const txs = await heliusParseBatch(apiKey, batch);
    for (const tx of txs) {
      if (tx.signature) parsed.set(tx.signature, tx);
    }
  }

  for (const [wallet, entries] of byWallet) {
    const walletSigs = walletSigsCache.get(wallet);
    if (!walletSigs) continue;

    for (const entry of entries) {
      const exchange = inferExchangeFromNeighbors(entry, walletSigs, parsed);
      if (exchange) enrichedBySig.set(entry.signature, exchange);
    }
  }

  if (enrichedBySig.size === 0) {
    log("exchange enrich: no trash-token exchanges inferred (direct OURO burns?)");
    return store;
  }

  log(`exchange enrich: resolved ${enrichedBySig.size} exchange(s), fetching token labels…`);

  const entries: OuroBurnEntry[] = [];
  for (const e of store.entries) {
    const raw = enrichedBySig.get(e.signature);
    if (!raw) {
      entries.push(e);
      continue;
    }
    const exchange = await attachTokenLabels(raw);
    entries.push({ ...e, exchange: e.exchange ?? exchange });
  }

  log(`exchange enrich: updated ${enrichedBySig.size} entry/entries`);
  return { ...store, entries };
}
