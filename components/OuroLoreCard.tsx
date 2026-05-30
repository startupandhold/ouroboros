"use client";

import { useEffect, useState } from "react";
import type { CommunityFeedItem } from "@/lib/coinCommunity";

type FeedResponse = {
  items: CommunityFeedItem[];
  communityUrl: string;
  tokenAddress: string;
  error?: string;
};

function formatMark(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "coin communities";
  return d
    .toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .toLowerCase();
}

function handleLabel(item: CommunityFeedItem): string {
  const name = item.displayName?.trim() || item.username;
  return name.startsWith("@") ? name : `@${item.username}`;
}

function profileHref(item: CommunityFeedItem): string | null {
  if (item.userTwitterUrl) return item.userTwitterUrl;
  return null;
}

function LorePost(props: {
  item: CommunityFeedItem;
  communityUrl: string;
}) {
  const { item, communityUrl } = props;
  const href = profileHref(item);

  return (
    <article className="ouro__lorePost">
      <span className="ouro__loreMark">∞ · {formatMark(item.createdAt)}</span>
      <blockquote className="ouro__loreQuote">&ldquo;{item.content}&rdquo;</blockquote>

      {item.mediaUrl ? (
        <a
          href={communityUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ouro__loreMediaLink"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.mediaUrl}
            alt=""
            className="ouro__loreMedia"
            loading="lazy"
          />
        </a>
      ) : null}

      <div className="ouro__loreCite">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="ouro__loreHandle"
          >
            {item.profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.profileImageUrl}
                alt=""
                className="ouro__loreAvatar ouro__loreAvatar--img"
              />
            ) : (
              <span className="ouro__loreAvatar" aria-hidden="true" />
            )}
            <span className="ouro__loreHandleTxt">{handleLabel(item)}</span>
            <span className="ouro__loreLinkArrow" aria-hidden="true">
              ↗
            </span>
          </a>
        ) : (
          <span className="ouro__loreHandle ouro__loreHandle--static">
            {item.profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.profileImageUrl}
                alt=""
                className="ouro__loreAvatar ouro__loreAvatar--img"
              />
            ) : (
              <span className="ouro__loreAvatar" aria-hidden="true" />
            )}
            <span className="ouro__loreHandleTxt">{handleLabel(item)}</span>
          </span>
        )}
        <span className="ouro__loreSep" aria-hidden="true" />
        <span className="ouro__loreSeen">
          {item.likeCount} ❤
          {item.replyCount > 0 ? ` · ${item.replyCount} replies` : ""}
        </span>
      </div>
    </article>
  );
}

export function OuroLoreCard() {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/community-feed", { cache: "no-store" });
        const json = (await res.json()) as FeedResponse;
        if (!res.ok) throw new Error(json.error ?? "failed to load feed");
        if (!cancelled) {
          setData(json);
          setError(json.error ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "failed to load feed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = data?.items ?? [];
  const communityUrl = data?.communityUrl ?? "#";

  return (
    <div className="ouro__loreCard">
      <div className="ouro__loreHead">
        <span className="ouro__loreMark ouro__loreMark--title">
          ∞ coin communities
        </span>
        <a
          href={communityUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ouro__loreJoin"
        >
          join ↗
        </a>
      </div>

      <div className="ouro__loreScroll" aria-live="polite">
        {loading ? (
          <p className="ouro__loreEmpty">loading feed…</p>
        ) : error && items.length === 0 ? (
          <p className="ouro__loreEmpty">{error}</p>
        ) : items.length === 0 ? (
          <p className="ouro__loreEmpty">
            no ouro posts in the feed yet —{" "}
            <a href={communityUrl} target="_blank" rel="noopener noreferrer">
              be the first
            </a>
            .
          </p>
        ) : (
          items.map((item) => (
            <LorePost key={item.id} item={item} communityUrl={communityUrl} />
          ))
        )}
      </div>
    </div>
  );
}
