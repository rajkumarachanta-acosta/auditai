import { prisma } from "../db";
import { createLogger } from "../logger";
import { generateReportSummary } from "../ai/summary-service";
import type { ReportInputPainPoint, ReportInputCompetitorActivity } from "../ai/prompts/summary";
import type { ReportType } from "../generated/prisma/enums";

const logger = createLogger("report-service");

export interface ReportSections {
  executiveSummary: string;
  topPainPoints: ReportInputPainPoint[];
  emergingTrends: string[];
  competitorAnalysis: { competitorName: string; mentionCount: number }[];
  featureIdeas: string[];
  productsWorthBuilding: string[];
  revenueOpportunities: string[];
  recommendations: string[];
}

export async function generateReport(args: { periodStart: Date; periodEnd: Date; type: ReportType; requestedById?: string }) {
  const { periodStart, periodEnd, type, requestedById } = args;
  const periodLengthMs = periodEnd.getTime() - periodStart.getTime();
  const previousStart = new Date(periodStart.getTime() - periodLengthMs);
  const previousEnd = periodStart;

  const report = await prisma.report.create({
    data: { type, status: "PENDING", periodStart, periodEnd, requestedById },
  });

  try {
    const [topPainPointRows, currentCategoryCounts, previousCategoryCounts, mentions] = await Promise.all([
      prisma.painPoint.findMany({
        where: { detectedAt: { gte: periodStart, lte: periodEnd } },
        orderBy: { opportunityScore: "desc" },
        take: 10,
        include: { category: true },
      }),
      prisma.painPoint.groupBy({
        by: ["categoryId"],
        where: { detectedAt: { gte: periodStart, lte: periodEnd }, categoryId: { not: null } },
        _count: { categoryId: true },
      }),
      prisma.painPoint.groupBy({
        by: ["categoryId"],
        where: { detectedAt: { gte: previousStart, lte: previousEnd }, categoryId: { not: null } },
        _count: { categoryId: true },
      }),
      prisma.competitorMention.findMany({
        where: { painPoint: { detectedAt: { gte: periodStart, lte: periodEnd } } },
        include: { competitor: true },
      }),
    ]);

    const categoryIds = [...new Set(currentCategoryCounts.map((c) => c.categoryId).filter(Boolean))] as string[];
    const categories = categoryIds.length ? await prisma.category.findMany({ where: { id: { in: categoryIds } } }) : [];
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
    const previousCountByCategoryId = new Map(previousCategoryCounts.map((c) => [c.categoryId, c._count.categoryId]));

    const categoryTrends = currentCategoryCounts
      .sort((a, b) => b._count.categoryId - a._count.categoryId)
      .slice(0, 8)
      .map((c) => ({
        category: (c.categoryId && categoryNameById.get(c.categoryId)) || "Uncategorized",
        count: c._count.categoryId,
        previousCount: (c.categoryId && previousCountByCategoryId.get(c.categoryId)) || 0,
      }));

    const currentCountByCategoryId = new Map(currentCategoryCounts.map((c) => [c.categoryId, c._count.categoryId]));

    const topPainPoints: ReportInputPainPoint[] = topPainPointRows.map((p) => ({
      problem: p.problem,
      category: p.category?.name ?? null,
      opportunityScore: p.opportunityScore,
      sellerType: p.sellerType,
      frequencyCount: (p.categoryId && currentCountByCategoryId.get(p.categoryId)) || 1,
    }));

    const competitorGroups = new Map<string, { competitorName: string; mentionCount: number; sampleContexts: string[] }>();
    for (const mention of mentions) {
      const entry = competitorGroups.get(mention.competitorId) ?? {
        competitorName: mention.competitor.name,
        mentionCount: 0,
        sampleContexts: [],
      };
      entry.mentionCount += 1;
      if (entry.sampleContexts.length < 2) entry.sampleContexts.push(mention.context);
      competitorGroups.set(mention.competitorId, entry);
    }
    const competitorActivity: ReportInputCompetitorActivity[] = [...competitorGroups.values()].sort(
      (a, b) => b.mentionCount - a.mentionCount
    );

    let summary;
    let summaryError: string | undefined;
    try {
      summary = await generateReportSummary({
        periodStart: periodStart.toISOString().slice(0, 10),
        periodEnd: periodEnd.toISOString().slice(0, 10),
        topPainPoints,
        categoryTrends,
        competitorActivity,
      });
    } catch (error) {
      summaryError = String(error);
      logger.error("Failed to generate LLM summary; storing raw data only", { reportId: report.id, error: summaryError });
    }

    const sections: ReportSections = {
      executiveSummary: summary?.executiveSummary ?? "Summary unavailable (AI summary generation failed or is not configured). Raw data below.",
      topPainPoints,
      emergingTrends: summary?.emergingTrends ?? categoryTrends.map((c) => `${c.category}: ${c.count} (prev ${c.previousCount})`),
      competitorAnalysis: competitorActivity.map((c) => ({ competitorName: c.competitorName, mentionCount: c.mentionCount })),
      featureIdeas: summary?.featureIdeas ?? [],
      productsWorthBuilding: summary?.productsWorthBuilding ?? [],
      revenueOpportunities: summary?.revenueOpportunities ?? [],
      recommendations: summary?.recommendations ?? [],
    };

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: {
        status: summaryError ? "FAILED" : "READY",
        error: summaryError,
        sections: sections as unknown as object,
        entries: {
          create: topPainPointRows.map((p, index) => ({ painPointId: p.id, rank: index + 1 })),
        },
      },
    });

    return updated;
  } catch (error) {
    logger.error("Report generation failed", { reportId: report.id, error: String(error) });
    return prisma.report.update({ where: { id: report.id }, data: { status: "FAILED", error: String(error) } });
  }
}

export async function generateWeeklyReport() {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  return generateReport({ periodStart, periodEnd, type: "WEEKLY" });
}
