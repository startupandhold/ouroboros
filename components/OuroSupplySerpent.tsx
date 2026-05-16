"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

const ORIGINAL_SUPPLY = 1_000_000_000;
const ANIM_MS = 5200;

type SupplyPayload = {
  original: number;
  current: number;
  eaten: number;
  eatenPct: number;
};

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function formatSupply(n: number, exact = false): string {
  if (!Number.isFinite(n)) return "—";
  if (exact) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    });
  }
  return Math.round(n).toLocaleString("en-US");
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatSupply(n);
}

export function OuroSupplySerpent() {
  const [data, setData] = useState<SupplyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displaySupply, setDisplaySupply] = useState(ORIGINAL_SUPPLY);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/token-supply");
        if (!res.ok) throw new Error("could not read supply");
        const j = (await res.json()) as SupplyPayload & { error?: string };
        if (j.error) throw new Error(j.error);
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "supply unavailable");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runAnimation = useCallback((target: SupplyPayload) => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplaySupply(target.current);
      return;
    }

    const t0 = performance.now();

    const tick = (now: number) => {
      const raw = Math.min(1, (now - t0) / ANIM_MS);
      const p = easeOutCubic(raw);
      setDisplaySupply(
        ORIGINAL_SUPPLY - (ORIGINAL_SUPPLY - target.current) * p,
      );
      if (raw < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplaySupply(target.current);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (!data) return;
    runAnimation(data);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [data, runAnimation]);

  const eatenNow = ORIGINAL_SUPPLY - displaySupply;
  const eatenPctNow =
    ORIGINAL_SUPPLY > 0 ? (eatenNow / ORIGINAL_SUPPLY) * 100 : 0;
  const loading = !data && !error;

  return (
    <section
      className={`ouro-supply${loading ? " ouro-supply__loading" : ""}`}
      aria-label="Ouroboros supply consumed"
    >
      <span className="ouro-supply__label">the snake eats its supply</span>

      <div className="ouro-supply__ring">
        <div
          className={`ouro-supply__art${loading ? " ouro-supply__art--loading" : ""}`}
          aria-hidden
        >
          <Image
            src="/image/ouroboros_alpha.png"
            alt=""
            width={520}
            height={520}
            className="ouro-supply__serpent"
            priority
          />
        </div>

        <SupplyCenter
          displaySupply={displaySupply}
          loading={loading}
          error={error}
          eatenPctNow={eatenPctNow}
        />
      </div>

      <div className="ouro-supply__stats">
        <div className="ouro-supply__stat">
          genesis
          <span className="ouro-supply__stat-val">
            {formatCompact(ORIGINAL_SUPPLY)}
          </span>
        </div>
        <div className="ouro-supply__stat ouro-supply__stat--eaten">
          devoured
          <span className="ouro-supply__stat-val">
            {formatCompact(eatenNow)}
          </span>
        </div>
        <div className="ouro-supply__stat">
          living
          <span className="ouro-supply__stat-val">
            {data ? formatSupply(data.current, true) : "…"}
          </span>
        </div>
      </div>
    </section>
  );
}


function SupplyCenter(props: {
  displaySupply: number;
  loading: boolean;
  error: string | null;
  eatenPctNow: number;
}) {
  const { displaySupply, loading, error, eatenPctNow } = props;
  return (
    <div className="ouro-supply__center" aria-live="polite">
      <div className="ouro-supply__readout">
        <span className="ouro-supply__live">
          {error
            ? "—"
            : loading
              ? "reading chain…"
              : formatSupply(displaySupply)}
        </span>
        <span className="ouro-supply__live-sub">
          {error
            ? error
            : loading
              ? "genesis 1,000,000,000"
              : `${eatenPctNow.toFixed(2)}% devoured`}
        </span>
      </div>
    </div>
  );
}
