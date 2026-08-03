-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "SellerType" AS ENUM ('SELLER', 'VENDOR', 'AGENCY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AdvertisingType" AS ENUM ('SP', 'SB', 'SD', 'DSP', 'NONE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('WEEKLY', 'ON_DEMAND');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "reachy_users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reachy_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reachy_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "reachy_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reachy_sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reachy_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reachy_verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "reachy_sources" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reachy_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reachy_raw_items" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "author" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "reachy_raw_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reachy_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "reachy_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reachy_pain_points" (
    "id" TEXT NOT NULL,
    "rawItemId" TEXT NOT NULL,
    "categoryId" TEXT,
    "problem" TEXT NOT NULL,
    "subcategory" TEXT,
    "sellerType" "SellerType" NOT NULL DEFAULT 'UNKNOWN',
    "advertisingType" "AdvertisingType" NOT NULL DEFAULT 'UNKNOWN',
    "severity" INTEGER NOT NULL,
    "frequency" INTEGER NOT NULL,
    "emotion" TEXT,
    "possibleSolution" TEXT,
    "quote" TEXT,
    "opportunityScore" INTEGER NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reachy_pain_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reachy_competitors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "website" TEXT,
    "features" JSONB NOT NULL DEFAULT '[]',
    "pricing" JSONB NOT NULL DEFAULT '[]',
    "strengths" TEXT,
    "weaknesses" TEXT,
    "marketGaps" TEXT,
    "latestUpdates" JSONB NOT NULL DEFAULT '[]',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reachy_competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reachy_competitor_mentions" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "painPointId" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reachy_competitor_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reachy_reports" (
    "id" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sections" JSONB,
    "pdfPath" TEXT,
    "emailedTo" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reachy_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reachy_report_pain_points" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "painPointId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "reachy_report_pain_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reachy_users_email_key" ON "reachy_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "reachy_accounts_provider_providerAccountId_key" ON "reachy_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "reachy_sessions_sessionToken_key" ON "reachy_sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "reachy_verification_tokens_token_key" ON "reachy_verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "reachy_verification_tokens_identifier_token_key" ON "reachy_verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "reachy_sources_key_key" ON "reachy_sources"("key");

-- CreateIndex
CREATE INDEX "reachy_raw_items_processed_idx" ON "reachy_raw_items"("processed");

-- CreateIndex
CREATE UNIQUE INDEX "reachy_raw_items_sourceId_externalId_key" ON "reachy_raw_items"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "reachy_raw_items_sourceId_contentHash_key" ON "reachy_raw_items"("sourceId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "reachy_categories_slug_key" ON "reachy_categories"("slug");

-- CreateIndex
CREATE INDEX "reachy_pain_points_opportunityScore_idx" ON "reachy_pain_points"("opportunityScore");

-- CreateIndex
CREATE INDEX "reachy_pain_points_detectedAt_idx" ON "reachy_pain_points"("detectedAt");

-- CreateIndex
CREATE INDEX "reachy_pain_points_sellerType_idx" ON "reachy_pain_points"("sellerType");

-- CreateIndex
CREATE UNIQUE INDEX "reachy_competitors_slug_key" ON "reachy_competitors"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "reachy_competitor_mentions_competitorId_painPointId_key" ON "reachy_competitor_mentions"("competitorId", "painPointId");

-- CreateIndex
CREATE UNIQUE INDEX "reachy_report_pain_points_reportId_painPointId_key" ON "reachy_report_pain_points"("reportId", "painPointId");

-- AddForeignKey
ALTER TABLE "reachy_accounts" ADD CONSTRAINT "reachy_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "reachy_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reachy_sessions" ADD CONSTRAINT "reachy_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "reachy_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reachy_raw_items" ADD CONSTRAINT "reachy_raw_items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "reachy_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reachy_categories" ADD CONSTRAINT "reachy_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "reachy_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reachy_pain_points" ADD CONSTRAINT "reachy_pain_points_rawItemId_fkey" FOREIGN KEY ("rawItemId") REFERENCES "reachy_raw_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reachy_pain_points" ADD CONSTRAINT "reachy_pain_points_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "reachy_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reachy_competitor_mentions" ADD CONSTRAINT "reachy_competitor_mentions_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "reachy_competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reachy_competitor_mentions" ADD CONSTRAINT "reachy_competitor_mentions_painPointId_fkey" FOREIGN KEY ("painPointId") REFERENCES "reachy_pain_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reachy_reports" ADD CONSTRAINT "reachy_reports_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "reachy_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reachy_report_pain_points" ADD CONSTRAINT "reachy_report_pain_points_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reachy_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reachy_report_pain_points" ADD CONSTRAINT "reachy_report_pain_points_painPointId_fkey" FOREIGN KEY ("painPointId") REFERENCES "reachy_pain_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;
