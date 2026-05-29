import { api } from "@coin-communities/sdk";
import {
  canPostAgentBurnsToCommunity,
  ensureCoinCommunityApi,
} from "@/lib/coinCommunityApi";
import { ouroTokenAddress } from "@/lib/coinCommunity";
import type { OuroBurnEntry } from "@/lib/ouroBurnHistoryTypes";

function formatBurnAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function agentBurnMessage(entry: OuroBurnEntry): string {
  const amount = formatBurnAmount(entry.amountUi);
  const txUrl = `https://solscan.io/tx/${entry.signature}`;
  const burner = entry.burner ? `\nwallet: ${entry.burner}` : "";
  return `agent burn: ${amount} OURO destroyed ↻\n${txUrl}${burner}`;
}

/** Server-side community post for a newly indexed agent burn. */
export async function postAgentBurnToCommunity(
  entry: OuroBurnEntry,
): Promise<void> {
  if (entry.performedBy !== "agent") return;
  if (!canPostAgentBurnsToCommunity()) return;

  ensureCoinCommunityApi();

  const twitterId = process.env.COMM_POST_TWITTER_ID!.trim();
  const walletAddress = process.env.COMM_POST_WALLET_ADDRESS!.trim();
  const tokenAddress = ouroTokenAddress();

  const { error } = await api.postMessageServer({
    path: { token_address: tokenAddress },
    body: {
      content: agentBurnMessage(entry),
      chainId: "solana",
      twitterId,
      walletAddress,
    },
  });

  if (error) {
    const message =
      typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "community post failed";
    throw new Error(message);
  }
}
