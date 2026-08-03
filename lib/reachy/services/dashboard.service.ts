import { prisma } from "../db";
import { startOfWeek } from "date-fns";

export interface DashboardSnapshot {
  totalPainPoints: number;
  newThisWeek: number;
  topOpportunity: { id: string; problem: string; opportunityScore: number } | null;
  trendingCategory: { name: string; count: number } | null;
  competitorActivity: { competitorName: string; mentions: number }[];
  latestInsights: { id: string; problem: string; category: string | null; opportunityScore: number; detectedAt: Date }[];
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  const [totalPainPoints, newThisWeek, topOpportunity, categoryGroups, competitorGroups, latest] = await Promise.all([
    prisma.painPoint.count(),
    prisma.painPoint.count({ where: { detectedAt: { gte: weekStart } } }),
    prisma.painPoint.findFirst({
      orderBy: { opportunityScore: "desc" },
      select: { id: true, problem: true, opportunityScore: true },
    }),
    prisma.painPoint.groupBy({
      by: ["categoryId"],
      _count: { categoryId: true },
      where: { categoryId: { not: null }, detectedAt: { gte: weekStart } },
      orderBy: { _count: { categoryId: "desc" } },
      take: 1,
    }),
    prisma.competitorMention.groupBy({
      by: ["competitorId"],
      _count: { competitorId: true },
      orderBy: { _count: { competitorId: "desc" } },
      take: 5,
    }),
    prisma.painPoint.findMany({
      orderBy: { detectedAt: "desc" },
      take: 6,
      select: { id: true, problem: true, opportunityScore: true, detectedAt: true, category: { select: { name: true } } },
    }),
  ]);

  let trendingCategory: DashboardSnapshot["trendingCategory"] = null;
  if (categoryGroups[0]?.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryGroups[0].categoryId } });
    if (category) {
      trendingCategory = { name: category.name, count: categoryGroups[0]._count.categoryId };
    }
  }

  const competitorIds = competitorGroups.map((g) => g.competitorId);
  const competitors = competitorIds.length
    ? await prisma.competitor.findMany({ where: { id: { in: competitorIds } } })
    : [];
  const competitorActivity = competitorGroups.map((g) => ({
    competitorName: competitors.find((c) => c.id === g.competitorId)?.name ?? "Unknown",
    mentions: g._count.competitorId,
  }));

  return {
    totalPainPoints,
    newThisWeek,
    topOpportunity,
    trendingCategory,
    competitorActivity,
    latestInsights: latest.map((p) => ({
      id: p.id,
      problem: p.problem,
      category: p.category?.name ?? null,
      opportunityScore: p.opportunityScore,
      detectedAt: p.detectedAt,
    })),
  };
}
