import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/prisma";

export type SnakeHighScoreEntry = {
  walletAddress: string;
  bestScore: number;
  achievedAt: string;
};

export function isValidWalletAddress(address: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export async function getLeaderboard(
  limit = 10,
): Promise<SnakeHighScoreEntry[]> {
  const rows = await prisma.snakeHighScore.findMany({
    orderBy: { bestScore: "desc" },
    take: Math.min(Math.max(1, limit), 50),
  });
  return rows.map((row) => ({
    walletAddress: row.walletAddress,
    bestScore: row.bestScore,
    achievedAt: row.achievedAt.toISOString(),
  }));
}

export async function getPersonalBest(
  walletAddress: string,
): Promise<number | null> {
  const row = await prisma.snakeHighScore.findUnique({
    where: { walletAddress },
    select: { bestScore: true },
  });
  return row?.bestScore ?? null;
}

export async function submitScore(
  walletAddress: string,
  score: number,
): Promise<{ bestScore: number; isNewBest: boolean }> {
  const existing = await prisma.snakeHighScore.findUnique({
    where: { walletAddress },
  });

  if (!existing || score > existing.bestScore) {
    const row = await prisma.snakeHighScore.upsert({
      where: { walletAddress },
      create: { walletAddress, bestScore: score },
      update: {
        bestScore: score,
        achievedAt: new Date(),
      },
    });
    return { bestScore: row.bestScore, isNewBest: true };
  }

  return { bestScore: existing.bestScore, isNewBest: false };
}
