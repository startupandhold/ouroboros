import type { Connection, PublicKey } from "@solana/web3.js";
import {
  fetchDigitalAsset,
  fetchDigitalAssetWithAssociatedToken,
  fetchDigitalAssetWithToken,
  fetchJsonMetadata,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import type { Umi } from "@metaplex-foundation/umi";
import { publicKey } from "@metaplex-foundation/umi";

export type TokenDisplayMeta = {
  symbol?: string;
  name?: string;
  /** HTTP(S), ipfs gateway, or data URL */
  image?: string;
};

function trimMeta(s: string | undefined): string | undefined {
  if (s == null) return undefined;
  const t = s.replace(/\0/g, "").trim();
  return t || undefined;
}

function mergeMeta(into: TokenDisplayMeta, from: TokenDisplayMeta) {
  if (from.name && !into.name) into.name = from.name;
  if (from.symbol && !into.symbol) into.symbol = from.symbol;
  if (from.image && !into.image) into.image = from.image;
}

export function createMetadataUmi(connection: Connection): Umi {
  return createUmi(connection).use(mplTokenMetadata());
}

async function metaFromDigitalAsset(
  umi: Umi,
  asset: { metadata: { name: string; symbol: string; uri: string } },
): Promise<TokenDisplayMeta> {
  const name = trimMeta(asset.metadata.name);
  const symbol = trimMeta(asset.metadata.symbol);
  const uri = trimMeta(asset.metadata.uri);
  let image: string | undefined;
  if (uri) {
    try {
      const j = await fetchJsonMetadata(umi, uri);
      if (typeof j.image === "string" && j.image.trim()) image = j.image.trim();
    } catch {
      /* off-chain JSON may 404 or block CORS */
    }
  }
  return { name, symbol, image };
}

async function fetchJupiterTokenMeta(mint: string): Promise<TokenDisplayMeta> {
  try {
    const r = await fetch(`https://tokens.jup.ag/token/${mint}`);
    if (!r.ok) return {};
    const j = (await r.json()) as {
      symbol?: string;
      name?: string;
      logoURI?: string;
    };
    return {
      symbol: trimMeta(j.symbol),
      name: trimMeta(j.name),
      image: typeof j.logoURI === "string" ? j.logoURI.trim() : undefined,
    };
  } catch {
    return {};
  }
}

async function fetchHeliusDasAsset(
  heliusRpcUrl: string,
  mint: string,
): Promise<TokenDisplayMeta> {
  try {
    const r = await fetch(heliusRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "ouroboros-incinerator-metadata",
        method: "getAsset",
        params: {
          id: mint,
          options: {
            showUnverifiedCollections: false,
            showCollectionMetadata: false,
            showFungible: true,
            showInscription: false,
          },
        },
      }),
    });
    if (!r.ok) return {};
    const j = (await r.json()) as {
      result?: {
        content?: {
          metadata?: { name?: string; symbol?: string };
          links?: { image?: string };
        };
      };
      error?: { message?: string };
    };
    if (j.error || !j.result) return {};
    const c = j.result.content;
    const md = c?.metadata;
    return {
      name: trimMeta(md?.name),
      symbol: trimMeta(md?.symbol),
      image:
        typeof c?.links?.image === "string" ? c.links.image.trim() : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Resolves symbol, name, and image: Metaplex on-chain + JSON URI, then Helius
 * DAS `getAsset` when a Helius URL is configured, then Jupiter token list.
 */
export async function fetchTokenDisplayMeta(
  umi: Umi,
  params: {
    mint: string;
    owner: PublicKey;
    tokenAccount: PublicKey;
    heliusRpcUrl: string | null;
  },
): Promise<TokenDisplayMeta> {
  const { mint, owner, tokenAccount, heliusRpcUrl } = params;
  const mintPk = publicKey(mint);
  const ownerPk = publicKey(owner.toBase58());
  const tokenPk = publicKey(tokenAccount.toBase58());
  const out: TokenDisplayMeta = {};

  const tryDigital = async (
    fn: () => Promise<{ metadata: { name: string; symbol: string; uri: string } }>,
  ) => {
    try {
      const asset = await fn();
      mergeMeta(out, await metaFromDigitalAsset(umi, asset));
    } catch {
      /* no metaplex metadata or wrong token layout */
    }
  };

  await tryDigital(() => fetchDigitalAsset(umi, mintPk));
  if (!out.name || !out.symbol) {
    await tryDigital(() => fetchDigitalAssetWithToken(umi, mintPk, tokenPk));
  }
  if (!out.name || !out.symbol) {
    await tryDigital(() =>
      fetchDigitalAssetWithAssociatedToken(umi, mintPk, ownerPk),
    );
  }

  if (heliusRpcUrl && (!out.name || !out.symbol || !out.image)) {
    mergeMeta(out, await fetchHeliusDasAsset(heliusRpcUrl, mint));
  }

  mergeMeta(out, await fetchJupiterTokenMeta(mint));
  return out;
}

/** Mint-only metadata (Jupiter + optional Helius DAS). */
export async function fetchTokenMetaByMint(
  mint: string,
  heliusRpcUrl: string | null = null,
): Promise<TokenDisplayMeta> {
  const out: TokenDisplayMeta = {};
  if (heliusRpcUrl) {
    mergeMeta(out, await fetchHeliusDasAsset(heliusRpcUrl, mint));
  }
  mergeMeta(out, await fetchJupiterTokenMeta(mint));
  return out;
}
