import { prisma } from "../db";
import { Prisma } from "../generated/prisma/client";
import type { AdvertisingType, SellerType } from "../generated/prisma/enums";

export interface PainPointFilters {
  q?: string;
  category?: string;
  subcategory?: string;
  sellerType?: SellerType;
  advertisingType?: AdvertisingType;
  competitor?: string;
  minScore?: number;
  maxScore?: number;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
  sort?: "score" | "recent";
}

export async function searchPainPoints(filters: PainPointFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

  const where: Prisma.PainPointWhereInput = {
    ...(filters.q
      ? {
          OR: [
            { problem: { contains: filters.q, mode: "insensitive" } },
            { possibleSolution: { contains: filters.q, mode: "insensitive" } },
            { quote: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filters.category ? { category: { slug: filters.category } } : {}),
    ...(filters.subcategory ? { subcategory: { contains: filters.subcategory, mode: "insensitive" } } : {}),
    ...(filters.sellerType ? { sellerType: filters.sellerType } : {}),
    ...(filters.advertisingType ? { advertisingType: filters.advertisingType } : {}),
    ...(filters.competitor ? { competitorMentions: { some: { competitor: { slug: filters.competitor } } } } : {}),
    ...(filters.minScore !== undefined || filters.maxScore !== undefined
      ? { opportunityScore: { gte: filters.minScore, lte: filters.maxScore } }
      : {}),
    ...(filters.from || filters.to ? { detectedAt: { gte: filters.from, lte: filters.to } } : {}),
  };

  const orderBy: Prisma.PainPointOrderByWithRelationInput =
    filters.sort === "recent" ? { detectedAt: "desc" } : { opportunityScore: "desc" };

  const [data, total] = await Promise.all([
    prisma.painPoint.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        category: { select: { name: true, slug: true } },
        rawItem: { select: { url: true, source: { select: { key: true, name: true } } } },
        competitorMentions: { include: { competitor: { select: { name: true, slug: true } } } },
      },
    }),
    prisma.painPoint.count({ where }),
  ]);

  return { data, total, page, pageSize };
}

export async function getPainPointDetail(id: string) {
  return prisma.painPoint.findUnique({
    where: { id },
    include: {
      category: true,
      rawItem: { include: { source: true } },
      competitorMentions: { include: { competitor: true } },
    },
  });
}

export async function listCategories() {
  return prisma.category.findMany({ where: { parentId: null }, orderBy: { name: "asc" } });
}
