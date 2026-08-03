import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/reachy/cron-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { runAllEnabledSources } from "@/lib/reachy/services/ingestion.service";
import { processUnprocessedRawItems } from "@/lib/reachy/services/pain-point.service";
import { createLogger } from "@/lib/reachy/logger";

const logger = createLogger("cron:ingest");

export const maxDuration = 300;

export const POST = withErrorHandling(async (req: Request) => {
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
