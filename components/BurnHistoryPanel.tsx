"use client";

import { useEffect, useMemo, useState } from "react";
import type { BurnPerformedBy, OuroBurnEntry } from "@/lib/ouroBurnHistory";

const PAGE_SIZE = 8;

type BurnHistoryResponse = {
  mint: string;
  lastFetchedAt: number;
  entries: OuroBurnEntry[];
  syncEnabled?: boolean;
  syncError?: string;
  backfillComplete?: boolean;
  lastScannedCount?: number;
};

function shortAddr(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 1) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatWhen(ts: number | null): string {
  if (ts == null) return "—";
  const d = new Date(ts * 1000);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRefreshed(ts: number): string {
  if (!ts) return "not synced yet";
  return formatWhen(Math.floor(ts / 1000));
}

function performedByLabel(by: BurnPerformedBy): string {
  return by === "agent" ? "agent" : "human · app";
}

export function BurnHistoryPanel() {
  const [data, setData] = useState<BurnHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ouro-burn-history", { cache: "no-store" });
        const json = (await res.json()) as BurnHistoryResponse & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "failed to load burn history");
        if (!cancelled) {
          setData(json);
          setError(json.syncError ?? null);
          setPage(0);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "failed to load burn history");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = data?.entries ?? [];
  const totalBurned = entries.reduce((sum, e) => sum + e.amountUi, 0);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));

  const pageEntries = useMemo(() => {
    const start = page * PAGE_SIZE;
    return entries.slice(start, start + PAGE_SIZE);
  }, [entries, page]);

  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  return (
    <aside
      className="panel burn-history"
      aria-label="OUROBOROS burn transaction history"
    >
      <div className="panel-title-row burn-history__head">
        <h2 className="panel-title">burn history</h2>
        <span className="burn-history__meta">
          {loading ? "…" : `${entries.length} txns`}
        </span>
      </div>

      <p className="burn-history__hint">
        burns since Mar 17 2026 from Neon (Helius chain sync + app-recorded
        exchanges). human = via this app.
        {data?.backfillComplete === false ? (
          <>
            {" "}
            backfill incomplete — run <code>npm run sync:burn-history</code>.
          </>
        ) : null}
      </p>

      {!loading && !error && entries.length > 0 ? (
        <p className="burn-history__total">
          ~{formatAmount(totalBurned)} OURO burned (all pages)
        </p>
      ) : null}

      {error && entries.length === 0 ? (
        <p className="error-text">{error}</p>
      ) : null}

      <ul className="burn-history__list">
        {loading ? (
          <li className="burn-history__empty">loading burns…</li>
        ) : entries.length === 0 ? (
          <li className="burn-history__empty">
            {data?.syncEnabled === false
              ? "no burns in the database yet — set NEON_DB_URL and run npm run sync:burn-history (needs HELIUS_API_KEY)."
              : data?.lastFetchedAt
                ? "no burns in the database yet."
                : "run npm run sync:burn-history to index on-chain burns."}
          </li>
        ) : (
          pageEntries.map((e) => (
            <li key={e.signature} className="burn-history__row">
              <div className="burn-history__row-main">
                <span className="burn-history__amount">
                  {formatAmount(e.amountUi)} OURO
                </span>
                <span
                  className={`burn-history__tag burn-history__tag--${e.performedBy}`}
                >
                  {performedByLabel(e.performedBy)}
                </span>
              </div>
              <div className="burn-history__row-mid">
                <span className="burn-history__when">{formatWhen(e.timestamp)}</span>
              </div>
              <div className="burn-history__row-sub">
                {e.burner ? (
                  <a
                    href={`https://solscan.io/account/${e.burner}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="burn-history__link burn-history__link--wallet"
                    title={e.burner}
                  >
                    {shortAddr(e.burner)}
                  </a>
                ) : (
                  <span>unknown</span>
                )}
                <a
                  href={`https://solscan.io/tx/${e.signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="burn-history__link burn-history__link--tx"
                  title={e.signature}
                >
                  solscan · {shortAddr(e.signature, 4)}
                </a>
              </div>
            </li>
          ))
        )}
      </ul>

      {!loading && entries.length > PAGE_SIZE ? (
        <nav
          className="burn-history__pager"
          aria-label="Burn history pages"
        >
          <button
            type="button"
            className="btn btn-ghost burn-history__pager-btn"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            prev
          </button>
          <span className="burn-history__pager-meta">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-ghost burn-history__pager-btn"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            next
          </button>
        </nav>
      ) : null}

      <p className="burn-history__footer">
        chain sync {formatRefreshed(data?.lastFetchedAt ?? 0)}
        {error && entries.length > 0 ? ` · sync: ${error}` : ""}
      </p>
    </aside>
  );
}
