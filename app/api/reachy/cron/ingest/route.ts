import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/reachy/cron-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { runAllEnabledSources } from "@/lib/reachy/services/ingestion.service";
import { processUnprocessedRawItems } from "@/lib/reachy/services/pain-point.service";
import { createLogger } from "@/lib/reachy/logger";

const logger = createLogger("cron:ingest");

export const maxDuration = 300;

const handler = withErrorHandling(async (req: Request) => {
  requireCronSecret(req);

  const ingestion = await runAllEnabledSources();
  const analysis = await processUnprocessedRawItems({ limit: 200 });

  logger.info("Daily ingestion run complete", {
    sources: ingestion.length,
    itemsProcessed: analysis.itemsProcessed,
    painPointsCreated: analysis.painPointsCreated,
  });

  return NextResponse.json({ data: { ingestion, analysis } });
});

// Vercel Cron sends GET with an Authorization: Bearer $CRON_SECRET header
// (auto-attached because the env var is named CRON_SECRET). POST is kept for
// manual/external schedulers hitting this endpoint directly.
export const GET = handler;
export const POST = handler;
