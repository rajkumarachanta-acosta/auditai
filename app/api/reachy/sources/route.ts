import { NextResponse } from "next/server";
import { prisma } from "@/lib/reachy/db";
import { listConnectors } from "@/lib/reachy/connectors/registry";
import { requireRole } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";

export const GET = withErrorHandling(async () => {
  await requireRole("MANAGER");

  const [sources, connectors] = await Promise.all([prisma.source.findMany(), listConnectors()]);
  const sourceByKey = new Map(sources.map((s) => [s.key, s]));

  const data = connectors.map((connector) => {
    const source = sourceByKey.get(connector.key);
    return {
      id: source?.id ?? null,
      key: connector.key,
      name: connector.name,
      description: connector.description,
      implemented: connector.implemented,
      enabled: source?.enabled ?? false,
      lastRunAt: source?.lastRunAt ?? null,
      lastStatus: source?.lastStatus ?? null,
      lastError: source?.lastError ?? null,
    };
  });

  return NextResponse.json({ data });
});
