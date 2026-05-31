"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  createBurnInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getHeliusRpcUrl,
  JUPITER_QUOTE,
  JUPITER_SWAP,
  jupiterRequestHeaders,
  OUROBOROS_MINT,
  WRAPPED_SOL_MINT,
} from "@/lib/constants";
import {
  createMetadataUmi,
  fetchTokenDisplayMeta,
  type TokenDisplayMeta,
} from "@/lib/tokenMetadata";

type EmptyAccount = {
  pubkey: PublicKey;
  programId: PublicKey;
  lamports: number;
};

type OuroBalance = {
  raw: bigint;
  decimals: number;
  programId: PublicKey;
};

/** Non-empty SPL token account row from scan. */
type ParsedHold = {
  pubkey: PublicKey;
  mint: PublicKey;
  programId: PublicKey;
  decimals: number;
  rawAmount: bigint;
  uiAmount: number;
};

const META_FETCH_CHUNK = 6;
const LS_USD_THRESHOLD = "ouro-incinerator-usd-threshold-v1";

const MIN_JUPITER_SOL_LAMPORTS = 150_000;
const CLOSE_CHUNK = 10;

function walletKeepLamports(postBalanceLamports: number): number {
  return Math.min(
    Math.floor(0.05 * LAMPORTS_PER_SOL),
    Math.max(8_000_000, Math.floor(postBalanceLamports * 0.2)),
  );
}

/** SOL to route through Jupiter after reclaim, matching single-token burn sizing. */
function computeSwapLamportsAfterReclaim(params: {
  preBal: number;
  postBal: number;
  lamportsReclaimed?: number;
}): number {
  const keep = walletKeepLamports(params.postBal);
  const spendable = Math.max(0, params.postBal - keep);

  if (
    typeof params.lamportsReclaimed === "number" &&
    params.lamportsReclaimed > 0
  ) {
    return Math.min(Math.floor(params.lamportsReclaimed * 0.95), spendable);
  }

  const delta = params.postBal - params.preBal;
  return Math.min(Math.max(0, delta), spendable);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function shortPk(k: PublicKey, chars = 4): string {
  const s = k.toBase58();
  return `${s.slice(0, chars)}…${s.slice(-chars)}`;
}

function TokenGlyph(props: { image?: string; symbolGuess: string }) {
  const { image, symbolGuess } = props;
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => {
    setImgOk(!!image);
  }, [image]);
  if (image && imgOk) {
    return (
      <span className="token-badge token-badge--media" aria-hidden>
        <Image
          src={image}
          alt=""
          width={28}
          height={28}
          className="token-badge__img"
          unoptimized
          onError={() => setImgOk(false)}
        />
      </span>
    );
  }
  return (
    <span className="token-badge" aria-hidden>
      {symbolGuess.slice(0, 3).toUpperCase()}
    </span>
  );
}

async function fetchDexscreenerPriceUsd(
  mints: string[],
): Promise<Record<string, number>> {
  const best = new Map<string, { price: number; liq: number }>();
  const unique = [...new Set(mints)];
  for (let i = 0; i < unique.length; i += 30) {
    const slice = unique.slice(i, i + 30);
    try {
      const r = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${slice.join(",")}`,
      );
      if (!r.ok) continue;
      const j = (await r.json()) as {
        pairs?: Array<{
          baseToken?: { address?: string };
          priceUsd?: string;
          liquidity?: { usd?: number };
        }>;
      };
      for (const p of j.pairs ?? []) {
        const addr = p.baseToken?.address;
        if (!addr) continue;
        const price = Number.parseFloat(p.priceUsd ?? "");
        const liq = p.liquidity?.usd ?? 0;
        if (!Number.isFinite(price) || price <= 0) continue;
        const prev = best.get(addr);
        if (!prev || liq > prev.liq) best.set(addr, { price, liq });
      }
    } catch {
      /* ignore batch */
    }
  }
  const out: Record<string, number> = {};
  for (const [k, v] of best) out[k] = v.price;
  return out;
}

function loadUsdThreshold(): number {
  try {
    const raw = localStorage.getItem(LS_USD_THRESHOLD);
    if (!raw) return 10;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? Math.min(500, Math.max(0, n)) : 10;
  } catch {
    return 10;
  }
}

function saveUsdThreshold(n: number) {
  localStorage.setItem(LS_USD_THRESHOLD, String(n));
}

async function waitForSignature(
  connection: Connection,
  signature: string,
): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const { value } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const s = value[0];
    if (s?.err) throw new Error(JSON.stringify(s.err));
    if (
      s?.confirmationStatus === "confirmed" ||
      s?.confirmationStatus === "finalized"
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 900));
  }
  throw new Error("confirmation timeout");
}

async function jupiterSwapExactIn(params: {
  inputMint: string;
  outputMint: string;
  amountRaw: string;
  connection: Connection;
  publicKey: PublicKey;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
}): Promise<string> {
  const { inputMint, outputMint, amountRaw, connection, publicKey, signTransaction } =
    params;
  const quoteParams = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountRaw,
    slippageBps: "150",
    swapMode: "ExactIn",
    restrictIntermediateTokens: "false",
    maxAccounts: "64",
    instructionVersion: "V1",
  });
  const quoteRes = await fetch(`${JUPITER_QUOTE}?${quoteParams}`, {
    headers: jupiterRequestHeaders(),
  });
  if (!quoteRes.ok) {
    const t = await quoteRes.text();
    throw new Error(t || "no Jupiter quote");
  }
  const quoteResponse = (await quoteRes.json()) as Record<string, unknown>;
  if (typeof quoteResponse.outAmount !== "string")
    throw new Error("malformed Jupiter quote");

  const swapRes = await fetch(JUPITER_SWAP, {
    method: "POST",
    headers: jupiterRequestHeaders(true),
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });
  if (!swapRes.ok) {
    const t = await swapRes.text();
    throw new Error(t || "Jupiter swap build failed");
  }
  const swapJson = (await swapRes.json()) as { swapTransaction?: string };
  if (!swapJson.swapTransaction) throw new Error("missing swap transaction");

  const vtx = VersionedTransaction.deserialize(
    base64ToUint8Array(swapJson.swapTransaction),
  );
  const signed = await signTransaction(vtx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await waitForSignature(connection, sig);
  return sig;
}

async function readOuroBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<OuroBalance | null> {
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const res = await connection.getParsedTokenAccountsByOwner(
      owner,
      { programId },
      "confirmed",
    );
    for (const { account } of res.value) {
      const parsed = account.data.parsed;
      if (!parsed || parsed.type !== "account") continue;
      const info = parsed.info;
      const mint = new PublicKey(info.mint);
      if (!mint.equals(OUROBOROS_MINT)) continue;
      const raw = BigInt(info.tokenAmount.amount);
      if (raw === BigInt(0)) continue;
      return {
        raw,
        decimals: info.tokenAmount.decimals,
        programId,
      };
    }
  }
  return null;
}

/** Raw OURO acquired since `beforeRaw` (0 if balance did not increase). */
function ouroBuybackDelta(beforeRaw: bigint, afterRaw: bigint): bigint {
  const delta = afterRaw - beforeRaw;
  return delta > BigInt(0) ? delta : BigInt(0);
}

const HUMAN_FEED_RECORDED = "ouro-human-feed-recorded";

async function txTimingFromSignature(
  connection: Connection,
  signature: string,
): Promise<{ slot: number; timestamp: number | null }> {
  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  return { slot: tx?.slot ?? 0, timestamp: tx?.blockTime ?? null };
}

async function recordHumanExchange(params: {
  signature: string;
  slot: number;
  timestamp: number | null;
  amountUi: number;
  burner: string;
  exchange: {
    sourceMint: string;
    sourceSymbol?: string;
    sourceName?: string;
    sourceImage?: string;
    sourceUiAmount?: number;
    sourceBurnSignature?: string;
    swapSignature?: string;
  };
}): Promise<void> {
  try {
    const res = await fetch("/api/ouro-burn-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      window.dispatchEvent(new CustomEvent(HUMAN_FEED_RECORDED));
    }
  } catch {
    /* best-effort — on-chain burns still succeeded */
  }
}

export function IncineratorPanel() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const [walletUiReady, setWalletUiReady] = useState(false);
  useEffect(() => setWalletUiReady(true), []);
  const [holds, setHolds] = useState<ParsedHold[]>([]);
  const [empties, setEmpties] = useState<EmptyAccount[]>([]);
  const [meta, setMeta] = useState<Record<string, TokenDisplayMeta>>({});
  const [mintPriceUsd, setMintPriceUsd] = useState<Record<string, number>>({});
  const [usdThreshold, setUsdThreshold] = useState(loadUsdThreshold);
  const [loadingScan, setLoadingScan] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ouroBalance, setOuroBalance] = useState<OuroBalance | null>(null);

  const ouroMintStr = OUROBOROS_MINT.toBase58();

  const scan = useCallback(async () => {
    if (!publicKey) return;
    setLoadingScan(true);
    setError(null);
    setMessage(null);
    try {
      const nextHolds: ParsedHold[] = [];
      const nextEmpty: EmptyAccount[] = [];

      for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
        const res = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId },
          "confirmed",
        );
        for (const { pubkey, account } of res.value) {
          const parsed = account.data.parsed;
          if (!parsed || parsed.type !== "account") continue;
          const info = parsed.info;
          const mint = new PublicKey(info.mint);
          const amountStr = info.tokenAmount.amount;
          const decimals = info.tokenAmount.decimals;
          const ui = info.tokenAmount.uiAmount;
          const rawAmount = BigInt(amountStr);
          if (rawAmount === BigInt(0)) {
            nextEmpty.push({ pubkey, programId, lamports: 0 });
            continue;
          }
          const uiAmount =
            typeof ui === "number"
              ? ui
              : Number(rawAmount) / 10 ** decimals;
          nextHolds.push({
            pubkey,
            mint,
            programId,
            decimals,
            rawAmount,
            uiAmount,
          });
        }
      }

      if (nextEmpty.length > 0) {
        const pubkeys = nextEmpty.map((e) => e.pubkey);
        const CHUNK = 100;
        for (let i = 0; i < pubkeys.length; i += CHUNK) {
          const slice = pubkeys.slice(i, i + CHUNK);
          const infos = await connection.getMultipleAccountsInfo(slice, "confirmed");
          for (let j = 0; j < slice.length; j++) {
            const idx = i + j;
            nextEmpty[idx].lamports = infos[j]?.lamports ?? 0;
          }
        }
      }

      setHolds(nextHolds);
      setEmpties(nextEmpty);

      const metas: Record<string, TokenDisplayMeta> = {};
      const mints = [...new Set(nextHolds.map((h) => h.mint.toBase58()))];
      const mintToTokenAccount = new Map<string, PublicKey>();
      for (const h of nextHolds) {
        const ms = h.mint.toBase58();
        if (!mintToTokenAccount.has(ms)) mintToTokenAccount.set(ms, h.pubkey);
      }
      const umi = createMetadataUmi(connection);
      const heliusRpc = getHeliusRpcUrl();
      for (let i = 0; i < mints.length; i += META_FETCH_CHUNK) {
        const slice = mints.slice(i, i + META_FETCH_CHUNK);
        await Promise.all(
          slice.map(async (m) => {
            const tokenAcct = mintToTokenAccount.get(m);
            if (!tokenAcct) return;
            metas[m] = await fetchTokenDisplayMeta(umi, {
              mint: m,
              owner: publicKey,
              tokenAccount: tokenAcct,
              heliusRpcUrl: heliusRpc,
            });
          }),
        );
      }
      setMeta(metas);

      const trashMints = nextHolds
        .filter((h) => !h.mint.equals(OUROBOROS_MINT))
        .map((h) => h.mint.toBase58());
      setMintPriceUsd(await fetchDexscreenerPriceUsd(trashMints));
      const ouroHold = nextHolds.find((h) => h.mint.equals(OUROBOROS_MINT));
      if (ouroHold && ouroHold.rawAmount > BigInt(0)) {
        setOuroBalance({
          raw: ouroHold.rawAmount,
          decimals: ouroHold.decimals,
          programId: ouroHold.programId,
        });
      } else {
        setOuroBalance(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "scan failed");
    } finally {
      setLoadingScan(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void scan();
  }, [scan]);

  const trashable = useMemo(
    () => holds.filter((h) => !h.mint.equals(OUROBOROS_MINT)),
    [holds],
  );

  const filteredTrashable = useMemo(() => {
    return trashable.filter((h) => {
      const mint = h.mint.toBase58();
      const px = mintPriceUsd[mint];
      if (px == null || !Number.isFinite(px)) return true;
      return h.uiAmount * px <= usdThreshold;
    });
  }, [trashable, mintPriceUsd, usdThreshold]);

  const hiddenByFilter = trashable.length - filteredTrashable.length;

  const onUsdSlider = (v: number) => {
    setUsdThreshold(v);
    saveUsdThreshold(v);
  };

  const burnOuroWithBalance = async (
    bal: OuroBalance,
    amountRaw?: bigint,
  ) => {
    if (!publicKey || !sendTransaction) return;

    const toBurn = amountRaw ?? bal.raw;
    if (toBurn <= BigInt(0)) return;
    if (toBurn > bal.raw) {
      throw new Error("burn amount exceeds OURO balance");
    }

    // OUROBOROS is a pump.fun mint. Sol Incinerator burn txs can include pump
    // program instructions whose fee-recipient (or other) accounts lag behind
    // on-chain updates, failing simulation with Custom(6000) (Anchor “not
    // authorized”). Burning from the wallet’s own ATA via SPL is sufficient.
    const ata = getAssociatedTokenAddressSync(
      OUROBOROS_MINT,
      publicKey,
      false,
      bal.programId,
    );
    const ix = createBurnInstruction(
      ata,
      OUROBOROS_MINT,
      publicKey,
      toBurn,
      [],
      bal.programId,
    );
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();
    const vtx = new VersionedTransaction(msg);
    const sig = await sendTransaction(vtx, connection, {
      skipPreflight: false,
    });
    await waitForSignature(connection, sig);
    return sig;
  };

  const burnOuroboros = async () => {
    if (
      !publicKey ||
      !sendTransaction ||
      !ouroBalance ||
      ouroBalance.raw === BigInt(0)
    )
      return;
    setBusyKey("burn-ouro");
    setError(null);
    setMessage(null);
    try {
      const sig = await burnOuroWithBalance(ouroBalance);
      if (!sig) return;
      setMessage(`burned OUROBOROS balance · ${sig}`);
      await scan();
    } catch (e) {
      setError(e instanceof Error ? e.message : "burn failed");
    } finally {
      setBusyKey(null);
    }
  };

  const burnTokenViaSolIncinerator = async (h: ParsedHold) => {
    if (!publicKey || !sendTransaction) return;
    if (!signTransaction) {
      setError("wallet cannot sign (needed for Jupiter after burn)");
      return;
    }
    const rowKey = h.pubkey.toBase58();
    setBusyKey(`si-burn-${rowKey}`);
    setError(null);
    setMessage(null);
    try {
      const preBal = await connection.getBalance(publicKey, "confirmed");

      const res = await fetch("/api/sol-incinerator/burn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPublicKey: publicKey.toBase58(),
          assetId: rowKey,
        }),
      });
      if (res.status === 503) {
        throw new Error(
          "Set SOL_INCINERATOR_API (server env) to burn SPL tokens via Sol Incinerator.",
        );
      }
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Sol Incinerator burn failed");
      const j = JSON.parse(text) as {
        serializedTransaction?: string;
        lamportsReclaimed?: number;
      };
      if (!j.serializedTransaction) {
        throw new Error("Sol Incinerator: missing serializedTransaction");
      }
      const vtx = VersionedTransaction.deserialize(
        bs58.decode(j.serializedTransaction),
      );
      const burnSig = await sendTransaction(vtx, connection, {
        skipPreflight: false,
      });
      await waitForSignature(connection, burnSig);

      const postBal = await connection.getBalance(publicKey, "confirmed");
      let swapLamports = computeSwapLamportsAfterReclaim({
        preBal,
        postBal,
        lamportsReclaimed: j.lamportsReclaimed,
      });

      if (swapLamports < MIN_JUPITER_SOL_LAMPORTS) {
        setMessage(
          `SI burn ok (${burnSig.slice(0, 8)}…) · Jupiter buyback skipped (need ~${(
            MIN_JUPITER_SOL_LAMPORTS / LAMPORTS_PER_SOL
          ).toFixed(4)} SOL; reclaimed rent was smaller).`,
        );
        const mintStr = h.mint.toBase58();
        const m = meta[mintStr];
        const timing = await txTimingFromSignature(connection, burnSig);
        await recordHumanExchange({
          signature: burnSig,
          slot: timing.slot,
          timestamp: timing.timestamp,
          amountUi: 0,
          burner: publicKey.toBase58(),
          exchange: {
            sourceMint: mintStr,
            sourceSymbol: m?.symbol,
            sourceName: m?.name,
            sourceImage: m?.image,
            sourceUiAmount: h.uiAmount,
            sourceBurnSignature: burnSig,
          },
        });
        await scan();
        return;
      }

      setMessage(`SI burn ok · ${burnSig.slice(0, 8)}… · sign Jupiter SOL→OURO…`);

      const ouroBeforeSwap = await readOuroBalance(connection, publicKey);
      const ouroBeforeRaw = ouroBeforeSwap?.raw ?? BigInt(0);

      const swapSig = await jupiterSwapExactIn({
        inputMint: WRAPPED_SOL_MINT,
        outputMint: ouroMintStr,
        amountRaw: String(swapLamports),
        connection,
        publicKey,
        signTransaction,
      });

      const freshOuro = await readOuroBalance(connection, publicKey);
      const buybackRaw = freshOuro
        ? ouroBuybackDelta(ouroBeforeRaw, freshOuro.raw)
        : BigInt(0);
      let ouroBurnSig: string | null = null;
      if (freshOuro && buybackRaw > BigInt(0)) {
        setMessage(`swap ok · ${swapSig.slice(0, 8)}… · sign buyback OURO burn…`);
        ouroBurnSig = (await burnOuroWithBalance(freshOuro, buybackRaw)) ?? null;
      }

      setMessage(
        ouroBurnSig
          ? `${shortPk(h.mint, 4)} · SI ${burnSig.slice(0, 8)}… · swap ${swapSig.slice(0, 8)}… · burned buyback OURO ${ouroBurnSig.slice(0, 8)}…`
          : buybackRaw > BigInt(0)
            ? `${shortPk(h.mint, 4)} · SI ${burnSig.slice(0, 8)}… · swap ${swapSig.slice(0, 8)}… (buyback burn skipped — rescan)`
            : `${shortPk(h.mint, 4)} · SI ${burnSig.slice(0, 8)}… · swap ${swapSig.slice(0, 8)}… (existing OURO kept — nothing new to burn)`,
      );

      const mintStr = h.mint.toBase58();
      const m = meta[mintStr];
      const primarySig = ouroBurnSig ?? swapSig;
      const timing = await txTimingFromSignature(connection, primarySig);
      const ouroBurnedUi =
        freshOuro && buybackRaw > BigInt(0)
          ? Number(buybackRaw) / 10 ** freshOuro.decimals
          : 0;
      await recordHumanExchange({
        signature: primarySig,
        slot: timing.slot,
        timestamp: timing.timestamp,
        amountUi: ouroBurnedUi,
        burner: publicKey.toBase58(),
        exchange: {
          sourceMint: mintStr,
          sourceSymbol: m?.symbol,
          sourceName: m?.name,
          sourceImage: m?.image,
          sourceUiAmount: h.uiAmount,
          sourceBurnSignature: burnSig,
          swapSignature: swapSig,
        },
      });

      await scan();
    } catch (e) {
      setError(e instanceof Error ? e.message : "burn chain failed");
    } finally {
      setBusyKey(null);
    }
  };

  const closeEmptiesReclaimBuybackBurn = async () => {
    if (!publicKey || !sendTransaction || empties.length === 0) return;
    if (!signTransaction) {
      setError("wallet cannot sign (needed for Jupiter after closing shells)");
      return;
    }
    setBusyKey("close-reclaim-chain");
    setError(null);
    setMessage(null);

    try {
      const preBal = await connection.getBalance(publicKey, "confirmed");
      const apiFirst = await fetch("/api/sol-incinerator/batch-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPublicKey: publicKey.toBase58(),
          limit: 500,
          offset: 0,
        }),
      });

      if (apiFirst.status === 503) {
        for (let i = 0; i < empties.length; i += CLOSE_CHUNK) {
          const slice = empties.slice(i, i + CLOSE_CHUNK);
          const ixs = slice.map(({ pubkey, programId }) =>
            createCloseAccountInstruction(
              pubkey,
              publicKey,
              publicKey,
              [],
              programId,
            ),
          );
          const { blockhash } = await connection.getLatestBlockhash("confirmed");
          const msg = new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: blockhash,
            instructions: ixs,
          }).compileToV0Message();
          const vtx = new VersionedTransaction(msg);
          const sig = await sendTransaction(vtx, connection, {
            skipPreflight: false,
          });
          await waitForSignature(connection, sig);
        }
      } else {
        if (!apiFirst.ok) {
          throw new Error(
            (await apiFirst.text()) || "Sol Incinerator batch close failed",
          );
        }
        type BatchCloseJson = {
          transactions?: string[];
          truncated?: boolean;
          nextOffset?: number;
        };
        let offset = 0;
        let page: BatchCloseJson = (await apiFirst.json()) as BatchCloseJson;
        while (true) {
          const txs = page.transactions ?? [];
          for (const raw of txs) {
            const vtx = VersionedTransaction.deserialize(bs58.decode(raw));
            const sig = await sendTransaction(vtx, connection, {
              skipPreflight: false,
            });
            await waitForSignature(connection, sig);
          }
          if (!page.truncated) break;
          offset =
            typeof page.nextOffset === "number"
              ? page.nextOffset
              : offset + 500;
          const res = await fetch("/api/sol-incinerator/batch-close", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userPublicKey: publicKey.toBase58(),
              limit: 500,
              offset,
            }),
          });
          if (!res.ok) {
            throw new Error(
              (await res.text()) || "Sol Incinerator batch close failed",
            );
          }
          page = (await res.json()) as BatchCloseJson;
        }
      }

      let postBal = await connection.getBalance(publicKey, "confirmed");
      let swapLamports = computeSwapLamportsAfterReclaim({ preBal, postBal });

      if (swapLamports < MIN_JUPITER_SOL_LAMPORTS) {
        await new Promise((r) => setTimeout(r, 1200));
        postBal = await connection.getBalance(publicKey, "confirmed");
        swapLamports = computeSwapLamportsAfterReclaim({ preBal, postBal });
      }

      if (swapLamports < MIN_JUPITER_SOL_LAMPORTS) {
        const deltaSol = Math.max(0, postBal - preBal) / LAMPORTS_PER_SOL;
        setMessage(
          `closed ${empties.length} empty account(s). wallet gained ~${deltaSol.toFixed(
            4,
          )} SOL — below Jupiter minimum (~${(
            MIN_JUPITER_SOL_LAMPORTS / LAMPORTS_PER_SOL
          ).toFixed(4)} SOL); buyback skipped.`,
        );
        await scan();
        return;
      }

      setMessage(
        `closed ${empties.length} shell(s). sign Jupiter to buyback OUROBOROS…`,
      );

      const ouroBeforeSwap = await readOuroBalance(connection, publicKey);
      const ouroBeforeRaw = ouroBeforeSwap?.raw ?? BigInt(0);

      const swapSig = await jupiterSwapExactIn({
        inputMint: WRAPPED_SOL_MINT,
        outputMint: ouroMintStr,
        amountRaw: String(swapLamports),
        connection,
        publicKey,
        signTransaction,
      });

      const freshOuro = await readOuroBalance(connection, publicKey);
      const buybackRaw = freshOuro
        ? ouroBuybackDelta(ouroBeforeRaw, freshOuro.raw)
        : BigInt(0);
      let burnSig: string | null = null;
      if (freshOuro && buybackRaw > BigInt(0)) {
        setMessage(`swap ok · ${swapSig.slice(0, 8)}… · sign buyback burn…`);
        burnSig = (await burnOuroWithBalance(freshOuro, buybackRaw)) ?? null;
      }

      setMessage(
        burnSig
          ? `reclaimed → bought OUROBOROS (swap ${swapSig.slice(0, 8)}…) → burned buyback (${burnSig.slice(0, 8)}…)`
          : buybackRaw > BigInt(0)
            ? `reclaimed → swap ${swapSig.slice(0, 8)}… (buyback burn skipped — rescan)`
            : `reclaimed → swap ${swapSig.slice(0, 8)}… (existing OURO kept — nothing new to burn)`,
      );
      await scan();
    } catch (e) {
      setError(e instanceof Error ? e.message : "reclaim chain failed");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <div className="wallet-row">
        {walletUiReady ? (
          <>
            <WalletMultiButton className="btn btn-accent" />
            {publicKey && (
              <>
                <span style={{ color: "var(--muted)" }}>connected</span>
                <code>{shortPk(publicKey, 5)}</code>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void scan()}
                  disabled={loadingScan}
                >
                  {loadingScan ? "scanning…" : "rescan"}
                </button>
              </>
            )}
          </>
        ) : (
          <button
            type="button"
            className="btn btn-accent"
            disabled
            aria-busy="true"
            style={{ opacity: 0.75, pointerEvents: "none" }}
          >
            connect wallet
          </button>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
      {message && <p className="success-text">{message}</p>}

      {publicKey && ouroBalance && ouroBalance.raw > BigInt(0) && (
        <div style={{ marginTop: "1.25rem" }}>
          <div className="section-meta" style={{ marginBottom: "0.35rem" }}>
            ouroboros in wallet
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <span>
              balance{" "}
              <strong>
                {(Number(ouroBalance.raw) / 10 ** ouroBalance.decimals).toFixed(
                  Math.min(ouroBalance.decimals, 6),
                )}
              </strong>
            </span>
          </div>
        </div>
      )}

      {publicKey && (
        <>
          <div className="section-head">
            <h2>burn positions</h2>
            <span className="section-meta">
              {filteredTrashable.length} shown
              {trashable.length !== filteredTrashable.length
                ? ` · ${trashable.length} total`
                : ""}
            </span>
          </div>

          <div className="usd-filter">
            <label htmlFor="usd-max">
              <span>
                show positions worth up to ~${usdThreshold.toFixed(0)} USD
                {hiddenByFilter > 0
                  ? ` (${hiddenByFilter} above threshold hidden)`
                  : ""}
              </span>
              <div className="usd-filter-row">
                <span className="usd-value">$0</span>
                <input
                  id="usd-max"
                  type="range"
                  min={0}
                  max={500}
                  step={1}
                  value={usdThreshold}
                  onChange={(ev) => onUsdSlider(Number(ev.target.value))}
                />
                <span className="usd-value">$500</span>
              </div>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>
                USD from DexScreener (best-effort). each row: Sol Incinerator burn
                (+ rent reclaim), then Jupiter SOL→OUROBOROS from reclaimed SOL,
                then burns only the buyback OURO (existing wallet balance is kept).
              </span>
            </label>
          </div>

          {trashable.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 12 }}>
              no other SPL balances (or only OUROBOROS). receive airdrops or dust —
              then rescan.
            </p>
          ) : filteredTrashable.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 12 }}>
              nothing under ${usdThreshold.toFixed(0)} — raise the slider to see
              larger positions.
            </p>
          ) : (
            <div className="ledger">
              {filteredTrashable.map((h) => {
                const mintStr = h.mint.toBase58();
                const m = meta[mintStr];
                const px = mintPriceUsd[mintStr];
                const usdEst =
                  px != null && Number.isFinite(px) ? h.uiAmount * px : null;
                const title = m?.name ?? shortPk(h.mint, 6);
                const ticker = m?.symbol ? `$${m.symbol}` : "unknown";
                const busy = busyKey === `si-burn-${h.pubkey.toBase58()}`;
                return (
                  <div key={h.pubkey.toBase58()} className="ledger-row">
                    <div className="ledger-main">
                      <div className="ledger-title">
                        <TokenGlyph
                          image={m?.image}
                          symbolGuess={m?.symbol ?? "?"}
                        />
                        <strong>{title}</strong>
                        <span className="ticker">{ticker}</span>
                        {usdEst != null ? (
                          <span className="ticker">~${usdEst.toFixed(2)}</span>
                        ) : (
                          <span className="ticker">~? USD</span>
                        )}
                      </div>
                      <div className="ca-row">
                        <span>mint {shortPk(h.mint, 6)}</span>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => void navigator.clipboard.writeText(mintStr)}
                        >
                          copy
                        </button>
                      </div>
                    </div>
                    <div className="ledger-metrics">
                      <div>
                        <div className="metric-label">balance</div>
                        <div className="metric-value">
                          {h.uiAmount < 0.0001
                            ? h.uiAmount.toExponential(2)
                            : h.uiAmount.toLocaleString(undefined, {
                                maximumFractionDigits: 6,
                              })}
                        </div>
                      </div>
                    </div>
                    <div className="row-actions">
                      <a
                        className="btn"
                        href={`https://pump.fun/coin/${mintStr}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        pump
                      </a>
                      <a
                        className="btn"
                        href={`https://dexscreener.com/solana/${mintStr}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        dex
                      </a>
                      <button
                        type="button"
                        className="btn btn-accent"
                        disabled={busy || busyKey !== null}
                        onClick={() => void burnTokenViaSolIncinerator(h)}
                      >
                        {busy ? "signing…" : "burn → OURO"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="section-head">
            <h2>empty shells</h2>
            <span className="section-meta">
              {empties.length} account{empties.length === 1 ? "" : "s"}
            </span>
          </div>
          {empties.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 12 }}>
              no vacant SPL accounts — you are already lean.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                reclaim ~{" "}
                {(empties.reduce((s, e) => s + e.lamports, 0) / LAMPORTS_PER_SOL).toFixed(
                  4,
                )}{" "}
                SOL rent (pre-close balances). then: Jupiter wraps and swaps SOL →
                OUROBOROS, then SPL-burns only the buyback amount (Sol Incinerator
                is used for batch closes / dust burns when configured).
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-accent"
                  disabled={busyKey !== null}
                  onClick={() => void closeEmptiesReclaimBuybackBurn()}
                >
                  {busyKey === "close-reclaim-chain"
                    ? "working…"
                    : "close all → buyback → burn"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
