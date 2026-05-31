"use client";

import { useEffect, useState } from "react";

const PRELOAD_TIMEOUT_MS = 30_000;

function preloadMediaAsset(url: string): Promise<void> {
  return new Promise((resolve) => {
    const isVideo = /\.mp4(\?|$)/i.test(url);
    const el = document.createElement(isVideo ? "video" : "audio");
    el.preload = "auto";
    el.muted = true;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.removeEventListener("canplaythrough", finish);
      el.removeEventListener("error", finish);
      el.src = "";
      el.load();
      resolve();
    };

    const timer = window.setTimeout(finish, PRELOAD_TIMEOUT_MS);
    el.addEventListener("canplaythrough", finish, { once: true });
    el.addEventListener("error", finish, { once: true });
    el.src = url;
    el.load();
  });
}

export function useSnakeMediaPreload(urls: readonly string[]) {
  const [loadedCount, setLoadedCount] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (urls.length === 0) {
      setLoadedCount(0);
      setReady(true);
      return;
    }

    let cancelled = false;
    setLoadedCount(0);
    setReady(false);

    void (async () => {
      await Promise.all(
        urls.map(async (url) => {
          try {
            await preloadMediaAsset(url);
          } finally {
            if (!cancelled) {
              setLoadedCount((count) => count + 1);
            }
          }
        }),
      );
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [urls]);

  const total = urls.length;
  const progress = total === 0 ? 1 : loadedCount / total;

  return { progress, ready, loadedCount, total };
}
