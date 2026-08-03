import { prisma } from "../db";
import { createLogger } from "../logger";
import { slugify } from "../slug";
import { extractPainPoints } from "../ai/extraction-service";
import { scorePainPoint } from "../ai/scoring-service";
import type { RawItem, Source } from "../generated/prisma/client";

const logger = createLogger("pain-point-service");

async function resolveCategoryId(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const slug = slugify(trimmed);
  const category = await prisma.category.upsert({
    where: { slug },
    update: {},
    create: { name: trimmed, slug },
  });
  return category.id;
}

async function resolveCompetitorIds(names: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const slug = slugify(trimmed);
    const competitor = await prisma.competitor.upsert({
      where: { slug },
      update: {},
      create: { name: trimmed, slug, features: [], pricing: [], latestUpdates: [] },
    });
    result.set(trimmed, competitor.id);
  }
  return result;
}

async function processRawItem(rawItem: RawItem, source: Source): Promise<number> {
  const extraction = await extractPainPoints(
    {
      externalId: rawItem.externalId,
      title: rawItem.title,
      url: rawItem.url,
      author: rawItem.author ?? undefined,
      content: rawItem.content,
      publishedAt: rawItem.publishedAt ?? undefined,
    },
    source.name
  );

  let created = 0;

  for (const extracted of extraction.painPoints) {
    const [categoryId, competitorIds, scoring] = await Promise.all([
      resolveCategoryId(extracted.category),
      resolveCompetitorIds(extracted.competitors),
      scorePainPoint(extracted),
    ]);

    const painPoint = await prisma.painPoint.create({
      data: {
        rawItemId: rawItem.id,
        categoryId: categoryId ?? undefined,
        problem: extracted.problem,
        subcategory: extracted.subcategory ?? undefined,
        sellerType: extracted.sellerType,
        advertisingType: extracted.advertisingType,
        severity: extracted.severity,
        frequency: extracted.frequency,
        emotion: extracted.emotion ?? undefined,
        possibleSolution: extracted.possibleSolution ?? undefined,
        quote: extracted.quote,
        opportunityScore: scoring.opportunityScore,
        scoreBreakdown: scoring.scoreBreakdown,
        confidenceScore: extracted.confidenceScore,
        detectedAt: rawItem.publishedAt ?? rawItem.fetchedAt,
      },
    });

    for (const [name, competitorId] of competitorIds) {
      await prisma.competitorMention.create({
        data: { competitorId, painPointId: painPoint.id, context: `${name}: ${extracted.problem}` },
      }).catch(() => undefined); // unique [competitorId, painPointId] — ignore if already linked
    }

    created += 1;
  }

  return created;
}

export interface AnalysisRunResult {
  itemsConsidered: number;
  itemsProcessed: number;
  painPointsCreated: number;
  skipped?: string;
}

export async function processUnprocessedRawItems(opts: { sourceId?: string; limit?: number } = {}): Promise<AnalysisRunResult> {
  if (!process.env.OPENAI_API_KEY) {
    logger.warn("OPENAI_API_KEY not set — skipping pain point extraction");
    return { itemsConsidered: 0, itemsProcessed: 0, painPointsCreated: 0, skipped: "OPENAI_API_KEY not set" };
  }

  const rawItems = await prisma.rawItem.findMany({
    where: { processed: false, ...(opts.sourceId ? { sourceId: opts.sourceId } : {}) },
    include: { source: true },
    take: opts.limit ?? 50,
    orderBy: { fetchedAt: "asc" },
  });

  let processed = 0;
  let painPointsCreated = 0;

  for (const rawItem of rawItems) {
    try {
      const created = await processRawItem(rawItem, rawItem.source);
      painPointsCreated += created;
      processed += 1;
      await prisma.rawItem.update({ where: { id: rawItem.id }, data: { processed: true, processedAt: new Date() } });
    } catch (error) {
      logger.error("Failed to process raw item", { rawItemId: rawItem.id, error: String(error) });
    }
  }

  return { itemsConsidered: rawItems.length, itemsProcessed: processed, painPointsCreated };
}
