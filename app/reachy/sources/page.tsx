import { prisma } from "@/lib/reachy/db";
import { listConnectors } from "@/lib/reachy/connectors/registry";
import { requireSession } from "@/lib/reachy/api-auth";
import { PageHeader } from "@/components/reachy/stat-card";
import { SourcesTable, type SourceRow } from "@/components/reachy/sources-table";

export default async function SourcesPage() {
  const session = await requireSession();

  const [sources, connectors] = await Promise.all([prisma.source.findMany(), listConnectors()]);
  const sourceByKey = new Map(sources.map((s) => [s.key, s]));

  const rows: SourceRow[] = connectors.map((connector) => {
    const source = sourceByKey.get(connector.key);
    return {
      id: source?.id ?? null,
      key: connector.key,
      name: connector.name,
      description: connector.description,
      implemented: connector.implemented,
      enabled: source?.enabled ?? false,
      lastRunAt: source?.lastRunAt?.toISOString() ?? null,
      lastStatus: source?.lastStatus ?? null,
      lastError: source?.lastError ?? null,
    };
  });

  return (
    <div>
      <PageHeader
        title="Sources"
        description="Connectors that feed Reachy's ingestion pipeline. Each source is an independent plugin."
      />
      <div className="px-8 py-6">
        <SourcesTable sources={rows} isAdmin={session.user.role === "ADMIN"} />
      </div>
    </div>
  );
}
