import { PageHeader } from "@/components/reachy/stat-card";
import { PainPointFilterBar } from "@/components/reachy/pain-point-filters";
import { PainPointTable, Pagination, type PainPointRow } from "@/components/reachy/pain-point-table";
import { requireSession } from "@/lib/reachy/api-auth";
import { searchPainPoints, listCategories } from "@/lib/reachy/repositories/pain-point.repository";
import { parsePainPointFilters } from "@/lib/reachy/pain-point-query";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const raw = await searchParams;

  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") usp.set(key, value);
  }

  const filters = { ...parsePainPointFilters(usp), sort: "score" as const };
  const [{ data, total, page, pageSize }, categories] = await Promise.all([searchPainPoints(filters), listCategories()]);

  const rows: PainPointRow[] = data.map((p) => ({
    id: p.id,
    problem: p.problem,
    category: p.category,
    subcategory: p.subcategory,
    sellerType: p.sellerType,
    advertisingType: p.advertisingType,
    severity: p.severity,
    frequency: p.frequency,
    opportunityScore: p.opportunityScore,
    confidenceScore: p.confidenceScore,
    detectedAt: p.detectedAt.toISOString(),
    competitors: p.competitorMentions.map((m) => m.competitor.name),
    sourceUrl: p.rawItem.url,
    sourceName: p.rawItem.source.name,
  }));

  const currentParams = Object.fromEntries(usp.entries());

  return (
    <div>
      <PageHeader title="Opportunities" description="Pain points ranked by opportunity score, highest first." />
      <div className="space-y-4 px-8 py-6">
        <PainPointFilterBar action="/reachy/opportunities" categories={categories} current={currentParams} />
        <PainPointTable rows={rows} />
        <Pagination page={page} pageSize={pageSize} total={total} action="/reachy/opportunities" params={currentParams} />
      </div>
    </div>
  );
}
