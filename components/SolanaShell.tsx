"use client";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { DEFAULT_RPC, OUROBOROS_MINT } from "@/lib/constants";
import { BurnHistoryPanel } from "@/components/BurnHistoryPanel";
import { IncineratorPanel } from "@/components/IncineratorPanel";
import { OuroLoreCard } from "@/components/OuroLoreCard";
import { OuroSupplySerpent } from "@/components/OuroSupplySerpent";
import { OuroborosFeedAnimation } from "@/components/OuroborosFeedAnimation";
import { PanelFeedInfo } from "@/components/PanelFeedInfo";

const PUMP_COIN_URL =
  "https://pump.fun/coin/2yeyNC83oe3kht8Jnsd4xsrL64X35RYFKgZQakEdpump";
const X_COMMUNITY_URL =
  "https://x.com/i/communities/2019097621818929284";
const GITHUB_URL = "https://github.com/startupandhold/ouroboros";
const OURO_MINT_STR = OUROBOROS_MINT.toBase58();

export function SolanaShell() {
  const [mintCopied, setMintCopied] = useState(false);
  const endpoint = useMemo(() => DEFAULT_RPC, []);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  const copyMint = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(OURO_MINT_STR);
      setMintCopied(true);
      window.setTimeout(() => setMintCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="app-shell">
            <header className="top-bar">
              <div className="top-bar-start">
                <span>feed the cycle</span>
                <Link
                  href="/game"
                  className="top-bar-game-link"
                  aria-label="Play Ouroboros Snake"
                  title="Play Ouroboros Snake"
                >
                  <Image
                    src="/image/ouro_infinite.png"
                    alt=""
                    width={40}
                    height={22}
                    className="top-bar-game-link__img"
                    aria-hidden
                  />
                </Link>
              </div>
              <div className="top-bar-end">
                <div className="top-bar-links" aria-label="Community links">
                  <a
                    href={PUMP_COIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="top-bar-icon"
                    aria-label="Ouroboros on Pump.fun"
                  >
                    <Image
                      src="/image/pumpfun_icon.png"
                      alt=""
                      width={20}
                      height={20}
                      aria-hidden
                    />
                  </a>
                  <a
                    href={X_COMMUNITY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="top-bar-icon"
                    aria-label="Ouroboros X community"
                  >
                    <Image
                      src="/image/x_icon.png"
                      alt=""
                      width={20}
                      height={20}
                      aria-hidden
                    />
                  </a>
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="top-bar-icon top-bar-icon--github"
                    aria-label="Ouroboros on GitHub"
                  >
                    <Image
                      src="/image/github.png"
                      alt=""
                      width={20}
                      height={20}
                      aria-hidden
                    />
                  </a>
                </div>
                <span>solana · mainnet</span>
              </div>
            </header>

            <section className="hero">
              <h1 className="hero-logo">
                <a
                  href={PUMP_COIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hero-logo-link"
                >
                  Ouroboros
                </a>
              </h1>
              <button
                type="button"
                className={`hero-mint${mintCopied ? " hero-mint--copied" : ""}`}
                onClick={() => void copyMint()}
                aria-label={
                  mintCopied
                    ? "Mint address copied"
                    : "Copy OUROBOROS mint address"
                }
              >
                <code>{OURO_MINT_STR}</code>
                <span className="hero-mint-hint">
                  {mintCopied ? "copied" : "click to copy"}
                </span>
              </button>
              <p className="hero-tag">the snake eats its tail. forever.</p>
              <div className="hero-video">
                <video
                  className="hero-video-el"
                  src="/video/ouroboros.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                  preload="auto"
                  aria-label="Ouroboros"
                />
              </div>
            </section>

            <div className="ouro-showcase">
              <OuroLoreCard />
              <OuroSupplySerpent />
            </div>

            <div className="panel-row">
              <section className="panel">
              <div className="panel-title-row">
                <h2 className="panel-title">feed the <em>ouroboros</em></h2>
                <PanelFeedInfo />
              </div>
              <ol className="steps">
                <li>
                  <span className="step-num">01</span>
                  <span>connect your wallet.</span>
                </li>
                <li>
                  <span className="step-num">02</span>
                  <span>
                    use <strong>burn positions</strong> + the USD slider to find
                    small bags, then for each row: Sol Incinerator burn (reclaim
                    rent), Jupiter SOL→OUROBOROS from that reclaimed SOL, then SPL
                    burn OURO from your ATA.
                  </span>
                </li>
                <li>
                  <span className="step-num">03</span>
                  <span>
                    close empty SPL token accounts (Sol Incinerator batch API when
                    configured, or local closes) to pull rent back as SOL.
                  </span>
                </li>
                <li>
                  <span className="step-num">04</span>
                  <span>
                    one{" "}
                    <a
                      href="https://jup.ag/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Jupiter
                    </a>{" "}
                    swap: SOL → OUROBOROS using reclaimed SOL (plus a small wallet
                    buffer), then SPL burn OURO from your wallet&apos;s token
                    account.
                  </span>
                </li>
              </ol>

              <OuroborosFeedAnimation />

              <IncineratorPanel />
              </section>

              <BurnHistoryPanel />
            </div>

            <p className="disclaimer">
              Experimental interface. Each burn-position row chains Sol Incinerator
              → Jupiter SOL→OUROBOROS (when reclaim clears the minimum swap size)
              → on-chain SPL burn of OURO when applicable. The empty-shells button uses the same
              Jupiter + burn pattern. USD slider uses DexScreener and can be wrong
              or missing. You approve every transaction. OUROBOROS mint:{" "}
              <a href={`https://pump.fun/coin/${OURO_MINT_STR}`} target="_blank" rel="noopener noreferrer">{OURO_MINT_STR}</a>.
            </p>
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
