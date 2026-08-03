import { prisma } from "../db";
import { getConnector, listConnectors } from "../connectors/registry";
import { createLogger } from "../logger";
import { contentHashOf } from "../content-hash";
import type { NormalizedItem } from "../connectors/types";

const logger = createLogger("ingestion");

export { contentHashOf };

export interface SourceRunResult {
  sourceKey: string;
  fetched: number;
  stored: number;
  skippedDuplicates: number;
  error?: string;
}

/** Runs one enabled source: fetch -> normalize -> dedup -> persist RawItem rows. */
export async function runSource(sourceKey: string): Promise<SourceRunResult> {
  const source = await prisma.source.findUnique({ where: { key: sourceKey } });
  if (!source) throw new Error(`Unknown source: ${sourceKey}`);

  const connector = getConnector(sourceKey);
  if (!connector) throw new Error(`No connector registered for source: ${sourceKey}`);
  if (!connector.implemented) {
    return { sourceKey, fetched: 0, stored: 0, skippedDuplicates: 0, error: "Connector not implemented yet" };
  }

  const config = { ...(connector.defaultConfig ?? {}), ...(source.config as Record<string, unknown>) };

  let items: NormalizedItem[] = [];
  let runError: string | undefined;
  try {
    items = await connector.fetch({ config, since: source.lastRunAt ?? undefined });
  } catch (error) {
    runError = String(error);
    logger.error("Connector fetch failed", { sourceKey, error: runError });
  }

  let stored = 0;
  let skippedDuplicates = 0;

  for (const item of items) {
    const contentHash = contentHashOf(item);
    try {
      await prisma.rawItem.create({
        data: {
          sourceId: source.id,
          externalId: item.externalId,
          title: item.title,
          url: item.url,
          author: item.author,
          content: item.content,
          contentHash,
          publishedAt: item.publishedAt,
        },
      });
      stored += 1;
    } catch (error) {
      // Unique constraint on [sourceId, externalId] or [sourceId, contentHash] -> already ingested.
      if (isUniqueConstraintError(error)) {
        skippedDuplicates += 1;
      } else {
        logger.error("Failed to store raw item", { sourceKey, externalId: item.externalId, error: String(error) });
      }
    }
  }

  await prisma.source.update({
    where: { id: source.id },
    data: {
      lastRunAt: new Date(),
      lastStatus: runError ? "ERROR" : "OK",
      lastError: runError ?? null,
    },
  });

  return { sourceKey, fetched: items.length, stored, skippedDuplicates, error: runError };
}

export async function runAllEnabledSources(): Promise<SourceRunResult[]> {
  const enabled = await prisma.source.findMany({ where: { enabled: true } });
  const results: SourceRunResult[] = [];
  for (const source of enabled) {
    results.push(await runSource(source.key));
  }
  return results;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

export function availableConnectorKeys(): string[] {
  return listConnectors().map((c) => c.key);
}
