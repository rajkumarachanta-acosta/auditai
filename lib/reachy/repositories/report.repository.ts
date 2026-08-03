import { prisma } from "../db";

export async function listReports() {
  return prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    include: { requestedBy: { select: { name: true, email: true } } },
  });
}

export async function getReportDetail(id: string) {
  return prisma.report.findUnique({
    where: { id },
    include: {
      requestedBy: { select: { name: true, email: true } },
      entries: {
        orderBy: { rank: "asc" },
        include: { painPoint: { include: { category: true } } },
      },
    },
  });
}
