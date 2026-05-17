import { Connection } from "@solana/web3.js";
import { DEFAULT_RPC, WRAPPED_SOL_MINT } from "@/lib/constants";
import { OURO_MINT_STR } from "@/lib/ouroBurnHistory";

const SKIP_MINTS = new Set([OURO_MINT_STR, WRAPPED_SOL_MINT]);

type TokenBalance = {
  accountIndex: number;
  mint: string;
  uiTokenAmount: { amount: string };
};

function fedMintFromBalances(
  pre: TokenBalance[] | null | undefined,
  post: TokenBalance[] | null | undefined,
): string {
  const byKey = new Map<string, { pre: bigint; post: bigint }>();

  for (const b of pre ?? []) {
    if (SKIP_MINTS.has(b.mint)) continue;
    const key = `${b.accountIndex}:${b.mint}`;
    byKey.set(key, {
      pre: BigInt(b.uiTokenAmount.amount),
      post: BigInt(0),
    });
  }
  for (const b of post ?? []) {
    if (SKIP_MINTS.has(b.mint)) continue;
    const key = `${b.accountIndex}:${b.mint}`;
    const cur = byKey.get(key) ?? { pre: BigInt(0), post: BigInt(0) };
    cur.post = BigInt(b.uiTokenAmount.amount);
    byKey.set(key, cur);
  }

  const burnedByMint = new Map<string, bigint>();
  for (const [key, bal] of byKey) {
    const delta = bal.post - bal.pre;
    if (delta >= BigInt(0)) continue;
    const mint = key.split(":").slice(1).join(":");
    burnedByMint.set(mint, (burnedByMint.get(mint) ?? BigInt(0)) + -delta);
  }

  let bestMint = OURO_MINT_STR;
  let bestBurn = BigInt(0);
  for (const [mint, amt] of burnedByMint) {
    if (amt > bestBurn) {
      bestBurn = amt;
      bestMint = mint;
    }
  }
  return bestMint;
}

export async function resolveFedMintForSignature(
  signature: string,
  rpcUrl: string = DEFAULT_RPC,
): Promise<string> {
  const conn = new Connection(rpcUrl, "confirmed");
  const tx = await conn.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx?.meta) return OURO_MINT_STR;
  return fedMintFromBalances(
    tx.meta.preTokenBalances as TokenBalance[] | undefined,
    tx.meta.postTokenBalances as TokenBalance[] | undefined,
  );
}

export type RecentFeedToken = {
  signature: string;
  timestamp: number | null;
  amountUi: number;
  performedBy: "agent" | "human";
  mint: string;
  symbol?: string;
  name?: string;
  image?: string;
};
