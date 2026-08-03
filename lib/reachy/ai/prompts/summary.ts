export interface ReportInputPainPoint {
  problem: string;
  category: string | null;
  opportunityScore: number;
  sellerType: string;
  frequencyCount: number;
}

export interface ReportInputCompetitorActivity {
  competitorName: string;
  mentionCount: number;
  sampleContexts: string[];
}

export function buildSummaryUserPrompt(args: {
  periodStart: string;
  periodEnd: string;
  topPainPoints: ReportInputPainPoint[];
  categoryTrends: { category: string; count: number; previousCount: number }[];
  competitorActivity: ReportInputCompetitorActivity[];
}): string {
  return `Reporting period: ${args.periodStart} to ${args.periodEnd}

Top pain points this period (already ranked by opportunity score, do not re-rank, just synthesize):
${args.topPainPoints
  .map((p, i) => `${i + 1}. [score ${p.opportunityScore}] (${p.category ?? "Uncategorized"}, ${p.sellerType}, seen ${p.frequencyCount}x) ${p.problem}`)
  .join("\n")}

Category trends (this period vs. previous period):
${args.categoryTrends.map((c) => `- ${c.category}: ${c.count} (prev ${c.previousCount})`).join("\n") || "- No prior-period data yet"}

Competitor activity mentioned in pain points this period:
${
  args.competitorActivity
    .map((c) => `- ${c.competitorName}: ${c.mentionCount} mention(s). Example: "${c.sampleContexts[0] ?? ""}"`)
    .join("\n") || "- No competitor mentions this period"
}

Write an executive weekly intelligence report for A One's leadership team using ONLY the data above — do not invent pain points, trends, or competitor facts not listed. Sections: executive summary, emerging trends, feature ideas, products worth building, revenue opportunities, and recommendations. Keep it sharp and decision-useful, not filler.`;
}
