-- CreateTable
CREATE TABLE "SnakeHighScore" (
    "walletAddress" TEXT NOT NULL,
    "bestScore" INTEGER NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SnakeHighScore_pkey" PRIMARY KEY ("walletAddress")
);

-- CreateIndex
CREATE INDEX "SnakeHighScore_bestScore_idx" ON "SnakeHighScore"("bestScore" DESC);
