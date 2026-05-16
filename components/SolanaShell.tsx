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
import { useMemo } from "react";
import { DEFAULT_RPC } from "@/lib/constants";
import { IncineratorPanel } from "@/components/IncineratorPanel";
import { OuroLoreCard } from "@/components/OuroLoreCard";

const PUMP_COIN_URL =
  "https://pump.fun/coin/2yeyNC83oe3kht8Jnsd4xsrL64X35RYFKgZQakEdpump";
const X_COMMUNITY_URL =
  "https://x.com/i/communities/2019097621818929284";

export function SolanaShell() {
  const endpoint = useMemo(() => DEFAULT_RPC, []);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="app-shell">
            <header className="top-bar">
              <span>eternal cycle</span>
              <div className="top-bar-end">
                <div className="top-bar-links" aria-label="Community links">
                  <a
                    href={PUMP_COIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="top-bar-icon"
                    aria-label="Ouroboros on Pump.fun"
                  >
                    <img
                      src="/image/pumpfun_icon.png"
                      alt=""
                      width={20}
                      height={20}
                      decoding="async"
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
                    <img
                      src="/image/x_icon.png"
                      alt=""
                      width={20}
                      height={20}
                      decoding="async"
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
              <p className="hero-tag">the snake eats its tail. forever.</p>
              <div className="hero-video">
                <video
                  className="hero-video-el"
                  src="/video/ouroboros.mp4"
                  controls
                  playsInline
                  preload="metadata"
                  aria-label="Ouroboros"
                />
              </div>
            </section>

            <OuroLoreCard />

            <section className="panel">
              <h2 className="panel-title">how the <em>ouroboros</em> feeds</h2>
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
                    burn OURO from your ATA (needs <code>SOL_INCINERATOR_API</code>{" "}
                    for the dust burn + Jupiter-capable wallet).
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

              <IncineratorPanel />
            </section>

            <p className="disclaimer">
              Experimental interface. Each burn-position row chains Sol Incinerator
              → Jupiter SOL→OUROBOROS (when reclaim clears the minimum swap size)
              → on-chain SPL burn of OURO when applicable. The empty-shells button uses the same
              Jupiter + burn pattern. USD slider uses DexScreener and can be wrong
              or missing. You approve every transaction. OUROBOROS mint:{" "}
              <code style={{ color: "var(--fg)" }}>
                2yeyNC83oe3kht8Jnsd4xsrL64X35RYFKgZQakEdpump
              </code>
              . Set{" "}
              <code>NEXT_PUBLIC_SOLANA_RPC_URL</code> for a dedicated RPC.
            </p>
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
