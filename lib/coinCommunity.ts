import { api } from "@coin-communities/sdk";
import { OUROBOROS_MINT } from "@/lib/constants";
import { ensureCoinCommunityApi } from "@/lib/coinCommunityApi";

export type CommunityFeedItem = {
  id: string;
  content: string;
  username: string;
  displayName: string | null;
  profileImageUrl: string | null;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  mediaUrl: string | null;
  tokenAddress: string;
  tokenSymbol: string | null;
  tokenImageUrl: string | null;
  userTwitterUrl: string | null;
};

export function ouroTokenAddress(): string {
  return (
    process.env.OURO_TOKEN_ADDRESS?.trim() || OUROBOROS_MINT.toBase58()
  );
}

export function ouroCommunityUrl(tokenAddress: string): string {
  const fromEnv = process.env.COIN_COMMUNITY_URL?.trim();
  if (fromEnv) return fromEnv;
  return `https://coincommunities.org/communities/${tokenAddress}`;
}

function normalizeFeedItem(raw: {
  id: string;
  content: string;
  username: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
  likeCount?: number;
  replyCount?: number;
  createdAt: string;
  mediaUrl?: string | null;
  tokenAddress: string;
  tokenSymbol?: string | null;
  tokenImageUrl?: string | null;
  userTwitterUrl?: string | null;
}): CommunityFeedItem {
  return {
    id: raw.id,
    content: raw.content,
    username: raw.username,
    displayName: raw.displayName ?? null,
    profileImageUrl: raw.profileImageUrl ?? null,
    likeCount: raw.likeCount ?? 0,
    replyCount: raw.replyCount ?? 0,
    createdAt: raw.createdAt,
    mediaUrl: raw.mediaUrl ?? null,
    tokenAddress: raw.tokenAddress,
    tokenSymbol: raw.tokenSymbol ?? null,
    tokenImageUrl: raw.tokenImageUrl ?? null,
    userTwitterUrl: raw.userTwitterUrl ?? null,
  };
}

/** Cross-community public feed filtered to OURO token. */
export async function fetchCommunityFeedItems(): Promise<{
  items: CommunityFeedItem[];
  communityUrl: string;
  tokenAddress: string;
}> {
  if (!process.env.OURO_COMM_API_KEY?.trim()) {
    throw new Error("OURO_COMM_API_KEY is not configured");
  }
  ensureCoinCommunityApi();
  const tokenAddress = ouroTokenAddress();
  const communityUrl = ouroCommunityUrl(tokenAddress);

  const { data, error } = await api.getFeedPublic({
    query: { limit: 100 },
  });

  if (error) {
    throw new Error(
      typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "coin community feed failed",
    );
  }

  let items = (data?.items ?? [])
    .filter((item) => item.tokenAddress === tokenAddress)
    .map(normalizeFeedItem);

  if (items.length === 0) {
    const { data: msgData, error: msgError } = await api.getMessagesPublic({
      path: { token_address: tokenAddress },
    });
    if (!msgError && msgData?.messages?.length) {
      items = msgData.messages
        .filter((m) => !m.parentMessageId)
        .map((m) =>
          normalizeFeedItem({
            id: m.id,
            content: m.content,
            username: m.username,
            displayName: m.displayName,
            profileImageUrl: m.profileImageUrl,
            likeCount: m.likeCount,
            replyCount: m.replyCount,
            createdAt: m.createdAt,
            mediaUrl: m.mediaUrl,
            tokenAddress: m.tokenAddress ?? tokenAddress,
            tokenSymbol: null,
            tokenImageUrl: null,
            userTwitterUrl: m.userTwitterUrl,
          }),
        );
    }
  }

  return { items, communityUrl, tokenAddress };
}
