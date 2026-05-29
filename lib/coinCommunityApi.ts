import { configureApi } from "@coin-communities/sdk";

export const COIN_COMMUNITY_API_BASE =
  process.env.COIN_COMMUNITY_API_URL?.replace(/\/$/, "") ??
  "https://api.coin-communities.xyz";

let configured = false;

export function coinCommunityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const apiKey = process.env.OURO_COMM_API_KEY?.trim();
  if (apiKey) headers["x-api-key"] = apiKey;
  const serverKey = process.env.COMM_BACKEND_KEY?.trim();
  if (serverKey) headers["x-server-key"] = serverKey;
  const serverSecret = process.env.COMM_BACKEND_SECRET?.trim();
  if (serverSecret) headers["x-server-secret"] = serverSecret;
  return headers;
}

export function ensureCoinCommunityApi(): void {
  if (configured) return;
  configureApi({
    baseUrl: COIN_COMMUNITY_API_BASE,
    headers: coinCommunityHeaders(),
  });
  configured = true;
}

export function canPostAgentBurnsToCommunity(): boolean {
  return Boolean(
    process.env.COMM_BACKEND_KEY?.trim() &&
      process.env.COMM_BACKEND_SECRET?.trim() &&
      process.env.COMM_POST_TWITTER_ID?.trim() &&
      process.env.COMM_POST_WALLET_ADDRESS?.trim(),
  );
}
