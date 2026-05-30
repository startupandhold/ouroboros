"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSound from "use-sound";

const GRID = 14;
const TICK_MS = 160;
const INITIAL_SPAWN_MS = 4000;
const SPAWN_SPEEDUP_MS = 200;
const SPAWN_SPEEDUP_EVERY = 4;
const OURO_SPAWN_EVERY = 6;
const MAX_OURO_TOKENS = 5;
const COIN_LIFETIME_MS = 5_000;
const TOKEN_SPAWN_ANIM_MS = 520;
const TOKEN_DESPAWN_ANIM_MS = 560;
const TOKEN_POINTS = 10;
const SELF_EAT_BASE = 50;
const SELF_EAT_BONUS = 10;
const VOID_FIRST_SPAWN_MS = 20_000;
const VOID_SPAWN_INTERVAL_MS = 10_000;
const VOID_SPAWN_DECAY_MS = 200;
const VOID_LIFETIME_MS = 15_000;
const VOID_WARMUP_MS = 2_000;
const VOID_WARN_MS = 3_000;
const VOID_CRITICAL_MS = 1_000;
const SCALE_VOID_WARMUP_MS = 2_000;
const SCALE_VOID_NORMAL_MS = 4_000;
const SCALE_VOID_WARN_MS = 2_000;
const SCALE_VOID_CRITICAL_MS = 2_000;
const SCALE_VOID_TOTAL_MS =
  SCALE_VOID_WARMUP_MS +
  SCALE_VOID_NORMAL_MS +
  SCALE_VOID_WARN_MS +
  SCALE_VOID_CRITICAL_MS;
const VOID_TICK_MS = 100;
const DEATH_ANIM_MS = 880;
const OUROBOROS_IMG = "/image/ouroboros.jpg";
const SNAKE_HEAD_IMG = "/image/snake_head.png";
const SNAKE_BODY_IMG = "/image/snake_body.png";
const SNAKE_TAIL_IMG = "/image/snake_tail.png";
const AUDIO_CHILL = "/audio/theme_chill.mp3";
const AUDIO_CONSUME = "/audio/theme_consume.mp3";
const AUDIO_CHOMP = "/audio/chomp.wav";
const AUDIO_PORTAL_SPAWN = "/audio/portal_spawn.ogg";
const BOARD_AMBIENCE_VIDEO = "/video/spectral_sand_blue.mp4";
const BOARD_AMBIENCE_VOLUME = 0.1;

type Dir = "up" | "down" | "left" | "right";
type Point = { x: number; y: number };

type CoinMeta = {
  image_uri: string;
  name: string;
  symbol: string;
};

type Token = {
  id: string;
  x: number;
  y: number;
  kind: "coin" | "ouroboros";
  image?: string;
  spawnedAt: number;
  permanent?: boolean;
  transforming?: boolean;
  spawning?: boolean;
  despawning?: boolean;
  despawnStartedAt?: number;
};

type StaticSegment = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  kind: "body" | "tail";
};

type DeadScale = {
  id: string;
  x: number;
  y: number;
  rotation: number;
};

type VoidKind = "ambient" | "scale";

type VoidTile = {
  id: string;
  x: number;
  y: number;
  spawnedAt: number;
  kind: VoidKind;
};

type VoidPhase = "warmup" | "normal" | "warning" | "critical";

type GameStatus = "idle" | "playing" | "dying" | "over";

type DeathCause = "void" | "wall" | "self";

type DeathAnim = {
  cause: DeathCause;
  snake: Point[];
  direction: Dir;
  impact: Point;
  hitIndex?: number;
};

type LeaderboardEntry = {
  walletAddress: string;
  bestScore: number;
  achievedAt: string;
};

function shortWallet(address: string) {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function same(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y;
}

function voidSpawnIntervalMs(voidSpawnCount: number) {
  return Math.max(
    2000,
    VOID_SPAWN_INTERVAL_MS - voidSpawnCount * VOID_SPAWN_DECAY_MS,
  );
}

function voidLifetimeMs(voidTile: VoidTile) {
  return voidTile.kind === "scale" ? SCALE_VOID_TOTAL_MS : VOID_LIFETIME_MS;
}

function voidWarmupMs(voidTile: VoidTile) {
  return voidTile.kind === "scale" ? SCALE_VOID_WARMUP_MS : VOID_WARMUP_MS;
}

function voidRemainingMs(voidTile: VoidTile, now = Date.now()) {
  return Math.max(0, voidLifetimeMs(voidTile) - (now - voidTile.spawnedAt));
}

function voidPhase(voidTile: VoidTile, now = Date.now()): VoidPhase {
  const age = now - voidTile.spawnedAt;
  if (age < voidWarmupMs(voidTile)) return "warmup";

  if (voidTile.kind === "scale") {
    const activeAge = age - SCALE_VOID_WARMUP_MS;
    if (activeAge >= SCALE_VOID_NORMAL_MS + SCALE_VOID_WARN_MS) {
      return "critical";
    }
    if (activeAge >= SCALE_VOID_NORMAL_MS) return "warning";
    return "normal";
  }

  const remaining = voidRemainingMs(voidTile, now);
  if (remaining <= VOID_CRITICAL_MS) return "critical";
  if (remaining <= VOID_WARN_MS) return "warning";
  return "normal";
}

function voidIsDeadly(voidTile: VoidTile, now = Date.now()) {
  return (
    voidRemainingMs(voidTile, now) > 0 &&
    now - voidTile.spawnedAt >= voidWarmupMs(voidTile)
  );
}

function occupiedCells(
  snake: Point[],
  tokens: Token[],
  deadScales: DeadScale[] = [],
  staticBody: StaticSegment[] = [],
  voidTiles: VoidTile[] = [],
): Set<string> {
  return new Set([
    ...snake.map((s) => `${s.x},${s.y}`),
    ...tokens.map((t) => `${t.x},${t.y}`),
    ...deadScales.map((d) => `${d.x},${d.y}`),
    ...staticBody.map((s) => `${s.x},${s.y}`),
    ...voidTiles.map((v) => `${v.x},${v.y}`),
  ]);
}

function randomEmpty(
  snake: Point[],
  tokens: Token[],
  deadScales: DeadScale[] = [],
  staticBody: StaticSegment[] = [],
  voidTiles: VoidTile[] = [],
): Point | null {
  const occupied = occupiedCells(
    snake,
    tokens,
    deadScales,
    staticBody,
    voidTiles,
  );
  const open: Point[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!occupied.has(`${x},${y}`)) open.push({ x, y });
    }
  }
  if (open.length === 0) return null;
  return open[Math.floor(Math.random() * open.length)];
}

function countOuroTokens(tokens: Token[]) {
  return tokens.filter(
    (t) => t.kind === "ouroboros" && !t.despawning,
  ).length;
}

function spawnToken(
  snake: Point[],
  tokens: Token[],
  coins: CoinMeta[],
  kind: "coin" | "ouroboros",
  deadScales: DeadScale[] = [],
  staticBody: StaticSegment[] = [],
  voidTiles: VoidTile[] = [],
): Token | null {
  if (kind === "ouroboros" && countOuroTokens(tokens) >= MAX_OURO_TOKENS) {
    return null;
  }
  const spot = randomEmpty(
    snake,
    tokens,
    deadScales,
    staticBody,
    voidTiles,
  );
  if (!spot) return null;
  const now = Date.now();
  const coin =
    kind === "coin" && coins.length > 0
      ? coins[Math.floor(Math.random() * coins.length)]
      : null;
  return {
    id: `${kind}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    x: spot.x,
    y: spot.y,
    kind,
    image: kind === "coin" ? coin?.image_uri : OUROBOROS_IMG,
    spawnedAt: now,
    spawning: true,
  };
}

function spawnVoid(
  snake: Point[],
  tokens: Token[],
  deadScales: DeadScale[],
  staticBody: StaticSegment[],
  voidTiles: VoidTile[],
): VoidTile | null {
  const spot = randomEmpty(
    snake,
    tokens,
    deadScales,
    staticBody,
    voidTiles,
  );
  if (!spot) return null;
  return {
    id: `void-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    x: spot.x,
    y: spot.y,
    spawnedAt: Date.now(),
    kind: "ambient",
  };
}

function spawnIntervalMs(tokensEaten: number) {
  const steps = Math.floor(tokensEaten / SPAWN_SPEEDUP_EVERY);
  return Math.max(1500, INITIAL_SPAWN_MS - steps * SPAWN_SPEEDUP_MS);
}

function selfEatPointsPerSegment(ouroborosEaten: number) {
  return SELF_EAT_BASE + (ouroborosEaten - 1) * SELF_EAT_BONUS;
}

function dirDelta(dir: Dir): Point {
  switch (dir) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}

function isOpposite(a: Dir, b: Dir) {
  return (
    (a === "up" && b === "down") ||
    (a === "down" && b === "up") ||
    (a === "left" && b === "right") ||
    (a === "right" && b === "left")
  );
}

function keyToDir(key: string): Dir | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    default:
      return null;
  }
}

function dirToRotation(dir: Dir): number {
  switch (dir) {
    case "down":
      return 0;
    case "up":
      return 180;
    case "right":
      return -90;
    case "left":
      return 90;
  }
}

function downTextureRotation(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 1) return 0;
  if (dx === 0 && dy === -1) return 180;
  if (dx === 1 && dy === 0) return -90;
  if (dx === -1 && dy === 0) return 90;
  return 0;
}

function upTextureRotation(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === -1) return 0;
  if (dx === 0 && dy === 1) return 180;
  if (dx === 1 && dy === 0) return 90;
  if (dx === -1 && dy === 0) return -90;
  return 0;
}

function snakeSegmentSprite(
  snake: Point[],
  segIndex: number,
  direction: Dir,
): { src: string; rotation: number } {
  if (segIndex === 0) {
    return { src: SNAKE_HEAD_IMG, rotation: dirToRotation(direction) };
  }
  if (segIndex === snake.length - 1) {
    return {
      src: SNAKE_TAIL_IMG,
      rotation: downTextureRotation(
        snake[segIndex - 1],
        snake[segIndex],
      ),
    };
  }
  return {
    src: SNAKE_BODY_IMG,
    rotation: upTextureRotation(snake[segIndex], snake[segIndex - 1]),
  };
}

function bodyToStaticSegments(snake: Point[]): StaticSegment[] {
  if (snake.length <= 1) return [];
  const stamp = Date.now();
  return snake.slice(1).map((segment, index) => {
    const segIndex = index + 1;
    const isTail = segIndex === snake.length - 1;
    return {
      id: `static-${stamp}-${segIndex}`,
      x: segment.x,
      y: segment.y,
      rotation: isTail
        ? downTextureRotation(snake[segIndex - 1], segment)
        : upTextureRotation(segment, snake[segIndex - 1]),
      kind: isTail ? "tail" : "body",
    };
  });
}

function bodyRotationForDir(dir: Dir): number {
  switch (dir) {
    case "up":
      return 0;
    case "down":
      return 180;
    case "right":
      return 90;
    case "left":
      return -90;
  }
}

function trailFromDirection(from: Point, dir: Dir): DeadScale {
  return {
    id: `trail-${Date.now()}-${from.x}-${from.y}-${Math.random().toString(36).slice(2, 6)}`,
    x: from.x,
    y: from.y,
    rotation: bodyRotationForDir(dir),
  };
}

function appendTrail(
  from: Point,
  dir: Dir,
  scales: DeadScale[],
): DeadScale[] {
  const trail = trailFromDirection(from, dir);
  const without = scales.filter(
    (d) => !(d.x === from.x && d.y === from.y),
  );
  return [...without, trail];
}

function deadScalesToScaleVoids(scales: DeadScale[]): VoidTile[] {
  const now = Date.now();
  return scales.map((d) => ({
    id: `scale-void-${d.id}`,
    x: d.x,
    y: d.y,
    spawnedAt: now,
    kind: "scale" as const,
  }));
}

function maintainTokens(tokens: Token[], now: number): Token[] {
  let changed = false;
  const mapped = tokens.map((t) => {
    if (
      t.kind === "coin" &&
      !t.permanent &&
      !t.despawning &&
      !t.transforming &&
      now - t.spawnedAt >= COIN_LIFETIME_MS
    ) {
      changed = true;
      return { ...t, despawning: true, despawnStartedAt: now };
    }
    if (t.spawning && now - t.spawnedAt >= TOKEN_SPAWN_ANIM_MS) {
      changed = true;
      return { ...t, spawning: false };
    }
    return t;
  });
  const filtered = mapped.filter(
    (t) =>
      !t.despawning ||
      !t.despawnStartedAt ||
      now - t.despawnStartedAt < TOKEN_DESPAWN_ANIM_MS,
  );
  if (filtered.length !== mapped.length) changed = true;
  return changed ? filtered : tokens;
}

function initialSnake(): Point[] {
  const mid = Math.floor(GRID / 2);
  return [{ x: mid, y: mid }];
}

export function OuroSnakeGame() {
  const { publicKey } = useWallet();
  const [walletUiReady, setWalletUiReady] = useState(false);
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [scoreSaved, setScoreSaved] = useState(false);
  const [scoreSaving, setScoreSaving] = useState(false);
  const submittedGameOverRef = useRef(false);

  const [coins, setCoins] = useState<CoinMeta[]>([]);
  const [coinsLoading, setCoinsLoading] = useState(true);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [snake, setSnake] = useState<Point[]>(initialSnake);
  const [direction, setDirection] = useState<Dir>("right");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [score, setScore] = useState(0);
  const [tokensEaten, setTokensEaten] = useState(0);
  const [ouroborosEaten, setOuroborosEaten] = useState(0);
  const [selfEatActive, setSelfEatActive] = useState(false);
  const [selfEatStarted, setSelfEatStarted] = useState(false);
  const [staticBody, setStaticBody] = useState<StaticSegment[]>([]);
  const [deadScales, setDeadScales] = useState<DeadScale[]>([]);
  const [voidTiles, setVoidTiles] = useState<VoidTile[]>([]);
  const [voidClock, setVoidClock] = useState(0);
  const [spawnTimerActive, setSpawnTimerActive] = useState(false);
  const [deathAnim, setDeathAnim] = useState<DeathAnim | null>(null);

  const directionRef = useRef<Dir>("right");
  const pendingDirRef = useRef<Dir | null>(null);
  const snakeRef = useRef(snake);
  const tokensRef = useRef(tokens);
  const staticBodyRef = useRef(staticBody);
  const deadScalesRef = useRef(deadScales);
  const voidTilesRef = useRef(voidTiles);
  const voidSpawnCountRef = useRef(0);
  const nextVoidSpawnAtRef = useRef(0);
  const voidTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef(status);
  const tokensEatenRef = useRef(0);
  const ouroborosEatenRef = useRef(0);
  const selfEatActiveRef = useRef(false);
  const selfEatStartedRef = useRef(false);
  const coinsRef = useRef<CoinMeta[]>([]);
  const spawnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playChompRef = useRef<() => void>(() => {});
  const playPortalSpawnRef = useRef<() => void>(() => {});
  const chillStartedRef = useRef(false);
  const chillPausedRef = useRef(false);
  const boardAmbienceRef = useRef<HTMLVideoElement>(null);
  const deathAnimRef = useRef<DeathAnim | null>(null);

  const [playChomp] = useSound(AUDIO_CHOMP, { volume: 0.65, interrupt: true });
  const [playPortalSpawn] = useSound(AUDIO_PORTAL_SPAWN, { volume: 0.7 });
  const [playChill, { stop: stopChill, pause: pauseChill }] = useSound(AUDIO_CHILL, {
    volume: 0.35,
    loop: true,
  });
  const [playConsume, { stop: stopConsume }] = useSound(AUDIO_CONSUME, {
    volume: 0.4,
    loop: true,
  });

  playChompRef.current = playChomp;
  playPortalSpawnRef.current = playPortalSpawn;

  snakeRef.current = snake;
  tokensRef.current = tokens;
  staticBodyRef.current = staticBody;
  deadScalesRef.current = deadScales;
  voidTilesRef.current = voidTiles;
  statusRef.current = status;
  tokensEatenRef.current = tokensEaten;
  ouroborosEatenRef.current = ouroborosEaten;
  selfEatActiveRef.current = selfEatActive;
  selfEatStartedRef.current = selfEatStarted;
  coinsRef.current = coins;
  deathAnimRef.current = deathAnim;

  const displaySnake = useMemo(() => {
    if (!deathAnim) return snake;
    if (deathAnim.cause === "void" || deathAnim.cause === "self") {
      return [deathAnim.impact, ...deathAnim.snake.slice(1)];
    }
    return deathAnim.snake;
  }, [deathAnim, snake]);

  const displayDirection = deathAnim?.direction ?? direction;
  const isDying = status === "dying";

  const currentSpawnMs = useMemo(
    () => spawnIntervalMs(tokensEaten),
    [tokensEaten],
  );

  useEffect(() => setWalletUiReady(true), []);

  const refreshLeaderboard = useCallback(async (wallet?: string) => {
    try {
      const params = new URLSearchParams({ limit: "10" });
      if (wallet) params.set("wallet", wallet);
      const res = await fetch(`/api/snake-highscore?${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        leaderboard?: LeaderboardEntry[];
        bestScore?: number | null;
      };
      if (data.leaderboard) setLeaderboard(data.leaderboard);
      if (wallet && data.bestScore !== undefined) {
        setPersonalBest(data.bestScore);
      }
    } catch {
      /* ignore fetch errors */
    }
  }, []);

  useEffect(() => {
    void refreshLeaderboard();
  }, [refreshLeaderboard]);

  useEffect(() => {
    if (!publicKey) {
      setPersonalBest(null);
      return;
    }
    void refreshLeaderboard(publicKey.toBase58());
  }, [publicKey, refreshLeaderboard]);

  useEffect(() => {
    if (status !== "over") {
      submittedGameOverRef.current = false;
      setScoreSaved(false);
      setScoreSaving(false);
      return;
    }
    if (!publicKey || submittedGameOverRef.current) return;

    submittedGameOverRef.current = true;
    const walletAddress = publicKey.toBase58();

    if (personalBest !== null && score <= personalBest) return;

    setScoreSaving(true);
    void (async () => {
      try {
        const res = await fetch("/api/snake-highscore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress, score }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          bestScore?: number;
          isNewBest?: boolean;
        };
        if (data.ok && typeof data.bestScore === "number") {
          setPersonalBest(data.bestScore);
          if (data.isNewBest) setScoreSaved(true);
          await refreshLeaderboard(walletAddress);
        }
      } catch {
        /* ignore submit errors */
      } finally {
        setScoreSaving(false);
      }
    })();
  }, [status, publicKey, score, personalBest, refreshLeaderboard]);

  useEffect(() => {
    const video = boardAmbienceRef.current;
    if (!video) return;
    video.loop = true;
    video.volume = BOARD_AMBIENCE_VOLUME;
    video.muted = true;
    void video.play().catch(() => {
      /* autoplay blocked until user gesture */
    });
  }, []);

  useEffect(() => {
    const video = boardAmbienceRef.current;
    if (!video) return;
    if (status !== "playing" && status !== "dying") return;
    video.volume = BOARD_AMBIENCE_VOLUME;
    video.muted = false;
    void video.play().catch(() => {
      /* ignore play errors */
    });
  }, [status]);

  useEffect(() => {
    if (status !== "playing") {
      stopChill();
      stopConsume();
      chillStartedRef.current = false;
      chillPausedRef.current = false;
      return;
    }
    if (selfEatActive) {
      if (chillStartedRef.current && !chillPausedRef.current) {
        pauseChill();
        chillPausedRef.current = true;
      }
      playConsume();
      return;
    }

    stopConsume();
    if (!chillStartedRef.current) {
      playChill();
      chillStartedRef.current = true;
    } else if (chillPausedRef.current) {
      playChill();
      chillPausedRef.current = false;
    }
  }, [
    status,
    selfEatActive,
    playChill,
    pauseChill,
    stopChill,
    playConsume,
    stopConsume,
  ]);

  useEffect(
    () => () => {
      stopChill();
      stopConsume();
    },
    [stopChill, stopConsume],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/great-coins");
        const data = (await res.json()) as { coins: CoinMeta[] };
        if (!cancelled && data.coins?.length) setCoins(data.coins);
      } catch {
        /* keep empty fallback */
      } finally {
        if (!cancelled) setCoinsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearSpawnTimer = useCallback(() => {
    if (spawnTimerRef.current) {
      clearInterval(spawnTimerRef.current);
      spawnTimerRef.current = null;
    }
  }, []);

  const clearVoidTimer = useCallback(() => {
    if (voidTimerRef.current) {
      clearInterval(voidTimerRef.current);
      voidTimerRef.current = null;
    }
  }, []);

  const scheduleNextVoidSpawn = useCallback((fromMs = Date.now()) => {
    nextVoidSpawnAtRef.current =
      fromMs + voidSpawnIntervalMs(voidSpawnCountRef.current);
  }, []);

  const trySpawnVoid = useCallback(() => {
    const next = spawnVoid(
      snakeRef.current,
      tokensRef.current,
      deadScalesRef.current,
      staticBodyRef.current,
      voidTilesRef.current,
    );
    if (!next) return false;
    voidSpawnCountRef.current += 1;
    const merged = [...voidTilesRef.current, next];
    voidTilesRef.current = merged;
    setVoidTiles(merged);
    scheduleNextVoidSpawn(next.spawnedAt);
    playPortalSpawnRef.current();
    return true;
  }, [scheduleNextVoidSpawn]);

  const startSpawnTimer = useCallback(() => {
    clearSpawnTimer();
    const interval = spawnIntervalMs(tokensEatenRef.current);
    spawnTimerRef.current = setInterval(() => {
      if (statusRef.current !== "playing") return;
      setTokens((prev) => {
        const next = spawnToken(
          snakeRef.current,
          prev,
          coinsRef.current,
          "coin",
          deadScalesRef.current,
          staticBodyRef.current,
          voidTilesRef.current,
        );
        return next ? [...prev, next] : prev;
      });
    }, interval);
    setSpawnTimerActive(true);
  }, [clearSpawnTimer]);

  useEffect(() => {
    if (!spawnTimerActive || status !== "playing") return;
    startSpawnTimer();
    return clearSpawnTimer;
  }, [currentSpawnMs, spawnTimerActive, status, startSpawnTimer, clearSpawnTimer]);

  const resetGame = useCallback(() => {
    clearSpawnTimer();
    clearVoidTimer();
    const startSnake = initialSnake();
    snakeRef.current = startSnake;
    directionRef.current = "right";
    pendingDirRef.current = null;
    tokensEatenRef.current = 0;
    ouroborosEatenRef.current = 0;
    selfEatActiveRef.current = false;
    selfEatStartedRef.current = false;
    staticBodyRef.current = [];
    deadScalesRef.current = [];
    voidTilesRef.current = [];
    voidSpawnCountRef.current = 0;
    const startAt = Date.now();
    nextVoidSpawnAtRef.current = startAt + VOID_FIRST_SPAWN_MS;
    setSnake(startSnake);
    setDirection("right");
    setScore(0);
    setTokensEaten(0);
    setOuroborosEaten(0);
    setSelfEatActive(false);
    setSelfEatStarted(false);
    setStaticBody([]);
    setDeadScales([]);
    setVoidTiles([]);
    setVoidClock(0);
    setSpawnTimerActive(false);
    deathAnimRef.current = null;
    setDeathAnim(null);
    const first =
      spawnToken(startSnake, [], coinsRef.current, "coin", [], [], []) ??
      ({
        id: "fallback",
        x: 0,
        y: 0,
        kind: "coin" as const,
        image: OUROBOROS_IMG,
        spawnedAt: Date.now(),
        spawning: true,
      } satisfies Token);
    setTokens([{ ...first, permanent: true }]);
    setStatus("playing");
  }, [clearSpawnTimer, clearVoidTimer]);

  const gameOver = useCallback(() => {
    deathAnimRef.current = null;
    setDeathAnim(null);
    setStatus("over");
  }, []);

  const triggerDeath = useCallback(
    (cause: DeathCause, impact: Point, hitIndex?: number) => {
      clearSpawnTimer();
      clearVoidTimer();
      setSpawnTimerActive(false);
      const nextDeath: DeathAnim = {
        cause,
        snake: [...snakeRef.current],
        direction: directionRef.current,
        impact,
        hitIndex,
      };
      deathAnimRef.current = nextDeath;
      setDeathAnim(nextDeath);
      setStatus("dying");
    },
    [clearSpawnTimer, clearVoidTimer],
  );

  useEffect(() => {
    if (status !== "dying") return;
    const id = window.setTimeout(() => gameOver(), DEATH_ANIM_MS);
    return () => window.clearTimeout(id);
  }, [status, gameOver]);

  const finishSelfDevour = useCallback(
    (scales: DeadScale[], nextHead: Point, ateToken: Token | null) => {
      const spawnedVoids = deadScalesToScaleVoids(scales);

      selfEatActiveRef.current = false;
      selfEatStartedRef.current = false;
      staticBodyRef.current = [];
      deadScalesRef.current = [];
      setSelfEatActive(false);
      setSelfEatStarted(false);
      setStaticBody([]);
      setDeadScales([]);

      if (spawnedVoids.length > 0) {
        const mergedVoids = [...voidTilesRef.current, ...spawnedVoids];
        voidTilesRef.current = mergedVoids;
        setVoidTiles(mergedVoids);
        playPortalSpawnRef.current();
      }

      let nextTokens = tokensRef.current;

      if (ateToken?.kind === "coin") {
        nextTokens = nextTokens.filter((t) => t.id !== ateToken.id);
        playChompRef.current();
        setScore((s) => s + TOKEN_POINTS);
        const eaten = tokensEatenRef.current + 1;
        tokensEatenRef.current = eaten;
        setTokensEaten(eaten);

        const immediate = spawnToken(
          [nextHead],
          nextTokens,
          coinsRef.current,
          "coin",
          [],
          [],
          voidTilesRef.current,
        );
        if (immediate) nextTokens = [...nextTokens, immediate];

        if (eaten % OURO_SPAWN_EVERY === 0) {
          const ouro = spawnToken(
            [nextHead],
            nextTokens,
            coinsRef.current,
            "ouroboros",
            [],
            [],
            voidTilesRef.current,
          );
          if (ouro) nextTokens = [...nextTokens, ouro];
        }

        if (!spawnTimerActive) {
          setSpawnTimerActive(true);
        } else {
          startSpawnTimer();
        }
      }

      tokensRef.current = nextTokens;
      setTokens(nextTokens);
      snakeRef.current = [nextHead];
      setSnake([nextHead]);
    },
    [spawnTimerActive, startSpawnTimer],
  );

  const applyDirection = useCallback((dir: Dir) => {
    const current = pendingDirRef.current ?? directionRef.current;
    if (!isOpposite(current, dir)) {
      pendingDirRef.current = dir;
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = keyToDir(e.key);
      if (!dir) return;
      e.preventDefault();
      if (statusRef.current === "idle") {
        resetGame();
        return;
      }
      if (statusRef.current === "over" || statusRef.current === "dying") return;
      applyDirection(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyDirection, resetGame]);

  useEffect(() => {
    const hasTransforming = tokens.some((t) => t.transforming);
    if (!hasTransforming) return;
    const id = window.setTimeout(() => {
      setTokens((prev) => {
        const next = prev.map((t) =>
          t.transforming
            ? { ...t, transforming: false, spawnedAt: Date.now() }
            : t,
        );
        tokensRef.current = next;
        return next;
      });
    }, 720);
    return () => window.clearTimeout(id);
  }, [tokens]);

  useEffect(() => {
    if (status !== "playing") {
      clearVoidTimer();
      return;
    }

    voidTimerRef.current = setInterval(() => {
      if (statusRef.current !== "playing") return;

      const now = Date.now();
      const active = voidTilesRef.current.filter(
        (v) => voidRemainingMs(v, now) > 0,
      );
      if (active.length !== voidTilesRef.current.length) {
        voidTilesRef.current = active;
        setVoidTiles(active);
      }

      if (now >= nextVoidSpawnAtRef.current) {
        if (!trySpawnVoid()) {
          nextVoidSpawnAtRef.current = now + 1000;
        }
      }

      const maintained = maintainTokens(tokensRef.current, now);
      if (maintained !== tokensRef.current) {
        tokensRef.current = maintained;
        setTokens(maintained);
      }

      setVoidClock(now);
    }, VOID_TICK_MS);

    return clearVoidTimer;
  }, [status, clearVoidTimer, trySpawnVoid]);

  useEffect(() => {
    if (status !== "playing") return;

    const id = setInterval(() => {
      if (statusRef.current !== "playing") return;

      if (pendingDirRef.current) {
        directionRef.current = pendingDirRef.current;
        pendingDirRef.current = null;
        setDirection(directionRef.current);
      }

      const dir = directionRef.current;
      const delta = dirDelta(dir);
      const body = snakeRef.current;
      const head = body[0];
      const nextHead = { x: head.x + delta.x, y: head.y + delta.y };

      if (
        nextHead.x < 0 ||
        nextHead.x >= GRID ||
        nextHead.y < 0 ||
        nextHead.y >= GRID
      ) {
        triggerDeath("wall", head);
        return;
      }

      const hitVoid = voidTilesRef.current.find((v) => same(v, nextHead));
      if (hitVoid && voidIsDeadly(hitVoid)) {
        triggerDeath("void", nextHead);
        return;
      }

      const hitToken = tokensRef.current.find(
        (t) => same(t, nextHead) && !t.despawning,
      );

      if (hitToken?.kind === "ouroboros") {
        const frozen = bodyToStaticSegments(body);
        const nextTokens = tokensRef.current.filter((t) => t.id !== hitToken.id);
        tokensRef.current = nextTokens;
        setTokens(nextTokens);

        const count = ouroborosEatenRef.current + 1;
        ouroborosEatenRef.current = count;
        setOuroborosEaten(count);

        if (frozen.length > 0) {
          staticBodyRef.current = frozen;
          setStaticBody(frozen);
          const initialTrail = appendTrail(body[0], dir, []);
          deadScalesRef.current = initialTrail;
          setDeadScales(initialTrail);
          selfEatActiveRef.current = true;
          selfEatStartedRef.current = false;
          setSelfEatActive(true);
          setSelfEatStarted(false);
        }

        snakeRef.current = [nextHead];
        setSnake([nextHead]);
        return;
      }

      let ateToken: Token | null = hitToken ?? null;
      let grow = false;

      if (hitToken) {
        if (hitToken.kind === "coin" && !selfEatActiveRef.current) grow = true;
      }

      if (selfEatActiveRef.current) {
        const scales = deadScalesRef.current;
        const staticSegments = staticBodyRef.current;

        const deadHit = scales.find((d) => same(d, nextHead));
        if (deadHit) {
          triggerDeath("self", nextHead);
          return;
        }

        const staticHit = staticSegments.find((s) => same(s, nextHead));
        if (staticHit) {
          const eatableTail = staticSegments[staticSegments.length - 1];
          if (eatableTail && same(staticHit, eatableTail)) {
            const pts = selfEatPointsPerSegment(ouroborosEatenRef.current);
            setScore((s) => s + pts);
            selfEatStartedRef.current = true;
            setSelfEatStarted(true);
            const remaining = staticSegments.slice(0, -1);
            staticBodyRef.current = remaining;
            setStaticBody(remaining);
            const updatedScales = appendTrail(head, dir, scales);
            if (remaining.length === 0) {
              finishSelfDevour(updatedScales, nextHead, null);
            } else {
              deadScalesRef.current = updatedScales;
              setDeadScales(updatedScales);
              snakeRef.current = [nextHead];
              setSnake([nextHead]);
            }
            return;
          }
          triggerDeath("self", nextHead);
          return;
        }

        if (selfEatStartedRef.current) {
          const onStaticBody = staticSegments.some((s) => same(s, nextHead));
          if (!onStaticBody) {
            finishSelfDevour(
              appendTrail(head, dir, scales),
              nextHead,
              ateToken,
            );
            return;
          }
        }

        deadScalesRef.current = appendTrail(head, dir, scales);
        setDeadScales(deadScalesRef.current);
        snakeRef.current = [nextHead];
        setSnake([nextHead]);

        if (ateToken) {
          const nextTokens = tokensRef.current.filter(
            (t) => t.id !== ateToken!.id,
          );
          if (ateToken.kind === "coin") {
            playChompRef.current();
            setScore((s) => s + TOKEN_POINTS);
            const eaten = tokensEatenRef.current + 1;
            tokensEatenRef.current = eaten;
            setTokensEaten(eaten);

            const immediate = spawnToken(
              [nextHead],
              nextTokens,
              coinsRef.current,
              "coin",
              deadScalesRef.current,
              staticBodyRef.current,
              voidTilesRef.current,
            );
            if (immediate) nextTokens.push(immediate);

            if (eaten % OURO_SPAWN_EVERY === 0) {
              const ouro = spawnToken(
                [nextHead],
                nextTokens,
                coinsRef.current,
                "ouroboros",
                deadScalesRef.current,
                staticBodyRef.current,
                voidTilesRef.current,
              );
              if (ouro) nextTokens.push(ouro);
            }

            if (!spawnTimerActive) {
              setSpawnTimerActive(true);
            } else {
              startSpawnTimer();
            }
          }
          tokensRef.current = nextTokens;
          setTokens(nextTokens);
        }
        return;
      } else {
        const hitBodyIndex = body.findIndex((s, i) => i > 0 && same(s, nextHead));
        if (hitBodyIndex > 0) {
          triggerDeath("self", nextHead, hitBodyIndex);
          return;
        }
      }

      let nextSnake: Point[];
      if (grow) {
        nextSnake = [nextHead, ...body];
      } else {
        nextSnake = [nextHead, ...body.slice(0, -1)];
      }

      snakeRef.current = nextSnake;
      setSnake(nextSnake);

      if (ateToken) {
        let nextTokens = tokensRef.current.filter((t) => t.id !== ateToken!.id);

        if (ateToken.kind === "coin") {
          playChompRef.current();
          setScore((s) => s + TOKEN_POINTS);
          const eaten = tokensEatenRef.current + 1;
          tokensEatenRef.current = eaten;
          setTokensEaten(eaten);

          const immediate = spawnToken(
            nextSnake,
            nextTokens,
            coinsRef.current,
            "coin",
            deadScalesRef.current,
            staticBodyRef.current,
            voidTilesRef.current,
          );
          if (immediate) nextTokens = [...nextTokens, immediate];

          if (eaten % OURO_SPAWN_EVERY === 0) {
            const ouro = spawnToken(
              nextSnake,
              nextTokens,
              coinsRef.current,
              "ouroboros",
              deadScalesRef.current,
              staticBodyRef.current,
              voidTilesRef.current,
            );
            if (ouro) nextTokens = [...nextTokens, ouro];
          }

          if (!spawnTimerActive) {
            setSpawnTimerActive(true);
          } else {
            startSpawnTimer();
          }
        }

        tokensRef.current = nextTokens;
        setTokens(nextTokens);
      }

    }, TICK_MS);

    return () => clearInterval(id);
  }, [
    status,
    finishSelfDevour,
    triggerDeath,
    spawnTimerActive,
    startSpawnTimer,
  ]);

  const handlePad = (dir: Dir) => {
    if (status === "idle") {
      resetGame();
      applyDirection(dir);
      return;
    }
    if (status === "over" || status === "dying") return;
    applyDirection(dir);
  };

  const selfEatRate = selfEatPointsPerSegment(Math.max(1, ouroborosEaten));
  const connectedWallet = publicKey?.toBase58() ?? null;

  return (
    <div className="app-shell ouro-snake">
      <header className="top-bar">
        <Link href="/">← back</Link>
        <span>ouroboros snake</span>
        <div className="ouro-snake__top-end">
          {walletUiReady && (
            <WalletMultiButton className="ouro-snake__wallet-btn" />
          )}
        </div>
      </header>

      <div className="ouro-snake__hero">
        <h1 className="hero-logo">Devour the Cycle</h1>
        <p className="ouro-snake__subtitle">
          Eat pump tokens. Every 6 feeds summons a glowing ouroboros — then you
          may consume yourself, tail first.
        </p>
      </div>

      <div className="ouro-snake__layout">
        <div className="ouro-snake__board-wrap">
          <div
            className={[
              "ouro-snake__board",
              selfEatActive && !isDying ? "ouro-snake__board--self-devour" : "",
              deathAnim?.cause === "void"
                ? "ouro-snake__board--death-void"
                : "",
              deathAnim?.cause === "wall"
                ? "ouro-snake__board--death-wall"
                : "",
              deathAnim?.cause === "self"
                ? "ouro-snake__board--death-self"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              {
                "--grid": GRID,
                ...(deathAnim?.cause === "wall"
                  ? {
                      "--death-dir-x": dirDelta(displayDirection).x,
                      "--death-dir-y": dirDelta(displayDirection).y,
                    }
                  : {}),
              } as React.CSSProperties
            }
            role="grid"
            aria-label="Snake game board"
          >
            <video
              ref={boardAmbienceRef}
              className="ouro-snake__board-bg-video"
              src={BOARD_AMBIENCE_VIDEO}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              aria-hidden
            />
            <div className="ouro-snake__board-bg-scrim" aria-hidden />
            {selfEatActive && !isDying && (
              <div className="ouro-snake__ripple" aria-hidden />
            )}
            {Array.from({ length: GRID * GRID }).map((_, i) => {
              const x = i % GRID;
              const y = Math.floor(i / GRID);
              const center = Math.floor(GRID / 2);
              const segIndex = displaySnake.findIndex((s) => s.x === x && s.y === y);
              const isHead = segIndex === 0;
              const token = tokens.find((t) => t.x === x && t.y === y);
              const voidTile = voidTiles.find((v) => v.x === x && v.y === y);
              const voidVisualPhase = voidTile
                ? voidPhase(voidTile, voidClock || Date.now())
                : null;
              const rippleDelay = selfEatActive
                ? Math.hypot(x - center, y - center) * 0.055
                : 0;
              const segment =
                segIndex >= 0
                  ? snakeSegmentSprite(displaySnake, segIndex, displayDirection)
                  : null;
              const deathCause = deathAnim?.cause;
              const deathDelay =
                deathAnim && segIndex >= 0
                  ? deathAnim.hitIndex != null
                    ? Math.abs(segIndex - deathAnim.hitIndex) * 0.055
                    : segIndex * 0.06
                  : 0;
              const wallHeadAxis =
                deathCause === "wall" && isHead
                  ? dirDelta(displayDirection).x !== 0
                    ? "x"
                    : "y"
                  : null;

              return (
                <div
                  key={`${x}-${y}`}
                  className={[
                    "ouro-snake__cell",
                    segIndex >= 0 ? "ouro-snake__cell--snake" : "",
                    selfEatActive && isHead && !isDying
                      ? "ouro-snake__cell--head-devour"
                      : "",
                    isHead ? "ouro-snake__cell--head" : "",
                    voidVisualPhase
                      ? `ouro-snake__cell--void ouro-snake__cell--void-${voidVisualPhase}`
                      : "",
                    selfEatActive && !isDying ? "ouro-snake__cell--ripple" : "",
                    isDying && deathCause === "void" && voidTile
                      ? "ouro-snake__cell--death-void-impact"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={
                    selfEatActive && !isDying
                      ? ({
                          "--ripple-delay": `${rippleDelay}s`,
                        } as React.CSSProperties)
                      : isDying && deathCause
                        ? ({
                            "--death-delay": `${deathDelay}s`,
                          } as React.CSSProperties)
                        : undefined
                  }
                >
                  {voidTile && (
                    <div
                      className={[
                        "ouro-snake__void",
                        `ouro-snake__void--${voidVisualPhase}`,
                        voidTile.kind === "scale" ? "ouro-snake__void--scale" : "",
                        isDying && deathCause === "void"
                          ? "ouro-snake__void--death-consume"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-hidden
                    />
                  )}
                  {segment && (
                    <div
                      className={[
                        "ouro-snake__segment",
                        selfEatActive && isHead && !isDying
                          ? "ouro-snake__segment--devour"
                          : "",
                        deathCause
                          ? `ouro-snake__segment--death-${deathCause}`
                          : "",
                        deathCause === "wall" && isHead && wallHeadAxis
                          ? `ouro-snake__segment--death-wall-head-${wallHeadAxis}`
                          : "",
                        deathCause === "void" && isHead
                          ? "ouro-snake__segment--death-void-head"
                          : "",
                        deathCause === "self" && isHead
                          ? "ouro-snake__segment--death-self-head"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ transform: `rotate(${segment.rotation}deg)` }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={segment.src}
                        alt=""
                        className="ouro-snake__segment-img"
                        draggable={false}
                      />
                    </div>
                  )}
                  {token && (
                    <div
                      className={[
                        "ouro-snake__token",
                        token.kind === "ouroboros"
                          ? "ouro-snake__token--ouroboros"
                          : "",
                        token.transforming
                          ? "ouro-snake__token--from-dead"
                          : "",
                        token.spawning && !token.transforming
                          ? "ouro-snake__token--spawn"
                          : "",
                        token.despawning
                          ? "ouro-snake__token--despawn"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={
                        token.transforming
                          ? ({
                              "--transform-delay": `${tokens.filter((t) => t.transforming).findIndex((t) => t.id === token.id) * 0.05}s`,
                            } as React.CSSProperties)
                          : undefined
                      }
                    >
                      {token.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={token.image}
                          alt=""
                          className="ouro-snake__token-img"
                          draggable={false}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {staticBody.length > 0 && (
              <div className="ouro-snake__static-layer" aria-hidden>
                {staticBody.map((segment) => {
                  const isEatableTail =
                    segment.id === staticBody[staticBody.length - 1].id;
                  return (
                    <div
                      key={segment.id}
                      className="ouro-snake__static-cell"
                      style={{
                        gridColumn: segment.x + 1,
                        gridRow: segment.y + 1,
                      }}
                    >
                      <div
                        className={[
                          "ouro-snake__static-scale",
                          isEatableTail
                            ? "ouro-snake__static-scale--eatable"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{
                          transform: `rotate(${segment.rotation}deg)`,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={
                            segment.kind === "tail"
                              ? SNAKE_TAIL_IMG
                              : SNAKE_BODY_IMG
                          }
                          alt=""
                          className="ouro-snake__segment-img"
                          draggable={false}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {deadScales.length > 0 && (
              <div className="ouro-snake__dead-layer" aria-hidden>
                {deadScales.map((deadScale) => (
                  <div
                    key={deadScale.id}
                    className="ouro-snake__dead-cell"
                    style={{
                      gridColumn: deadScale.x + 1,
                      gridRow: deadScale.y + 1,
                    }}
                  >
                    <div
                      className="ouro-snake__dead-scale"
                      style={{
                        transform: `rotate(${deadScale.rotation}deg)`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={SNAKE_BODY_IMG}
                        alt=""
                        className="ouro-snake__segment-img ouro-snake__dead-scale-img"
                        draggable={false}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {status !== "playing" && status !== "dying" && (
              <div
                className={[
                  "ouro-snake__overlay",
                  status === "over" ? "ouro-snake__overlay--over" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {status === "idle" && (
                  <>
                    <p className="ouro-snake__overlay-title">Ready?</p>
                    <p className="ouro-snake__overlay-hint">
                      Arrow keys or WASD to move
                    </p>
                    {!publicKey && (
                      <p className="ouro-snake__overlay-wallet-hint">
                        Connect your wallet to track high scores
                      </p>
                    )}
                    <button
                      type="button"
                      className="ouro-snake__btn"
                      onClick={resetGame}
                      disabled={coinsLoading}
                    >
                      {coinsLoading ? "Loading tokens…" : "Start"}
                    </button>
                  </>
                )}
                {status === "over" && (
                  <>
                    <p className="ouro-snake__overlay-title">Game Over</p>
                    <p className="ouro-snake__overlay-score">{score} points</p>
                    {!publicKey && (
                      <p className="ouro-snake__overlay-wallet-hint">
                        Connect wallet to save your score
                      </p>
                    )}
                    {publicKey && scoreSaved && (
                      <p className="ouro-snake__overlay-highscore">
                        New high score!
                      </p>
                    )}
                    {publicKey && scoreSaving && (
                      <p className="ouro-snake__overlay-wallet-hint">
                        Saving score…
                      </p>
                    )}
                    {publicKey &&
                      !scoreSaved &&
                      !scoreSaving &&
                      personalBest !== null &&
                      score <= personalBest && (
                        <p className="ouro-snake__overlay-wallet-hint">
                          Personal best: {personalBest} pts
                        </p>
                      )}
                    <button
                      type="button"
                      className="ouro-snake__btn"
                      onClick={resetGame}
                    >
                      Play Again
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="ouro-snake__dpad" aria-label="Direction controls">
          <button
            type="button"
            className="ouro-snake__pad ouro-snake__pad--up"
            aria-label="Up"
            onClick={() => handlePad("up")}
          >
            ▲
          </button>
          <button
            type="button"
            className="ouro-snake__pad ouro-snake__pad--left"
            aria-label="Left"
            onClick={() => handlePad("left")}
          >
            ◀
          </button>
          <button
            type="button"
            className="ouro-snake__pad ouro-snake__pad--down"
            aria-label="Down"
            onClick={() => handlePad("down")}
          >
            ▼
          </button>
          <button
            type="button"
            className="ouro-snake__pad ouro-snake__pad--right"
            aria-label="Right"
            onClick={() => handlePad("right")}
          >
            ▶
          </button>
        </div>

        <aside className="ouro-snake__hud panel">
          <div className="ouro-snake__round-score" aria-live="polite">
            <span className="ouro-snake__round-score-label">This round</span>
            <span className="ouro-snake__round-score-value">{score}</span>
            <span className="ouro-snake__round-score-unit">pts</span>
          </div>
          <div className="ouro-snake__stat">
            <span className="ouro-snake__stat-label">Tokens eaten</span>
            <span className="ouro-snake__stat-value">{tokensEaten}</span>
          </div>
          <div className="ouro-snake__stat">
            <span className="ouro-snake__stat-label">Spawn rate</span>
            <span className="ouro-snake__stat-value">
              {(currentSpawnMs / 1000).toFixed(1)}s
            </span>
          </div>
          <div className="ouro-snake__stat">
            <span className="ouro-snake__stat-label">Length</span>
            <span className="ouro-snake__stat-value">
              {selfEatActive
                ? `1 + ${staticBody.length} frozen`
                : snake.length}
            </span>
          </div>
          <div className="ouro-snake__stat">
            <span className="ouro-snake__stat-label">Ouroboros power</span>
            <span className="ouro-snake__stat-value">
              {ouroborosEaten > 0
                ? `${selfEatRate} pts/segment`
                : "—"}
            </span>
          </div>
          {selfEatActive && (
            <p className="ouro-snake__mode ouro-snake__mode--active">
              Frozen body holds the path — when consume mode ends, your trail
              becomes tokens
            </p>
          )}
          <div className="ouro-snake__highscore">
            <h3 className="ouro-snake__highscore-title">High scores</h3>
            {publicKey ? (
              <p className="ouro-snake__highscore-personal">
                Your best:{" "}
                <strong>{personalBest !== null ? personalBest : "—"}</strong>
              </p>
            ) : (
              <p className="ouro-snake__highscore-hint">
                Connect wallet to track scores
              </p>
            )}
            {leaderboard.length > 0 ? (
              <ol className="ouro-snake__leaderboard">
                {leaderboard.map((entry, index) => (
                  <li
                    key={entry.walletAddress}
                    className={[
                      "ouro-snake__leaderboard-row",
                      connectedWallet === entry.walletAddress
                        ? "ouro-snake__leaderboard-row--you"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className="ouro-snake__leaderboard-rank">
                      {index + 1}.
                    </span>
                    <span className="ouro-snake__leaderboard-wallet">
                      {shortWallet(entry.walletAddress)}
                    </span>
                    <span className="ouro-snake__leaderboard-score">
                      {entry.bestScore}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="ouro-snake__highscore-hint">No scores yet</p>
            )}
          </div>
          <p className="ouro-snake__legend">
            +{TOKEN_POINTS} per token · +{SELF_EAT_BASE} per self-segment
            (+{SELF_EAT_BONUS} per ouroboros eaten) · coins fade after 5s · max{" "}
            {MAX_OURO_TOKENS} ouroboros
          </p>
        </aside>
      </div>
    </div>
  );
}
