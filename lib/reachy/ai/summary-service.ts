import { runStructured } from "./client";
import { REACHY_SYSTEM_PROMPT } from "./prompts/system";
import { buildSummaryUserPrompt, type ReportInputPainPoint, type ReportInputCompetitorActivity } from "./prompts/summary";
import { summaryResultSchema, SUMMARY_JSON_SCHEMA, type SummaryResult } from "./schemas";

export async function generateReportSummary(args: {
  periodStart: string;
  periodEnd: string;
  topPainPoints: ReportInputPainPoint[];
  categoryTrends: { category: string; count: number; previousCount: number }[];
  competitorActivity: ReportInputCompetitorActivity[];
}): Promise<SummaryResult> {
  const raw = await runStructured<unknown>({
    system: REACHY_SYSTEM_PROMPT,
    user: buildSummaryUserPrompt(args),
    schemaName: "weekly_report_summary",
    schema: SUMMARY_JSON_SCHEMA,
  });

  return summaryResultSchema.parse(raw);
}
