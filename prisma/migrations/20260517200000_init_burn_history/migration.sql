-- CreateEnum
CREATE TYPE "BurnPerformedBy" AS ENUM ('agent', 'human');

-- CreateTable
CREATE TABLE "OuroBurn" (
    "signature" TEXT NOT NULL,
    "timestamp" INTEGER,
    "slot" INTEGER NOT NULL DEFAULT 0,
    "amountUi" DOUBLE PRECISION NOT NULL,
    "burner" TEXT,
    "performedBy" "BurnPerformedBy" NOT NULL DEFAULT 'human',
    "sourceMint" TEXT,
    "sourceSymbol" TEXT,
    "sourceName" TEXT,
    "sourceImage" TEXT,
    "sourceUiAmount" DOUBLE PRECISION,
    "sourceBurnSignature" TEXT,
    "swapSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OuroBurn_pkey" PRIMARY KEY ("signature")
);

-- CreateTable
CREATE TABLE "BurnHistorySyncState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "mint" TEXT NOT NULL,
    "lastFetchedAt" BIGINT NOT NULL DEFAULT 0,
    "backfillComplete" BOOLEAN NOT NULL DEFAULT false,
    "backfillPaginationToken" TEXT,
    "lastScannedCount" INTEGER,

    CONSTRAINT "BurnHistorySyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OuroBurn_timestamp_idx" ON "OuroBurn"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "OuroBurn_performedBy_idx" ON "OuroBurn"("performedBy");

-- CreateIndex
CREATE INDEX "OuroBurn_sourceMint_idx" ON "OuroBurn"("sourceMint");
