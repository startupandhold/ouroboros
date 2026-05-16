import { PublicKey } from "@solana/web3.js";

/** OUROBOROS (pump.fun) mint — swaps route here, then optional on-chain burn. */
export const OUROBOROS_MINT = new PublicKey(
  "2yeyNC83oe3kht8Jnsd4xsrL64X35RYFKgZQakEdpump",
);

/** Pump.fun genesis UI supply (1B tokens, 6 decimals). */
export const ORIGINAL_UI_SUPPLY = 1_000_000_000;

export const DEFAULT_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  "https://api.mainnet-beta.solana.com";

/**
 * Helius JSON-RPC URL for DAS (`getAsset`, etc.). Reuses a Helius RPC URL from
 * env when present, otherwise builds from `NEXT_PUBLIC_HELIUS_API_KEY`.
 * Same caveats as other `NEXT_PUBLIC_*` keys: exposed in the client bundle.
 */
export function getHeliusRpcUrl(): string | null {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
  if (rpc && rpc.includes("helius-rpc.com")) return rpc;
  const key = process.env.NEXT_PUBLIC_HELIUS_API_KEY?.trim();
  if (key) return `https://mainnet.helius-rpc.com/?api-key=${key}`;
  return null;
}

/** Metis swap API v1 (replaces retired `quote-api.jup.ag` / v6). */
export const JUPITER_QUOTE = "https://api.jup.ag/swap/v1/quote";
export const JUPITER_SWAP = "https://api.jup.ag/swap/v1/swap";

/** Optional `x-api-key` for higher limits — https://portal.jup.ag/ */
export function jupiterRequestHeaders(jsonBody = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (jsonBody) h["Content-Type"] = "application/json";
  const key = process.env.NEXT_PUBLIC_JUPITER_API_KEY?.trim();
  if (key) h["x-api-key"] = key;
  return h;
}

/** Wrapped SOL mint — Jupiter `ExactIn` for SOL spends. */
export const WRAPPED_SOL_MINT =
  "So11111111111111111111111111111111111111112";
