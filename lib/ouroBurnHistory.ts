import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_RPC, OUROBOROS_MINT } from "@/lib/constants";

export const OURO_MINT_STR = OUROBOROS_MINT.toBase58();
export const BURN_HISTORY_REFRESH_MS = 60 * 60 * 1000;
/** Token deploy — Mar 17, 2026 06:15:39 UTC */
export const OURO_DEPLOY_UNIX = Math.floor(
  new Date("2026-03-17T06:15:39Z").getTime() / 1000,
);

export const BURN_HISTORY_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "ouro-burn-history.json",
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

type ParsedIx = {
  programId?: string;
  program?: string;
  parsed?: {
    type?: string;
    info?: {
      mint?: string;
      authority?: string;
      account?: string;
    };
  };
};

type TokenBalance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
};

type GtfaFullItem = {
  slot: number;
  blockTime: number | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: Array<string | { pubkey: string }>;
      instructions: ParsedIx[];
    };
  };
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    innerInstructions?: { instructions: ParsedIx[] }[];
  };
};

type GtfaResult = {
  data: GtfaFullItem[];
  paginationToken: string | null;
};

const DEFAULT_STORE: OuroBurnHistoryStore = {
  lastFetchedAt: 0,
  mint: OURO_MINT_STR,
  entries: [],
  backfillComplete: false,
  backfillPaginationToken: null,
};

const PUMP_GLOBAL_ACCOUNT = "3GW168i3HxSno6pu2wkJipC5NB3Hb1rVnMgVPqWkpGWt";
export const AGENT_PROGRAM_ID =
  "AgenTMiC2hvxGebTsgmsD4HHBa8WEcqGFf87iwRRxLo7";

const CHUNK_LIMIT = 200;
const CHUNK_DELAY_MS = 400;
const HELIUS_PARSE_BATCH = 8;
const HELIUS_PARSE_DELAY_MS = 350;

function getRpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL?.trim() ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ??
    DEFAULT_RPC
  );
}

export function getHeliusApiKey(): string | null {
  const server = process.env.HELIUS_API_KEY?.trim();
  if (server) return server;

  const pub = process.env.NEXT_PUBLIC_HELIUS_API_KEY?.trim();
  if (pub) return pub;

  const rpc = getRpcUrl();
  if (rpc.includes("helius")) {
    try {
      return new URL(rpc).searchParams.get("api-key");
    } catch {
      /* invalid */
    }
  }
  return null;
}

function getHeliusRpcUrl(): string | null {
  const key = getHeliusApiKey();
  if (!key) return null;
  return `https://mainnet.helius-rpc.com/?api-key=${key}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePubkey(key: string | { pubkey: string }): string {
  return typeof key === "string" ? key : key.pubkey;
}

export function normalizeEntry(
  entry: OuroBurnEntry & { performedBy?: BurnPerformedBy },
): OuroBurnEntry {
  return {
    ...entry,
    performedBy: entry.performedBy ?? "human",
  };
}

export async function readBurnHistoryStore(): Promise<OuroBurnHistoryStore> {
  try {
    const raw = await fs.readFile(BURN_HISTORY_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as OuroBurnHistoryStore;
    if (parsed?.mint === OURO_MINT_STR && Array.isArray(parsed.entries)) {
      return {
        ...DEFAULT_STORE,
        ...parsed,
        entries: parsed.entries.map(normalizeEntry),
      };
    }
  } catch {
    /* missing */
  }
  return { ...DEFAULT_STORE };
}

export async function writeBurnHistoryStore(
  store: OuroBurnHistoryStore,
): Promise<void> {
  await fs.mkdir(path.dirname(BURN_HISTORY_STORE_PATH), { recursive: true });
  await fs.writeFile(
    BURN_HISTORY_STORE_PATH,
    `${JSON.stringify(store, null, 2)}\n`,
    "utf8",
  );
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

export async function appendHumanExchangeEntry(
  input: RecordHumanExchangeInput,
): Promise<OuroBurnHistoryStore> {
  const store = await readBurnHistoryStore();
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

  const merged = mergeEntries(store.entries, [incoming]);
  const next: OuroBurnHistoryStore = { ...store, entries: merged };
  await writeBurnHistoryStore(next);
  return next;
}

function usesAgentProgram(item: GtfaFullItem): boolean {
  const keys = item.transaction.message.accountKeys.map(resolvePubkey);
  if (keys.includes(AGENT_PROGRAM_ID)) return true;

  const checkIx = (ix: ParsedIx) => {
    const pid = ix.programId ?? ix.program;
    return pid === AGENT_PROGRAM_ID;
  };

  if (item.transaction.message.instructions.some(checkIx)) return true;
  for (const inner of item.meta.innerInstructions ?? []) {
    if (inner.instructions.some(checkIx)) return true;
  }
  return false;
}

function findBurnAuthority(item: GtfaFullItem): string | null {
  const check = (ix: ParsedIx) => {
    const t = ix.parsed?.type;
    if (t !== "burn" && t !== "burnChecked") return null;
    if (ix.parsed?.info?.mint !== OURO_MINT_STR) return null;
    return ix.parsed.info.authority ?? null;
  };

  for (const ix of item.transaction.message.instructions) {
    const a = check(ix);
    if (a) return a;
  }
  for (const inner of item.meta.innerInstructions ?? []) {
    for (const ix of inner.instructions) {
      const a = check(ix);
      if (a) return a;
    }
  }
  return null;
}

function ouroSupplyDeltaFromMeta(item: GtfaFullItem): {
  netRaw: bigint;
  decimals: number;
  burner: string | null;
} {
  const byIndex = new Map<
    number,
    { pre: bigint; post: bigint; owner?: string; decimals: number }
  >();

  for (const b of item.meta.preTokenBalances ?? []) {
    if (b.mint !== OURO_MINT_STR) continue;
    byIndex.set(b.accountIndex, {
      pre: BigInt(b.uiTokenAmount.amount),
      post: BigInt(0),
      owner: b.owner,
      decimals: b.uiTokenAmount.decimals,
    });
  }
  for (const b of item.meta.postTokenBalances ?? []) {
    if (b.mint !== OURO_MINT_STR) continue;
    const cur = byIndex.get(b.accountIndex) ?? {
      pre: BigInt(0),
      post: BigInt(0),
      decimals: b.uiTokenAmount.decimals,
    };
    cur.post = BigInt(b.uiTokenAmount.amount);
    cur.owner = b.owner ?? cur.owner;
    cur.decimals = b.uiTokenAmount.decimals;
    byIndex.set(b.accountIndex, cur);
  }

  let netRaw = BigInt(0);
  let decimals = 6;
  let burner: string | null = null;

  for (const bal of byIndex.values()) {
    const delta = bal.post - bal.pre;
    netRaw += delta;
    decimals = bal.decimals;
    if (delta < BigInt(0) && bal.owner && bal.owner !== PUMP_GLOBAL_ACCOUNT) {
      burner = bal.owner;
    }
  }

  return { netRaw, decimals, burner };
}

function entryFromGtfaItem(item: GtfaFullItem): OuroBurnEntry | null {
  if (item.meta?.err) return null;

  const signature = item.transaction.signatures[0];
  if (!signature) return null;

  const { netRaw, decimals, burner: metaBurner } = ouroSupplyDeltaFromMeta(item);
  if (netRaw >= BigInt(0)) return null;

  const burnedRaw = -netRaw;
  const amountUi = Number(burnedRaw) / 10 ** decimals;
  if (amountUi <= 0) return null;

  const authority = findBurnAuthority(item);
  const feePayer = item.transaction.message.accountKeys[0]
    ? resolvePubkey(item.transaction.message.accountKeys[0])
    : null;

  return {
    signature,
    timestamp: item.blockTime,
    slot: item.slot,
    amountUi,
    burner: metaBurner ?? authority ?? feePayer,
    performedBy: usesAgentProgram(item) ? "agent" : "human",
  };
}

class HeliusPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HeliusPlanError";
  }
}

function isHeliusPlanError(e: unknown): boolean {
  return (
    e instanceof HeliusPlanError ||
    (e instanceof Error &&
      (/paid plan/i.test(e.message) || /-32403/.test(e.message)))
  );
}

async function heliusRpc<T>(method: string, params: unknown[]): Promise<T> {
  const rpc = getHeliusRpcUrl();
  if (!rpc) throw new Error("Helius API key required");

  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Helius RPC ${res.status}`);
  const json = (await res.json()) as {
    result?: T;
    error?: { code?: number; message?: string };
  };

  if (json.error) {
    const msg = json.error.message ?? "Helius RPC error";
    if (json.error.code === -32403 || /paid plan/i.test(msg)) {
      throw new HeliusPlanError(msg);
    }
    throw new Error(msg);
  }

  return json.result as T;
}

/** Helius-exclusive: full parsed txs in chunks. */
async function fetchGtfaChunk(options: {
  sortOrder: "asc" | "desc";
  paginationToken?: string | null;
  limit?: number;
}): Promise<GtfaResult> {
  const params: Record<string, unknown> = {
    transactionDetails: "full",
    encoding: "jsonParsed",
    maxSupportedTransactionVersion: 0,
    sortOrder: options.sortOrder,
    limit: options.limit ?? CHUNK_LIMIT,
    filters: {
      status: "succeeded",
      blockTime: { gte: OURO_DEPLOY_UNIX },
    },
  };
  if (options.paginationToken) {
    params.paginationToken = options.paginationToken;
  }

  return heliusRpc<GtfaResult>("getTransactionsForAddress", [
    OURO_MINT_STR,
    params,
  ]);
}

/** Fallback when getTransactionsForAddress is unavailable. */
async function fetchSignatureChunk(before?: string): Promise<
  { signature: string; blockTime: number | null; slot: number }[]
> {
  const rpc = getRpcUrl();
  const config: { limit: number; before?: string } = { limit: 1000 };
  if (before) config.before = before;

  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [OURO_MINT_STR, config],
    }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`RPC signatures ${res.status}`);
  const json = (await res.json()) as {
    result?: {
      signature: string;
      blockTime?: number | null;
      slot: number;
    }[];
    error?: { message: string };
  };
  if (json.error) throw new Error(json.error.message);

  return (json.result ?? [])
    .filter((r) => (r.blockTime ?? 0) >= OURO_DEPLOY_UNIX)
    .map((r) => ({
      signature: r.signature,
      blockTime: r.blockTime ?? null,
      slot: r.slot,
    }));
}

type HeliusEnhancedTx = {
  signature: string;
  slot: number;
  timestamp?: number | null;
  feePayer?: string;
  type?: string;
  transactionError?: unknown;
  tokenTransfers?: {
    mint?: string;
    fromUserAccount?: string | null;
    toUserAccount?: string | null;
  }[];
  accountData?: {
    tokenBalanceChanges?: {
      mint?: string;
      userAccount?: string;
      rawTokenAmount?: { tokenAmount?: string; decimals?: number };
    }[];
  }[];
  instructions?: { programId?: string }[];
};

async function heliusParseBatch(
  apiKey: string,
  signatures: string[],
): Promise<HeliusEnhancedTx[]> {
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

  if (res.status === 429) return [];
  if (!res.ok) return [];

  const data = (await res.json()) as HeliusEnhancedTx[];
  return Array.isArray(data) ? data : [];
}

function entryFromEnhanced(tx: HeliusEnhancedTx): OuroBurnEntry | null {
  if (tx.transactionError) return null;

  let netRaw = BigInt(0);
  let decimals = 6;
  const negativeWallets: string[] = [];

  for (const ad of tx.accountData ?? []) {
    for (const ch of ad.tokenBalanceChanges ?? []) {
      if (ch.mint !== OURO_MINT_STR) continue;
      const raw = BigInt(ch.rawTokenAmount?.tokenAmount ?? "0");
      decimals = ch.rawTokenAmount?.decimals ?? decimals;
      netRaw += raw;
      if (raw < BigInt(0) && ch.userAccount) negativeWallets.push(ch.userAccount);
    }
  }

  if (netRaw >= BigInt(0) && tx.type !== "BURN") return null;

  const burnedRaw = netRaw < BigInt(0) ? -netRaw : BigInt(0);
  if (burnedRaw === BigInt(0)) return null;

  const amountUi = Number(burnedRaw) / 10 ** decimals;
  if (amountUi <= 0) return null;

  let burner: string | null = null;
  for (const w of negativeWallets) {
    if (w !== PUMP_GLOBAL_ACCOUNT) {
      burner = w;
      break;
    }
  }
  if (!burner) {
    for (const t of tx.tokenTransfers ?? []) {
      if (t.mint === OURO_MINT_STR && t.toUserAccount) {
        burner = t.toUserAccount;
        break;
      }
    }
  }

  return {
    signature: tx.signature,
    timestamp: tx.timestamp ?? null,
    slot: tx.slot,
    amountUi,
    burner: burner ?? tx.feePayer ?? null,
    performedBy: (tx.instructions ?? []).some(
      (ix) => ix.programId === AGENT_PROGRAM_ID,
    )
      ? "agent"
      : "human",
  };
}

function mergeEntries(
  existing: OuroBurnEntry[],
  incoming: OuroBurnEntry[],
): OuroBurnEntry[] {
  const bySig = new Map<string, OuroBurnEntry>();
  for (const e of [...existing, ...incoming]) {
    const prev = bySig.get(e.signature);
    if (!prev) {
      bySig.set(e.signature, e);
      continue;
    }
    bySig.set(e.signature, {
      ...prev,
      amountUi: Math.max(prev.amountUi, e.amountUi),
      timestamp: prev.timestamp ?? e.timestamp,
      burner: prev.burner ?? e.burner,
      performedBy: e.performedBy ?? prev.performedBy,
      exchange: prev.exchange ?? e.exchange,
    });
  }
  return [...bySig.values()].sort((a, b) => {
    const ta = a.timestamp ?? 0;
    const tb = b.timestamp ?? 0;
    if (tb !== ta) return tb - ta;
    return b.slot - a.slot;
  });
}

function processGtfaPage(
  items: GtfaFullItem[],
  known: Set<string>,
): OuroBurnEntry[] {
  const fresh: OuroBurnEntry[] = [];
  for (const item of items) {
    const sig = item.transaction.signatures[0];
    if (!sig || known.has(sig)) continue;
    const entry = entryFromGtfaItem(item);
    if (entry) {
      fresh.push(entry);
      known.add(sig);
    }
  }
  return fresh;
}

export type RefreshBurnHistoryOptions = {
  force?: boolean;
  /** `backfill` walks history from deploy; `incremental` fetches newest only. */
  mode?: "backfill" | "incremental";
  /** Max chunks per run (backfill ignores when resuming until complete). */
  maxChunks?: number;
  /** Infer trash→OURO exchange metadata for human burns (needs Helius). */
  enrichExchanges?: boolean;
  /** Cap exchange enrich per run (0 = all missing). */
  enrichMaxEntries?: number;
  onProgress?: (msg: string) => void;
};

async function syncChunkViaSignatures(
  apiKey: string,
  known: Set<string>,
  before?: string,
): Promise<{
  burns: OuroBurnEntry[];
  scanned: number;
  nextBefore: string | null;
  reachedDeploy: boolean;
}> {
  const sigs = await fetchSignatureChunk(before);
  if (sigs.length === 0) {
    return { burns: [], scanned: 0, nextBefore: null, reachedDeploy: true };
  }

  const burns: OuroBurnEntry[] = [];
  const unknown = sigs.map((s) => s.signature).filter((sig) => !known.has(sig));

  for (let i = 0; i < unknown.length; i += HELIUS_PARSE_BATCH) {
    if (i > 0) await sleep(HELIUS_PARSE_DELAY_MS);
    const batch = unknown.slice(i, i + HELIUS_PARSE_BATCH);
    const parsed = await heliusParseBatch(apiKey, batch);
    for (const tx of parsed) {
      if (!tx?.signature || known.has(tx.signature)) continue;
      const entry = entryFromEnhanced(tx);
      if (entry) {
        burns.push(entry);
        known.add(entry.signature);
      }
    }
  }

  const oldest = sigs[sigs.length - 1];
  const oldestTime = oldest?.blockTime ?? 0;
  const reachedDeploy = sigs.length < 1000 || oldestTime <= OURO_DEPLOY_UNIX;

  return {
    burns,
    scanned: sigs.length,
    nextBefore: oldest?.signature ?? null,
    reachedDeploy,
  };
}

export async function refreshBurnHistory(
  options: RefreshBurnHistoryOptions = {},
): Promise<OuroBurnHistoryStore> {
  const {
    force = false,
    mode = "incremental",
    maxChunks = mode === "backfill" ? 500 : 3,
    enrichExchanges = true,
    enrichMaxEntries = 0,
    onProgress,
  } = options;

  const log = (msg: string) => {
    onProgress?.(msg);
  };

  let store = await readBurnHistoryStore();
  const stale =
    force || Date.now() - store.lastFetchedAt >= BURN_HISTORY_REFRESH_MS;
  if (!stale && mode === "incremental") return store;

  /** After historical backfill, `mode: "backfill"` must still fetch new head txs. */
  const effectiveMode: "backfill" | "incremental" =
    mode === "backfill" && store.backfillComplete ? "incremental" : mode;

  const apiKey = getHeliusApiKey();
  if (!apiKey) {
    log("no Helius API key — skip sync");
    return store;
  }

  if (mode === "backfill" && store.backfillComplete) {
    log("backfill already complete — syncing newest burns");
  }

  const known = new Set(store.entries.map((e) => e.signature));
  let allEntries = [...store.entries];
  let scanned = 0;
  let chunks = 0;
  let emptyIncrementalChunks = 0;
  let gtfaToken =
    effectiveMode === "backfill" &&
    store.backfillPaginationToken?.includes(":")
      ? store.backfillPaginationToken
      : null;
  let sigBefore =
    effectiveMode === "backfill" &&
    store.backfillPaginationToken &&
    !gtfaToken
      ? store.backfillPaginationToken
      : undefined;
  let backfillComplete = store.backfillComplete ?? false;
  let useGtfa = true;
  let gtfaWarned = false;

  while (chunks < maxChunks) {
    if (effectiveMode === "backfill" && backfillComplete) break;

    let pageBurns: OuroBurnEntry[] = [];
    let chunkScanned = 0;

    if (useGtfa) {
      try {
        const page = await fetchGtfaChunk({
          sortOrder: effectiveMode === "backfill" ? "asc" : "desc",
          paginationToken: gtfaToken,
          limit: CHUNK_LIMIT,
        });
        chunkScanned = page.data.length;
        pageBurns = processGtfaPage(page.data, known);
        gtfaToken = page.paginationToken;

        if (effectiveMode === "backfill" && !gtfaToken) backfillComplete = true;
        if (effectiveMode === "incremental" && page.data.length === 0) break;
      } catch (e) {
        if (!isHeliusPlanError(e)) throw e;
        useGtfa = false;
        if (!gtfaWarned) {
          gtfaWarned = true;
          log(
            "getTransactionsForAddress unavailable (Helius paid plan) — using signature + enhanced parse fallback",
          );
        }
        const sigResult = await syncChunkViaSignatures(apiKey, known, sigBefore);
        pageBurns = sigResult.burns;
        chunkScanned = sigResult.scanned;
        sigBefore = sigResult.nextBefore ?? undefined;
        if (effectiveMode === "backfill" && sigResult.reachedDeploy) {
          backfillComplete = true;
        }
      }
    } else {
      const sigResult = await syncChunkViaSignatures(apiKey, known, sigBefore);
      pageBurns = sigResult.burns;
      chunkScanned = sigResult.scanned;
      sigBefore = sigResult.nextBefore ?? undefined;
      if (effectiveMode === "backfill" && sigResult.reachedDeploy) {
        backfillComplete = true;
      }
    }

    scanned += chunkScanned;
    allEntries = mergeEntries(allEntries, pageBurns);
    chunks += 1;

    const cursor = useGtfa ? gtfaToken : sigBefore;
    log(
      `chunk ${chunks}: scanned ${chunkScanned} txs, +${pageBurns.length} burns (total ${allEntries.length})${backfillComplete ? " — backfill done" : ""}`,
    );

    if (effectiveMode === "incremental") {
      if (pageBurns.length === 0) {
        emptyIncrementalChunks += 1;
      } else {
        emptyIncrementalChunks = 0;
      }
      if (emptyIncrementalChunks >= 3) break;
      if (!cursor && chunkScanned === 0) break;
    }

    if (effectiveMode === "backfill" && backfillComplete) break;

    const checkpoint: OuroBurnHistoryStore = {
      mint: OURO_MINT_STR,
      lastFetchedAt: Date.now(),
      entries: allEntries,
      backfillComplete,
      backfillPaginationToken: backfillComplete
        ? null
        : useGtfa
          ? gtfaToken
          : (sigBefore ?? null),
      lastScannedCount: scanned,
    };
    await writeBurnHistoryStore(checkpoint);

    await sleep(CHUNK_DELAY_MS);
  }

  let next: OuroBurnHistoryStore = {
    mint: OURO_MINT_STR,
    lastFetchedAt: Date.now(),
    entries: allEntries,
    backfillComplete,
    backfillPaginationToken: backfillComplete
      ? null
      : useGtfa
        ? gtfaToken
        : (sigBefore ?? null),
    lastScannedCount: scanned,
  };

  if (enrichExchanges && apiKey) {
    const { enrichHumanExchangeMetadata } = await import("@/lib/ouroExchangeEnrich");
    next = await enrichHumanExchangeMetadata(next, {
      onProgress: log,
      maxEntries: enrichMaxEntries,
    });
  }

  await writeBurnHistoryStore(next);
  return next;
}

export async function refreshBurnHistoryIfStale(
  force = false,
): Promise<OuroBurnHistoryStore> {
  const store = await readBurnHistoryStore();
  if (!store.backfillComplete) {
    return refreshBurnHistory({
      force: true,
      mode: "backfill",
      maxChunks: force ? 500 : 15,
    });
  }
  return refreshBurnHistory({ force, mode: "incremental", maxChunks: 8 });
}
