import { prisma } from "../db";

export async function listCompetitorsWithStats() {
  const competitors = await prisma.competitor.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { mentions: true } } },
  });
  return competitors;
}

export async function getCompetitorDetail(id: string) {
  return prisma.competitor.findUnique({
    where: { id },
    include: {
      mentions: {
        orderBy: { createdAt: "desc" },
        take: 25,
        include: {
          painPoint: {
            select: { id: true, problem: true, opportunityScore: true, detectedAt: true, category: { select: { name: true } } },
          },
        },
      },
    },
  });
}
