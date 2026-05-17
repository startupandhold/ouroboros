"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { OUROBOROS_MINT } from "@/lib/constants";

type FeedToken = {
  signature: string;
  mint: string;
  symbol?: string;
  name?: string;
  image?: string;
  performedBy: "agent" | "human";
};

type FeedsResponse = {
  feeds: FeedToken[];
  error?: string;
};

const OURO_IMG = "/image/ouroboros_alpha.png";

function FeedPrey(props: {
  feed: FeedToken;
  onCycleEnd: () => void;
}) {
  const { feed, onCycleEnd } = props;
  const [imgOk, setImgOk] = useState(true);
  const [gulp, setGulp] = useState(false);

  useEffect(() => {
    setImgOk(!!feed.image);
    setGulp(false);
    const gulpAt = window.setTimeout(() => setGulp(true), 1600);
    const gulpOff = window.setTimeout(() => setGulp(false), 2000);
    return () => {
      window.clearTimeout(gulpAt);
      window.clearTimeout(gulpOff);
    };
  }, [feed.signature, feed.image]);

  const label = feed.symbol ?? feed.name ?? feed.mint.slice(0, 4);
  const showImg = feed.image && imgOk;

  return (
  <>
      <Image
        src={OURO_IMG}
        alt=""
        width={240}
        height={140}
        className={`ouro-feed-anim__serpent${gulp ? " ouro-feed-anim__serpent--gulp" : ""}`}
        priority
      />
      <div
        className="ouro-feed-anim__prey"
        key={feed.signature}
        aria-hidden
      >
        <span
          className="ouro-feed-anim__prey-orbit"
          onAnimationEnd={onCycleEnd}
        >
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={feed.image}
              alt=""
              className="ouro-feed-anim__prey-img"
              onError={() => setImgOk(false)}
            />
          ) : (
            <span className="ouro-feed-anim__prey-fallback">
              {label.slice(0, 3).toUpperCase()}
            </span>
          )}
        </span>
      </div>
    </>
  );
}

export function OuroborosFeedAnimation() {
  const [feeds, setFeeds] = useState<FeedToken[]>([]);
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const loadFeeds = useCallback(async () => {
    try {
      const res = await fetch("/api/ouro-recent-feeds", { cache: "no-store" });
      const json = (await res.json()) as FeedsResponse;
      if (Array.isArray(json.feeds) && json.feeds.length > 0) {
        setFeeds(json.feeds);
        setIndex(0);
      }
    } catch {
      /* keep prior feeds */
    }
  }, []);

  useEffect(() => {
    void loadFeeds();
    const id = window.setInterval(() => void loadFeeds(), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [loadFeeds]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % Math.max(feeds.length, 1));
  }, [feeds.length]);

  const current = feeds.length > 0 ? feeds[index % feeds.length] : null;
  const ouroMint = OUROBOROS_MINT.toBase58();

  if (feeds.length === 0) {
    return (
      <div
        className="ouro-feed-anim ouro-feed-anim--empty"
        aria-label="Recent tokens fed to the ouroboros"
      >
        <div className="ouro-feed-anim__stage">
          <Image
            src={OURO_IMG}
            alt=""
            width={200}
            height={120}
            className="ouro-feed-anim__serpent"
            priority
          />
        </div>
        <p className="ouro-feed-anim__caption">waiting for the first feed…</p>
      </div>
    );
  }

  if (reducedMotion) {
    return (
      <div
        className="ouro-feed-anim ouro-feed-anim--static"
        aria-label="Last three tokens fed to the ouroboros"
      >
        <div className="ouro-feed-anim__stage ouro-feed-anim__stage--static">
          <Image
            src={OURO_IMG}
            alt=""
            width={160}
            height={96}
            className="ouro-feed-anim__serpent"
          />
          <div className="ouro-feed-anim__static-row">
            {feeds.map((f) => (
              <StaticFeedChip key={f.signature} feed={f} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div
      className="ouro-feed-anim"
      aria-label="Ouroboros eating the last tokens fed to it"
      aria-live="polite"
    >
      <div className="ouro-feed-anim__stage">
        <FeedPrey feed={current} onCycleEnd={advance} />
      </div>
      <p className="ouro-feed-anim__caption">
        devouring{" "}
        <strong>{current.symbol ?? current.name ?? "token"}</strong>
        {current.mint === ouroMint ? " · OURO" : ""}
        <span className="ouro-feed-anim__caption-sub">
          {" "}
          · {index + 1} of {feeds.length} recent feeds
        </span>
      </p>
    </div>
  );
}

function StaticFeedChip({ feed }: { feed: FeedToken }) {
  const [imgOk, setImgOk] = useState(!!feed.image);
  const label = feed.symbol ?? feed.name ?? feed.mint.slice(0, 6);

  return (
    <span className="ouro-feed-anim__chip" title={label}>
      {feed.image && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={feed.image} alt="" onError={() => setImgOk(false)} />
      ) : (
        <span className="ouro-feed-anim__chip-fallback">
          {label.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}
